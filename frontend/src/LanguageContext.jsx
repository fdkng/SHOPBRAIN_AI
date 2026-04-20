import React, { createContext, useContext, useState, useCallback } from 'react'
import { translations, LANGUAGES } from './translations'

const LanguageContext = createContext()
const SUPPORTED_LANGUAGES = new Set(['fr', 'en'])

export const LanguageProvider = ({ children }) => {
  const [language, setLanguageState] = useState(() => {
    try {
      const stored = localStorage.getItem('language') || 'en'
      return SUPPORTED_LANGUAGES.has(stored) ? stored : 'en'
    } catch {
      return 'en'
    }
  })

  const setLanguage = useCallback((lang) => {
    const next = SUPPORTED_LANGUAGES.has(lang) ? lang : 'en'
    setLanguageState(next)
    try { localStorage.setItem('language', next) } catch {}
  }, [])

  const t = useCallback((key) => {
    return translations[language]?.[key] || translations.en?.[key] || translations.fr?.[key] || key
  }, [language])

  return (
    <LanguageContext.Provider value={{ t, language, setLanguage, LANGUAGES }}>
      {children}
    </LanguageContext.Provider>
  )
}

export const useTranslation = () => {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useTranslation must be used within a LanguageProvider')
  return ctx
}
