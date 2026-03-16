import React, { createContext, useContext, useState, useCallback } from 'react'
import { translations, LANGUAGES } from './translations'

const LanguageContext = createContext()

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => localStorage.getItem('language') || 'fr')

  const changeLanguage = useCallback((lang) => {
    setLanguage(lang)
    localStorage.setItem('language', lang)
    // Set html dir attribute for RTL languages
    const rtlLangs = ['ar', 'he']
    document.documentElement.dir = rtlLangs.includes(lang) ? 'rtl' : 'ltr'
  }, [])

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
