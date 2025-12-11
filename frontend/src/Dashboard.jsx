import React, { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://jgmsfadayzbgykzajvmw.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnbXNmYWRheXpiZ3lremFqdm13Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQwODk0NTksImV4cCI6MjA3OTY2NTQ1OX0.sg0O2QGdoKO5Zb6vcRJr5pSu2zlaxU3r7nHtyXb07hg'
)

const API_URL = 'https://shopbrain-backend.onrender.com'

export default function Dashboard() {
  const [user, setUser] = useState(null)
  const [subscription, setSubscription] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [shopifyUrl, setShopifyUrl] = useState('')
  const [shopifyToken, setShopifyToken] = useState('')
  const [products, setProducts] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    initializeUser()
  }, [])

  const initializeUser = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        window.location.hash = '#/'
        return
      }
      
      setUser(session.user)
      
      // Vérifie l'abonnement
      const response = await fetch(`${API_URL}/api/subscription/status`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ user_id: session.user.id })
      })
      
      const data = await response.json()
      
      if (data.success && data.has_subscription) {
        setSubscription(data)
      } else {
        // Pas d'abonnement - redirige vers pricing
        window.location.hash = '#pricing'
      }
      
      setLoading(false)
    } catch (err) {
      console.error('Error:', err)
      setError('Erreur d\'authentification')
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.hash = '#/'
  }

  const connectShopify = async () => {
    if (!shopifyUrl || !shopifyToken) {
      alert('Complète les champs')
      return
    }
    
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      const response = await fetch(`${API_URL}/api/user/profile/update`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          shopify_shop_url: shopifyUrl,
          shopify_access_token: shopifyToken
        })
      })
      
      const data = await response.json()
      if (data.success) {
        alert('✅ Shopify connecté!')
        loadProducts()
      }
    } catch (err) {
      alert('Erreur: ' + err.message)
    }
  }

  const loadProducts = async () => {
    if (!shopifyUrl || !shopifyToken) return
    
    try {
      setLoading(true)
      const response = await fetch(
        `https://${shopifyUrl}/admin/api/2024-01/products.json?limit=10`,
        {
          headers: {
            'X-Shopify-Access-Token': shopifyToken
          }
        }
      )
      
      const data = await response.json()
      setProducts(data.products || [])
    } catch (err) {
      setError('Erreur Shopify: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const analyzeProducts = async () => {
    if (!products || products.length === 0) {
      alert('Charge tes produits d\'abord')
      return
    }
    
    try {
      setLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      
      const response = await fetch(`${API_URL}/api/ai/analyze-store`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          products: products,
          analytics: {},
          tier: subscription.plan
        })
      })
      
      const data = await response.json()
      
      if (data.success) {
        alert('✅ Analyse terminée! Voir les résultats IA')
        setActiveTab('results')
      }
    } catch (err) {
      alert('Erreur analyse: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading && !user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 to-purple-900 flex items-center justify-center">
        <div className="text-white text-xl">Chargement...</div>
      </div>
    )
  }

  if (!user || !subscription) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 to-purple-900 flex items-center justify-center">
        <div className="text-white text-xl">Erreur: Pas d'abonnement actif</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-900 to-purple-900 text-white p-6 shadow-lg">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">🤖 ShopBrain AI Dashboard</h1>
            <p className="text-gray-300">Plan: <span className="font-bold text-yellow-400">{subscription?.plan.toUpperCase()}</span></p>
          </div>
          <div className="text-right">
            <p className="text-gray-300">{user.email}</p>
            <button
              onClick={handleLogout}
              className="mt-2 bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg"
            >
              Déconnexion
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex gap-4 mb-6 border-b border-gray-700">
          {['overview', 'shopify', 'ai'].map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-4 py-2 font-semibold transition ${
                activeTab === t
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {t === 'overview' && '📊 Vue d\'ensemble'}
              {t === 'shopify' && '🛒 Shopify'}
              {t === 'ai' && '✨ IA'}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-900 border border-red-700 text-red-200 p-4 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h3 className="text-gray-400 text-sm uppercase mb-2">Plan Actif</h3>
              <p className="text-white text-2xl font-bold">{subscription?.plan.toUpperCase()}</p>
              <p className="text-gray-400 text-sm mt-2">Depuis: {new Date(subscription?.started_at).toLocaleDateString('fr-FR')}</p>
            </div>
            
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h3 className="text-gray-400 text-sm uppercase mb-2">Produits</h3>
              <p className="text-white text-2xl font-bold">{subscription?.capabilities?.product_limit === null ? '∞' : subscription?.capabilities?.product_limit}</p>
              <p className="text-gray-400 text-sm mt-2">Limite mensuelle</p>
            </div>
            
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h3 className="text-gray-400 text-sm uppercase mb-2">Fonctionnalités</h3>
              <ul className="text-sm space-y-1">
                {subscription?.capabilities?.features?.map((f, i) => (
                  <li key={i} className="text-gray-300">✓ {f}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Shopify Tab */}
        {activeTab === 'shopify' && (
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h2 className="text-white text-xl font-bold mb-4">🛒 Connecter Shopify</h2>
            
            <div className="space-y-4 max-w-md">
              <div>
                <label className="block text-gray-400 text-sm mb-2">URL de boutique</label>
                <input
                  type="text"
                  placeholder="ma-boutique.myshopify.com"
                  value={shopifyUrl}
                  onChange={(e) => setShopifyUrl(e.target.value)}
                  className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600"
                />
              </div>
              
              <div>
                <label className="block text-gray-400 text-sm mb-2">Token d'accès</label>
                <input
                  type="password"
                  placeholder="shpat_..."
                  value={shopifyToken}
                  onChange={(e) => setShopifyToken(e.target.value)}
                  className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600"
                />
              </div>
              
              <button
                onClick={connectShopify}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"
              >
                ✅ Connecter
              </button>
            </div>

            {shopifyUrl && !loading && (
              <div className="mt-6">
                <button
                  onClick={loadProducts}
                  className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg"
                >
                  📦 Charger mes produits ({products?.length || 0})
                </button>
              </div>
            )}

            {products && (
              <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                {products.map(p => (
                  <div key={p.id} className="bg-gray-700 p-3 rounded-lg">
                    <p className="text-white font-semibold text-sm truncate">{p.title}</p>
                    <p className="text-gray-400 text-xs">${p.variants[0]?.price}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* AI Tab */}
        {activeTab === 'ai' && (
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h2 className="text-white text-xl font-bold mb-4">✨ Analyser avec l'IA</h2>
            
            {products && products.length > 0 ? (
              <div>
                <p className="text-gray-400 mb-4">{products.length} produits à analyser</p>
                <button
                  onClick={analyzeProducts}
                  disabled={loading}
                  className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg disabled:opacity-50"
                >
                  {loading ? '⏳ Analyse en cours...' : '🚀 Lancer l\'analyse IA'}
                </button>
              </div>
            ) : (
              <p className="text-gray-400">Charge tes produits Shopify d'abord</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
