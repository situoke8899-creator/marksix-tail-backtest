import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function parseOpenCode(openCode) {
  if (!openCode) return []

  return String(openCode)
    .split(',')
    .map((n) => Number(String(n).trim()))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 49)
}

function sortHistory(list) {
  return [...list].sort((a, b) => {
    const ea = Number(a.expect || 0)
    const eb = Number(b.expect || 0)

    if (eb !== ea) return eb - ea

    const ta = new Date(a.openTime || 0).getTime()
    const tb = new Date(b.openTime || 0).getTime()

    return tb - ta
  })
}

async function fetchJson(url) {
  const res = await fetch(url, {
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'user-agent': 'Mozilla/5.0',
    },
  })

  const text = await res.text()

  if (!res.ok) throw new Error(`接口请求失败：${url}`)
  if (!text || !text.trim()) throw new Error(`接口返回空内容：${url}`)
  if (text.trim().startsWith('<')) throw new Error(`接口返回网页，不是开奖JSON：${url}`)

  return JSON.parse(text)
}

function normalizeItem(item) {
  const numbers = parseOpenCode(item.openCode)
  if (numbers.length < 7) return null

  const seven = numbers.slice(0, 7)
  const specialNumber = seven[6]
  const specialTail = specialNumber % 10

  return {
    expect: String(item.expect || ''),
    openTime: item.openTime || '',
    openCode: seven.join(','),
    numbers: seven,
    specialNumber,
    specialTail,
    wave: item.wave || '',
    zodiac: item.zodiac || '',
  }
}

async function getMacauData() {
  const now = new Date()
  const currentYear = now.getFullYear()
  const previousYear = currentYear - 1

  const historyUrls = [
    `https://history.macaumarksix.com/history/macaujc2/y/${currentYear}`,
    `https://history.macaumarksix.com/history/macaujc2/y/${previousYear}`,
  ]

  let allHistory = []

  for (const url of historyUrls) {
    try {
      const json = await fetchJson(url)
      if (Array.isArray(json?.data)) {
        allHistory = allHistory.concat(json.data)
      }
    } catch (error) {
      console.log(error.message)
    }
  }

  const uniqueMap = new Map()

  allHistory.forEach((item) => {
    const normalized = normalizeItem(item)
    if (!normalized?.expect) return
    uniqueMap.set(normalized.expect, normalized)
  })

  let latest = null

  try {
    const latestJson = await fetchJson('https://macaumarksix.com/api/macaujc2.com')
    if (Array.isArray(latestJson) && latestJson[0]?.openCode) {
      const normalizedLatest = normalizeItem(latestJson[0])
      if (normalizedLatest?.expect) {
        latest = normalizedLatest
        uniqueMap.set(normalizedLatest.expect, normalizedLatest)
      }
    }
  } catch (error) {
    console.log(error.message)
  }

  const history = sortHistory(Array.from(uniqueMap.values()))

  if (!history.length) {
    throw new Error('没有获取到澳门历史开奖数据，请稍后刷新重试')
  }

  latest = latest || history[0]

  return {
    ok: true,
    play: 'macau',
    source: 'macaujc.com',
    latest,
    history: history.slice(0, 400),
    recentHistory: history.slice(0, 50),
    updatedAt: new Date().toISOString(),
  }
}

function getHongKongDebugData() {
  return {
    ok: false,
    play: 'hongkong',
    message: '香港接口正在调试中。当前正式接口先保留澳门稳定运行。',
    source: '1680660.com/smallSix/findSmallSixHistory.do',
    updatedAt: new Date().toISOString(),
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const play = searchParams.get('play') || 'macau'

    if (play === 'hongkong') {
      return NextResponse.json(getHongKongDebugData(), { status: 500 })
    }

    const data = await getMacauData()
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error.message || '获取开奖数据失败，请稍后重试',
      },
      { status: 500 }
    )
  }
}
