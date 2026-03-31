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

  return json(200, {
    apiKeySet: !!API_KEY,
    today:    summarise(todayRes,    today),
    tomorrow: summarise(tomorrowRes, tomorrow),
    dayAfter: summarise(dayAfterRes, dayAfter),
  })
}
