// netlify/functions/voice-proxy.js
// Proxies voice audio GET requests from Supabase Storage, bypassing CORS.
// Forwards Content-Length, Accept-Ranges, and Content-Range so browsers
// can seek audio and correctly report duration (avoids "Infinity:NaN").
//
// Usage: /.netlify/functions/voice-proxy?path=USER_ID/FILENAME.webm

// Map file extensions to correct MIME types.
// Supabase Storage sometimes returns 'application/octet-stream' even when
// the file was uploaded with a proper audio content-type — browsers refuse
// to play octet-stream audio, so we derive the type from the extension.
const MIME_BY_EXT = {
  webm: 'audio/webm',
  mp4:  'audio/mp4',
  m4a:  'audio/mp4',
  ogg:  'audio/ogg',
  oga:  'audio/ogg',
  mp3:  'audio/mpeg',
  wav:  'audio/wav',
  aac:  'audio/aac',
}

function mimeFromPath(filePath) {
  const ext = filePath.split('.').pop()?.toLowerCase()
  return ext ? (MIME_BY_EXT[ext] || null) : null
}

exports.handler = async (event) => {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' }
  }

  const filePath = event.queryStringParameters?.path
  if (!filePath) {
    return { statusCode: 400, headers: CORS, body: 'Missing ?path= parameter' }
  }

  // Netlify functions can only read non-VITE_ env vars.
  // VITE_ prefix is a Vite/browser-only convention — never use it server-side.
  const supabaseUrl = process.env.SUPABASE_URL
  if (!supabaseUrl) {
    console.error('[voice-proxy] SUPABASE_URL env var is not set')
    return {
      statusCode: 500,
      headers: CORS,
      body: 'SUPABASE_URL not configured. Set it in Netlify → Site settings → Environment variables.',
    }
  }

  // Sanitise path — prevent directory traversal
  const safePath = filePath.replace(/\.\./g, '').replace(/^\/+/, '')
  const audioUrl = `${supabaseUrl}/storage/v1/object/public/voice/${safePath}`

  try {
    // Issue a redirect to the Supabase URL instead of buffering the file.
    // Buffering hits Netlify's ~1 MB function response limit, which corrupts
    // larger voice files and prevents the browser from getting Content-Length —
    // causing duration to show as Infinity / '--:--'.
    // A 302 redirect lets the browser stream directly from Supabase Storage,
    // receives proper Content-Length + Accept-Ranges, and supports seeking.
    return {
      statusCode: 302,
      headers: {
        ...CORS,
        'Location': audioUrl,
        'Cache-Control': 'public, max-age=3600',
      },
      body: '',
    }
  } catch (err) {
    console.error('[voice-proxy] Proxy error:', err.message)
    return {
      statusCode: 502,
      headers: CORS,
      body: `Proxy error: ${err.message}`,
    }
  }
}
