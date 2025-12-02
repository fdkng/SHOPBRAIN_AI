import React, { useState } from 'react'
import Home from './Home'
import Pricing from './Pricing'

export default function App() {
  const [page, setPage] = useState('home')

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <nav className="bg-black/30 backdrop-blur-md border-b border-white/10 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img 
              src="https://i.postimg.cc/BbVk5fzw/upscalemedia-transformed.png" 
              alt="ShopBrain AI" 
              className="h-10 w-auto"
            />
            <h1 className="text-2xl font-bold text-white">ShopBrain AI</h1>
          </div>
          <div className="flex gap-6">
            <button
              onClick={() => setPage('home')}
              className={`px-4 py-2 rounded-lg transition-all ${
                page === 'home' 
                  ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/50' 
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              Accueil
            </button>
            <button
              onClick={() => setPage('pricing')}
              className={`px-4 py-2 rounded-lg transition-all ${
                page === 'pricing' 
                  ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/50' 
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              Abonnements
            </button>
            <button
              onClick={() => supabase.auth.signOut()}
              className="px-4 py-2 text-red-600"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>

      {page === 'home' && <Home setPage={setPage} />}
      {page === 'pricing' && <Pricing />}
    </div>
  )
}
