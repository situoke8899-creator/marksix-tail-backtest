'use client'

import { useEffect, useMemo, useState } from 'react'

const TAIL_STRATEGIES = [
  { id: 's1', name: '方案1', logic: '热尾主攻', tails: [1, 2, 3, 4, 5, 6, 7, 8] },
  { id: 's2', name: '方案2', logic: '热尾+遗漏', tails: [0, 1, 2, 3, 5, 6, 7, 8] },
  { id: 's3', name: '方案3', logic: '均衡稳健', tails: [0, 1, 2, 3, 4, 5, 7, 8] },
  { id: 's4', name: '方案4', logic: '大尾偏强', tails: [1, 3, 4, 5, 6, 7, 8, 9] },
  { id: 's5', name: '方案5', logic: '小尾防守', tails: [0, 1, 2, 3, 4, 5, 6, 8] },
  { id: 's6', name: '方案6', logic: '奇偶均衡', tails: [0, 1, 2, 3, 5, 6, 8, 9] },
  { id: 's7', name: '方案7', logic: '趋势升温', tails: [1, 2, 3, 4, 5, 7, 8, 9] },
  { id: 's8', name: '方案8', logic: '冷尾补位', tails: [0, 1, 3, 4, 5, 6, 7, 9] },
  { id: 's9', name: '方案9', logic: '低连错优先', tails: [0, 2, 3, 4, 5, 6, 7, 8] },
  { id: 's10', name: '方案10', logic: '综合最优', tails: [0, 1, 2, 4, 5, 6, 7, 8] },
]


const WINDOWS = [20, 30, 50]

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
    if (hit) {
      current = 0
    } else {
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

  useEffect(() => {
    if (!selectedId && ranking[0]?.id) setSelectedId(ranking[0].id)
  }, [ranking, selectedId])

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
        .next-box { margin-top: 18px; padding-top: 18px; border-top: 1px solid rgba(148, 163, 184, .18); }
        .expect { font-size: 24px; font-weight: 800; margin-bottom: 12px; }
        .balls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
        .num-ball { display: inline-flex; width: 40px; height: 40px; align-items: center; justify-content: center; border-radius: 50%; background: linear-gradient(145deg, #f8fafc, #cbd5e1); color: #0f172a; font-weight: 800; box-shadow: inset 0 -3px 0 rgba(0,0,0,.18); }
        .num-ball.special { background: linear-gradient(145deg, #facc15, #f97316); color: #111827; }
        .plus { color: #64748b; font-weight: 900; }
        .toolbar { display: flex; gap: 12px; align-items: center; margin: 14px 0 22px; }
        .btn { border: none; border-radius: 999px; padding: 10px 16px; color: #07111f; background: #38bdf8; font-weight: 800; cursor: pointer; }
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
        .heat-item { display: grid; grid-template-columns: 42px 1fr 70px; gap: 10px; align-items: center; margin: 10px 0; }
        .bar { height: 10px; border-radius: 999px; overflow: hidden; background: #1e293b; }
        .bar span { display: block; height: 100%; background: linear-gradient(90deg, #38bdf8, #22c55e); border-radius: 999px; }
        .error { padding: 16px; border-radius: 14px; background: rgba(239, 68, 68, .14); color: #fecaca; border: 1px solid rgba(248, 113, 113, .3); }
        @media (max-width: 900px) { .hero, .grid { display: block; } .latest { width: auto; margin-top: 16px; } .stats { grid-template-columns: 1fr; } .page { padding: 16px; } }
      `}</style>

      <div className="container">
        <section className="hero">
          <div className="hero-card">
            <h1>澳门六合彩尾数策略回测系统</h1>
            <p className="subtitle">增加下一期尾数参考，不预测具体开奖号码。系统自动读取历史开奖，分别测试近 20 / 30 / 50 期的命中率、最大连错、当前连错和覆盖率，筛出当前综合排名最高的 8 尾方案。</p>
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
                <div className="tail-list">{selected.tails.map((tail) => <TailBadge key={tail} tail={tail} active />)}</div>
                <p className="muted">当前采用：{selected.name}｜{selected.logic}</p>
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
