// netlify/functions/zaar-tutor.js
// Zaar AI Tutor — powered by Groq (llama-3.3-70b-versatile)
// Handles all chat turns for the Malam Zaar language tutor feature.

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';
const MAX_TOKENS = 600;
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

  const { messages = [], mode, topic } = body;

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
  let systemContent = buildSystem(mode, topic);

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
        temperature: 0.4, // lower = less hallucination
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

// ── Verified Zaar vocabulary extracted from the official Zaar–English–Hausa dictionary
// Source: Zaar (Sayawa) language dictionary, Tafawa Balewa, Bauchi State, Nigeria
// ONLY teach words from this list. Do NOT invent or guess Zaar words.
const VERIFIED_VOCABULARY = `
=== GREETINGS & COMMON PHRASES ===
• sànnú = Hello / Greetings (Hausa: Sannu)
• la:fíya = Health / Fine — used in greetings (Hausa: Lafiya)
• Gàjíya wuri? = How are you? / Lit: Are you tired? (Hausa: Yaya lafiya?)
• Là:fíya kálâw = Very well, thank you (Hausa: Lafiya kalau)
• go:dé = Thank you (Hausa: Na gode) — also: nyá:r
• nyá:r = Thank you (Hausa: Na gode) — e.g. Má: nyá:r! = Thank you!
• ßí:slndi = Morning (Hausa: Safe)
• kávit = Night (Hausa: Dare)
• CoghÑ ga:ghŒ •a = May God bless you (Hausa: Allah ya albarkace ka)
• KŒ vyá: wuri? = Good afternoon / How did you spend the day? — Reply: Là:fíya kálâw
• KŒ mbút tÉ sÉmbËrwà: wuri? = Good morning / How did you spend the night? — Reply: Là:fíya kálâw

=== NUMBERS ===
• nàmbóÑ = One (Hausa: Ɗaya)
• mbÉslŒÑ = Two (Hausa: Biyu)
• mâ:y = Three (Hausa: Uku)
• wupsŒ = Four (Hausa: Huɗu)
• nandam = Five (Hausa: Biyar)
• lim = Six (Hausa: Shida)
• wottsÉmay = Seven (Hausa: Bakwai)
• tá:nta:n = Eight (Hausa: Takwas)
• tóghÑdam = Nine (Hausa: Tara)
• dzúp = Ten (Hausa: Goma)
• ku:ri = Hundred (Hausa: Ɗari)
• dubu = Thousand (Hausa: Dubu)

=== FAMILY ===
• da: = Father (Hausa: Uba)
• dà:da = Grandfather (Hausa: Kaka)
• amarya = Wife / younger wife (Hausa: Amarya)
• àwtá = Youngest son (Hausa: Auta)
• ßwa: = Give birth (Hausa: Haifuwa)
• gùÑ = Chief (Hausa: Sarki)

=== BODY PARTS ===
• kâ:r = Back (Hausa: Baya)
• kË:m = Ear (Hausa: Kunnen)
• nyítsŒÑ = Nose (Hausa: Hanci)
• vì: = Mouth (Hausa: Baki)
• vwà: = Belly (Hausa: Ciki)
• bubzÈÑ = Beard (Hausa: Gemu)
• da: kúnci = Fist (Hausa: Dunƙulen hannu)

=== FOOD & DRINK ===
• zhà = Water (Hausa: Ruwa)
• ngÂtn cíghËn = Food (Hausa: Abinci)
• slû: = Meat (Hausa: Nama)
• gyà:s = Fish (Hausa: Kifi)
• kafa = Rice (Hausa: Shinkafa)
• mâ:s = Salt (Hausa: Gishiri)
• kósŒm / madara = Milk (Hausa: Nono / Madara)
• wût = Fire (Hausa: Wuta)
• álkáma = Wheat (Hausa: Alkama)

=== COMMON VERBS ===
• ci = Eat (Hausa: Ci)
• •i:p = Buy (Hausa: Saya)
• •i:ßár = Sell (Hausa: Sayar)
• kap = Take (Hausa: Karɓa)
• kír = Run (Hausa: Gudu)
• ßwa: = Give birth (Hausa: Haifuwa)
• slí: = Go (Hausa: Tafi) — e.g. MŒ sl†: = Let's go!
• go:dé / nyá:r = Thank (Hausa: Gode)
• cet = Ask (Hausa: Tambaya)
• gon = Be ill (Hausa: Rashin lafiya)

=== EXAMPLE SENTENCES ===
• Gàjíya wuri? Là:fíya kálâw. = "How are you? Very well thank you."
• CoghÑ ga:ghŒ •a. = "May God bless you."
• KusuÑ cá: ci AÓwdu. = "Audu is hungry."
• MŒ sl†: zlà:mgÈnì! = "Let's go for a walk!"
• Má: nyá:r! = "Thank you!"
• Ci nŒ mË:r. = "He is a thief."
• Gu•i cÍ:yi slí: kà:suwa. = "The women all used to go to the market."
• Myá: slÉ mŒnín tá kî:rí. = "If I go, these people will run."
`;

// ── System prompt builder ────────────────────────────────────────────────────
function buildSystem(mode, topic) {
  const base = `You are Malam Zaar, a warm and encouraging AI language tutor specialising in the Zaar (Sayawa) language spoken by the Sayawa people of Tafawa Balewa, Bauchi State, Nigeria.

CRITICAL RULE — ONLY USE VERIFIED WORDS:
You must ONLY teach Zaar words that appear in the VERIFIED VOCABULARY list below.
Do NOT invent, guess, or extrapolate Zaar words. Zaar is a rare, endangered language and hallucinated words cause real harm to learners. If you do not have a verified Zaar word for something, say so honestly: "I don't have a verified Zaar word for that yet, but in Hausa it is [hausa word]."

Your responsibilities:
- Teach vocabulary, phrases, and pronunciation ONLY from the verified list
- Format Zaar words as: **[Zaar word]** (pronunciation guide if known) — English meaning
- Use Hausa as a bridge language where helpful (many Sayawa people speak Hausa)
- Be culturally sensitive and celebrate Sayawa heritage
- Keep responses concise for a mobile chat interface
- Praise correct answers warmly ("Madalla!", "Excellent!", "Toh sai haka!")
- Correct mistakes gently, always giving the verified correct form
- If asked about a topic not covered in the verified vocabulary, acknowledge the gap honestly rather than inventing words

${VERIFIED_VOCABULARY}`;

  if (mode === 'quiz') {
    return base + `\n\nQUIZ MODE: Give feedback on the user's answer first (correct/incorrect + the right verified form). Then give the next quiz question using ONLY words from the verified vocabulary list. Keep a mental score and report it every 5 questions.`;
  }

  if (mode === 'lesson' && topic) {
    return base + `\n\nLESSON MODE: You are teaching "${topic}". Use ONLY verified words from the list above that relate to this topic. If the list doesn't cover the full topic, teach what you have and be honest about gaps. Build progressively: introduce words, give examples, then ask a simple question.`;
  }

  if (mode === 'pronunciation') {
    return base + `\n\nPRONUNCIATION MODE: Focus on phonetics of verified words. Explain tone marks (e.g. á = high tone, à = low tone, â = falling tone). Break down syllables clearly. Encourage the user to practise aloud.`;
  }

  return base + `\n\nCONVERSATION MODE: Chat naturally about the Zaar language and Sayawa culture. Answer questions using only verified vocabulary. If the user asks for a word you don't have verified, say so rather than inventing one.`;
}
