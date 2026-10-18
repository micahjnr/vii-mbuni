// netlify/functions/lib/_groq.js
// Shared Groq chat helper with model fallback.
// Groq retires models regularly (llama-3.3-70b-versatile was decommissioned
// 2026-08-16). Override without a code change via the GROQ_MODEL env var
// (comma-separated list is allowed, tried in order).
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

const DEFAULT_MODELS = [
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'qwen/qwen3.6-27b',
]

function modelList() {
  const env = (process.env.GROQ_MODEL || '').split(',').map(s => s.trim()).filter(Boolean)
  return [...env, ...DEFAULT_MODELS.filter(m => !env.includes(m))]
}

// Reasoning models spend part of max_tokens on hidden thinking, so give headroom
// and keep reasoning short + out of the reply.
function buildBody(model, messages, maxTokens, temperature) {
  const body = { model, messages, temperature, max_tokens: maxTokens }
  if (model.startsWith('openai/gpt-oss')) {
    body.max_tokens = maxTokens + 400
    body.reasoning_effort = 'low'
    body.include_reasoning = false
  } else if (model.startsWith('qwen/')) {
    body.max_tokens = maxTokens + 800
  }
  return body
}

const clean = t => (t || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim()

async function groqChat({ messages, maxTokens = 300, temperature = 0.7 }) {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw Object.assign(new Error('GROQ_API_KEY not configured'), { status: 500 })

  let lastError
  for (const model of modelList()) {
    try {
      const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(buildBody(model, messages, maxTokens, temperature)),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        lastError = new Error(`[${model}] ${data.error?.message || 'HTTP ' + res.status}`)
        lastError.status = res.status
        // Bad key / rate limit: another model won't help. Model gone / bad params: try next.
        if (res.status === 401 || res.status === 403 || res.status === 429) throw lastError
        console.warn('[groq] model failed, trying next:', lastError.message)
        continue
      }
      const text = clean(data.choices?.[0]?.message?.content)
      if (!text) {
        lastError = new Error(`[${model}] empty response`)
        continue
      }
      return { text, model }
    } catch (err) {
      if (err.status === 401 || err.status === 403 || err.status === 429) throw err
      lastError = err
    }
  }
  throw lastError || new Error('No Groq model available')
}

module.exports = { groqChat, modelList }
