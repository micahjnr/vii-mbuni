// Returns TURN + STUN servers for WebRTC calls.
// Set METERED_API_KEY in Netlify env vars for production credentials.
// Without it, falls back to openrelay.metered.ca free public TURN servers.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }

  const apiKey = process.env.METERED_API_KEY

  // Multi-provider TURN fallback — covers Chrome, Firefox, Safari, mobile
  // Uses multiple independent TURN providers so if one fails another takes over
  const fallback = [
    // STUN — Google (reliable, widely reachable)
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    // STUN — Cloudflare (good for Africa/mobile)
    { urls: 'stun:stun.cloudflare.com:3478' },
    // TURN — openrelay (UDP + TCP + TLS)
    { urls: 'turn:openrelay.metered.ca:80',           username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443',          username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turns:openrelay.metered.ca:443',         username: 'openrelayproject', credential: 'openrelayproject' },
    // TURN — numb.viagenie.ca (independent fallback, good Firefox compat)
    { urls: 'turn:numb.viagenie.ca',                  username: 'webrtc@live.com',  credential: 'muazkh' },
    // TURN — relay.metered.ca free tier
    { urls: 'turn:relay.metered.ca:80',               username: 'e8dd65f0e3ba775cd4dd5c32', credential: 'uKcGEW+NiXL9AQOL' },
    { urls: 'turn:relay.metered.ca:443',              username: 'e8dd65f0e3ba775cd4dd5c32', credential: 'uKcGEW+NiXL9AQOL' },
    { urls: 'turns:relay.metered.ca:443?transport=tcp', username: 'e8dd65f0e3ba775cd4dd5c32', credential: 'uKcGEW+NiXL9AQOL' },
  ]

  if (!apiKey) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify(fallback) }
  }

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
