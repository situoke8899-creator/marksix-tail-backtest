'use client'

import { useEffect, useMemo, useState } from 'react'

const TAIL_STRATEGIES = [
  { id: 's1', name: '方案1', logic: '热尾主攻', tails: [1, 2, 3, 4, 5, 6, 7, 9] },
  { id: 's2', name: '方案2', logic: '冷尾补位', tails: [0, 1, 3, 4, 5, 6, 7, 9] },
  { id: 's3', name: '方案3', logic: '大尾偏强', tails: [1, 3, 4, 5, 6, 7, 8, 9] },
  { id: 's4', name: '方案4', logic: '趋势升温', tails: [1, 2, 3, 5, 6, 7, 8, 9] },
  { id: 's5', name: '方案5', logic: '奇偶均衡', tails: [0, 1, 3, 4, 5, 6, 8, 9] },
  { id: 's6', name: '方案6', logic: '遗漏防守', tails: [0, 1, 2, 3, 4, 6, 7, 9] },
  { id: 's7', name: '方案7', logic: '稳健覆盖', tails: [0, 1, 2, 3, 5, 6, 7, 8] },
  { id: 's8', name: '方案8', logic: '高频组合', tails: [1, 2, 3, 4, 5, 7, 8, 9] },
  { id: 's9', name: '方案9', logic: '低连错优先', tails: [0, 2, 3, 4, 5, 6, 7, 8] },
  { id: 's10', name: '方案10', logic: '综合最优', tails: [0, 1, 2, 4, 5, 6, 7, 8] },
]

const FREEZE_VERSION = 'tail-freeze-v1'
const WINDOWS = [20, 30, 50]

function getFreezeKey(expect) {
  return `marksix-tail-freeze-${FREEZE_VERSION}-${expect}`
}

function getTail(num) {
  return Math.abs(Number(num || 0)) % 10
}

function fmtPercent(value) {
  return `${Number(value || 0).toFixed(2)}%`
}

function calcMaxMiss(results) {
  let max = 0
  let current = 0
  results.forEach((hit) => {
    if (hit) current = 0
    else {
      current += 1
      max = Math.max(max, current)
    }
  })
  return max
}

function calcCurrentMiss(results) {
  let current = 0
  for (const hit of results) {
    if (hit) break
    current += 1
  }
  return current
}

function buildTailStats(history, strategy, size) {
  const rows = history.slice(0, size).map((item) => {
    const specialNumber = Number(item.specialNumber || item.numbers?.[6])
    const tail = getTail(specialNumber)
    const hit = strategy.tails.includes(tail)

    return {
      expect: item.expect,
      openTime: item.openTime,
      numbers: item.numbers || [],
      specialNumber,
      tail,
      hit,
    }
  })

  const results = rows.map((row) => row.hit)
  const testedCount = rows.length
  const hitCount = rows.filter((row) => row.hit).length
  const missCount = testedCount - hitCount
  const hitRate = testedCount ? (hitCount / testedCount) * 100 : 0
  const missRate = testedCount ? (missCount / testedCount) * 100 : 0
  const coverageRate = (strategy.tails.length / 10) * 100
  const maxMiss = calcMaxMiss(results)
  const currentMiss = calcCurrentMiss(results)

  return {
    size,
    testedCount,
    hitCount,
    missCount,
    hitRate,
    missRate,
    coverageRate,
    maxMiss,
    currentMiss,
    rows,
  }
}

function buildRanking(history) {
  return TAIL_STRATEGIES.map((strategy) => {
    const result20 = buildTailStats(history, strategy, 20)
    const result30 = buildTailStats(history, strategy, 30)
    const result50 = buildTailStats(history, strategy, 50)
    const score = result20.hitRate * 0.5 + result30.hitRate * 0.3 + result50.hitRate * 0.2 - result20.maxMiss * 1.5

    return {
      ...strategy,
      result20,
      result30,
      result50,
      score: Number(score.toFixed(2)),
    }
  }).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (b.result20.hitRate !== a.result20.hitRate) return b.result20.hitRate - a.result20.hitRate
    return a.result20.maxMiss - b.result20.maxMiss
  })
}

function buildTailHeat(history, size = 50) {
  const source = history.slice(0, size)
  const stats = Array.from({ length: 10 }, (_, tail) => ({
    tail,
    count: 0,
    lastIndex: -1,
    omit: size,
  }))

  source.forEach((item, index) => {
    const specialNumber = Number(item.specialNumber || item.numbers?.[6])
    const tail = getTail(specialNumber)
    stats[tail].count += 1
    if (stats[tail].lastIndex === -1) stats[tail].lastIndex = index
  })

  return stats.map((item) => ({
    ...item,
    omit: item.lastIndex === -1 ? size : item.lastIndex,
    rate: source.length ? (item.count / source.length) * 100 : 0,
  }))
}

function buildConsensusTails(ranking, heat) {
  const scoreMap = new Map(Array.from({ length: 10 }, (_, tail) => [tail, {
    tail,
    appear: 0,
    weight: 0,
    heatCount: heat.find((item) => item.tail === tail)?.count || 0,
  }]))

  ranking.slice(0, 10).forEach((strategy, index) => {
    const rankWeight = 10 - index
    strategy.tails.forEach((tail) => {
      const old = scoreMap.get(tail)
      scoreMap.set(tail, {
        ...old,
        appear: old.appear + 1,
        weight: old.weight + rankWeight,
      })
    })
  })

  const sorted = Array.from(scoreMap.values()).sort((a, b) => {
    if (b.appear !== a.appear) return b.appear - a.appear
    if (b.weight !== a.weight) return b.weight - a.weight
    if (b.heatCount !== a.heatCount) return b.heatCount - a.heatCount
    return a.tail - b.tail
  })

  return {
    tails: sorted.slice(0, 8).map((item) => item.tail).sort((a, b) => a - b),
    stats: sorted,
  }
}

function makeConsensusStrategy(tails) {
  return {
    id: 'consensus',
    name: '10档综合',
    logic: '出现最多尾数',
    tails: [...tails],
  }
}

function makeFrozenDrawRecord(draw, ranking) {
  const specialNumber = Number(draw?.specialNumber || draw?.numbers?.[6])
  const tail = getTail(specialNumber)

  return {
    version: FREEZE_VERSION,
    expect: String(draw?.expect || ''),
    openTime: draw?.openTime || '',
    specialNumber,
    tail,
    frozenAt: Date.now(),
    rows: ranking.slice(0, 10).map((strategy, index) => ({
      rank: index + 1,
      id: strategy.id,
      name: strategy.name,
      logic: strategy.logic,
      tails: [...strategy.tails],
      hit: strategy.tails.includes(tail),
      result20HitCount: strategy.result20?.hitCount || 0,
      result20TestedCount: strategy.result20?.testedCount || 0,
      result20HitRate: strategy.result20?.hitRate || 0,
      result30MaxMiss: strategy.result30?.maxMiss || 0,
      result30CurrentMiss: strategy.result30?.currentMiss || 0,
    })),
  }
}

function readFrozenDraw(expect) {
  if (typeof window === 'undefined' || !expect) return null

  try {
    const raw = window.localStorage.getItem(getFreezeKey(expect))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.version !== FREEZE_VERSION || String(parsed?.expect) !== String(expect)) return null
    if (!Array.isArray(parsed?.rows)) return null
    return parsed
  } catch (error) {
    return null
  }
}

function writeFrozenDraw(draw, ranking) {
  if (typeof window === 'undefined' || !draw?.expect || !ranking?.length) return null

  const existed = readFrozenDraw(draw.expect)
  if (existed) return existed

  const record = makeFrozenDrawRecord(draw, ranking)

  try {
    window.localStorage.setItem(getFreezeKey(draw.expect), JSON.stringify(record))
  } catch (error) {
    console.warn('保存尾数开奖冻结记录失败', error)
  }

  return record
}

function buildFrozen20Records(history, ranking) {
  if (!history?.length || !ranking?.length) return []
  return history.slice(0, 20).map((draw) => readFrozenDraw(draw.expect) || makeFrozenDrawRecord(draw, ranking))
}

function summarizeFrozenRank(records, rank) {
  const rows = records
    .map((record) => record.rows.find((item) => Number(item.rank) === Number(rank)))
    .filter(Boolean)

  const testedCount = rows.length
  const hitCount = rows.filter((item) => item.hit).length
  const missCount = testedCount - hitCount
  const hitRate = testedCount ? (hitCount / testedCount) * 100 : 0
  const maxMiss = calcMaxMiss(rows.map((item) => item.hit))
  const currentMiss = calcCurrentMiss(rows.map((item) => item.hit))

  return { testedCount, hitCount, missCount, hitRate, maxMiss, currentMiss }
}

function buildCurrentDrawRows(ranking, latest) {
  const specialNumber = Number(latest?.specialNumber || latest?.numbers?.[6])
  const currentTail = getTail(specialNumber)

  return ranking.slice(0, 10).map((strategy, index) => ({
    rank: index + 1,
    strategy,
    currentTail,
    specialNumber,
    hit: strategy.tails.includes(currentTail),
  }))
}

function buildCopyText(expect, tails, label = '尾数参考') {
  return `第${expect || '-'}期${label}：${tails.join(' ')}`
}

function TailBadge({ tail, active = false }) {
  return <span className={active ? 'tail-badge active' : 'tail-badge'}>{tail}</span>
}

function NumberBall({ num, special = false }) {
  return <span className={special ? 'num-ball special' : 'num-ball'}>{String(num).padStart(2, '0')}</span>
}

export default function Page() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [copied, setCopied] = useState(false)
  const [selectedCopied, setSelectedCopied] = useState(false)

  async function loadData() {
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/history?play=macau', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.message || '接口请求失败')
      setData(json)
    } catch (err) {
      setError(err.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const history = data?.history || []
  const ranking = useMemo(() => buildRanking(history), [history])
  const selected = ranking.find((item) => item.id === selectedId) || ranking[0]
  const heat = useMemo(() => buildTailHeat(history, 50), [history])
  const consensus = useMemo(() => buildConsensusTails(ranking, heat), [ranking, heat])
  const consensusStrategy = useMemo(() => makeConsensusStrategy(consensus.tails), [consensus.tails])
  const consensusStats = useMemo(() => ({
    result20: buildTailStats(history, consensusStrategy, 20),
    result30: buildTailStats(history, consensusStrategy, 30),
    result50: buildTailStats(history, consensusStrategy, 50),
  }), [history, consensusStrategy])
  const currentDrawRows = useMemo(() => buildCurrentDrawRows(ranking, data?.latest), [ranking, data?.latest])
  const [frozenRecords, setFrozenRecords] = useState([])
  const nextTails = consensus.tails.length ? consensus.tails : selected?.tails || []

  useEffect(() => {
    if (!history.length || !ranking.length) return

    history.slice(0, 20).forEach((draw) => writeFrozenDraw(draw, ranking))
    setFrozenRecords(buildFrozen20Records(history, ranking))
  }, [history, ranking])

  useEffect(() => {
    if (!selectedId && ranking[0]?.id) setSelectedId(ranking[0].id)
  }, [ranking, selectedId])

  async function copyNextTails() {
    const text = buildCopyText(data?.nextExpect, nextTails)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch (error) {
      setCopied(false)
      alert(text)
    }
  }

  async function copySelectedTails() {
    if (!selected) return
    const text = buildCopyText(data?.nextExpect, selected.tails, `${selected.name}${selected.logic}`)
    try {
      await navigator.clipboard.writeText(text)
      setSelectedCopied(true)
      window.setTimeout(() => setSelectedCopied(false), 1500)
    } catch (error) {
      setSelectedCopied(false)
      alert(text)
    }
  }

  return (
    <main className="page">
      <style jsx global>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: #07111f; color: #e5edf7; font-family: Arial, 'Microsoft YaHei', sans-serif; }
        .page { min-height: 100vh; padding: 28px; background: radial-gradient(circle at top, #17365e 0%, #07111f 46%, #050914 100%); }
        .container { max-width: 1220px; margin: 0 auto; }
        .hero { display: flex; justify-content: space-between; gap: 20px; align-items: stretch; margin-bottom: 22px; }
        .hero-card, .card { background: rgba(15, 27, 48, 0.9); border: 1px solid rgba(148, 163, 184, 0.22); border-radius: 18px; box-shadow: 0 18px 40px rgba(0,0,0,.28); }
        .hero-card { flex: 1; padding: 26px; }
        .hero h1 { margin: 0 0 10px; font-size: 34px; letter-spacing: 1px; }
        .subtitle { color: #a8bdd8; margin: 0; line-height: 1.7; }
        .latest { width: 390px; padding: 22px; }
        .latest-title { color: #9fb2cc; font-size: 14px; margin-bottom: 10px; }
        .selected-box { margin-top: 28px; padding: 18px; border-radius: 16px; border: 1px solid rgba(56, 189, 248, .28); background: rgba(2, 6, 23, .22); }
        .selected-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; }
        .selected-name { font-size: 20px; font-weight: 900; }
        .selected-desc { color: #a8bdd8; font-size: 13px; margin-top: 6px; }
        .next-box { margin-top: 18px; padding-top: 18px; border-top: 1px solid rgba(148, 163, 184, .18); }
        .expect { font-size: 24px; font-weight: 800; margin-bottom: 12px; }
        .balls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
        .num-ball { display: inline-flex; width: 40px; height: 40px; align-items: center; justify-content: center; border-radius: 50%; background: linear-gradient(145deg, #f8fafc, #cbd5e1); color: #0f172a; font-weight: 800; box-shadow: inset 0 -3px 0 rgba(0,0,0,.18); }
        .num-ball.special { background: linear-gradient(145deg, #facc15, #f97316); color: #111827; }
        .plus { color: #64748b; font-weight: 900; }
        .toolbar { display: flex; gap: 12px; align-items: center; margin: 14px 0 22px; }
        .btn { border: none; border-radius: 999px; padding: 10px 16px; color: #07111f; background: #38bdf8; font-weight: 800; cursor: pointer; }
        .copy-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .copy-btn { border: 1px solid rgba(250, 204, 21, .6); border-radius: 12px; padding: 10px 14px; color: #0f172a; background: linear-gradient(145deg, #fde047, #f97316); font-weight: 900; cursor: pointer; white-space: nowrap; }
        .consensus-box { margin-top: 12px; padding: 12px; border-radius: 14px; background: rgba(34, 197, 94, .08); border: 1px solid rgba(34, 197, 94, .25); }
        .muted { color: #91a4bf; font-size: 13px; }
        .grid { display: grid; grid-template-columns: 1.5fr .9fr; gap: 18px; align-items: start; }
        .card { padding: 20px; margin-bottom: 18px; overflow: hidden; }
        .card h2 { margin: 0 0 14px; font-size: 22px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 12px 10px; border-bottom: 1px solid rgba(148, 163, 184, 0.16); text-align: left; font-size: 14px; }
        th { color: #9fb2cc; font-weight: 700; background: rgba(2, 6, 23, .28); }
        tr.clickable { cursor: pointer; }
        tr.clickable:hover { background: rgba(56, 189, 248, .08); }
        tr.selected { background: rgba(34, 197, 94, .1); }
        .rate-good { color: #4ade80; font-weight: 900; }
        .rate-mid { color: #facc15; font-weight: 900; }
        .rate-low { color: #fb7185; font-weight: 900; }
        .tail-list { display: flex; flex-wrap: wrap; gap: 6px; }
        .tail-badge { display: inline-flex; width: 28px; height: 28px; border-radius: 10px; align-items: center; justify-content: center; background: #1e293b; border: 1px solid #334155; color: #cbd5e1; font-weight: 800; }
        .tail-badge.active { background: #22c55e; color: #052e16; border-color: #86efac; }
        .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        .stat { padding: 14px; border-radius: 14px; background: rgba(2, 6, 23, .36); border: 1px solid rgba(148, 163, 184, .16); }
        .stat-label { color: #9fb2cc; font-size: 13px; margin-bottom: 8px; }
        .stat-value { font-size: 24px; font-weight: 900; }
        .detail-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; padding: 10px; border-radius: 12px; background: rgba(15, 23, 42, .7); }
        .hit { color: #4ade80; font-weight: 900; margin-left: auto; }
        .miss { color: #fb7185; font-weight: 900; margin-left: auto; }
        .hit-pill { display: inline-flex; padding: 4px 9px; border-radius: 999px; font-weight: 900; background: rgba(34, 197, 94, .16); color: #4ade80; }
        .miss-pill { display: inline-flex; padding: 4px 9px; border-radius: 999px; font-weight: 900; background: rgba(239, 68, 68, .14); color: #fb7185; }
        .heat-item { display: grid; grid-template-columns: 42px 1fr 70px; gap: 10px; align-items: center; margin: 10px 0; }
        .bar { height: 10px; border-radius: 999px; overflow: hidden; background: #1e293b; }
        .bar span { display: block; height: 100%; background: linear-gradient(90deg, #38bdf8, #22c55e); border-radius: 999px; }
        .error { padding: 16px; border-radius: 14px; background: rgba(239, 68, 68, .14); color: #fecaca; border: 1px solid rgba(248, 113, 113, .3); }
        .heatmap-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
        .heatmap-card { padding: 14px; border-radius: 14px; background: rgba(2, 6, 23, .36); border: 1px solid rgba(148, 163, 184, .16); }
        .heatmap-title { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 10px; font-weight: 900; }
        .heatmap-sub { color: #91a4bf; font-size: 12px; font-weight: 700; }
        .heatmap-dots { display: grid; grid-template-columns: repeat(10, 1fr); gap: 4px; }
        .dot { display: inline-flex; height: 24px; min-width: 24px; border-radius: 7px; align-items: center; justify-content: center; font-size: 13px; background: #ef4444; box-shadow: inset 0 -2px 0 rgba(0,0,0,.22); }
        .dot.hit-dot { background: #22c55e; }
        .dot.miss-dot { background: #ef4444; }
        @media (max-width: 900px) {
          .hero, .grid { display: block; }
          .latest { width: auto; margin-top: 16px; }
          .stats, .heatmap-grid { grid-template-columns: 1fr; }
          .page { padding: 16px; }
        }
      `}</style>

      <div className="container">
        <section className="hero">
          <div className="hero-card">
            <h1>澳门六合彩尾数策略回测系统</h1>
            <p className="subtitle">增加下一期尾数参考，不预测具体开奖号码。系统自动读取历史开奖，分别测试近 20 / 30 / 50 期的命中率、最大连错、当前连错和覆盖率，筛出当前综合排名最高的 8 尾方案。</p>

            {selected && (
              <div className="selected-box">
                <div className="selected-head">
                  <div>
                    <div className="latest-title">当前点击方案尾数</div>
                    <div className="selected-name">{selected.name}｜{selected.logic}</div>
                  </div>
                  <button className="copy-btn" onClick={copySelectedTails}>{selectedCopied ? '已复制' : '复制方案尾数'}</button>
                </div>
                <div className="tail-list">{selected.tails.map((tail) => <TailBadge key={tail} tail={tail} active />)}</div>
                <div className="selected-desc">
                  近20期 {fmtPercent(selected.result20.hitRate)} ｜ 近30期 {fmtPercent(selected.result30.hitRate)} ｜ 近50期 {fmtPercent(selected.result50.hitRate)}
                  ｜ 最大连错 {selected.result50.maxMiss} ｜ 当前连错 {selected.result20.currentMiss}
                </div>
              </div>
            )}
          </div>

          <div className="hero-card latest">
            <div className="latest-title">最新开奖</div>
            {data?.latest ? (
              <>
                <div className="expect">第 {data.latest.expect} 期</div>
                <div className="balls">
                  {data.latest.numbers.slice(0, 6).map((num, index) => <NumberBall key={`${num}-${index}`} num={num} />)}
                  <span className="plus">+</span>
                  <NumberBall num={data.latest.numbers[6]} special />
                </div>
                <p className="muted">开奖时间：{data.latest.openTime || '-'}</p>
              </>
            ) : <p className="muted">等待加载...</p>}
            {selected && (
              <div className="next-box">
                <div className="latest-title">下一期尾数参考</div>
                <div className="expect">第 {data?.nextExpect || '-'} 期</div>
                <div className="copy-row">
                  <div className="tail-list">{nextTails.map((tail) => <TailBadge key={tail} tail={tail} active />)}</div>
                  <button className="copy-btn" onClick={copyNextTails}>{copied ? '已复制' : '复制尾数'}</button>
                </div>
                <div className="consensus-box">
                  <p className="muted" style={{ margin: 0 }}>当前采用：10档位综合出现最多尾数｜按方案排名权重 + 出现次数筛选</p>
                  <p className="muted" style={{ margin: '6px 0 0' }}>综合胜算：20期 {fmtPercent(consensusStats.result20.hitRate)} ｜ 30期 {fmtPercent(consensusStats.result30.hitRate)} ｜ 50期 {fmtPercent(consensusStats.result50.hitRate)}</p>
                </div>
              </div>
            )}
          </div>
        </section>

        <div className="toolbar">
          <button className="btn" onClick={loadData}>{loading ? '刷新中...' : '刷新数据'}</button>
          <span className="muted">数据源：{data?.source || 'macaumarksix.com'} ｜ 更新时间：{data?.updatedAt ? new Date(data.updatedAt).toLocaleString() : '-'}</span>
        </div>

        {error && <div className="error">{error}</div>}

        <section className="grid">
          <div>
            <div className="card">
              <h2>尾数方案排行榜</h2>
              <table>
                <thead>
                  <tr>
                    <th>方案</th>
                    <th>逻辑</th>
                    <th>8个尾数</th>
                    <th>20期</th>
                    <th>30期</th>
                    <th>50期</th>
                    <th>最大连错</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((item) => (
                    <tr key={item.id} className={item.id === selected?.id ? 'clickable selected' : 'clickable'} onClick={() => setSelectedId(item.id)}>
                      <td><strong>{item.name}</strong></td>
                      <td>{item.logic}</td>
                      <td><div className="tail-list">{item.tails.map((tail) => <TailBadge key={tail} tail={tail} active />)}</div></td>
                      <td className={item.result20.hitRate >= 70 ? 'rate-good' : item.result20.hitRate >= 60 ? 'rate-mid' : 'rate-low'}>{fmtPercent(item.result20.hitRate)}</td>
                      <td>{fmtPercent(item.result30.hitRate)}</td>
                      <td>{fmtPercent(item.result50.hitRate)}</td>
                      <td>{item.result50.maxMiss}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="card">
              <h2>10档综合出现最多尾数胜算</h2>
              <p className="subtitle">把当前排行榜前10个档位的尾数合并统计，选出现次数最多的8个尾数，再回测近20 / 30 / 50期开奖命中率。</p>
              <div className="tail-list" style={{ margin: '14px 0' }}>{nextTails.map((tail) => <TailBadge key={tail} tail={tail} active />)}</div>
              <div className="stats">
                {[20, 30, 50].map((size) => {
                  const result = consensusStats[`result${size}`]
                  return (
                    <div className="stat" key={size}>
                      <div className="stat-label">综合近 {size} 期胜算</div>
                      <div className="stat-value">{fmtPercent(result.hitRate)}</div>
                      <div className="muted">命中 {result.hitCount}/{result.testedCount} ｜ 最大连错 {result.maxMiss} ｜ 当前连错 {result.currentMiss}</div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="card">
              <h2>10个档位当期开奖统计</h2>
              <table>
                <thead>
                  <tr>
                    <th>排名</th>
                    <th>档位策略</th>
                    <th>当期开奖</th>
                    <th>是否命中</th>
                    <th>20期命中</th>
                    <th>50期命中</th>
                  </tr>
                </thead>
                <tbody>
                  {currentDrawRows.map((row) => (
                    <tr key={row.strategy.id}>
                      <td>第{row.rank}名</td>
                      <td><strong>{row.strategy.logic}</strong><br /><span className="muted">{row.strategy.tails.join(' ')}</span></td>
                      <td>{String(row.specialNumber || 0).padStart(2, '0')}｜尾{row.currentTail}</td>
                      <td><span className={row.hit ? 'hit-pill' : 'miss-pill'}>{row.hit ? '命中' : '未中'}</span></td>
                      <td>{row.strategy.result20.hitCount}/{row.strategy.result20.testedCount} = {fmtPercent(row.strategy.result20.hitRate)}</td>
                      <td>{row.strategy.result50.hitCount}/{row.strategy.result50.testedCount} = {fmtPercent(row.strategy.result50.hitRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="card">
              <h2>近20期开奖冻结热力图</h2>
              <p className="subtitle">🟩 = 命中，🟥 = 未中。每期开奖后会把当时前10个档位的结果保存到浏览器本地缓存，保存后不会再随新开奖或排名变化而改写。</p>
              <div className="heatmap-grid">
                {Array.from({ length: 10 }, (_, index) => {
                  const rank = index + 1
                  const summary = summarizeFrozenRank(frozenRecords, rank)
                  const first = frozenRecords[0]?.rows?.find((item) => item.rank === rank)

                  return (
                    <div className="heatmap-card" key={rank}>
                      <div className="heatmap-title">
                        <span>{rank}. {first?.logic || `档位${rank}`}</span>
                        <span className="heatmap-sub">{summary.hitCount}/{summary.testedCount}｜{fmtPercent(summary.hitRate)}｜连错{summary.currentMiss}</span>
                      </div>
                      <div className="heatmap-dots">
                        {frozenRecords.map((record) => {
                          const row = record.rows.find((item) => item.rank === rank)
                          return (
                            <span
                              key={`${record.expect}-${rank}`}
                              className={row?.hit ? 'dot hit-dot' : 'dot miss-dot'}
                              title={`第${record.expect}期｜尾${record.tail}｜${row?.hit ? '命中' : '未中'}`}
                            >
                              {row?.hit ? '🟩' : '🟥'}
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {selected && (
              <div className="card">
                <h2>{selected.name}｜{selected.logic} 明细</h2>
                <div className="tail-list" style={{ marginBottom: 16 }}>{selected.tails.map((tail) => <TailBadge key={tail} tail={tail} active />)}</div>
                <div className="stats">
                  {WINDOWS.map((size) => {
                    const result = selected[`result${size}`]
                    return (
                      <div className="stat" key={size}>
                        <div className="stat-label">近 {size} 期命中率</div>
                        <div className="stat-value">{fmtPercent(result.hitRate)}</div>
                        <div className="muted">命中 {result.hitCount}/{result.testedCount} ｜ 最大连错 {result.maxMiss} ｜ 当前连错 {result.currentMiss}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {selected && (
              <div className="card">
                <h2>近 30 期回测明细</h2>
                {selected.result30.rows.map((row) => (
                  <div className="detail-row" key={row.expect}>
                    <strong>第 {row.expect} 期</strong>
                    <span className="muted">{row.openTime || '-'}</span>
                    <span>特码：</span>
                    <NumberBall num={row.specialNumber} special />
                    <span>尾 {row.tail}</span>
                    <span className={row.hit ? 'hit' : 'miss'}>{row.hit ? '命中' : '未中'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <aside>
            <div className="card">
              <h2>10档综合尾数出现率</h2>
              <p className="subtitle">统计当前排行榜前10个档位中，每个尾数被选中的次数。次数越多，下一期参考优先级越高。</p>
              {consensus.stats.map((item) => (
                <div className="heat-item" key={item.tail}>
                  <TailBadge tail={item.tail} active={nextTails.includes(item.tail)} />
                  <div className="bar"><span style={{ width: `${item.appear * 10}%` }} /></div>
                  <strong>{item.appear}/10档</strong>
                </div>
              ))}
            </div>

            <div className="card">
              <h2>尾数热度排行</h2>
              {heat.slice().sort((a, b) => b.count - a.count).map((item) => (
                <div className="heat-item" key={item.tail}>
                  <TailBadge tail={item.tail} active />
                  <div className="bar"><span style={{ width: `${Math.min(100, item.rate * 2)}%` }} /></div>
                  <strong>{item.count}次</strong>
                </div>
              ))}
            </div>

            <div className="card">
              <h2>尾数遗漏排行</h2>
              {heat.slice().sort((a, b) => b.omit - a.omit).map((item) => (
                <div className="heat-item" key={item.tail}>
                  <TailBadge tail={item.tail} active={selected?.tails.includes(item.tail)} />
                  <div className="bar"><span style={{ width: `${Math.min(100, item.omit * 8)}%` }} /></div>
                  <strong>{item.omit}期</strong>
                </div>
              ))}
            </div>

            <div className="card">
              <h2>说明</h2>
              <p className="subtitle">命中规则：只看特码尾数是否落入方案的 8 个尾数内。</p>
              <p className="subtitle">覆盖率：8 个尾数覆盖 0-9 共 10 个尾数，所以固定为 80%。</p>
              <p className="subtitle">本页面仅做历史回测统计，不保证未来结果。</p>
            </div>
          </aside>
        </section>
      </div>
    </main>
  )
}
