// netlify/functions/daily-accumulator-generate.js
// POST /.netlify/functions/daily-accumulator-generate
// Self-contained — no relative requires (esbuild compatibility)

const { createClient } = require('@supabase/supabase-js')

const ALLOWED_ORIGIN = process.env.SITE_URL || '*'
const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (status, body) => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json', ...CORS },
  body: JSON.stringify(body),
})

// ── Config ────────────────────────────────────────────────────────
const API_KEY    = process.env.API_FOOTBALL_KEY
const ODDS_KEY   = process.env.THE_ODDS_API_KEY || process.env.ODDS_API_KEY
console.log('[Env] THE_ODDS_API_KEY:', !!process.env.THE_ODDS_API_KEY, '| API_FOOTBALL_KEY:', !!process.env.API_FOOTBALL_KEY)
const API_BASE   = 'https://v3.football.api-sports.io'
const SB_URL     = process.env.SUPABASE_URL
const SB_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY
const TARGET_MIN = 1.70
const TARGET_MAX = 2.00
const ODDS_MIN   = 1.15
const ODDS_MAX   = 1.85
const PROB_MIN   = 0.50
// Expanded leagues: PL, La Liga, Bundesliga, Serie A, Ligue 1, UCL, UEL, UECL,
// Eredivisie, Primeira Liga, Championship, Scottish Prem, Turkish SL,
// Belgian Pro, Greek SL, Russian PL, Brazilian Serie A, Argentine Primera,
// MLS, Saudi Pro, Egyptian Premier, South African PSL, Nigerian NPFL,
// Kenyan Premier, CAF Champions League, AFCON, FIFA WC Qualifiers (Africa)
const LEAGUE_IDS = new Set([
  39,140,78,135,61,2,3,848,
  88,94,40,179,203,144,197,235,
  71,128,253,307,233,288,332,
  363,12,10,29
])

const MARKET_LABELS = {
  'Match Winner':       '1X2 (Match Result)',
  'Double Chance':      'Double Chance',
  'Goals Over/Under':   'Over/Under',
  'Both Teams Score':   'Both Teams To Score',
  'Draw No Bet':        'Draw No Bet',
  'Asian Handicap':     'Asian Handicap',
  'First Half Winner':  'Half-Time Result',
}

function todayISO() { return new Date().toISOString().slice(0, 10) }
function db() { return createClient(SB_URL, SB_KEY) }

async function apiFetch(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'x-apisports-key': API_KEY }
  })
  const remaining = res.headers.get('x-ratelimit-requests-remaining')
  console.log(`[API] ${path.split('?')[0]} | remaining: ${remaining}`)
  if (res.status === 499) throw new Error('Invalid API_FOOTBALL_KEY')
  if (!res.ok) throw new Error(`API-Football HTTP ${res.status}`)
  const data = await res.json()
  if (data.errors && Object.keys(data.errors).length > 0)
    throw new Error(Object.values(data.errors).join(', '))
  return data.response || []
}

async function fetchFixtures() {
  const dates = [0, 1, 2].map(d => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10))
  let raw = []
  for (const date of dates) {
    const fetched = await apiFetch(`/fixtures?date=${date}&timezone=UTC`)
    const filtered = fetched.filter(f => LEAGUE_IDS.has(f.league?.id) && f.fixture?.status?.short === 'NS')
    if (filtered.length >= 3) { raw = filtered; break }
    raw = [...raw, ...filtered]
  }
  // Fallback: if still empty, use any NS fixtures from today regardless of league
  if (!raw.length) {
    const today = todayISO()
    const all = await apiFetch(`/fixtures?date=${today}&timezone=UTC`)
    raw = all.filter(f => f.fixture?.status?.short === 'NS')
    console.log(`[Acca] Fallback: using all leagues, ${raw.length} fixtures`)
  }
  return raw.map(f => ({
    id:     f.fixture.id,
    home:   f.teams.home.name,
    away:   f.teams.away.name,
    league: f.league.name,
  }))
}

async function fetchOdds(fixtures) {
  const candidates = []
  for (const fix of fixtures.slice(0, 10)) {
    let data
    try { data = await apiFetch(`/odds?fixture=${fix.id}&bookmaker=8`) }
    catch { continue }
    if (!data.length) continue
    const bm = data[0]?.bookmakers?.[0]
    if (!bm) continue
    const matchLabel = `${fix.home} vs ${fix.away}`
    const EXCL = new Set(['Asian Handicap', 'Asian Handicap First Half', 'Asian Handicap Second Half'])
    for (const bet of (bm.bets || [])) {
      if (EXCL.has(bet.name)) continue
      const market = MARKET_LABELS[bet.name] || bet.name
      for (const val of (bet.values || [])) {
        const odds = parseFloat(val.odd)
        if (isNaN(odds) || odds < ODDS_MIN || odds > ODDS_MAX) continue
        const prob = parseFloat((1 / odds).toFixed(4))
        if (prob < PROB_MIN) continue
        candidates.push({ matchId: fix.id, match: matchLabel, league: fix.league, market, pick: val.value, odds, prob })
      }
    }
    // Derive Double Chance from h2h
    const h2h = bm.bets?.find(b => b.name === 'Match Winner')
    if (h2h?.values?.length === 3) {
      const [o1, o2, o3] = h2h.values
      const p1 = 1/parseFloat(o1.odd), p2 = 1/parseFloat(o2.odd), p3 = 1/parseFloat(o3.odd)
      for (const { label, p } of [
        { label: `${o1.value} or Draw`, p: p1+p2 },
        { label: `${o3.value} or Draw`, p: p3+p2 },
        { label: `${o1.value} or ${o3.value}`, p: p1+p3 },
      ]) {
        const dcOdds = parseFloat((1/Math.min(p, 0.99)).toFixed(3))
        if (dcOdds < ODDS_MIN || dcOdds > ODDS_MAX) continue
        const dcProb = parseFloat((1/dcOdds).toFixed(4))
        if (dcProb < PROB_MIN) continue
        candidates.push({ matchId: fix.id, match: matchLabel, league: fix.league, market: 'Double Chance', pick: label, odds: dcOdds, prob: dcProb })
      }
    }
  }
  return candidates
}

function score(c) { return c.prob }

function buildAccu(candidates) {
  const pool = [...candidates].sort((a,b) => score(b)-score(a)).slice(0, 40)
  const co = picks => parseFloat(picks.reduce((a,p) => a*p.odds,1).toFixed(3))
  const valid = picks => {
    if (new Set(picks.map(p=>p.matchId)).size !== picks.length) return false
    if (picks.length===3 && new Set(picks.map(p=>p.market)).size===1) return false
    return true
  }
  // 3-folds
  for (let i=0;i<pool.length-2;i++)
    for (let j=i+1;j<pool.length-1;j++) {
      if (pool[i].odds*pool[j].odds*ODDS_MIN > TARGET_MAX) continue
      for (let k=j+1;k<pool.length;k++) {
        const t=[pool[i],pool[j],pool[k]]
        if (!valid(t)) continue
        const total=co(t)
        if (total>=TARGET_MIN&&total<=TARGET_MAX) return {selections:t,total_odds:total}
      }
    }
  // 2-folds
  for (let i=0;i<pool.length-1;i++)
    for (let j=i+1;j<pool.length;j++) {
      const t=[pool[i],pool[j]]
      if (!valid(t)) continue
      const total=co(t)
      if (total>=TARGET_MIN&&total<=TARGET_MAX) return {selections:t,total_odds:total}
    }
  return null
}

// ── Handler ───────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' })

  // CRON_SECRET check is skipped for frontend-triggered generation.
  // The cron job still works via daily-accumulator-cron.js which handles its own auth.

  try {
    if (!API_KEY) throw new Error('API_FOOTBALL_KEY not set')
    if (!SB_URL || !SB_KEY) throw new Error('Supabase env vars not set')

    const today = todayISO()
    const { data: existing } = await db().from('daily_accumulators').select('id').eq('date', today).maybeSingle()
    if (existing) return json(200, { message: 'Already generated today', id: existing.id })

    const fixtures = await fetchFixtures()
    console.log(`[Acca] ${fixtures.length} fixtures found`)
    if (!fixtures.length) throw new Error('No upcoming fixtures in target leagues today')

    const raw = await fetchOdds(fixtures)
    console.log(`[Acca] ${raw.length} raw candidates`)

    // Dedup: best per matchId+market
    const deduped = Object.values(raw.reduce((acc, c) => {
      const key = `${c.matchId}::${c.market}`
      if (!acc[key] || score(c) > score(acc[key])) acc[key] = c
      return acc
    }, {}))

    if (deduped.length < 2) throw new Error(`Only ${deduped.length} qualifying picks found (need ≥2)`)

    const result = buildAccu(deduped)
    if (!result) throw new Error(`No combo found in ${TARGET_MIN}–${TARGET_MAX}. Top odds: ${deduped.sort((a,b)=>b.odds-a.odds).slice(0,5).map(c=>c.odds.toFixed(2)).join(', ')}`)

    const avgProb    = result.selections.reduce((a,b)=>a+b.prob,0)/result.selections.length
    const confidence = Math.min(85, Math.max(70, Math.round(avgProb*100)))
    const leagues    = [...new Set(result.selections.map(s=>s.league))].join(', ')
    const markets    = [...new Set(result.selections.map(s=>s.market))].join(' & ')
    const analysis   = `This ${result.selections.length}-fold accumulator spans ${leagues}, combining picks across ${markets}. Average implied probability: ${(avgProb*100).toFixed(0)}%. Combined odds ${result.total_odds.toFixed(2)} sit in the 1.70–2.00 target band. Confidence: ${confidence}/100. Stake responsibly.`

    const cleanSels = result.selections.map(({ matchId, prob, ...sel }) => ({ ...sel, probability: prob }))

    const { data: saved, error } = await db()
      .from('daily_accumulators')
      .insert({ date: today, selections: cleanSels, total_odds: result.total_odds, confidence, analysis, status: 'pending' })
      .select().single()

    if (error) throw new Error(`DB insert failed: ${error.message}`)
    console.log(`[Acca] ✅ Saved ${saved.id}`)
    return json(201, saved)

  } catch (err) {
    console.error('[Acca] ❌', err.message)
    return json(500, { error: err.message })
  }
}
