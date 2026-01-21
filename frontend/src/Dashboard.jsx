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
  const [analysisResults, setAnalysisResults] = useState(null)
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

  const handleUpgrade = async () => {
    try {
      const currentPlan = subscription?.plan
      const nextPlan = currentPlan === 'standard' ? 'pro' : currentPlan === 'pro' ? 'premium' : null
      if (!nextPlan) {
        alert('Tu es déjà au plan PREMIUM avec toutes les fonctionnalités.')
        return
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        alert('Session expirée, reconnecte-toi.')
        return
      }

      const resp = await fetch(`${API_URL}/api/subscription/create-session`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ plan: nextPlan, email: user?.email || '' })
      })

      const data = await resp.json()
      if (data?.success && data?.url) {
        window.location.href = data.url
      } else {
        alert('Erreur lors de la création de la session d\'upgrade')
      }
    } catch (e) {
      console.error('Upgrade error:', e)
      alert('Une erreur est survenue pour l\'upgrade')
    }
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
      console.log('🔍 Lancement de l\'analyse IA...')
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
        console.log('✅ Analyse terminée:', data.analysis)
        setAnalysisResults(data.analysis)
        setActiveTab('analysis')
      } else {
        alert('❌ Erreur lors de l\'analyse: ' + (data.detail || 'Erreur inconnue'))
      }
    } catch (err) {
      console.error('Erreur analyse:', err)
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

        {/* Post-payment success banner */}
        {typeof window !== 'undefined' && (window.location.hash.includes('success=true') || new URLSearchParams(window.location.search).has('session_id')) && (
          <div className="max-w-7xl mx-auto px-6 mb-4">
            <div className="bg-green-800 border border-green-600 text-green-100 p-4 rounded-lg flex items-center justify-between">
              <div>
                <p className="font-bold">✅ Paiement confirmé — abonnement activé</p>
                <p className="text-sm opacity-90">Ton plan est appliqué et disponible dans le dashboard.</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => { window.location.hash = '#/' }}
                  className="bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2 rounded-lg"
                >
                  ↩️ Retour à l'accueil
                </button>
                <button
                  onClick={() => { window.location.hash = '#dashboard' }}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-lg"
                >
                  📊 Aller au dashboard
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex gap-4 mb-6 border-b border-gray-700 overflow-x-auto">
          {['overview', 'shopify', 'assistant', 'ai', 'analysis'].map(t => (
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
              {t === 'analysis' && '📈 Résultats'}
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
              <div className="flex items-center justify-between">
                <p className="text-white text-2xl font-bold">{subscription?.plan.toUpperCase()}</p>
                {subscription?.plan !== 'premium' && (
                  <button
                    onClick={handleUpgrade}
                    className="ml-4 bg-yellow-600 hover:bg-yellow-700 text-white text-sm font-bold px-3 py-1 rounded-lg"
                  >
                    Upgrade
                  </button>
                )}
              </div>
              <p className="text-gray-400 text-sm mt-2">Depuis: {new Date(subscription?.started_at).toLocaleDateString('fr-FR')}</p>
              {subscription?.plan === 'standard' && (
                <p className="text-gray-400 text-xs mt-1">Fonctionnalités limitées — Upgrade vers PRO pour plus.</p>
              )}
              {subscription?.plan === 'pro' && (
                <p className="text-gray-400 text-xs mt-1">Bon choix — Upgrade vers PREMIUM pour tout débloquer.</p>
              )}
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

        {/* Analysis Results Tab */}
        {activeTab === 'analysis' && (
          <div className="space-y-6">
            {analysisResults ? (
              <>
                {/* Vue d'ensemble */}
                <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                  <h2 className="text-white text-2xl font-bold mb-4">📊 Vue d'ensemble de votre boutique</h2>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-gray-700 p-4 rounded-lg">
                      <p className="text-gray-400 text-sm">Produits totaux</p>
                      <p className="text-white text-2xl font-bold">{analysisResults.overview?.total_products}</p>
                    </div>
                    <div className="bg-gray-700 p-4 rounded-lg">
                      <p className="text-gray-400 text-sm">Publiés</p>
                      <p className="text-green-400 text-2xl font-bold">{analysisResults.overview?.published}</p>
                    </div>
                    <div className="bg-gray-700 p-4 rounded-lg">
                      <p className="text-gray-400 text-sm">Variantes</p>
                      <p className="text-blue-400 text-2xl font-bold">{analysisResults.overview?.total_variants}</p>
                    </div>
                    <div className="bg-gray-700 p-4 rounded-lg">
                      <p className="text-gray-400 text-sm">Prix moyen</p>
                      <p className="text-yellow-400 text-2xl font-bold">{analysisResults.overview?.price_range?.average?.toFixed(2)}$</p>
                    </div>
                  </div>
                  <div className="mt-4 bg-gray-700 p-4 rounded-lg">
                    <p className="text-gray-400 text-sm">Santé du catalogue</p>
                    <p className="text-white text-xl font-bold">{analysisResults.overview?.catalog_health}</p>
                  </div>
                </div>

                {/* Points critiques */}
                {analysisResults.critical_issues && analysisResults.critical_issues.length > 0 && (
                  <div className="bg-red-900 border-2 border-red-600 rounded-lg p-6">
                    <h2 className="text-white text-2xl font-bold mb-4">⚠️ Points critiques à corriger MAINTENANT</h2>
                    <div className="space-y-4">
                      {analysisResults.critical_issues.map((issue, idx) => (
                        <div key={idx} className="bg-red-800 p-4 rounded-lg">
                          <div className="flex items-start gap-3">
                            <span className="text-2xl">🚨</span>
                            <div className="flex-1">
                              <p className="text-red-300 font-bold text-sm mb-1">SÉVÉRITÉ: {issue.severity}</p>
                              <p className="text-white font-bold mb-2">{issue.issue}</p>
                              <p className="text-red-200 text-sm mb-2">{issue.impact}</p>
                              <div className="bg-red-900 p-3 rounded mt-2">
                                <p className="text-white font-bold text-sm">✅ Action immédiate:</p>
                                <p className="text-red-100 text-sm mt-1">{issue.action}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions immédiates */}
                <div className="bg-gradient-to-r from-green-900 to-emerald-900 border-2 border-green-600 rounded-lg p-6">
                  <h2 className="text-white text-2xl font-bold mb-4">🎯 Actions à faire MAINTENANT</h2>
                  <div className="space-y-4">
                    {analysisResults.immediate_actions?.map((action, idx) => (
                      <div key={idx} className="bg-green-800 bg-opacity-50 p-5 rounded-lg">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="bg-green-600 text-white font-bold px-3 py-1 rounded-full text-sm">PRIORITÉ {action.priority}</span>
                          <h3 className="text-white font-bold text-lg">{action.action}</h3>
                        </div>
                        <div className="space-y-2 mb-3">
                          {action.steps?.map((step, sidx) => (
                            <p key={sidx} className="text-green-100 pl-4">{step}</p>
                          ))}
                        </div>
                        <div className="flex gap-4 text-sm">
                          <span className="text-green-300">⏱️ Temps: {action.time_required}</span>
                          <span className="text-yellow-300">📈 Impact: {action.expected_impact}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recommandations stratégiques */}
                <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                  <h2 className="text-white text-2xl font-bold mb-4">🎯 Recommandations stratégiques</h2>
                  <p className="text-gray-400 mb-4">
                    {analysisResults.strategic_recommendations?.total_recommendations} recommandations trouvées 
                    ({analysisResults.strategic_recommendations?.high_priority} haute priorité)
                  </p>
                  <div className="space-y-4">
                    {analysisResults.strategic_recommendations?.recommendations?.map((rec, idx) => (
                      <div key={idx} className="bg-gray-700 p-5 rounded-lg border-l-4 border-blue-500">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`px-2 py-1 rounded text-xs font-bold ${
                            rec.priority === 'HAUTE' ? 'bg-red-600' : 
                            rec.priority === 'MOYENNE' ? 'bg-yellow-600' : 'bg-green-600'
                          }`}>
                            {rec.priority}
                          </span>
                          <span className="text-blue-400 font-bold">{rec.category}</span>
                        </div>
                        <h3 className="text-white font-bold mb-2">{rec.issue}</h3>
                        <p className="text-gray-300 mb-3">{rec.recommendation}</p>
                        <div className="bg-gray-800 p-3 rounded">
                          <p className="text-green-400 text-sm font-bold">💰 Impact attendu:</p>
                          <p className="text-green-300 text-sm">{rec.impact}</p>
                        </div>
                        <div className="bg-blue-900 bg-opacity-30 p-3 rounded mt-2">
                          <p className="text-blue-400 text-sm font-bold">✅ Action:</p>
                          <p className="text-blue-200 text-sm">{rec.action}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Stratégie de prix */}
                <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                  <h2 className="text-white text-2xl font-bold mb-4">💰 Optimisation des prix</h2>
                  <div className="space-y-4">
                    <div className="bg-gray-700 p-4 rounded-lg">
                      <h3 className="text-white font-bold mb-2">Stratégie actuelle</h3>
                      <p className="text-gray-300">{analysisResults.pricing_strategy?.current_strategy}</p>
                    </div>
                    
                    <h3 className="text-white font-bold mt-4">Optimisations suggérées (Top 5 produits):</h3>
                    <div className="space-y-3">
                      {analysisResults.pricing_strategy?.optimizations?.map((opt, idx) => (
                        <div key={idx} className="bg-gray-700 p-4 rounded-lg">
                          <div className="flex justify-between items-start mb-2">
                            <p className="text-white font-bold">{opt.product}</p>
                            <span className="bg-green-600 text-white px-3 py-1 rounded-full text-sm font-bold">
                              +{opt.increase}$
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-4 mb-2">
                            <div>
                              <p className="text-gray-400 text-sm">Prix actuel</p>
                              <p className="text-white text-lg font-bold">{opt.current_price}$</p>
                            </div>
                            <div>
                              <p className="text-gray-400 text-sm">Prix suggéré</p>
                              <p className="text-green-400 text-lg font-bold">{opt.suggested_price}$</p>
                            </div>
                          </div>
                          <p className="text-gray-300 text-sm mb-2">{opt.reason}</p>
                          <p className="text-green-400 text-sm font-bold">{opt.expected_impact}</p>
                        </div>
                      ))}
                    </div>

                    <h3 className="text-white font-bold mt-4">Opportunités de pricing:</h3>
                    <div className="space-y-3">
                      {analysisResults.pricing_strategy?.opportunities?.map((opp, idx) => (
                        <div key={idx} className="bg-blue-900 bg-opacity-30 p-4 rounded-lg">
                          <h4 className="text-blue-400 font-bold mb-2">{opp.strategy}</h4>
                          <p className="text-gray-300 text-sm mb-2">{opp.description}</p>
                          <p className="text-green-400 text-sm font-bold">📈 {opp.expected_impact}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Qualité du contenu */}
                <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                  <h2 className="text-white text-2xl font-bold mb-4">📝 Qualité du contenu</h2>
                  <div className="bg-gray-700 p-4 rounded-lg mb-4">
                    <p className="text-gray-400 text-sm mb-2">Score global</p>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 bg-gray-600 rounded-full h-4">
                        <div 
                          className={`h-4 rounded-full ${
                            analysisResults.content_improvements?.overall_score >= 80 ? 'bg-green-500' :
                            analysisResults.content_improvements?.overall_score >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                          style={{width: `${analysisResults.content_improvements?.overall_score}%`}}
                        />
                      </div>
                      <span className="text-white font-bold text-xl">{analysisResults.content_improvements?.overall_score}/100</span>
                    </div>
                  </div>

                  {analysisResults.content_improvements?.issues_found?.length > 0 && (
                    <>
                      <h3 className="text-white font-bold mb-3">Problèmes détectés:</h3>
                      <div className="space-y-3 mb-4">
                        {analysisResults.content_improvements.issues_found.map((issue, idx) => (
                          <div key={idx} className="bg-yellow-900 bg-opacity-30 p-4 rounded-lg">
                            <div className="flex items-center gap-2 mb-2">
                              <span className={`px-2 py-1 rounded text-xs font-bold ${
                                issue.priority === 'CRITIQUE' ? 'bg-red-600' : 
                                issue.priority === 'HAUTE' ? 'bg-orange-600' : 'bg-yellow-600'
                              }`}>
                                {issue.priority}
                              </span>
                              <p className="text-yellow-300 font-bold">{issue.issue}</p>
                            </div>
                            <p className="text-gray-300 text-sm">💡 Solution: {issue.fix}</p>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  <h3 className="text-white font-bold mb-3">Quick Wins (résultats rapides):</h3>
                  <div className="space-y-3">
                    {analysisResults.content_improvements?.quick_wins?.map((win, idx) => (
                      <div key={idx} className="bg-green-900 bg-opacity-30 p-4 rounded-lg">
                        <p className="text-green-400 font-bold mb-2">{win.action}</p>
                        {win.example && <p className="text-gray-300 text-sm mb-2">Exemple: {win.example}</p>}
                        <p className="text-green-300 text-sm">📈 {win.impact}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Stratégies de vente */}
                <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                  <h2 className="text-white text-2xl font-bold mb-4">🛒 Stratégies Upsell & Cross-sell</h2>
                  
                  {analysisResults.sales_strategies?.upsell_opportunities?.length > 0 && (
                    <>
                      <h3 className="text-white font-bold mb-3">Opportunités d'Upsell:</h3>
                      <div className="space-y-3 mb-6">
                        {analysisResults.sales_strategies.upsell_opportunities.map((upsell, idx) => (
                          <div key={idx} className="bg-purple-900 bg-opacity-30 p-4 rounded-lg">
                            <h4 className="text-purple-400 font-bold mb-2">{upsell.strategy}</h4>
                            <p className="text-gray-300 text-sm mb-2">{upsell.description}</p>
                            {upsell.example && <p className="text-purple-200 text-sm mb-2">💡 Exemple: {upsell.example}</p>}
                            <p className="text-green-400 text-sm font-bold">📈 {upsell.expected_impact}</p>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {analysisResults.sales_strategies?.cross_sell_bundles?.length > 0 && (
                    <>
                      <h3 className="text-white font-bold mb-3">Bundles suggérés:</h3>
                      <div className="space-y-3 mb-6">
                        {analysisResults.sales_strategies.cross_sell_bundles.map((bundle, idx) => (
                          <div key={idx} className="bg-blue-900 bg-opacity-30 p-4 rounded-lg">
                            <h4 className="text-blue-400 font-bold mb-2">{bundle.bundle_name} (-{bundle.discount})</h4>
                            <div className="mb-2">
                              <p className="text-gray-400 text-sm mb-1">Produits inclus:</p>
                              <ul className="list-disc list-inside text-gray-300 text-sm">
                                {bundle.products?.map((p, pidx) => (
                                  <li key={pidx}>{p}</li>
                                ))}
                              </ul>
                            </div>
                            <p className="text-gray-300 text-sm mb-2">{bundle.positioning}</p>
                            <p className="text-green-400 text-sm font-bold">📈 {bundle.expected_impact}</p>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  <h3 className="text-white font-bold mb-3">Triggers psychologiques:</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {analysisResults.sales_strategies?.psychological_triggers?.map((trigger, idx) => (
                      <div key={idx} className="bg-gray-700 p-4 rounded-lg">
                        <p className="text-yellow-400 font-bold mb-2">{trigger.trigger}</p>
                        <p className="text-gray-300 text-sm mb-2">{trigger.tactic}</p>
                        <p className="text-green-400 text-sm font-bold">{trigger.impact}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Opportunités de croissance */}
                <div className="bg-gradient-to-r from-purple-900 to-pink-900 rounded-lg p-6 border border-purple-600">
                  <h2 className="text-white text-2xl font-bold mb-4">🚀 Opportunités de croissance</h2>
                  <div className="space-y-4">
                    {analysisResults.growth_opportunities?.map((opp, idx) => (
                      <div key={idx} className="bg-black bg-opacity-30 p-5 rounded-lg">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-2xl">{opp.category.split(' ')[0]}</span>
                          <h3 className="text-white font-bold text-lg">{opp.opportunity}</h3>
                        </div>
                        <p className="text-gray-200 mb-4">{opp.description}</p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                          <div className="bg-gray-800 p-3 rounded">
                            <p className="text-gray-400 text-xs mb-1">Investissement</p>
                            <p className="text-white font-bold">{opp.investment}</p>
                          </div>
                          <div className="bg-gray-800 p-3 rounded">
                            <p className="text-gray-400 text-xs mb-1">Retour attendu</p>
                            <p className="text-green-400 font-bold">{opp.expected_return}</p>
                          </div>
                          <div className="bg-gray-800 p-3 rounded">
                            <p className="text-gray-400 text-xs mb-1">Difficulté</p>
                            <p className="text-yellow-400 font-bold">{opp.difficulty}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recommandations par produit */}
                <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                  <h2 className="text-white text-2xl font-bold mb-4">🎨 Recommandations par produit (Top 10)</h2>
                  <div className="space-y-4">
                    {analysisResults.product_recommendations?.map((rec, idx) => (
                      <div key={idx} className="bg-gray-700 p-5 rounded-lg">
                        <div className="flex items-center gap-3 mb-3">
                          <span className="bg-blue-600 text-white font-bold px-3 py-1 rounded-full">#{rec.rank}</span>
                          <h3 className="text-white font-bold text-lg">{rec.product_name}</h3>
                          <span className={`ml-auto px-2 py-1 rounded text-xs font-bold ${
                            rec.current_status === 'active' ? 'bg-green-600' : 'bg-yellow-600'
                          }`}>
                            {rec.current_status}
                          </span>
                        </div>
                        {rec.recommendations?.length > 0 ? (
                          <div className="space-y-2">
                            {rec.recommendations.map((recItem, ridx) => (
                              <div key={ridx} className="bg-gray-800 p-3 rounded">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={`px-2 py-1 rounded text-xs font-bold ${
                                    recItem.priority === 'Critique' ? 'bg-red-600' :
                                    recItem.priority === 'Haute' ? 'bg-orange-600' : 'bg-yellow-600'
                                  }`}>
                                    {recItem.priority}
                                  </span>
                                  <span className="text-blue-400 font-bold text-sm">{recItem.type}</span>
                                </div>
                                <p className="text-gray-300 text-sm mb-1">{recItem.issue}</p>
                                <p className="text-green-300 text-sm">✅ {recItem.suggestion}</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-green-400">✅ Aucune amélioration critique nécessaire</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bouton retour */}
                <div className="flex justify-center">
                  <button
                    onClick={() => setActiveTab('ai')}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg"
                  >
                    🔄 Lancer une nouvelle analyse
                  </button>
                </div>
              </>
            ) : (
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 text-center">
                <p className="text-gray-400 mb-4">Aucune analyse disponible</p>
                <button
                  onClick={() => setActiveTab('ai')}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg"
                >
                  Lancer une analyse
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
