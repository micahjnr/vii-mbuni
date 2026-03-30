// netlify/functions/daily-accumulator-generate.js
// POST /api/daily-accumulator/generate  →  generates and stores a new accumulator
// Protected: requires Authorization: Bearer <CRON_SECRET> or service role key

const { generateDailyAccumulator } = require('./accumulator-service')

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

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST')    return json(405, { error: 'Method not allowed' })

  // ── Auth guard ────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = event.headers['authorization'] || event.headers['Authorization'] || ''
    const token = auth.replace(/^Bearer\s+/i, '').trim()
    if (token !== cronSecret) return json(401, { error: 'Unauthorized' })
  }

  try {
    const result = await generateDailyAccumulator()

    if (result.skipped) {
      return json(200, { message: 'Accumulator already exists for today', id: result.id })
    }

    return json(201, result)
  } catch (err) {
    console.error('[POST generate accumulator]', err)
    return json(500, { error: err.message })
  }
}
