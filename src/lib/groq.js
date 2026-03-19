/**
 * Shared helper for calling the Groq serverless function.
 * Centralised here so PostCard, AIAssistant, CreatePostModal, Reels etc.
 * all use the same logic and there is no duplicated fetch boilerplate.
 *
 * askGroq(prompt, opts)          – single-turn (string prompt)
 * callGroq(messages, system, maxTokens) – multi-turn (array of {role,content})
 */

const DEFAULT_SYSTEM = 'You are a social media assistant. Be concise, natural, and ready-to-use. No preamble.'

export async function askGroq(prompt, { system, maxTokens = 200 } = {}) {
  return callGroq(
    [{ role: 'user', content: prompt }],
    system ?? DEFAULT_SYSTEM,
    maxTokens
  )
}

export async function callGroq(messages, system = '', maxTokens = 800) {
  const res = await fetch('/.netlify/functions/groq', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, system, max_tokens: maxTokens }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'AI error')
  return data.content?.[0]?.text?.trim() || ''
}
