// netlify/functions/phone-signup.js
// Creates a phone user with email_confirm=true so they can log in immediately
// without needing to confirm a synthetic email address.
// Uses the Supabase service role key — NEVER expose this to the browser.

const ALLOWED_ORIGIN = process.env.SITE_URL || '*'
const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', ...CORS },
  body: JSON.stringify(body),
})

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' })

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json(500, { error: 'Server misconfiguration: missing Supabase env vars' })
  }

  let body
  try { body = JSON.parse(event.body) }
  catch { return json(400, { error: 'Invalid JSON body' }) }

  const { email, password, full_name, username, phone_number } = body
  if (!email || !password || !full_name || !username || !phone_number) {
    return json(400, { error: 'Missing required fields' })
  }

  // Create user via Admin API with email_confirm: true — bypasses confirmation email
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,   // ← this is the key fix
      user_metadata: { full_name, username, phone_number },
    }),
  })

  const data = await res.json()

  if (!res.ok) {
    // "User already registered" → tell the client so they can show a proper message
    return json(res.status, { error: data.message || data.msg || 'Signup failed' })
  }

  return json(200, { user: data })
}
