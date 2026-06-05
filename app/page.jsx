'use client'

import React, { useEffect, useMemo, useState } from 'react'

const PLAY_CONFIG = {
  macau: {
    name: '澳门',
    api: '/api/history?play=macau',
  },
  hongkong: {
    name: '香港',
    api: '/api/history?play=hongkong',
  },
}

const TAIL_STRATEGIES = [
  { id: 's1', name: '方案1', logic: '5热+2冷', tails: [1, 2, 3, 5, 6, 7, 8] },
  { id: 's2', name: '方案2', logic: '4热+3冷', tails: [1, 3, 4, 6, 7, 8, 9] },
  { id: 's3', name: '方案3', logic: '纯热尾', tails: [1, 2, 3, 5, 7, 8, 9] },
  { id: 's4', name: '方案4', logic: '热尾+遗漏王', tails: [0, 1, 3, 4, 5, 7, 8] },
  { id: 's5', name: '方案5', logic: '趋势升温', tails: [1, 2, 4, 5, 6, 7, 8] },
  { id: 's6', name: '方案6', logic: '大尾优先', tails: [3, 4, 5, 6, 7, 8, 9] },
  { id: 's7', name: '方案7', logic: '小尾优先', tails: [0, 1, 2, 3, 4, 5, 6] },
  { id: 's8', name: '方案8', logic: '奇尾偏重', tails: [1, 3, 5, 6, 7, 8, 9] },
  { id: 's9', name: '方案9', logic: '偶尾偏重', tails: [0, 2, 3, 4, 5, 6, 8] },
  { id: 's10', name: '方案10', logic: '均衡覆盖', tails: [0, 1, 2, 4, 5, 7, 9] },
]

const RANGES = [20, 30, 50]

function getSpecialNumber(item) {
  return Number(item?.specialNumber ?? item?.numbers?.[item.numbers.length - 1])
}

function getTail(num) {
  return Number(num) % 10
}

function percent(value) {
  return `${Number(value || 0).toFixed(2)}%`
}

function formatTails(tails) {
  return tails.join(' ')
}

function calcMaxMissStreak(rows) {
  let current = 0
  let max = 0

  rows.forEach((row) => {
    if (row.hit) {
      current = 0
    } else {
      current += 1
      max = Math.max(max, current)
    }
  })

  return max
}

function backtestOne(history, strategy, size) {
  const source = history.slice(0, size)
  const tailSet = new Set(strategy.tails)

  const rows = source.map((item) => {
    const specialNumber = getSpecialNumber(item)
    const specialTail = getTail(specialNumber)
    const hit = tailSet.has(specialTail)

    return {
      expect: item.expect,
      openTime: item.openTime,
      numbers: item.numbers,
      specialNumber,
      specialTail,
      hit,
    }
  })

  const testedCount = rows.length
  const hitCount = rows.filter((row) => row.hit).length
  const missCount = testedCount - hitCount
  const maxMissStreak = calcMaxMissStreak(rows)

  const appearedTails = new Set(rows.map((row) => row.specialTail))
  const coveredAppearedTails = new Set(
    rows.filter((row) => row.hit).map((row) => row.specialTail)
  )

  return {
    size,
    testedCount,
    hitCount,
    missCount,
    hitRate: testedCount ? (hitCount / testedCount) * 100 : 0,
    missRate: testedCount ? (missCount / testedCount) * 100 : 0,
    maxMissStreak,
    maxMissRate: testedCount ? (maxMissStreak / testedCount) * 100 : 0,
    tailCoverageRate: (strategy.tails.length / 10) * 100,
    appearedTailCoverageRate: appearedTails.size
      ? (coveredAppearedTails.size / appearedTails.size) * 100
      : 0,
    rows,
  }
}

function buildSummary(history) {
  return TAIL_STRATEGIES.map((strategy) => {
    const results = Object.fromEntries(
      RANGES.map((size) => [size, backtestOne(history, strategy, size)])
    )

    const score = Number(
      (
        results[20].hitRate * 0.5 +
        results[30].hitRate * 0.3 +
        results[50].hitRate * 0.2 -
        results[20].maxMissStreak * 1.2
      ).toFixed(2)
    )

    return {
      ...strategy,
      results,
      score,
    }
  }).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (b.results[20].hitRate !== a.results[20].hitRate) {
      return b.results[20].hitRate - a.results[20].hitRate
    }
    return a.results[20].maxMissStreak - b.results[20].maxMissStreak
  })
}

function StatCard({ label, value, sub }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
    </div>
  )
}

function TailPill({ tail, active = true }) {
  return <span className={`tail-pill ${active ? 'active' : ''}`}>{tail}</span>
}

export default function Page() {
  const [currentPlay, setCurrentPlay] = useState('macau')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')

      try {
        const res = await fetch(PLAY_CONFIG[currentPlay].api, { cache: 'no-store' })
        const json = await res.json()

        if (!res.ok || !json.ok) {
          throw new Error(json.message || '数据获取失败')
        }

        if (!cancelled) {
          setData(json)
          setSelectedId('')
        }
      } catch (err) {
        if (!cancelled) setError(err.message || '数据获取失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [currentPlay])

  const history = data?.history || []
  const ranking = useMemo(() => buildSummary(history), [history])
  const selected = ranking.find((item) => item.id === selectedId) || ranking[0]

  return (
    <main className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">Mark Six Tail Backtest</p>
          <h1>{PLAY_CONFIG[currentPlay].name}六合彩特码尾数多方案回测</h1>
          <p className="desc">
            本站只做历史数据回测，不预测下期开奖号。按你给的10套尾数方案，分别统计近20、30、50期的命中率、最大连错、连错率和覆盖率。
          </p>
        </div>

        <div className="switch">
          {Object.entries(PLAY_CONFIG).map(([key, item]) => (
            <button
              key={key}
              type="button"
              className={currentPlay === key ? 'active' : ''}
              onClick={() => setCurrentPlay(key)}
            >
              {item.name}
            </button>
          ))}
        </div>
      </section>

      {loading && <section className="card">正在加载开奖数据...</section>}
      {error && <section className="card error">{error}</section>}

      {!loading && !error && data && (
        <>
          <section className="grid top">
            <StatCard label="最新期号" value={data.latest?.expect || '-'} sub={data.latest?.openTime || '-'} />
            <StatCard label="最新特码" value={String(data.latest?.specialNumber || '-').padStart(2, '0')} sub={`尾数 ${data.latest?.specialTail ?? '-'}`} />
            <StatCard label="历史样本" value={`${history.length}期`} sub={`更新时间 ${new Date(data.updatedAt).toLocaleString()}`} />
            <StatCard label="方案数量" value={`${TAIL_STRATEGIES.length}套`} sub="每套固定7个尾数" />
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <h2>方案排名总览</h2>
                <p>排序权重：近20期命中率优先，同时参考近30/50期，并扣除近20期最大连错。</p>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>排名</th>
                    <th>方案</th>
                    <th>逻辑</th>
                    <th>7个尾数</th>
                    <th>近20期</th>
                    <th>近30期</th>
                    <th>近50期</th>
                    <th>近20最大连错</th>
                    <th>尾数覆盖</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((item, index) => (
                    <tr
                      key={item.id}
                      className={selected?.id === item.id ? 'selected' : ''}
                      onClick={() => setSelectedId(item.id)}
                    >
                      <td>#{index + 1}</td>
                      <td><strong>{item.name}</strong></td>
                      <td>{item.logic}</td>
                      <td className="tails">{item.tails.map((tail) => <TailPill key={tail} tail={tail} />)}</td>
                      <td>{item.results[20].hitCount}/{item.results[20].testedCount} · {percent(item.results[20].hitRate)}</td>
                      <td>{item.results[30].hitCount}/{item.results[30].testedCount} · {percent(item.results[30].hitRate)}</td>
                      <td>{item.results[50].hitCount}/{item.results[50].testedCount} · {percent(item.results[50].hitRate)}</td>
                      <td>{item.results[20].maxMissStreak}期 · {percent(item.results[20].maxMissRate)}</td>
                      <td>{percent(item.results[20].tailCoverageRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {selected && (
            <section className="card">
              <div className="card-head">
                <div>
                  <h2>{selected.name}｜{selected.logic}</h2>
                  <p>尾数：{formatTails(selected.tails)}</p>
                </div>
              </div>

              <div className="grid">
                {RANGES.map((size) => {
                  const result = selected.results[size]
                  return (
                    <StatCard
                      key={size}
                      label={`近${size}期`}
                      value={`${result.hitCount}/${result.testedCount}`}
                      sub={`命中率 ${percent(result.hitRate)}｜最大连错 ${result.maxMissStreak}｜连错率 ${percent(result.maxMissRate)}｜实际覆盖 ${percent(result.appearedTailCoverageRate)}`}
                    />
                  )
                })}
              </div>

              <h3>近50期明细</h3>
              <div className="detail-list">
                {selected.results[50].rows.map((row) => (
                  <div key={row.expect} className={`draw-row ${row.hit ? 'hit' : 'miss'}`}>
                    <div>
                      <strong>第 {row.expect} 期</strong>
                      <span>{row.openTime || '-'}</span>
                    </div>
                    <div className="numbers">
                      {(row.numbers || []).map((num, index) => (
                        <span key={`${row.expect}-${num}-${index}`} className={index === 6 ? 'special' : ''}>
                          {String(num).padStart(2, '0')}
                        </span>
                      ))}
                    </div>
                    <div>
                      特码尾 <b>{row.specialTail}</b>：
                      <em>{row.hit ? '命中' : '未中'}</em>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <style jsx>{`
        .page {
          min-height: 100vh;
          padding: 28px;
          background: linear-gradient(135deg, #101827, #172554 45%, #0f172a);
          color: #e5e7eb;
          font-family: Arial, 'Microsoft YaHei', sans-serif;
        }

        .hero {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          align-items: flex-start;
          padding: 28px;
          border-radius: 24px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.14);
          box-shadow: 0 24px 80px rgba(0, 0, 0, 0.25);
        }

        .eyebrow {
          margin: 0 0 10px;
          color: #93c5fd;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          font-size: 12px;
        }

        h1 {
          margin: 0;
          font-size: 34px;
        }

        h2, h3 {
          margin: 0 0 10px;
        }

        .desc {
          max-width: 760px;
          color: #cbd5e1;
          line-height: 1.8;
        }

        .switch {
          display: flex;
          gap: 10px;
          flex-shrink: 0;
        }

        button {
          cursor: pointer;
          border: 0;
          border-radius: 999px;
          padding: 11px 18px;
          background: rgba(255, 255, 255, 0.12);
          color: #e5e7eb;
          font-weight: 700;
        }

        button.active {
          background: #facc15;
          color: #111827;
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
          margin-top: 18px;
        }

        .grid.top {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }

        .card, .stat-card {
          margin-top: 18px;
          border-radius: 22px;
          background: rgba(255, 255, 255, 0.09);
          border: 1px solid rgba(255, 255, 255, 0.14);
          padding: 20px;
        }

        .stat-card {
          margin-top: 0;
        }

        .stat-card span, .stat-card small {
          display: block;
          color: #cbd5e1;
        }

        .stat-card strong {
          display: block;
          margin: 8px 0;
          font-size: 26px;
          color: #fff;
        }

        .card-head {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 16px;
        }

        .card-head p {
          margin: 0;
          color: #cbd5e1;
        }

        .table-wrap {
          overflow-x: auto;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          min-width: 1050px;
        }

        th, td {
          padding: 13px 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.12);
          text-align: left;
          white-space: nowrap;
        }

        th {
          color: #bfdbfe;
          font-size: 13px;
        }

        tbody tr {
          cursor: pointer;
        }

        tbody tr:hover, tr.selected {
          background: rgba(250, 204, 21, 0.12);
        }

        .tails {
          display: flex;
          gap: 6px;
        }

        .tail-pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.12);
          color: #e5e7eb;
          font-weight: 800;
        }

        .tail-pill.active {
          background: #2563eb;
        }

        .detail-list {
          display: grid;
          gap: 10px;
          margin-top: 12px;
        }

        .draw-row {
          display: grid;
          grid-template-columns: 180px 1fr 160px;
          align-items: center;
          gap: 12px;
          padding: 12px;
          border-radius: 14px;
          background: rgba(15, 23, 42, 0.52);
        }

        .draw-row.hit {
          outline: 1px solid rgba(34, 197, 94, 0.6);
        }

        .draw-row.miss {
          outline: 1px solid rgba(248, 113, 113, 0.35);
        }

        .draw-row span {
          display: block;
          color: #94a3b8;
          font-size: 12px;
          margin-top: 4px;
        }

        .numbers {
          display: flex;
          gap: 7px;
          flex-wrap: wrap;
        }

        .numbers span {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 34px;
          height: 34px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.14);
          color: #fff;
          font-weight: 800;
          margin: 0;
        }

        .numbers span.special {
          background: #facc15;
          color: #111827;
        }

        em {
          font-style: normal;
          color: #facc15;
          font-weight: 800;
        }

        .error {
          color: #fecaca;
        }

        @media (max-width: 900px) {
          .page {
            padding: 14px;
          }

          .hero {
            flex-direction: column;
          }

          .grid, .grid.top {
            grid-template-columns: 1fr;
          }

          .draw-row {
            grid-template-columns: 1fr;
          }

          h1 {
            font-size: 25px;
          }
        }
      `}</style>
    </main>
  )
}
