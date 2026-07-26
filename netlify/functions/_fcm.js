// netlify/functions/_fcm.js
// Minimal Firebase Cloud Messaging (HTTP v1) client using a service account.
// Deliberately avoids the firebase-admin package (large, slow cold starts on
// serverless) — just crypto + fetch to sign a short-lived OAuth2 JWT and
// call the FCM REST API directly.
//
// The service account key itself is loaded from a private Supabase Storage
// bucket at runtime — NOT from an env var. Netlify injects every env var
// into every function's AWS Lambda config, which has a hard 4KB total
// limit; this key alone (~2KB RSA private key) plus the project's other
// ~15 env vars blows past that and breaks every function's deploy, not
// just this one. See: https://ntl.fyi/functions-migrate

const crypto = require('crypto')
const { createClient } = require('@supabase/supabase-js')

const SERVICE_ACCOUNT_BUCKET = 'secrets'
const SERVICE_ACCOUNT_PATH = 'firebase-service-account.json'

// Cached across warm invocations of the same function instance — fetched
// from Supabase Storage once per cold start, not on every push.
let cachedServiceAccount = null
let loadFailed = false // avoid hammering Storage every call if the file is missing/misconfigured

/**
 * Loads (and caches) the Firebase service account JSON from a private
 * Supabase Storage bucket. Returns null if unavailable — callers should
 * treat FCM as "not configured" rather than throwing, so Web Push keeps
 * working even if this is broken.
 */
async function getServiceAccount() {
  if (cachedServiceAccount) return cachedServiceAccount
  if (loadFailed) return null

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[_fcm] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set — cannot load Firebase credentials')
    loadFailed = true
    return null
  }

  try {
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    const { data, error } = await sb.storage.from(SERVICE_ACCOUNT_BUCKET).download(SERVICE_ACCOUNT_PATH)
    if (error) throw error

    const text = await data.text()
    cachedServiceAccount = JSON.parse(text)
    return cachedServiceAccount
  } catch (e) {
    console.error('[_fcm] Failed to load Firebase service account from Supabase Storage:', e.message)
    loadFailed = true
    return null
  }
}

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

// Cache the access token across warm invocations of the same function
// instance — avoids re-authenticating on every single push.
let cachedToken = null // { accessToken, expiresAt }

async function getAccessToken(serviceAccount) {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) {
    return cachedToken.accessToken
  }

  const header = { alg: 'RS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const claims = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }

  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), serviceAccount.private_key)
  const jwt = `${unsigned}.${base64url(signature)}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error('FCM auth failed: ' + JSON.stringify(data))

  cachedToken = { accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 }
  return data.access_token
}

/**
 * Sends a single FCM push to a device token.
 * Returns { ok, status, result }. On a 404 (unregistered token), the caller
 * should delete that token from the database.
 */
async function sendFcm(serviceAccount, token, { title, body, data, icon }) {
  const accessToken = await getAccessToken(serviceAccount)

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        message: {
          token,
          notification: {
            title,
            body,
            ...(icon && icon.startsWith('https://') ? { image: icon } : {}),
          },
          // FCM data payload values must all be strings
          data: Object.fromEntries(
            Object.entries(data || {})
              .filter(([, v]) => v !== undefined && v !== null)
              .map(([k, v]) => [k, String(v)])
          ),
          android: {
            priority: 'high',
            notification: {
              // Matches the channel created in MainActivity.java —
              // must already exist on-device or the OS silently drops
              // these fields (falls back to its own default channel).
              channel_id:  'general',
              color:       '#C8102E',
              default_sound:    true,
              default_vibrate_timings: true,
              notification_priority: 'PRIORITY_HIGH',
              visibility:  'PUBLIC',
            },
          },
        },
      }),
    }
  )

  const result = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, result }
}

module.exports = { sendFcm, getServiceAccount }
