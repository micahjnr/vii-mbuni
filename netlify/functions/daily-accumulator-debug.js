// netlify/functions/daily-accumulator-debug.js
// GET /.netlify/functions/daily-accumulator-debug
//
// ⚠️ This calls the live (metered/paid-tier) Odds API on every request.
// It is gated behind CRON_SECRET so it can't be hit by randoms to burn
// your API quota or leak your remaining-requests count.

const CORS = {
  'Access-Control-Allow-Origin': process.env.SITE_URL || process.env.URL || '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}
const json = (status, body) => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json', ...CORS },
  body: JSON.stringify(body, null, 2),
})

const ODDS_API_KEY = process.env.THE_ODDS_API_KEY
const ODDS_BASE    = 'https://api.the-odds-api.com/v4'

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
  if (!ODDS_API_KEY) return json(500, { error: 'THE_ODDS_API_KEY not set in Netlify env vars' })

  const secret = process.env.CRON_SECRET
  if (secret) {
    const token = (event.headers['authorization'] || event.headers['Authorization'] || '').replace(/^Bearer\s+/i,'').trim()
    if (token !== secret) return json(401, { error: 'Unauthorized' })
  }

  const sportsRes  = await fetch(`${ODDS_BASE}/sports/?apiKey=${ODDS_API_KEY}`)
  const remaining  = sportsRes.headers.get('x-requests-remaining')
  const sportsData = await sportsRes.json()

  if (!sportsRes.ok) return json(500, { error: sportsData.message || 'API key invalid', remaining })

  const activeSports = sportsData.filter(s => s.active && s.group === 'Soccer').map(s => s.key)

  let sampleOdds = []
  if (activeSports.length > 0) {
    const sample     = await fetch(`${ODDS_BASE}/sports/${activeSports[0]}/odds/?apiKey=${ODDS_API_KEY}&regions=eu&markets=h2h&oddsFormat=decimal`)
    const sampleData = await sample.json()
    sampleOdds = (Array.isArray(sampleData) ? sampleData : []).slice(0, 2).map(g => ({
      match:      `${g.home_team} vs ${g.away_team}`,
      commence:   g.commence_time,
      bookmakers: g.bookmakers?.length || 0,
      sampleOdds: g.bookmakers?.[0]?.markets?.[0]?.outcomes?.map(o => `${o.name}: ${o.price}`) || [],
    }))
  }

  return json(200, {
    apiKeySet: true,
    remainingRequests: remaining,
    activeSoccerSports: activeSports,
    sampleOdds,
  })
}
