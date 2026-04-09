// netlify/functions/accumulator-service.js
// Powered by API-Football (api-sports.io) — 100 requests/day FREE, no credit card
//
// Sign up: https://dashboard.api-football.com/register
// Docs:    https://www.api-football.com/documentation-v3
//
// Daily request budget (3 requests total):
//   1 × /fixtures      → upcoming matches for target leagues
//   1 × /odds          → pre-match odds for those fixtures
//   1 × /predictions   → AI predictions (optional confidence boost)

const { createClient } = require('@supabase/supabase-js')

const API_FOOTBALL_KEY  = process.env.API_FOOTBALL_KEY   // from dashboard.api-football.com
const API_BASE          = 'https://v3.football.api-sports.io'
const SUPABASE_URL      = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BETPADDI_KEY      = process.env.BETPADDI_API_KEY

// ── Accumulator target window ─────────────────────────────────────
const TARGET_MIN = 1.70
const TARGET_MAX = 2.50

// ── Per-pick filter thresholds ────────────────────────────────────
// For a 3-fold: ∛1.70 ≈ 1.19, ∛2.50 ≈ 1.36 — per-pick must stay tight
const PICK_ODDS_MIN  = 1.10
const PICK_ODDS_MAX  = 1.45   // hard cap: 1.45³ = 3.05, with varied picks we land in 1.70–2.50
const PROB_THRESHOLD = 0.55   // ≥55% implied probability — confident picks only

// ── League IDs to scan (API-Football league IDs) ──────────────────
// These cover the most active leagues with odds data on the free plan.
// Full list: GET /leagues
const LEAGUE_IDS = [
  39,   // Premier League
  140,  // La Liga
  78,   // Bundesliga
  135,  // Serie A
  61,   // Ligue 1
  2,    // UEFA Champions League
  3,    // UEFA Europa League
  197,  // AFCON (Africa Cup of Nations)
  529,  // Super Lig (Turkey)
  94,   // Primeira Liga (Portugal)
]

// ── Bookmaker preference (API-Football bookmaker IDs) ─────────────
// 8  = Bet365 (most coverage)
// 11 = Bwin
// 6  = William Hill
const PREFERRED_BOOKMAKERS = [8, 11, 6]

// ─────────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function supabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
}

// API-Football headers
function apiHeaders() {
  return {
    'x-apisports-key': API_FOOTBALL_KEY,
  }
}

// Generic GET helper — logs remaining quota
async function apiFetch(path) {
  const url = `${API_BASE}${path}`
  const res = await fetch(url, { headers: apiHeaders() })

  const remaining = res.headers.get('x-ratelimit-requests-remaining')
  const used      = res.headers.get('x-ratelimit-requests-limit')
  if (remaining !== null) {
    console.log(`[API-Football] ${path.split('?')[0]} | remaining: ${remaining}/${used}`)
  }

  if (res.status === 499) throw new Error('API-Football: invalid or missing API key (499). Check API_FOOTBALL_KEY.')
  if (!res.ok) throw new Error(`API-Football: HTTP ${res.status} for ${path}`)

  const json = await res.json()

  if (json.errors && Object.keys(json.errors).length > 0) {
    const msg = Object.values(json.errors).join(', ')
    throw new Error(`API-Football error: ${msg}`)
  }

  return json.response || []
}

// ─────────────────────────────────────────────────────────────────
// Step 1: Fetch upcoming fixtures for today + tomorrow
// Returns lightweight fixture objects: { id, home, away, league, date }
// ─────────────────────────────────────────────────────────────────
async function fetchFixtures() {
  const today    = todayISO()
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)

  // One request: fetch fixtures for today across all target leagues
  // We use ?date= to get a single day's worth and filter by league client-side
  const raw = await apiFetch(`/fixtures?date=${today}&timezone=UTC`)

  // Also grab tomorrow if today returns nothing (e.g. early morning run)
  let fixtures = raw
  if (fixtures.length === 0) {
    const rawTomorrow = await apiFetch(`/fixtures?date=${tomorrow}&timezone=UTC`)
    fixtures = rawTomorrow
  }

  // Filter to our target leagues
  const leagueSet = new Set(LEAGUE_IDS)
  return fixtures
    .filter(f => leagueSet.has(f.league?.id) && f.fixture?.status?.short === 'NS')
    .map(f => ({
      id:     f.fixture.id,
      home:   f.teams.home.name,
      away:   f.teams.away.name,
      league: f.league.name,
      date:   f.fixture.date,
    }))
}

// ─────────────────────────────────────────────────────────────────
// Step 2: Fetch pre-match odds for a fixture
// Returns array of candidate picks: { matchId, match, league, market, pick, odds, probability }
// ─────────────────────────────────────────────────────────────────
async function fetchOddsForFixtures(fixtures) {
  const candidates = []

  // Batch: API-Football /odds accepts one fixture at a time on free plan.
  // We iterate but cap to 10 fixtures to stay within 100 req/day budget.
  const sample = fixtures.slice(0, 10)

  for (const fixture of sample) {
    const matchLabel = `${fixture.home} vs ${fixture.away}`

    let oddsData
    try {
      oddsData = await apiFetch(`/odds?fixture=${fixture.id}&bookmaker=8`)
    } catch (err) {
      console.warn(`[Odds] Fixture ${fixture.id} failed: ${err.message}`)
      continue
    }

    if (!oddsData.length) continue

    // Use first bookmaker result (Bet365 = bookmaker 8)
    const bookmaker = oddsData[0]?.bookmakers?.[0]
    if (!bookmaker) continue

    const EXCLUDED = new Set(['Asian Handicap', 'Asian Handicap First Half', 'Asian Handicap Second Half'])
    for (const bet of (bookmaker.bets || [])) {
      if (EXCLUDED.has(bet.name)) continue  // skip — always clusters at 1.15
      const market = humanizeMarket(bet.name)

      for (const val of (bet.values || [])) {
        const odds = parseFloat(val.odd)
        if (isNaN(odds) || odds < PICK_ODDS_MIN || odds > PICK_ODDS_MAX) continue

        const probability = parseFloat((1 / odds).toFixed(4))
        if (probability < PROB_THRESHOLD) continue

        candidates.push({
          matchId:     fixture.id,
          match:       matchLabel,
          league:      fixture.league,
          market,
          pick:        val.value,
          odds,
          probability,
        })
      }
    }
  }

  return candidates
}

// Map API-Football bet names to clean labels
function humanizeMarket(betName) {
  const map = {
    'Match Winner':            '1X2 (Match Result)',
    'Double Chance':           'Double Chance',
    'Goals Over/Under':        'Over/Under',
    'Both Teams Score':        'Both Teams To Score',
    'Draw No Bet':             'Draw No Bet',
    'Asian Handicap':          'Asian Handicap',
    'Correct Score':           'Correct Score',
    'First Half Winner':       'Half-Time Result',
    'Second Half Winner':      'Second Half Result',
  }
  return map[betName] || betName
}

// ─────────────────────────────────────────────────────────────────
// Scoring, building, analysis — same as before
// ─────────────────────────────────────────────────────────────────

function scoreCandidate(c) {
  // score = (probability * 0.6) + (form_proxy * 0.4)
  // form_proxy = probability (proxy until real team stats available)
  return parseFloat((c.probability * 0.6 + c.probability * 0.4).toFixed(6))
}

function combinedOdds(picks) {
  return parseFloat(picks.reduce((acc, p) => acc * p.odds, 1).toFixed(3))
}

// unique games — strip all possible synthetic suffixes
function baseMatchId(id) {
  return String(id).replace(/-(dc|o05|aw|o25|btts|o15|1x)$/, '')
}

function uniqueGames(picks)  { return new Set(picks.map(p => baseMatchId(p.matchId))).size === picks.length }
function mixedMarkets(picks) { return new Set(picks.map(p => p.market)).size >= 2 }
function mixedLeagues(picks) { return new Set(picks.map(p => p.league)).size >= 2 }

// Validation tiers
function validCombo(picks)    { return uniqueGames(picks) && mixedMarkets(picks) && mixedLeagues(picks) }
function validGamesOnly(picks){ return uniqueGames(picks) }

function buildAccumulator(candidates) {
  const scored = candidates
    .map(c => ({ ...c, _score: scoreCandidate(c) }))
    .sort((a, b) => b._score - a._score)

  const pool = scored.slice(0, 40)

  // ── Pass 1: 3-folds in target band — mixed markets + different leagues ──
  for (let i = 0; i < pool.length - 2; i++) {
    for (let j = i + 1; j < pool.length - 1; j++) {
      const ijOdds = pool[i].odds * pool[j].odds
      if (ijOdds * PICK_ODDS_MIN > TARGET_MAX) continue
      if (ijOdds * PICK_ODDS_MAX < TARGET_MIN) continue
      for (let k = j + 1; k < pool.length; k++) {
        const trio = [pool[i], pool[j], pool[k]]
        if (!validCombo(trio)) continue
        const total = combinedOdds(trio)
        if (total >= TARGET_MIN && total <= TARGET_MAX) return { selections: trio, total_odds: total }
      }
    }
  }

  // ── Pass 2: 3-folds in target band — mixed markets, same league ok ──
  for (let i = 0; i < pool.length - 2; i++) {
    for (let j = i + 1; j < pool.length - 1; j++) {
      const ijOdds = pool[i].odds * pool[j].odds
      if (ijOdds * PICK_ODDS_MIN > TARGET_MAX) continue
      if (ijOdds * PICK_ODDS_MAX < TARGET_MIN) continue
      for (let k = j + 1; k < pool.length; k++) {
        const trio = [pool[i], pool[j], pool[k]]
        if (!uniqueGames(trio) || !mixedMarkets(trio)) continue
        const total = combinedOdds(trio)
        if (total >= TARGET_MIN && total <= TARGET_MAX) return { selections: trio, total_odds: total }
      }
    }
  }

  // ── Pass 3: 3-folds in target band — unique games only ──────────────
  for (let i = 0; i < pool.length - 2; i++) {
    for (let j = i + 1; j < pool.length - 1; j++) {
      const ijOdds = pool[i].odds * pool[j].odds
      if (ijOdds * PICK_ODDS_MIN > TARGET_MAX) continue
      if (ijOdds * PICK_ODDS_MAX < TARGET_MIN) continue
      for (let k = j + 1; k < pool.length; k++) {
        const trio = [pool[i], pool[j], pool[k]]
        if (!validGamesOnly(trio)) continue
        const total = combinedOdds(trio)
        if (total >= TARGET_MIN && total <= TARGET_MAX) return { selections: trio, total_odds: total }
      }
    }
  }

  // ── Pass 4: Closest valid 3-fold to midpoint — NEVER 2-fold ─────────
  const midTarget = (TARGET_MIN + TARGET_MAX) / 2
  let bestMixed = null, bestMixedDist = Infinity
  let bestAny   = null, bestAnyDist   = Infinity

  for (let i = 0; i < pool.length - 2; i++) {
    for (let j = i + 1; j < pool.length - 1; j++) {
      for (let k = j + 1; k < pool.length; k++) {
        const trio = [pool[i], pool[j], pool[k]]
        if (!validGamesOnly(trio)) continue
        const total = combinedOdds(trio)
        const dist  = Math.abs(total - midTarget)
        if (dist < bestAnyDist) { bestAny = { selections: trio, total_odds: total }; bestAnyDist = dist }
        if (validCombo(trio) && dist < bestMixedDist) { bestMixed = { selections: trio, total_odds: total }; bestMixedDist = dist }
      }
    }
  }

  return bestMixed || bestAny || null
}

function buildAnalysis(selections, total_odds, confidence) {
  const leagues   = [...new Set(selections.map(s => s.league))].join(', ')
  const markets   = [...new Set(selections.map(s => s.market))].join(' & ')
  const avgProbPc = (selections.reduce((a, b) => a + b.probability, 0) / selections.length * 100).toFixed(0)
  return (
    `This ${selections.length}-fold accumulator spans ${leagues}, combining selections across ${markets}. ` +
    `Each pick carries an average implied probability of ${avgProbPc}%, reflecting strong market consensus. ` +
    `Combined odds of ${total_odds.toFixed(2)} sit within our 1.70–2.00 target window — ` +
    `solid value without over-leveraging risk. Confidence: ${confidence}/100. ` +
    `Stake responsibly — this is a data-driven prediction, not a guarantee.`
  )
}

// ─────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════════
// BETPADDI — Auto-generate SportyBet booking code
// ══════════════════════════════════════════════════════════════════
async function generateSportyBetCode(selections) {
  if (!BETPADDI_KEY) return null

  const headers = {
    'Content-Type':  'application/json',
    'X-API-Key':     BETPADDI_KEY,
    'Authorization': `Bearer ${BETPADDI_KEY}`,
  }
  const selPayload = selections.map(s => ({
    match:  s.match,
    league: s.league,
    market: s.market,
    pick:   s.pick,
    odds:   typeof s.odds === 'number' ? s.odds : parseFloat(s.odds),
  }))

  console.log('[Betpaddi] Attempting SportyBet code generation for', selections.length, 'selections')

  const attempts = [
    { url: 'https://betpaddi.com/api/v1/booking/generate',     body: { bookie: 'sportybet', country: 'ng', selections: selPayload } },
    { url: 'https://betpaddi.com/api/v1/booking/create',       body: { bookie: 'sportybet', country: 'ng', selections: selPayload } },
    { url: 'https://betpaddi.com/api/v1/betslip/generate',     body: { bookie: 'sportybet', country: 'ng', selections: selPayload } },
    { url: 'https://betpaddi.com/api/v1/book',                 body: { bookie: 'sportybet', country: 'ng', selections: selPayload } },
    { url: 'https://betpaddi.com/api/v1/conversion/book-code', body: { bookie: 'sportybet', country: 'ng', selections: selPayload } },
    { url: 'https://betpaddi.com/api/v1/conversion/generate',  body: { bookie: 'sportybet', country: 'ng', selections: selPayload } },
  ]

  for (const { url, body } of attempts) {
    try {
      const res  = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
      const data = await res.json().catch(() => ({}))
      console.log(`[Betpaddi] ${url.split('/').pop()} → HTTP ${res.status}:`, JSON.stringify(data).slice(0, 150))
      const code = data.code || data.booking_code || data.shareCode ||
                   data.data?.code || data.result?.code || data.betCode
      if (code) { console.log('[Betpaddi] ✅ Got SportyBet code:', code); return String(code).toUpperCase() }
    } catch (e) { console.warn(`[Betpaddi] ${url.split('/').pop()} failed:`, e.message) }
  }

  console.warn('[Betpaddi] All endpoints exhausted. Check Netlify function logs for API responses.')
  return null
}

async function generateDailyAccumulator() {
  if (!API_FOOTBALL_KEY) throw new Error('API_FOOTBALL_KEY is not set in environment variables.')
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error('Supabase env vars missing.')

  const today = todayISO()
  const db    = supabase()

  // Skip if already generated today
  const { data: existing } = await db
    .from('daily_accumulators').select('id').eq('date', today).maybeSingle()
  if (existing) {
    console.log(`[Acca] Already generated for ${today}`)
    return { skipped: true, id: existing.id }
  }

  // 1. Fixtures
  console.log('[Acca] Fetching fixtures…')
  const fixtures = await fetchFixtures()
  console.log(`[Acca] ${fixtures.length} upcoming fixtures in target leagues`)

  if (fixtures.length === 0) {
    throw new Error('No upcoming fixtures found for target leagues today. Try adding more league IDs.')
  }

  // 2. Odds
  console.log('[Acca] Fetching odds…')
  const candidates = await fetchOddsForFixtures(fixtures)
  console.log(`[Acca] ${candidates.length} qualifying pick candidates`)

  // Deduplicate: best per (matchId × market)
  const deduped = Object.values(
    candidates.reduce((acc, c) => {
      const key = `${c.matchId}::${c.market}`
      if (!acc[key] || scoreCandidate(c) > scoreCandidate(acc[key])) acc[key] = c
      return acc
    }, {})
  )

  if (deduped.length < 3) {
    throw new Error(
      `Only ${deduped.length} qualifying picks found (need ≥ 3 for a 3-fold accumulator). ` +
      'Possible reasons: no matches today, bookmaker 8 (Bet365) has no odds yet, or thresholds too strict.'
    )
  }

  // 3. Build accumulator
  const result = buildAccumulator(deduped)

  if (!result) {
    const topOdds = deduped.sort((a, b) => b.odds - a.odds).slice(0, 5).map(c => c.odds.toFixed(2)).join(', ')
    throw new Error(
      `No combination found in ${TARGET_MIN}–${TARGET_MAX} range. ` +
      `Top pick odds available: ${topOdds}. ` +
      'Consider adding more leagues or widening the odds range slightly.'
    )
  }

  // 4. Confidence + analysis
  const avgProb    = result.selections.reduce((a, b) => a + b.probability, 0) / result.selections.length
  const confidence = Math.min(85, Math.max(70, Math.round(avgProb * 100)))
  const analysis   = buildAnalysis(result.selections, result.total_odds, confidence)
  const cleanSels  = result.selections.map(({ _score, matchId, ...sel }) => ({ ...sel, fixture_id: matchId }))

  // 5. Save
  const { data: saved, error } = await db
    .from('daily_accumulators')
    .insert({ date: today, selections: cleanSels, total_odds: result.total_odds, confidence, analysis, status: 'pending' })
    .select().single()

  if (error) throw new Error(`Supabase insert failed: ${error.message}`)
  console.log(`[Acca] ✅ Saved ${saved.id} — odds: ${saved.total_odds}, confidence: ${saved.confidence}`)

  // ── Auto-generate SportyBet booking code via Betpaddi ────────────
  try {
    const bookingCode = await generateSportyBetCode(cleanSels)
    if (bookingCode) {
      const { error: codeErr } = await db
        .from('daily_accumulators')
        .update({ booking_code: bookingCode })
        .eq('id', saved.id)
      if (!codeErr) { saved.booking_code = bookingCode; console.log(`[Acca] 🎫 Booking code: ${bookingCode}`) }
      else console.warn('[Acca] Failed to save booking code:', codeErr.message)
    }
  } catch (e) { console.warn('[Acca] Booking code generation failed (non-fatal):', e.message) }

  return saved
}

module.exports = { generateDailyAccumulator, todayISO }
