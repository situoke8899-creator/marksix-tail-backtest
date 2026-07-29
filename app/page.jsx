'use client'

import { useEffect, useMemo, useState } from 'react'

const ZODIACS = ['鼠','牛','虎','兔','龙','蛇','马','羊','猴','鸡','狗','猪']
const WINDOWS = [20, 30, 50, 100]

// 10套固定公式。每套都不是“用当期开奖结果反推”，而是逐期只看该期以前的数据。
const FORMULAS = [
  {id:'f1', name:'稳健综合', desc:'20/30/50/100期均衡 + 近期权重', w:{r20:.30,r30:.25,r50:.20,r100:.15,rec:.10,omit:-.05,mom:.05}},
  {id:'f2', name:'短线热势', desc:'最近10/20期 + 近期加权', w:{r10:.30,r20:.35,r30:.10,rec:.20,mom:.10,omit:-.05}},
  {id:'f3', name:'中线均衡', desc:'20/30/50期稳定优先', w:{r20:.25,r30:.35,r50:.25,r100:.05,rec:.10}},
  {id:'f4', name:'长线稳定', desc:'50/100期占主要权重', w:{r20:.10,r30:.15,r50:.30,r100:.35,rec:.10}},
  {id:'f5', name:'热度防断', desc:'热度 + 短遗漏，避开长期断层', w:{r20:.35,r30:.20,rec:.20,shortOmit:.15,mom:.10}},
  {id:'f6', name:'回补平衡', desc:'中热为主 + 适度遗漏回补', w:{r20:.20,r30:.25,r50:.20,rec:.10,rebound:.25}},
  {id:'f7', name:'低波动', desc:'各窗口最低表现也要稳定', kind:'stability'},
  {id:'f8', name:'动量增强', desc:'最近10期相对30期升温', w:{r10:.25,r20:.25,r30:.15,r50:.10,rec:.10,mom:.25}},
  {id:'f9', name:'防冷过滤', desc:'频率为主，强惩罚极冷和长遗漏', w:{r20:.25,r30:.25,r50:.20,r100:.10,rec:.10,omit:-.10,coldPenalty:-.20}},
  {id:'f10', name:'多模型共识', desc:'综合前9套公式排名', kind:'ensemble'},
]

function pct(v){ return `${Number(v||0).toFixed(2)}%` }
function clamp(v,min=0,max=1){ return Math.max(min,Math.min(max,v)) }
function maxMiss(rs){ let m=0,c=0; for(const x of rs){ if(x)c=0; else{c++;m=Math.max(m,c)} } return m }
function currentMiss(rs){ let c=0; for(const x of rs){ if(x)break;c++ } return c }

function metrics(history){
  const getWindow = (n)=>history.slice(0,n)
  return ZODIACS.map(z=>{
    const count = (n)=>getWindow(n).filter(x=>x.specialZodiac===z).length
    const rate = (n)=> n ? count(n)/Math.min(n,history.length||1) : 0
    let omit=history.length
    history.forEach((d,i)=>{ if(omit===history.length && d.specialZodiac===z) omit=i })
    let rec=0, den=0
    history.slice(0,30).forEach((d,i)=>{
      const w=30-i
      den+=w
      if(d.specialZodiac===z) rec+=w
    })
    const r10=rate(10), r20=rate(20), r30=rate(30), r50=rate(50), r100=rate(100)
    const expected=1/12
    const mom=r10-r30
    // 短遗漏分：0~4期较强，太久未出不继续无限加分
    const shortOmit=clamp(1-omit/8)
    // 回补分：适度遗漏2~8期更高，极端遗漏反而下降
    const rebound=clamp(1-Math.abs(omit-5)/8)
    const coldPenalty=omit>=10 || r30<expected*.45 ? 1 : 0
    return {z,r10,r20,r30,r50,r100,rec:den?rec/den:0,omit:clamp(omit/15),shortOmit,rebound,mom,coldPenalty}
  })
}

function rawScore(m, formula){
  if(formula.kind==='stability'){
    const floor=Math.min(m.r20,m.r30,m.r50,m.r100)
    const avg=(m.r20+m.r30+m.r50+m.r100)/4
    return floor*.65+avg*.25+m.rec*.10-m.omit*.04
  }
  const w=formula.w||{}
  return (
    (w.r10||0)*m.r10 + (w.r20||0)*m.r20 + (w.r30||0)*m.r30 +
    (w.r50||0)*m.r50 + (w.r100||0)*m.r100 + (w.rec||0)*m.rec +
    (w.omit||0)*m.omit + (w.shortOmit||0)*m.shortOmit +
    (w.rebound||0)*m.rebound + (w.mom||0)*m.mom +
    (w.coldPenalty||0)*m.coldPenalty
  )
}

function chooseForFormula(history, formula, priorFormulaPicks=null){
  const ms=metrics(history)

  if(formula.kind==='ensemble'){
    const rankScore=new Map(ZODIACS.map(z=>[z,0]))
    for(const picks of priorFormulaPicks||[]){
      picks.forEach((z,idx)=>rankScore.set(z,rankScore.get(z)+(9-idx)))
    }
    return [...rankScore.entries()].sort((a,b)=>b[1]-a[1]).slice(0,9).map(x=>x[0])
  }

  return ms
    .map(m=>({...m,score:rawScore(m,formula)}))
    .sort((a,b)=>b.score-a.score || a.omit-b.omit)
    .slice(0,9)
    .map(x=>x.z)
}

function allPicks(history){
  const out=[]
  for(const f of FORMULAS){
    out.push(chooseForFormula(history,f,out))
  }
  return out
}

function backtest(history, formulaIndex, size){
  const rows=[]
  const limit=Math.min(size,history.length)

  for(let i=0;i<limit;i++){
    const past=history.slice(i+1)
    if(past.length<20) continue

    const picksList=allPicks(past)
    const picks=picksList[formulaIndex]
    const actual=history[i].specialZodiac
    rows.push({
      expect:history[i].expect,
      actual,
      picks,
      hit:Boolean(actual) && picks.includes(actual),
    })
  }

  const rs=rows.map(x=>x.hit)
  const hitCount=rows.filter(x=>x.hit).length
  return {
    rows,
    testedCount:rows.length,
    hitCount,
    hitRate:rows.length ? hitCount/rows.length*100 : 0,
    maxMiss:maxMiss(rs),
    currentMiss:currentMiss(rs),
  }
}

function buildRanking(history){
  const picksList=allPicks(history)
  return FORMULAS.map((f,i)=>{
    const r20=backtest(history,i,20)
    const r30=backtest(history,i,30)
    const r50=backtest(history,i,50)
    const r100=backtest(history,i,100)
    // 更重视最近20/30期，但保留长样本；同时惩罚连错。
    const score=r20.hitRate*.40+r30.hitRate*.30+r50.hitRate*.20+r100.hitRate*.10-r20.maxMiss*1.5
    return {...f,picks:picksList[i],r20,r30,r50,r100,score}
  }).sort((a,b)=>b.score-a.score || b.r20.hitRate-a.r20.hitRate || a.r20.maxMiss-b.r20.maxMiss)
}

function consensus(ranking){
  const map=new Map(ZODIACS.map(z=>[z,{z,appear:0,weight:0}]))
  ranking.forEach((s,i)=>s.picks.forEach(z=>{
    const old=map.get(z)
    map.set(z,{...old,appear:old.appear+1,weight:old.weight+(10-i)})
  }))
  const stats=[...map.values()].sort((a,b)=>b.appear-a.appear||b.weight-a.weight)
  return {picks:stats.slice(0,9).map(x=>x.z),stats}
}



const TAIL_PRIOR = {
  0: 4 / 49,
  1: 5 / 49, 2: 5 / 49, 3: 5 / 49, 4: 5 / 49, 5: 5 / 49,
  6: 5 / 49, 7: 5 / 49, 8: 5 / 49, 9: 5 / 49,
}

const TAIL_FORMULAS = [
  {id:'t1', name:'方案1', model:'bayes', label:'贝叶斯稳健', desc:'20/50/100期 + 理论先验，降低小样本波动'},
  {id:'t2', name:'方案2', model:'ewma', label:'近期指数', desc:'近期开奖权重更高，快速跟随热度变化'},
  {id:'t3', name:'方案3', model:'multi', label:'多周期共识', desc:'10/20/30/50/100期联合评分'},
  {id:'t4', name:'方案4', model:'momentum', label:'动量趋势', desc:'比较10期与30/50期，捕捉升温和降温'},
  {id:'t5', name:'方案5', model:'transition1', label:'一阶转移', desc:'根据上期尾数统计历史下一期尾数分布'},
  {id:'t6', name:'方案6', model:'transition2', label:'二阶转移', desc:'结合最近2期尾数；样本不足自动回退'},
  {id:'t7', name:'方案7', model:'gap', label:'遗漏校准', desc:'频率 + 轻度均值回归，不追“久未出必出”'},
  {id:'t8', name:'方案8', model:'stability', label:'低波动稳定', desc:'多个周期都稳定的尾数优先保留'},
  {id:'t9', name:'方案9', model:'validation', label:'滚动验证', desc:'自动选择最近滚动回测更稳的基础模型'},
  {id:'t10', name:'方案10', model:'ensemble', label:'多模型共识', desc:'综合前9套模型的排除票与置信权重'},
]

function getTail(n){
  const v=Number(n)
  return v>=1&&v<=49 ? v%10 : -1
}

function normalizeTailProb(scores){
  const safe=scores.map(v=>Math.max(.0001,Number(v||0)))
  const sum=safe.reduce((a,b)=>a+b,0)||1
  return safe.map(v=>v/sum)
}

function tailCounts(history,size){
  const src=history.slice(0,size), counts=Array(10).fill(0)
  src.forEach(d=>{ const t=getTail(d.specialNumber); if(t>=0) counts[t]++ })
  return {src,counts}
}

function empiricalTailProb(history,size,priorStrength=20){
  const {src,counts}=tailCounts(history,size)
  return counts.map((c,t)=>
    (c+priorStrength*TAIL_PRIOR[t]) / Math.max(1,src.length+priorStrength)
  )
}

function weightedTailProb(history,decay=.94,priorStrength=12){
  const score=Array(10).fill(0)
  history.slice(0,70).forEach((d,i)=>{
    const t=getTail(d.specialNumber)
    if(t>=0) score[t]+=Math.pow(decay,i)
  })
  return normalizeTailProb(score.map((v,t)=>v+priorStrength*TAIL_PRIOR[t]))
}

function multiTailProb(history){
  const total=Array(10).fill(0)
  ;[[10,.16],[20,.24],[30,.22],[50,.21],[100,.17]].forEach(([size,w])=>{
    const p=empiricalTailProb(history,size,16)
    p.forEach((v,t)=>{total[t]+=v*w})
  })
  return normalizeTailProb(total)
}

function momentumTailProb(history){
  const p10=empiricalTailProb(history,10,10)
  const p30=empiricalTailProb(history,30,16)
  const p50=empiricalTailProb(history,50,20)
  return normalizeTailProb(p10.map((_,t)=>{
    const mom=p10[t]-p30[t]
    return p10[t]*.28+p30[t]*.42+p50[t]*.30+mom*.18
  }))
}

function transitionTailProb(history,order=1){
  if(history.length<30) return empiricalTailProb(history,50,20)

  const tails=history.map(d=>getTail(d.specialNumber)).filter(t=>t>=0)
  const chronological=[...tails].reverse()
  const currentState=tails.slice(0,order).reverse()
  const counts=Array(10).fill(0)
  let matches=0

  for(let i=order;i<chronological.length;i++){
    const prev=chronological.slice(i-order,i)
    if(prev.some((v,j)=>v!==currentState[j])) continue
    counts[chronological[i]]++
    matches++
  }

  if(matches<(order===2?4:7)){
    return order===2 ? transitionTailProb(history,1) : empiricalTailProb(history,50,20)
  }

  const prior=order===2?14:10
  return normalizeTailProb(counts.map((c,t)=>c+prior*TAIL_PRIOR[t]))
}

function gapTailProb(history){
  const base=multiTailProb(history)
  const omit=Array(10).fill(history.length)

  history.forEach((d,i)=>{
    const t=getTail(d.specialNumber)
    if(t>=0&&omit[t]===history.length) omit[t]=i
  })

  return normalizeTailProb(base.map((p,t)=>{
    const gap=Math.min(20,omit[t])
    return p+(TAIL_PRIOR[t]-p)*Math.min(.20,gap*.01)
  }))
}

function stabilityTailProb(history){
  const ps=[20,30,50,100].map(w=>empiricalTailProb(history,w,18))
  return normalizeTailProb(Array.from({length:10},(_,t)=>{
    const vals=ps.map(p=>p[t])
    const avg=vals.reduce((a,b)=>a+b,0)/vals.length
    const variance=vals.reduce((s,v)=>s+(v-avg)**2,0)/vals.length
    const shrink=Math.min(.48,Math.sqrt(variance)*7)
    return avg*(1-shrink)+TAIL_PRIOR[t]*shrink
  }))
}

function tailPickFromProb(prob){
  const sorted=prob.map((p,t)=>({t,p})).sort((a,b)=>a.p-b.p||a.t-b.t)
  const exclude=sorted.slice(0,2).map(x=>x.t).sort((a,b)=>a-b)
  const picks=Array.from({length:10},(_,t)=>t).filter(t=>!exclude.includes(t))
  const confidence=Math.max(0,Math.min(1,((sorted[2]?.p||0)-(sorted[1]?.p||0))*8))
  return {exclude,picks,prob,confidence}
}

function baseTailResult(history,model){
  if(model==='bayes'){
    const p20=empiricalTailProb(history,20,16)
    const p50=empiricalTailProb(history,50,22)
    const p100=empiricalTailProb(history,100,28)
    return tailPickFromProb(normalizeTailProb(
      p20.map((_,t)=>p20[t]*.40+p50[t]*.35+p100[t]*.25)
    ))
  }
  if(model==='ewma') return tailPickFromProb(weightedTailProb(history,.94,14))
  if(model==='multi') return tailPickFromProb(multiTailProb(history))
  if(model==='momentum') return tailPickFromProb(momentumTailProb(history))
  if(model==='transition1') return tailPickFromProb(transitionTailProb(history,1))
  if(model==='transition2') return tailPickFromProb(transitionTailProb(history,2))
  if(model==='gap') return tailPickFromProb(gapTailProb(history))
  if(model==='stability') return tailPickFromProb(stabilityTailProb(history))
  return tailPickFromProb(empiricalTailProb(history,50,20))
}

function quickTailRate(history,model,size=45){
  let hit=0,tested=0
  for(let i=0;i<Math.min(size,history.length);i++){
    const past=history.slice(i+1)
    if(past.length<20) continue
    const r=baseTailResult(past,model)
    const actual=getTail(history[i].specialNumber)
    if(actual<0) continue
    tested++
    if(r.picks.includes(actual)) hit++
  }
  return tested?hit/tested:0
}

function validationTailResult(history){
  const models=['bayes','ewma','multi','momentum','transition1','gap','stability']
  const best=models
    .map(model=>({model,rate:quickTailRate(history,model,45)}))
    .sort((a,b)=>b.rate-a.rate)[0]
  return baseTailResult(history,best?.model||'bayes')
}

function allTailResults(history){
  const results=[]
  for(const f of TAIL_FORMULAS){
    if(f.model==='validation'){
      results.push(validationTailResult(history))
      continue
    }

    if(f.model==='ensemble'){
      const votes=Array(10).fill(0)
      results.forEach(r=>{
        r.exclude.forEach(t=>{votes[t]+=1+(r.confidence||0)})
      })
      votes[0]+=.12

      const ranked=votes.map((v,t)=>({t,v})).sort((a,b)=>b.v-a.v||a.t-b.t)
      const exclude=ranked.slice(0,2).map(x=>x.t).sort((a,b)=>a-b)
      results.push({
        exclude,
        picks:Array.from({length:10},(_,t)=>t).filter(t=>!exclude.includes(t)),
        prob:normalizeTailProb(votes.map((v,t)=>1/Math.max(.2,v+.35)+TAIL_PRIOR[t]*.15)),
        confidence:Math.min(1,Math.max(0,(ranked[1].v-(ranked[2]?.v||0))*.18)),
      })
      continue
    }

    results.push(baseTailResult(history,f.model))
  }
  return results
}

function backtestTail(history,index,size){
  const rows=[]
  for(let i=0;i<Math.min(size,history.length);i++){
    const past=history.slice(i+1)
    if(past.length<20) continue
    const result=allTailResults(past)[index]
    const actual=getTail(history[i].specialNumber)
    if(actual<0) continue
    rows.push({
      expect:history[i].expect,
      actual,
      exclude:result.exclude,
      picks:result.picks,
      hit:result.picks.includes(actual),
    })
  }

  const rs=rows.map(x=>x.hit)
  const hitCount=rows.filter(x=>x.hit).length
  return {
    rows,
    testedCount:rows.length,
    hitCount,
    hitRate:rows.length?hitCount/rows.length*100:0,
    maxMiss:maxMiss(rs),
    currentMiss:currentMiss(rs),
  }
}

function buildTailRanking(history){
  const current=allTailResults(history)

  return TAIL_FORMULAS.map((f,i)=>{
    const r20=backtestTail(history,i,20)
    const r30=backtestTail(history,i,30)
    const r50=backtestTail(history,i,50)
    const r100=backtestTail(history,i,100)
    const score=r20.hitRate*.38+r30.hitRate*.27+r50.hitRate*.20+r100.hitRate*.15-r20.maxMiss*1.25
    return {...f,...current[i],r20,r30,r50,r100,score:Number(score.toFixed(2))}
  }).sort((a,b)=>
    b.score-a.score||
    b.r20.hitRate-a.r20.hitRate||
    b.r50.hitRate-a.r50.hitRate||
    a.r20.maxMiss-b.r20.maxMiss
  )
}

function tailConsensus(ranking){
  const votes=Array(10).fill(0)
  ranking.forEach((s,i)=>{
    const rankWeight=10-i
    s.exclude.forEach(t=>{
      votes[t]+=rankWeight*(1+(s.confidence||0)*.35)
    })
  })
  votes[0]+=.4

  const ranked=votes.map((v,t)=>({t,v})).sort((a,b)=>b.v-a.v||a.t-b.t)
  const exclude=ranked.slice(0,2).map(x=>x.t).sort((a,b)=>a-b)

  return {
    exclude,
    picks:Array.from({length:10},(_,t)=>t).filter(t=>!exclude.includes(t)),
    votes,
  }
}

function T({t}){ return <span className="t">{t}尾</span> }

const HEAD_PRIOR = {
  // 01-09 共9个号码；10-19、20-29、30-39、40-49 各10个号码
  0: 9 / 49,
  1: 10 / 49,
  2: 10 / 49,
  3: 10 / 49,
  4: 10 / 49,
}

// 头数最合理的目标不是“选四个热头”，而是：
// 先估计下一期 0~4 头各自概率，再排除估计概率最低的1个头。
// 这样每套方案始终覆盖4个头，同时能正确考虑 0头只有9个号码这一结构差异。
const HEAD_FORMULAS = [
  {id:'h1', name:'方案1', model:'bayes', label:'贝叶斯稳健', desc:'20/50/100期 + 理论先验收缩，防止小样本过拟合'},
  {id:'h2', name:'方案2', model:'ewma', label:'近期指数', desc:'越近的开奖权重越高，同时保留理论基础概率'},
  {id:'h3', name:'方案3', model:'multi', label:'多周期共识', desc:'10/20/30/50/100期同时评分，寻找跨周期最低头'},
  {id:'h4', name:'方案4', model:'momentum', label:'冷势动量', desc:'比较近10期与近30/50期，排除近期持续走弱头'},
  {id:'h5', name:'方案5', model:'transition1', label:'一阶转移', desc:'根据上一期开奖头，统计历史上下一期最少出现的头'},
  {id:'h6', name:'方案6', model:'transition2', label:'二阶转移', desc:'结合最近2期头数状态；样本不足时自动回退稳健模型'},
  {id:'h7', name:'方案7', model:'gap', label:'遗漏校准', desc:'频率 + 当前遗漏，但对超长遗漏做收缩，不追“必回补”'},
  {id:'h8', name:'方案8', model:'stability', label:'低波动稳定', desc:'寻找多个窗口都偏低的头，降低单一窗口偶然性'},
  {id:'h9', name:'方案9', model:'validation', label:'滚动验证', desc:'从基础模型中选最近历史滚动回测表现更稳的排除头'},
  {id:'h10', name:'方案10', model:'ensemble', label:'多模型共识', desc:'综合前9套模型投票与置信权重，给最终4头'},
]

function getHead(n){
  const v = Number(n)
  return v >= 1 && v <= 49 ? Math.floor(v / 10) : -1
}

function normalizeHeadProb(scores){
  const safe = scores.map((v,h)=>Math.max(0.0001, Number(v || 0)))
  const total = safe.reduce((a,b)=>a+b,0) || 1
  return safe.map(v=>v/total)
}

function headCounts(history, size){
  const src = history.slice(0, size)
  const counts = [0,0,0,0,0]
  for(const d of src){
    const h = getHead(d.specialNumber)
    if(h >= 0) counts[h]++
  }
  return {src, counts}
}

function empiricalProb(history, size, priorStrength = 12){
  const {src, counts} = headCounts(history, size)
  const n = src.length
  return counts.map((c,h)=>
    (c + priorStrength * HEAD_PRIOR[h]) / Math.max(1, n + priorStrength)
  )
}

function weightedRecentProb(history, decay = 0.92, priorStrength = 8){
  const score = [0,0,0,0,0]
  let totalWeight = 0

  history.slice(0,60).forEach((d,i)=>{
    const h = getHead(d.specialNumber)
    if(h < 0) return
    const w = Math.pow(decay, i)
    score[h] += w
    totalWeight += w
  })

  return normalizeHeadProb(score.map((v,h)=>v + priorStrength * HEAD_PRIOR[h]))
}

function multiWindowProb(history){
  const windows = [
    [10,.18],
    [20,.24],
    [30,.22],
    [50,.20],
    [100,.16],
  ]
  const total = [0,0,0,0,0]

  windows.forEach(([size,w])=>{
    const p = empiricalProb(history,size,10)
    p.forEach((v,h)=>{ total[h] += v*w })
  })

  return normalizeHeadProb(total)
}

function momentumProb(history){
  const p10 = empiricalProb(history,10,8)
  const p30 = empiricalProb(history,30,12)
  const p50 = empiricalProb(history,50,16)

  return normalizeHeadProb(p10.map((_,h)=>{
    const momentum = p10[h] - p30[h]
    return p30[h]*.45 + p50[h]*.30 + p10[h]*.25 + momentum*.18
  }))
}

function transitionProb(history, order = 1){
  if(history.length < 25) return empiricalProb(history,50,16)

  const heads = history.map(d=>getHead(d.specialNumber)).filter(h=>h>=0)
  if(heads.length < 20) return empiricalProb(history,50,16)

  // history 是最新在前。为了按时间正序统计转移，先反转。
  const chronological = [...heads].reverse()
  const currentState = heads.slice(0,order).reverse()
  const counts = [0,0,0,0,0]
  let matches = 0

  for(let i=order;i<chronological.length;i++){
    const prev = chronological.slice(i-order,i)
    let same = true
    for(let j=0;j<order;j++){
      if(prev[j] !== currentState[j]) { same=false; break }
    }
    if(!same) continue

    const next = chronological[i]
    if(next >= 0){
      counts[next]++
      matches++
    }
  }

  // 二阶样本很容易过少：自动回退一阶/贝叶斯。
  if(matches < (order === 2 ? 5 : 8)){
    return order === 2 ? transitionProb(history,1) : empiricalProb(history,50,16)
  }

  const priorStrength = order === 2 ? 10 : 8
  return normalizeHeadProb(counts.map((c,h)=>c + priorStrength*HEAD_PRIOR[h]))
}

function gapAdjustedProb(history){
  const base = multiWindowProb(history)
  const omit = [history.length,history.length,history.length,history.length,history.length]

  history.forEach((d,i)=>{
    const h=getHead(d.specialNumber)
    if(h>=0 && omit[h]===history.length) omit[h]=i
  })

  // 不使用“越久没出越该出”的赌徒谬误。
  // 只对极端遗漏做非常轻微回归均值调整，主要信号仍来自频率。
  return normalizeHeadProb(base.map((p,h)=>{
    const gap = Math.min(15, omit[h])
    const meanReversion = (HEAD_PRIOR[h] - p) * Math.min(.18, gap*.012)
    return p + meanReversion
  }))
}

function stabilityProb(history){
  const windows=[20,30,50,100]
  const ps=windows.map(w=>empiricalProb(history,w,12))
  return normalizeHeadProb([0,1,2,3,4].map(h=>{
    const vals=ps.map(p=>p[h])
    const avg=vals.reduce((a,b)=>a+b,0)/vals.length
    const variance=vals.reduce((s,v)=>s+(v-avg)**2,0)/vals.length
    // 对波动大的估计向理论概率收缩
    const shrink=Math.min(.45, Math.sqrt(variance)*5)
    return avg*(1-shrink)+HEAD_PRIOR[h]*shrink
  }))
}

function picksFromProb(prob){
  let exclude = 0
  for(let h=1;h<5;h++){
    if(prob[h] < prob[exclude]) exclude = h
  }
  return {
    exclude,
    picks:[0,1,2,3,4].filter(h=>h!==exclude),
    prob,
    confidence: Math.max(0, Math.min(1,
      (Math.min(...prob.filter((_,h)=>h!==exclude)) - prob[exclude]) * 5
    )),
  }
}

function baseModelResult(history, model){
  if(model==='bayes'){
    const p20=empiricalProb(history,20,14)
    const p50=empiricalProb(history,50,18)
    const p100=empiricalProb(history,100,24)
    return picksFromProb(normalizeHeadProb(p20.map((_,h)=>p20[h]*.40+p50[h]*.35+p100[h]*.25)))
  }
  if(model==='ewma') return picksFromProb(weightedRecentProb(history,.93,10))
  if(model==='multi') return picksFromProb(multiWindowProb(history))
  if(model==='momentum') return picksFromProb(momentumProb(history))
  if(model==='transition1') return picksFromProb(transitionProb(history,1))
  if(model==='transition2') return picksFromProb(transitionProb(history,2))
  if(model==='gap') return picksFromProb(gapAdjustedProb(history))
  if(model==='stability') return picksFromProb(stabilityProb(history))
  return picksFromProb(empiricalProb(history,50,16))
}

function quickModelHitRate(history, model, size=40){
  let hit=0,tested=0
  for(let i=0;i<Math.min(size,history.length);i++){
    const past=history.slice(i+1)
    if(past.length<20) continue
    const result=baseModelResult(past,model)
    const actual=getHead(history[i].specialNumber)
    if(actual<0) continue
    tested++
    if(result.picks.includes(actual)) hit++
  }
  return tested ? hit/tested : 0
}

function validationResult(history){
  const candidates=['bayes','ewma','multi','momentum','transition1','gap','stability']
  const ranked=candidates
    .map(model=>({model,rate:quickModelHitRate(history,model,40)}))
    .sort((a,b)=>b.rate-a.rate)

  return baseModelResult(history, ranked[0]?.model || 'bayes')
}

function allHeadResults(history){
  const results=[]

  for(const f of HEAD_FORMULAS){
    if(f.model==='validation'){
      results.push(validationResult(history))
      continue
    }

    if(f.model==='ensemble'){
      // 综合前9套：被更多模型判定为“应排除”的头，排除票更高。
      const vote=[0,0,0,0,0]
      results.forEach((r)=>{
        vote[r.exclude] += 1 + (r.confidence || 0)
      })

      // 理论上0头只有9个号码，若票数接近，优先排除0头。
      vote[0] += .12

      let exclude=0
      for(let h=1;h<5;h++){
        if(vote[h] > vote[exclude]) exclude=h
      }

      const pseudoProb=normalizeHeadProb(
        vote.map((v,h)=>1/Math.max(.15, v+.3) + HEAD_PRIOR[h]*.15)
      )

      results.push({
        exclude,
        picks:[0,1,2,3,4].filter(h=>h!==exclude),
        prob:pseudoProb,
        confidence: Math.min(1, (vote[exclude]-[...vote].sort((a,b)=>b-a)[1])*.25),
      })
      continue
    }

    results.push(baseModelResult(history,f.model))
  }

  return results
}

function backtestHead(history, formulaIndex, size){
  const rows=[]
  const limit=Math.min(size,history.length)

  for(let i=0;i<limit;i++){
    const past=history.slice(i+1)
    if(past.length<20) continue

    const results=allHeadResults(past)
    const result=results[formulaIndex]
    const actual=getHead(history[i].specialNumber)

    if(actual<0) continue

    rows.push({
      expect:history[i].expect,
      actual,
      exclude:result.exclude,
      picks:result.picks,
      hit:result.picks.includes(actual),
    })
  }

  const rs=rows.map(x=>x.hit)
  const hitCount=rows.filter(x=>x.hit).length

  return {
    rows,
    testedCount:rows.length,
    hitCount,
    hitRate:rows.length ? hitCount/rows.length*100 : 0,
    maxMiss:maxMiss(rs),
    currentMiss:currentMiss(rs),
  }
}

function buildHeadRanking(history){
  const current=allHeadResults(history)

  return HEAD_FORMULAS.map((f,i)=>{
    const r20=backtestHead(history,i,20)
    const r30=backtestHead(history,i,30)
    const r50=backtestHead(history,i,50)
    const r100=backtestHead(history,i,100)

    // 排名优先近期，但要求长样本不能太差；连错会扣分。
    const score=
      r20.hitRate*.38 +
      r30.hitRate*.27 +
      r50.hitRate*.20 +
      r100.hitRate*.15 -
      r20.maxMiss*1.25

    return {
      ...f,
      ...current[i],
      r20,r30,r50,r100,
      score:Number(score.toFixed(2)),
    }
  }).sort((a,b)=>
    b.score-a.score ||
    b.r20.hitRate-a.r20.hitRate ||
    b.r50.hitRate-a.r50.hitRate ||
    a.r20.maxMiss-b.r20.maxMiss
  )
}

function headConsensus(ranking){
  // 不是简单数“4头出现次数”，直接统计每套公式想排除哪个头。
  const excludeVotes=[0,0,0,0,0]

  ranking.forEach((s,i)=>{
    const rankWeight=10-i
    excludeVotes[s.exclude] += rankWeight * (1 + (s.confidence||0)*.35)
  })

  // 0头只覆盖9个号码，长期理论概率稍低，因此平票时略优先排除0头。
  excludeVotes[0] += .5

  let exclude=0
  for(let h=1;h<5;h++){
    if(excludeVotes[h] > excludeVotes[exclude]) exclude=h
  }

  return {
    exclude,
    picks:[0,1,2,3,4].filter(h=>h!==exclude),
    votes:excludeVotes,
  }
}

function H({h}){ return <span className="h">{h}头</span> }

function Z({z}){ return <span className="z">{z}</span> }
function Ball({n,z,special=false}){ return <div className="bw"><span className={special?'ball sp':'ball'}>{String(n).padStart(2,'0')}</span><small>{z||'-'}</small></div> }

export default function Page(){
  const [data,setData]=useState(null)
  const [error,setError]=useState('')
  const [loading,setLoading]=useState(true)
  const [copied,setCopied]=useState(false)
  const [headCopied,setHeadCopied]=useState(false)
  const [tailCopied,setTailCopied]=useState(false)

  async function load(){
    setLoading(true);setError('')
    try{
      const res=await fetch('/api/history',{cache:'no-store'})
      const text=await res.text()
      if(text.trim().startsWith('<')) throw new Error(`/api/history 返回网页而不是JSON（HTTP ${res.status}）`)
      const j=JSON.parse(text)
      if(!res.ok||!j.ok) throw new Error(j.message||`HTTP ${res.status}`)
      setData(j)
    }catch(e){setError(e.message||'加载失败')}finally{setLoading(false)}
  }

  useEffect(()=>{load();const t=setInterval(load,30000);return()=>clearInterval(t)},[])
  const history=data?.history||[]
  const ranking=useMemo(()=>buildRanking(history),[history])
  const con=useMemo(()=>consensus(ranking),[ranking])
  const hRanking=useMemo(()=>buildHeadRanking(history),[history])
  const hCon=useMemo(()=>headConsensus(hRanking),[hRanking])
  const tRanking=useMemo(()=>buildTailRanking(history),[history])
  const tCon=useMemo(()=>tailConsensus(tRanking),[tRanking])
  const latest=data?.latest

  async function copy(){
    const txt=`第${data?.nextExpect||'-'}期综合9生肖：${con.picks.join(' ')}`
    try{await navigator.clipboard.writeText(txt);setCopied(true);setTimeout(()=>setCopied(false),1200)}catch{alert(txt)}
  }

  async function copyHeads(){
    const txt=`第${data?.nextExpect||'-'}期综合4头：${hCon.picks.map(h=>`${h}头`).join(' ')}｜排除：${hCon.exclude}头`
    try{await navigator.clipboard.writeText(txt);setHeadCopied(true);setTimeout(()=>setHeadCopied(false),1200)}catch{alert(txt)}
  }

  async function copyTails(){
    const txt=`第${data?.nextExpect||'-'}期综合8尾：${tCon.picks.map(t=>`${t}尾`).join(' ')}｜排除：${tCon.exclude.map(t=>`${t}尾`).join(' ')}`
    try{await navigator.clipboard.writeText(txt);setTailCopied(true);setTimeout(()=>setTailCopied(false),1200)}catch{alert(txt)}
  }

  return <main className="page">
    <style jsx global>{`
      *{box-sizing:border-box}body{margin:0;background:#07111f;color:#e6eef8;font-family:Arial,'Microsoft YaHei',sans-serif}
      .page{min-height:100vh;padding:22px;background:radial-gradient(circle at top,#17365e,#07111f 48%,#050914)}
      .wrap{max-width:1450px;margin:auto}.card{background:#0e1c31;border:1px solid #263a55;border-radius:16px;padding:18px;margin-bottom:18px}
      h1,h2{margin:0 0 10px}.muted,.sub{color:#9db1ca}.hero{display:grid;grid-template-columns:1.25fr .75fr;gap:16px}
      .cons{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-top:16px;padding:14px;border-radius:13px;background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.25)}
      .zlist,.hlist,.tlist{display:flex;flex-wrap:wrap;gap:6px}.z{display:inline-flex;min-width:34px;height:31px;padding:0 8px;align-items:center;justify-content:center;border-radius:9px;background:#22c55e;color:#052e16;border:1px solid #86efac;font-weight:900}.h{display:inline-flex;min-width:48px;height:31px;padding:0 8px;align-items:center;justify-content:center;border-radius:9px;background:#38bdf8;color:#082f49;border:1px solid #7dd3fc;font-weight:900}.t{display:inline-flex;min-width:46px;height:31px;padding:0 8px;align-items:center;justify-content:center;border-radius:9px;background:#a78bfa;color:#2e1065;border:1px solid #c4b5fd;font-weight:900}
      button{border:0;border-radius:10px;background:#38bdf8;color:#062238;font-weight:900;padding:10px 14px;cursor:pointer}.copy{background:linear-gradient(145deg,#fde047,#f97316)}
      .balls{display:flex;gap:7px;flex-wrap:wrap;align-items:flex-start}.bw{text-align:center}.ball{width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#e2e8f0;color:#0f172a;font-weight:900}.sp{background:linear-gradient(145deg,#fde047,#f97316)}.bw small{display:block;margin-top:4px}
      .toolbar{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:16px 0}.error{padding:13px;background:rgba(239,68,68,.14);border:1px solid #7f1d1d;border-radius:10px;color:#fecaca}
      .scroll{overflow:auto}table{width:100%;border-collapse:collapse;min-width:1180px}th,td{padding:10px;border-bottom:1px solid #26364d;text-align:left;font-size:13px}th{background:#08172a;color:#9db1ca}
      .rank{font-size:18px;font-weight:900}.rate{font-size:18px;font-weight:900}.good{color:#4ade80}.mid{color:#fde047}.low{color:#fb7185}.formula{color:#93c5fd}.dots{display:grid;grid-template-columns:repeat(10,18px);gap:3px;min-width:210px}.dot{width:18px;height:18px;border-radius:5px;background:#ef4444}.hit{background:#22c55e}
      .note{padding:14px;border-radius:12px;background:rgba(56,189,248,.08);border:1px solid rgba(56,189,248,.25);line-height:1.7}.history{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.draw{padding:10px;border-radius:10px;background:#091629}.draw strong{display:block}
      @media(max-width:900px){.page{padding:10px}.hero,.history{display:block}.card{padding:13px}.cons{display:block}.cons button{margin-top:12px}.draw{margin-bottom:8px}}
    `}</style>

    <div className="wrap">
      <div className="hero">
        <section className="card">
          <h1>新澳门六合彩｜9生肖优化预测系统</h1>
          <p className="sub">10套独立公式全部采用逐期滚动回测。重点修复繁体生肖「馬/龍/雞/豬」与简体「马/龙/鸡/猪」不一致造成的假性未中。</p>
          <div className="cons">
            <div>
              <div className="muted">下一期综合9生肖｜第 {data?.nextExpect||'-'} 期</div>
              <div className="zlist" style={{marginTop:10}}>{con.picks.map(z=><Z key={z} z={z}/>)}</div>
            </div>
            <button className="copy" onClick={copy}>{copied?'已复制':'复制综合9生肖'}</button>
          </div>
        </section>

        <section className="card">
          <h2>最新开奖</h2>
          {latest?<>
            <div className="muted">第 {latest.expect} 期｜{latest.openTime}</div>
            <div className="balls" style={{marginTop:12}}>
              {latest.numbers.slice(0,6).map((n,i)=><Ball key={i} n={n} z={latest.zodiac?.[i]}/>)}
              <span style={{fontSize:24,paddingTop:8}}>+</span>
              <Ball n={latest.specialNumber} z={latest.specialZodiac} special/>
            </div>
            <p><strong>特码生肖：</strong>{latest.specialZodiac||'-'}</p>
          </>:<p className="muted">等待加载...</p>}
        </section>
      </div>

      <div className="toolbar">
        <button onClick={load}>{loading?'刷新中...':'刷新数据'}</button>
        <span className="muted">数据源：{data?.source||'macaujc.com'}｜最近 {data?.historyCount||0}/100期｜每30秒刷新</span>
      </div>
      {error&&<div className="error">{error}</div>}

      <section className="card">
        <h2>10个优化9生肖公式｜自动按真实滚动回测排名</h2>
        <p className="sub">每套固定选9肖。不是简单“9热/8热+1冷”，而是把不同时间窗口、近期权重、遗漏、动量、稳定性组合成不同模型，再按20/30/50/100期表现动态排序。</p>
        <div className="scroll"><table>
          <thead><tr><th>排名</th><th>公式</th><th>逻辑</th><th>下期9生肖</th><th>近20</th><th>近30</th><th>近50</th><th>近100</th><th>最大连错</th><th>最近20期走势</th></tr></thead>
          <tbody>{ranking.map((s,i)=><tr key={s.id}>
            <td className="rank">{i+1}</td>
            <td><strong>{s.name}</strong></td>
            <td className="formula">{s.desc}</td>
            <td><div className="zlist">{s.picks.map(z=><Z key={z} z={z}/>)}</div></td>
            <td><span className={s.r20.hitRate>=75?'rate good':s.r20.hitRate>=65?'rate mid':'rate low'}>{pct(s.r20.hitRate)}</span><div className="muted">{s.r20.hitCount}/{s.r20.testedCount}</div></td>
            <td><span className="rate">{pct(s.r30.hitRate)}</span><div className="muted">{s.r30.hitCount}/{s.r30.testedCount}</div></td>
            <td><span className="rate">{pct(s.r50.hitRate)}</span><div className="muted">{s.r50.hitCount}/{s.r50.testedCount}</div></td>
            <td><span className="rate">{pct(s.r100.hitRate)}</span><div className="muted">{s.r100.hitCount}/{s.r100.testedCount}</div></td>
            <td>{s.r50.maxMiss}<div className="muted">当前 {s.r20.currentMiss}</div></td>
            <td><div className="dots">{s.r20.rows.slice().reverse().map(r=><span key={r.expect} className={r.hit?'dot hit':'dot'} title={`第${r.expect}期｜${r.actual}｜${r.hit?'中':'未中'}`}/>)}</div></td>
          </tr>)}</tbody>
        </table></div>
      </section>

      <section className="card">
        <div className="cons" style={{marginTop:0,marginBottom:14}}>
          <div>
            <h2 style={{marginBottom:8}}>尾数预测｜10个优化方案</h2>
            <div className="muted">
              下一期综合8尾｜第 {data?.nextExpect||'-'} 期｜
              综合排除 <strong style={{color:'#fb7185'}}>{tCon.exclude.map(t=>`${t}尾`).join('、')}</strong>
            </div>
            <div className="tlist" style={{marginTop:10}}>
              {tCon.picks.map(t=><T key={t} t={t}/>)}
            </div>
          </div>
          <button className="copy" onClick={copyTails}>{tailCopied?'已复制':'复制综合8尾'}</button>
        </div>

        <p className="sub">
          8尾 = 从0–9十个尾数里排除2个尾。系统按最近100期实际特码尾数动态计算，
          不再使用写死的固定8尾。尾0在1–49中只有4个号码，尾1–9各有5个号码，
          所以模型会把真实基础概率一起纳入。
        </p>

        <div className="scroll"><table>
          <thead><tr>
            <th>排名</th><th>方案</th><th>模型逻辑</th><th>下期8尾</th><th>排除2尾</th>
            <th>近20</th><th>近30</th><th>近50</th><th>近100</th><th>最大连错</th><th>最近20期走势</th>
          </tr></thead>
          <tbody>{tRanking.map((s,i)=><tr key={s.id}>
            <td className="rank">{i+1}</td>
            <td><strong>{s.name}</strong></td>
            <td className="formula"><strong>{s.label}</strong><div className="muted">{s.desc}</div></td>
            <td><div className="tlist">{s.picks.map(t=><T key={t} t={t}/>)}</div></td>
            <td><strong style={{color:'#fb7185'}}>{s.exclude.map(t=>`${t}尾`).join('、')}</strong><div className="muted">置信差 {((s.confidence||0)*100).toFixed(1)}%</div></td>
            <td><span className={s.r20.hitRate>=82?'rate good':s.r20.hitRate>=76?'rate mid':'rate low'}>{pct(s.r20.hitRate)}</span><div className="muted">{s.r20.hitCount}/{s.r20.testedCount}</div></td>
            <td><span className="rate">{pct(s.r30.hitRate)}</span><div className="muted">{s.r30.hitCount}/{s.r30.testedCount}</div></td>
            <td><span className="rate">{pct(s.r50.hitRate)}</span><div className="muted">{s.r50.hitCount}/{s.r50.testedCount}</div></td>
            <td><span className="rate">{pct(s.r100.hitRate)}</span><div className="muted">{s.r100.hitCount}/{s.r100.testedCount}</div></td>
            <td>{s.r50.maxMiss}<div className="muted">当前 {s.r20.currentMiss}</div></td>
            <td><div className="dots">{s.r20.rows.slice().reverse().map(r=><span key={r.expect} className={r.hit?'dot hit':'dot'} title={`第${r.expect}期｜${r.actual}尾｜${r.hit?'中':'未中'}`}/>)}</div></td>
          </tr>)}</tbody>
        </table></div>
      </section>

      <section className="card">
        <h2>尾数优化说明</h2>
        <div className="note">
          10套模型分别使用：贝叶斯稳健、近期指数、多周期共识、动量趋势、一阶转移、二阶转移、
          遗漏校准、低波动稳定、滚动验证、多模型共识。
          每套都是“先估计10个尾的相对概率，再排除最低2尾”，并用20/30/50/100期逐期滚动回测排名。
        </div>
      </section>

      <section className="card">
        <div className="cons" style={{marginTop:0,marginBottom:14}}>
          <div>
            <h2 style={{marginBottom:8}}>头数预测｜10个优选方案</h2>
            <div className="muted">下一期综合4头｜第 {data?.nextExpect||'-'} 期｜综合排除 <strong style={{color:'#fb7185'}}>{hCon.exclude}头</strong></div>
            <div className="hlist" style={{marginTop:10}}>{hCon.picks.map(h=><H key={h} h={h}/>)}</div>
          </div>
          <button className="copy" onClick={copyHeads}>{headCopied?'已复制':'复制综合4头'}</button>
        </div>

        <p className="sub">优化逻辑：不再简单用“4热/3热+1冷”。每套模型先估计下一期 0–4头的相对概率，再排除概率最低的1个头，保留另外4头。特别考虑0头只有01–09共9个号码，而1–4头各有10个号码，避免把五个头错误当成完全等概率。</p>

        <div className="scroll"><table>
          <thead><tr><th>排名</th><th>方案</th><th>模型逻辑</th><th>下期4头</th><th>排除头</th><th>近20</th><th>近30</th><th>近50</th><th>近100</th><th>最大连错</th><th>最近20期走势</th></tr></thead>
          <tbody>{hRanking.map((s,i)=><tr key={s.id}>
            <td className="rank">{i+1}</td>
            <td><strong>{s.name}</strong></td>
            <td className="formula"><strong>{s.label}</strong><div className="muted">{s.desc}</div></td>
            <td><div className="hlist">{s.picks.map(h=><H key={h} h={h}/>)}</div></td>
            <td><strong style={{color:'#fb7185'}}>{s.exclude}头</strong><div className="muted">置信差 {((s.confidence||0)*100).toFixed(1)}%</div></td>
            <td><span className={s.r20.hitRate>=82?'rate good':s.r20.hitRate>=78?'rate mid':'rate low'}>{pct(s.r20.hitRate)}</span><div className="muted">{s.r20.hitCount}/{s.r20.testedCount}</div></td>
            <td><span className="rate">{pct(s.r30.hitRate)}</span><div className="muted">{s.r30.hitCount}/{s.r30.testedCount}</div></td>
            <td><span className="rate">{pct(s.r50.hitRate)}</span><div className="muted">{s.r50.hitCount}/{s.r50.testedCount}</div></td>
            <td><span className="rate">{pct(s.r100.hitRate)}</span><div className="muted">{s.r100.hitCount}/{s.r100.testedCount}</div></td>
            <td>{s.r50.maxMiss}<div className="muted">当前 {s.r20.currentMiss}</div></td>
            <td><div className="dots">{s.r20.rows.slice().reverse().map(r=><span key={r.expect} className={r.hit?'dot hit':'dot'} title={`第${r.expect}期｜${r.actual}头｜${r.hit?'中':'未中'}`}/>)}</div></td>
          </tr>)}</tbody>
        </table></div>
      </section>

      <section className="card">
        <h2>头数优化说明</h2>
        <div className="note">
          <strong>核心改变：</strong>4头方案本质上等于“从0–4头里排除1个头”。因此新版10套模型都直接预测“下一期最应该排除哪个头”，而不是把4个头独立选出来。
          其中0头只有01–09共9个号码，理论基础概率是9/49；其余1–4头各有10个号码，理论基础概率各为10/49。
          模型会用最近100期做贝叶斯收缩、指数近期权重、多周期共识、动量、历史转移、遗漏校准、稳定性和滚动验证，再动态排名。
          这比单纯“热头/冷头”更不容易被短期噪声带偏。
        </div>
      </section>

      <section className="card">
        <h2>为什么旧版会出现50%左右</h2>
        <div className="note">
          macaujc.com 的 API 示例生肖使用繁体字，例如「馬、龍、雞、豬」。旧版预测列表使用「马、龙、鸡、猪」。
          JavaScript 字符串比较时它们并不相等，因此实际开出这些生肖时，即使方案视觉上看起来包含，也会被程序判成“未中”。
          本版在 API 层统一转换后再统计，所以回测才是正确的。
        </div>
      </section>

      <section className="card">
        <h2>最近100期特码生肖</h2>
        <div className="history">{history.map(d=><div className="draw" key={d.expect}>
          <strong>第 {d.expect} 期</strong>
          <span className="muted">{d.openTime}</span>
          <div style={{marginTop:5}}>{String(d.specialNumber).padStart(2,'0')}｜<b>{d.specialZodiac||'-'}</b></div>
        </div>)}</div>
      </section>

      <section className="card">
        <p className="sub">说明：9生肖覆盖12生肖中的9个；头数覆盖5个头中的4个；尾数覆盖10个尾中的8个。所有历史命中率都采用逐期滚动回测，仅用于比较历史表现，不保证未来结果。</p>
      </section>
    </div>
  </main>
}
