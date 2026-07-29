import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const HISTORY_HOST = 'https://history.macaumarksix.com'
const LATEST_URL = 'https://macaumarksix.com/api/macaujc2.com'

// 页面只展示最近100期。
// 为了让“近100期滚动回测”每一期都有开奖前的历史上下文，后台额外读取更早60期。
// extraHistory 只用于计算，不在“最近100期开奖”中展示。
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
  const source = Array.isArray(value) ? value : String(value).split(',')
  return source.map(normalizeZodiacName).filter(Boolean)
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
    const ea = BigInt(String(a?.expect || '0').replace(/\D/g, '') || '0')
    const eb = BigInt(String(b?.expect || '0').replace(/\D/g, '') || '0')
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

    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    if (!text || !text.trim()) throw new Error('接口返回空内容')
    if (text.trim().startsWith('<')) throw new Error('接口返回网页而不是JSON')

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
  const json = await fetchJson(`${HISTORY_HOST}/history/macaujc2/y/${year}`)
  if (Number(json?.code) !== 200 && json?.result !== true) {
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
    const raw = Array.isArray(json?.data) ? json.data[0] : null
    return normalizeItem(raw)
  } catch {
    return null
  }
}

function addList(unique, list) {
  for (const item of list || []) {
    const row = normalizeItem(item)
    if (row?.expect) unique.set(row.expect, row)
  }
}

async function fallbackByExpect(unique, latestExpect) {
  // 年度历史接口临时异常时的备用方案。
  // 当前新澳门期号格式类似 2026197，因此在同一年内向前补期号。
  const latestNum = Number(latestExpect)
  if (!Number.isInteger(latestNum)) return

  const yearPrefix = Math.floor(latestNum / 1000)
  const seq = latestNum % 1000
  if (!yearPrefix || !seq) return

  const targets = []
  for (let offset = 0; offset < Math.min(seq, ANALYSIS_HISTORY + 20); offset += 1) {
    const expect = String(yearPrefix * 1000 + (seq - offset))
    if (!unique.has(expect)) targets.push(expect)
  }

  // 分批并发，避免一次100多个请求同时打到源站。
  for (let i = 0; i < targets.length && unique.size < ANALYSIS_HISTORY; i += 20) {
    const batch = targets.slice(i, i + 20)
    const rows = await Promise.all(batch.map(fetchExpect))
    for (const row of rows) {
      if (row?.expect) unique.set(row.expect, row)
    }
  }
}

async function getData() {
  const unique = new Map()
  const warnings = []

  // 先拿最新一期：同时用它决定应该读哪个年份，避免Vercel服务器时区/年份导致错年。
  let latest = null
  try {
    latest = await fetchLatest()
    if (latest?.expect) unique.set(latest.expect, latest)
  } catch (error) {
    warnings.push(`最新开奖读取失败：${error.message}`)
  }

  const latestYear =
    Number(String(latest?.expect || '').slice(0, 4)) ||
    Number(String(latest?.openTime || '').slice(0, 4)) ||
    new Date().getFullYear()

  for (const year of [latestYear, latestYear - 1]) {
    try {
      addList(unique, await fetchYear(year))
    } catch (error) {
      warnings.push(`${year}历史读取失败：${error.message}`)
    }
  }

  if (unique.size < ANALYSIS_HISTORY && latest?.expect) {
    try {
      await fallbackByExpect(unique, latest.expect)
    } catch (error) {
      warnings.push(`按期号补历史失败：${error.message}`)
    }
  }

  const all = sortHistory([...unique.values()]).slice(0, ANALYSIS_HISTORY)

  if (!all.length) {
    throw new Error(
      `没有取得新澳门六合彩历史数据${warnings.length ? `；${warnings.join('；')}` : ''}`
    )
  }

  latest = all[0]

  let nextExpect = ''
  try {
    nextExpect = (BigInt(latest.expect) + 1n).toString()
  } catch {}

  const history = all.slice(0, DISPLAY_HISTORY)

  return {
    ok: true,
    play: 'new-macau',
    source: 'macaujc.com / macaumarksix.com',
    latest,
    nextExpect,

    // 页面使用最近100期
    history,
    historyCount: history.length,
    maxHistory: DISPLAY_HISTORY,

    // 只用于滚动回测的额外上下文，不需要在开奖记录区域全部显示
    analysisHistory: all,
    analysisHistoryCount: all.length,

    warnings,
    updatedAt: new Date().toISOString(),
  }
}

export async function GET() {
  try {
    return NextResponse.json(await getData(), {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      },
    })
  } catch (error) {
    console.error('新澳门六合彩API错误：', error)

    return NextResponse.json(
      {
        ok: false,
        message: error?.message || '获取开奖数据失败',
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        },
      }
    )
  }
}
