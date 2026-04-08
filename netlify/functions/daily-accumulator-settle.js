// netlify/functions/daily-accumulator-settle.js
//
// Automatically settles yesterday's (and today's) pending accumulators
// by fetching live fixture results from API-Football.
//
// Schedule: run at 23:30 UTC daily (after most European matches finish)
// [functions."daily-accumulator-settle"]
// schedule = "30 23 * * *"
//
// Can also be triggered manually:
//   POST /.netlify/functions/daily-accumulator-settle
//   Authorization: Bearer <CRON_SECRET>
//
// How settlement works:
//   1. Load all 'pending' accumulators from the last 2 days
//   2. For each, look up every fixture_id via /fixtures/:id
//   3. Determine whether each pick won based on the final result
//   4. If ALL picks won → status = 'won', else status = 'lost'
//   5. If any fixture hasn't finished yet → leave as 'pending'

const { createClient } = require('@supabase/supabase-js')

const API_KEY  = process.env.API_FOOTBALL_KEY
const API_BASE = 'https://v3.football.api-sports.io'
const SB_URL   = process.env.SUPABASE_URL
const SB_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY

const ALLOWED_ORIGIN = process.env.SITE_URL || '*'
const CORS = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (status, body) => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json', ...CORS },
  body: JSON.stringify(body),
})

function db() {
  return createClient(SB_URL, SB_KEY)
}

// ── API-Football helper ───────────────────────────────────────────
async function apiFetch(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'x-apisports-key': API_KEY },
  })
  const remaining = res.headers.get('x-ratelimit-requests-remaining')
  console.log(`[Settle] API ${path.split('?')[0]} | remaining: ${remaining}`)
  if (res.status === 499 || res.status === 401) throw new Error('Invalid API_FOOTBALL_KEY')
  if (!res.ok) throw new Error(`API-Football HTTP ${res.status}`)
  const data = await res.json()
  if (data.errors && Object.keys(data.errors).length)
    throw new Error(Object.values(data.errors).join(', '))
  return data.response || []
}

// ── Determine if a single pick is a winner ────────────────────────
// Returns true/false/null (null = can't determine yet)
function evaluatePick(sel, fixture) {
  const status = fixture.fixture?.status?.short
  // Not finished yet
  const finishedStatuses = ['FT', 'AET', 'PEN', 'AWD', 'WO']
  if (!finishedStatuses.includes(status)) return null

  const homeGoals = fixture.goals?.home ?? null
  const awayGoals = fixture.goals?.away ?? null
  if (homeGoals === null || awayGoals === null) return null

  const totalGoals = homeGoals + awayGoals
  const market     = (sel.market || '').toLowerCase()
  const pick       = (sel.pick  || '').toLowerCase()

  // ── 1X2 / Match Winner ────────────────────────────────────────
  if (market.includes('1x2') || market.includes('match result') || market.includes('match winner')) {
    if (pick === 'home' || pick === '1') return homeGoals > awayGoals
    if (pick === 'draw' || pick === 'x') return homeGoals === awayGoals
    if (pick === 'away' || pick === '2') return awayGoals > homeGoals
  }

  // ── Draw No Bet ───────────────────────────────────────────────
  if (market.includes('draw no bet')) {
    if (homeGoals === awayGoals) return null // push — treat as pending
    if (pick === 'home' || pick === '1') return homeGoals > awayGoals
    if (pick === 'away' || pick === '2') return awayGoals > homeGoals
  }

  // ── Double Chance ─────────────────────────────────────────────
  if (market.includes('double chance')) {
    if (pick.includes('1x') || pick.includes('home or draw')) return homeGoals >= awayGoals
    if (pick.includes('x2') || pick.includes('draw or away')) return awayGoals >= homeGoals
    if (pick.includes('12') || pick.includes('home or away'))  return homeGoals !== awayGoals
  }

  // ── Over/Under Goals ─────────────────────────────────────────
  if (market.includes('over') || market.includes('under') || market.includes('goals')) {
    const lineMatch = pick.match(/(\d+\.?\d*)/)
    if (!lineMatch) return null
    const line = parseFloat(lineMatch[1])
    if (pick.startsWith('over') || pick.includes('over')) return totalGoals > line
    if (pick.startsWith('under') || pick.includes('under')) return totalGoals < line
    // e.g. pick = "Over 2.5 Goals"
    if (pick.toLowerCase().includes('over'))  return totalGoals > line
    if (pick.toLowerCase().includes('under')) return totalGoals < line
  }

  // ── Both Teams To Score (BTTS) ────────────────────────────────
  if (market.includes('both teams') || market.includes('btts')) {
    const bothScored = homeGoals > 0 && awayGoals > 0
    if (pick === 'yes') return bothScored
    if (pick === 'no')  return !bothScored
  }

  // ── Asian Handicap ────────────────────────────────────────────
  if (market.includes('asian handicap') || market.includes('handicap')) {
    const handicapMatch = pick.match(/([+-]?\d+\.?\d*)/)
    if (!handicapMatch) return null
    const handicap = parseFloat(handicapMatch[1])
    if (pick.toLowerCase().includes('home') || pick.match(/^[+-]/)) {
      const adjusted = homeGoals + handicap - awayGoals
      if (adjusted > 0)  return true
      if (adjusted < 0)  return false
      return null // push
    }
    if (pick.toLowerCase().includes('away')) {
      const adjusted = awayGoals + handicap - homeGoals
      if (adjusted > 0)  return true
      if (adjusted < 0)  return false
      return null // push
    }
  }

  // ── Half-Time Result ──────────────────────────────────────────
  if (market.includes('half') || market.includes('ht')) {
    const htHome = fixture.score?.halftime?.home ?? null
    const htAway = fixture.score?.halftime?.away ?? null
    if (htHome === null || htAway === null) return null
    if (pick === 'home' || pick === '1') return htHome > htAway
    if (pick === 'draw' || pick === 'x') return htHome === htAway
    if (pick === 'away' || pick === '2') return htAway > htHome
  }

  // Unknown market — can't auto-settle
  console.warn(`[Settle] Unknown market: "${sel.market}" pick: "${sel.pick}" — skipping`)
  return null
}

// ── Main settlement logic ─────────────────────────────────────────
async function settleAccumulators() {
  if (!API_KEY)  throw new Error('API_FOOTBALL_KEY not set')
  if (!SB_URL || !SB_KEY) throw new Error('Supabase env vars missing')

  // Look back 2 days (some accas from yesterday may still be live)
  const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const { data: pending, error: fetchErr } = await db()
    .from('daily_accumulators')
    .select('*')
    .eq('status', 'pending')
    .gte('date', cutoff)

  if (fetchErr) throw new Error(`Supabase fetch error: ${fetchErr.message}`)
  if (!pending || pending.length === 0) {
    console.log('[Settle] No pending accumulators to settle.')
    return { settled: 0, still_pending: 0 }
  }

  console.log(`[Settle] Found ${pending.length} pending acca(s) to check`)

  const results = { settled_won: [], settled_lost: [], still_pending: [] }

  for (const acca of pending) {
    const selections = acca.selections || []

    // Collect fixture IDs — must have been saved by the generate function
    const fixtureIds = [...new Set(
      selections
        .map(s => s.fixture_id)
        .filter(id => id && !isNaN(Number(id)))
        .map(Number)
    )]

    if (fixtureIds.length === 0) {
      console.warn(`[Settle] Acca ${acca.id} has no fixture_ids — cannot auto-settle. Mark manually.`)
      results.still_pending.push(acca.id)
      continue
    }

    // Fetch each fixture result
    let allFinished = true
    let allWon      = true

    for (const fixtureId of fixtureIds) {
      let fixtureData
      try {
        fixtureData = await apiFetch(`/fixtures?id=${fixtureId}`)
      } catch (err) {
        console.warn(`[Settle] Could not fetch fixture ${fixtureId}: ${err.message}`)
        allFinished = false
        break
      }

      if (!fixtureData.length) {
        console.warn(`[Settle] No data returned for fixture ${fixtureId}`)
        allFinished = false
        break
      }

      const fixture = fixtureData[0]
      const status  = fixture.fixture?.status?.short
      console.log(`[Settle] Fixture ${fixtureId} status: ${status}`)

      // Find all selections for this fixture
      const relatedPicks = selections.filter(s => Number(s.fixture_id) === fixtureId)

      for (const sel of relatedPicks) {
        const outcome = evaluatePick(sel, fixture)
        if (outcome === null) {
          console.log(`[Settle]   → ${sel.market} "${sel.pick}" — not finished or unknown`)
          allFinished = false
        } else if (outcome === false) {
          console.log(`[Settle]   → ${sel.market} "${sel.pick}" — LOST`)
          allWon = false
        } else {
          console.log(`[Settle]   → ${sel.market} "${sel.pick}" — WON`)
        }
      }

      if (!allFinished) break
    }

    if (!allFinished) {
      console.log(`[Settle] Acca ${acca.id} — still in play, leaving as pending`)
      results.still_pending.push(acca.id)
      continue
    }

    const newStatus = allWon ? 'won' : 'lost'
    const { error: updateErr } = await db()
      .from('daily_accumulators')
      .update({ status: newStatus })
      .eq('id', acca.id)

    if (updateErr) {
      console.error(`[Settle] Failed to update ${acca.id}: ${updateErr.message}`)
    } else {
      console.log(`[Settle] ✅ Acca ${acca.id} → ${newStatus.toUpperCase()}`)
      if (newStatus === 'won') results.settled_won.push(acca.id)
      else results.settled_lost.push(acca.id)
    }
  }

  return {
    settled_won:  results.settled_won.length,
    settled_lost: results.settled_lost.length,
    still_pending: results.still_pending.length,
    details: results,
  }
}

// ── Handler ───────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }

  // Auth check (same secret as other cron jobs)
  const secret = process.env.CRON_SECRET
  if (secret) {
    const token = (event.headers['authorization'] || event.headers['Authorization'] || '')
      .replace(/^Bearer\s+/i, '').trim()
    if (token !== secret) return json(401, { error: 'Unauthorized' })
  }

  try {
    const result = await settleAccumulators()
    console.log('[Settle] Done:', result)
    return json(200, result)
  } catch (err) {
    console.error('[Settle] ❌', err.message)
    return json(500, { error: err.message })
  }
}
