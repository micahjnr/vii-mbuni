// netlify/functions/upload-voice.js
// Proxies voice file uploads to Supabase Storage, bypassing browser CORS restrictions.
// The browser posts multipart form data here; this function uploads server-side.

const { createClient } = require('@supabase/supabase-js')

const ALLOWED_ORIGIN = process.env.SITE_URL || '*'
const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' }

  // Use server-side env vars only — never expose VITE_ vars from server functions
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', ...CORS },
      body: JSON.stringify({ error: 'Supabase env vars not configured' }),
    }
  }

  try {
    const body = JSON.parse(event.body || '{}')
    const { audioBase64, mimeType, path, userToken } = body

    if (!audioBase64 || !path) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Missing audioBase64 or path' }) }
    }

    // Validate path to prevent a client from uploading into another user's folder.
    // Expected format: "{uuid}/{timestamp}.{ext}"  — no traversal sequences allowed.
    if (!/^[0-9a-f-]{36}\/[\w.-]+$/i.test(path)) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid path format' }) }
    }

    // Use user's JWT so RLS policies apply correctly
    const sb = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${userToken}` } },
    })

    const buffer = Buffer.from(audioBase64, 'base64')

    // Normalise mime type — iOS Safari sends audio/mp4, others send audio/webm
    const safeMime = mimeType && mimeType.startsWith('audio/')
      ? mimeType.split(';')[0]  // strip codec params e.g. audio/webm;codecs=opus → audio/webm
      : 'audio/webm'

    const { error } = await sb.storage.from('voice').upload(path, buffer, {
      contentType: safeMime,
      cacheControl: '3600',
      upsert: true,
    })

    if (error) throw error

    const { data: urlData } = sb.storage.from('voice').getPublicUrl(path)
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...CORS },
      body: JSON.stringify({ publicUrl: urlData.publicUrl }),
    }
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', ...CORS },
      body: JSON.stringify({ error: err.message }),
    }
  }
}
