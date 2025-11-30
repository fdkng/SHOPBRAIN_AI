import React, { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import Dashboard from './Dashboard'
import Pricing from './Pricing'
import Auth from './Auth'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://jgmsfadayzbgykzajvmw.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnbXNmYWRheXpiZ3lremFqdm13Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQwODk0NTksImV4cCI6MjA3OTY2NTQ1OX0.sg0O2QGdoKO5Zb6vcRJr5pSu2zlaxU3r7nHtyXb07hg'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export default function App() {
  const [user, setUser] = useState(null)
  const [page, setPage] = useState('dashboard')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user || null)
      }
    )

    return () => subscription?.unsubscribe()
  }, [])

  if (!user) {
    return <Auth supabase={supabase} />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">ShopBrain AI</h1>
          <div className="flex gap-4">
            <button
              onClick={() => setPage('dashboard')}
              className={`px-4 py-2 rounded ${page === 'dashboard' ? 'bg-blue-600 text-white' : 'text-gray-600'}`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setPage('pricing')}
              className={`px-4 py-2 rounded ${page === 'pricing' ? 'bg-blue-600 text-white' : 'text-gray-600'}`}
            >
              Plans
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

      <div className="max-w-4xl mx-auto p-6">
        {page === 'dashboard' && <Dashboard user={user} supabase={supabase} />}
        {page === 'pricing' && <Pricing user={user} />}
      </div>
    </div>
  )
}
