import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const HISTORY_HOST = 'https://history.macaumarksix.com'
const LATEST_URL = 'https://macaumarksix.com/api/macaujc2.com'

const DISPLAY_HISTORY = 100
const ANALYSIS_HISTORY = 160
const TIMEOUT_MS = 12000

const ZODIAC_MAP = {
  '鼠':'鼠','牛':'牛','虎':'虎','兔':'兔',
  '龙':'龙','龍':'龙','蛇':'蛇',
  '马':'马','馬':'马','羊':'羊','猴':'猴',
  '鸡':'鸡','雞':'鸡','狗':'狗',
  '猪':'猪','豬':'猪',
}

function normalizeZodiacName(value) {
  const key = String(value || '').trim()
  return ZODIAC_MAP[key] || key
}

function parseOpenCode(openCode) {
  if (!openCode) return []

  return String(openCode)
    .split(',')
    .map((n) => Number(String(n).trim()))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 49)
}

function parseZodiac(value) {
  if (!value) return []

  const source = Array.isArray(value)
    ? value
    : String(value).split(',')

  return source
    .map(normalizeZodiacName)
    .filter(Boolean)
}

function normalizeItem(item) {
  const numbers = parseOpenCode(item?.openCode)
  const zodiac = parseZodiac(item?.zodiac)

  if (numbers.length < 7) return null

  return {
    expect: String(item?.expect || ''),
    openTime: item?.openTime || '',
    openCode: numbers.slice(0, 7).join(','),
    numbers: numbers.slice(0, 7),
    specialNumber: numbers[6],
    zodiac: zodiac.slice(0, 7),
    specialZodiac: zodiac[6] || '',
  }
}

function sortHistory(list) {
  return [...list].sort((a, b) => {
    const ea = BigInt(
      String(a?.expect || '0').replace(/\D/g, '') || '0'
    )
    const eb = BigInt(
      String(b?.expect || '0').replace(/\D/g, '') || '0'
    )

    if (ea !== eb) return eb > ea ? 1 : -1

    const ta = new Date(a?.openTime || 0).getTime()
    const tb = new Date(b?.openTime || 0).getTime()
    return tb - ta
  })
}

async function fetchJson(url, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        accept: 'application/json, text/plain, */*',
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150 Safari/537.36',
      },
    })

    const text = await res.text()

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }

    if (!text || !text.trim()) {
      throw new Error('接口返回空内容')
    }

    if (text.trim().startsWith('<')) {
      throw new Error('接口返回网页而不是JSON')
    }

    try {
      return JSON.parse(text)
    } catch {
      throw new Error(`JSON解析失败：${text.slice(0, 120)}`)
    }
  } finally {
    clearTimeout(timer)
  }
}

async function fetchLatest() {
  const json = await fetchJson(LATEST_URL)
  const raw = Array.isArray(json) ? json[0] : null
  return normalizeItem(raw)
}

async function fetchYear(year) {
  const json = await fetchJson(
    `${HISTORY_HOST}/history/macaujc2/y/${year}`
  )

  if (
    Number(json?.code) !== 200 &&
    json?.result !== true &&
    !Array.isArray(json?.data)
  ) {
    throw new Error(json?.message || '历史接口状态异常')
  }

  return Array.isArray(json?.data) ? json.data : []
}

async function fetchExpect(expect) {
  try {
    const json = await fetchJson(
      `${HISTORY_HOST}/history/macaujc2/expect/${expect}`,
      8000
    )

    const raw = Array.isArray(json?.data)
      ? json.data[0]
      : null

    return normalizeItem(raw)
  } catch {
    return null
  }
}

function addRawList(unique, list) {
  for (const item of list || []) {
    const row = normalizeItem(item)

    if (row?.expect) {
      unique.set(row.expect, row)
    }
  }
}

async function fallbackByExpect(unique, latestExpect) {
  const latestNum = Number(latestExpect)

  if (!Number.isInteger(latestNum)) return

  const yearPrefix = Math.floor(latestNum / 1000)
  const seq = latestNum % 1000

  if (!yearPrefix || !seq) return

  const targets = []

  for (
    let offset = 0;
    offset < Math.min(seq, ANALYSIS_HISTORY + 30);
    offset += 1
  ) {
    const expect = String(
      yearPrefix * 1000 + (seq - offset)
    )

    if (!unique.has(expect)) {
      targets.push(expect)
    }
  }

  for (
    let i = 0;
    i < targets.length && unique.size < ANALYSIS_HISTORY;
    i += 15
  ) {
    const batch = targets.slice(i, i + 15)
    const rows = await Promise.all(
      batch.map(fetchExpect)
    )

    for (const row of rows) {
      if (row?.expect) {
        unique.set(row.expect, row)
      }
    }
  }
}

async function getData() {
  const unique = new Map()
  const warnings = []

  let latest = null

  // 先读最新一期，避免直接依赖 Vercel 服务器年份。
  try {
    latest = await fetchLatest()

    if (latest?.expect) {
      unique.set(latest.expect, latest)
    }
  } catch (error) {
    warnings.push(
      `最新开奖读取失败：${error.message}`
    )
  }

  const latestYear =
    Number(
      String(latest?.expect || '').slice(0, 4)
    ) ||
    Number(
      String(latest?.openTime || '').slice(0, 4)
    ) ||
    new Date().getFullYear()

  // 读当前开奖年份 + 上一年。
  for (const year of [latestYear, latestYear - 1]) {
    try {
      addRawList(
        unique,
        await fetchYear(year)
      )
    } catch (error) {
      warnings.push(
        `${year}历史读取失败：${error.message}`
      )
    }
  }

  // 年度历史不足时，再按期号补。
  if (
    unique.size < ANALYSIS_HISTORY &&
    latest?.expect
  ) {
    try {
      await fallbackByExpect(
        unique,
        latest.expect
      )
    } catch (error) {
      warnings.push(
        `按期号补历史失败：${error.message}`
      )
    }
  }

  const allHistory = sortHistory(
    Array.from(unique.values())
  ).slice(0, ANALYSIS_HISTORY)

  if (!allHistory.length) {
    throw new Error(
      `没有取得新澳门六合彩历史数据${
        warnings.length
          ? `；${warnings.join('；')}`
          : ''
      }`
    )
  }

  latest = allHistory[0]

  let nextExpect = ''

  try {
    nextExpect = (
      BigInt(latest.expect) + 1n
    ).toString()
  } catch {
    nextExpect = ''
  }

  const history = allHistory.slice(
    0,
    DISPLAY_HISTORY
  )

  return {
    ok: true,
    play: 'new-macau',
    source: 'macaujc.com / macaumarksix.com',

    latest,
    nextExpect,

    history,
    historyCount: history.length,
    maxHistory: DISPLAY_HISTORY,

    // 这160期只用于让最近100期滚动回测都有足够的“开奖前历史”。
    analysisHistory: allHistory,
    analysisHistoryCount: allHistory.length,

    warnings,
    updatedAt: new Date().toISOString(),
  }
}

export async function GET() {
  try {
    const data = await getData()

    return NextResponse.json(data, {
      status: 200,
      headers: {
        'Cache-Control':
          'no-store, no-cache, must-revalidate, proxy-revalidate',
      },
    })
  } catch (error) {
    console.error(
      '新澳门六合彩API错误：',
      error
    )

    return NextResponse.json(
      {
        ok: false,
        message:
          error?.message ||
          '获取开奖数据失败',
      },
      {
        status: 500,
        headers: {
          'Cache-Control':
            'no-store, no-cache, must-revalidate, proxy-revalidate',
        },
      }
    )
  }
}
