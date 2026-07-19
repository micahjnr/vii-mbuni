// netlify/functions/_fcm.js
// Minimal Firebase Cloud Messaging (HTTP v1) client using a service account.
// Deliberately avoids the firebase-admin package (large, slow cold starts on
// serverless) — just crypto + fetch to sign a short-lived OAuth2 JWT and
// call the FCM REST API directly.

const crypto = require('crypto')

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
          android: { priority: 'high' },
        },
      }),
    }
  )

  const result = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, result }
}

module.exports = { sendFcm }
