// netlify/functions/push-subscribe.js
// Saves a Web Push subscription to Supabase for a given user.
// Called by the frontend after the user grants notification permission.

const { createClient } = require('@supabase/supabase-js')

const ALLOWED_ORIGIN = process.env.SITE_URL || '*'
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

  // Validate env vars
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[push-subscribe] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    return json(500, { error: 'Server misconfigured' })
  }

  const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  let body
  try { body = JSON.parse(event.body || '{}') }
  catch { return json(400, { error: 'Invalid JSON' }) }

  const { user_id, subscription } = body

  console.log('[push-subscribe] Method:', event.httpMethod, 'user_id:', user_id)
  console.log('[push-subscribe] Subscription keys present:', {
    endpoint: !!subscription?.endpoint,
    p256dh:   !!subscription?.keys?.p256dh,
    auth:     !!subscription?.keys?.auth,
  })

  if (!user_id) {
    return json(400, { error: 'user_id is required' })
  }
  if (!subscription?.endpoint) {
    return json(400, { error: 'subscription.endpoint is required' })
  }

  if (event.httpMethod === 'DELETE') {
    const { error } = await sb
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', subscription.endpoint)
    if (error) {
      console.error('[push-subscribe] DELETE error:', error.message)
      return json(500, { error: error.message })
    }
    console.log('[push-subscribe] Deleted subscription for user:', user_id)
    return json(200, { ok: true })
  }

  if (event.httpMethod === 'POST') {
    const p256dh = subscription.keys?.p256dh || null
    const auth   = subscription.keys?.auth   || null

    if (!p256dh || !auth) {
      console.error('[push-subscribe] Missing keys — p256dh:', p256dh, 'auth:', auth)
      return json(400, { error: 'subscription.keys.p256dh and auth are required' })
    }

    const { error } = await sb
      .from('push_subscriptions')
      .upsert(
        {
          user_id,
          endpoint:   subscription.endpoint,
          p256dh,
          auth,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'endpoint' }
      )

    if (error) {
      console.error('[push-subscribe] Upsert error:', error.message, error.details)
      return json(500, { error: error.message })
    }

    console.log('[push-subscribe] Saved subscription for user:', user_id)
    return json(200, { ok: true })
  }

  return json(405, { error: 'Method Not Allowed' })
}
