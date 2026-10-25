// src/lib/phone.js
// Single source of truth for turning whatever a user types into a canonical
// phone identity. MUST stay in sync with netlify/functions/lib/_phone.js.
//
// Canonical form = digits only, with country code, no "+" (e.g. 2348012345678).
// Without this, "+234 801 234 5678", "0801 234 5678" and "8012345678" would
// each become a DIFFERENT account.

export const DEFAULT_COUNTRY_CODE =
  String(import.meta.env.VITE_DEFAULT_COUNTRY_CODE || '234').replace(/\D/g, '')

export const PHONE_EMAIL_DOMAIN = 'phone.vii-mbuni.app'

/** Returns canonical digits (e.g. "2348012345678") or null if invalid. */
export function normalizePhone(raw, cc = DEFAULT_COUNTRY_CODE) {
  if (typeof raw !== 'string') return null
  const s = raw.trim().replace(/[\s\-().]/g, '')
  if (!/^\+?[0-9]+$/.test(s)) return null

  let digits
  if (s.startsWith('+'))       digits = s.slice(1)          // +234801…  → international
  else if (s.startsWith('00')) digits = s.slice(2)          // 00234801… → international
  else if (s.startsWith('0'))  digits = cc + s.slice(1)     // 0801…     → national
  else if (s.length <= 10)     digits = cc + s              // 801…      → national, no trunk 0
  else                         digits = s                   // 234801…   → already has country code

  if (digits.length < 8 || digits.length > 15 || digits.startsWith('0')) return null
  return digits
}

export const phoneToEmail = (digits) => `${digits}@${PHONE_EMAIL_DOMAIN}`

/** Pre-fix accounts were keyed on "every non-digit stripped", with no country code logic. */
export const legacyPhoneEmail = (raw) => `${String(raw).replace(/\D/g, '')}@${PHONE_EMAIL_DOMAIN}`

/** "+2348012345678" for display / profile storage */
export const toE164 = (digits) => `+${digits}`

export const cleanUsername = (u) =>
  String(u || '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
