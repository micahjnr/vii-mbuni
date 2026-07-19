// netlify/functions/push-subscribe-fcm.js
// Saves/removes a native app's FCM device token — the native-app equivalent
// of push-subscribe.js (which handles browser Web Push subscriptions).

const { createClient } = require('@supabase/supabase-js')

const ALLOWED_ORIGIN = process.env.SITE_URL || process.env.URL || '*'
const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
}

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', ...CORS },
  body: JSON.stringify(body),
})

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[push-subscribe-fcm] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    return json(500, { error: 'Server misconfigured' })
  }

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  let body
  try { body = JSON.parse(event.body || '{}') }
  catch { return json(400, { error: 'Invalid JSON' }) }

  const { user_id, token } = body

  console.log('[push-subscribe-fcm] Method:', event.httpMethod, 'user_id:', user_id)

  if (!user_id) return json(400, { error: 'user_id is required' })
  if (!token)   return json(400, { error: 'token is required' })

  if (event.httpMethod === 'DELETE') {
    const { error } = await sb.from('fcm_tokens').delete().eq('token', token)
    if (error) {
      console.error('[push-subscribe-fcm] DELETE error:', error.message)
      return json(500, { error: error.message })
    }
    console.log('[push-subscribe-fcm] Deleted token for user:', user_id)
    return json(200, { ok: true })
  }

  if (event.httpMethod === 'POST') {
    const { error } = await sb
      .from('fcm_tokens')
      .upsert(
        { user_id, token, updated_at: new Date().toISOString() },
        { onConflict: 'token' }
      )
    if (error) {
      console.error('[push-subscribe-fcm] Upsert error:', error.message)
      return json(500, { error: error.message })
    }
    console.log('[push-subscribe-fcm] Saved token for user:', user_id)
    return json(200, { ok: true })
  }

  return json(405, { error: 'Method Not Allowed' })
}
