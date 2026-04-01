// netlify/functions/daily-accumulator-generate.js
// POST /.netlify/functions/daily-accumulator-generate
//
// Supports TWO odds providers (auto-selected based on which key is set):
//   1. The Odds API  → set THE_ODDS_API_KEY  (recommended, 500 req/month free)
//      Sign up: https://the-odds-api.com
//   2. API-Football  → set API_FOOTBALL_KEY  (100 req/day free)
//      Sign up: https://dashboard.api-football.com/register
//
// Set at least ONE of these in Netlify → Site → Environment variables.

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

// ── Env ───────────────────────────────────────────────────────────
const ODDS_API_KEY     = process.env.THE_ODDS_API_KEY
const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY
const SB_URL           = process.env.SUPABASE_URL
const SB_KEY           = process.env.SUPABASE_SERVICE_ROLE_KEY

// ── Accumulator build config ──────────────────────────────────────
const TARGET_MIN = 1.50
const TARGET_MAX = 2.80   // widened — more combos found
const ODDS_MIN   = 1.10
const ODDS_MAX   = 2.30   // widened
const PROB_MIN   = 0.43   // loosened

function todayISO() { return new Date().toISOString().slice(0, 10) }
function db()       { return createClient(SB_URL, SB_KEY) }

// ─────────────────────────────────────────────────────────────────
// PROVIDER 1: The Odds API (the-odds-api.com)
// ─────────────────────────────────────────────────────────────────

const ODDS_API_SPORTS = [
  'soccer_epl', 'soccer_spain_la_liga', 'soccer_germany_bundesliga',
  'soccer_italy_serie_a', 'soccer_france_ligue_one', 'soccer_uefa_champs_league',
  'soccer_uefa_europa_league', 'soccer_efl_champ', 'soccer_netherlands_eredivisie',
  'soccer_portugal_primeira_liga', 'soccer_turkey_super_league',
  'soccer_belgium_first_div', 'soccer_brazil_campeonato',
  'soccer_argentina_primera_division', 'soccer_mls', 'soccer_scotland_premiership',
]

async function fetchOddsApiSport(sport) {
  const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${ODDS_API_KEY}&regions=eu&markets=h2h,totals,btts&oddsFormat=decimal&dateFormat=iso`
  const res = await fetch(url)
  const remaining = res.headers.get('x-requests-remaining')
  console.log(`[OddsAPI] ${sport} | remaining: ${remaining}`)
  if (res.status === 401) throw new Error('THE_ODDS_API_KEY is invalid or expired')
  if (res.status === 422) return []
  if (!res.ok) throw new Error(`OddsAPI HTTP ${res.status}`)
  return res.json()
}

function extractOddsApiCandidates(games, sport) {
  const now   = Date.now()
  const in48h = now + 48 * 60 * 60 * 1000
  const out   = []
  const league = sport.replace('soccer_', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  const MARKET_LABELS = { h2h: '1X2', totals: 'Over/Under', btts: 'Both Teams To Score' }

  for (const game of (games || [])) {
    const commenceMs = new Date(game.commence_time).getTime()
    if (commenceMs < now || commenceMs > in48h) continue
    const matchLabel = `${game.home_team} vs ${game.away_team}`

    for (const bk of (game.bookmakers || [])) {
      for (const mkt of (bk.markets || [])) {
        const marketLabel = MARKET_LABELS[mkt.key]
        if (!marketLabel) continue
        for (const outcome of (mkt.outcomes || [])) {
          const odds = parseFloat(outcome.price)
          if (isNaN(odds) || odds < ODDS_MIN || odds > ODDS_MAX) continue
          const prob = parseFloat((1 / odds).toFixed(4))
          if (prob < PROB_MIN) continue
          let pick = outcome.name
          if (mkt.key === 'totals') pick = `${outcome.name} ${outcome.point} Goals`
          if (mkt.key === 'btts')   pick = outcome.name === 'Yes' ? 'Both Teams Score' : 'Not Both Teams Score'
          out.push({ matchId: game.id, match: matchLabel, league, market: marketLabel, pick, odds, prob })
        }
      }
      break // one bookmaker per game
    }
  }
  return out
}

async function getCandidatesViaOddsApi() {
  const candidates = []
  const BATCH = 5
  for (let i = 0; i < ODDS_API_SPORTS.length; i += BATCH) {
    const batch = ODDS_API_SPORTS.slice(i, i + BATCH)
    const results = await Promise.allSettled(batch.map(s => fetchOddsApiSport(s)))
    for (let j = 0; j < batch.length; j++) {
      if (results[j].status === 'fulfilled') {
        candidates.push(...extractOddsApiCandidates(results[j].value, batch[j]))
      } else {
        console.warn(`[OddsAPI] skip ${batch[j]}: ${results[j].reason?.message}`)
      }
    }
    if (candidates.length >= 40) break
  }
  console.log(`[OddsAPI] ${candidates.length} raw candidates`)
  return candidates
}

// ─────────────────────────────────────────────────────────────────
// PROVIDER 2: API-Football (api-sports.io) — fallback
// ─────────────────────────────────────────────────────────────────

const AF_BASE    = 'https://v3.football.api-sports.io'
const AF_LEAGUES = new Set([39, 140, 78, 135, 61, 2, 3, 94, 529, 88, 253, 307])

async function afFetch(path) {
  const res = await fetch(`${AF_BASE}${path}`, { headers: { 'x-apisports-key': API_FOOTBALL_KEY } })
  const remaining = res.headers.get('x-ratelimit-requests-remaining')
  if (remaining !== null) console.log(`[API-Football] ${path.split('?')[0]} | remaining: ${remaining}`)
  if (res.status === 499 || res.status === 401) throw new Error('API_FOOTBALL_KEY is invalid or missing')
  if (!res.ok) throw new Error(`API-Football HTTP ${res.status}`)
  const d = await res.json()
  if (d.errors && Object.keys(d.errors).length) throw new Error(Object.values(d.errors).join(', '))
  return d.response || []
}

async function getCandidatesViaApiFootball() {
  const today    = todayISO()
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)

  let raw = await afFetch(`/fixtures?date=${today}&timezone=UTC`)
  if (!raw.length) raw = await afFetch(`/fixtures?date=${tomorrow}&timezone=UTC`)

  const fixtures = raw
    .filter(f => AF_LEAGUES.has(f.league?.id) && f.fixture?.status?.short === 'NS')
    .map(f => ({ id: f.fixture.id, home: f.teams.home.name, away: f.teams.away.name, league: f.league.name }))
    .slice(0, 12)

  console.log(`[API-Football] ${fixtures.length} fixtures`)
  if (!fixtures.length) return []

  const MARKET_LABELS = {
    'Match Winner': '1X2', 'Double Chance': 'Double Chance',
    'Goals Over/Under': 'Over/Under', 'Both Teams Score': 'Both Teams To Score',
    'Draw No Bet': 'Draw No Bet',
  }

  const candidates = []
  for (const fix of fixtures) {
    let oddsData = null
    // Try specific bookmakers first, then fallback to unfiltered
    for (const bmId of [8, 11, 6]) {
      try {
        const d = await afFetch(`/odds?fixture=${fix.id}&bookmaker=${bmId}`)
        if (d.length) { oddsData = d; break }
      } catch { /* try next */ }
    }
    if (!oddsData?.length) {
      try { oddsData = await afFetch(`/odds?fixture=${fix.id}`) } catch { continue }
    }
    if (!oddsData?.length) continue

    const bm = oddsData[0]?.bookmakers?.[0]
    if (!bm) continue

    const matchLabel = `${fix.home} vs ${fix.away}`
    for (const bet of (bm.bets || [])) {
      const market = MARKET_LABELS[bet.name] || bet.name
      for (const val of (bet.values || [])) {
        const odds = parseFloat(val.odd)
        if (isNaN(odds) || odds < ODDS_MIN || odds > ODDS_MAX) continue
        const prob = parseFloat((1 / odds).toFixed(4))
        if (prob < PROB_MIN) continue
        candidates.push({ matchId: fix.id, match: matchLabel, league: fix.league, market, pick: val.value, odds, prob })
      }
    }
  }

  console.log(`[API-Football] ${candidates.length} raw candidates`)
  return candidates
}

// ─────────────────────────────────────────────────────────────────
// Accumulator builder — shared
// ─────────────────────────────────────────────────────────────────

function buildAccu(candidates) {
  const deduped = Object.values(
    candidates.reduce((acc, c) => {
      const k = `${c.matchId}::${c.market}::${c.pick}`
      if (!acc[k] || c.prob > acc[k].prob) acc[k] = c
      return acc
    }, {})
  )

  const pool  = [...deduped].sort((a, b) => b.prob - a.prob).slice(0, 50)
  const co    = picks => parseFloat(picks.reduce((a, p) => a * p.odds, 1).toFixed(3))
  const valid = picks => new Set(picks.map(p => p.matchId)).size === picks.length

  // 3-folds
  for (let i = 0; i < pool.length - 2; i++) {
    for (let j = i + 1; j < pool.length - 1; j++) {
      if (pool[i].odds * pool[j].odds > TARGET_MAX) continue
      for (let k = j + 1; k < pool.length; k++) {
        const t = [pool[i], pool[j], pool[k]]
        if (!valid(t)) continue
        const total = co(t)
        if (total >= TARGET_MIN && total <= TARGET_MAX) return { selections: t, total_odds: total }
      }
    }
  }

  // 2-folds in target band
  for (let i = 0; i < pool.length - 1; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const t = [pool[i], pool[j]]
      if (!valid(t)) continue
      const total = co(t)
      if (total >= TARGET_MIN && total <= TARGET_MAX) return { selections: t, total_odds: total }
    }
  }

  // Last resort: best valid 2-fold regardless of odds band
  for (let i = 0; i < pool.length - 1; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const t = [pool[i], pool[j]]
      if (valid(t)) return { selections: t, total_odds: co(t) }
    }
  }

  return null
}

// ── Handler ───────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' })

  try {
    if (!SB_URL || !SB_KEY)
      throw new Error('Supabase env vars not set (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')
    if (!ODDS_API_KEY && !API_FOOTBALL_KEY)
      throw new Error(
        'No odds API key configured. ' +
        'Set THE_ODDS_API_KEY (the-odds-api.com, free) or API_FOOTBALL_KEY ' +
        '(dashboard.api-football.com, free) in Netlify → Site → Environment variables.'
      )

    const today = todayISO()
    const { data: existing } = await db().from('daily_accumulators').select('id').eq('date', today).maybeSingle()
    if (existing) return json(200, { message: 'Already generated today', id: existing.id })

    let candidates = []
    let providerUsed = ''

    // Primary: The Odds API
    if (ODDS_API_KEY) {
      try {
        candidates = await getCandidatesViaOddsApi()
        providerUsed = 'The Odds API'
      } catch (err) {
        console.warn(`[Acca] OddsAPI failed (${err.message}), trying API-Football…`)
      }
    }

    // Fallback: API-Football
    if (candidates.length < 2 && API_FOOTBALL_KEY) {
      try {
        candidates = await getCandidatesViaApiFootball()
        providerUsed = 'API-Football'
      } catch (err) {
        console.warn(`[Acca] API-Football also failed: ${err.message}`)
      }
    }

    console.log(`[Acca] ${candidates.length} candidates via ${providerUsed}`)

    if (candidates.length < 2) {
      throw new Error(
        `Only ${candidates.length} qualifying picks found (need ≥2). ` +
        `Provider: ${providerUsed || 'none configured'}. ` +
        'Possible causes: no matches today, API quota exhausted, or API key invalid. ' +
        'Check your Netlify env vars and API dashboard for remaining quota.'
      )
    }

    const result = buildAccu(candidates)
    if (!result) throw new Error('Could not build a valid accumulator from available picks.')

    const avgProb    = result.selections.reduce((a, b) => a + b.prob, 0) / result.selections.length
    const confidence = Math.min(85, Math.max(60, Math.round(avgProb * 100)))
    const leagues    = [...new Set(result.selections.map(s => s.league))].join(', ')
    const markets    = [...new Set(result.selections.map(s => s.market))].join(' & ')
    const analysis   = (
      `This ${result.selections.length}-fold accumulator spans ${leagues}, ` +
      `combining ${markets} selections. ` +
      `Average implied probability: ${(avgProb * 100).toFixed(0)}%. ` +
      `Combined odds: ${result.total_odds.toFixed(2)}. Confidence: ${confidence}/100. ` +
      `Data via ${providerUsed}. Stake responsibly — predictions only.`
    )

    const cleanSels = result.selections.map(({ prob, ...sel }) => ({ ...sel, probability: prob }))

    const { data: saved, error } = await db()
      .from('daily_accumulators')
      .insert({ date: today, selections: cleanSels, total_odds: result.total_odds, confidence, analysis, status: 'pending' })
      .select().single()

    if (error) throw new Error(`DB insert failed: ${error.message}`)
    console.log(`[Acca] ✅ Saved ${saved.id} — odds: ${saved.total_odds}, confidence: ${saved.confidence}`)
    return json(201, saved)

  } catch (err) {
    console.error('[Acca] ❌', err.message)
    return json(500, { error: err.message })
  }
}
