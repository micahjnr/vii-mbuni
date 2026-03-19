// netlify/functions/groq.js — Groq API proxy with per-IP rate limiting

// Lock CORS to the deployed site. Falls back to wildcard only in local dev
// (when SITE_URL is unset). Set SITE_URL in Netlify env vars → Site settings.
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

// In-memory rate limit store (resets on cold start — good enough for serverless)
// Key: IP, Value: { count, windowStart }
const rateLimitStore = new Map()
const RATE_LIMIT = 30        // max requests
const RATE_WINDOW = 60_000   // per 60 seconds

function isRateLimited(ip) {
  const now = Date.now()
  const entry = rateLimitStore.get(ip)
  if (!entry || now - entry.windowStart > RATE_WINDOW) {
    rateLimitStore.set(ip, { count: 1, windowStart: now })
    return false
  }
  if (entry.count >= RATE_LIMIT) return true
  entry.count++
  return false
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' })

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return json(500, { error: 'GROQ_API_KEY not configured in Netlify env vars' })

  // Rate limiting by IP
  const ip = event.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown'
  if (isRateLimited(ip)) {
    return json(429, { error: 'Too many requests. Please wait a moment before trying again.' })
  }

  let body
  try { body = JSON.parse(event.body || '{}') }
  catch { return json(400, { error: 'Invalid JSON' }) }

  const maxTokens = Math.min(body.max_tokens || 300, 1000)
  const messages = [
    ...(body.system ? [{ role: 'system', content: body.system }] : []),
    ...(body.messages || []),
  ]

  try {
    const MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-70b-versatile', 'llama3-70b-8192']

    let lastError
    for (const model of MODELS) {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.7 }),
        })
        const data = await res.json()
        if (!res.ok) {
          lastError = new Error(data.error?.message || `HTTP ${res.status}`)
          if (res.status === 404 || res.status === 400) continue // try next model
          throw lastError
        }
        const text = data.choices?.[0]?.message?.content?.trim() || ''
        return json(200, { content: [{ type: 'text', text }] })
      } catch (err) {
        lastError = err
        if (err.message?.includes('model') || err.message?.includes('404')) continue
        throw err
      }
    }
    throw lastError
  } catch (err) {
    return json(502, { error: err.message })
  }
}
