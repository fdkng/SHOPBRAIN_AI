import React from 'react'
import { createRoot } from 'react-dom/client'
import { LanguageProvider } from './LanguageContext'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </React.StrictMode>
)
