// src/lib/i18n.js
// Minimal i18next setup for the app chrome (nav, auth, settings).
// Content that's already handled by the AI translation feature (posts,
// dictionary entries) is NOT part of this — this is just interface strings.
//
// Add a language: drop a src/locales/<code>/common.json file, then add it
// to `resources` and `SUPPORTED_LANGUAGES` below.

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from '@/locales/en/common.json'
import ha from '@/locales/ha/common.json'
import fr from '@/locales/fr/common.json'
import zaar from '@/locales/zaar/common.json'

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ha', label: 'Hausa' },
  { code: 'fr', label: 'Français' },
  { code: 'zaar', label: 'Zaar' },
]

const STORAGE_KEY = 'vii-language'

function detectInitialLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && SUPPORTED_LANGUAGES.some(l => l.code === saved)) return saved
  } catch { /* localStorage unavailable — ignore */ }

  const browserLang = (navigator.language || 'en').slice(0, 2)
  return SUPPORTED_LANGUAGES.some(l => l.code === browserLang) ? browserLang : 'en'
}

i18n.use(initReactI18next).init({
  resources: {
    en: { common: en },
    ha: { common: ha },
    fr: { common: fr },
    zaar: { common: zaar },
  },
  lng: detectInitialLanguage(),
  fallbackLng: 'en',
  defaultNS: 'common',
  interpolation: { escapeValue: false },
})

export function setLanguage(code) {
  i18n.changeLanguage(code)
  try { localStorage.setItem(STORAGE_KEY, code) } catch { /* ignore */ }
}

export default i18n
