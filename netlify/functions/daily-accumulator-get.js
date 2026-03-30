// netlify/functions/daily-accumulator-get.js
// GET /api/daily-accumulator  →  returns today's accumulator (or 404)

const { createClient } = require('@supabase/supabase-js')
const { todayISO } = require('./accumulator-service')

const ALLOWED_ORIGIN = process.env.SITE_URL || '*'
const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

const json = (status, body) => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json', ...CORS },
  body: JSON.stringify(body),
})

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
  if (event.httpMethod !== 'GET')  return json(405, { error: 'Method not allowed' })

  try {
    const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

    const date = event.queryStringParameters?.date || todayISO()

    const { data, error } = await db
      .from('daily_accumulators')
      .select('*')
      .eq('date', date)
      .maybeSingle()

    if (error) return json(500, { error: error.message })
    if (!data) return json(404, { error: `No accumulator found for ${date}` })

    return json(200, data)
  } catch (err) {
    console.error('[GET accumulator]', err)
    return json(500, { error: err.message })
  }
}
