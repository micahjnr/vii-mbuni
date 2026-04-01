// netlify/functions/daily-accumulator-generate.js
// POST /.netlify/functions/daily-accumulator-generate
// Uses The Odds API (the-odds-api.com) for reliable odds data

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
const ODDS_API_KEY = process.env.THE_ODDS_API_KEY
const ODDS_BASE    = 'https://api.the-odds-api.com/v4'
const SB_URL       = process.env.SUPABASE_URL
const SB_KEY       = process.env.SUPABASE_SERVICE_ROLE_KEY

const TARGET_MIN = 1.50
const TARGET_MAX = 2.50
const ODDS_MIN   = 1.10
const ODDS_MAX   = 2.20
const PROB_MIN   = 0.45

// Sports to pull odds from — ordered by priority, fetched in parallel batches
const SPORTS = [
  'soccer_epl',
  'soccer_spain_la_liga',
  'soccer_germany_bundesliga',
  'soccer_italy_serie_a',
  'soccer_france_ligue_one',
  'soccer_uefa_champs_league',
  'soccer_uefa_europa_league',
  'soccer_efl_champ',
  'soccer_netherlands_eredivisie',
  'soccer_portugal_primeira_liga',
  'soccer_turkey_super_league',
  'soccer_belgium_first_div',
  'soccer_brazil_campeonato',
  'soccer_argentina_primera_division',
  'soccer_mls',
  'soccer_scotland_premiership',
  'soccer_mexico_ligamx',
  'soccer_norway_eliteserien',
]
const BATCH_SIZE = 6  // fetch 6 sports at once in parallel

function todayISO() { return new Date().toISOString().slice(0, 10) }
function db() { return createClient(SB_URL, SB_KEY) }

async function fetchOddsForSport(sport) {
  const url = `${ODDS_BASE}/sports/${sport}/odds/?apiKey=${ODDS_API_KEY}&regions=eu&markets=h2h,totals,btts&oddsFormat=decimal&dateFormat=iso`
  const res = await fetch(url)
  const remaining = res.headers.get('x-requests-remaining')
  console.log(`[OddsAPI] ${sport} | remaining: ${remaining}`)
  if (res.status === 401) throw new Error('Invalid THE_ODDS_API_KEY')
  if (res.status === 422) return [] // sport not available right now
  if (!res.ok) throw new Error(`Odds API HTTP ${res.status}`)
  return res.json()
}

function extractCandidates(games, sport) {
  const now   = Date.now()
  const in48h = now + 48 * 60 * 60 * 1000
  const out   = []
  const leagueName = sport.replace('soccer_', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

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
          // Format pick label nicely
          let pick = outcome.name
          if (mkt.key === 'totals') pick = `${outcome.name} ${outcome.point} Goals`
          if (mkt.key === 'btts') pick = outcome.name === 'Yes' ? 'Both Teams Score' : 'Not Both Teams Score'
          out.push({
            matchId: `${game.id}::${mkt.key}`,
            gameId:  game.id,
            match:   matchLabel,
            league:  leagueName,
            market:  marketLabel,
            pick,
            odds,
            prob,
          })
        }
      }
      break // only use first bookmaker per game to avoid duplicate candidates
    }
  }
  return out
}

async function fetchAllCandidates() {
  const candidates = []

  // Fetch in parallel batches to stay within Netlify's 10s timeout
  for (let i = 0; i < SPORTS.length; i += BATCH_SIZE) {
    const batch = SPORTS.slice(i, i + BATCH_SIZE)
    const results = await Promise.allSettled(batch.map(s => fetchOddsForSport(s)))
    for (let j = 0; j < batch.length; j++) {
      if (results[j].status === 'fulfilled') {
        candidates.push(...extractCandidates(results[j].value, batch[j]))
      } else {
        console.warn(`[OddsAPI] skipping ${batch[j]}: ${results[j].reason?.message}`)
      }
    }
    if (candidates.length >= 30) break
  }

  return candidates
}

function score(c) { return c.prob }

function buildAccu(candidates) {
  const pool = [...candidates].sort((a, b) => score(b) - score(a)).slice(0, 40)
  const co = picks => parseFloat(picks.reduce((a, p) => a * p.odds, 1).toFixed(3))
  const valid = picks => new Set(picks.map(p => p.gameId || p.matchId)).size === picks.length

  // Try 3-folds first
  for (let i = 0; i < pool.length - 2; i++)
    for (let j = i + 1; j < pool.length - 1; j++) {
      if (pool[i].odds * pool[j].odds > TARGET_MAX) continue
      for (let k = j + 1; k < pool.length; k++) {
        const t = [pool[i], pool[j], pool[k]]
        if (!valid(t)) continue
        const total = co(t)
        if (total >= TARGET_MIN && total <= TARGET_MAX) return { selections: t, total_odds: total }
      }
    }

  // Try 2-folds
  for (let i = 0; i < pool.length - 1; i++)
    for (let j = i + 1; j < pool.length; j++) {
      const t = [pool[i], pool[j]]
      if (!valid(t)) continue
      const total = co(t)
      if (total >= TARGET_MIN && total <= TARGET_MAX) return { selections: t, total_odds: total }
    }

  // Last resort: best 2 picks even if outside target band
  if (pool.length >= 2) {
    const t = [pool[0], pool[1]]
    if (valid(t)) return { selections: t, total_odds: co(t) }
  }

  return null
}

// ── Handler ───────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' })

  try {
    if (!ODDS_API_KEY) throw new Error('THE_ODDS_API_KEY not set')
    if (!SB_URL || !SB_KEY) throw new Error('Supabase env vars not set')

    const today = todayISO()
    const { data: existing } = await db().from('daily_accumulators').select('id').eq('date', today).maybeSingle()
    if (existing) return json(200, { message: 'Already generated today', id: existing.id })

    const raw = await fetchAllCandidates()
    console.log(`[Acca] ${raw.length} raw candidates`)

    if (raw.length < 2) throw new Error(`Only ${raw.length} qualifying picks found (need ≥2). Check API key quota or try again tomorrow.`)

    // Dedup: best prob per matchId
    const deduped = Object.values(raw.reduce((acc, c) => {
      const key = `${c.matchId}::${c.pick}`
      if (!acc[key] || score(c) > score(acc[key])) acc[key] = c
      return acc
    }, {}))
    // Ensure no two picks from the same actual game
    // (matchId includes market key, gameId is the raw game id)

    const result = buildAccu(deduped)
    if (!result) throw new Error('Could not build a valid accumulator from available picks.')

    const avgProb    = result.selections.reduce((a, b) => a + b.prob, 0) / result.selections.length
    const confidence = Math.min(85, Math.max(60, Math.round(avgProb * 100)))
    const leagues    = [...new Set(result.selections.map(s => s.league))].join(', ')
    const analysis   = `This ${result.selections.length}-fold accumulator covers ${leagues}. Average implied probability: ${(avgProb * 100).toFixed(0)}%. Combined odds: ${result.total_odds.toFixed(2)}. Confidence: ${confidence}/100. Stake responsibly.`

    const cleanSels = result.selections.map(({ matchId, gameId, prob, ...sel }) => ({ ...sel, probability: prob }))

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
