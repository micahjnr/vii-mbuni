// netlify/functions/zaar-tutor.js
// Zaar AI Tutor — powered by Groq (llama-3.3-70b-versatile)
// Handles all chat turns for the Malam Zaar language tutor feature.

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';
const MAX_TOKENS = 512;
const MAX_HISTORY = 20; // keep last N messages to avoid token bloat

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.SITE_URL || '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export const handler = async (event) => {
  // ── CORS preflight ───────────────────────────────────────────────────────
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  // ── Parse body ───────────────────────────────────────────────────────────
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Invalid JSON' }),
    };
  }

  const { messages = [], systemPrompt, mode, topic } = body;

  if (!messages.length) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'No messages provided' }),
    };
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('[zaar-tutor] GROQ_API_KEY not set');
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'AI service not configured' }),
    };
  }

  // ── Build system prompt ──────────────────────────────────────────────────
  let systemContent = systemPrompt || buildDefaultSystem();

  // Inject mode-specific instructions
  if (mode === 'quiz') {
    systemContent += '\n\nQUIZ MODE: Always give feedback on the user\'s answer first (correct/incorrect + right form). Then immediately give the next quiz question. Keep score mentally and report it every 5 questions.';
  } else if (mode === 'lesson' && topic) {
    systemContent += `\n\nLESSON MODE: You are teaching "${topic}". Stay focused on this topic. Build progressively — introduce words, give examples, then test understanding with a simple question at the end of each turn.`;
  } else if (mode === 'pronunciation') {
    systemContent += '\n\nPRONUNCIATION MODE: Focus on phonetics. Always show IPA or simplified phonetic transcription. Explain tone marks specific to Zaar. Encourage the user to say words aloud.';
  }

  // ── Trim history to avoid large token payloads ──────────────────────────
  const trimmedMessages = messages.slice(-MAX_HISTORY);

  // ── Call Groq ────────────────────────────────────────────────────────────
  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        temperature: 0.7,
        messages: [
          { role: 'system', content: systemContent },
          ...trimmedMessages,
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[zaar-tutor] Groq error:', response.status, errText);
      return {
        statusCode: 502,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'AI service error', detail: response.status }),
      };
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      return {
        statusCode: 502,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Empty response from AI' }),
      };
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ reply }),
    };
  } catch (err) {
    console.error('[zaar-tutor] Fetch error:', err);
    return {
      statusCode: 503,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Could not reach AI service' }),
    };
  }
};

// ── Default system prompt (fallback if client doesn't send one) ──────────
function buildDefaultSystem() {
  return `You are Malam Zaar, a warm and encouraging AI language tutor specialising in the Zaar (Sayawa) language spoken by the Sayawa people of Tafawa Balewa, Bauchi State, Nigeria.

Your responsibilities:
- Teach Zaar vocabulary, grammar, and pronunciation
- Always show Zaar words in bold markdown (**word**), with phonetic pronunciation in brackets, then English meaning
- Use Hausa as a bridge language when helpful
- Be culturally sensitive and celebrate Sayawa heritage
- Keep responses concise and conversational for a mobile chat interface
- Award encouraging praise when the user answers correctly
- Correct mistakes gently with the right Zaar form

Format: **[Zaar word]** (pronunciation) — English meaning
Keep responses under 200 words.`;
}
