// Returns TURN + STUN servers for WebRTC calls.
//
// Environment variables (set in Netlify → Site settings → Environment variables):
//   METERED_API_KEY       — Your Metered.ca API key for production TURN credentials
//   METERED_DOMAIN        — Your Metered domain (default: vii-mbuni.metered.live)
//   TURN_USERNAME         — Free-tier relay.metered.ca username (fallback)
//   TURN_CREDENTIAL       — Free-tier relay.metered.ca credential (fallback)
//
// Without METERED_API_KEY, falls back to open public STUN/TURN servers.
// The relay.metered.ca free-tier credentials MUST be stored in env vars — never hardcoded.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }

  const apiKey = process.env.METERED_API_KEY

  // Read relay.metered.ca free-tier creds from env vars (never hardcode these)
  const turnUser = process.env.TURN_USERNAME
  const turnCred = process.env.TURN_CREDENTIAL

  // Base STUN servers — always safe to include, no credentials needed
  const stunServers = [
    // STUN — Google (reliable, widely reachable)
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    // STUN — Cloudflare (good for Africa/mobile)
    { urls: 'stun:stun.cloudflare.com:3478' },
  ]

  // openrelay — well-known public credentials, not secret
  const openRelayServers = [
    { urls: 'turn:openrelay.metered.ca:80',                username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443',               username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turns:openrelay.metered.ca:443',              username: 'openrelayproject', credential: 'openrelayproject' },
  ]

  // relay.metered.ca free-tier — credentials loaded from env vars only
  const relayServers = turnUser && turnCred ? [
    { urls: 'turn:relay.metered.ca:80',                    username: turnUser, credential: turnCred },
    { urls: 'turn:relay.metered.ca:443',                   username: turnUser, credential: turnCred },
    { urls: 'turns:relay.metered.ca:443?transport=tcp',    username: turnUser, credential: turnCred },
  ] : []

  const fallback = [...stunServers, ...openRelayServers, ...relayServers]

  // If no Metered API key, return the fallback set
  if (!apiKey) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify(fallback) }
  }

  // Fetch fresh, short-lived credentials from Metered API
  const domain = process.env.METERED_DOMAIN || 'vii-mbuni.metered.live'
  try {
    const res = await fetch(`https://${domain}/api/v1/turn/credentials?apiKey=${apiKey}`)
    const servers = await res.json()
    if (!Array.isArray(servers) || servers.length === 0) throw new Error('Invalid Metered response')
    return { statusCode: 200, headers: CORS, body: JSON.stringify(servers) }
  } catch {
    return { statusCode: 200, headers: CORS, body: JSON.stringify(fallback) }
  }
}
