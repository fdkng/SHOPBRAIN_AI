import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { translations, LANGUAGES } from './translations'

const LanguageContext = createContext()

// Supported language codes from our LANGUAGES array
const SUPPORTED_CODES = new Set(LANGUAGES.map(l => l.code))

// Map browser locale (e.g. "zh-CN", "pt-BR", "en-US") → our supported code
function detectBrowserLanguage() {
  // navigator.languages = ['fr-CA', 'fr', 'en-US', 'en'] (ordered by preference)
  const candidates = navigator.languages || [navigator.language || navigator.userLanguage || '']
  for (const locale of candidates) {
    const code = (locale || '').toLowerCase()
    // Exact match first (e.g. "fr", "zh", "pt")
    const base = code.split('-')[0]
    if (SUPPORTED_CODES.has(base)) return base
    // Special mappings: "nb"/"nn" → "no", "fil" → "tl" etc.
    const aliasMap = { nb: 'no', nn: 'no', fil: 'id', tl: 'id' }
    if (aliasMap[base] && SUPPORTED_CODES.has(aliasMap[base])) return aliasMap[base]
  }
  return null // No match found → will use default
}

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => {
    // 1. Respect user's explicit choice (saved in localStorage)
    const saved = localStorage.getItem('language')
    if (saved && SUPPORTED_CODES.has(saved)) return saved

    // 2. First visit → detect from browser language
    const detected = detectBrowserLanguage()
    if (detected) {
      localStorage.setItem('language', detected)
      return detected
    }

    // 3. Fallback to French (default)
    return 'fr'
  })

  const changeLanguage = useCallback((lang) => {
    setLanguage(lang)
    localStorage.setItem('language', lang)
    // Set html dir attribute for RTL languages
    const rtlLangs = ['ar', 'he']
    document.documentElement.dir = rtlLangs.includes(lang) ? 'rtl' : 'ltr'
    document.documentElement.lang = lang
  }, [])

  // Set dir + lang on first render too (not just on change)
  useEffect(() => {
    const rtlLangs = ['ar', 'he']
    document.documentElement.dir = rtlLangs.includes(language) ? 'rtl' : 'ltr'
    document.documentElement.lang = language
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const t = useCallback((key) => {
    return translations[language]?.[key] || translations.fr[key] || key
  }, [language])

  return (
    <LanguageContext.Provider value={{ language, setLanguage: changeLanguage, t, LANGUAGES }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useTranslation() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useTranslation must be used within a LanguageProvider')
  }
  return context
}

export { LANGUAGES }
export default LanguageContext
