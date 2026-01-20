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
  const [isProcessingPayment, setIsProcessingPayment] = useState(false)
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', text: '👋 Bonjour! Je suis ton assistant IA e-commerce. Tu peux me poser des questions sur tes produits, tes stratégies de vente, ou tout ce qui concerne ton e-commerce.' }
  ])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)

  useEffect(() => {
    // Check if coming from payment success
    if (window.location.hash.includes('success=true')) {
      setIsProcessingPayment(true)
    }
    
    initializeUser()
    
    // If coming from payment success, check subscription after webhook processes
    if (window.location.hash.includes('success=true')) {
      const checkInterval = setInterval(() => {
        initializeUser()
      }, 2000) // Check every 2 seconds for up to 10 seconds
      
      setTimeout(() => {
        clearInterval(checkInterval)
        setIsProcessingPayment(false)
      }, 10000)
    }
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
        
        // Charger les produits Shopify si déjà connecté
        console.log('✅ Subscription active, checking for Shopify connection...')
        loadProducts() // Ceci va charger les produits si déjà connecté
      } else {
        // Pas d'abonnement - redirige vers les plans Stripe
        window.location.hash = '#stripe-pricing'
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

  const sendChatMessage = async () => {
    if (!chatInput.trim()) return
    
    try {
      setChatLoading(true)
      
      // Ajouter le message utilisateur
      const userMessage = chatInput.trim()
      setChatMessages(prev => [...prev, { role: 'user', text: userMessage }])
      setChatInput('')
      
      // Envoyer au backend
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch(`${API_URL}/api/ai/chat`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: userMessage,
          context: shopifyUrl ? `Boutique connectée: ${shopifyUrl}` : ''
        })
      })
      
      const data = await response.json()
      
      if (data.success) {
        setChatMessages(prev => [...prev, { role: 'assistant', text: data.message }])
      } else {
        setChatMessages(prev => [...prev, { 
          role: 'assistant', 
          text: '❌ Erreur: ' + (data.detail || 'Erreur inconnue') 
        }])
      }
    } catch (err) {
      setChatMessages(prev => [...prev, { 
        role: 'assistant', 
        text: '❌ Erreur de connexion: ' + err.message 
      }])
    } finally {
      setChatLoading(false)
    }
  }

  const connectShopify = async () => {
    if (!shopifyUrl || !shopifyToken) {
      alert('⚠️ Veuillez remplir l\'URL et le token')
      return
    }
    
    // Valider le format de l'URL
    if (!shopifyUrl.endsWith('.myshopify.com')) {
      alert('⚠️ Format URL invalide. Utilisez: votre-boutique.myshopify.com')
      return
    }
    
    try {
      setLoading(true)
      setError('')
      
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        alert('❌ Session expirée, reconnectez-vous')
        return
      }
      
      console.log('🔍 Testing Shopify connection...')
      
      // D'abord, tester la connexion
      const testResponse = await fetch(`${API_URL}/api/shopify/test-connection`, {
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
      
      if (!testResponse.ok) {
        const errorData = await testResponse.json()
        throw new Error(errorData.detail || 'Test de connexion échoué')
      }
      
      const testData = await testResponse.json()
      console.log('✅ Test passed:', testData)
      
      if (!testData.ready_to_save) {
        alert('❌ La connexion a échoué. Vérifiez vos credentials.')
        return
      }
      
      // Si test OK, sauvegarder
      console.log('💾 Saving connection...')
      
      const saveResponse = await fetch(`${API_URL}/api/user/profile/update`, {
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
      
      if (!saveResponse.ok) {
        const errorData = await saveResponse.json()
        throw new Error(errorData.detail || 'Sauvegarde échouée')
      }
      
      const saveData = await saveResponse.json()
      
      if (saveData.success) {
        alert(`✅ Shopify connecté! ${testData.tests?.products_fetch?.product_count || 0} produits trouvés.`)
        console.log('✅ Connection saved, loading products...')
        
        // Charger les produits
        await loadProducts()
      } else {
        throw new Error('Sauvegarde échouée')
      }
    } catch (err) {
      console.error('❌ Error:', err)
      alert('❌ Erreur: ' + err.message)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const loadProducts = async () => {
    try {
      setLoading(true)
      setError('')
      
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        setError('Session expirée, reconnectez-vous')
        return
      }
      
      console.log('🔍 Loading products from backend...')
      
      const response = await fetch(`${API_URL}/api/shopify/products`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }
      
      const data = await response.json()
      console.log('✅ Products loaded:', data.product_count)
      
      if (data.success && data.products) {
        setProducts(data.products)
        // Afficher les statistiques
        if (data.statistics) {
          console.log('📊 Stats:', data.statistics)
        }
      } else {
        setProducts([])
        setError('Aucun produit trouvé. Connectez votre boutique Shopify d\'abord.')
      }
    } catch (err) {
      console.error('❌ Error loading products:', err)
      setError('Erreur: ' + err.message)
      setProducts([])
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

  if (isProcessingPayment) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 to-purple-900 flex items-center justify-center">
        <div className="text-center text-white">
          <div className="text-6xl mb-4">✅</div>
          <h2 className="text-3xl font-bold mb-4">Paiement en cours de traitement...</h2>
          <p className="text-gray-300 mb-8">Merci! Nous enregistrons ton abonnement.</p>
          <div className="flex justify-center gap-2 mb-4">
            <div className="w-3 h-3 bg-white rounded-full animate-bounce"></div>
            <div className="w-3 h-3 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
            <div className="w-3 h-3 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
          </div>
          <p className="text-sm text-gray-400">Tu seras redirigé automatiquement...</p>
        </div>
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
        <div className="flex gap-4 mb-6 border-b border-gray-700 overflow-x-auto">
          {['overview', 'shopify', 'assistant', 'ai'].map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-4 py-2 font-semibold transition whitespace-nowrap ${
                activeTab === t
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {t === 'overview' && '📊 Vue d\'ensemble'}
              {t === 'shopify' && '🛒 Shopify'}
              {t === 'assistant' && '💬 Assistant IA'}
              {t === 'ai' && '✨ Analyse IA'}
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

        {/* AI Assistant Tab */}
        {activeTab === 'assistant' && (
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 h-96 flex flex-col">
            <h2 className="text-white text-xl font-bold mb-4">💬 Assistant IA</h2>
            
            {/* Messages Container */}
            <div className="flex-1 overflow-y-auto mb-4 space-y-4 bg-gray-900 rounded-lg p-4">
              {chatMessages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                    msg.role === 'user' 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-700 text-gray-200'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="bg-gray-700 text-gray-200 px-4 py-2 rounded-lg">
                    ⏳ L'IA réfléchit...
                  </div>
                </div>
              )}
            </div>
            
            {/* Input */}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Pose une question à l'IA..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !chatLoading) {
                    sendChatMessage()
                  }
                }}
                disabled={chatLoading}
                className="flex-1 bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600 disabled:opacity-50"
              />
              <button
                onClick={sendChatMessage}
                disabled={chatLoading || !chatInput.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg disabled:opacity-50"
              >
                {chatLoading ? '⏳' : '📤'}
              </button>
            </div>
          </div>
        )}

        {/* AI Analysis Tab */}
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
