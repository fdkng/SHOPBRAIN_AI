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
  const [landingStatusByKey, setLandingStatusByKey] = useState({})
  const [faqOpenIndex, setFaqOpenIndex] = useState(null)
  
  // Prevent simultaneous subscription checks
  const subscriptionCheckInProgressRef = React.useRef(false)

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
    // Skip if already checking to prevent stacking requests
    if (subscriptionCheckInProgressRef.current) {
      console.log('Subscription check already in progress, skipping...')
      return
    }
    
    subscriptionCheckInProgressRef.current = true
    const timeoutId = setTimeout(() => {
      console.warn('Subscription check timeout (10s), releasing lock')
      subscriptionCheckInProgressRef.current = false
    }, 10000)
    
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
        body: JSON.stringify({ user_id: session.user.id }),
        signal: AbortSignal.timeout(9000) // 9s fetch timeout
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
    } finally {
      clearTimeout(timeoutId)
      subscriptionCheckInProgressRef.current = false
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
      setAuthMessage('Le mot de passe doit contenir au moins 6 caractères')
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
          setAuthMessage('Cet email est déjà utilisé. Connecte-toi ou utilise un autre email.')
        } else {
          setAuthMessage(error.message)
        }
        return
      }
      
      if (data?.session && data?.user) {
        setUser(data.user)
        setShowAuthModal(false)
        setAuthMessage('')
        setFormData({ firstName: '', lastName: '', username: '', email: '', password: '' })
        setTimeout(() => {
          document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })
        }, 500)
      } else {
        setAuthMessage('Compte créé. Vérifie ton email pour activer le compte, puis connecte-toi.')
        setAuthMode('login')
      }
      
    } catch (error) {
      setAuthMessage('Une erreur est survenue. Réessaie.')
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
          setAuthMessage('Email ou mot de passe incorrect')
        } else {
          setAuthMessage(error.message)
        }
        return
      }
      
      setUser(data.user)
      setShowAuthModal(false)
      setAuthMessage('')
      setFormData({ firstName: '', lastName: '', username: '', email: '', password: '' })
      
    } catch (error) {
      setAuthMessage('Une erreur est survenue. Réessaie.')
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
        setAuthMessage('Erreur avec Google Sign-In: ' + error.message)
      }
    } catch (error) {
      setAuthMessage('Une erreur est survenue avec Google.')
      console.error(error)
    }
  }

  const handleStripeCheckout = async (planId) => {
    // Check if user is logged in
    if (!user) {
      setLandingStatusByKey((prev) => ({
        ...prev,
        pricing: { type: 'warning', message: 'Tu dois d\'abord créer un compte avant de t\'abonner.' }
      }))
      setShowAuthModal(true)
      setAuthMode('signup')
      return
    }
    
    try {
      // Get auth session
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setLandingStatusByKey((prev) => ({
          ...prev,
          pricing: { type: 'error', message: 'Erreur: Session non trouvée. Reconnecte-toi.' }
        }))
        return
      }

      if (!session.access_token) {
        setLandingStatusByKey((prev) => ({
          ...prev,
          pricing: { type: 'error', message: 'Erreur: Token d\'accès manquant. Reconnecte-toi.' }
        }))
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
        setLandingStatusByKey((prev) => ({
          ...prev,
          pricing: { type: 'error', message: `Erreur: ${errorData.detail || response.statusText || 'Impossible de créer la session de paiement'}` }
        }))
        console.error('Checkout session error:', errorData)
        return
      }

      const data = await response.json()
      console.log('Checkout URL received:', data.url)
      if (data.url) {
        window.location.href = data.url
      } else {
        setLandingStatusByKey((prev) => ({
          ...prev,
          pricing: { type: 'error', message: 'Erreur: URL de checkout manquante' }
        }))
        console.error('Checkout response:', data)
      }
    } catch (error) {
      setLandingStatusByKey((prev) => ({
        ...prev,
        pricing: { type: 'error', message: `Erreur de connexion: ${error.message}` }
      }))
      console.error('Stripe checkout error:', error)
    }
  }

  const renderLandingStatus = (key) => {
    const status = landingStatusByKey[key]
    if (!status?.message) return null

    const styles = status.type === 'success'
      ? 'bg-green-50 border-green-200 text-green-800'
      : status.type === 'warning'
        ? 'bg-yellow-50 border-yellow-200 text-yellow-800'
        : status.type === 'error'
          ? 'bg-gray-50 border-yellow-200 text-yellow-800'
          : 'bg-gray-50 border-gray-200 text-gray-700'

    return (
      <div className={`mt-4 p-4 rounded-2xl border ${styles}`}>
        {status.message}
      </div>
    )
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
    <div className="min-h-screen bg-gray-900">
      {/* Navigation */}
      <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${
        scrolled ? 'bg-gray-900/80 backdrop-blur-md shadow-sm border-b border-gray-700' : 'bg-gray-900 border-b border-gray-700'
      }`}>
        <div className="max-w-7xl mx-auto px-6 sm:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <span className="text-lg sm:text-xl font-semibold text-white">ShopBrain AI</span>
            </div>
            
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm font-normal text-gray-400 hover:text-white transition-colors">
                Fonctionnalités
              </a>
              <a href="#how-it-works" className="text-sm font-normal text-gray-400 hover:text-white transition-colors">
                Fonctionnement
              </a>
              <a href="#pricing" className="text-sm font-normal text-gray-400 hover:text-white transition-colors">
                Tarifs
              </a>
            </div>

            {user ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-green-900/30 text-green-300 rounded-full text-sm border border-green-700/40">
                  <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                  <span className="font-medium">{user.user_metadata?.first_name || 'Connecté'}</span>
                </div>
                <button
                  onClick={() => {
                    if (hasSubscription) {
                      setCurrentView('dashboard')
                    } else {
                      setLandingStatusByKey((prev) => ({
                        ...prev,
                        dashboardNav: { type: 'warning', message: 'Abonnement requis pour accéder au dashboard.' }
                      }))
                      window.location.hash = '#pricing'
                    }
                  }}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                    hasSubscription ? 'bg-yellow-600 text-black hover:bg-yellow-500' : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  Dashboard
                </button>
                {renderLandingStatus('dashboardNav')}
                <button
                  onClick={async () => {
                    await supabase.auth.signOut()
                    setUser(null)
                    setCurrentView('landing')
                  }}
                  className="px-4 py-2 text-gray-400 hover:text-white text-sm font-medium transition"
                >
                  Déconnexion
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                className="px-4 py-2 bg-yellow-600 text-black text-sm font-medium rounded-full hover:bg-yellow-500 transition-all hover:scale-105 shadow-md"
              >
                Se connecter
              </button>
            )}
          </div>
        </div>
      </nav>

      {paymentSuccess && (
        <div className="mt-20 mx-auto max-w-7xl px-6 mb-6">
          <div className={`rounded-2xl p-6 flex items-center justify-between shadow-sm ${paymentProcessingState === 'verified' ? 'bg-green-50 border border-green-200 text-green-800' : paymentProcessingState === 'failed' ? 'bg-gray-50 border border-yellow-200 text-yellow-800' : 'bg-yellow-50 border border-yellow-200 text-yellow-800'}`}>
            <div className="flex items-center gap-4">
              <span className="text-4xl">
                {paymentProcessingState === 'verified' ? 'OK' : paymentProcessingState === 'failed' ? 'Erreur' : '...'}
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
                Accéder au dashboard
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
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm text-gray-900 placeholder-gray-400"
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
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm text-gray-900 placeholder-gray-400"
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
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm text-gray-900 placeholder-gray-400"
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
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm text-gray-900 placeholder-gray-400"
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
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm text-gray-900 placeholder-gray-400"
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
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm text-gray-900 placeholder-gray-400"
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
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm text-gray-900 placeholder-gray-400"
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
                authMessage.toLowerCase().startsWith('succès') || authMessage.toLowerCase().startsWith('compte créé')
                  ? 'bg-green-50 text-green-700'
                  : 'bg-yellow-50 text-yellow-800'
              }`}>
                {authMessage}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hero Section - Apple Style avec visuels */}
      <section className="pt-28 pb-20 px-6 bg-gradient-to-b from-gray-900 via-gray-900 to-gray-800">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12 animate-fadeIn">
            <div className="inline-block mb-6">
              <span className="px-4 py-2 bg-blue-900/60 text-blue-300 border border-blue-700/50 rounded-full text-xs font-semibold uppercase tracking-[0.2em]">
                Nouveau — IA Générative Shopify
              </span>
            </div>
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-white tracking-tight leading-[1.05] mb-4">
              L'IA qui transforme vos ventes Shopify
            </h1>
            <p className="text-base md:text-lg text-gray-400 mb-12 max-w-3xl mx-auto leading-relaxed">
              Pilotez votre croissance avec une IA d'élite, claire et actionnable.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
              <button
                onClick={() => window.location.hash = '#stripe-pricing'}
                className="px-10 py-5 bg-yellow-600 text-black text-lg font-semibold rounded-full hover:bg-yellow-500 transition-all hover:scale-105 shadow-2xl hover:shadow-yellow-500/30"
              >
                Voir tous les plans
              </button>
              <button
                onClick={() => setShowAuthModal(true)}
                className="px-10 py-5 text-white text-lg font-semibold border-2 border-gray-600 rounded-full hover:bg-gray-800 hover:text-white transition-all hover:scale-105"
              >
                Se connecter
              </button>
            </div>
            <p className="text-sm text-gray-400">
              • Sans engagement • Essai 14 jours • Résultats garantis
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
                    setLandingStatusByKey((prev) => ({
                      ...prev,
                      dashboardHero: { type: 'warning', message: 'Abonnement requis pour accéder au dashboard.' }
                    }))
                    document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })
                  }
                }}
                disabled={!hasSubscription}
                className={`px-12 py-4 text-white text-lg font-semibold rounded-full transition-all hover:scale-105 ${
                  hasSubscription
                    ? 'bg-gradient-to-r from-yellow-600 to-yellow-500 hover:shadow-2xl hover:shadow-yellow-500/30'
                    : 'bg-gray-700 cursor-not-allowed'
                }`}
              >
                Accéder à mon Dashboard
              </button>
              {renderLandingStatus('dashboardHero')}
            </div>
          )}
          {!user && (
            <div className="mt-16 text-center">
              <p className="text-gray-400 mb-6">Connecte-toi pour accéder à ton dashboard et voir ton IA</p>
            </div>
          )}
        </div>
      </section>

      {/* Pre-Dashboard Questions */}
      <section className="py-20 px-6 bg-gray-950 border-y border-gray-800">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs uppercase tracking-[0.3em] text-gray-500 mb-4">Avant le dashboard</p>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">Répondre aux questions critiques avant d’agir</h2>
            <p className="text-lg text-gray-400 max-w-3xl mx-auto">ShopBrain structure les décisions avec des questions métiers claires et priorisées.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              {
                question: 'Quelles actions ont un impact immédiat sur les revenus ?',
                answer: 'Le cockpit identifie les optimisations à ROI rapide avant d’exécuter.'
              },
              {
                question: 'Où perdons-nous des ventes ?',
                answer: 'Les points de friction sont isolés par segment, produit et canal.'
              },
              {
                question: 'Quelles fiches produits doivent être corrigées en priorité ?',
                answer: 'Les anomalies critiques sont hiérarchisées avec un plan d’action.'
              },
              {
                question: 'Quel est l’impact réel des actions IA ?',
                answer: 'Chaque décision est suivie avec KPI, historique et exécution.'
              }
            ].map((item, idx) => (
              <div key={idx} className="bg-gray-900 border border-gray-800 rounded-3xl p-6">
                <button
                  onClick={() => setFaqOpenIndex(faqOpenIndex === idx ? null : idx)}
                  className="w-full flex items-center justify-between text-left"
                >
                  <h3 className="text-white text-lg font-semibold">{item.question}</h3>
                  <span className={`text-gray-400 text-sm transition-transform ${faqOpenIndex === idx ? 'rotate-90' : ''}`}>&raquo;</span>
                </button>
                {faqOpenIndex === idx && (
                  <p className="text-gray-400 text-sm leading-relaxed mt-4">{item.answer}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Ecosystem Section */}
      <section className="py-24 px-6 bg-gray-900">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs uppercase tracking-[0.3em] text-gray-400 mb-4">Écosystème</p>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">Un cockpit complet, pensé pour la performance</h2>
            <p className="text-lg text-gray-400 max-w-3xl mx-auto">Centralisez l’IA, la stratégie et l’exécution dans un hub unique, avec un rendu premium et une lisibilité irréprochable.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                title: 'Studio IA',
                desc: 'Analyse tes produits et propose des améliorations concrètes, avec historique clair des changements.'
              },
              {
                title: 'Command Center',
                desc: 'Centralise les priorités, les alertes et les actions à lancer pour piloter la boutique.'
              },
              {
                title: 'Automation Hub',
                desc: 'Planifie et exécute automatiquement les optimisations, sans interventions répétitives.'
              }
            ].map((card, idx) => (
              <div key={idx} className="bg-gray-800 border border-gray-700 rounded-3xl p-6">
                <h3 className="text-white text-xl font-semibold mb-2">{card.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Command Center Section */}
      <section className="py-24 px-6 bg-gray-900">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-gray-400 mb-4">Command Center</p>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">Tout comprendre en un coup d’œil</h2>
            <p className="text-lg text-gray-400 mb-6">Le tableau de bord explique clairement quoi améliorer, pourquoi, et comment agir.</p>
            <div className="space-y-3">
              <div className="flex items-center justify-between bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3">
                <span className="text-gray-300 text-sm">Actions recommandées</span>
                <span className="text-gray-500 text-sm">Claires et classées</span>
              </div>
              <div className="flex items-center justify-between bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3">
                <span className="text-gray-300 text-sm">Problèmes détectés</span>
                <span className="text-gray-500 text-sm">Avec explication</span>
              </div>
              <div className="flex items-center justify-between bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3">
                <span className="text-gray-300 text-sm">Suivi des résultats</span>
                <span className="text-gray-500 text-sm">Avant / après</span>
              </div>
            </div>
          </div>
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 rounded-3xl p-8">
            <div className="space-y-4">
              <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Vue claire</p>
                <p className="text-sm text-gray-300 mt-2">Comprends rapidement ce qui bloque les ventes et ce qui doit être optimisé.</p>
              </div>
              <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Priorités utiles</p>
                <p className="text-sm text-gray-300 mt-2">Les actions sont classées pour que tu saches quoi faire en premier.</p>
              </div>
              <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Résultats mesurés</p>
                <p className="text-sm text-gray-300 mt-2">Chaque action est suivie pour voir l'impact réel sur les ventes.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Before / After */}
      <section className="py-24 px-6 bg-gray-900">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs uppercase tracking-[0.3em] text-gray-400 mb-4">Avant / Après</p>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">Passez d’un Shopify dispersé à un cockpit maîtrisé</h2>
            <p className="text-lg text-gray-400 max-w-3xl mx-auto">Une gouvernance claire, une IA pilotable et des actions traçables à l’échelle.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-gray-800 border border-gray-700 rounded-3xl p-6">
              <h3 className="text-white text-xl font-semibold mb-4">Sans ShopBrain</h3>
              <ul className="space-y-3 text-sm text-gray-300">
                <li>Décisions éparpillées, peu de visibilité sur l’impact.</li>
                <li>Optimisations ponctuelles et non suivies.</li>
                <li>Gestion manuelle des contenus et prix.</li>
                <li>Peu de priorisation et pas de traçabilité.</li>
              </ul>
            </div>
            <div className="bg-gray-800 border border-gray-700 rounded-3xl p-6">
              <h3 className="text-white text-xl font-semibold mb-4">Avec ShopBrain</h3>
              <ul className="space-y-3 text-sm text-gray-300">
                <li>Vision unifiée : IA, KPI, risques, exécutions.</li>
                <li>Optimisations programmées et mesurées.</li>
                <li>Automations avancées multi‑produits.</li>
                <li>Priorités claires et impact immédiat.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-24 px-6 bg-gray-900">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs uppercase tracking-[0.3em] text-gray-400 mb-4">Bénéfices</p>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">Des bénéfices concrets et visibles</h2>
            <p className="text-lg text-gray-400 max-w-3xl mx-auto">Moins de flou, plus d’actions claires et de ventes mesurables.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { title: 'Gagne du temps', desc: 'L’IA prépare les actions, tu n’as plus à tout analyser manuellement.' },
              { title: 'Décisions claires', desc: 'Chaque recommandation est expliquée pour savoir quoi faire.' },
              { title: 'Ventes suivies', desc: 'Tu vois l’impact réel après chaque optimisation appliquée.' },
              { title: 'Shopify connecté', desc: 'Les données viennent directement de ta boutique.' }
            ].map((b, idx) => (
              <div key={idx} className="bg-gray-900 border border-yellow-500/40 rounded-3xl p-6">
                <h3 className="text-yellow-300 text-lg font-semibold mb-2">{b.title}</h3>
                <p className="text-gray-300 text-sm leading-relaxed">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="py-12 px-6 bg-gray-900 border-y border-gray-700">
        <div className="max-w-6xl mx-auto">
          <p className="text-center text-xs text-gray-400 mb-6 uppercase tracking-[0.3em]">Ils nous font confiance</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 place-items-center">
            {[
              {
                name: 'Stripe',
                href: 'https://ca.trustpilot.com/review/stripe.com',
                imgSrc: 'https://worldvectorlogo.com/download/stripe-4.svg',
                style: 'text-gray-200 border-gray-700',
                fontFamily: '"Space Grotesk", sans-serif',
                letterSpacing: '0.1em'
              },
              {
                name: 'OpenAI',
                href: 'https://en.wikipedia.org/wiki/Products_and_applications_of_OpenAI',
                imgSrc: 'https://cdn.worldvectorlogo.com/logos/openai.svg',
                style: 'text-gray-200 border-gray-700',
                fontFamily: '"Inter", sans-serif',
                letterSpacing: '0.06em'
              },
              {
                name: 'Supabase',
                href: 'https://www.youtube.com/c/supabase',
                imgSrc: 'https://frontend-assets.supabase.com/www/adf7d06de8ab/_next/static/media/logo-preview.50e72501.jpg',
                style: 'text-gray-200 border-gray-700',
                fontFamily: '"Inter", sans-serif',
                letterSpacing: '0.08em'
              },
              {
                name: 'Shopify',
                imgSrc: 'https://cdn.worldvectorlogo.com/logos/shopify.svg',
                style: 'text-gray-200 border-gray-700',
                fontFamily: '"Inter", sans-serif',
                letterSpacing: '0.08em'
              }
            ].map((brand) => {
              const Wrapper = brand.href ? 'a' : 'div'
              return (
                <Wrapper
                  key={brand.name}
                  href={brand.href}
                  target={brand.href ? '_blank' : undefined}
                  rel={brand.href ? 'noreferrer' : undefined}
                  className="flex flex-col items-center gap-2"
                >
                  <div
                    style={{ fontFamily: brand.fontFamily, letterSpacing: brand.letterSpacing }}
                    className={`px-6 py-3 rounded-full border bg-gray-900 ${brand.style} text-sm font-semibold uppercase`}
                  >
                    {brand.imgSrc ? (
                      <img
                        src={brand.imgSrc}
                        alt={brand.name}
                        className="h-5 w-auto opacity-60 grayscale"
                      />
                    ) : (
                      brand.name
                    )}
                  </div>
                  <span
                    style={{ fontFamily: brand.fontFamily, letterSpacing: brand.letterSpacing }}
                    className="text-xs uppercase text-gray-400"
                  >
                    {brand.name}
                  </span>
                </Wrapper>
              )
            })}
          </div>
        </div>
      </section>

      {/* Features Section - Apple Style amélioré */}
      <section id="features" className="py-24 px-6 bg-gray-900">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-5xl md:text-6xl font-bold text-white mb-4">
              Fonctionnalités<br />surpuissantes.
            </h2>
            <p className="text-xl text-gray-400">
              Tout ce dont vous avez besoin pour dominer votre marché.
            </p>
          </div>

          {/* Feature Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[
              {
                icon: 'AI',
                gradient: 'from-yellow-400 to-orange-500',
                title: 'Analyse IA en temps réel',
                desc: 'Scannez des milliers de produits en secondes. Notre IA analyse titres, descriptions, prix et images pour détecter les opportunités d\'optimisation.',
                stat: '10M+ produits analysés'
              },
              {
                icon: 'AUTO',
                gradient: 'from-yellow-600 to-yellow-500',
                title: 'Optimisation automatique',
                desc: 'L\'IA génère automatiquement des titres SEO-optimisés, des descriptions persuasives et des tags pertinents. Augmentez vos conversions sans lever le petit doigt.',
                stat: '+127% conversions moyenne'
              },
              {
                icon: 'DATA',
                gradient: 'from-green-400 to-emerald-500',
                title: 'Analytics & Insights',
                desc: 'Tableaux de bord en temps réel : ventes, profits, best-sellers, produits sous-performants. Prenez des décisions data-driven.',
                stat: 'Mises à jour toutes les 5min'
              },
              {
                icon: 'SHOP',
                gradient: 'from-blue-700 to-blue-600',
                title: 'Intégration Shopify native',
                desc: 'Connectez votre boutique en un clic. Synchronisation automatique bidirectionnelle : produits, commandes, clients, inventaire.',
                stat: 'Sync en <1 seconde'
              }
            ].map((feature, idx) => (
              <div key={idx} className="group relative p-8 bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 rounded-3xl hover:shadow-2xl hover:scale-[1.02] transition-all duration-300 overflow-hidden">
                <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${feature.gradient} opacity-10 rounded-full blur-3xl group-hover:opacity-20 transition-opacity`}></div>
                <div className="relative">
                  <div className={`inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br ${feature.gradient} rounded-2xl text-xs uppercase tracking-[0.2em] text-white mb-6 shadow-lg`}>
                    {feature.icon}
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-3">{feature.title}</h3>
                  <p className="text-gray-400 leading-relaxed mb-4">{feature.desc}</p>
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-gray-800 rounded-full text-sm font-semibold text-gray-300">
                    <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                    {feature.stat}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-24 px-6 bg-gray-900">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-white text-center mb-16">Fonctionnement</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                number: '1',
                icon: 'CONNECT',
                title: 'Connectez Shopify',
                desc: 'Liez votre magasin en toute sécurité'
              },
              {
                number: '2',
                icon: 'SELECT',
                title: 'Sélectionnez produits',
                desc: 'Choisissez les articles à analyser'
              },
              {
                number: '3',
                icon: 'INSIGHT',
                title: 'Recevez insights',
                desc: 'Obtenez des recommandations personnalisées'
              }
            ].map((step, idx) => (
              <div key={idx} className="text-center">
                <div className="w-16 h-16 bg-yellow-600 text-black rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-6 shadow-lg">
                  {step.number}
                </div>
                <div className="w-12 h-12 mx-auto bg-gray-800 rounded-xl flex items-center justify-center mb-4 text-[10px] uppercase tracking-[0.2em] text-gray-300">
                  {step.icon}
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{step.title}</h3>
                <p className="text-sm text-gray-400">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section - Apple Style Premium */}
      <section id="pricing" className="py-32 px-6 bg-gray-900 relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern opacity-5"></div>
        <div className="max-w-7xl mx-auto relative">
          <div className="text-center mb-20">
            <h2 className="text-5xl md:text-6xl font-bold text-white mb-6">
              Choisissez votre<br />
              <span className="text-yellow-400">
                formule gagnante
              </span>
            </h2>
            <p className="text-xl text-gray-300 mb-2">
              Tous les plans incluent 14 jours d'essai gratuit. Sans engagement.
            </p>
            <p className="text-sm text-yellow-400 font-semibold">Le plan Pro offre le meilleur rapport qualité-prix</p>
            {renderLandingStatus('pricing')}
          </div>

          <div className="flex justify-center mb-12">
            <button
              onClick={() => window.location.hash = '#stripe-pricing'}
              className="px-10 py-4 bg-yellow-600 text-black text-base font-semibold rounded-full hover:bg-yellow-500 transition-all"
            >
              Choisissez votre abonnement
            </button>
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
                  <div className="absolute -inset-1 bg-yellow-600/20 rounded-3xl blur-xl opacity-60 group-hover:opacity-80 transition-opacity"></div>
                )}
                <div
                  className={`relative p-8 bg-gray-800 rounded-3xl transition-all duration-300 hover:shadow-2xl ${
                    plan.highlight 
                      ? 'border-2 border-yellow-400 shadow-xl' 
                      : 'border border-gray-700 hover:border-yellow-400'
                  }`}
                >
                  {plan.highlight && (
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2">
                      <div className="inline-flex items-center gap-2 bg-yellow-600 text-white px-4 py-2 rounded-full shadow-lg font-bold text-sm">
                        <span>LE PLUS POPULAIRE</span>
                      </div>
                      <div className="absolute inset-0 bg-yellow-600 rounded-full blur-lg opacity-30 -z-10"></div>
                    </div>
                  )}
                  
                  <div className="text-center mb-6">
                    <h3 className="text-2xl font-bold text-white mb-2">{plan.name}</h3>
                    <div className="mb-4">
                      <span className="text-5xl font-bold text-white">{plan.price}</span>
                      <span className="text-gray-300 text-lg">/mois</span>
                    </div>
                    <p className="text-sm text-gray-400">Facturé mensuellement</p>
                  </div>

                  <ul className="space-y-4 mb-8">
                    {plan.features.map((feature, fidx) => (
                      <li key={fidx} className="flex items-start gap-3">
                        <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${
                          plan.highlight ? 'bg-yellow-600/20 text-yellow-400' : 'bg-gray-700 text-gray-300'
                        }`}>
                          •
                        </span>
                        <span className="text-sm text-gray-200 leading-relaxed">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA removed; selection via Stripe Pricing Table */}
                  <div className="w-full py-4 rounded-2xl text-base font-semibold text-center border border-gray-700 bg-gray-900 text-gray-300">
                    Voir tous les plans
                  </div>
                  
                  <p className="text-center text-xs text-gray-400 mt-4">
                    Annulation en un clic
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-16 text-center">
            <p className="text-gray-300 mb-4">Besoin d'un plan sur mesure ?</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={() => window.location.hash = '#stripe-pricing'}
                className="px-8 py-3 bg-yellow-700 text-white font-semibold border-2 border-yellow-700 rounded-full hover:bg-yellow-600 transition-all"
              >
                Voir tous les plans
              </button>
              <a
                href="mailto:louis-felix.gilbert@outlook.com"
                className="px-8 py-3 text-yellow-400 font-semibold border-2 border-yellow-700 rounded-full hover:bg-yellow-700 hover:text-white transition-all"
              >
                Contactez notre équipe
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-6 bg-gray-900">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Prêt à transformer votre Shopify?
          </h2>
          <p className="text-lg text-gray-400 mb-10">
            Rejoignez des centaines de sellers qui utilisent ShopBrain AI
          </p>
          <button
            onClick={() => window.location.hash = '#stripe-pricing'}
            className="px-8 py-4 bg-yellow-600 text-black text-base font-medium rounded-full hover:bg-yellow-500 transition-all hover:scale-105 shadow-lg hover:shadow-xl"
          >
            Voir tous les plans
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-700 py-12 px-6 bg-gray-900">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            <div>
              <h4 className="text-xs font-semibold text-gray-300 mb-4 tracking-wide">PRODUIT</h4>
              <ul className="space-y-3 text-sm text-gray-400">
                <li><a href="#features" className="hover:text-white transition-colors">Fonctionnalités</a></li>
                <li><a href="#pricing" className="hover:text-white transition-colors">Tarifs</a></li>
                <li><a href="#how-it-works" className="hover:text-white transition-colors">Fonctionnement</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-gray-300 mb-4 tracking-wide">ENTREPRISE</h4>
              <ul className="space-y-3 text-sm text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">À propos</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Contact</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-gray-300 mb-4 tracking-wide">LÉGAL</h4>
              <ul className="space-y-3 text-sm text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">Politique de confidentialité</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Conditions d'utilisation</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-700 pt-8">
            <p className="text-center text-sm text-gray-500">© 2025 ShopBrain AI. Tous droits réservés.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
