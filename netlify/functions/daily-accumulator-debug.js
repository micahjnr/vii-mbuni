// netlify/functions/daily-accumulator-debug.js
// GET /.netlify/functions/daily-accumulator-debug
// Temporary debug endpoint — remove after fixing

const { createClient } = require('@supabase/supabase-js')

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}
const json = (status, body) => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json', ...CORS },
  body: JSON.stringify(body, null, 2),
})

const API_KEY  = process.env.API_FOOTBALL_KEY
const API_BASE = 'https://v3.football.api-sports.io'

async function apiFetch(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'x-apisports-key': API_KEY }
  })
  const remaining = res.headers.get('x-ratelimit-requests-remaining')
  const data = await res.json()
  return { remaining, status: res.status, data }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }

  if (!API_KEY) return json(500, { error: 'API_FOOTBALL_KEY not set' })

  const today    = new Date().toISOString().slice(0, 10)
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const dayAfter = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10)

  // Fetch fixtures for today
  const todayRes    = await apiFetch(`/fixtures?date=${today}&timezone=UTC`)
  const tomorrowRes = await apiFetch(`/fixtures?date=${tomorrow}&timezone=UTC`)
  const dayAfterRes = await apiFetch(`/fixtures?date=${dayAfter}&timezone=UTC`)

  const summarise = (res, label) => {
    const fixtures = res.data?.response || []
    const ns = fixtures.filter(f => f.fixture?.status?.short === 'NS')
    const byLeague = {}
    ns.forEach(f => {
      const key = `${f.league.id} — ${f.league.name}`
      byLeague[key] = (byLeague[key] || 0) + 1
    })
    return {
      date: label,
      apiStatus: res.status,
      remainingRequests: res.remaining,
      totalFixtures: fixtures.length,
      notStarted: ns.length,
      leaguesWithNSFixtures: byLeague,
    }
  }

  // Also check odds for first 3 NS fixtures today
  const todayFixtures = (todayRes.data?.response || [])
    .filter(f => f.fixture?.status?.short === 'NS')
    .slice(0, 3)

  const oddsResults = []
  for (const f of todayFixtures) {
    const o1 = await apiFetch(`/odds?fixture=${f.fixture.id}&bookmaker=8`)
    const o2 = await apiFetch(`/odds?fixture=${f.fixture.id}`)
    oddsResults.push({
      fixture: `${f.teams.home.name} vs ${f.teams.away.name}`,
      league: f.league.name,
      leagueId: f.league.id,
      bookmaker8HasOdds: (o1.data?.response?.length || 0) > 0,
      anyBookmakerHasOdds: (o2.data?.response?.length || 0) > 0,
      bookmakerCount: o2.data?.response?.[0]?.bookmakers?.length || 0,
      sampleBets: o2.data?.response?.[0]?.bookmakers?.[0]?.bets?.slice(0,2)?.map(b => ({
        name: b.name,
        values: b.values?.slice(0,3)
      })) || []
    })
  }

  return json(200, {
    apiKeySet: !!API_KEY,
    today:    summarise(todayRes,    today),
    tomorrow: summarise(tomorrowRes, tomorrow),
    dayAfter: summarise(dayAfterRes, dayAfter),
    oddsSample: oddsResults,
  })
}
