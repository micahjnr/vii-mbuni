// netlify/functions/phone-confirm.js
// Confirms an existing unconfirmed phone user's synthetic email via the Admin API.
// Called automatically by the Login page when "Email not confirmed" is returned.
// Uses the service role key — NEVER expose this to the browser.

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

  const { email } = body
  if (!email || !email.includes('@phone.vii-mbuni.app')) {
    return json(400, { error: 'Invalid phone user email' })
  }

  // 1. Find the user by email
  const listRes = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`,
    {
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
    }
  )
  const listData = await listRes.json()
  const user = listData?.users?.find(u => u.email === email)

  if (!user) return json(404, { error: 'User not found. Please sign up again.' })

  // 2. Confirm their email via PATCH
  const patchRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ email_confirm: true }),
  })

  const patchData = await patchRes.json()
  if (!patchRes.ok) {
    return json(patchRes.status, { error: patchData.message || 'Failed to confirm account' })
  }

  return json(200, { confirmed: true })
}
