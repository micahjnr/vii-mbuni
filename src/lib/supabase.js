import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Throw during module init so developers get a clear message immediately,
  // rather than cryptic "Failed to fetch" / "invalid URL" errors at runtime.
  throw new Error(
    '[Vii-Mbuni] Missing Supabase environment variables.\n' +
    'Make sure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in your .env file ' +
    '(or in Netlify → Site settings → Environment variables for production).'
  )
}

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
  realtime: { params: { eventsPerSecond: 10 } },
})

export default sb
