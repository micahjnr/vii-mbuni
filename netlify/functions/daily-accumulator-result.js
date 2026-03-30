// netlify/functions/daily-accumulator-result.js
// PATCH /api/daily-accumulator-result?id=<uuid>
// Body: { "status": "won" | "lost" }
// Protected: Authorization: Bearer <CRON_SECRET>

const { createClient } = require('@supabase/supabase-js')

const ALLOWED_ORIGIN = process.env.SITE_URL || '*'
const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'PATCH, OPTIONS',
}

const json = (status, body) => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json', ...CORS },
  body: JSON.stringify(body),
})

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
  if (event.httpMethod !== 'PATCH')   return json(405, { error: 'Method not allowed' })

  // ── Auth guard ────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = event.headers['authorization'] || event.headers['Authorization'] || ''
    const token = auth.replace(/^Bearer\s+/i, '').trim()
    if (token !== cronSecret) return json(401, { error: 'Unauthorized' })
  }

  const id = event.queryStringParameters?.id
  if (!id) return json(400, { error: 'Missing ?id= query parameter' })

  let body
  try { body = JSON.parse(event.body || '{}') }
  catch { return json(400, { error: 'Invalid JSON body' }) }

  const { status } = body
  if (!['won', 'lost'].includes(status)) {
    return json(400, { error: 'status must be "won" or "lost"' })
  }

  try {
    const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

    const { data, error } = await db
      .from('daily_accumulators')
      .update({ status })
      .eq('id', id)
      .select()
      .single()

    if (error) return json(500, { error: error.message })
    if (!data)  return json(404, { error: `Accumulator ${id} not found` })

    return json(200, data)
  } catch (err) {
    console.error('[PATCH accumulator result]', err)
    return json(500, { error: err.message })
  }
}
