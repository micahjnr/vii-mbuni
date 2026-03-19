// netlify/functions/push-reply.js
// Handles inline replies from push notification action buttons.
// Called by the service worker when the user replies directly from the notification tray.
// Auth: uses the user's Supabase JWT (Bearer token) stored in notification data.

const { createClient } = require('@supabase/supabase-js')

const ALLOWED_ORIGIN = process.env.SITE_URL || '*'
const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', ...CORS },
  body: JSON.stringify(body),
})

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST')    return json(405, { error: 'Method Not Allowed' })

  // Auth: verify the user's JWT
  const authHeader = event.headers['authorization'] || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return json(401, { error: 'Missing Authorization header' })

  let body
  try { body = JSON.parse(event.body || '{}') }
  catch { return json(400, { error: 'Invalid JSON' }) }

  const { receiverId, content } = body

  if (!receiverId || !content?.trim()) {
    return json(400, { error: 'Missing receiverId or content' })
  }

  // Use the user's JWT to create an authenticated Supabase client
  // This ensures RLS policies apply — the user can only send as themselves
  const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )

  // Verify who the user is from the JWT
  const { data: { user }, error: authError } = await sb.auth.getUser()
  if (authError || !user) {
    console.error('[push-reply] Auth error:', authError?.message)
    return json(401, { error: 'Invalid or expired token' })
  }

  const { error: insertError } = await sb.from('messages').insert({
    sender_id:   user.id,
    receiver_id: receiverId,
    content:     content.trim(),
  })

  if (insertError) {
    console.error('[push-reply] Insert error:', insertError.message)
    return json(500, { error: insertError.message })
  }

  console.log('[push-reply] Reply sent from', user.id, 'to', receiverId)
  return json(200, { ok: true })
}
