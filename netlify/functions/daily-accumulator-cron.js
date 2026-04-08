// netlify/functions/daily-accumulator-cron.js
// Scheduled: runs at 08:00 UTC daily
// [functions."daily-accumulator-cron"]
// schedule = "0 8 * * *"

const { createClient } = require('@supabase/supabase-js')

const API_KEY    = process.env.API_FOOTBALL_KEY
const API_BASE   = 'https://v3.football.api-sports.io'
const SB_URL     = process.env.SUPABASE_URL
const SB_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY
const TARGET_MIN = 1.80, TARGET_MAX = 2.00
const ODDS_MIN   = 1.15, ODDS_MAX   = 1.70, PROB_MIN = 0.55
const LEAGUE_IDS = new Set([39,140,78,135,61,2,3,197,529,94])
const MARKET_LABELS = {
  'Match Winner':'1X2 (Match Result)','Double Chance':'Double Chance',
  'Goals Over/Under':'Over/Under','Both Teams Score':'Both Teams To Score',
  'Draw No Bet':'Draw No Bet',
}

function todayISO() { return new Date().toISOString().slice(0,10) }
function db() { return createClient(SB_URL, SB_KEY) }

async function apiFetch(path) {
  const res = await fetch(`${API_BASE}${path}`,{headers:{'x-apisports-key':API_KEY}})
  if (!res.ok) throw new Error(`API HTTP ${res.status}`)
  const d = await res.json()
  if (d.errors && Object.keys(d.errors).length) throw new Error(Object.values(d.errors).join(', '))
  return d.response||[]
}

async function run() {
  const today = todayISO()
  const { data: ex } = await db().from('daily_accumulators').select('id').eq('date',today).maybeSingle()
  if (ex) { console.log('[Cron] Already exists'); return }

  const tomorrow = new Date(Date.now()+86400000).toISOString().slice(0,10)
  let raw = await apiFetch(`/fixtures?date=${today}&timezone=UTC`)
  if (!raw.length) raw = await apiFetch(`/fixtures?date=${tomorrow}&timezone=UTC`)
  const fixtures = raw.filter(f=>LEAGUE_IDS.has(f.league?.id)&&f.fixture?.status?.short==='NS')
    .map(f=>({id:f.fixture.id,home:f.teams.home.name,away:f.teams.away.name,league:f.league.name}))

  if (!fixtures.length) throw new Error('No fixtures')

  const candidates = []
  for (const fix of fixtures.slice(0,10)) {
    let data; try { data = await apiFetch(`/odds?fixture=${fix.id}&bookmaker=8`) } catch { continue }
    if (!data.length) continue
    const bm = data[0]?.bookmakers?.[0]; if (!bm) continue
    const ml = `${fix.home} vs ${fix.away}`
    for (const bet of (bm.bets||[])) {
      const mkt = MARKET_LABELS[bet.name]||bet.name
      for (const val of (bet.values||[])) {
        const odds=parseFloat(val.odd); if(isNaN(odds)||odds<ODDS_MIN||odds>ODDS_MAX) continue
        const prob=parseFloat((1/odds).toFixed(4)); if(prob<PROB_MIN) continue
        candidates.push({matchId:fix.id,match:ml,league:fix.league,market:mkt,pick:val.value,odds,prob})
      }
    }
  }

  const deduped = Object.values(candidates.reduce((acc,c)=>{
    const k=`${c.matchId}::${c.market}`
    if(!acc[k]||c.prob>acc[k].prob) acc[k]=c; return acc
  },{}))

  if (deduped.length<2) throw new Error(`Only ${deduped.length} picks`)

  const pool=[...deduped].sort((a,b)=>b.prob-a.prob).slice(0,40)
  const co=picks=>parseFloat(picks.reduce((a,p)=>a*p.odds,1).toFixed(3))
  const valid=picks=>new Set(picks.map(p=>p.matchId)).size===picks.length
  let result=null
  outer: for(let i=0;i<pool.length-2;i++) for(let j=i+1;j<pool.length-1;j++) {
    if(pool[i].odds*pool[j].odds>TARGET_MAX) continue
    for(let k=j+1;k<pool.length;k++){
      const t=[pool[i],pool[j],pool[k]]; if(!valid(t)) continue
      const tot=co(t); if(tot>=TARGET_MIN&&tot<=TARGET_MAX){result={selections:t,total_odds:tot};break outer}
    }
  }
  if(!result) for(let i=0;i<pool.length-1;i++) for(let j=i+1;j<pool.length;j++){
    const t=[pool[i],pool[j]]; if(!valid(t)) continue
    const tot=co(t); if(tot>=TARGET_MIN&&tot<=TARGET_MAX){result={selections:t,total_odds:tot};break}
  }
  if(!result) throw new Error('No valid combo found')

  const avgProb=result.selections.reduce((a,b)=>a+b.prob,0)/result.selections.length
  const confidence=Math.min(85,Math.max(70,Math.round(avgProb*100)))
  const cleanSels=result.selections.map(({matchId,prob,...s})=>({...s,fixture_id:matchId,probability:prob}))
  const analysis=`${result.selections.length}-fold accumulator. Avg probability: ${(avgProb*100).toFixed(0)}%. Odds: ${result.total_odds.toFixed(2)}. Confidence: ${confidence}/100.`

  const {data:saved,error}=await db().from('daily_accumulators')
    .insert({date:today,selections:cleanSels,total_odds:result.total_odds,confidence,analysis,status:'pending'})
    .select().single()
  if(error) throw new Error(error.message)
  console.log(`[Cron] ✅ Saved ${saved.id}`)
}

exports.handler = async () => {
  try { await run(); return { statusCode: 200 } }
  catch (err) { console.error('[Cron] ❌', err.message); return { statusCode: 500 } }
}
