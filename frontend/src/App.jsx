import React, { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import Dashboard from './Dashboard'
import StripePricingTable from './PricingTable'

const supabase = createClient(
  'https://jgmsfadayzbgykzajvmw.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnbXNmYWRheXpiZ3lremFqdm13Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQwODk0NTksImV4cCI6MjA3OTY2NTQ1OX0.sg0O2QGdoKO5Zb6vcRJr5pSu2zlaxU3r7nHtyXb07hg'
)

// Stripe Payment Links are created dynamically via backend API
// No static links needed - backend generates them on demand

const PRICING_PLANS = [
  {
    name: 'Standard',
    price: '$99',
    popular: false,
    features: [
      'Détection des produits sous-performants',
      'Réécriture automatique des titres',
      'Suggestions d\'optimisation de prix',
      'Analyse 50 produits/mois',
      '1 boutique Shopify',
      'Rapport mensuel'
    ],
    cta: 'Commencer',
    plan_id: 'standard',
    highlight: false
  },
  {
    name: 'Pro',
    price: '$199',
    popular: true,
    features: [
      'Détection avancée des produits faibles',
      'Réécriture intelligente titres + descriptions',
      'Optimisation automatique des prix',
      'Recommandations d\'images stratégiques',
      'Cross-sell & Upsell personnalisés',
      'Analyse 500 produits/mois',
      '3 boutiques Shopify',
      'Rapports hebdomadaires automatisés'
    ],
    cta: 'Commencer maintenant',
    plan_id: 'pro',
    highlight: true
  },
  {
    name: 'Premium',
    price: '$299',
    popular: false,
    features: [
      'IA prédictive des tendances de vente',
      'Génération complète de contenu optimisé',
      'Actions automatiques (prix, images, stock)',
      'Stratégies Cross-sell & Upsell avancées',
      'Rapports quotidiens personnalisés (PDF/Email)',
      'Analyse illimitée de produits',
      'Boutiques Shopify illimitées',
      'Account manager dédié',
      'Accès API complet'
    ],
    cta: 'Obtenir Premium',
    plan_id: 'premium',
    highlight: false
  }
]

export default function App() {
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authMode, setAuthMode] = useState('signup') // 'signup' or 'login'
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    username: '',
    email: '',
    password: ''
  })
  const [authMessage, setAuthMessage] = useState('')
  const [scrolled, setScrolled] = useState(false)
  const [currentView, setCurrentView] = useState('landing')
  const [user, setUser] = useState(null)
  const [hasSubscription, setHasSubscription] = useState(false)
  const [paymentSuccess, setPaymentSuccess] = useState(false)
  const [paymentProcessingState, setPaymentProcessingState] = useState('idle') // 'idle' | 'verifying' | 'verified' | 'failed'
  const [paymentProcessingMessage, setPaymentProcessingMessage] = useState('')

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', handleScroll)
    
    // Check for payment success in query string
    const urlParams = new URLSearchParams(window.location.search)
    const isPaymentSuccess = urlParams.get('payment') === 'success' || urlParams.has('session_id') || urlParams.get('checkout') === 'success'
    
    if (isPaymentSuccess) {
      // Stay on landing, mark success and poll for subscription
      setPaymentSuccess(true)

      // If Stripe returned a session_id, call verify-session endpoint to force-persist subscription
      const sessionId = urlParams.get('session_id')
      if (sessionId) {
        ;(async () => {
          try {
            const { data: { session } } = await supabase.auth.getSession()
            if (session && session.access_token) {
              setPaymentProcessingState('verifying')
              setPaymentProcessingMessage('Vérification du paiement en cours...')

              const resp = await fetch('https://shopbrain-backend.onrender.com/api/subscription/verify-session', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ session_id: sessionId })
              })

              if (resp.ok) {
                const data = await resp.json().catch(() => ({}))
                console.log('verify-session response:', data)
                if (data?.success) {
                  setHasSubscription(true)
                  setPaymentProcessingState('verified')
                  setPaymentProcessingMessage('Paiement confirmé — abonnement activé')
                  setCurrentView('dashboard')
                  window.location.hash = '#dashboard'
                  return
                } else {
                  setPaymentProcessingState('failed')
                  setPaymentProcessingMessage(data?.message || 'La vérification a échoué')
                }
              } else {
                console.warn('verify-session failed:', resp.status, resp.statusText)
                setPaymentProcessingState('failed')
                setPaymentProcessingMessage(`Erreur serveur: ${resp.status}`)
              }
            }
          } catch (e) {
            console.error('Error calling verify-session:', e)
            setPaymentProcessingState('failed')
            setPaymentProcessingMessage(e.message || 'Erreur lors de la vérification')
          }
        })()
      }

      // Poll subscription status for up to 60 seconds (2s intervals to avoid resource exhaustion)
      let pollCount = 0
      const pollInterval = setInterval(() => {
        checkSubscription()
        pollCount++
        if (pollCount >= 30) {
          clearInterval(pollInterval)
        }
      }, 2000)
      return () => clearInterval(pollInterval)
    }
    
    // Handle hash-based routing
    const handleHashChange = () => {
      // Check for payment success
      if (window.location.hash.includes('success=true')) {
        setCurrentView('dashboard')
        return
      }
      
      if (window.location.hash === '#stripe-pricing') {
        setCurrentView('stripe-pricing')
      } else if (window.location.hash.includes('dashboard')) {
        if (user && hasSubscription) setCurrentView('dashboard')
      } else {
        setCurrentView('landing')
      }
    }
    window.addEventListener('hashchange', handleHashChange)
    handleHashChange() // Check current hash on mount
    
    // Check for authenticated user then subscription
    checkUser()
    checkSubscription()
    
    // Listen for auth changes
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        setUser(session.user)
        checkSubscription()
        // After login, show dashboard or handle success
        const hash = window.location.hash
        if (hash.includes('success=true')) {
          setCurrentView('dashboard')
        } else if (hash.includes('dashboard')) {
          setCurrentView('dashboard')
        } else {
          setCurrentView('landing')
        }
        setShowAuthModal(false)
      } else if (event === 'SIGNED_OUT') {
        setUser(null)
        setHasSubscription(false)
        setCurrentView('landing')
      }
    })
    
    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('hashchange', handleHashChange)
      authListener?.subscription?.unsubscribe()
    }
  }, [user, hasSubscription])

  // Auto-route to dashboard when payment succeeded and subscription detected
  useEffect(() => {
    if (paymentSuccess && hasSubscription && user) {
      setCurrentView('dashboard')
      window.location.hash = '#dashboard'
    }
  }, [paymentSuccess, hasSubscription, user])

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      setUser(session.user)
      // Check if user has paid (has subscription)
      if (window.location.hash.includes('dashboard') || window.location.hash.includes('shopify')) {
        setCurrentView('dashboard')
      }
    }
  }

  const checkSubscription = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session || !session.user) {
        setHasSubscription(false)
        return
      }
      const resp = await fetch('https://shopbrain-backend.onrender.com/api/subscription/status', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ user_id: session.user.id })
      })
      if (!resp.ok) {
        console.error('Subscription check failed:', resp.status, resp.statusText)
        setHasSubscription(false)
        return
      }
      const data = await resp.json()
      console.log('Subscription check response:', data)
      setHasSubscription(Boolean(data?.success && data?.has_subscription))
    } catch (e) {
      setHasSubscription(false)
      console.error('Subscription check error:', e)
    }
  }

  // Compute a safe redirect URL for Supabase OAuth (works locally and on GitHub Pages)
  const getRedirectUrl = () => {
    if (typeof window === 'undefined') return 'https://fdkng.github.io/SHOPBRAIN_AI'
    const url = new URL(window.location.href)
    // Force the GitHub Pages base path when deployed
    const basePath = url.pathname.includes('/SHOPBRAIN_AI') ? '/SHOPBRAIN_AI' : ''
    return `${url.origin}${basePath}/`
  }

  const handleSignup = async (e) => {
    e.preventDefault()
    setAuthMessage('')
    
    // Validation
    if (formData.password.length < 6) {
      setAuthMessage('❌ Le mot de passe doit contenir au moins 6 caractères')
      return
    }
    
    try {
      // Inscription avec confirmation automatique (pas d'email requis)
      const { data, error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            first_name: formData.firstName,
            last_name: formData.lastName,
            username: formData.username,
            full_name: `${formData.firstName} ${formData.lastName}`
          },
          emailRedirectTo: getRedirectUrl()
        }
      })
      
      if (error) {
        if (error.message.includes('already registered')) {
          setAuthMessage('❌ Cet email est déjà utilisé. Connecte-toi ou utilise un autre email.')
        } else {
          setAuthMessage('❌ ' + error.message)
        }
        return
      }
      
      // Compte créé et connecté automatiquement
      setUser(data.user)
      setShowAuthModal(false)
      setAuthMessage('')
      setFormData({ firstName: '', lastName: '', username: '', email: '', password: '' })
      
      // Scroll vers les tarifs
      setTimeout(() => {
        document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })
      }, 500)
      
    } catch (error) {
      setAuthMessage('❌ Une erreur est survenue. Réessaie.')
      console.error(error)
    }
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setAuthMessage('')
    
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password
      })
      
      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          setAuthMessage('❌ Email ou mot de passe incorrect')
        } else {
          setAuthMessage('❌ ' + error.message)
        }
        return
      }
      
      setUser(data.user)
      setShowAuthModal(false)
      setAuthMessage('')
      setFormData({ firstName: '', lastName: '', username: '', email: '', password: '' })
      
    } catch (error) {
      setAuthMessage('❌ Une erreur est survenue. Réessaie.')
      console.error(error)
    }
  }

  const handleGoogleSignIn = async () => {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: getRedirectUrl()
        }
      })
      
      if (error) {
        setAuthMessage('❌ Erreur avec Google Sign-In: ' + error.message)
      }
    } catch (error) {
      setAuthMessage('❌ Une erreur est survenue avec Google.')
      console.error(error)
    }
  }

  const handleStripeCheckout = async (planId) => {
    // Check if user is logged in
    if (!user) {
      alert('⚠️ Tu dois d\'abord créer un compte avant de t\'abonner !')
      setShowAuthModal(true)
      setAuthMode('signup')
      return
    }
    
    try {
      // Get auth session
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        alert('Erreur: Session non trouvée. Reconnecte-toi.')
        return
      }

      if (!session.access_token) {
        alert('Erreur: Token d\'accès manquant. Reconnecte-toi.')
        console.error('Missing access_token in session:', session)
        return
      }

      // Map UI plan to backend plan keys (Stripe price mapping)
      const planMap = { standard: '99', pro: '199', premium: '299' }
      const planKey = planMap[planId] || planId

      console.log('Checkout request:', { planKey, email: user.email, token: session.access_token.substring(0, 20) + '...' })

      // Call backend to create checkout session
      const response = await fetch(
        'https://shopbrain-backend.onrender.com/create-checkout-session',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            plan: planKey,
            email: user.email
          })
        }
      )

      console.log('Checkout response status:', response.status)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        alert(`Erreur: ${errorData.detail || response.statusText || 'Impossible de créer la session de paiement'}`)
        console.error('Checkout session error:', errorData)
        return
      }

      const data = await response.json()
      console.log('Checkout URL received:', data.url)
      if (data.url) {
        window.location.href = data.url
      } else {
        alert('Erreur: URL de checkout manquante')
        console.error('Checkout response:', data)
      }
    } catch (error) {
      alert(`Erreur de connexion: ${error.message}`)
      console.error('Stripe checkout error:', error)
    }
  }

  // If user is logged in and on dashboard view, show Dashboard component
  if (currentView === 'dashboard' && user) {
    return <Dashboard />
  }

  // If viewing Stripe Pricing Table
  if (currentView === 'stripe-pricing') {
    return <StripePricingTable userEmail={user?.email} userId={user?.id} />
  }

  // Otherwise show landing page
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${
        scrolled ? 'bg-white/80 backdrop-blur-md shadow-sm border-b border-gray-200' : 'bg-white border-b border-gray-100'
      }`}>
        <div className="max-w-7xl mx-auto px-6 sm:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                💡
              </div>
              <span className="text-lg sm:text-xl font-semibold text-gray-900">ShopBrain AI</span>
            </div>
            
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm font-normal text-gray-600 hover:text-gray-900 transition-colors">
                Fonctionnalités
              </a>
              <a href="#how-it-works" className="text-sm font-normal text-gray-600 hover:text-gray-900 transition-colors">
                Comment ça marche
              </a>
              <a href="#pricing" className="text-sm font-normal text-gray-600 hover:text-gray-900 transition-colors">
                Tarifs
              </a>
            </div>

            {user ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-700 rounded-full text-sm">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  <span className="font-medium">{user.user_metadata?.first_name || 'Connecté'}</span>
                </div>
                <button
                  onClick={() => {
                    if (hasSubscription) {
                      setCurrentView('dashboard')
                    } else {
                      alert('Abonnement requis pour accéder au dashboard')
                      window.location.hash = '#pricing'
                    }
                  }}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                    hasSubscription ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-200 text-gray-600 cursor-not-allowed'
                  }`}
                >
                  Dashboard
                </button>
                <button
                  onClick={async () => {
                    await supabase.auth.signOut()
                    setUser(null)
                    setCurrentView('landing')
                  }}
                  className="px-4 py-2 text-gray-600 hover:text-gray-900 text-sm font-medium transition"
                >
                  Déconnexion
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-full hover:bg-blue-700 transition-all hover:scale-105 shadow-md"
              >
                Se connecter
              </button>
            )}
          </div>
        </div>
      </nav>

      {paymentSuccess && (
        <div className="mt-20 mx-auto max-w-7xl px-6 mb-6">
          <div className={`rounded-2xl p-6 flex items-center justify-between shadow-sm ${paymentProcessingState === 'verified' ? 'bg-green-50 border border-green-200 text-green-800' : paymentProcessingState === 'failed' ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-yellow-50 border border-yellow-200 text-yellow-800'}`}>
            <div className="flex items-center gap-4">
              <span className="text-4xl">
                {paymentProcessingState === 'verified' ? '✅' : paymentProcessingState === 'failed' ? '❌' : '⏳'}
              </span>
              <div>
                <div className="font-semibold text-lg">
                  {paymentProcessingState === 'verified' ? 'Paiement confirmé!' : paymentProcessingState === 'failed' ? 'Échec du traitement' : 'Traitement du paiement'}
                </div>
                <div className="text-sm">
                  {paymentProcessingMessage || (paymentProcessingState === 'verified' ? 'Ton abonnement est actif. Tu peux maintenant accéder à ton dashboard.' : paymentProcessingState === 'failed' ? 'Le traitement a échoué. Réessaie ou contacte le support.' : 'Vérification en cours — cela peut prendre quelques secondes.')}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setCurrentView('dashboard')}
                disabled={!hasSubscription}
                className={`px-6 py-2 rounded-full text-sm font-semibold whitespace-nowrap ${
                  hasSubscription ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-200 text-gray-600 cursor-not-allowed'
                }`}
              >
                Accéder au dashboard →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auth Modal - Inscription/Connexion */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-fadeIn" onClick={() => setShowAuthModal(false)}>
          <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl animate-scaleIn max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-semibold text-gray-900">
                {authMode === 'signup' ? 'Créer un compte' : 'Se connecter'}
              </h3>
              <button onClick={() => setShowAuthModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl font-light">×</button>
            </div>

            {/* Toggle entre Inscription/Connexion */}
            <div className="flex gap-2 mb-6 bg-gray-100 p-1 rounded-xl">
              <button
                onClick={() => setAuthMode('signup')}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition ${
                  authMode === 'signup' ? 'bg-white text-gray-900 shadow' : 'text-gray-600'
                }`}
              >
                Inscription
              </button>
              <button
                onClick={() => setAuthMode('login')}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition ${
                  authMode === 'login' ? 'bg-white text-gray-900 shadow' : 'text-gray-600'
                }`}
              >
                Connexion
              </button>
            </div>

            {/* Formulaire Inscription */}
            {authMode === 'signup' && (
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">Prénom *</label>
                    <input
                      type="text"
                      value={formData.firstName}
                      onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                      placeholder="Jean"
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">Nom *</label>
                    <input
                      type="text"
                      value={formData.lastName}
                      onChange={(e) => setFormData({...formData, lastName: e.target.value})}
                      placeholder="Dupont"
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">Nom d'utilisateur *</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({...formData, username: e.target.value})}
                    placeholder="monpseudo"
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">Email *</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    placeholder="votre@email.com"
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">Mot de passe *</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">Minimum 6 caractères</p>
                </div>
                <button
                  type="submit"
                  className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors text-sm"
                >
                  Créer mon compte
                </button>
                <p className="text-xs text-gray-600 text-center">
                  Un email de confirmation sera envoyé pour activer ton compte
                </p>
              </form>
            )}

            {/* Formulaire Connexion */}
            {authMode === 'login' && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    placeholder="votre@email.com"
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">Mot de passe</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                    placeholder="••••••••"
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors text-sm"
                >
                  Se connecter
                </button>
              </form>
            )}

            {/* Séparateur OU */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-2 bg-white text-gray-500">OU</span>
              </div>
            </div>

            {/* Google Sign-In */}
            <button
              onClick={handleGoogleSignIn}
              type="button"
              className="w-full px-6 py-3 bg-white border-2 border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors text-sm flex items-center justify-center gap-3"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continuer avec Google
            </button>

            {authMessage && (
              <div className={`mt-4 p-3 rounded-xl text-xs ${
                authMessage.includes('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}>
                {authMessage}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hero Section - Apple Style avec visuels */}
      <section className="pt-24 pb-16 px-6 bg-gradient-to-b from-white to-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12 animate-fadeIn">
            <div className="inline-block mb-6">
              <span className="px-4 py-2 bg-blue-100 text-blue-700 rounded-full text-sm font-semibold">
                Nouveau : IA Générative pour Shopify
              </span>
            </div>
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold text-gray-900 tracking-tight leading-[1.05] mb-6">
              L'IA qui transforme<br />
              <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                vos ventes Shopify
              </span>
            </h1>
            <p className="text-xl md:text-2xl text-gray-600 mb-12 max-w-3xl mx-auto leading-relaxed">
              Optimisez automatiquement vos produits, descriptions et stratégies.<br />
              Augmentation moyenne de <span className="font-bold text-gray-900">+127%</span> des conversions en 30 jours.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
              <button
                onClick={() => window.location.hash = '#stripe-pricing'}
                className="px-10 py-5 bg-blue-600 text-white text-lg font-semibold rounded-full hover:bg-blue-700 transition-all hover:scale-105 shadow-2xl hover:shadow-blue-500/50"
              >
                Voir tous les plans →
              </button>
              <button
                onClick={() => setShowAuthModal(true)}
                className="px-10 py-5 text-gray-900 text-lg font-semibold border-2 border-gray-900 rounded-full hover:bg-gray-900 hover:text-white transition-all hover:scale-105"
              >
                Se connecter
              </button>
            </div>
            <p className="text-sm text-gray-500">
              ✓ Sans engagement • ✓ Essai 14 jours • ✓ Résultats garantis
            </p>
          </div>

          {/* Dashboard Button */}
          {user && (
            <div className="mt-16 flex justify-center">
              <button
                onClick={() => {
                  if (hasSubscription) {
                    setCurrentView('dashboard')
                    window.location.hash = '#dashboard'
                  } else {
                    alert('Abonnement requis pour accéder au dashboard')
                    document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })
                  }
                }}
                disabled={!hasSubscription}
                className={`px-12 py-4 text-white text-lg font-semibold rounded-full transition-all hover:scale-105 ${
                  hasSubscription
                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:shadow-2xl hover:shadow-blue-500/50'
                    : 'bg-gray-300 cursor-not-allowed'
                }`}
              >
                Accéder à mon Dashboard →
              </button>
            </div>
          )}
          {!user && (
            <div className="mt-16 text-center">
              <p className="text-gray-600 mb-6">Connecte-toi pour accéder à ton dashboard et voir ton IA</p>
            </div>
          )}
        </div>
      </section>

      {/* Social Proof */}
      <section className="py-12 px-6 bg-gray-50 border-y border-gray-200">
        <div className="max-w-6xl mx-auto">
          <p className="text-center text-sm text-gray-500 mb-6">Ils nous font confiance</p>
          <div className="flex flex-wrap justify-center items-center gap-12 opacity-60">
            <div className="text-2xl font-bold text-gray-400">SHOPIFY</div>
            <div className="text-2xl font-bold text-gray-400">STRIPE</div>
            <div className="text-2xl font-bold text-gray-400">OPENAI</div>
            <div className="text-2xl font-bold text-gray-400">SUPABASE</div>
          </div>
        </div>
      </section>

      {/* Features Section - Apple Style amélioré */}
      <section id="features" className="py-24 px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-5xl md:text-6xl font-bold text-gray-900 mb-4">
              Fonctionnalités<br />surpuissantes.
            </h2>
            <p className="text-xl text-gray-600">
              Tout ce dont vous avez besoin pour dominer votre marché.
            </p>
          </div>

          {/* Feature Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[
              {
                icon: '⚡',
                gradient: 'from-yellow-400 to-orange-500',
                title: 'Analyse IA en temps réel',
                desc: 'Scannez des milliers de produits en secondes. Notre IA analyse titres, descriptions, prix et images pour détecter les opportunités d\'optimisation.',
                stat: '10M+ produits analysés'
              },
              {
                icon: '✨',
                gradient: 'from-blue-400 to-purple-500',
                title: 'Optimisation automatique',
                desc: 'L\'IA génère automatiquement des titres SEO-optimisés, des descriptions persuasives et des tags pertinents. Augmentez vos conversions sans lever le petit doigt.',
                stat: '+127% conversions moyenne'
              },
              {
                icon: '📈',
                gradient: 'from-green-400 to-emerald-500',
                title: 'Analytics & Insights',
                desc: 'Tableaux de bord en temps réel : ventes, profits, best-sellers, produits sous-performants. Prenez des décisions data-driven.',
                stat: 'Mises à jour toutes les 5min'
              },
              {
                icon: '🔗',
                gradient: 'from-purple-400 to-pink-500',
                title: 'Intégration Shopify native',
                desc: 'Connectez votre boutique en un clic. Synchronisation automatique bidirectionnelle : produits, commandes, clients, inventaire.',
                stat: 'Sync en <1 seconde'
              }
            ].map((feature, idx) => (
              <div key={idx} className="group relative p-8 bg-gradient-to-br from-gray-50 to-white border border-gray-200 rounded-3xl hover:shadow-2xl hover:scale-[1.02] transition-all duration-300 overflow-hidden">
                <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${feature.gradient} opacity-10 rounded-full blur-3xl group-hover:opacity-20 transition-opacity`}></div>
                <div className="relative">
                  <div className={`inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br ${feature.gradient} rounded-2xl text-3xl mb-6 shadow-lg`}>
                    {feature.icon}
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-3">{feature.title}</h3>
                  <p className="text-gray-600 leading-relaxed mb-4">{feature.desc}</p>
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-full text-sm font-semibold text-gray-700">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                    {feature.stat}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 text-center mb-16">Comment ça marche</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                number: '1',
                icon: '🔗',
                title: 'Connectez Shopify',
                desc: 'Liez votre magasin en toute sécurité'
              },
              {
                number: '2',
                icon: '👆',
                title: 'Sélectionnez produits',
                desc: 'Choisissez les articles à analyser'
              },
              {
                number: '3',
                icon: '💡',
                title: 'Recevez insights',
                desc: 'Obtenez des recommandations personnalisées'
              }
            ].map((step, idx) => (
              <div key={idx} className="text-center">
                <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-6 shadow-lg">
                  {step.number}
                </div>
                <div className="w-12 h-12 mx-auto bg-gray-100 rounded-xl flex items-center justify-center mb-4 text-2xl">
                  {step.icon}
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{step.title}</h3>
                <p className="text-sm text-gray-600">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section - Apple Style Premium */}
      <section id="pricing" className="py-32 px-6 bg-gradient-to-b from-gray-50 to-white relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern opacity-5"></div>
        <div className="max-w-7xl mx-auto relative">
          <div className="text-center mb-20">
            <h2 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
              Choisissez votre<br />
              <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                formule gagnante
              </span>
            </h2>
            <p className="text-xl text-gray-600 mb-2">
              Tous les plans incluent 14 jours d'essai gratuit. Sans engagement.
            </p>
            <p className="text-sm text-blue-600 font-semibold">💡 Le plan Pro offre le meilleur rapport qualité-prix</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {PRICING_PLANS.map((plan, idx) => (
              <div
                key={idx}
                className={`relative group ${
                  plan.highlight ? 'md:scale-110 z-10' : ''
                }`}
              >
                {plan.highlight && (
                  <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-purple-600 rounded-3xl blur-xl opacity-50 group-hover:opacity-75 transition-opacity"></div>
                )}
                <div
                  className={`relative p-8 bg-white rounded-3xl transition-all duration-300 hover:shadow-2xl ${
                    plan.highlight 
                      ? 'border-2 border-blue-600 shadow-xl' 
                      : 'border border-gray-200 hover:border-blue-300'
                  }`}
                >
                  {plan.highlight && (
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2">
                      <div className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-2 rounded-full shadow-lg font-bold text-sm">
                        <span>🏆</span>
                        <span>LE PLUS POPULAIRE</span>
                      </div>
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full blur-lg opacity-30 -z-10"></div>
                    </div>
                  )}
                  
                  <div className="text-center mb-6">
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                    <div className="mb-4">
                      <span className="text-5xl font-bold text-gray-900">{plan.price}</span>
                      <span className="text-gray-600 text-lg">/mois</span>
                    </div>
                    <p className="text-sm text-gray-500">Facturé mensuellement</p>
                  </div>

                  <ul className="space-y-4 mb-8">
                    {plan.features.map((feature, fidx) => (
                      <li key={fidx} className="flex items-start gap-3">
                        <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${
                          plan.highlight ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
                        }`}>
                          ✓
                        </span>
                        <span className="text-sm text-gray-700 leading-relaxed">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA removed; selection via Stripe Pricing Table */}
                  <div className="w-full py-4 rounded-2xl text-base font-semibold text-center border border-gray-200 bg-gray-50 text-gray-600">
                    Sélectionnez votre plan via « Voir tous les plans »
                  </div>
                  
                  <p className="text-center text-xs text-gray-500 mt-4">
                    Annulation en un clic
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-16 text-center">
            <p className="text-gray-600 mb-4">Besoin d'un plan sur mesure ?</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={() => window.location.hash = '#stripe-pricing'}
                className="px-8 py-3 bg-blue-600 text-white font-semibold border-2 border-blue-600 rounded-full hover:bg-blue-700 transition-all"
              >
                Voir tous les plans →
              </button>
              <button
                onClick={() => setShowAuthModal(true)}
                className="px-8 py-3 text-blue-600 font-semibold border-2 border-blue-600 rounded-full hover:bg-blue-600 hover:text-white transition-all"
              >
                Contactez notre équipe
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
            Prêt à transformer votre Shopify?
          </h2>
          <p className="text-lg text-gray-600 mb-10">
            Rejoignez des centaines de sellers qui utilisent ShopBrain AI
          </p>
          <button
            onClick={() => window.location.hash = '#stripe-pricing'}
            className="px-8 py-4 bg-blue-600 text-white text-base font-medium rounded-full hover:bg-blue-700 transition-all hover:scale-105 shadow-lg hover:shadow-xl"
          >
            Voir tous les plans →
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-12 px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            <div>
              <h4 className="text-xs font-semibold text-gray-900 mb-4 tracking-wide">PRODUIT</h4>
              <ul className="space-y-3 text-sm text-gray-600">
                <li><a href="#features" className="hover:text-gray-900 transition-colors">Fonctionnalités</a></li>
                <li><a href="#pricing" className="hover:text-gray-900 transition-colors">Tarifs</a></li>
                <li><a href="#how-it-works" className="hover:text-gray-900 transition-colors">Comment ça marche</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-gray-900 mb-4 tracking-wide">ENTREPRISE</h4>
              <ul className="space-y-3 text-sm text-gray-600">
                <li><a href="#" className="hover:text-gray-900 transition-colors">À propos</a></li>
                <li><a href="#" className="hover:text-gray-900 transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-gray-900 transition-colors">Contact</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-gray-900 mb-4 tracking-wide">LÉGAL</h4>
              <ul className="space-y-3 text-sm text-gray-600">
                <li><a href="#" className="hover:text-gray-900 transition-colors">Politique de confidentialité</a></li>
                <li><a href="#" className="hover:text-gray-900 transition-colors">Conditions d'utilisation</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-200 pt-8">
            <p className="text-center text-sm text-gray-600">© 2025 ShopBrain AI. Tous droits réservés.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
