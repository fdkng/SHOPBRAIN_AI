import React, { useState, useEffect, lazy, Suspense } from 'react'
import { useTranslation } from './LanguageContext'
import ErrorBoundary from './ErrorBoundary'
import { createClient } from '@supabase/supabase-js'

// ⚡ Lazy load heavy components — Dashboard and PricingTable are only loaded when needed
const Dashboard = lazy(() => import('./Dashboard'))
const StripePricingTable = lazy(() => import('./PricingTable'))

// ⚡ Loading fallback for lazy components
const LazyFallback = () => {
  const { t } = useTranslation()
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-[#FF6B35] border-t-transparent rounded-full animate-spin" />
        <p className="text-[#8A8AA3] text-sm">{t('loading')}</p>
      </div>
    </div>
  )
}

const supabase = createClient(
  'https://jgmsfadayzbgykzajvmw.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnbXNmYWRheXpiZ3lremFqdm13Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQwODk0NTksImV4cCI6MjA3OTY2NTQ1OX0.sg0O2QGdoKO5Zb6vcRJr5pSu2zlaxU3r7nHtyXb07hg'
)

// Stripe Payment Links are created dynamically via backend API
// No static links needed - backend generates them on demand


export default function App() {
  const { t } = useTranslation()

  const PRICING_PLANS = [
    {
      name: 'Standard',
      price: '$99',
      popular: false,
      features: [
        t('pf_standard_1'),
        t('pf_standard_2'),
        t('pf_standard_3'),
        t('pf_standard_4'),
        t('pf_standard_5'),
        t('pf_standard_6')
      ],
      cta: t('pf_standard_cta'),
      plan_id: 'standard',
      highlight: false
    },
    {
      name: 'Pro',
      price: '$199',
      popular: true,
      features: [
        t('pf_pro_1'),
        t('pf_pro_2'),
        t('pf_pro_3'),
        t('pf_pro_4'),
        t('pf_pro_5'),
        t('pf_pro_6'),
        t('pf_pro_7'),
        t('pf_pro_8')
      ],
      cta: t('pf_pro_cta'),
      plan_id: 'pro',
      highlight: true
    },
    {
      name: 'Premium',
      price: '$299',
      popular: false,
      features: [
        t('pf_premium_1'),
        t('pf_premium_2'),
        t('pf_premium_3'),
        t('pf_premium_4'),
        t('pf_premium_5'),
        t('pf_premium_6'),
        t('pf_premium_7'),
        t('pf_premium_8'),
        t('pf_premium_9')
      ],
      cta: t('pf_premium_cta'),
      plan_id: 'premium',
      highlight: false
    }
  ]

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

  // ⚡ Prefetch Dashboard chunk in background after landing page loads
  useEffect(() => {
    const timer = setTimeout(() => {
      import('./Dashboard') // Triggers chunk download in background
    }, 2000) // Start after 2s to not compete with critical resources
    return () => clearTimeout(timer)
  }, [])
  const [paymentSuccess, setPaymentSuccess] = useState(false)
  const [paymentProcessingState, setPaymentProcessingState] = useState('idle') // 'idle' | 'verifying' | 'verified' | 'failed'
  const [paymentProcessingMessage, setPaymentProcessingMessage] = useState('')
  const [landingStatusByKey, setLandingStatusByKey] = useState({})
  const [faqOpenIndex, setFaqOpenIndex] = useState(null)
  
  // Prevent simultaneous subscription checks
  const subscriptionCheckInProgressRef = React.useRef(false)

  // ── One-time setup: scroll, auth listener, payment success ──
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', handleScroll)

    // Check for payment success in query string
    const urlParams = new URLSearchParams(window.location.search)
    const isPaymentSuccess = urlParams.get('payment') === 'success' || urlParams.has('session_id') || urlParams.get('checkout') === 'success'

    if (isPaymentSuccess) {
      try {
        localStorage.removeItem('subscriptionCache')
        localStorage.removeItem('profileCache')
      } catch {}

      setPaymentSuccess(true)

      const sessionId = urlParams.get('session_id')
      if (sessionId) {
        ;(async () => {
          try {
            const { data: { session } } = await supabase.auth.getSession()
            if (session && session.access_token) {
              setPaymentProcessingState('verifying')
              setPaymentProcessingMessage(t('paymentVerifying'))

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
                  setPaymentProcessingMessage(t('paymentConfirmedSubscriptionActive'))
                  setCurrentView('dashboard')
                  window.location.hash = '#dashboard'
                  return
                } else {
                  setPaymentProcessingState('failed')
                  setPaymentProcessingMessage(data?.message || t('verificationFailed'))
                }
              } else {
                console.warn('verify-session failed:', resp.status, resp.statusText)
                setPaymentProcessingState('failed')
                setPaymentProcessingMessage(`${t('error')} serveur: ${resp.status}`)
              }
            }
          } catch (e) {
            console.error('Error calling verify-session:', e)
            setPaymentProcessingState('failed')
            setPaymentProcessingMessage(e.message || t('verificationError'))
          }
        })()
      }

      // Poll subscription status for up to 60 seconds
      let pollCount = 0
      const pollInterval = setInterval(() => {
        checkSubscription()
        pollCount++
        if (pollCount >= 30) clearInterval(pollInterval)
      }, 2000)

      return () => {
        window.removeEventListener('scroll', handleScroll)
        clearInterval(pollInterval)
      }
    }

    // Hash-based routing (only on explicit hash change by user)
    const handleHashChange = () => {
      if (window.location.hash.includes('success=true')) {
        setCurrentView('dashboard')
        return
      }
      if (window.location.hash === '#stripe-pricing') {
        setCurrentView('stripe-pricing')
      }
      // Note: dashboard routing is handled by the auto-route effect below
    }
    window.addEventListener('hashchange', handleHashChange)

    // Initial load: check user + subscription
    checkUser()
    checkSubscription()

    // Listen for auth changes
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        setUser(session.user)
        checkSubscription()
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
  }, []) // ← empty deps: runs once on mount only

  // ── NO auto-route to dashboard — user must click "Access Dashboard" button ──
  // The dashboard is only shown when the user explicitly navigates via the button/hash

  const checkUser = async () => {
    // Force sign out on fresh page load so user must login each time
    const isFirstLoad = !sessionStorage.getItem('sb_session_active')
    if (isFirstLoad) {
      await supabase.auth.signOut()
      sessionStorage.setItem('sb_session_active', '1')
      setUser(null)
      return
    }
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      setUser(session.user)
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
      console.warn('Subscription check timeout (120s), releasing lock')
      subscriptionCheckInProgressRef.current = false
    }, 120000)
    
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session || !session.user) {
        setHasSubscription(false)
        setLandingStatusByKey((prev) => ({
          ...prev,
          dashboardHero: { type: 'warning', message: 'No active plan found. Please purchase a plan to access your dashboard.' }
        }))
        return
      }
      const resp = await fetch('https://shopbrain-backend.onrender.com/api/subscription/status', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ user_id: session.user.id }),
        signal: AbortSignal.timeout(120000) // 120s timeout — Render cold start can take up to 2min
      })
      if (!resp.ok) {
        console.error('Subscription check failed:', resp.status, resp.statusText)
        // Payment status unclear => NO ACCESS (secure default)
        setHasSubscription(false)
        setLandingStatusByKey((prev) => ({
          ...prev,
          dashboardHero: { type: 'warning', message: 'No active plan found. Please purchase a plan to access your dashboard.' }
        }))
        return
      }
      const data = await resp.json()
      console.log('Subscription check response:', data)
      const hasSub = Boolean(data?.success && data?.has_subscription)
      setHasSubscription(hasSub)
      if (hasSub) {
        setLandingStatusByKey((prev) => {
          if (!prev?.dashboardHero) return prev
          const next = { ...prev }
          delete next.dashboardHero
          return next
        })
      } else {
        setLandingStatusByKey((prev) => ({
          ...prev,
          dashboardHero: {
            type: 'warning',
            message: data?.message || 'No active plan found. Please purchase a plan to access your dashboard.'
          }
        }))
      }
    } catch (e) {
      // Payment status unclear => NO ACCESS (secure default)
      console.error('Subscription check error:', e)
      setHasSubscription(false)
      setLandingStatusByKey((prev) => ({
        ...prev,
        dashboardHero: { type: 'warning', message: 'No active plan found. Please purchase a plan to access your dashboard.' }
      }))
    } finally {
      clearTimeout(timeoutId)
      subscriptionCheckInProgressRef.current = false
    }
  }

  useEffect(() => {
    if (currentView === 'stripe-pricing' && !user) {
      setLandingStatusByKey((prev) => ({
        ...prev,
        pricing: { type: 'warning', message: t('mustCreateAccountFirst') }
      }))
      setAuthMode('signup')
      setShowAuthModal(true)
      setCurrentView('landing')
      if (typeof window !== 'undefined' && window.location.hash === '#stripe-pricing') {
        window.location.hash = '#pricing'
      }
    }
  }, [currentView, user, t])

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
      setAuthMessage(t('passwordMinLength'))
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
          setAuthMessage(t('emailAlreadyUsed'))
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
        setAuthMessage(t('accountCreatedVerifyEmail'))
        setAuthMode('login')
      }
      
    } catch (error) {
      setAuthMessage(t('genericError'))
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
          setAuthMessage(t('invalidCredentials'))
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
      setAuthMessage(t('genericError'))
      console.error(error)
    }
  }

  const handleGoogleSignIn = async () => {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: getRedirectUrl(),
          queryParams: {
            prompt: 'select_account'
          }
        }
      })
      
      if (error) {
        setAuthMessage(t('googleSignInError') + error.message)
      }
    } catch (error) {
      setAuthMessage(t('googleGenericError'))
      console.error(error)
    }
  }

  const handleStripeCheckout = async (planId) => {
    // Check if user is logged in
    if (!user) {
      setLandingStatusByKey((prev) => ({
        ...prev,
        pricing: { type: 'warning', message: t('mustCreateAccountFirst') }
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
          pricing: { type: 'error', message: t('sessionNotFound') }
        }))
        return
      }

      if (!session.access_token) {
        setLandingStatusByKey((prev) => ({
          ...prev,
          pricing: { type: 'error', message: t('accessTokenMissing') }
        }))
        console.error('Missing access_token in session:', session)
        return
      }

      // Plan IDs are already 'standard', 'pro', 'premium' — send as-is
      const planKey = planId

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
          pricing: { type: 'error', message: `${t('error')}: ${errorData.detail || response.statusText || t('unableToCreateCheckoutSession')}` }
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
          pricing: { type: 'error', message: t('checkoutUrlMissing') }
        }))
        console.error('Checkout response:', data)
      }
    } catch (error) {
      setLandingStatusByKey((prev) => ({
        ...prev,
        pricing: { type: 'error', message: `${t('connectionError')}: ${error.message}` }
      }))
      console.error('Stripe checkout error:', error)
    }
  }

  const openStripePricing = () => {
    setCurrentView('stripe-pricing')
    if (typeof window !== 'undefined' && window.location.hash !== '#stripe-pricing') {
      window.location.hash = '#stripe-pricing'
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
          ? 'bg-red-50 border-red-200 text-red-700'
          : 'bg-gray-50 border-gray-200 text-gray-700'

    return (
      <div className={`mt-4 p-4 rounded-xl border text-sm ${styles}`}>
        {status.message}
      </div>
    )
  }

  // If user is logged in and on dashboard view, show Dashboard component
  if (currentView === 'dashboard' && user) {
    return <ErrorBoundary><Suspense fallback={<LazyFallback />}><Dashboard /></Suspense></ErrorBoundary>
  }

  // If viewing Stripe Pricing Table
  if (currentView === 'stripe-pricing' && user) {
    return <Suspense fallback={<LazyFallback />}><StripePricingTable userEmail={user?.email} userId={user?.id} /></Suspense>
  }

  // Otherwise show landing page
  return (
    <div className="min-h-screen bg-white">

      {/* ═══════════════════ NAVIGATION ═══════════════════ */}
      <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-white/90 backdrop-blur-md shadow-[var(--shadow-sm)] border-b border-[#E8E8EE]'
          : 'bg-white border-b border-[#E8E8EE]'
      }`}>
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="flex items-center justify-between h-16 md:h-[72px]">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <span className="text-lg md:text-xl font-semibold text-[#1A1A2E] tracking-tight">ShopBrain AI</span>
            </div>

            {/* Center nav links */}
            <div className="hidden md:flex items-center gap-10">
              <a href="#features" className="text-sm font-medium text-[#4A4A68] hover:text-[#1A1A2E] transition-colors">
                {t("navFeatures")}
              </a>
              <a href="#how-it-works" className="text-sm font-medium text-[#4A4A68] hover:text-[#1A1A2E] transition-colors">
                {t("navHowItWorks")}
              </a>
              <a href="#pricing" className="text-sm font-medium text-[#4A4A68] hover:text-[#1A1A2E] transition-colors">
                {t("navPricing")}
              </a>
            </div>

            {/* Auth buttons */}
            {user ? (
              <div className="flex items-center gap-2 md:gap-3">
                <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-700 rounded-full text-sm border border-green-200">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  <span className="font-medium">{user.user_metadata?.first_name || t('connected')}</span>
                </div>
                <button
                  onClick={() => {
                    if (hasSubscription) {
                      setCurrentView('dashboard')
                    } else {
                      setLandingStatusByKey((prev) => ({
                        ...prev,
                        dashboardHero: { type: 'warning', message: t('subscriptionRequired') }
                      }))
                      window.location.hash = '#pricing'
                    }
                  }}
                  className={`px-4 md:px-5 py-2 rounded-full text-xs md:text-sm font-medium transition-all ${
                    hasSubscription
                      ? 'bg-[#1A1A2E] text-white hover:bg-[#2A2A42] shadow-sm'
                      : 'bg-[#EFF1F5] text-[#8A8AA3] cursor-not-allowed'
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
                  className="px-3 md:px-4 py-2 text-[#8A8AA3] hover:text-[#1A1A2E] text-xs md:text-sm font-medium transition-colors"
                >
                  {t("logout")}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setAuthMode('login'); setShowAuthModal(true) }}
                  className="hidden sm:inline-flex px-5 py-2 text-sm font-medium text-[#1A1A2E] border border-[#E8E8EE] rounded-full hover:bg-[#F7F8FA] transition-all"
                >
                  {t("login")}
                </button>
                <button
                  onClick={() => { setAuthMode('signup'); setShowAuthModal(true) }}
                  className="px-5 py-2 bg-[#1A1A2E] text-white text-sm font-medium rounded-full hover:bg-[#2A2A42] transition-all hover:shadow-md"
                >
                  {t("signupTab")} →
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* ═══════════════════ PAYMENT SUCCESS BANNER ═══════════════════ */}
      {paymentSuccess && (
        <div className="mt-20 mx-auto max-w-7xl px-6 mb-6">
          <div className={`rounded-2xl p-6 flex items-center justify-between ${
            paymentProcessingState === 'verified'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : paymentProcessingState === 'failed'
                ? 'bg-yellow-50 border border-yellow-200 text-yellow-800'
                : 'bg-[#FFF4F0] border border-[#FF6B35]/20 text-[#1A1A2E]'
          }`}>
            <div className="flex items-center gap-4">
              <span className="text-3xl">
                {paymentProcessingState === 'verified' ? '✓' : paymentProcessingState === 'failed' ? '!' : '⟳'}
              </span>
              <div>
                <div className="font-semibold text-lg">
                  {paymentProcessingState === 'verified' ? t('paymentConfirmed') : paymentProcessingState === 'failed' ? t('processingFailed') : t('processingPayment')}
                </div>
                <div className="text-sm opacity-80">
                  {paymentProcessingMessage || (paymentProcessingState === 'verified' ? t('subscriptionActiveAccessDashboard') : paymentProcessingState === 'failed' ? t('processingFailedRetryOrContact') : t('verificationInProgress'))}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setCurrentView('dashboard')}
                disabled={!hasSubscription}
                className={`px-6 py-2.5 rounded-full text-sm font-semibold whitespace-nowrap transition-all ${
                  hasSubscription
                    ? 'bg-[#1A1A2E] text-white hover:bg-[#2A2A42] shadow-sm'
                    : 'bg-[#EFF1F5] text-[#8A8AA3] cursor-not-allowed'
                }`}
              >
                {t("accessDashboard")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════ AUTH MODAL ═══════════════════ */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-3 md:p-6 animate-fadeIn" onClick={() => setShowAuthModal(false)}>
          <div className="bg-white rounded-2xl md:rounded-3xl max-w-md w-full p-6 md:p-8 shadow-[var(--shadow-xl)] animate-scaleIn max-h-[90vh] overflow-y-auto border border-[#E8E8EE]" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-serif text-2xl md:text-3xl text-[#1A1A2E]">
                {authMode === 'signup' ? t('createAccount') : t('login')}
              </h3>
              <button onClick={() => setShowAuthModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full text-[#8A8AA3] hover:text-[#1A1A2E] hover:bg-[#F7F8FA] transition-all text-xl">×</button>
            </div>

            {/* Toggle signup / login */}
            <div className="flex gap-1 mb-6 bg-[#F7F8FA] p-1 rounded-xl">
              <button
                onClick={() => setAuthMode('signup')}
                className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                  authMode === 'signup' ? 'bg-white text-[#1A1A2E] shadow-sm' : 'text-[#8A8AA3] hover:text-[#4A4A68]'
                }`}
              >
                {t("signupTab")}
              </button>
              <button
                onClick={() => setAuthMode('login')}
                className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                  authMode === 'login' ? 'bg-white text-[#1A1A2E] shadow-sm' : 'text-[#8A8AA3] hover:text-[#4A4A68]'
                }`}
              >
                {t("loginTab")}
              </button>
            </div>

            {/* Signup Form */}
            {authMode === 'signup' && (
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#4A4A68] mb-2">{t('firstNameLabel')}</label>
                    <input
                      type="text"
                      value={formData.firstName}
                      onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                      placeholder={t("firstNamePlaceholder")}
                      required
                      className="w-full px-4 py-3 border border-[#E8E8EE] rounded-xl text-sm text-[#1A1A2E] placeholder-[#8A8AA3] focus:border-[#FF6B35] focus:ring-2 focus:ring-[#FF6B35]/10 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#4A4A68] mb-2">{t('lastNameLabel')}</label>
                    <input
                      type="text"
                      value={formData.lastName}
                      onChange={(e) => setFormData({...formData, lastName: e.target.value})}
                      placeholder={t("lastNamePlaceholder")}
                      required
                      className="w-full px-4 py-3 border border-[#E8E8EE] rounded-xl text-sm text-[#1A1A2E] placeholder-[#8A8AA3] focus:border-[#FF6B35] focus:ring-2 focus:ring-[#FF6B35]/10 outline-none transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#4A4A68] mb-2">{t('usernameLabel')}</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({...formData, username: e.target.value})}
                    placeholder={t("usernamePlaceholder")}
                    required
                    className="w-full px-4 py-3 border border-[#E8E8EE] rounded-xl text-sm text-[#1A1A2E] placeholder-[#8A8AA3] focus:border-[#FF6B35] focus:ring-2 focus:ring-[#FF6B35]/10 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#4A4A68] mb-2">{t('emailLabel')}</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    placeholder={t("emailPlaceholder")}
                    required
                    className="w-full px-4 py-3 border border-[#E8E8EE] rounded-xl text-sm text-[#1A1A2E] placeholder-[#8A8AA3] focus:border-[#FF6B35] focus:ring-2 focus:ring-[#FF6B35]/10 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#4A4A68] mb-2">{t('passwordLabel')}</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    className="w-full px-4 py-3 border border-[#E8E8EE] rounded-xl text-sm text-[#1A1A2E] placeholder-[#8A8AA3] focus:border-[#FF6B35] focus:ring-2 focus:ring-[#FF6B35]/10 outline-none transition-all"
                  />
                  <p className="text-xs text-[#8A8AA3] mt-1.5">{t('passwordHint')}</p>
                </div>
                <button
                  type="submit"
                  className="w-full px-6 py-3 bg-[#FF6B35] text-white font-semibold rounded-full hover:bg-[#E85A28] transition-all text-sm shadow-sm hover:shadow-md"
                >
                  {t("createMyAccount")}
                </button>
                <p className="text-xs text-[#8A8AA3] text-center">
                  {t('confirmationEmailNotice')}
                </p>
              </form>
            )}

            {/* Login Form */}
            {authMode === 'login' && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#4A4A68] mb-2">{t("emailLabel")}</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    placeholder={t("emailPlaceholder")}
                    required
                    className="w-full px-4 py-3 border border-[#E8E8EE] rounded-xl text-sm text-[#1A1A2E] placeholder-[#8A8AA3] focus:border-[#FF6B35] focus:ring-2 focus:ring-[#FF6B35]/10 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#4A4A68] mb-2">{t("passwordLabel")}</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                    placeholder="••••••••"
                    required
                    className="w-full px-4 py-3 border border-[#E8E8EE] rounded-xl text-sm text-[#1A1A2E] placeholder-[#8A8AA3] focus:border-[#FF6B35] focus:ring-2 focus:ring-[#FF6B35]/10 outline-none transition-all"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full px-6 py-3 bg-[#FF6B35] text-white font-semibold rounded-full hover:bg-[#E85A28] transition-all text-sm shadow-sm hover:shadow-md"
                >
                  {t("login")}
                </button>
              </form>
            )}

            {/* OR separator */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#E8E8EE]"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-3 bg-white text-[#8A8AA3]">{t("or")}</span>
              </div>
            </div>

            {/* Google Sign-In */}
            <button
              onClick={handleGoogleSignIn}
              type="button"
              className="w-full px-6 py-3 bg-white border border-[#E8E8EE] text-[#1A1A2E] font-medium rounded-full hover:bg-[#F7F8FA] hover:border-[#8A8AA3] transition-all text-sm flex items-center justify-center gap-3"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              {t("continueWithGoogle")}
            </button>

            {authMessage && (
              <div className={`mt-4 p-3 rounded-xl text-xs ${
                authMessage.toLowerCase().startsWith('succès') || authMessage.toLowerCase().startsWith('compte créé')
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-yellow-50 text-yellow-800 border border-yellow-200'
              }`}>
                {authMessage}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════ HERO SECTION ═══════════════════ */}
      <section className="pt-28 md:pt-36 pb-16 md:pb-28 px-4 md:px-6 bg-white relative overflow-hidden">
        {/* Subtle teal-orange gradient bg */}
        <div className="absolute inset-0 gradient-bg opacity-40 pointer-events-none" />
        <div className="max-w-6xl mx-auto relative">
          <div className="text-center animate-fadeInUp">
            <div className="inline-block mb-6 md:mb-8">
              <span className="section-label px-4 py-2 bg-[#CCFBF1] text-[#0D9488] border border-[#0D9488]/10 rounded-full text-xs font-semibold uppercase tracking-[0.15em]">{t("heroBadge")}</span>
            </div>
            <h1 className="font-serif text-4xl md:text-7xl lg:text-8xl text-[#1A1A2E] tracking-tight leading-[1.05] mb-5 md:mb-6">
              {t('heroTitle').split(' ').slice(0, -1).join(' ')}{' '}
              <span className="gradient-text">{t('heroTitle').split(' ').slice(-1)}</span>
            </h1>
            <p className="text-base md:text-xl text-[#4A4A68] mb-10 md:mb-14 max-w-3xl mx-auto leading-relaxed font-light">
              {t('heroSubtitle')}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 md:gap-4 mb-8">
              <button
                onClick={openStripePricing}
                className="w-full sm:w-auto px-8 md:px-10 py-4 bg-[#1A1A2E] text-white text-sm md:text-base font-medium rounded-full hover:bg-[#2A2A42] transition-all hover:shadow-lg group"
              >
                {t("viewAllPlans")} <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
              </button>
              <button
                onClick={() => setShowAuthModal(true)}
                className="w-full sm:w-auto px-8 md:px-10 py-4 text-[#1A1A2E] text-sm md:text-base font-medium border border-[#E8E8EE] rounded-full hover:bg-[#F7F8FA] transition-all"
              >
                {t("login")}
              </button>
            </div>
            <p className="text-xs md:text-sm text-[#8A8AA3]">
              {t('heroDisclaimer')}
            </p>
          </div>

          {/* Kinso-style floating notification cards — animated */}
          <div className="hidden lg:block relative mt-16 h-[320px]">
            {/* Card 1 — AI Analysis (floats gently) */}
            <div className="absolute left-[5%] top-4 animate-popIn stagger-1" style={{animation: 'popIn 0.6s cubic-bezier(0.34,1.56,0.64,1) forwards, floatSlow 6s ease-in-out 1s infinite'}}>
              <div className="bg-white border border-[#E8E8EE] rounded-2xl p-5 shadow-[var(--shadow-lg)] w-72 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-default">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#2DD4BF] to-[#0D9488] flex items-center justify-center text-white text-lg animate-pulse-soft">🤖</div>
                  <div>
                    <p className="text-sm font-semibold text-[#1A1A2E]">ShopBrain AI</p>
                    <p className="text-[11px] text-[#8A8AA3]">à l'instant</p>
                  </div>
                  <div className="ml-auto w-2 h-2 bg-[#2DD4BF] rounded-full animate-ping-slow" />
                </div>
                <p className="text-sm text-[#4A4A68] leading-relaxed">
                  <span className="typewriter-text">Titre optimisé : « Bouteille Premium Inox 750ml — Isolée 24h »</span>
                </p>
              </div>
            </div>

            {/* Card 2 — Price opportunity (floats opposite) */}
            <div className="absolute right-[5%] top-0 animate-popIn stagger-3" style={{animation: 'popIn 0.6s cubic-bezier(0.34,1.56,0.64,1) 0.3s forwards, floatSlow 7s ease-in-out 1.5s infinite reverse'}}>
              <div className="bg-white border border-[#FF6B35]/20 rounded-2xl p-5 shadow-[var(--shadow-lg)] w-64 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-default">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[#FF6B35] text-lg">📊</span>
                  <p className="text-sm font-semibold text-[#1A1A2E]">Opportunité prix</p>
                </div>
                <p className="text-sm text-[#4A4A68]">
                  T-shirt Chic → <span className="font-bold text-[#0D9488] count-up">+18% marge</span>
                </p>
                <div className="mt-3 h-1.5 bg-[#EFF1F5] rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-[#2DD4BF] to-[#FF6B35] rounded-full progress-fill" />
                </div>
                <div className="flex justify-between mt-2">
                  <span className="text-[10px] text-[#8A8AA3]">Score confiance</span>
                  <span className="text-[10px] font-semibold text-[#0D9488]">92%</span>
                </div>
              </div>
            </div>

            {/* Card 3 — Actions recommandées (floats center) */}
            <div className="absolute left-1/2 -translate-x-1/2 bottom-0 animate-popIn stagger-5" style={{animation: 'popIn 0.6s cubic-bezier(0.34,1.56,0.64,1) 0.6s forwards, floatSlow 5s ease-in-out 2s infinite'}}>
              <div className="bg-white border border-[#E8E8EE] rounded-2xl p-5 shadow-[var(--shadow-lg)] w-80 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-default">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-[#FFF4F0] flex items-center justify-center text-lg">⚡</div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-[#1A1A2E]">Actions recommandées</p>
                    <p className="text-[11px] text-[#8A8AA3]">3 actions en attente</p>
                  </div>
                  <span className="bg-[#FF6B35] text-white text-[11px] font-bold px-2 py-0.5 rounded-full animate-bounce-soft">3</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-[#4A4A68] action-row stagger-1"><span className="w-1.5 h-1.5 bg-[#FF6B35] rounded-full animate-pulse" />Réécrire 2 descriptions</div>
                  <div className="flex items-center gap-2 text-sm text-[#4A4A68] action-row stagger-2"><span className="w-1.5 h-1.5 bg-[#2DD4BF] rounded-full animate-pulse" style={{animationDelay:'0.5s'}} />Optimiser 1 prix</div>
                  <div className="flex items-center gap-2 text-sm text-[#4A4A68] action-row stagger-3"><span className="w-1.5 h-1.5 bg-[#F59E0B] rounded-full animate-pulse" style={{animationDelay:'1s'}} />Alerte stock bas</div>
                </div>
              </div>
            </div>

            {/* Card 4 — Revenue mini-card (new, top center) */}
            <div className="absolute left-[38%] top-0 animate-popIn stagger-2" style={{animation: 'popIn 0.6s cubic-bezier(0.34,1.56,0.64,1) 0.9s forwards, floatSlow 8s ease-in-out 0.5s infinite'}}>
              <div className="bg-white border border-[#2DD4BF]/20 rounded-2xl px-4 py-3 shadow-[var(--shadow-lg)] hover:shadow-xl transition-all duration-300 cursor-default">
                <div className="flex items-center gap-2">
                  <span className="text-[#0D9488]">💰</span>
                  <span className="text-xs font-medium text-[#8A8AA3]">Revenus 30j</span>
                </div>
                <p className="text-lg font-bold text-[#1A1A2E] mt-1">12 480 <span className="text-xs font-normal text-[#8A8AA3]">CAD</span></p>
                <span className="text-[10px] font-semibold text-[#0D9488] bg-teal-50 px-1.5 py-0.5 rounded">↑ 24%</span>
              </div>
            </div>
          </div>

          {/* Dashboard Button */}
          {user && (
            <div className="mt-16 flex flex-col items-center animate-fadeInUp stagger-2">
              <button
                onClick={() => {
                  if (hasSubscription) {
                    setCurrentView('dashboard')
                    window.location.hash = '#dashboard'
                  } else {
                    setLandingStatusByKey((prev) => ({
                      ...prev,
                      dashboardHero: { type: 'warning', message: t('subscriptionRequired') }
                    }))
                    document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })
                  }
                }}
                disabled={!hasSubscription}
                className={`px-12 py-4 text-base font-semibold rounded-full transition-all ${
                  hasSubscription
                    ? 'bg-[#FF6B35] text-white hover:bg-[#E85A28] hover:shadow-lg shadow-[0_8px_24px_rgba(255,107,53,0.25)]'
                    : 'bg-[#EFF1F5] text-[#8A8AA3] cursor-not-allowed'
                }`}
              >
                Accéder à mon Dashboard
              </button>
              {renderLandingStatus('dashboardHero')}
            </div>
          )}
          {!user && (
            <div className="mt-16 text-center">
              <p className="text-[#8A8AA3] mb-6">{t('loginToAccessDashboard')}</p>
            </div>
          )}
        </div>
      </section>

      {/* ═══════════════════ DIVIDER ═══════════════════ */}
      <div className="section-divider"></div>

      {/* ═══════════════════ PRE-DASHBOARD FAQ ═══════════════════ */}
      <section className="py-20 md:py-28 px-4 md:px-6 bg-[#F7F8FA]">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-14">
            <p className="section-label mb-4">{t('beforeDashboardLabel')}</p>
            <h2 className="font-serif text-3xl md:text-5xl text-[#1A1A2E] mb-4">{t('preDashboardTitle')}</h2>
            <p className="text-base md:text-lg text-[#4A4A68] max-w-2xl mx-auto">{t('preDashboardSubtitle')}</p>
          </div>
          <div className="space-y-0">
            {[
              { question: t('faqQuestion1'), answer: t('faqAnswer1') },
              { question: t('faqQuestion2'), answer: t('faqAnswer2') },
              { question: t('faqQuestion3'), answer: t('faqAnswer3') },
              { question: t('faqQuestion4'), answer: t('faqAnswer4') }
            ].map((item, idx) => (
              <div key={idx} className="accordion-item">
                <button
                  onClick={() => setFaqOpenIndex(faqOpenIndex === idx ? null : idx)}
                  className="w-full flex items-center justify-between text-left group"
                >
                  <h3 className="text-[#1A1A2E] text-base md:text-lg font-medium pr-4">{item.question}</h3>
                  <span className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full border border-[#E8E8EE] text-[#8A8AA3] group-hover:border-[#1A1A2E] group-hover:text-[#1A1A2E] transition-all transform ${faqOpenIndex === idx ? 'rotate-45' : ''}`}>
                    +
                  </span>
                </button>
                <div className={`accordion-content ${faqOpenIndex === idx ? 'open' : ''}`}>
                  {item.answer}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════ DIVIDER ═══════════════════ */}
      <div className="section-divider"></div>

      {/* ═══════════════════ ECOSYSTEM SECTION ═══════════════════ */}
      <section className="py-20 md:py-28 px-4 md:px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14 md:mb-20">
            <p className="section-label mb-4">{t('ecosystemLabel')}</p>
            <h2 className="font-serif text-3xl md:text-5xl text-[#1A1A2E] mb-4">{t('ecosystemTitle')}</h2>
            <p className="text-base md:text-lg text-[#4A4A68] max-w-3xl mx-auto">{t('ecosystemSubtitle')}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { title: 'Studio IA', desc: t('ecosystemStudioDesc') },
              { title: 'Command Center', desc: t('ecosystemCommandDesc') },
              { title: 'Automation Hub', desc: t('ecosystemAutomationDesc') }
            ].map((card, idx) => (
              <div key={idx} className="kinso-card p-7 md:p-8 animate-popIn" style={{ animationDelay: `${idx * 0.12}s` }}>
                <div className="w-10 h-10 bg-[#CCFBF1] rounded-xl flex items-center justify-center mb-5">
                  <span className="text-[#0D9488] text-sm font-bold">{String(idx + 1).padStart(2, '0')}</span>
                </div>
                <h3 className="text-[#1A1A2E] text-xl font-semibold mb-3">{card.title}</h3>
                <p className="text-[#4A4A68] text-sm leading-relaxed">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════ COMMAND CENTER ═══════════════════ */}
      <section className="py-20 md:py-28 px-4 md:px-6 bg-[#F7F8FA]">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 md:gap-16 items-center">
          <div>
            <p className="section-label mb-4">{t('ecosystemCommandTitle')}</p>
            <h2 className="font-serif text-3xl md:text-5xl text-[#1A1A2E] mb-4">{t('commandCenterTitle')}</h2>
            <p className="text-base md:text-lg text-[#4A4A68] mb-8">{t('commandCenterSubtitle')}</p>
            <div className="space-y-3">
              <div className="flex items-center justify-between bg-white border border-[#E8E8EE] rounded-xl px-5 py-4 shadow-[var(--shadow-sm)]">
                <span className="text-[#1A1A2E] text-sm font-medium">{t('recommendedActions')}</span>
                <span className="text-[#8A8AA3] text-sm">{t('clearAndRanked')}</span>
              </div>
              <div className="flex items-center justify-between bg-white border border-[#E8E8EE] rounded-xl px-5 py-4 shadow-[var(--shadow-sm)]">
                <span className="text-[#1A1A2E] text-sm font-medium">{t('detectedProblems')}</span>
                <span className="text-[#8A8AA3] text-sm">{t('withExplanation')}</span>
              </div>
              <div className="flex items-center justify-between bg-white border border-[#E8E8EE] rounded-xl px-5 py-4 shadow-[var(--shadow-sm)]">
                <span className="text-[#1A1A2E] text-sm font-medium">{t('resultsTracking')}</span>
                <span className="text-[#8A8AA3] text-sm">{t('beforeAfterShort')}</span>
              </div>
            </div>
          </div>
          <div className="bg-white border border-[#E8E8EE] rounded-2xl p-8 shadow-[var(--shadow-md)]">
            <div className="space-y-4">
              <div className="bg-[#F7F8FA] border border-[#EFF1F5] rounded-xl p-5">
                <p className="section-label text-[10px]">{t('clearView')}</p>
                <p className="text-sm text-[#4A4A68] mt-2">{t('clearViewDesc')}</p>
              </div>
              <div className="bg-[#F7F8FA] border border-[#EFF1F5] rounded-xl p-5">
                <p className="section-label text-[10px]">{t('usefulPriorities')}</p>
                <p className="text-sm text-[#4A4A68] mt-2">{t('usefulPrioritiesDesc')}</p>
              </div>
              <div className="bg-[#F7F8FA] border border-[#EFF1F5] rounded-xl p-5">
                <p className="section-label text-[10px]">{t('measuredResults')}</p>
                <p className="text-sm text-[#4A4A68] mt-2">{t('measuredResultsDesc')}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════ BEFORE / AFTER ═══════════════════ */}
      <section className="py-20 md:py-28 px-4 md:px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="section-label mb-4">{t('beforeAfterLabel')}</p>
            <h2 className="font-serif text-3xl md:text-5xl text-[#1A1A2E] mb-4">{t('beforeAfterTitle')}</h2>
            <p className="text-base md:text-lg text-[#4A4A68] max-w-3xl mx-auto">{t('beforeAfterSubtitle')}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="kinso-card p-7 md:p-8">
              <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center mb-5">
                <span className="text-red-400 text-lg">✕</span>
              </div>
              <h3 className="text-[#1A1A2E] text-xl font-semibold mb-5">{t('withoutShopBrain')}</h3>
              <ul className="space-y-3 text-sm text-[#4A4A68]">
                <li className="flex items-start gap-3"><span className="text-red-300 mt-0.5">—</span>{t('withoutItem1')}</li>
                <li className="flex items-start gap-3"><span className="text-red-300 mt-0.5">—</span>{t('withoutItem2')}</li>
                <li className="flex items-start gap-3"><span className="text-red-300 mt-0.5">—</span>{t('withoutItem3')}</li>
                <li className="flex items-start gap-3"><span className="text-red-300 mt-0.5">—</span>{t('withoutItem4')}</li>
              </ul>
            </div>
            <div className="kinso-card p-7 md:p-8 border-[#2DD4BF]/30">
              <div className="w-10 h-10 bg-[#CCFBF1] rounded-xl flex items-center justify-center mb-5">
                <span className="text-[#0D9488] text-lg">✓</span>
              </div>
              <h3 className="text-[#1A1A2E] text-xl font-semibold mb-5">{t('withShopBrain')}</h3>
              <ul className="space-y-3 text-sm text-[#4A4A68]">
                <li className="flex items-start gap-3"><span className="text-[#0D9488] mt-0.5">✓</span>{t('withItem1')}</li>
                <li className="flex items-start gap-3"><span className="text-[#0D9488] mt-0.5">✓</span>{t('withItem2')}</li>
                <li className="flex items-start gap-3"><span className="text-[#0D9488] mt-0.5">✓</span>{t('withItem3')}</li>
                <li className="flex items-start gap-3"><span className="text-[#0D9488] mt-0.5">✓</span>{t('withItem4')}</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════ DIVIDER ═══════════════════ */}
      <div className="section-divider"></div>

      {/* ═══════════════════ BENEFITS ═══════════════════ */}
      <section className="py-20 md:py-28 px-4 md:px-6 bg-[#F7F8FA]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14 md:mb-20">
            <p className="section-label mb-4">{t('benefitsLabel')}</p>
            <h2 className="font-serif text-3xl md:text-5xl text-[#1A1A2E] mb-4">{t('benefitsTitle')}</h2>
            <p className="text-base md:text-lg text-[#4A4A68] max-w-3xl mx-auto">{t('benefitsSubtitle')}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { title: t('benefitTimeSaveTitle'), desc: t('benefitTimeSaveDesc') },
              { title: t('benefitClearDecisionsTitle'), desc: t('benefitClearDecisionsDesc') },
              { title: t('benefitTrackedSalesTitle'), desc: t('benefitTrackedSalesDesc') },
              { title: t('benefitShopifyConnectedTitle'), desc: t('benefitShopifyConnectedDesc') }
            ].map((b, idx) => (
              <div key={idx} className="kinso-card p-6 md:p-7 animate-popIn" style={{ animationDelay: `${idx * 0.1}s` }}>
                <div className={`w-10 h-10 ${idx % 2 === 0 ? 'bg-[#CCFBF1]' : 'bg-[#FFF4F0]'} rounded-xl flex items-center justify-center mb-4`}>
                  <span className={`${idx % 2 === 0 ? 'text-[#0D9488]' : 'text-[#FF6B35]'} text-sm font-bold`}>{String(idx + 1).padStart(2, '0')}</span>
                </div>
                <h3 className="text-[#1A1A2E] text-base font-semibold mb-2">{b.title}</h3>
                <p className="text-[#4A4A68] text-sm leading-relaxed">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════ INTEGRATIONS MARQUEE (Kinso-style) ═══════════════════ */}
      <section className="py-10 md:py-14 px-4 md:px-6 bg-white border-y border-[#E8E8EE]">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-center mb-8">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent to-[#E8E8EE]" />
            <span className="px-4 text-xs font-semibold uppercase tracking-[0.2em] text-[#8A8AA3] border border-[#E8E8EE] rounded-full py-1.5">INTEGRATIONS</span>
            <div className="h-px flex-1 bg-gradient-to-l from-transparent to-[#E8E8EE]" />
          </div>
          <div className="marquee-container">
            <div className="marquee-track">
              {['Shopify', 'OpenAI', 'Stripe', 'Supabase', 'GPT-4', 'Shopify', 'OpenAI', 'Stripe', 'Supabase', 'GPT-4', 'Shopify', 'OpenAI', 'Stripe', 'Supabase', 'GPT-4'].map((brand, idx) => (
                <span
                  key={idx}
                  className="text-base md:text-lg font-semibold uppercase tracking-[0.2em] text-[#8A8AA3]/50 whitespace-nowrap select-none hover:text-[#1A1A2E] transition-colors duration-300"
                >
                  {brand}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════ FEATURES ═══════════════════ */}
      <section id="features" className="py-20 md:py-28 px-4 md:px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14 md:mb-20">
            <p className="section-label mb-4">FEATURES</p>
            <h2 className="font-serif text-3xl md:text-6xl text-[#1A1A2E] mb-4">
              {t("featuresSectionTitle")}<br /><span className="gradient-text italic">{t('featuresSectionTitleSuffix')}</span>
            </h2>
            <p className="text-base md:text-xl text-[#4A4A68] max-w-2xl mx-auto">
              {t('featuresSectionSubtitle')}
            </p>
          </div>

          {/* Feature Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[
              {
                icon: '🤖',
                color: 'bg-[#CCFBF1] text-[#0D9488]',
                title: t('featureRealtimeTitle'),
                desc: t('featureRealtimeDesc'),
                stat: t('featureRealtimeStat')
              },
              {
                icon: '⚡',
                color: 'bg-[#FFF4F0] text-[#FF6B35]',
                title: t('featureAutoOptTitle'),
                desc: t('featureAutoOptDesc'),
                stat: t('featureAutoOptStat')
              },
              {
                icon: '📊',
                color: 'bg-[#CCFBF1] text-[#0D9488]',
                title: t('featureAnalyticsTitle'),
                desc: t('featureAnalyticsDesc'),
                stat: t('featureAnalyticsStat')
              },
              {
                icon: '🛍',
                color: 'bg-[#FFF4F0] text-[#FF6B35]',
                title: t('featureShopifyTitle'),
                desc: t('featureShopifyDesc'),
                stat: t('featureShopifyStat')
              }
            ].map((feature, idx) => (
              <div key={idx} className="kinso-card p-7 md:p-9 group animate-popIn" style={{ animationDelay: `${idx * 0.12}s` }}>
                <div className={`inline-flex items-center justify-center w-14 h-14 ${feature.color.split(' ')[0]} rounded-2xl text-2xl mb-6`}>
                  {feature.icon}
                </div>
                <h3 className="text-xl md:text-2xl font-semibold text-[#1A1A2E] mb-3">{feature.title}</h3>
                <p className="text-[#4A4A68] leading-relaxed mb-5">{feature.desc}</p>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#F7F8FA] border border-[#EFF1F5] rounded-full text-sm text-[#4A4A68]">
                  <span className="w-2 h-2 bg-[#2DD4BF] rounded-full"></span>
                  {feature.stat}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════ HOW IT WORKS ═══════════════════ */}
      <section id="how-it-works" className="py-20 md:py-28 px-4 md:px-6 bg-[#F7F8FA]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14 md:mb-20">
            <p className="section-label mb-4">HOW IT WORKS</p>
            <h2 className="font-serif text-3xl md:text-5xl text-[#1A1A2E]">{t("howItWorksTitle")}</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-12">
            {[
              {
                number: '01',
                title: t('step1Title'),
                desc: t('step1Desc')
              },
              {
                number: '02',
                title: t('step2Title'),
                desc: t('step2Desc')
              },
              {
                number: '03',
                title: t('step3Title'),
                desc: t('step3Desc')
              }
            ].map((step, idx) => (
              <div key={idx} className="text-center animate-fadeInUp" style={{ animationDelay: `${idx * 0.15}s` }}>
                <div className="font-serif text-6xl md:text-7xl text-[#EFF1F5] font-bold mb-4 leading-none select-none">
                  {step.number}
                </div>
                <h3 className="text-lg font-semibold text-[#1A1A2E] mb-3">{step.title}</h3>
                <p className="text-sm text-[#4A4A68] leading-relaxed max-w-xs mx-auto">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════ DIVIDER ═══════════════════ */}
      <div className="section-divider"></div>

      {/* ═══════════════════ PRICING ═══════════════════ */}
      <section id="pricing" className="py-20 md:py-32 px-4 md:px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10 md:mb-20">
            <p className="section-label mb-4">PRICING</p>
            <h2 className="font-serif text-3xl md:text-6xl text-[#1A1A2E] mb-5">
              {t("pricingTitleLine1")}<br />
              <span className="gradient-text italic">{t('pricingTitleLine2')}</span>
            </h2>
            <p className="text-base md:text-xl text-[#4A4A68] mb-2 max-w-2xl mx-auto">
              {t('pricingSubtitle')}
            </p>
            <p className="text-sm text-[#FF6B35] font-semibold">{t('pricingProBestValue')}</p>
            {renderLandingStatus('pricing')}
          </div>

          <div className="flex justify-center mb-14">
            <button
              onClick={openStripePricing}
              className="px-10 py-4 bg-[#1A1A2E] text-white text-sm font-medium rounded-full hover:bg-[#2A2A42] transition-all hover:shadow-lg"
            >
              {t('chooseSubscription')} →
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 max-w-6xl mx-auto">
            {PRICING_PLANS.map((plan, idx) => (
              <div
                key={idx}
                className={`relative animate-fadeInUp ${
                  plan.highlight ? 'md:-mt-4 md:mb-4 z-10' : ''
                }`}
                style={{ animationDelay: `${idx * 0.1}s` }}
              >
                <div
                  className={`relative p-8 md:p-9 bg-white rounded-2xl transition-all duration-300 hover:shadow-[var(--shadow-lg)] ${
                    plan.highlight
                      ? 'border-2 border-[#2DD4BF] shadow-[var(--shadow-lg)] hover:border-[#5EEAD4]'
                      : 'border-2 border-[#FF6B35]/40 shadow-[var(--shadow-sm)] hover:border-[#FF6B35]/65'
                  }`}
                >
                  {plan.highlight && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                      <span className="inline-flex items-center gap-1 bg-[#0D9488] text-white px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide shadow-md">
                        {t("mostPopularBadge")}
                      </span>
                    </div>
                  )}

                  <div className="text-center mb-8">
                    <h3 className="text-xl font-semibold text-[#1A1A2E] mb-3">{plan.name}</h3>
                    <div className="mb-2">
                      <span className="font-serif text-5xl text-[#1A1A2E]">{plan.price}</span>
                      <span className="text-[#8A8AA3] text-base ml-1">{t('perMonth')}</span>
                    </div>
                    <p className="text-xs text-[#8A8AA3]">{t("billedMonthly")}</p>
                  </div>

                  <ul className="space-y-3 mb-8">
                    {plan.features.map((feature, fidx) => (
                      <li key={fidx} className="flex items-start gap-3">
                        <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs mt-0.5 ${
                          plan.highlight ? 'bg-[#ECFDF5] text-[#0D9488]' : 'bg-[#F7F8FA] text-[#8A8AA3]'
                        }`}>
                          ✓
                        </span>
                        <span className="text-sm text-[#4A4A68] leading-relaxed">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA removed; selection via Stripe Pricing Table */}
                  <button
                    onClick={openStripePricing}
                    className={`w-full py-3.5 rounded-full text-sm font-semibold text-center transition-all ${
                      plan.highlight
                        ? 'bg-[#0D9488] text-white hover:bg-[#2DD4BF] hover:text-[#0D9488] shadow-sm'
                        : 'bg-[#F7F8FA] text-[#1A1A2E] border border-[#FF6B35]/40 hover:bg-[#EFF1F5] hover:border-[#FF6B35]/65'
                    }`}
                  >
                    {t("viewAllPlans")}
                  </button>

                  <p className="text-center text-xs text-[#8A8AA3] mt-4">{t('cancelInOneClick')}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-20 text-center">
            <p className="text-[#4A4A68] mb-5">{t('needCustomPlan')}</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={openStripePricing}
                className="px-8 py-3 bg-[#1A1A2E] text-white font-medium rounded-full hover:bg-[#2A2A42] transition-all text-sm"
              >
                {t("viewAllPlans")} →
              </button>
              <a
                href="mailto:louis-felix.gilbert@outlook.com"
                className="px-8 py-3 text-[#1A1A2E] font-medium border border-[#E8E8EE] rounded-full hover:bg-[#F7F8FA] transition-all text-sm"
              >
                {t('contactOurTeam')}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════ CTA ═══════════════════ */}
      <section className="py-20 md:py-28 px-4 md:px-6 bg-gradient-to-br from-[#1A1A2E] via-[#1A1A2E] to-[#0D3B3B]">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="font-serif text-3xl md:text-5xl text-white mb-5 md:mb-6">
            {t('ctaTitle')}
          </h2>
          <p className="text-base md:text-lg text-white/60 mb-8 md:mb-10 max-w-2xl mx-auto">
            {t('ctaSubtitle')}
          </p>
          <button
            onClick={openStripePricing}
            className="px-10 py-4 bg-[#FF6B35] text-white text-sm md:text-base font-semibold rounded-full hover:bg-[#E85A28] transition-all hover:shadow-[0_8px_24px_rgba(255,107,53,0.3)]"
          >
            {t("viewAllPlans")} →
          </button>
        </div>
      </section>

      {/* ═══════════════════ FOOTER ═══════════════════ */}
      <footer className="border-t border-[#E8E8EE] py-12 md:py-16 px-4 md:px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
            <div>
              <span className="text-lg font-semibold text-[#1A1A2E] tracking-tight">ShopBrain AI</span>
              <p className="text-sm text-[#8A8AA3] mt-3 leading-relaxed">AI-powered e-commerce optimization platform.</p>
            </div>
            <div>
              <h4 className="section-label mb-4">{t("footerProduct")}</h4>
              <ul className="space-y-3 text-sm text-[#4A4A68]">
                <li><a href="#features" className="hover:text-[#1A1A2E] transition-colors">{t("navFeatures")}</a></li>
                <li><a href="#pricing" className="hover:text-[#1A1A2E] transition-colors">{t("navPricing")}</a></li>
                <li><a href="#how-it-works" className="hover:text-[#1A1A2E] transition-colors">{t("navHowItWorks")}</a></li>
              </ul>
            </div>
            <div>
              <h4 className="section-label mb-4">{t("footerCompany")}</h4>
              <ul className="space-y-3 text-sm text-[#4A4A68]">
                <li><a href="#" className="hover:text-[#1A1A2E] transition-colors">{t("footerAbout")}</a></li>
                <li><a href="#" className="hover:text-[#1A1A2E] transition-colors">{t("footerBlog")}</a></li>
                <li><a href="#" className="hover:text-[#1A1A2E] transition-colors">{t("footerContact")}</a></li>
              </ul>
            </div>
            <div>
              <h4 className="section-label mb-4">{t("footerLegal")}</h4>
              <ul className="space-y-3 text-sm text-[#4A4A68]">
                <li><a href="#" className="hover:text-[#1A1A2E] transition-colors">{t("footerPrivacyPolicy")}</a></li>
                <li><a href="#" className="hover:text-[#1A1A2E] transition-colors">{t('footerTermsOfUse')}</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-[#E8E8EE] pt-8">
            <p className="text-center text-sm text-[#8A8AA3]">{t('footerCopyright')}</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
