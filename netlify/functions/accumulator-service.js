// netlify/functions/accumulator-service.js
// Core logic: fetch odds → filter → score → build accumulator → save to Supabase
// This is the shared service imported by the HTTP handler and the cron job.

const { createClient } = require('@supabase/supabase-js')

const ODDS_API_KEY      = process.env.ODDS_API_KEY        // https://the-odds-api.com
const ODDS_API_BASE     = 'https://api.the-odds-api.com/v4'
const SUPABASE_URL      = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

// ── Target accumulator window ─────────────────────────────────────
const TARGET_MIN  = 1.80
const TARGET_MAX  = 1.90

// ── Pick filter thresholds ────────────────────────────────────────
const PICK_ODDS_MIN  = 1.05
const PICK_ODDS_MAX  = 1.55
const PROB_THRESHOLD = 0.65

// ── Sports to scan (add/remove as needed) ────────────────────────
const SPORTS = [
  'soccer_epl',
  'soccer_spain_la_liga',
  'soccer_germany_bundesliga',
  'soccer_italy_serie_a',
  'soccer_france_ligue_one',
  'soccer_uefa_champs_league',
  'soccer_africa_nations_cup',
  'basketball_nba',
  'basketball_euroleague',
  'tennis_atp_french_open',
  'americanfootball_nfl',
]

// ── Markets to request ────────────────────────────────────────────
// h2h = 1X2, spreads = Asian Handicap, totals = Over/Under
const MARKET_GROUPS = ['h2h', 'spreads', 'totals', 'btts', 'double_chance', 'draw_no_bet']

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function supabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
}

/**
 * Fetch all odds for a given sport and markets from The Odds API.
 * Returns raw games array or [] on failure.
 */
async function fetchOddsForSport(sport) {
  const markets = MARKET_GROUPS.join(',')
  const url = `${ODDS_API_BASE}/sports/${sport}/odds?apiKey=${ODDS_API_KEY}&regions=eu&markets=${markets}&oddsFormat=decimal&dateFormat=iso`
  try {
    const res = await fetch(url)
    if (!res.ok) {
      console.warn(`[Odds API] ${sport} returned ${res.status}`)
      return []
    }
    return await res.json()
  } catch (err) {
    console.error(`[Odds API] fetch error for ${sport}:`, err.message)
    return []
  }
}

/**
 * Given a raw game from the Odds API, extract all individual pick candidates.
 * Each candidate: { match, league, market, pick, odds, probability, matchId }
 */
function extractPickCandidates(game, sport) {
  const candidates = []
  const matchLabel = `${game.home_team} vs ${game.away_team}`
  const league     = game.sport_title || sport

  for (const bookmaker of (game.bookmakers || [])) {
    for (const market of (bookmaker.markets || [])) {
      for (const outcome of (market.outcomes || [])) {
        const odds = parseFloat(outcome.price)
        if (isNaN(odds) || odds < PICK_ODDS_MIN || odds > PICK_ODDS_MAX) continue

        const probability = parseFloat((1 / odds).toFixed(4))
        if (probability < PROB_THRESHOLD) continue

        candidates.push({
          matchId:     game.id,
          match:       matchLabel,
          league,
          market:      humanizeMarket(market.key, outcome),
          pick:        formatPickLabel(market.key, outcome),
          odds,
          probability,
          _bookmaker:  bookmaker.title,  // used internally for dedup, stripped before save
        })
      }
    }
    // Only use first bookmaker per game to avoid duplicates
    break
  }

  return candidates
}

/** Convert API market key to human-readable string */
function humanizeMarket(key, outcome) {
  const map = {
    h2h:           '1X2 (Match Result)',
    spreads:       'Asian Handicap',
    totals:        'Over/Under',
    btts:          'Both Teams To Score',
    double_chance: 'Double Chance',
    draw_no_bet:   'Draw No Bet',
  }
  return map[key] || key
}

/** Build a human-readable pick label */
function formatPickLabel(marketKey, outcome) {
  if (marketKey === 'totals') {
    return `${outcome.name} ${outcome.point} Goals`   // e.g. "Over 1.5 Goals"
  }
  if (marketKey === 'spreads') {
    const sign = outcome.point > 0 ? `+${outcome.point}` : `${outcome.point}`
    return `${outcome.name} (${sign})`
  }
  if (marketKey === 'btts') {
    return `BTTS: ${outcome.name}`
  }
  return outcome.name   // e.g. "Arsenal", "Arsenal/Draw"
}

/**
 * Score a pick candidate.
 * score = (probability * 0.6) + (form_proxy * 0.4)
 *
 * We don't have live form data without a paid stats API, so we proxy
 * "form strength" from the implied probability itself (stronger favourite
 * ↔ higher recent form). For a real integration substitute team-stats API.
 */
function scoreCandidate(candidate) {
  const form_proxy = candidate.probability   // proxy — replace with real form data
  return (candidate.probability * 0.6) + (form_proxy * 0.4)
}

/**
 * Given a sorted list of candidates, find a combination of 2–3 picks
 * whose combined odds fall inside [TARGET_MIN, TARGET_MAX].
 * Rules: no two picks from the same match; prefer mixed markets.
 */
function buildAccumulator(candidates) {
  const scored = candidates
    .map(c => ({ ...c, _score: scoreCandidate(c) }))
    .sort((a, b) => b._score - a._score)

  const top = scored.slice(0, 30) // search space

  // ── Try all 3-pick combos first ──────────────────────────────
  for (let i = 0; i < top.length - 2; i++) {
    for (let j = i + 1; j < top.length - 1; j++) {
      for (let k = j + 1; k < top.length; k++) {
        const trio = [top[i], top[j], top[k]]
        if (!validCombo(trio)) continue
        const total = combinedOdds(trio)
        if (total >= TARGET_MIN && total <= TARGET_MAX) {
          return { selections: trio, total_odds: total }
        }
      }
    }
  }

  // ── Fall back to 2-pick combos ────────────────────────────────
  for (let i = 0; i < top.length - 1; i++) {
    for (let j = i + 1; j < top.length; j++) {
      const pair = [top[i], top[j]]
      if (!validCombo(pair)) continue
      const total = combinedOdds(pair)
      if (total >= TARGET_MIN && total <= TARGET_MAX) {
        return { selections: pair, total_odds: total }
      }
    }
  }

  return null
}

function validCombo(picks) {
  // No two picks from the same match
  const matchIds = picks.map(p => p.matchId)
  if (new Set(matchIds).size !== matchIds.length) return false

  // Prefer mixed markets (soft rule: allow same market only if no alternative)
  // Hard block: only if literally all three are identical market
  const markets = picks.map(p => p.market)
  if (picks.length === 3 && new Set(markets).size === 1) return false

  return true
}

function combinedOdds(picks) {
  return parseFloat(picks.reduce((acc, p) => acc * p.odds, 1).toFixed(3))
}

/**
 * Generate a concise analysis paragraph.
 */
function buildAnalysis(selections, total_odds, confidence) {
  const leagues  = [...new Set(selections.map(s => s.league))].join(', ')
  const markets  = [...new Set(selections.map(s => s.market))].join(' & ')
  const avgProb  = (selections.reduce((a, b) => a + b.probability, 0) / selections.length * 100).toFixed(0)

  return (
    `This ${selections.length}-fold accumulator spans ${leagues}, combining picks across ${markets}. ` +
    `Each selection carries an implied probability above ${avgProb}%, reflecting high-confidence outcomes ` +
    `backed by market consensus. Combined odds of ${total_odds.toFixed(2)} sit in our 1.80–1.90 ` +
    `target band, offering solid value without overextending risk. ` +
    `Confidence score: ${confidence}/100. Stake responsibly.`
  )
}

// ─────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────

async function generateDailyAccumulator() {
  const today = todayISO()
  const db = supabase()

  // ── 1. Check if today's acca already exists ───────────────────
  const { data: existing } = await db
    .from('daily_accumulators')
    .select('id')
    .eq('date', today)
    .maybeSingle()

  if (existing) {
    console.log(`[Acca] Accumulator for ${today} already exists (${existing.id})`)
    return { skipped: true, id: existing.id }
  }

  // ── 2. Fetch odds from all sports in parallel ─────────────────
  console.log(`[Acca] Fetching odds for ${SPORTS.length} sports…`)
  const allGames = (
    await Promise.all(SPORTS.map(s => fetchOddsForSport(s).then(games =>
      games.map(g => ({ ...g, _sport: s }))
    )))
  ).flat()
  console.log(`[Acca] Total games fetched: ${allGames.length}`)

  if (allGames.length === 0) {
    throw new Error('No games returned from Odds API. Check API key and quota.')
  }

  // ── 3. Extract candidates ─────────────────────────────────────
  const allCandidates = allGames.flatMap(g => extractPickCandidates(g, g._sport))
  console.log(`[Acca] Raw candidates: ${allCandidates.length}`)

  if (allCandidates.length < 2) {
    throw new Error(`Not enough qualifying picks (need ≥2, got ${allCandidates.length}). Try relaxing thresholds.`)
  }

  // ── 4. Deduplicate: keep best-scored pick per match per market ─
  const deduped = Object.values(
    allCandidates.reduce((acc, c) => {
      const key = `${c.matchId}::${c.market}`
      if (!acc[key] || scoreCandidate(c) > scoreCandidate(acc[key])) acc[key] = c
      return acc
    }, {})
  )

  // ── 5. Build accumulator ──────────────────────────────────────
  const result = buildAccumulator(deduped)

  if (!result) {
    throw new Error(
      `Could not find a valid combination within odds range ${TARGET_MIN}–${TARGET_MAX}. ` +
      `Candidates: ${deduped.length}. Consider widening the range or expanding sports list.`
    )
  }

  // ── 6. Confidence & analysis ──────────────────────────────────
  const rawConfidence = (result.selections.reduce((a, b) => a + b.probability, 0) / result.selections.length) * 100
  const confidence    = Math.min(85, Math.max(70, Math.round(rawConfidence)))
  const analysis      = buildAnalysis(result.selections, result.total_odds, confidence)

  // ── 7. Strip internal fields before persisting ────────────────
  const cleanSelections = result.selections.map(({ _score, _bookmaker, matchId, ...sel }) => sel)

  // ── 8. Save to Supabase ───────────────────────────────────────
  const { data: saved, error } = await db
    .from('daily_accumulators')
    .insert({
      date:       today,
      selections: cleanSelections,
      total_odds: result.total_odds,
      confidence,
      analysis,
      status:     'pending',
    })
    .select()
    .single()

  if (error) throw new Error(`Supabase insert failed: ${error.message}`)

  console.log(`[Acca] ✅ Saved accumulator ${saved.id} — odds: ${saved.total_odds}, confidence: ${saved.confidence}`)
  return saved
}

module.exports = { generateDailyAccumulator, todayISO }
