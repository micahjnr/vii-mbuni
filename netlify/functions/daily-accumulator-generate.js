// netlify/functions/daily-accumulator-generate.js
// POST /.netlify/functions/daily-accumulator-generate
//
// THREE odds sources, tried in order:
//
//   1. The Odds API (the-odds-api.com) — best coverage, 500 req/month free
//      → set THE_ODDS_API_KEY in Netlify env vars
//
//   2. API-Football /odds — free plan, but Bet365 odds rarely available
//      → set API_FOOTBALL_KEY (also used for source 3 below)
//
//   3. API-Football /predictions — ALWAYS works on free plan, no odds key needed
//      Converts AI win-probability % → implied decimal odds
//      → set API_FOOTBALL_KEY
//
// You only need ONE key. If THE_ODDS_API_KEY is set it is used first.
// Otherwise API_FOOTBALL_KEY covers both sources 2 and 3.
//
// Target accumulator range: 1.70–2.00 combined odds

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

// ── Accumulator target ────────────────────────────────────────────
const TARGET_MIN = 1.70   // target 1.70–2.00 daily acca
const TARGET_MAX = 2.00
const PICK_MIN   = 1.15
const PICK_MAX   = 1.55   // cap per-pick so 2-folds can land in 1.70–2.00 (1.55×1.55=2.40 max)
const PROB_MIN   = 0.60   // ~1.67 implied odds → keeps picks confident (≥60% win prob)

function todayISO() { return new Date().toISOString().slice(0, 10) }
function db()       { return createClient(SB_URL, SB_KEY) }

// ══════════════════════════════════════════════════════════════════
// SOURCE 1 — The Odds API (the-odds-api.com)
// ══════════════════════════════════════════════════════════════════

const ODDS_API_SPORTS = [
  'soccer_epl', 'soccer_spain_la_liga', 'soccer_germany_bundesliga',
  'soccer_italy_serie_a', 'soccer_france_ligue_one', 'soccer_uefa_champs_league',
  'soccer_uefa_europa_league', 'soccer_efl_champ', 'soccer_netherlands_eredivisie',
  'soccer_portugal_primeira_liga', 'soccer_turkey_super_league',
  'soccer_belgium_first_div', 'soccer_brazil_campeonato',
  'soccer_argentina_primera_division', 'soccer_mls', 'soccer_scotland_premiership',
  'soccer_mexico_ligamx', 'soccer_norway_eliteserien',
]

async function fetchOddsApiSport(sport) {
  const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${ODDS_API_KEY}&regions=eu&markets=h2h,totals,btts&oddsFormat=decimal`
  const res = await fetch(url)
  const rem = res.headers.get('x-requests-remaining')
  console.log(`[OddsAPI] ${sport} remaining=${rem}`)
  if (res.status === 401) throw new Error('THE_ODDS_API_KEY invalid')
  if (res.status === 422) return []
  if (!res.ok) throw new Error(`OddsAPI HTTP ${res.status}`)
  return res.json()
}

function extractOddsApiCandidates(games, sport) {
  const now   = Date.now()
  const in48h = now + 48 * 3600 * 1000
  const league = sport.replace('soccer_', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  const LABELS = { h2h: '1X2', totals: 'Over/Under', btts: 'Both Teams To Score' }
  const out = []

  for (const game of (games || [])) {
    const t = new Date(game.commence_time).getTime()
    if (t < now || t > in48h) continue
    const match = `${game.home_team} vs ${game.away_team}`

    for (const bk of (game.bookmakers || [])) {
      for (const mkt of (bk.markets || [])) {
        const market = LABELS[mkt.key]; if (!market) continue
        for (const o of (mkt.outcomes || [])) {
          const odds = parseFloat(o.price)
          if (!odds || odds < PICK_MIN || odds > PICK_MAX) continue
          const prob = +(1 / odds).toFixed(4)
          if (prob < PROB_MIN) continue
          let pick = o.name
          if (mkt.key === 'totals') pick = `${o.name} ${o.point} Goals`
          if (mkt.key === 'btts')   pick = o.name === 'Yes' ? 'Both Teams Score' : 'Not Both Teams Score'
          out.push({ matchId: game.id, match, league, market, pick, odds, prob })
        }
      }
      break // one bookmaker per game is enough
    }
  }
  return out
}

async function getCandidatesFromOddsApi() {
  const all = []
  for (let i = 0; i < ODDS_API_SPORTS.length; i += 5) {
    const batch = ODDS_API_SPORTS.slice(i, i + 5)
    const results = await Promise.allSettled(batch.map(s => fetchOddsApiSport(s)))
    for (let j = 0; j < batch.length; j++) {
      if (results[j].status === 'fulfilled')
        all.push(...extractOddsApiCandidates(results[j].value, batch[j]))
      else
        console.warn(`[OddsAPI] skip ${batch[j]}: ${results[j].reason?.message}`)
    }
    if (all.length >= 50) break
  }
  console.log(`[OddsAPI] ${all.length} candidates`)
  return all
}

// ══════════════════════════════════════════════════════════════════
// SOURCE 2 — API-Football /odds  (free plan, rarely has data)
// ══════════════════════════════════════════════════════════════════

const AF_BASE    = 'https://v3.football.api-sports.io'
const AF_LEAGUES = new Set([39, 140, 78, 135, 61, 2, 3, 94, 529, 88, 253, 307, 197])

async function afFetch(path) {
  const res = await fetch(`${AF_BASE}${path}`, { headers: { 'x-apisports-key': API_FOOTBALL_KEY } })
  const rem = res.headers.get('x-ratelimit-requests-remaining')
  if (rem) console.log(`[AF] ${path.split('?')[0]} rem=${rem}`)
  if (res.status === 499 || res.status === 401) throw new Error('API_FOOTBALL_KEY invalid')
  if (!res.ok) throw new Error(`AF HTTP ${res.status}`)
  const d = await res.json()
  if (d.errors && Object.keys(d.errors).length) throw new Error(Object.values(d.errors).join(', '))
  return d.response || []
}

async function getFixtures() {
  const today    = todayISO()
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  let raw = await afFetch(`/fixtures?date=${today}&timezone=UTC`)
  if (!raw.length) raw = await afFetch(`/fixtures?date=${tomorrow}&timezone=UTC`)
  return raw
    .filter(f => AF_LEAGUES.has(f.league?.id) && f.fixture?.status?.short === 'NS')
    .map(f => ({ id: f.fixture.id, home: f.teams.home.name, away: f.teams.away.name, league: f.league.name, leagueId: f.league.id }))
    .slice(0, 15)
}

async function getCandidatesFromAfOdds(fixtures) {
  const LABELS = {
    'Match Winner': '1X2', 'Double Chance': 'Double Chance',
    'Goals Over/Under': 'Over/Under', 'Both Teams Score': 'Both Teams To Score',
    'Draw No Bet': 'Draw No Bet',
  }
  const candidates = []

  for (const fix of fixtures) {
    let data = null
    // try bookmakers 8, 11, 6, then no filter
    for (const bm of [8, 11, 6, null]) {
      try {
        const path = bm ? `/odds?fixture=${fix.id}&bookmaker=${bm}` : `/odds?fixture=${fix.id}`
        const d = await afFetch(path)
        if (d.length) { data = d; break }
      } catch { /* try next */ }
    }
    if (!data?.length) continue

    const bm = data[0]?.bookmakers?.[0]; if (!bm) continue
    const match = `${fix.home} vs ${fix.away}`

    const EXCLUDED = new Set(['Asian Handicap', 'Asian Handicap First Half', 'Asian Handicap Second Half'])
    for (const bet of (bm.bets || [])) {
      if (EXCLUDED.has(bet.name)) continue  // skip — always clusters at 1.15, useless for acca
      const market = LABELS[bet.name] || bet.name
      for (const val of (bet.values || [])) {
        const odds = parseFloat(val.odd)
        if (!odds || odds < PICK_MIN || odds > PICK_MAX) continue
        const prob = +(1 / odds).toFixed(4)
        if (prob < PROB_MIN) continue
        candidates.push({ matchId: fix.id, match, league: fix.league, market, pick: val.value, odds, prob })
      }
    }
  }
  console.log(`[AF-Odds] ${candidates.length} candidates`)
  return candidates
}

// ══════════════════════════════════════════════════════════════════
// SOURCE 3 — API-Football /predictions  (always works on free plan)
// Converts AI win-probability percentages → implied decimal odds
// ══════════════════════════════════════════════════════════════════

function percentToOdds(pctStr) {
  // pctStr looks like "45%" or "45"
  const pct = parseFloat(pctStr)
  if (!pct || pct <= 0 || pct >= 100) return null
  const prob = pct / 100
  // Add a small bookmaker margin (5%) to make odds realistic
  const marginedProb = prob * 1.05
  if (marginedProb >= 1) return null
  return parseFloat((1 / marginedProb).toFixed(2))
}

async function getCandidatesFromPredictions(fixtures) {
  const candidates = []
  const sample = fixtures.slice(0, 10) // cap at 10 to save API quota

  for (const fix of sample) {
    let data
    try { data = await afFetch(`/predictions?fixture=${fix.id}`) }
    catch (err) { console.warn(`[Predictions] fixture ${fix.id}: ${err.message}`); continue }
    if (!data.length) continue

    const pred = data[0]
    const pct  = pred?.predictions?.percent
    const winner = pred?.predictions?.winner
    if (!pct) continue

    const match  = `${fix.home} vs ${fix.away}`
    const league = fix.league

    // Home win
    if (pct.home) {
      const odds = percentToOdds(pct.home)
      const prob = parseFloat(pct.home) / 100
      if (odds && odds >= PICK_MIN && odds <= PICK_MAX && prob >= PROB_MIN) {
        candidates.push({ matchId: fix.id, match, league, market: '1X2', pick: 'Home', odds, prob: +prob.toFixed(4) })
      }
    }
    // Draw
    if (pct.draws) {
      const odds = percentToOdds(pct.draws)
      const prob = parseFloat(pct.draws) / 100
      if (odds && odds >= PICK_MIN && odds <= PICK_MAX && prob >= PROB_MIN) {
        candidates.push({ matchId: fix.id, match, league, market: '1X2', pick: 'Draw', odds, prob: +prob.toFixed(4) })
      }
    }
    // Away win
    if (pct.away) {
      const odds = percentToOdds(pct.away)
      const prob = parseFloat(pct.away) / 100
      if (odds && odds >= PICK_MIN && odds <= PICK_MAX && prob >= PROB_MIN) {
        candidates.push({ matchId: fix.id, match, league, market: '1X2', pick: 'Away', odds, prob: +prob.toFixed(4) })
      }
    }

    // Double Chance: if win% is high but odds would be too low, combine with draw
    // Home or Draw (1X)
    const homeP  = parseFloat(pct.home  || 0) / 100
    const drawP  = parseFloat(pct.draws || 0) / 100
    const awayP  = parseFloat(pct.away  || 0) / 100
    const hd = homeP + drawP
    const da = drawP + awayP
    for (const [combo, prob, label] of [[hd, hd, '1X (Home or Draw)'], [da, da, 'X2 (Draw or Away)']]) {
      if (prob >= 0.55 && prob < 1) {
        const odds = +(1 / (prob * 1.05)).toFixed(2)
        if (odds >= PICK_MIN && odds <= PICK_MAX) {
          candidates.push({ matchId: `${fix.id}-dc`, match, league, market: 'Double Chance', pick: label, odds, prob: +prob.toFixed(4) })
        }
      }
    }

    // Over 0.5 Goals — almost always hits, conservative synthetic odds
    // We use the complement of "0-0 score" probability as proxy
    // If both teams have attack, assign over 0.5 at ~1.10-1.25
    const goalScore = pred?.teams?.home?.last_5?.goals?.for?.total?.home + pred?.teams?.away?.last_5?.goals?.for?.total?.away
    if (typeof goalScore === 'number' && goalScore > 3) {
      candidates.push({ matchId: `${fix.id}-o05`, match, league, market: 'Over/Under', pick: 'Over 0.5 Goals', odds: 1.12, prob: 0.89 })
    }
  }

  console.log(`[Predictions] ${candidates.length} synthetic candidates`)
  return candidates
}

// ══════════════════════════════════════════════════════════════════
// Accumulator builder
// ══════════════════════════════════════════════════════════════════

function buildAccu(rawCandidates) {
  // Dedup: best prob per (matchId × market × pick)
  const deduped = Object.values(
    rawCandidates.reduce((acc, c) => {
      const k = `${c.matchId}::${c.market}::${c.pick}`
      if (!acc[k] || c.prob > acc[k].prob) acc[k] = c
      return acc
    }, {})
  )

  const pool  = [...deduped].sort((a, b) => b.prob - a.prob).slice(0, 60)
  const co    = picks => +picks.reduce((a, p) => a * p.odds, 1).toFixed(3)
  // Unique underlying game (strip suffixes added for DC/Over synthetic picks)
  const baseId = id => String(id).replace(/-dc$|-o05$/, '')
  const valid  = picks => new Set(picks.map(p => baseId(p.matchId))).size === picks.length

  // 3-folds in target band
  // Guard: if the two lowest-odds picks already exceed TARGET_MAX, no third pick can help
  for (let i = 0; i < pool.length - 2; i++) {
    for (let j = i + 1; j < pool.length - 1; j++) {
      if (pool[i].odds * pool[j].odds > TARGET_MAX) continue  // even × PICK_MIN would bust
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

  // Last resort: best valid 3-fold regardless of odds band
  for (let i = 0; i < pool.length - 2; i++) {
    for (let j = i + 1; j < pool.length - 1; j++) {
      for (let k = j + 1; k < pool.length; k++) {
        const t = [pool[i], pool[j], pool[k]]
        if (valid(t)) return { selections: t, total_odds: co(t) }
      }
    }
  }

  // Absolute last resort: best valid 2-fold
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
      throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set in Netlify env vars')
    if (!ODDS_API_KEY && !API_FOOTBALL_KEY)
      throw new Error(
        'No API key configured. Add THE_ODDS_API_KEY (the-odds-api.com) ' +
        'or API_FOOTBALL_KEY (dashboard.api-football.com) in Netlify → Site → Environment variables.'
      )

    const today = todayISO()
    const force = event.queryStringParameters?.force === 'true' ||
                  JSON.parse(event.body || '{}').force === true
    const { data: existing } = await db().from('daily_accumulators').select('id').eq('date', today).maybeSingle()
    if (existing && !force) return json(200, { message: 'Already generated today', id: existing.id })
    if (existing && force) {
      await db().from('daily_accumulators').delete().eq('id', existing.id)
      console.log(`[Acca] Force regenerate — deleted existing ${existing.id}`)
    }

    let candidates   = []
    let providerUsed = ''

    // ── Source 1: The Odds API ─────────────────────────────────
    if (ODDS_API_KEY && candidates.length < 4) {
      try {
        const c = await getCandidatesFromOddsApi()
        if (c.length) { candidates = c; providerUsed = 'The Odds API' }
      } catch (e) {
        console.warn(`[Acca] OddsAPI failed: ${e.message}`)
      }
    }

    // ── Source 2: API-Football /odds (rarely works on free plan) ──
    let fixtures = []
    if (API_FOOTBALL_KEY && candidates.length < 4) {
      try {
        fixtures = await getFixtures()
        console.log(`[Acca] ${fixtures.length} fixtures found`)
        const c = await getCandidatesFromAfOdds(fixtures)
        if (c.length) { candidates = [...candidates, ...c]; providerUsed = providerUsed || 'API-Football Odds' }
      } catch (e) {
        console.warn(`[Acca] AF-Odds failed: ${e.message}`)
      }
    }

    // ── Source 3: API-Football /predictions (always available) ──
    if (API_FOOTBALL_KEY && candidates.length < 4) {
      try {
        if (!fixtures.length) fixtures = await getFixtures()
        if (fixtures.length) {
          const c = await getCandidatesFromPredictions(fixtures)
          if (c.length) { candidates = [...candidates, ...c]; providerUsed = providerUsed ? `${providerUsed} + Predictions` : 'API-Football Predictions' }
        }
      } catch (e) {
        console.warn(`[Acca] Predictions failed: ${e.message}`)
      }
    }

    console.log(`[Acca] Total candidates: ${candidates.length} via [${providerUsed}]`)

    if (candidates.length < 2) {
      const hint = API_FOOTBALL_KEY
        ? 'API-Football free plan has very limited odds data. Set THE_ODDS_API_KEY from the-odds-api.com (free, 500 req/month) for reliable daily picks.'
        : 'Set THE_ODDS_API_KEY (the-odds-api.com, free) or API_FOOTBALL_KEY in Netlify → Site → Environment variables.'
      throw new Error(`Only ${candidates.length} qualifying picks found. ${hint}`)
    }

    const result = buildAccu(candidates)
    if (!result) throw new Error('Could not build a valid accumulator — not enough unique fixtures.')

    const avgProb    = result.selections.reduce((a, b) => a + b.prob, 0) / result.selections.length
    const confidence = Math.min(85, Math.max(60, Math.round(avgProb * 100)))
    const leagues    = [...new Set(result.selections.map(s => s.league))].join(', ')
    const markets    = [...new Set(result.selections.map(s => s.market))].join(' & ')
    const analysis   = (
      `This ${result.selections.length}-fold accumulator spans ${leagues}, ` +
      `combining ${markets} selections. ` +
      `Average implied probability: ${(avgProb * 100).toFixed(0)}%. ` +
      `Combined odds: ${result.total_odds.toFixed(2)}. Confidence: ${confidence}/100. ` +
      `Data: ${providerUsed}. Stake responsibly — predictions only, not financial advice.`
    )

    // Keep fixture_id so the cron can auto-settle by fetching results
    const cleanSels = result.selections.map(({ prob, matchId, ...s }) => ({
      ...s,
      fixture_id: typeof matchId === 'string' ? parseInt(matchId.split('-')[0], 10) : matchId,
      probability: prob,
    }))

    const { data: saved, error } = await db()
      .from('daily_accumulators')
      .insert({ date: today, selections: cleanSels, total_odds: result.total_odds, confidence, analysis, status: 'pending' })
      .select().single()

    if (error) throw new Error(`DB insert failed: ${error.message}`)
    console.log(`[Acca] ✅ ${saved.id} odds=${saved.total_odds} conf=${saved.confidence} via ${providerUsed}`)
    return json(201, saved)

  } catch (err) {
    console.error('[Acca] ❌', err.message)
    return json(500, { error: err.message })
  }
}
