import React, { createContext, useContext, useState, useCallback } from 'react'
import { translations, LANGUAGES } from './translations'

const LanguageContext = createContext()

export const LanguageProvider = ({ children }) => {
  const [language, setLanguageState] = useState(() => {
    try { return localStorage.getItem('language') || 'fr' } catch { return 'fr' }
  })

  const setLanguage = useCallback((lang) => {
    setLanguageState(lang)
    try { localStorage.setItem('language', lang) } catch {}
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
