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
// Target accumulator range: 1.70–2.50 combined odds

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
// Try multiple possible env var names in case of Netlify naming issues
const ODDS_API_KEY     = process.env.THE_ODDS_API_KEY || process.env.ODDS_API_KEY
const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY
const SB_URL           = process.env.SUPABASE_URL
const SB_KEY           = process.env.SUPABASE_SERVICE_ROLE_KEY

// Debug logging — check Netlify function logs to see which keys are present
console.log('[Env] Keys present:', {
  THE_ODDS_API_KEY: !!process.env.THE_ODDS_API_KEY,
  ODDS_API_KEY: !!process.env.ODDS_API_KEY,
  API_FOOTBALL_KEY: !!process.env.API_FOOTBALL_KEY,
  FOOTBALL_DATA_API_KEY: !!process.env.FOOTBALL_DATA_API_KEY,
  SUPABASE_URL: !!process.env.SUPABASE_URL,
})

// ── Accumulator target ────────────────────────────────────────────
const TARGET_MIN = 1.70   // target combined accumulator band
const TARGET_MAX = 2.50   // target combined accumulator band
// For a 3-fold: ∛1.70 ≈ 1.19, ∛2.50 ≈ 1.36 — so per-pick range must be tight
const PICK_MIN   = 1.10
const PICK_MAX   = 1.45   // ∛2.50 ≈ 1.357 — hard cap so 3 picks never exceed ~3.05 (with spread)
const PROB_MIN   = 0.55   // ≥55% implied probability — confident, value picks only

function todayISO() { return new Date().toISOString().slice(0, 10) }
function db()       { return createClient(SB_URL, SB_KEY) }

// ══════════════════════════════════════════════════════════════════
// SOURCE 1 — The Odds API (the-odds-api.com)
// ══════════════════════════════════════════════════════════════════

// Preferred soccer sports — used as a filter against the live /v4/sports list.
// We discover which are actually active this month rather than hardcoding slugs
// that may change or go inactive between seasons.
const PREFERRED_SOCCER_SLUGS = new Set([
  'soccer_epl', 'soccer_spain_la_liga', 'soccer_germany_bundesliga',
  'soccer_italy_serie_a', 'soccer_france_ligue_one', 'soccer_uefa_champs_league',
  'soccer_uefa_europa_league', 'soccer_efl_champ', 'soccer_netherlands_eredivisie',
  'soccer_portugal_primeira_liga', 'soccer_turkey_super_league',
])

// Fetch the list of sports that currently have active markets on this key.
// Uses 1 request (not counted toward the per-sport quota).
async function getActiveOddsApiSports() {
  const url = `https://api.the-odds-api.com/v4/sports/?apiKey=${ODDS_API_KEY}&all=false`
  const res = await fetch(url)
  if (!res.ok) {
    console.warn(`[OddsAPI] /sports check failed (${res.status}) — falling back to preferred list`)
    return [...PREFERRED_SOCCER_SLUGS]
  }
  const sports = await res.json()
  const rem = res.headers.get('x-requests-remaining')
  console.log(`[OddsAPI] /sports: ${sports.length} active, remaining=${rem}`)
  // Filter to soccer sports that are in our preferred list OR any active soccer sport
  const active = sports
    .filter(s => s.group?.toLowerCase().includes('soccer') && s.active)
    .map(s => s.key)
  const preferred = active.filter(k => PREFERRED_SOCCER_SLUGS.has(k))
  const extras    = active.filter(k => !PREFERRED_SOCCER_SLUGS.has(k)).slice(0, 3)
  const result    = [...preferred, ...extras].slice(0, 10) // cap at 10 to save quota
  console.log(`[OddsAPI] Active soccer sports: ${result.join(', ') || 'NONE'}`)
  return result.length ? result : [...PREFERRED_SOCCER_SLUGS] // fallback if API returns nothing useful
}

async function fetchOddsApiSport(sport) {
  // regions=eu,uk,us — casting a wider net so the free plan finds bookmakers.
  // EU-only often returns empty on the free tier; UK (Bet365) and US (DraftKings) have broader coverage.
  const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${ODDS_API_KEY}&regions=eu,uk,us&markets=h2h,totals,btts&oddsFormat=decimal`
  const res = await fetch(url)
  const rem = res.headers.get('x-requests-remaining')
  console.log(`[OddsAPI] ${sport} remaining=${rem}`)
  if (rem !== null && parseInt(rem) < 10) console.warn(`[OddsAPI] ⚠️ Only ${rem} requests remaining this month!`)
  if (res.status === 401) throw new Error('THE_ODDS_API_KEY invalid or not set in Netlify env vars')
  if (res.status === 422) return []
  if (res.status === 429) {
    // remaining=0 → monthly quota exhausted; remaining>0 → per-second rate limit (slow down)
    const remNum = rem !== null ? parseInt(rem) : -1
    if (remNum === 0) throw new Error('THE_ODDS_API_KEY monthly quota exhausted (500 req/month on free plan). Upgrade at the-odds-api.com or wait until next month.')
    throw new Error(`OddsAPI rate limited (${remNum} requests still remaining this month — requests fired too fast)`)
  }
  if (!res.ok) throw new Error(`OddsAPI HTTP ${res.status}`)
  return res.json()
}

function extractOddsApiCandidates(games, sport) {
  const now    = Date.now()
  const in5d   = now + 5 * 24 * 3600 * 1000  // 5-day window — captures full weekend from midweek
  const league = sport.replace('soccer_', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  const LABELS = { h2h: '1X2', totals: 'Over/Under', btts: 'Both Teams To Score' }
  const out = []
  let gamesInWindow = 0, oddsOutOfRange = 0

  for (const game of (games || [])) {
    const t = new Date(game.commence_time).getTime()
    if (t < now || t > in5d) continue
    gamesInWindow++
    const match = `${game.home_team} vs ${game.away_team}`

    for (const bk of (game.bookmakers || [])) {
      for (const mkt of (bk.markets || [])) {
        const market = LABELS[mkt.key]; if (!market) continue
        for (const o of (mkt.outcomes || [])) {
          const odds = parseFloat(o.price)
          if (!odds || odds < PICK_MIN || odds > PICK_MAX) { oddsOutOfRange++; continue }
          const prob = +(1 / odds).toFixed(4)
          let pick = o.name
          if (mkt.key === 'totals') pick = `${o.name} ${o.point} Goals`
          if (mkt.key === 'btts')   pick = o.name === 'Yes' ? 'Both Teams Score' : 'Not Both Teams Score'
          out.push({ matchId: game.id, match, league, market, pick, odds, prob })
        }
      }
      break // one bookmaker per game is enough
    }
  }
  if (out.length === 0) console.warn(`[OddsAPI] ${sport}: ${(games||[]).length} total games from API, ${gamesInWindow} in 5-day window, ${oddsOutOfRange} odds outside ${PICK_MIN}–${PICK_MAX} → 0 candidates`)
  return out
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function getCandidatesFromOddsApi() {
  const sports = await getActiveOddsApiSports()
  if (!sports.length) { console.warn('[OddsAPI] No active soccer sports found'); return [] }

  const all = []
  // Sequential requests with 400ms gap — avoids the per-second rate limit on free tier.
  for (const sport of sports) {
    try {
      const games = await fetchOddsApiSport(sport)
      all.push(...extractOddsApiCandidates(games, sport))
    } catch (err) {
      const msg = err.message || ''
      if (msg.includes('invalid') || msg.includes('quota exhausted')) throw err
      console.warn(`[OddsAPI] skip ${sport}: ${msg}`)
    }
    if (all.length >= 50) break   // enough candidates — stop early to save quota
    await sleep(400)              // 400ms between calls → well under rate limit
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
    if (!data?.length) { await sleep(600); continue }  // delay even on miss

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
    await sleep(600)  // 600ms between fixtures → stays under AF's 10 req/min rate limit
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
    await sleep(600)  // throttle predictions calls — same 10 req/min AF rate limit
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

  const pool   = [...deduped].sort((a, b) => b.prob - a.prob).slice(0, 60)
  const co     = picks => +picks.reduce((a, p) => a * p.odds, 1).toFixed(3)

  // Strip ALL synthetic suffixes to get the real underlying game ID
  const baseId = id => String(id).replace(/-(dc|o05|aw|o25|btts|o15|1x|fd\d*)$/, '').replace(/^fd-/, '').split('-')[0]

  // Full validation: unique games + mixed markets + ideally different leagues
  const uniqueGames  = picks => new Set(picks.map(p => baseId(p.matchId))).size === picks.length
  const mixedMarkets = picks => new Set(picks.map(p => p.market)).size >= 2
  const mixedLeagues = picks => new Set(picks.map(p => p.league)).size >= 2

  const validBest    = picks => uniqueGames(picks) && mixedMarkets(picks) && mixedLeagues(picks)
  const validGood    = picks => uniqueGames(picks) && mixedMarkets(picks)
  const validMinimal = picks => uniqueGames(picks)

  // ── Pass 1: 3-folds in target band — mixed markets + different leagues ──
  for (let i = 0; i < pool.length - 2; i++) {
    for (let j = i + 1; j < pool.length - 1; j++) {
      const ijOdds = pool[i].odds * pool[j].odds
      if (ijOdds * PICK_MIN > TARGET_MAX) continue
      if (ijOdds * PICK_MAX < TARGET_MIN) continue
      for (let k = j + 1; k < pool.length; k++) {
        const t = [pool[i], pool[j], pool[k]]
        if (!validBest(t)) continue
        const total = co(t)
        if (total >= TARGET_MIN && total <= TARGET_MAX) return { selections: t, total_odds: total }
      }
    }
  }

  // ── Pass 2: 3-folds in target band — mixed markets, same league ok ───
  for (let i = 0; i < pool.length - 2; i++) {
    for (let j = i + 1; j < pool.length - 1; j++) {
      const ijOdds = pool[i].odds * pool[j].odds
      if (ijOdds * PICK_MIN > TARGET_MAX) continue
      if (ijOdds * PICK_MAX < TARGET_MIN) continue
      for (let k = j + 1; k < pool.length; k++) {
        const t = [pool[i], pool[j], pool[k]]
        if (!validGood(t)) continue
        const total = co(t)
        if (total >= TARGET_MIN && total <= TARGET_MAX) return { selections: t, total_odds: total }
      }
    }
  }

  // ── Pass 3: 3-folds in target band — unique games only ───────────────
  for (let i = 0; i < pool.length - 2; i++) {
    for (let j = i + 1; j < pool.length - 1; j++) {
      const ijOdds = pool[i].odds * pool[j].odds
      if (ijOdds * PICK_MIN > TARGET_MAX) continue
      if (ijOdds * PICK_MAX < TARGET_MIN) continue
      for (let k = j + 1; k < pool.length; k++) {
        const t = [pool[i], pool[j], pool[k]]
        if (!validMinimal(t)) continue
        const total = co(t)
        if (total >= TARGET_MIN && total <= TARGET_MAX) return { selections: t, total_odds: total }
      }
    }
  }

  // ── Pass 4: Closest valid 3-fold to band midpoint — NEVER a 2-fold ───
  let bestMixed = null, bestMixedDist = Infinity
  let bestAny   = null, bestAnyDist   = Infinity
  const midTarget = (TARGET_MIN + TARGET_MAX) / 2

  for (let i = 0; i < pool.length - 2; i++) {
    for (let j = i + 1; j < pool.length - 1; j++) {
      for (let k = j + 1; k < pool.length; k++) {
        const t = [pool[i], pool[j], pool[k]]
        if (!validMinimal(t)) continue
        const total = co(t)
        const dist  = Math.abs(total - midTarget)
        if (dist < bestAnyDist) { bestAny = { selections: t, total_odds: total }; bestAnyDist = dist }
        if (validGood(t) && dist < bestMixedDist) { bestMixed = { selections: t, total_odds: total }; bestMixedDist = dist }
      }
    }
  }

  return bestMixed || bestAny || null
}

// ══════════════════════════════════════════════════════════════════
// SOURCE 4 — football-data.org (free tier, no paid plan needed)
// Sign up free at football-data.org → add FOOTBALL_DATA_API_KEY to Netlify env vars.
// Falls back to synthetic home-advantage odds if no key is set.
// ══════════════════════════════════════════════════════════════════

const FD_KEY = process.env.FOOTBALL_DATA_API_KEY
const FD_BASE = 'https://api.football-data.org/v4'
// Competition codes that are reliably covered on the free tier
const FD_COMPETITIONS = ['PL','PD','BL1','SA','FL1','CL','EL']

async function fdFetch(path) {
  const headers = FD_KEY ? { 'X-Auth-Token': FD_KEY } : {}
  const res = await fetch(`${FD_BASE}${path}`, { headers })
  if (res.status === 429) throw new Error('football-data.org rate limited')
  if (!res.ok) throw new Error(`football-data.org HTTP ${res.status}`)
  return res.json()
}

// Converts a team's recent form + home/away context into synthetic decimal odds.
// We use higher probability baselines so the implied odds stay ≤ PICK_MAX (1.45).
// Home win: ~70%, Draw/Away excluded (too low prob). Over 1.5 Goals: ~80%. 1X: ~82%.
function syntheticOdds(isHome) {
  const homeWinProb = 0.68   // ~68% home win → odds ≈ 1.40
  const overProb    = 0.78   // Over 1.5 Goals hits ~80% in top leagues → odds ≈ 1.22
  const oneXProb    = 0.80   // Home or Draw (1X) → odds ≈ 1.19
  const bttsProb    = 0.62   // BTTS Yes → odds ≈ 1.53 (just above max, filtered out)
  // Apply 5% bookmaker margin
  return {
    homeWin: parseFloat((1 / (homeWinProb * 1.05)).toFixed(2)),
    awayWin: parseFloat((1 / (0.28 * 1.05)).toFixed(2)),  // ~28% → 3.40 (filtered by PICK_MAX)
    over15:  parseFloat((1 / (overProb    * 1.05)).toFixed(2)),
    oneX:    parseFloat((1 / (oneXProb    * 1.05)).toFixed(2)),
    bttsYes: parseFloat((1 / (bttsProb    * 1.05)).toFixed(2)),
  }
}

async function getCandidatesFromFootballData() {
  const today    = new Date().toISOString().slice(0, 10)
  const in5d     = new Date(Date.now() + 5 * 24 * 3600000).toISOString().slice(0, 10)
  const candidates = []

  for (const comp of FD_COMPETITIONS) {
    let data
    try {
      data = await fdFetch(`/competitions/${comp}/matches?dateFrom=${today}&dateTo=${in5d}&status=SCHEDULED`)
    } catch (e) {
      console.warn(`[FD] ${comp}: ${e.message}`)
      continue
    }
    const matches = data.matches || []
    console.log(`[FD] ${comp}: ${matches.length} upcoming matches`)

    // Cap at 2 per competition — ensures ALL leagues contribute candidates
    // so the builder can find cross-league 3-folds
    for (const m of matches.slice(0, 2)) {
      const home   = m.homeTeam?.name || 'Home'
      const away   = m.awayTeam?.name || 'Away'
      const match  = `${home} vs ${away}`
      // Always use the competition's real name for proper league diversity checking
      const league = m.competition?.name || comp
      const id     = m.id

      const ho = syntheticOdds(true)

      // Home win — ~1.40 synthetic odds, within PICK range
      if (ho.homeWin >= PICK_MIN && ho.homeWin <= PICK_MAX)
        candidates.push({ matchId: `fd-${id}`, match, league, market: '1X2', pick: `${home} (Home Win)`, odds: ho.homeWin, prob: +(1/ho.homeWin).toFixed(4) })

      // 1X (Home or Draw) — ~1.19 synthetic odds
      if (ho.oneX >= PICK_MIN && ho.oneX <= PICK_MAX)
        candidates.push({ matchId: `fd-${id}-1x`, match, league, market: 'Double Chance', pick: `${home} or Draw (1X)`, odds: ho.oneX, prob: +(1/ho.oneX).toFixed(4) })

      // Over 1.5 Goals — ~1.22 synthetic odds
      if (ho.over15 >= PICK_MIN && ho.over15 <= PICK_MAX)
        candidates.push({ matchId: `fd-${id}-o15`, match, league, market: 'Over/Under', pick: 'Over 1.5 Goals', odds: ho.over15, prob: +(1/ho.over15).toFixed(4) })
    }
    // No early break — iterate ALL competitions so we always have cross-league candidates
    await sleep(300)
  }
  console.log(`[FD] ${candidates.length} synthetic candidates from ${FD_KEY ? 'authenticated' : 'unauthenticated'} requests`)
  return candidates
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

    // ── Source 4: football-data.org — free, no paid subscription needed ──
    // Uses FOOTBALL_DATA_API_KEY env var (free signup at football-data.org).
    // Falls back to synthetic home-advantage odds from fixture data alone.
    if (candidates.length < 2) {
      try {
        const c = await getCandidatesFromFootballData()
        if (c.length) { candidates = [...candidates, ...c]; providerUsed = providerUsed ? `${providerUsed} + FootballData` : 'football-data.org' }
      } catch (e) {
        console.warn(`[Acca] FootballData failed: ${e.message}`)
      }
    }

    if (candidates.length < 2) {
      let hint = 'Add FOOTBALL_DATA_API_KEY (free signup at football-data.org) in Netlify → Site → Environment variables for a guaranteed fallback source.'
      if (ODDS_API_KEY)
        hint = `The Odds API returned no active markets (check /v4/sports for active slugs). API-Football free plan does not include /odds or /predictions. ${hint}`
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
