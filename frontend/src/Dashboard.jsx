import React, { useState, useEffect, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://jgmsfadayzbgykzajvmw.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnbXNmYWRheXpiZ3lremFqdm13Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQwODk0NTksImV4cCI6MjA3OTY2NTQ1OX0.sg0O2QGdoKO5Zb6vcRJr5pSu2zlaxU3r7nHtyXb07hg'
)

const API_URL = 'https://shopbrain-backend.onrender.com'

export default function Dashboard() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(() => {
    if (typeof window === 'undefined') return null
    try {
      const cached = localStorage.getItem('profileCache')
      return cached ? JSON.parse(cached) : null
    } catch {
      return null
    }
  })
  const [subscription, setSubscription] = useState(() => {
    if (typeof window === 'undefined') return null
    try {
      const cached = localStorage.getItem('subscriptionCache')
      return cached ? JSON.parse(cached) : null
    } catch {
      return null
    }
  })
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === 'undefined') return 'overview'
    return localStorage.getItem('activeTab') || 'overview'
  })
  const [shopifyUrl, setShopifyUrl] = useState(() => {
    if (typeof window === 'undefined') return ''
    return localStorage.getItem('shopifyUrlCache') || ''
  })
  const [shopifyToken, setShopifyToken] = useState('')
  const [shopifyConnected, setShopifyConnected] = useState(false)
  const [showShopifyToken, setShowShopifyToken] = useState(false)
  const [products, setProducts] = useState(null)
  const [error, setError] = useState('')
  const [isProcessingPayment, setIsProcessingPayment] = useState(false)
  const [showPlanMenu, setShowPlanMenu] = useState(false)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [settingsTab, setSettingsTab] = useState(() => {
    if (typeof window === 'undefined') return 'profile'
    return localStorage.getItem('settingsTab') || 'profile'
  })
  const [subscriptionMissing, setSubscriptionMissing] = useState(false)
  const [showApplyModal, setShowApplyModal] = useState(false)
  const [selectedActions, setSelectedActions] = useState([])
  const [applyingActions, setApplyingActions] = useState(false)
  const [analysisResults, setAnalysisResults] = useState(null)
  const defaultChatMessages = [
    { role: 'assistant', text: 'Bonjour, je suis ton assistant IA e-commerce. Pose-moi des questions sur tes produits, ta stratégie, ou ta boutique Shopify.' }
  ]
  const [chatMessages, setChatMessages] = useState(() => {
    if (typeof window === 'undefined') return defaultChatMessages
    try {
      const stored = localStorage.getItem('chatMessages')
      if (!stored) return defaultChatMessages
      const parsed = JSON.parse(stored)
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : defaultChatMessages
    } catch {
      return defaultChatMessages
    }
  })
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  
  // Settings form states
  const [profileFirstName, setProfileFirstName] = useState(profile?.first_name || '')
  const [profileLastName, setProfileLastName] = useState(profile?.last_name || '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [darkMode] = useState(true)
  const [language, setLanguage] = useState(() => localStorage.getItem('language') || 'fr')
  const [notifications, setNotifications] = useState({
    email_notifications: true,
    analysis_complete: true,
    weekly_reports: true,
    billing_updates: true
  })
  const [twoFAEnabled, setTwoFAEnabled] = useState(profile?.two_factor_enabled || false)
  const [saveLoading, setSaveLoading] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const avatarInputRef = useRef(null)
  const [apiKeys, setApiKeys] = useState([])
  const [apiLoading, setApiLoading] = useState(false)
  const [applyingRecommendationId, setApplyingRecommendationId] = useState(null)
  const [applyingBlockerActionId, setApplyingBlockerActionId] = useState(null)
  const [statusByKey, setStatusByKey] = useState({})
  const [pendingRevokeKeyId, setPendingRevokeKeyId] = useState(null)
  const [pendingCancelSubscription, setPendingCancelSubscription] = useState(false)
  const chatEndRef = useRef(null)
  const [showChatModal, setShowChatModal] = useState(false)
  const [analyticsRange, setAnalyticsRange] = useState('30d')
  const [analyticsData, setAnalyticsData] = useState(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [analyticsError, setAnalyticsError] = useState('')
  const [insightsData, setInsightsData] = useState(null)
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [insightsError, setInsightsError] = useState('')
  const [blockersData, setBlockersData] = useState(null)
  const [blockersLoading, setBlockersLoading] = useState(false)
  const [customers, setCustomers] = useState([])
  const [customersLoading, setCustomersLoading] = useState(false)
  const [invoiceCustomerId, setInvoiceCustomerId] = useState('')
  const [invoiceCustomerEmail, setInvoiceCustomerEmail] = useState('')
  const [invoiceProductId, setInvoiceProductId] = useState('')
  const [invoiceQuantity, setInvoiceQuantity] = useState(1)
  const [invoiceItems, setInvoiceItems] = useState([])
  const [invoiceNote, setInvoiceNote] = useState('')
  const [invoiceSubmitting, setInvoiceSubmitting] = useState(false)
  const [invoiceResult, setInvoiceResult] = useState(null)

  const formatDate = (value) => {
    if (!value) return '—'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '—'
    return date.toLocaleDateString('fr-FR')
  }

  const formatCurrency = (value, currency = 'EUR') => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
    try {
      return new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency
      }).format(Number(value))
    } catch {
      return `${value} ${currency}`
    }
  }

  const formatCompactNumber = (value) => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
    return new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value))
  }

  const buildSparklinePoints = (series, width = 520, height = 140) => {
    if (!series || series.length === 0) return ''
    const values = series.map((point) => Number(point.revenue || 0))
    const max = Math.max(...values)
    const min = Math.min(...values)
    const range = max - min || 1
    const step = width / Math.max(series.length - 1, 1)

    return series.map((point, index) => {
      const value = Number(point.revenue || 0)
      const x = index * step
      const y = height - ((value - min) / range) * height
      return `${x},${y}`
    }).join(' ')
  }

  const getInsightCount = (items) => (Array.isArray(items) ? items.length : 0)

  const renderInsightItems = (items, formatter) => {
    if (insightsLoading) {
      return <p className="text-xs text-gray-500 mt-2">Chargement...</p>
    }
    if (!Array.isArray(items) || items.length === 0) {
      return <p className="text-xs text-gray-500 mt-2">Aucun signal détecté.</p>
    }
    return (
      <ul className="mt-2 space-y-1 text-xs text-gray-400">
        {items.slice(0, 3).map((item, index) => (
          <li key={index}>{formatter(item)}</li>
        ))}
      </ul>
    )
  }

  const getRangeDays = (range) => {
    if (range === '7d') return 7
    if (range === '90d') return 90
    if (range === '365d') return 365
    return 30
  }

  const getRangeLabel = (range) => {
    const days = getRangeDays(range)
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(endDate.getDate() - days)
    return `Du ${startDate.toLocaleDateString('fr-FR')} au ${endDate.toLocaleDateString('fr-FR')}`
  }

  const formatPlan = (plan) => {
    const normalized = String(plan || '').toLowerCase()
    if (!normalized) return '—'
    if (normalized === 'standard') return 'STANDARD'
    if (normalized === 'pro') return 'PRO'
    if (normalized === 'premium') return 'PREMIUM'
    return normalized.toUpperCase()
  }

  const getPlanFeatures = (plan) => {
    const normalized = String(plan || '').toLowerCase()
    if (normalized === 'premium') {
      return ['product_analysis', 'content_generation', 'cross_sell', 'automated_actions', 'reports', 'predictions', 'invoicing']
    }
    if (normalized === 'pro') {
      return ['product_analysis', 'content_generation', 'cross_sell', 'reports', 'automated_actions', 'invoicing']
    }
    return ['product_analysis', 'title_optimization', 'price_suggestions']
  }

  const setStatus = (key, type, message) => {
    setStatusByKey((prev) => ({
      ...prev,
      [key]: { type, message, ts: Date.now() }
    }))
  }

  const formatErrorDetail = (detail, fallback = 'Erreur') => {
    if (!detail) return fallback
    if (typeof detail === 'string') return detail
    if (typeof detail?.message === 'string') return detail.message
    try {
      return JSON.stringify(detail)
    } catch {
      return fallback
    }
  }

  const renderStatus = (key) => {
    const status = statusByKey[key]
    if (!status?.message) return null

    const styles = status.type === 'success'
      ? 'bg-green-900 border-green-700 text-green-200'
      : status.type === 'warning'
        ? 'bg-yellow-900 border-yellow-700 text-yellow-200'
        : status.type === 'error'
          ? 'bg-gray-800 border-yellow-700 text-yellow-200'
          : 'bg-gray-800 border-gray-700 text-gray-200'

    return (
      <div className={`mt-3 p-3 rounded-lg border ${styles}`}>
        {status.message}
      </div>
    )
  }

  const translations = {
    fr: {
      accountSettings: 'Paramètres du compte',
      tabProfile: 'Profil',
      tabSecurity: 'Sécurité',
      tabInterface: 'Interface',
      tabNotifications: 'Notifications',
      tabBilling: 'Facturation',
      tabApiKeys: 'Clés API',
      tabShopify: 'Shopify',
      profileInformation: 'Informations du profil',
      uploadPhoto: 'Importer une photo',
      firstName: 'Prénom',
      lastName: 'Nom',
      username: 'Nom d’utilisateur',
      usernameCannotChange: 'Le nom d’utilisateur ne peut pas être modifié',
      email: 'Email',
      saveChanges: 'Enregistrer',
      saving: 'Enregistrement...',
      securitySettings: 'Paramètres de sécurité',
      changePassword: 'Changer le mot de passe',
      currentPassword: 'Mot de passe actuel',
      newPassword: 'Nouveau mot de passe',
      confirmNewPassword: 'Confirmer le nouveau mot de passe',
      updatePassword: 'Mettre à jour',
      updating: 'Mise à jour...',
      twoFactorAuth: 'Authentification à deux facteurs',
      twoFactorDesc: 'Ajoute une couche de sécurité supplémentaire',
      enable2FA: 'Activer 2FA',
      disable2FA: 'Désactiver 2FA',
      twoFAEnabled: '2FA est activée',
      interfacePreferences: 'Préférences d’interface',
      darkMode: 'Mode sombre',
      enabled: 'Activé',
      disabled: 'Désactivé',
      language: 'Langue',
      saveInterface: 'Enregistrer l’interface',
      notificationPreferences: 'Préférences de notifications',
      emailNotifications: 'Notifications email',
      analysisComplete: 'Analyse produit terminée',
      weeklyReports: 'Rapports hebdomadaires',
      billingUpdates: 'Mises à jour de facturation',
      saveNotifications: 'Enregistrer les notifications',
      billingAndSubscription: 'Facturation et abonnement',
      activeSince: 'Actif depuis',
      changePlan: 'Changer de plan',
      cancelSubscription: 'Annuler l’abonnement',
      paymentMethod: 'Moyen de paiement',
      updatePaymentMethod: 'Mettre à jour le paiement',
      apiKeys: 'Clés API',
      apiWarning: 'Garde tes clés API en sécurité. Ne les partage pas.',
      productionApiKey: 'Clé API de production',
      createdOn: 'Créée le',
      revoke: 'Révoquer',
      generateKey: '+ Générer une nouvelle clé'
    },
    en: {
      accountSettings: 'Account Settings',
      tabProfile: 'Profile',
      tabSecurity: 'Security',
      tabInterface: 'Interface',
      tabNotifications: 'Notifications',
      tabBilling: 'Billing',
      tabApiKeys: 'API Keys',
      tabShopify: 'Shopify',
      profileInformation: 'Profile Information',
      uploadPhoto: 'Upload Photo',
      firstName: 'First Name',
      lastName: 'Last Name',
      username: 'Username',
      usernameCannotChange: 'Username cannot be changed',
      email: 'Email',
      saveChanges: 'Save Changes',
      saving: 'Saving...',
      securitySettings: 'Security Settings',
      changePassword: 'Change Password',
      currentPassword: 'Current Password',
      newPassword: 'New Password',
      confirmNewPassword: 'Confirm New Password',
      updatePassword: 'Update Password',
      updating: 'Updating...',
      twoFactorAuth: 'Two-Factor Authentication',
      twoFactorDesc: 'Add an extra layer of security to your account',
      enable2FA: 'Enable 2FA',
      disable2FA: 'Disable 2FA',
      twoFAEnabled: '2FA is enabled',
      interfacePreferences: 'Interface Preferences',
      darkMode: 'Dark Mode',
      enabled: 'Enabled',
      disabled: 'Disabled',
      language: 'Language',
      saveInterface: 'Save Interface Settings',
      notificationPreferences: 'Notification Preferences',
      emailNotifications: 'Email notifications',
      analysisComplete: 'Product analysis complete',
      weeklyReports: 'Weekly reports',
      billingUpdates: 'Billing updates',
      saveNotifications: 'Save Notification Settings',
      billingAndSubscription: 'Billing & Subscription',
      activeSince: 'Active since',
      changePlan: 'Change Plan',
      cancelSubscription: 'Cancel Subscription',
      paymentMethod: 'Payment Method',
      updatePaymentMethod: 'Update Payment Method',
      apiKeys: 'API Keys',
      apiWarning: 'Keep your API keys secure. Do not share them publicly.',
      productionApiKey: 'Production API Key',
      createdOn: 'Created on',
      revoke: 'Revoke',
      generateKey: '+ Generate New Key'
    }
  }

  const t = (key) => translations[language]?.[key] || translations.fr[key] || key

  const verifyPaymentSession = async (sessionId) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        initializeUser()
        return
      }

      const response = await fetch(`${API_URL}/api/subscription/verify-session`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ session_id: sessionId })
      })

      const data = await response.json()
      if (data.success) {
        console.log('Payment session verified and plan updated')
      }
      
      // Always refresh user data after verification attempt
      initializeUser()
    } catch (err) {
      console.error('Payment verification error:', err)
      initializeUser()
    }
  }

  useEffect(() => {
    // Check if coming from Stripe payment redirect
    const params = new URLSearchParams(window.location.search)
    const sessionId = params.get('session_id')

    const hash = window.location.hash || ''
    const hashQuery = hash.includes('?') ? hash.split('?')[1] : ''
    const hashParams = new URLSearchParams(hashQuery)
    const hashSessionId = hashParams.get('session_id')
    const hasHashSuccess = hash.includes('success=true') || hashParams.get('success') === 'true'
    
    if (sessionId || hashSessionId) {
      // Payment redirect - verify session first, then initialize
      setIsProcessingPayment(true)
      verifyPaymentSession(sessionId || hashSessionId)
      
      // Cleanup URL after a moment
      setTimeout(() => {
        const baseUrl = window.location.href.split('?')[0].split('#')[0]
        window.history.replaceState({}, document.title, baseUrl)
        setIsProcessingPayment(false)
      }, 1000)
    } else if (hasHashSuccess) {
      // Fallback for hash-based success detection
      setIsProcessingPayment(true)
      initializeUser()
      
      // Poll for subscription update from webhook
      const checkInterval = setInterval(() => {
        initializeUser()
      }, 2000)
      
      setTimeout(() => {
        clearInterval(checkInterval)
        setIsProcessingPayment(false)
        window.location.hash = window.location.hash.replace('success=true', '')
      }, 10000)
    } else {
      // Normal initialization
      initializeUser()
    }
  }, [])

  useEffect(() => {
    if (showSettingsModal && settingsTab === 'api') {
      loadApiKeys()
    }
  }, [showSettingsModal, settingsTab])

  const loadApiKeys = async () => {
    try {
      setApiLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch(`${API_URL}/api/settings/api-keys`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })
      const data = await response.json()
      if (data.success) {
        setApiKeys(data.keys || [])
      }
    } catch (err) {
      console.error('API keys load error:', err)
    } finally {
      setApiLoading(false)
    }
  }

  const handleGenerateApiKey = async () => {
    try {
      setApiLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch(`${API_URL}/api/settings/api-keys`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: 'Production Key' })
      })
      const data = await response.json()
      if (data.success) {
        setStatus('api', 'success', `Nouvelle clé générée: ${data.api_key}. Copie-la maintenant, elle ne sera plus affichée.`)
        setApiKeys((prev) => [data.key, ...prev])
      } else {
        setStatus('api', 'error', 'Erreur: ' + (data.detail || 'Erreur'))
      }
    } catch (err) {
      console.error('API key generate error:', err)
      setStatus('api', 'error', 'Erreur lors de la génération')
    } finally {
      setApiLoading(false)
    }
  }

  const handleRevokeApiKey = async (keyId) => {
    if (pendingRevokeKeyId !== keyId) {
      setPendingRevokeKeyId(keyId)
      setStatus('api', 'warning', 'Confirme la révocation de cette clé pour continuer.')
      return
    }
    setPendingRevokeKeyId(null)

    try {
      setApiLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch(`${API_URL}/api/settings/api-keys/revoke`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ key_id: keyId })
      })
      const data = await response.json()
      if (data.success) {
        setApiKeys((prev) => prev.map((k) => k.id === keyId ? { ...k, revoked: true } : k))
        setStatus('api', 'success', 'Clé révoquée avec succès.')
      } else {
        setStatus('api', 'error', 'Erreur: ' + (data.detail || 'Erreur'))
      }
    } catch (err) {
      console.error('API key revoke error:', err)
      setStatus('api', 'error', 'Erreur lors de la révocation')
    } finally {
      setApiLoading(false)
    }
  }

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('activeTab', activeTab)
    }
  }, [activeTab])

  useEffect(() => {
    const allowedTabs = [
      'overview',
      'underperforming',
      'action-blockers',
      'action-rewrite',
      'action-price',
      'action-images',
      'action-bundles',
      'action-stock',
      'action-returns',
      'invoices',
      'ai',
      'analysis'
    ]
    if (!allowedTabs.includes(activeTab)) {
      setActiveTab('overview')
    }
  }, [activeTab])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('settingsTab', settingsTab)
    }
  }, [settingsTab])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('chatMessages', JSON.stringify(chatMessages.slice(-50)))
    }
  }, [chatMessages])

  useEffect(() => {
    if (typeof window !== 'undefined' && profile) {
      localStorage.setItem('profileCache', JSON.stringify(profile))
    }
  }, [profile])

  useEffect(() => {
    if (typeof window !== 'undefined' && shopifyUrl) {
      localStorage.setItem('shopifyUrlCache', shopifyUrl)
    }
  }, [shopifyUrl])

  useEffect(() => {
    if (typeof window !== 'undefined' && subscription) {
      localStorage.setItem('subscriptionCache', JSON.stringify(subscription))
    }
  }, [subscription])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [chatMessages, chatLoading])

  const initializeUser = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        window.location.hash = '#/'
        return
      }
      
      setUser(session.user)
      if (!profile) {
        const meta = session.user?.user_metadata || {}
        const quickProfile = {
          first_name: meta.first_name || meta.firstName || '',
          last_name: meta.last_name || meta.lastName || '',
          username: meta.username || '',
          avatar_url: meta.avatar_url || meta.avatar || ''
        }
        if (quickProfile.first_name || quickProfile.last_name || quickProfile.username || quickProfile.avatar_url) {
          setProfile(quickProfile)
        }
      }
      setSubscriptionMissing(false)

      const authHeaders = {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      }

      const profilePromise = fetch(`${API_URL}/api/auth/profile`, { headers: authHeaders })
      const prefsPromise = fetch(`${API_URL}/api/settings/interface`, { headers: authHeaders })
      const notifPromise = fetch(`${API_URL}/api/settings/notifications`, { headers: authHeaders })
      const shopPromise = fetch(`${API_URL}/api/shopify/connection`, { headers: authHeaders })
      const subPromise = fetch(`${API_URL}/api/subscription/status`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ user_id: session.user.id })
      })

      const [profileResp, prefsResp, notifResp, shopResp, subResp] = await Promise.all([
        profilePromise,
        prefsPromise,
        notifPromise,
        shopPromise,
        subPromise
      ])

      if (profileResp.ok) {
        const profileData = await profileResp.json()
        setProfile(profileData)
        setProfileFirstName(profileData.first_name || '')
        setProfileLastName(profileData.last_name || '')
        setTwoFAEnabled(Boolean(profileData.two_factor_enabled))
      }

      if (prefsResp.ok) {
        const prefsData = await prefsResp.json()
        if (prefsData.success && prefsData.preferences) {
          if (prefsData.preferences.language) {
            setLanguage(prefsData.preferences.language)
          }
        }
      }

      if (notifResp.ok) {
        const notifData = await notifResp.json()
        if (notifData.success && notifData.preferences) {
          setNotifications({
            email_notifications: Boolean(notifData.preferences.email_notifications),
            analysis_complete: Boolean(notifData.preferences.analysis_complete),
            weekly_reports: Boolean(notifData.preferences.weekly_reports),
            billing_updates: Boolean(notifData.preferences.billing_updates)
          })
        }
      }

      if (shopResp.ok) {
        const shopData = await shopResp.json()
        if (shopData.success && shopData.connection?.shop_domain) {
          setShopifyUrl(shopData.connection.shop_domain)
          setShopifyConnected(true)
        }
      }

      setLoading(false)

      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
      let data = subResp.ok ? await subResp.json() : null
      let attempts = 0

      while ((!data || !data.success || !data.has_subscription) && attempts < 3) {
        await sleep(1000)
        const retryResp = await fetch(`${API_URL}/api/subscription/status`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ user_id: session.user.id })
        })
        data = retryResp.ok ? await retryResp.json() : null
        attempts += 1
      }

      if (data && data.success && data.has_subscription) {
        setSubscription(data)
        console.log('Subscription active, loading Shopify products...')
        loadProducts()
        loadAnalytics(analyticsRange)
      } else {
        setSubscriptionMissing(true)
      }
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
        setStatus('upgrade', 'warning', 'Tu es déjà au plan PREMIUM avec toutes les fonctionnalités.')
        return
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setStatus('upgrade', 'error', 'Session expirée, reconnecte-toi.')
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
        setStatus('upgrade', 'error', 'Erreur lors de la création de la session d\'upgrade')
      }
    } catch (e) {
      console.error('Upgrade error:', e)
      setStatus('upgrade', 'error', 'Une erreur est survenue pour l\'upgrade')
    }
  }

  const handleChangePlan = async (targetPlan) => {
    try {
      if (!targetPlan || targetPlan === subscription?.plan) return
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setStatus('change-plan', 'error', 'Session expirée, reconnecte-toi.')
        return
      }

      const resp = await fetch(`${API_URL}/api/subscription/create-session`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ plan: targetPlan, email: user?.email || '' })
      })

      const data = await resp.json()
      if (data?.success && data?.url) {
        window.location.href = data.url
      } else {
        setStatus('change-plan', 'error', 'Erreur lors de la création de la session Stripe')
      }
    } catch (e) {
      console.error('Change plan error:', e)
      setStatus('change-plan', 'error', 'Une erreur est survenue')
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
          text: 'Erreur: ' + (data.detail || 'Erreur inconnue') 
        }])
      }
    } catch (err) {
      setChatMessages(prev => [...prev, { 
        role: 'assistant', 
        text: 'Erreur de connexion: ' + err.message 
      }])
    } finally {
      setChatLoading(false)
    }
  }

  // ============ SETTINGS HANDLERS ============

  const handleAvatarFileChange = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setStatus('profile', 'warning', 'Format invalide. Choisis une image.')
      event.target.value = ''
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setStatus('profile', 'warning', 'Image trop volumineuse (max 5MB).')
      event.target.value = ''
      return
    }

    try {
      setAvatarUploading(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setStatus('profile', 'error', 'Session expirée, reconnecte-toi.')
        return
      }

      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`${API_URL}/api/settings/avatar`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        },
        body: formData
      })

      const data = await response.json()
      if (data.success && data.avatar_url) {
        setProfile((prev) => prev ? { ...prev, avatar_url: data.avatar_url } : prev)
        setStatus('profile', 'success', 'Photo de profil mise à jour')
      } else {
        setStatus('profile', 'error', 'Erreur: ' + (data.detail || 'Erreur inconnue'))
      }
    } catch (err) {
      console.error('Avatar upload error:', err)
      setStatus('profile', 'error', 'Erreur lors de l’upload')
    } finally {
      setAvatarUploading(false)
      event.target.value = ''
    }
  }

  const handleSaveProfile = async () => {
    try {
      setSaveLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch(`${API_URL}/api/auth/profile`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          first_name: profileFirstName,
          last_name: profileLastName
        })
      })
      const data = await response.json()
      if (data.success) {
        setStatus('profile', 'success', 'Profil mis à jour')
        await initializeUser()
      } else {
        setStatus('profile', 'error', 'Erreur: ' + (data.detail || 'Erreur'))
      }
    } catch (err) {
      setStatus('profile', 'error', 'Erreur: ' + err.message)
    } finally {
      setSaveLoading(false)
    }
  }

  const handleUpdatePassword = async () => {
    if (!currentPassword || !newPassword) {
      setStatus('password', 'warning', 'Veuillez remplir tous les champs')
      return
    }
    if (newPassword !== confirmPassword) {
      setStatus('password', 'warning', 'Les mots de passe ne correspondent pas')
      return
    }
    if (newPassword.length < 8) {
      setStatus('password', 'warning', 'Le mot de passe doit avoir au moins 8 caractères')
      return
    }
    try {
      setSaveLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch(`${API_URL}/api/settings/password`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword
        })
      })
      const data = await response.json()
      if (data.success) {
        setStatus('password', 'success', 'Mot de passe mis à jour')
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      } else {
        setStatus('password', 'error', 'Erreur: ' + (data.detail || 'Erreur'))
      }
    } catch (err) {
      setStatus('password', 'error', 'Erreur: ' + err.message)
    } finally {
      setSaveLoading(false)
    }
  }

  const handleToggle2FA = async () => {
    try {
      setSaveLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      const endpoint = twoFAEnabled ? '/api/settings/2fa/disable' : '/api/settings/2fa/enable'
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      })
      const data = await response.json()
      if (data.success) {
        setTwoFAEnabled(!twoFAEnabled)
        setStatus('2fa', 'success', '2FA ' + (twoFAEnabled ? 'désactivée' : 'activée'))
      } else {
        setStatus('2fa', 'error', 'Erreur: ' + (data.detail || 'Erreur'))
      }
    } catch (err) {
      setStatus('2fa', 'error', 'Erreur: ' + err.message)
    } finally {
      setSaveLoading(false)
    }
  }

  const handleSaveInterface = async () => {
    try {
      setSaveLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch(`${API_URL}/api/settings/interface`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          dark_mode: darkMode,
          language: language
        })
      })
      const data = await response.json()
      if (data.success) {
        setStatus('interface', 'success', 'Paramètres mis à jour')
        localStorage.setItem('language', language)
      } else {
        setStatus('interface', 'error', 'Erreur: ' + (data.detail || 'Erreur'))
      }
    } catch (err) {
      setStatus('interface', 'error', 'Erreur: ' + err.message)
    } finally {
      setSaveLoading(false)
    }
  }

  const handleSaveNotifications = async () => {
    try {
      setSaveLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch(`${API_URL}/api/settings/notifications`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(notifications)
      })
      const data = await response.json()
      if (data.success) {
        setStatus('notifications', 'success', 'Préférences mises à jour')
      } else {
        setStatus('notifications', 'error', 'Erreur: ' + (data.detail || 'Erreur'))
      }
    } catch (err) {
      setStatus('notifications', 'error', 'Erreur: ' + err.message)
    } finally {
      setSaveLoading(false)
    }
  }

  const handleCancelSubscription = async () => {
    if (!pendingCancelSubscription) {
      setPendingCancelSubscription(true)
      setStatus('billing-cancel', 'warning', 'Clique une seconde fois pour confirmer l’annulation.')
      return
    }
    setPendingCancelSubscription(false)
    try {
      setSaveLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch(`${API_URL}/api/subscription/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      })
      const data = await response.json()
      if (data.success) {
        setStatus('billing-cancel', 'success', 'Abonnement annulé')
        await initializeUser()
      } else {
        setStatus('billing-cancel', 'error', 'Erreur: ' + (data.detail || 'Erreur'))
      }
    } catch (err) {
      setStatus('billing-cancel', 'error', 'Erreur: ' + err.message)
    } finally {
      setSaveLoading(false)
    }
  }

  const handleUpdatePaymentMethod = async () => {
    try {
      setSaveLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch(`${API_URL}/api/subscription/update-payment-method`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      })
      const data = await response.json()
      if (data.success && data.portal_url) {
        window.location.href = data.portal_url
      } else {
        setStatus('billing-payment', 'error', 'Erreur: ' + (data.detail || 'Erreur'))
      }
    } catch (err) {
      setStatus('billing-payment', 'error', 'Erreur: ' + err.message)
    } finally {
      setSaveLoading(false)
    }
  }

  const connectShopify = async () => {
    if (shopifyConnected && !shopifyToken) {
      setStatus('shopify', 'success', 'Shopify déjà connecté. Aucun token requis pour continuer.')
      return
    }
    if (!shopifyUrl || !shopifyToken) {
      setStatus('shopify', 'warning', 'Veuillez remplir l\'URL et le token')
      return
    }
    
    // Valider le format de l'URL
    if (!shopifyUrl.endsWith('.myshopify.com')) {
      setStatus('shopify', 'warning', 'Format URL invalide. Utilisez: votre-boutique.myshopify.com')
      return
    }
    
    try {
      setLoading(true)
      setError('')
      
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        setStatus('shopify', 'error', 'Session expirée, reconnectez-vous')
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
      console.log('Test passed:', testData)
      
      if (!testData.ready_to_save) {
        setStatus('shopify', 'error', 'La connexion a échoué. Vérifiez vos credentials.')
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
        setStatus('shopify', 'success', `Shopify connecté. ${testData.tests?.products_fetch?.product_count || 0} produits trouvés.`)
        setShopifyConnected(true)
        setShowShopifyToken(false)
        setShopifyToken('')
        console.log('Connection saved, loading products...')
        
        // Charger les produits
        await loadProducts()
      } else {
        throw new Error('Sauvegarde échouée')
      }
    } catch (err) {
      console.error('Error:', err)
      setStatus('shopify', 'error', 'Erreur: ' + err.message)
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
      console.log('Products loaded:', data.product_count)
      
      if (data.success && data.products) {
        setProducts(data.products)
        // Afficher les statistiques
        if (data.statistics) {
          console.log('Stats:', data.statistics)
        }
      } else {
        setProducts([])
        setError('Aucun produit trouvé. Connectez votre boutique Shopify d\'abord.')
      }
    } catch (err) {
      console.error('Error loading products:', err)
      setError('Erreur: ' + err.message)
      setProducts([])
    } finally {
      setLoading(false)
    }
  }

  const loadAnalytics = async (rangeOverride) => {
    try {
      const rangeValue = rangeOverride || analyticsRange
      setAnalyticsLoading(true)
      setAnalyticsError('')
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        setAnalyticsError('Session expirée, reconnectez-vous')
        return
      }

      const response = await fetch(`${API_URL}/api/shopify/analytics?range=${rangeValue}`, {
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
      if (data.success) {
        setAnalyticsData(data)
      } else {
        setAnalyticsError('Analytics indisponibles')
      }
    } catch (err) {
      console.error('Error loading analytics:', err)
      setAnalyticsError(err.message)
    } finally {
      setAnalyticsLoading(false)
    }
  }

  const loadInsights = async (rangeOverride, includeAi = false) => {
    try {
      const rangeValue = rangeOverride || analyticsRange
      setInsightsLoading(true)
      setInsightsError('')
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        setInsightsError('Session expirée, reconnectez-vous')
        return
      }

      const aiParam = includeAi ? '&include_ai=true' : ''
      const response = await fetch(`${API_URL}/api/shopify/insights?range=${rangeValue}${aiParam}`, {
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
      if (data.success) {
        setInsightsData(data)
      } else {
        setInsightsError('Analyse indisponible')
      }
    } catch (err) {
      console.error('Error loading insights:', err)
      setInsightsError(err.message)
    } finally {
      setInsightsLoading(false)
    }
  }

  const loadBlockers = async (rangeOverride) => {
    try {
      const rangeValue = rangeOverride || analyticsRange
      setBlockersLoading(true)
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        setStatus('blockers', 'error', 'Session expirée, reconnectez-vous')
        return
      }

      const response = await fetch(`${API_URL}/api/shopify/blockers?range=${rangeValue}`, {
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
      if (data.success) {
        setBlockersData(data)
      } else {
        setStatus('blockers', 'error', 'Analyse indisponible')
      }
    } catch (err) {
      console.error('Error loading blockers:', err)
      setStatus('blockers', 'error', err.message)
    } finally {
      setBlockersLoading(false)
    }
  }

  const runActionAnalysis = async (actionKey) => {
    try {
      setStatus(actionKey, 'info', 'Analyse en cours...')
      if (actionKey === 'action-blockers') {
        await loadBlockers()
      } else {
        const includeAi = actionKey === 'action-rewrite'
        await loadInsights(undefined, includeAi)
      }
      setStatus(actionKey, 'success', 'Analyse terminée.')
    } catch (err) {
      setStatus(actionKey, 'error', err.message || 'Erreur analyse')
    }
  }

  const handleApplyBlockerAction = async (productId, action) => {
    const plan = String(subscription?.plan || '').toLowerCase()
    if (!['pro', 'premium'].includes(plan)) {
      setStatus('blockers', 'warning', 'Fonctionnalité réservée aux plans Pro/Premium')
      return
    }

    try {
      setApplyingBlockerActionId(`${productId}-${action.type}`)
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        setStatus('blockers', 'error', 'Session expirée, reconnectez-vous')
        return
      }

      const response = await fetch(`${API_URL}/api/shopify/blockers/apply`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          product_id: productId,
          action_type: action.type,
          suggested_price: action.suggested_price
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }

      setStatus('blockers', 'success', 'Action appliquée sur Shopify')
      loadBlockers()
    } catch (err) {
      console.error('Error applying blocker action:', err)
      setStatus('blockers', 'error', err.message)
    } finally {
      setApplyingBlockerActionId(null)
    }
  }

  const loadCustomers = async () => {
    try {
      setCustomersLoading(true)
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        setStatus('invoice', 'error', 'Session expirée, reconnectez-vous')
        return
      }

      const response = await fetch(`${API_URL}/api/shopify/customers?limit=200`, {
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
      if (data.success && data.customers) {
        setCustomers(data.customers)
      }
    } catch (err) {
      console.error('Error loading customers:', err)
      setStatus('invoice', 'error', err.message)
    } finally {
      setCustomersLoading(false)
    }
  }

  const addInvoiceItem = () => {
    if (!invoiceProductId) {
      setStatus('invoice', 'warning', 'Sélectionne un produit')
      return
    }
    const product = (products || []).find((p) => String(p.id) === String(invoiceProductId))
    if (!product || !product.variants || product.variants.length === 0) {
      setStatus('invoice', 'error', 'Produit invalide ou sans variante')
      return
    }
    const variant = product.variants[0]
    const quantity = Number(invoiceQuantity) > 0 ? Number(invoiceQuantity) : 1

    setInvoiceItems((prev) => ([
      ...prev,
      {
        variant_id: variant.id,
        quantity,
        title: product.title,
        price: Number(variant.price || 0)
      }
    ]))
    setInvoiceProductId('')
    setInvoiceQuantity(1)
  }

  const removeInvoiceItem = (index) => {
    setInvoiceItems((prev) => prev.filter((_, idx) => idx !== index))
  }

  const submitInvoice = async () => {
    if (!invoiceItems.length) {
      setStatus('invoice', 'warning', 'Ajoute au moins un produit')
      return
    }
    if (!invoiceCustomerId && !invoiceCustomerEmail) {
      setStatus('invoice', 'warning', 'Sélectionne un client ou un email')
      return
    }

    try {
      setInvoiceSubmitting(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setStatus('invoice', 'error', 'Session expirée, reconnectez-vous')
        return
      }

      const payload = {
        customer_id: invoiceCustomerId || null,
        email: invoiceCustomerEmail || null,
        line_items: invoiceItems.map((item) => ({
          variant_id: item.variant_id,
          quantity: item.quantity
        })),
        note: invoiceNote,
        send_invoice: true
      }

      const response = await fetch(`${API_URL}/api/shopify/draft-orders`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }

      const data = await response.json()
      if (data.success) {
        setInvoiceResult(data)
        setInvoiceItems([])
        setInvoiceNote('')
        setInvoiceCustomerId('')
        setInvoiceCustomerEmail('')
        setStatus('invoice', 'success', 'Facture créée avec succès')
      } else {
        setStatus('invoice', 'error', 'Échec création facture')
      }
    } catch (err) {
      console.error('Error creating invoice:', err)
      setStatus('invoice', 'error', err.message)
    } finally {
      setInvoiceSubmitting(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'overview') {
      loadAnalytics(analyticsRange)
    }
    if (activeTab === 'underperforming') {
      loadAnalytics(analyticsRange)
      loadBlockers(analyticsRange)
    }
  }, [activeTab, analyticsRange])

  useEffect(() => {
    if (activeTab === 'invoices' && customers.length === 0) {
      loadCustomers()
    }
    if (activeTab === 'invoices' && (!products || products.length === 0)) {
      loadProducts()
    }
  }, [activeTab])

  const analyzeProducts = async () => {
    if (!products || products.length === 0) {
      setStatus('analyze', 'warning', 'Charge tes produits d\'abord')
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
        console.log('Analyse terminée:', data.analysis)
        setAnalysisResults(data.analysis)
        setActiveTab('analysis')
        setStatus('analyze', 'success', 'Analyse terminée. Les résultats sont disponibles.')
      } else {
        setStatus('analyze', 'error', 'Erreur lors de l\'analyse: ' + (data.detail || 'Erreur inconnue'))
      }
    } catch (err) {
      console.error('Erreur analyse:', err)
      setStatus('analyze', 'error', 'Erreur analyse: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const prepareActionsForApply = () => {
    if (!analysisResults) return
    
    const actions = []
    
    // Add price optimizations
    if (analysisResults.pricing_strategy?.optimizations) {
      analysisResults.pricing_strategy.optimizations.forEach(opt => {
        actions.push({
          type: 'price',
          product: opt.product,
          current: opt.current_price,
          new: opt.suggested_price,
          reason: opt.reason
        })
      })
    }
    
    // Add product-specific content improvements
    if (analysisResults.product_recommendations) {
      analysisResults.product_recommendations.forEach(rec => {
        if (rec.recommendations && rec.recommendations.length > 0) {
          rec.recommendations.forEach(r => {
            if (r.type === 'Titre' || r.type === 'Description') {
              actions.push({
                type: r.type.toLowerCase(),
                product: rec.product_name,
                issue: r.issue,
                suggestion: r.suggestion,
                priority: r.priority
              })
            }
          })
        }
      })
    }
    
    setSelectedActions(actions)
    setShowApplyModal(true)
  }

  const handleApplyActions = async () => {
    try {
      setApplyingActions(true)
      const { data: { session } } = await supabase.auth.getSession()
      
      const response = await fetch(`${API_URL}/api/ai/execute-actions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          optimization_plan: selectedActions,
          tier: subscription.plan
        })
      })
      
      const data = await response.json()
      
      if (data.success) {
        setStatus('apply-actions', 'success', 'Modifications appliquées avec succès.')
        setShowApplyModal(false)
        // Reload products to see changes
        await loadProducts()
      } else {
        setStatus('apply-actions', 'error', 'Erreur: ' + formatErrorDetail(data.detail, 'Erreur lors de l\'application'))
      }
    } catch (err) {
      console.error('Error applying actions:', err)
      setStatus('apply-actions', 'error', 'Erreur: ' + err.message)
    } finally {
      setApplyingActions(false)
    }
  }

  const handleApplyRecommendation = async (productId, recommendationType) => {
    if (!['pro', 'premium'].includes(subscription?.plan)) {
      setStatus(`rec-${productId}-${recommendationType}`, 'warning', 'Cette fonctionnalité est réservée aux plans PRO ou PREMIUM')
      return
    }

    try {
      setApplyingRecommendationId(`${productId}-${recommendationType}`)
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch(`${API_URL}/api/ai/apply-recommendation`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          product_id: productId,
          recommendation_type: recommendationType
        })
      })
      const data = await response.json()
      if (data.success) {
        setStatus(`rec-${productId}-${recommendationType}`, 'success', 'Modification appliquée sur Shopify')
        await loadProducts()
      } else {
        setStatus(`rec-${productId}-${recommendationType}`, 'error', 'Erreur: ' + formatErrorDetail(data.detail))
      }
    } catch (err) {
      setStatus(`rec-${productId}-${recommendationType}`, 'error', 'Erreur: ' + err.message)
    } finally {
      setApplyingRecommendationId(null)
    }
  }

  if (loading && !user) {
    return (
      <div className="min-h-screen bg-blue-900 flex items-center justify-center">
        <div className="text-white text-xl">Chargement...</div>
      </div>
    )
  }

  if (isProcessingPayment) {
    return (
      <div className="min-h-screen bg-blue-900 flex items-center justify-center">
        <div className="text-center text-white">
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

  if (!user || (!subscription && subscriptionMissing)) {
    return (
      <div className="min-h-screen bg-blue-900 flex items-center justify-center">
        <div className="text-center text-white">
          <div className="text-xl mb-2">Synchronisation de l’abonnement…</div>
          <div className="text-gray-300 text-sm mb-4">Si tu viens de payer, ça peut prendre quelques secondes.</div>
          <div className="flex gap-3 justify-center">
            <button onClick={initializeUser} className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-white">Réessayer</button>
            <button onClick={() => { window.location.hash = '#stripe-pricing' }} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-white">Voir les plans</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <div className="flex min-h-screen">
        <aside className="w-64 bg-gray-800 border-r border-gray-700 p-4 flex flex-col gap-4">
          <div className="flex items-center gap-3 relative">
            <button
              onClick={() => setShowProfileMenu((v) => !v)}
              className="flex items-center gap-3 hover:bg-white/10 px-3 py-2 rounded-lg transition w-full"
            >
              <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center font-bold text-lg shadow-lg overflow-hidden">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <span>{profile?.first_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'}</span>
                )}
              </div>
              <div className="text-left">
                <div className="font-semibold text-sm text-white">{profile?.full_name || user?.email}</div>
                <div className="text-xs text-gray-400">@{profile?.username || 'user'}</div>
              </div>
            </button>

            {showProfileMenu && (
              <div className="absolute top-full left-0 mt-2 w-60 bg-gray-800 border border-gray-700 rounded-lg shadow-2xl z-50">
                <div className="p-4 border-b border-gray-700">
                  <div className="font-semibold text-white">{profile?.full_name || user?.email}</div>
                  <div className="text-sm text-gray-400">{user?.email}</div>
                  <div className="mt-2 px-2 py-1 bg-yellow-600/20 text-yellow-400 text-xs rounded inline-block">
                    {formatPlan(subscription?.plan)}
                  </div>
                </div>
                <div className="p-2">
                  <button
                    onClick={() => { setShowProfileMenu(false); setShowSettingsModal(true); setSettingsTab('profile') }}
                    className="w-full text-left px-3 py-2 rounded hover:bg-gray-700 flex items-center gap-2 text-sm text-white"
                  >
                    {t('accountSettings')}
                  </button>
                  <button
                    onClick={() => { setShowProfileMenu(false); setShowPlanMenu(true) }}
                    className="w-full text-left px-3 py-2 rounded hover:bg-gray-700 flex items-center gap-2 text-sm text-white"
                  >
                    Subscription & Billing
                  </button>
                  <div className="border-t border-gray-700 my-2"></div>
                  <button
                    onClick={() => { setShowProfileMenu(false); handleLogout() }}
                    className="w-full text-left px-3 py-2 rounded hover:bg-gray-700 text-sm text-gray-300 hover:text-white"
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="bg-gray-700 rounded-lg p-3">
            <div className="text-xs text-gray-400 mb-1">Current Plan</div>
            <div className="font-bold text-yellow-400 text-lg">{formatPlan(subscription?.plan)}</div>
          </div>

          <nav className="flex flex-col gap-1">
            {[
              { key: 'overview', label: 'Vue d\'ensemble' },
              { key: 'underperforming', label: 'Produits sous-performants' },
              { key: 'action-blockers', label: 'Produits freins' },
              { key: 'action-rewrite', label: 'Réécriture continue' },
              { key: 'action-price', label: 'Optimisation prix' },
              { key: 'action-images', label: 'Images non convertissantes' },
              { key: 'action-bundles', label: 'Bundles & cross-sell' },
              { key: 'action-stock', label: 'Prévision ruptures' },
              { key: 'action-returns', label: 'Anti-retours / chargebacks' },
              { key: 'invoices', label: 'Facturation' },
              { key: 'ai', label: 'Analyse IA' },
              { key: 'analysis', label: 'Résultats' }
            ].map((item) => (
              <button
                key={item.key}
                onClick={() => setActiveTab(item.key)}
                className={`text-left px-3 py-2 rounded-lg text-sm font-semibold transition ${
                  activeTab === item.key
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="flex-1">
          <div className="min-h-full">

      {/* Plan Change Menu (kept separate for billing changes) */}
      {showPlanMenu && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center" onClick={() => setShowPlanMenu(false)}>
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 border border-gray-700" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-white mb-4">Change Your Plan</h3>
            <div className="space-y-2">
              {subscription?.plan === 'standard' && (
                <>
                  <button
                    onClick={() => handleChangePlan('pro')}
                    className="w-full text-left px-4 py-3 rounded-lg bg-gray-700 hover:bg-gray-600 text-white"
                  >
                    <div className="font-semibold">PRO - $199/mois</div>
                    <div className="text-sm text-gray-400">500 produits/mois + rapports</div>
                  </button>
                  <button
                    onClick={() => handleChangePlan('premium')}
                    className="w-full text-left px-4 py-3 rounded-lg bg-gray-700 hover:bg-gray-600 text-white"
                  >
                    <div className="font-semibold">PREMIUM - $299/mois</div>
                    <div className="text-sm text-gray-400">Illimité + actions auto</div>
                  </button>
                </>
              )}
              {subscription?.plan === 'pro' && (
                <button
                  onClick={() => handleChangePlan('premium')}
                  className="w-full text-left px-4 py-3 rounded-lg bg-gray-700 hover:bg-gray-600 text-white"
                >
                  <div className="font-semibold">PREMIUM - $299/mois</div>
                  <div className="text-sm text-gray-400">Illimité + actions auto</div>
                </button>
              )}
              {subscription?.plan === 'premium' && (
                <div className="px-4 py-3 text-gray-400">You're already on PREMIUM</div>
              )}
              <div className="border-t border-gray-600 pt-2 mt-2">
                <button
                  onClick={() => { setShowPlanMenu(false); window.location.hash = '#stripe-pricing' }}
                  className="w-full text-center px-4 py-2 rounded-lg text-blue-400 hover:bg-gray-700"
                >
                  View All Plans
                </button>
              </div>
            </div>
            {renderStatus('change-plan')}
          </div>
        </div>
      )}

        {/* Post-payment success banner */}
        {typeof window !== 'undefined' && (window.location.hash.includes('success=true') || new URLSearchParams(window.location.search).has('session_id')) && (
          <div className="max-w-7xl mx-auto px-6 mb-4">
            <div className="bg-green-800 border border-green-600 text-green-100 p-4 rounded-lg flex items-center justify-between">
              <div>
                <p className="font-bold">Paiement confirmé — abonnement activé</p>
                <p className="text-sm opacity-90">Ton plan est appliqué et disponible dans le dashboard.</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => { window.location.hash = '#/' }}
                  className="bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2 rounded-lg"
                >
                  Retour à l'accueil
                </button>
                <button
                  onClick={() => { window.location.hash = '#dashboard' }}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-lg"
                >
                  Aller au dashboard
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="max-w-7xl mx-auto p-6">

        {error && (
          <div className="bg-gray-800 border border-yellow-700 text-yellow-200 p-4 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 space-y-6">
            <div className="bg-gradient-to-br from-gray-800 via-gray-900 to-black border border-yellow-700/40 rounded-2xl p-6">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-yellow-300/70">Performance</p>
                  <h3 className="text-2xl font-bold text-white mt-2">Revenus & commandes en temps réel</h3>
                  <p className="text-sm text-gray-400 mt-2">Source Shopify · {analyticsData?.range || analyticsRange} · {getRangeLabel(analyticsData?.range || analyticsRange)}</p>
                </div>
                <div className="flex items-center gap-2 bg-gray-800/70 border border-gray-700 rounded-full px-2 py-1">
                  {['7d', '30d', '90d', '365d'].map((range) => (
                    <button
                      key={range}
                      onClick={() => setAnalyticsRange(range)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold transition ${analyticsRange === range ? 'bg-yellow-600 text-black' : 'text-gray-300 hover:text-white'}`}
                    >
                      {range}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-900/70 border border-gray-700 rounded-xl p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Revenus</p>
                  <p className="text-2xl font-bold text-white mt-2">
                    {analyticsLoading ? 'Chargement...' : formatCurrency(analyticsData?.totals?.revenue, analyticsData?.currency || 'EUR')}
                  </p>
                </div>
                <div className="bg-gray-900/70 border border-gray-700 rounded-xl p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Commandes</p>
                  <p className="text-2xl font-bold text-white mt-2">
                    {analyticsLoading ? '...' : formatCompactNumber(analyticsData?.totals?.orders || 0)}
                  </p>
                </div>
                <div className="bg-gray-900/70 border border-gray-700 rounded-xl p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-gray-500">AOV</p>
                  <p className="text-2xl font-bold text-white mt-2">
                    {analyticsLoading ? '...' : formatCurrency(analyticsData?.totals?.aov, analyticsData?.currency || 'EUR')}
                  </p>
                </div>
              </div>

              <div className="mt-6 bg-gray-900/60 border border-gray-800 rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Ventes dans le temps</p>
                  {analyticsError && <p className="text-xs text-yellow-400">{analyticsError}</p>}
                </div>
                <div className="mt-3">
                  {analyticsLoading ? (
                    <div className="text-sm text-gray-500 py-6">Chargement des ventes...</div>
                  ) : analyticsData?.series?.length ? (
                    <svg viewBox="0 0 520 140" className="w-full h-32">
                      <polyline
                        fill="none"
                        stroke="#facc15"
                        strokeWidth="3"
                        points={buildSparklinePoints(analyticsData.series)}
                      />
                    </svg>
                  ) : shopifyUrl ? (
                    <div className="text-sm text-gray-500 py-6">Aucune vente sur la période sélectionnée.</div>
                  ) : (
                    <div className="text-sm text-gray-500 py-6">Connecte Shopify pour afficher les ventes.</div>
                  )}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
              <h3 className="text-gray-400 text-sm uppercase mb-2">Plan Actif</h3>
              <div className="flex items-center justify-between">
                <p className="text-white text-2xl font-bold">{formatPlan(subscription?.plan)}</p>
                {subscription?.plan !== 'premium' && (
                  <button
                    onClick={handleUpgrade}
                    className="ml-4 bg-yellow-600 hover:bg-yellow-500 text-black text-sm font-bold px-3 py-1 rounded-lg"
                  >
                    Upgrade
                  </button>
                )}
              </div>
              <p className="text-gray-400 text-sm mt-2">Depuis: {formatDate(subscription?.started_at)}</p>
              {subscription?.plan === 'standard' && (
                <p className="text-gray-400 text-xs mt-1">Fonctionnalités limitées — Upgrade vers PRO pour plus.</p>
              )}
              {subscription?.plan === 'pro' && (
                <p className="text-gray-400 text-xs mt-1">Bon choix — Upgrade vers PREMIUM pour tout débloquer.</p>
              )}
              {renderStatus('upgrade')}
            </div>
            
            <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
              <h3 className="text-gray-400 text-sm uppercase mb-2">Produits</h3>
              <p className="text-white text-2xl font-bold">{subscription?.capabilities?.product_limit === null ? '∞' : subscription?.capabilities?.product_limit || 50}</p>
              <p className="text-gray-400 text-sm mt-2">Limite mensuelle</p>
            </div>
            
            <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
              <h3 className="text-gray-400 text-sm uppercase mb-2">Fonctionnalités</h3>
              <ul className="text-sm space-y-1">
                {getPlanFeatures(subscription?.plan).map((feature, i) => (
                  <li key={i} className="text-gray-300">• {feature}</li>
                ))}
              </ul>
            </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[
                {
                  label: 'Revenus',
                  value: analyticsLoading ? '...' : formatCurrency(analyticsData?.totals?.revenue, analyticsData?.currency || 'EUR'),
                  hint: analyticsRange
                },
                {
                  label: 'Commandes',
                  value: analyticsLoading ? '...' : formatCompactNumber(analyticsData?.totals?.orders || 0),
                  hint: 'volume'
                },
                {
                  label: 'AOV',
                  value: analyticsLoading ? '...' : formatCurrency(analyticsData?.totals?.aov, analyticsData?.currency || 'EUR'),
                  hint: 'panier moyen'
                },
                {
                  label: 'Produits actifs',
                  value: `${products?.length || 0}`,
                  hint: 'catalogue'
                }
              ].map((item) => (
                <div key={item.label} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                  <p className="text-xs uppercase tracking-[0.2em] text-gray-400">{item.label}</p>
                  <p className="text-2xl font-bold text-white mt-2">{item.value}</p>
                  <p className="text-xs text-gray-500 mt-1">{item.hint}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
                <h4 className="text-gray-400 text-xs uppercase tracking-[0.2em] mb-3">Ops Center</h4>
                <p className="text-white text-lg font-semibold mb-2">Flux Shopify unifié</p>
                <p className="text-gray-400 text-sm">Suivi des produits, erreurs et actions en temps réel depuis un seul hub.</p>
              </div>
              <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
                <h4 className="text-gray-400 text-xs uppercase tracking-[0.2em] mb-3">Insights</h4>
                <p className="text-white text-lg font-semibold mb-2">Priorités IA quotidiennes</p>
                <p className="text-gray-400 text-sm">Optimisations classées par impact, effort et urgence business.</p>
              </div>
              <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
                <h4 className="text-gray-400 text-xs uppercase tracking-[0.2em] mb-3">Automation</h4>
                <p className="text-white text-lg font-semibold mb-2">Scénarios premium</p>
                <p className="text-gray-400 text-sm">Automatisations planifiées sur prix, contenu et collections.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
                <h4 className="text-gray-400 text-xs uppercase tracking-[0.2em] mb-4">Activité récente</h4>
                <ul className="space-y-3 text-sm text-gray-300">
                  <li className="flex items-center justify-between">
                    <span>Optimisation prix</span>
                    <span className="text-gray-500">Aujourd’hui</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>Descriptions IA</span>
                    <span className="text-gray-500">Hier</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>Analyse catalogue complet</span>
                    <span className="text-gray-500">Il y a 2 jours</span>
                  </li>
                </ul>
              </div>
              <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
                <h4 className="text-gray-400 text-xs uppercase tracking-[0.2em] mb-4">File d’exécution</h4>
                <div className="space-y-3">
                  {[
                    { label: 'Optimisation titres', status: 'En cours' },
                    { label: 'Audit prix', status: 'Programmé' },
                    { label: 'Rapport hebdo', status: 'Programmé' }
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between text-sm text-gray-300">
                      <span>{row.label}</span>
                      <span className="text-gray-500">{row.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
                <h4 className="text-gray-400 text-xs uppercase tracking-[0.2em] mb-4">Pipeline IA</h4>
                <div className="space-y-3 text-sm">
                  {[
                    { label: 'Titres', value: '—', status: 'Actif' },
                    { label: 'Descriptions', value: '—', status: 'Programmé' },
                    { label: 'Prix', value: '—', status: 'En cours' },
                    { label: 'Images', value: '—', status: 'Bloqué' }
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between text-gray-300">
                      <span>{row.label}</span>
                      <span className="text-gray-500">{row.value} • {row.status}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
                <h4 className="text-gray-400 text-xs uppercase tracking-[0.2em] mb-4">Alertes critiques</h4>
                <ul className="space-y-3 text-sm text-gray-300">
                  <li className="flex items-center justify-between">
                    <span>Produits à prix zéro</span>
                    <span className="text-red-300">2</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>Stock en rupture</span>
                    <span className="text-yellow-300">4</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>SEO faible</span>
                    <span className="text-yellow-300">11</span>
                  </li>
                </ul>
              </div>
              <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
                <h4 className="text-gray-400 text-xs uppercase tracking-[0.2em] mb-4">Health Score</h4>
                <p className="text-3xl font-bold text-white">92</p>
                <p className="text-xs text-gray-500 mt-1">Global shop score</p>
                <div className="mt-4 space-y-2 text-sm text-gray-300">
                  <div className="flex items-center justify-between"><span>Ventes</span><span className="text-gray-500">A</span></div>
                  <div className="flex items-center justify-between"><span>Catalogue</span><span className="text-gray-500">A-</span></div>
                  <div className="flex items-center justify-between"><span>Contenu</span><span className="text-gray-500">B+</span></div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <h4 className="text-gray-400 text-xs uppercase tracking-[0.2em] mb-4">Répartition revenus</h4>
                <div className="space-y-3 text-sm text-gray-300">
                  <div className="flex items-center justify-between"><span>Top 10 produits</span><span className="text-gray-500">62%</span></div>
                  <div className="flex items-center justify-between"><span>Collections long tail</span><span className="text-gray-500">28%</span></div>
                  <div className="flex items-center justify-between"><span>Nouvelle saison</span><span className="text-gray-500">10%</span></div>
                </div>
              </div>
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <h4 className="text-gray-400 text-xs uppercase tracking-[0.2em] mb-4">Segmentation clients</h4>
                <div className="space-y-3 text-sm text-gray-300">
                  <div className="flex items-center justify-between"><span>Nouveaux</span><span className="text-gray-500">46%</span></div>
                  <div className="flex items-center justify-between"><span>Récurrents</span><span className="text-gray-500">38%</span></div>
                  <div className="flex items-center justify-between"><span>VIP</span><span className="text-gray-500">16%</span></div>
                </div>
              </div>
            </div>
            </div>

            <div className="space-y-6">
              <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700">
                <h4 className="text-gray-400 text-xs uppercase tracking-[0.2em] mb-3">Executive Summary</h4>
                <p className="text-white text-xl font-semibold mb-2">État global du compte</p>
                <p className="text-gray-300 text-sm">Stabilité excellente, 2 alertes à corriger pour maximiser le ROI.</p>
                <div className="mt-4 space-y-2 text-sm text-gray-300">
                  <div className="flex items-center justify-between">
                    <span>Plan</span>
                    <span className="text-gray-400">{formatPlan(subscription?.plan)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Boutique</span>
                    <span className="text-gray-400">{shopifyUrl || 'Non connectée'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Dernière synchro</span>
                    <span className="text-gray-400">Aujourd’hui</span>
                  </div>
                </div>
              </div>
              <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700">
                <h4 className="text-gray-400 text-xs uppercase tracking-[0.2em] mb-3">AI Radar</h4>
                <div className="space-y-3 text-sm text-gray-300">
                  <div className="flex items-center justify-between">
                    <span>Opportunités prix</span>
                    <span className="text-gray-500">—</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Descriptions à revoir</span>
                    <span className="text-gray-500">—</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Images critiques</span>
                    <span className="text-gray-500">—</span>
                  </div>
                </div>
              </div>
              <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700">
                <h4 className="text-gray-400 text-xs uppercase tracking-[0.2em] mb-3">Next Moves</h4>
                <ul className="space-y-3 text-sm text-gray-300">
                  <li className="flex items-center justify-between">
                    <span>Relancer les prix</span>
                    <span className="text-gray-500">À planifier</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>Optimiser les titres</span>
                    <span className="text-gray-500">À planifier</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>Créer rapport hebdo</span>
                    <span className="text-gray-500">Automatique</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Invoices Tab */}
        {activeTab === 'invoices' && (
          <div className="space-y-6">
            <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-gray-400">Facturation</p>
                  <h2 className="text-white text-2xl font-bold mt-2">Créer une facture Shopify</h2>
                  <p className="text-sm text-gray-400 mt-2">Facturation manuelle: génère un Draft Order et envoie la facture au client.</p>
                </div>
                <button
                  onClick={loadCustomers}
                  className="px-4 py-2 rounded-lg bg-gray-700 text-white hover:bg-gray-600 text-sm"
                >
                  {customersLoading ? 'Chargement...' : 'Rafraîchir clients'}
                </button>
              </div>

              <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
                  <label className="block text-gray-400 text-xs uppercase tracking-[0.2em] mb-2">Client</label>
                  <select
                    value={invoiceCustomerId}
                    onChange={(e) => setInvoiceCustomerId(e.target.value)}
                    className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg border border-gray-700"
                  >
                    <option value="">Sélectionner un client</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {(customer.first_name || customer.last_name)
                          ? `${customer.first_name || ''} ${customer.last_name || ''}`.trim()
                          : (customer.email || `Client ${customer.id}`)}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-2">Ou saisir un email ci-dessous</p>
                  <input
                    type="email"
                    value={invoiceCustomerEmail}
                    onChange={(e) => setInvoiceCustomerEmail(e.target.value)}
                    placeholder="client@exemple.com"
                    className="mt-2 w-full bg-gray-800 text-white px-3 py-2 rounded-lg border border-gray-700"
                  />
                </div>

                <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
                  <label className="block text-gray-400 text-xs uppercase tracking-[0.2em] mb-2">Produit</label>
                  <select
                    value={invoiceProductId}
                    onChange={(e) => setInvoiceProductId(e.target.value)}
                    className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg border border-gray-700"
                  >
                    <option value="">Sélectionner un produit</option>
                    {(products || []).map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.title}
                      </option>
                    ))}
                  </select>
                  <div className="mt-3 flex items-center gap-3">
                    <input
                      type="number"
                      min="1"
                      value={invoiceQuantity}
                      onChange={(e) => setInvoiceQuantity(e.target.value)}
                      className="w-24 bg-gray-800 text-white px-3 py-2 rounded-lg border border-gray-700"
                    />
                    <button
                      onClick={addInvoiceItem}
                      className="flex-1 bg-yellow-600 hover:bg-yellow-500 text-black font-semibold py-2 rounded-lg"
                    >
                      Ajouter
                    </button>
                  </div>
                </div>

                <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
                  <label className="block text-gray-400 text-xs uppercase tracking-[0.2em] mb-2">Note</label>
                  <textarea
                    value={invoiceNote}
                    onChange={(e) => setInvoiceNote(e.target.value)}
                    placeholder="Message ou conditions"
                    className="w-full h-28 bg-gray-800 text-white px-3 py-2 rounded-lg border border-gray-700"
                  />
                </div>
              </div>
              {renderStatus('invoice')}
            </div>

            <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700">
              <h3 className="text-white text-lg font-semibold mb-4">Lignes de facture</h3>
              {invoiceItems.length === 0 ? (
                <p className="text-sm text-gray-500">Ajoute des produits pour générer une facture.</p>
              ) : (
                <div className="space-y-3">
                  {invoiceItems.map((item, index) => (
                    <div key={`${item.variant_id}-${index}`} className="flex items-center justify-between bg-gray-900 border border-gray-700 rounded-xl px-4 py-3">
                      <div>
                        <p className="text-white text-sm font-semibold">{item.title}</p>
                        <p className="text-xs text-gray-500">Qté: {item.quantity}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <p className="text-sm text-gray-300">{formatCurrency(item.price, analyticsData?.currency || 'EUR')}</p>
                        <button
                          onClick={() => removeInvoiceItem(index)}
                          className="text-xs text-gray-400 hover:text-white"
                        >
                          Retirer
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="text-sm text-gray-400">
                  {invoiceItems.length > 0 && (
                    <span>{invoiceItems.length} ligne(s) · Total {formatCurrency(invoiceItems.reduce((acc, item) => acc + item.price * item.quantity, 0), analyticsData?.currency || 'EUR')}</span>
                  )}
                </div>
                <button
                  onClick={submitInvoice}
                  className="bg-yellow-600 hover:bg-yellow-500 text-black font-semibold px-6 py-3 rounded-lg"
                >
                  {invoiceSubmitting ? 'Création...' : 'Créer la facture'}
                </button>
              </div>
              {invoiceResult?.draft_order?.invoice_url && (
                <div className="mt-4 text-sm text-gray-300 space-y-1">
                  <div>
                    Facture créée: <a className="text-yellow-400 hover:underline" href={invoiceResult.draft_order.invoice_url} target="_blank" rel="noreferrer">Voir la facture</a>
                  </div>
                  <div>
                    Total: {formatCurrency(invoiceResult.draft_order.total_price, analyticsData?.currency || 'EUR')}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Underperforming Products Tab */}
        {activeTab === 'underperforming' && (
          <div className="space-y-6">
            <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-gray-400">Section 1</p>
                  <h3 className="text-white text-2xl font-bold mt-2">Produits sous-performants</h3>
                  <p className="text-sm text-gray-400 mt-1">Analyse automatique des ventes Shopify et actions proposées.</p>
                </div>
                <div className="text-xs text-gray-500">Signaux: {getInsightCount(blockersData?.blockers)}</div>
              </div>

              {blockersData?.notes?.length > 0 && (
                <div className="mt-4 text-xs text-gray-500 space-y-1">
                  {blockersData.notes.map((note, idx) => (
                    <div key={idx}>• {note}</div>
                  ))}
                </div>
              )}

              <div className="mt-5 overflow-hidden border border-gray-700 rounded-xl">
                <div className="grid grid-cols-12 gap-2 bg-gray-900/70 text-xs uppercase tracking-[0.2em] text-gray-500 px-4 py-3">
                  <div className="col-span-6">Produit</div>
                  <div className="col-span-3">Commandes</div>
                  <div className="col-span-3">Actions</div>
                </div>
                {blockersLoading ? (
                  <div className="px-4 py-4 text-sm text-gray-500">Chargement...</div>
                ) : (!blockersData?.blockers || blockersData.blockers.length === 0) ? (
                  <div className="px-4 py-4 text-sm text-gray-500">Aucun produit frein détecté sur cette période.</div>
                ) : (
                  blockersData.blockers.slice(0, 8).map((item) => (
                    <div key={item.product_id || item.title} className="grid grid-cols-12 gap-2 px-4 py-3 border-t border-gray-800 text-sm text-gray-200">
                      <div className="col-span-6">
                        <div className="font-semibold text-white">{item.title || 'Produit'}</div>
                        <div className="text-xs text-gray-500">Score: {item.score ?? '—'} • Stock: {item.inventory ?? 0}</div>
                      </div>
                      <div className="col-span-3 text-gray-300">
                        <div>{item.orders || 0}</div>
                        <div className="text-xs text-gray-500">CA: {formatCurrency(item.revenue, analyticsData?.currency || 'EUR')}</div>
                      </div>
                      <div className="col-span-3 flex flex-wrap gap-2">
                        {item.actions?.length ? item.actions.map((action) => (
                          action.can_apply ? (
                            <button
                              key={action.type}
                              onClick={() => handleApplyBlockerAction(item.product_id, action)}
                              className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-xs text-white"
                              disabled={applyingBlockerActionId === `${item.product_id}-${action.type}`}
                              title={action.reason || action.label}
                            >
                              {action.label}
                            </button>
                          ) : (
                            <span key={action.type} className="px-2 py-1 rounded bg-gray-900/70 text-xs text-gray-400" title={action.reason || action.label}>
                              {action.label}
                            </span>
                          )
                        )) : (
                          <span className="text-xs text-gray-500">Aucune action</span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
              {renderStatus('blockers')}
            </div>
          </div>
        )}

        {activeTab === 'action-blockers' && (
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 space-y-6">
            <div>
              <h2 className="text-white text-xl font-bold mb-2">Analyser les produits freins</h2>
              <p className="text-gray-400">Détecte les produits qui cassent la conversion et propose des actions.</p>
            </div>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <p className="text-sm text-gray-400">{getInsightCount(blockersData?.blockers)} produits analysés</p>
              <button
                onClick={() => runActionAnalysis('action-blockers')}
                disabled={blockersLoading}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg disabled:opacity-50"
              >
                {blockersLoading ? 'Analyse en cours...' : 'Analyser les produits freins'}
              </button>
            </div>
            {renderStatus('action-blockers')}
            <div className="space-y-3">
              {!blockersLoading && (!blockersData?.blockers || blockersData.blockers.length === 0) ? (
                <p className="text-sm text-gray-500">Aucun produit frein détecté.</p>
              ) : (
                blockersData?.blockers?.slice(0, 8).map((item) => (
                  <div key={item.product_id || item.title} className="bg-gray-900/70 border border-gray-700 rounded-lg p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-white font-semibold">{item.title || 'Produit'}</p>
                        <p className="text-xs text-gray-500">Commandes: {item.orders || 0} • CA: {formatCurrency(item.revenue, analyticsData?.currency || 'EUR')}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {item.actions?.length ? item.actions.map((action) => (
                          action.can_apply ? (
                            <button
                              key={action.type}
                              onClick={() => handleApplyBlockerAction(item.product_id, action)}
                              className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-xs text-white"
                              disabled={applyingBlockerActionId === `${item.product_id}-${action.type}`}
                              title={action.reason || action.label}
                            >
                              {action.label}
                            </button>
                          ) : (
                            <span key={action.type} className="px-2 py-1 rounded bg-gray-900/70 text-xs text-gray-400" title={action.reason || action.label}>
                              {action.label}
                            </span>
                          )
                        )) : (
                          <span className="text-xs text-gray-500">Aucune action</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'action-rewrite' && (
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 space-y-6">
            <div>
              <h2 className="text-white text-xl font-bold mb-2">Réécriture intelligente</h2>
              <p className="text-gray-400">Réécrit titres et descriptions selon la performance réelle.</p>
            </div>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <p className="text-sm text-gray-400">{getInsightCount(insightsData?.rewrite_opportunities)} produits analysés</p>
              <button
                onClick={() => runActionAnalysis('action-rewrite')}
                disabled={insightsLoading}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg disabled:opacity-50"
              >
                {insightsLoading ? 'Analyse en cours...' : 'Lancer l\'analyse IA'}
              </button>
            </div>
            {renderStatus('action-rewrite')}
            {insightsData?.rewrite_ai?.notes?.length ? (
              <div className="text-xs text-amber-300 bg-amber-900/20 border border-amber-700/40 rounded px-3 py-2">
                {insightsData.rewrite_ai.notes.join(' · ')}
              </div>
            ) : null}
            <div className="space-y-3">
              {!insightsLoading && (!insightsData?.rewrite_opportunities || insightsData.rewrite_opportunities.length === 0) ? (
                <p className="text-sm text-gray-500">Aucun signal détecté.</p>
              ) : (
                insightsData?.rewrite_opportunities?.slice(0, 8).map((item, index) => (
                  <div key={item.product_id || index} className="bg-gray-900/70 border border-gray-700 rounded-lg p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-white font-semibold">{item.title || 'Produit'}</p>
                        <p className="text-xs text-gray-500">{(item.reasons || []).join(', ')}</p>
                        {item.suggested_title && (
                          <p className="mt-2 text-xs text-gray-300">
                            <span className="text-gray-500">Titre suggéré:</span> {item.suggested_title}
                          </p>
                        )}
                        {item.suggested_description && (
                          <p className="mt-2 text-xs text-gray-400 line-clamp-3">
                            <span className="text-gray-500">Description suggérée:</span> {item.suggested_description}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {(item.recommendations || []).includes('title') && (
                          <button
                            onClick={() => handleApplyBlockerAction(item.product_id, { type: 'title' })}
                            className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-xs text-white"
                            disabled={applyingBlockerActionId === `${item.product_id}-title`}
                          >
                            Titre
                          </button>
                        )}
                        {(item.recommendations || []).includes('description') && (
                          <button
                            onClick={() => handleApplyBlockerAction(item.product_id, { type: 'description' })}
                            className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-xs text-white"
                            disabled={applyingBlockerActionId === `${item.product_id}-description`}
                          >
                            Description
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'action-price' && (
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 space-y-6">
            <div>
              <h2 className="text-white text-xl font-bold mb-2">Optimisation dynamique des prix</h2>
              <p className="text-gray-400">Ajuste les prix selon élasticité et performance.</p>
            </div>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <p className="text-sm text-gray-400">{getInsightCount(insightsData?.price_opportunities)} opportunités</p>
              <button
                onClick={() => runActionAnalysis('action-price')}
                disabled={insightsLoading}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg disabled:opacity-50"
              >
                {insightsLoading ? 'Analyse en cours...' : 'Lancer l\'analyse IA'}
              </button>
            </div>
            {renderStatus('action-price')}
            <div className="space-y-3">
              {!insightsLoading && (!insightsData?.price_opportunities || insightsData.price_opportunities.length === 0) ? (
                <p className="text-sm text-gray-500">Aucune opportunité détectée.</p>
              ) : (
                insightsData?.price_opportunities?.slice(0, 8).map((item, index) => (
                  <div key={item.product_id || index} className="bg-gray-900/70 border border-gray-700 rounded-lg p-4">
                    <p className="text-white font-semibold">{item.title || item.product_id}</p>
                    <p className="text-xs text-gray-500">{item.suggestion || 'Ajuster le prix'}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'action-images' && (
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 space-y-6">
            <div>
              <h2 className="text-white text-xl font-bold mb-2">Images qui ne convertissent pas</h2>
              <p className="text-gray-400">Analyse des images produits et recommandations.</p>
            </div>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <p className="text-sm text-gray-400">{getInsightCount(insightsData?.image_risks)} produits analysés</p>
              <button
                onClick={() => runActionAnalysis('action-images')}
                disabled={insightsLoading}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg disabled:opacity-50"
              >
                {insightsLoading ? 'Analyse en cours...' : 'Lancer l\'analyse IA'}
              </button>
            </div>
            {renderStatus('action-images')}
            <div className="space-y-3">
              {!insightsLoading && (!insightsData?.image_risks || insightsData.image_risks.length === 0) ? (
                <p className="text-sm text-gray-500">Aucun signal détecté.</p>
              ) : (
                insightsData?.image_risks?.slice(0, 8).map((item, index) => (
                  <div key={item.product_id || index} className="bg-gray-900/70 border border-gray-700 rounded-lg p-4">
                    <p className="text-white font-semibold">Produit #{item.product_id}</p>
                    <p className="text-xs text-gray-500">
                      {item.images_count} images{item.missing_alt ? ' • alt manquant' : ''}
                      {item.view_to_cart_rate !== null && item.view_to_cart_rate !== undefined ? ` • v→panier ${Math.round(item.view_to_cart_rate * 100)}%` : ''}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'action-bundles' && (
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 space-y-6">
            <div>
              <h2 className="text-white text-xl font-bold mb-2">Bundles & cross-sell</h2>
              <p className="text-gray-400">Packs basés sur les commandes passées pour booster l’AOV.</p>
            </div>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <p className="text-sm text-gray-400">{getInsightCount(insightsData?.bundle_suggestions)} suggestions</p>
              <button
                onClick={() => runActionAnalysis('action-bundles')}
                disabled={insightsLoading}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg disabled:opacity-50"
              >
                {insightsLoading ? 'Analyse en cours...' : 'Lancer l\'analyse IA'}
              </button>
            </div>
            {renderStatus('action-bundles')}
            <div className="space-y-3">
              {!insightsLoading && (!insightsData?.bundle_suggestions || insightsData.bundle_suggestions.length === 0) ? (
                <p className="text-sm text-gray-500">Aucune suggestion détectée.</p>
              ) : (
                insightsData?.bundle_suggestions?.slice(0, 8).map((item, index) => (
                  <div key={index} className="bg-gray-900/70 border border-gray-700 rounded-lg p-4">
                    <p className="text-white font-semibold">
                      {item.titles?.[0] || `#${item.pair?.[0] || 'A'}`} + {item.titles?.[1] || `#${item.pair?.[1] || 'B'}`}
                    </p>
                    <p className="text-xs text-gray-500">{item.count || 0} commandes</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'action-stock' && (
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 space-y-6">
            <div>
              <h2 className="text-white text-xl font-bold mb-2">Prévision des ruptures</h2>
              <p className="text-gray-400">Estime les jours restants selon les ventes actuelles.</p>
            </div>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <p className="text-sm text-gray-400">{getInsightCount(insightsData?.stock_risks)} alertes</p>
              <button
                onClick={() => runActionAnalysis('action-stock')}
                disabled={insightsLoading}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg disabled:opacity-50"
              >
                {insightsLoading ? 'Analyse en cours...' : 'Lancer l\'analyse IA'}
              </button>
            </div>
            {renderStatus('action-stock')}
            <div className="space-y-3">
              {!insightsLoading && (!insightsData?.stock_risks || insightsData.stock_risks.length === 0) ? (
                <p className="text-sm text-gray-500">Aucun risque détecté.</p>
              ) : (
                insightsData?.stock_risks?.slice(0, 8).map((item, index) => (
                  <div key={item.product_id || index} className="bg-gray-900/70 border border-gray-700 rounded-lg p-4">
                    <p className="text-white font-semibold">{item.title || item.product_id}</p>
                    <p className="text-xs text-gray-500">{item.days_cover} jours restants</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'action-returns' && (
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 space-y-6">
            <div>
              <h2 className="text-white text-xl font-bold mb-2">Anti-retours / chargebacks</h2>
              <p className="text-gray-400">Détecte les produits à risque de retours ou litiges.</p>
            </div>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <p className="text-sm text-gray-400">{getInsightCount(insightsData?.return_risks)} alertes</p>
              <button
                onClick={() => runActionAnalysis('action-returns')}
                disabled={insightsLoading}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg disabled:opacity-50"
              >
                {insightsLoading ? 'Analyse en cours...' : 'Lancer l\'analyse IA'}
              </button>
            </div>
            {renderStatus('action-returns')}
            <div className="space-y-3">
              {!insightsLoading && (!insightsData?.return_risks || insightsData.return_risks.length === 0) ? (
                <p className="text-sm text-gray-500">Aucun signal détecté.</p>
              ) : (
                insightsData?.return_risks?.slice(0, 8).map((item, index) => (
                  <div key={item.product_id || index} className="bg-gray-900/70 border border-gray-700 rounded-lg p-4">
                    <p className="text-white font-semibold">{item.title || item.product_id}</p>
                    <p className="text-xs text-gray-500">
                      {item.refunds || 0} retours{item.refund_rate !== null && item.refund_rate !== undefined ? ` • taux ${Math.round(item.refund_rate * 100)}%` : ''}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}


        {/* AI Analysis Tab */}
        {activeTab === 'ai' && (
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h2 className="text-white text-xl font-bold mb-4">Analyser avec l'IA</h2>
            
            {products && products.length > 0 ? (
              <div>
                <p className="text-gray-400 mb-4">{products.length} produits à analyser</p>
                <button
                  onClick={analyzeProducts}
                  disabled={loading}
                  className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg disabled:opacity-50"
                >
                  {loading ? 'Analyse en cours...' : 'Lancer l\'analyse IA'}
                </button>
                {renderStatus('analyze')}
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
                {/* Auto-Apply Actions Button (Pro/Premium only) */}
                {(subscription?.plan === 'pro' || subscription?.plan === 'premium') && (
                  <div className="bg-blue-900 border-2 border-blue-700 rounded-lg p-6 shadow-xl">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-white text-xl font-bold mb-2">Actions Automatiques IA</h3>
                        <p className="text-green-200 text-sm">L'IA peut appliquer automatiquement les optimisations recommandées à votre boutique Shopify.</p>
                        {subscription?.plan === 'premium' && (
                          <p className="text-yellow-300 text-xs mt-1">Premium: Modifications automatiques sans limites</p>
                        )}
                      </div>
                      <button
                        onClick={prepareActionsForApply}
                        className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg shadow-lg transition flex items-center gap-2"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Appliquer les recommandations
                      </button>
                    </div>
                  </div>
                )}
                {/* Vue d'ensemble */}
                <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                  <h2 className="text-white text-2xl font-bold mb-4">Vue d'ensemble de votre boutique</h2>
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
                  <div className="bg-gray-800 border-2 border-yellow-700 rounded-lg p-6">
                    <h2 className="text-white text-2xl font-bold mb-4">Points critiques à corriger MAINTENANT</h2>
                    <div className="space-y-4">
                      {analysisResults.critical_issues.map((issue, idx) => (
                        <div key={idx} className="bg-gray-900 p-4 rounded-lg">
                          <div className="flex items-start gap-3">
                            <div className="flex-1">
                              <p className="text-yellow-300 font-bold text-sm mb-1">SÉVÉRITÉ: {issue.severity}</p>
                              <p className="text-white font-bold mb-2">{issue.issue}</p>
                              <p className="text-gray-300 text-sm mb-2">{issue.impact}</p>
                              <div className="bg-gray-800 p-3 rounded mt-2">
                                <p className="text-white font-bold text-sm">Action immédiate:</p>
                                <p className="text-gray-200 text-sm mt-1">{issue.action}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions immédiates */}
                <div className="bg-blue-900 border-2 border-blue-700 rounded-lg p-6">
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
                          <span className="text-gray-300">Temps: {action.time_required}</span>
                          <span className="text-yellow-300">Impact: {action.expected_impact}</span>
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
                            rec.priority === 'HAUTE' ? 'bg-yellow-700' : 
                            rec.priority === 'MOYENNE' ? 'bg-blue-700' : 'bg-gray-700'
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
                          <p className="text-blue-400 text-sm font-bold">Action:</p>
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
                          <p className="text-green-400 text-sm font-bold">{opp.expected_impact}</p>
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
                            analysisResults.content_improvements?.overall_score >= 60 ? 'bg-yellow-500' : 'bg-blue-700'
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
                                issue.priority === 'CRITIQUE' ? 'bg-yellow-700' : 
                                issue.priority === 'HAUTE' ? 'bg-blue-700' : 'bg-gray-700'
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
                      <div key={idx} className="bg-gray-900 p-4 rounded-lg border border-gray-700">
                        <p className="text-green-400 font-bold mb-2">{win.action}</p>
                        {win.example && <p className="text-gray-300 text-sm mb-2">Exemple: {win.example}</p>}
                        <p className="text-green-300 text-sm">{win.impact}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Stratégies de vente */}
                <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                  <h2 className="text-white text-2xl font-bold mb-4">Stratégies Upsell & Cross-sell</h2>
                  
                  {analysisResults.sales_strategies?.upsell_opportunities?.length > 0 && (
                    <>
                      <h3 className="text-white font-bold mb-3">Opportunités d'Upsell:</h3>
                      <div className="space-y-3 mb-6">
                        {analysisResults.sales_strategies.upsell_opportunities.map((upsell, idx) => (
                          <div key={idx} className="bg-gray-900 p-4 rounded-lg border border-gray-700">
                            <h4 className="text-yellow-400 font-bold mb-2">{upsell.strategy}</h4>
                            <p className="text-gray-300 text-sm mb-2">{upsell.description}</p>
                            {upsell.example && <p className="text-gray-300 text-sm mb-2">Exemple: {upsell.example}</p>}
                            <p className="text-green-400 text-sm font-bold">{upsell.expected_impact}</p>
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
                          <div key={idx} className="bg-gray-900 p-4 rounded-lg border border-gray-700">
                            <h4 className="text-yellow-400 font-bold mb-2">{bundle.bundle_name} (-{bundle.discount})</h4>
                            <div className="mb-2">
                              <p className="text-gray-400 text-sm mb-1">Produits inclus:</p>
                              <ul className="list-disc list-inside text-gray-300 text-sm">
                                {bundle.products?.map((p, pidx) => (
                                  <li key={pidx}>{p}</li>
                                ))}
                              </ul>
                            </div>
                            <p className="text-gray-300 text-sm mb-2">{bundle.positioning}</p>
                            <p className="text-green-400 text-sm font-bold">{bundle.expected_impact}</p>
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
                <div className="bg-blue-900 rounded-lg p-6 border border-blue-700">
                  <h2 className="text-white text-2xl font-bold mb-4">Opportunités de croissance</h2>
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
                                    recItem.priority === 'Critique' ? 'bg-yellow-700' :
                                    recItem.priority === 'Haute' ? 'bg-blue-700' : 'bg-gray-700'
                                  }`}>
                                    {recItem.priority}
                                  </span>
                                  <span className="text-blue-400 font-bold text-sm">{recItem.type}</span>
                                </div>
                                <p className="text-gray-300 text-sm mb-1">{recItem.issue}</p>
                                <p className="text-green-300 text-sm">{recItem.suggestion}</p>
                                <div className="mt-3 flex items-center gap-2">
                                  {['Titre', 'Description', 'Prix'].includes(recItem.type) ? (
                                    <button
                                      onClick={() => handleApplyRecommendation(rec.product_id, recItem.type)}
                                      disabled={subscription?.plan !== 'premium' || applyingRecommendationId === `${rec.product_id}-${recItem.type}`}
                                      className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1 rounded"
                                    >
                                      {applyingRecommendationId === `${rec.product_id}-${recItem.type}` ? 'Application...' : 'Faire modification'}
                                    </button>
                                  ) : (
                                    <button
                                      disabled
                                      className="bg-gray-600 text-white text-xs font-semibold px-3 py-1 rounded opacity-70"
                                    >
                                      Modification indisponible
                                    </button>
                                  )}
                                  {subscription?.plan !== 'premium' && (
                                    <span className="text-xs text-yellow-300">Premium requis</span>
                                  )}
                                </div>
                                {renderStatus(`rec-${rec.product_id}-${recItem.type}`)}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-green-400">Aucune amélioration critique nécessaire</p>
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

      {/* Apply Actions Confirmation Modal */}
      {showApplyModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => !applyingActions && setShowApplyModal(false)}>
          <div className="bg-gray-900 rounded-xl max-w-3xl w-full max-h-[80vh] overflow-hidden border border-green-500 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="bg-blue-900 p-6 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Confirmer les modifications
              </h2>
              <button
                onClick={() => !applyingActions && setShowApplyModal(false)}
                disabled={applyingActions}
                className="text-white hover:bg-white/20 p-2 rounded-lg disabled:opacity-50"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(80vh-200px)]">
              <div className="bg-yellow-900/30 border border-yellow-600 rounded-lg p-4 mb-6">
                <p className="text-yellow-300 font-bold mb-2">Attention</p>
                <p className="text-yellow-200 text-sm">L'IA va modifier {selectedActions.length} éléments dans votre boutique Shopify. Cette action est irréversible.</p>
              </div>

              <h3 className="text-white font-bold mb-4 text-lg">Modifications à appliquer:</h3>
              
              <div className="space-y-3">
                {selectedActions.map((action, idx) => (
                  <div key={idx} className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                    <div className="flex items-start gap-3">
                      <div className={`mt-1 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                        action.type === 'price' ? 'bg-green-600' :
                        action.type === 'titre' ? 'bg-blue-600' : 'bg-yellow-700'
                      }`}>
                        {action.type === 'price' ? '💰' : action.type === 'titre' ? '📝' : '📄'}
                      </div>
                      <div className="flex-1">
                        <p className="text-white font-bold mb-1">{action.product}</p>
                        {action.type === 'price' && (
                          <>
                            <p className="text-gray-300 text-sm mb-2">{action.reason}</p>
                            <div className="flex items-center gap-4 text-sm">
                              <span className="text-white">Prix actuel: {action.current}$</span>
                              <span className="text-gray-500">→</span>
                              <span className="text-green-400 font-bold">Nouveau prix: {action.new}$</span>
                            </div>
                          </>
                        )}
                        {(action.type === 'titre' || action.type === 'description') && (
                          <>
                            <div className="flex items-center gap-2 mb-2">
                              <span className={`px-2 py-1 rounded text-xs font-bold ${
                                action.priority === 'Critique' ? 'bg-yellow-700' :
                                action.priority === 'Haute' ? 'bg-blue-700' : 'bg-gray-700'
                              }`}>
                                {action.priority}
                              </span>
                              <span className="text-blue-400 text-sm font-bold">{action.type.toUpperCase()}</span>
                            </div>
                            <p className="text-gray-400 text-sm mb-1">Problème: {action.issue}</p>
                            <p className="text-green-300 text-sm">Solution: {action.suggestion}</p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {selectedActions.length === 0 && (
                <div className="text-center text-gray-400 py-8">
                  <p>Aucune action automatique disponible pour le moment.</p>
                  <p className="text-sm mt-2">Lance une nouvelle analyse pour obtenir des recommandations.</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="bg-gray-800 border-t border-gray-700 p-6 flex justify-between items-center">
              <button
                onClick={() => setShowApplyModal(false)}
                disabled={applyingActions}
                className="text-gray-400 hover:text-white px-6 py-2 rounded-lg transition disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={handleApplyActions}
                disabled={applyingActions || selectedActions.length === 0}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-8 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {applyingActions ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Application en cours...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Confirmer et appliquer ({selectedActions.length})
                  </>
                )}
              </button>
            </div>
            {renderStatus('apply-actions')}
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setShowSettingsModal(false)}>
          <div className="bg-gray-900 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden border border-gray-700 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="bg-blue-900 p-6 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-white">{t('accountSettings')}</h2>
              <button onClick={() => setShowSettingsModal(false)} className="text-white hover:bg-white/20 p-2 rounded-lg">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex h-[calc(90vh-120px)]">
              {/* Sidebar */}
              <div className="w-64 bg-gray-800 border-r border-gray-700 p-4">
                <nav className="space-y-1">
                  {['profile', 'security', 'interface', 'notifications', 'shopify', 'billing', 'api'].map(tab => (
                    <button
                      key={tab}
                      onClick={() => setSettingsTab(tab)}
                      className={`w-full text-left px-4 py-2 rounded-lg transition ${
                        settingsTab === tab ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
                      }`}
                    >
                      {tab === 'profile' && t('tabProfile')}
                      {tab === 'security' && t('tabSecurity')}
                      {tab === 'interface' && t('tabInterface')}
                      {tab === 'notifications' && t('tabNotifications')}
                      {tab === 'shopify' && t('tabShopify')}
                      {tab === 'billing' && t('tabBilling')}
                      {tab === 'api' && t('tabApiKeys')}
                    </button>
                  ))}
                </nav>
              </div>

              {/* Content */}
              <div className="flex-1 p-6 overflow-y-auto bg-gray-900">
                {settingsTab === 'profile' && (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-xl font-bold text-white mb-4">{t('profileInformation')}</h3>
                      <div className="flex items-center gap-6 mb-6">
                        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center font-bold text-3xl shadow-lg overflow-hidden">
                          {profile?.avatar_url ? (
                            <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                          ) : (
                            <span>{profile?.first_name?.[0]?.toUpperCase() || '?'}</span>
                          )}
                        </div>
                        <input
                          ref={avatarInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleAvatarFileChange}
                        />
                        <button
                          onClick={() => avatarInputRef.current?.click()}
                          disabled={avatarUploading}
                          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded-lg text-white font-semibold"
                        >
                          {avatarUploading ? t('saving') : t('uploadPhoto')}
                        </button>
                      </div>
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm text-gray-400 mb-2">{t('firstName')}</label>
                            <input type="text" value={profileFirstName} onChange={(e) => setProfileFirstName(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white" />
                          </div>
                          <div>
                            <label className="block text-sm text-gray-400 mb-2">{t('lastName')}</label>
                            <input type="text" value={profileLastName} onChange={(e) => setProfileLastName(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm text-gray-400 mb-2">{t('username')}</label>
                          <input type="text" defaultValue={profile?.username} disabled className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-gray-400 cursor-not-allowed" />
                          <p className="text-xs text-gray-500 mt-1">{t('usernameCannotChange')}</p>
                        </div>
                        <div>
                          <label className="block text-sm text-gray-400 mb-2">{t('email')}</label>
                          <input type="email" defaultValue={user?.email} disabled className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-gray-400 cursor-not-allowed" />
                        </div>
                        <button onClick={handleSaveProfile} disabled={saveLoading} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-6 py-2 rounded-lg text-white font-semibold">
                          {saveLoading ? t('saving') : t('saveChanges')}
                        </button>
                        {renderStatus('profile')}
                      </div>
                    </div>
                  </div>
                )}

                {settingsTab === 'security' && (
                  <div className="space-y-6">
                    <h3 className="text-xl font-bold text-white mb-4">{t('securitySettings')}</h3>
                    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                      <h4 className="text-lg font-semibold text-white mb-4">{t('changePassword')}</h4>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm text-gray-400 mb-2">{t('currentPassword')}</label>
                          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white" />
                        </div>
                        <div>
                          <label className="block text-sm text-gray-400 mb-2">{t('newPassword')}</label>
                          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white" />
                        </div>
                        <div>
                          <label className="block text-sm text-gray-400 mb-2">{t('confirmNewPassword')}</label>
                          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white" />
                        </div>
                        <button onClick={handleUpdatePassword} disabled={saveLoading} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-6 py-2 rounded-lg text-white font-semibold">
                          {saveLoading ? t('updating') : t('updatePassword')}
                        </button>
                        {renderStatus('password')}
                      </div>
                    </div>
                    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                      <h4 className="text-lg font-semibold text-white mb-2">{t('twoFactorAuth')}</h4>
                      <p className="text-gray-400 mb-4">{t('twoFactorDesc')}</p>
                      <button onClick={handleToggle2FA} disabled={saveLoading} className={`${twoFAEnabled ? 'bg-gray-700 hover:bg-gray-600' : 'bg-blue-600 hover:bg-blue-700'} disabled:opacity-50 px-6 py-2 rounded-lg text-white font-semibold`}>
                        {saveLoading ? '...' : (twoFAEnabled ? t('disable2FA') : t('enable2FA'))}
                      </button>
                      {twoFAEnabled && <p className="text-green-400 text-sm mt-2">{t('twoFAEnabled')}</p>}
                      {renderStatus('2fa')}
                    </div>
                  </div>
                )}

                {settingsTab === 'interface' && (
                  <div className="space-y-6">
                    <h3 className="text-xl font-bold text-white mb-4">{t('interfacePreferences')}</h3>
                    <div className="space-y-4">
                      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                        <h4 className="text-white font-semibold mb-2">{t('language')}</h4>
                        <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white">
                          <option value="fr">Français</option>
                          <option value="en">English</option>
                          <option value="es">Español</option>
                        </select>
                      </div>
                      <button onClick={handleSaveInterface} disabled={saveLoading} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-6 py-2 rounded-lg text-white font-semibold w-full">
                        {saveLoading ? t('saving') : t('saveInterface')}
                      </button>
                      {renderStatus('interface')}
                    </div>
                  </div>
                )}

                {settingsTab === 'shopify' && (
                  <div className="space-y-6">
                    <h3 className="text-xl font-bold text-white mb-4">Connexion Shopify</h3>
                    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 max-w-2xl">
                      <div className="space-y-4">
                        {shopifyConnected && shopifyUrl && (
                          <div className="flex items-center justify-between bg-gray-900 border border-gray-700 rounded-xl px-4 py-3">
                            <div>
                              <p className="text-sm text-gray-400">Boutique connectée</p>
                              <p className="text-white font-semibold">{shopifyUrl}</p>
                            </div>
                            <span className="text-xs text-green-300 bg-green-900/30 border border-green-700/40 px-3 py-1 rounded-full">Connecté</span>
                          </div>
                        )}
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

                        {!shopifyConnected && (
                          <div>
                            <label className="block text-gray-400 text-sm mb-2">Token d'accès</label>
                            <input
                              type="password"
                              placeholder="shpat_..."
                              value={shopifyToken}
                              onChange={(e) => setShopifyToken(e.target.value)}
                              className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600"
                            />
                            <p className="text-xs text-gray-500 mt-2">Scopes requis: read_products, write_products, read_orders, read_customers, read_analytics.</p>
                          </div>
                        )}

                        {shopifyConnected && (
                          <button
                            onClick={() => setShowShopifyToken((prev) => !prev)}
                            className="w-full bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg"
                          >
                            {showShopifyToken ? 'Masquer le token' : 'Mettre à jour le token'}
                          </button>
                        )}

                        {shopifyConnected && showShopifyToken && (
                          <div>
                            <label className="block text-gray-400 text-sm mb-2">Nouveau token d'accès</label>
                            <input
                              type="password"
                              placeholder="shpat_..."
                              value={shopifyToken}
                              onChange={(e) => setShopifyToken(e.target.value)}
                              className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600"
                            />
                            <p className="text-xs text-gray-500 mt-2">Scopes requis: read_products, write_products, read_orders, read_customers, read_analytics.</p>
                          </div>
                        )}

                        <button
                          onClick={connectShopify}
                          className="w-full bg-yellow-600 hover:bg-yellow-500 text-black font-bold py-2 px-4 rounded-lg"
                        >
                          {shopifyConnected ? 'Mettre à jour la connexion' : 'Connecter Shopify'}
                        </button>
                        {renderStatus('shopify')}
                      </div>

                      {shopifyUrl && !loading && (
                        <div className="mt-6">
                          <button
                            onClick={loadProducts}
                            className="bg-yellow-600 hover:bg-yellow-500 text-black font-bold py-2 px-4 rounded-lg"
                          >
                            Charger mes produits ({products?.length || 0})
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {settingsTab === 'notifications' && (
                  <div className="space-y-6">
                    <h3 className="text-xl font-bold text-white mb-4">{t('notificationPreferences')}</h3>
                    <div className="space-y-4">
                      {[
                        { key: 'email_notifications', label: t('emailNotifications') },
                        { key: 'analysis_complete', label: t('analysisComplete') },
                        { key: 'weekly_reports', label: t('weeklyReports') },
                        { key: 'billing_updates', label: t('billingUpdates') }
                      ].map(item => (
                        <div key={item.key} className="bg-gray-800 rounded-lg p-4 border border-gray-700 flex justify-between items-center">
                          <span className="text-white">{item.label}</span>
                          <button onClick={() => setNotifications(prev => ({...prev, [item.key]: !prev[item.key]}))} className={`${notifications[item.key] ? 'bg-blue-600' : 'bg-gray-600'} w-12 h-6 rounded-full p-1 cursor-pointer transition`}>
                            <div className={`${notifications[item.key] ? 'bg-white ml-auto' : 'bg-white'} w-4 h-4 rounded-full transition`}></div>
                          </button>
                        </div>
                      ))}
                      <button onClick={handleSaveNotifications} disabled={saveLoading} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-6 py-2 rounded-lg text-white font-semibold w-full mt-4">
                        {saveLoading ? t('saving') : t('saveNotifications')}
                      </button>
                      {renderStatus('notifications')}
                    </div>
                  </div>
                )}

                {settingsTab === 'billing' && (
                  <div className="space-y-6">
                    <h3 className="text-xl font-bold text-white mb-4">{t('billingAndSubscription')}</h3>
                    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                      <div className="flex justify-between items-center mb-4">
                        <div>
                          <h4 className="text-xl font-bold text-white">{subscription?.plan?.toUpperCase()} Plan</h4>
                          <p className="text-gray-400">{t('activeSince')} {new Date(subscription?.started_at).toLocaleDateString()}</p>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-green-400">
                            ${subscription?.plan === 'standard' ? '99' : subscription?.plan === 'pro' ? '199' : '299'}/mo
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-4">
                        <button onClick={() => { setShowSettingsModal(false); setShowPlanMenu(true) }} className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-lg text-white font-semibold">
                          {t('changePlan')}
                        </button>
                        <button onClick={handleCancelSubscription} disabled={saveLoading} className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 px-6 py-2 rounded-lg text-white font-semibold">
                          {saveLoading ? '...' : t('cancelSubscription')}
                        </button>
                      </div>
                      {renderStatus('billing-cancel')}
                    </div>
                    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                      <h4 className="text-lg font-semibold text-white mb-4">{t('paymentMethod')}</h4>
                      <div className="flex items-center gap-4 mb-4">
                        <div className="bg-gray-700 p-3 rounded">
                          <span className="text-2xl">💳</span>
                        </div>
                        <div>
                          <p className="text-white font-semibold">Visa •••• 7427</p>
                          <p className="text-sm text-gray-400">Expires 10/2028</p>
                        </div>
                      </div>
                      <button onClick={handleUpdatePaymentMethod} disabled={saveLoading} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-6 py-2 rounded-lg text-white font-semibold">
                        {saveLoading ? '...' : t('updatePaymentMethod')}
                      </button>
                      {renderStatus('billing-payment')}
                    </div>
                  </div>
                )}

                {settingsTab === 'api' && (
                  <div className="space-y-6">
                    <h3 className="text-xl font-bold text-white mb-4">{t('apiKeys')}</h3>
                    <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-4 mb-4">
                      <p className="text-yellow-400 text-sm">{t('apiWarning')}</p>
                    </div>
                    {apiLoading && <div className="text-gray-400">Chargement...</div>}
                    {!apiLoading && apiKeys.length === 0 && (
                      <div className="text-gray-400">Aucune clé API disponible.</div>
                    )}
                    <div className="space-y-4">
                      {apiKeys.map((keyItem) => (
                        <div key={keyItem.id} className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                          <div className="flex justify-between items-center mb-4">
                            <div>
                              <h4 className="text-white font-semibold">{keyItem.name || t('productionApiKey')}</h4>
                              <p className="text-sm text-gray-400">{t('createdOn')} {new Date(keyItem.created_at).toLocaleDateString()}</p>
                            </div>
                            <button
                              onClick={() => handleRevokeApiKey(keyItem.id)}
                              disabled={keyItem.revoked || apiLoading}
                              className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 px-4 py-2 rounded-lg text-white text-sm"
                            >
                              {keyItem.revoked ? 'Révoquée' : t('revoke')}
                            </button>
                          </div>
                          {pendingRevokeKeyId === keyItem.id && !keyItem.revoked && (
                            <div className="flex gap-2 mb-4">
                              <button
                                onClick={() => handleRevokeApiKey(keyItem.id)}
                                disabled={apiLoading}
                                className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 px-4 py-2 rounded-lg text-white text-sm"
                              >
                                Confirmer
                              </button>
                              <button
                                onClick={() => setPendingRevokeKeyId(null)}
                                className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-white text-sm"
                              >
                                Annuler
                              </button>
                            </div>
                          )}
                          <div className="bg-gray-700 rounded p-3 font-mono text-sm text-gray-300">
                            {keyItem.key_prefix}••••{keyItem.key_last4}
                          </div>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={handleGenerateApiKey}
                      disabled={apiLoading}
                      className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-6 py-2 rounded-lg text-white font-semibold"
                    >
                      {t('generateKey')}
                    </button>
                    {renderStatus('api')}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
          </div>

          <button
            onClick={() => setShowChatModal(true)}
            className="fixed bottom-6 right-6 bg-yellow-600 hover:bg-yellow-500 text-black font-semibold px-5 py-3 rounded-full shadow-xl border border-yellow-400/40 z-40"
          >
            Assistant IA
          </button>

          {showChatModal && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-end md:items-center justify-center" onClick={() => setShowChatModal(false)}>
              <div
                className="bg-gray-900 border border-gray-700 rounded-2xl w-full md:max-w-2xl h-[75vh] md:h-[70vh] mx-4 mb-6 md:mb-0 flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Assistant</p>
                    <h3 className="text-white text-lg font-semibold">Assistant IA</h3>
                  </div>
                  <button
                    onClick={() => setShowChatModal(false)}
                    className="text-gray-400 hover:text-white text-sm"
                  >
                    Fermer
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-4 space-y-4">
                  {chatMessages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-full lg:max-w-2xl px-4 py-2 rounded-lg whitespace-pre-wrap break-words ${
                        msg.role === 'user'
                          ? 'bg-yellow-600 text-black'
                          : 'bg-gray-800 text-gray-200'
                      }`}>
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-gray-800 text-gray-200 px-4 py-2 rounded-lg">
                        L'IA réfléchit...
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                <div className="border-t border-gray-700 px-6 py-4">
                  <div className="flex gap-2">
                    <textarea
                      placeholder="Pose une question à l'IA..."
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && !chatLoading) {
                          e.preventDefault()
                          sendChatMessage()
                        }
                      }}
                      disabled={chatLoading}
                      rows={2}
                      className="flex-1 resize-none bg-gray-800 text-white px-4 py-2 rounded-lg border border-gray-700 disabled:opacity-50 max-h-36 overflow-y-auto"
                    />
                    <button
                      onClick={sendChatMessage}
                      disabled={chatLoading || !chatInput.trim()}
                      className="bg-yellow-600 hover:bg-yellow-500 text-black font-semibold py-2 px-6 rounded-lg disabled:opacity-50"
                    >
                      {chatLoading ? 'Envoi...' : 'Envoyer'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
