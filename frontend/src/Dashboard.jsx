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
  const [chatMessages, setChatMessages] = useState(() => {
    if (typeof window === 'undefined') return []
    try {
      const stored = localStorage.getItem('chatMessages')
      if (!stored) return []
      const parsed = JSON.parse(stored)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  })
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)

  const blockersRequestIdRef = useRef(0)
  
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
  const [showChatPanel, setShowChatPanel] = useState(false)
  const [chatExpanded, setChatExpanded] = useState(false)
  const [chatConversations, setChatConversations] = useState(() => {
    if (typeof window === 'undefined') return []
    try {
      const stored = localStorage.getItem('chatConversations')
      return stored ? JSON.parse(stored) : []
    } catch { return [] }
  })
  const [activeConversationId, setActiveConversationId] = useState(() => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem('activeConversationId') || null
  })
  const [showConversationMenu, setShowConversationMenu] = useState(false)
  const [conversationSearch, setConversationSearch] = useState('')
  const [renamingConversationId, setRenamingConversationId] = useState(null)
  const [renamingValue, setRenamingValue] = useState('')
  const conversationMenuRef = useRef(null)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const attachMenuRef = useRef(null)
  const fileInputRef = useRef(null)
  const [chatAttachments, setChatAttachments] = useState([])
  const [voiceListening, setVoiceListening] = useState(false)
  const voiceRecognitionRef = useRef(null)
  const [voiceCallMode, setVoiceCallMode] = useState(false)
  const [voiceCallListening, setVoiceCallListening] = useState(false)
  const [voiceCallTranscript, setVoiceCallTranscript] = useState('')
  const [voiceCallSpeaking, setVoiceCallSpeaking] = useState(false)
  const [voiceDictationMode, setVoiceDictationMode] = useState(false)
  const [voiceDictationTranscript, setVoiceDictationTranscript] = useState('')
  const voiceWaveIntervalRef = useRef(null)
  const [voiceWaveBars, setVoiceWaveBars] = useState(Array(40).fill(2))
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const waveAnimFrameRef = useRef(null)
  const voiceCallModeRef = useRef(false)
  const voiceCallAudioRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const chatTextareaRef = useRef(null)
  const [chatTextareaFocused, setChatTextareaFocused] = useState(false)
  const [analyticsRange, setAnalyticsRange] = useState('30d')
  const [analyticsData, setAnalyticsData] = useState(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [analyticsError, setAnalyticsError] = useState('')
  const [insightsData, setInsightsData] = useState(null)
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [insightsError, setInsightsError] = useState('')
  const [bundlesHistory, setBundlesHistory] = useState([])
  const [bundlesDiagnostics, setBundlesDiagnostics] = useState(null)
  const [bundlesJobStatus, setBundlesJobStatus] = useState('idle')
  const [bundlesHistoryOpen, setBundlesHistoryOpen] = useState(false)
  const [bundlesHistoryLoading, setBundlesHistoryLoading] = useState(false)
  const [selectedBundlesHistoryJobId, setSelectedBundlesHistoryJobId] = useState('')
  const [backendHealth, setBackendHealth] = useState(null)
  const [backendHealthTs, setBackendHealthTs] = useState(0)
  const [shopCurrency, setShopCurrency] = useState(() => {
    if (typeof window === 'undefined') return ''
    return localStorage.getItem('shopCurrencyCache') || ''
  })
  const [rewriteProductId, setRewriteProductId] = useState('')
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

  const currencyLocale = (currency) => {
    const code = String(currency || '').toUpperCase()
    if (code === 'CAD') return 'fr-CA'
    if (code === 'USD') return 'fr-CA'
    return 'fr-FR'
  }

  const formatCurrency = (value, currency) => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
    const effectiveCurrency = currency || shopCurrency || 'CAD'
    try {
      return new Intl.NumberFormat(currencyLocale(effectiveCurrency), {
        style: 'currency',
        currency: effectiveCurrency
      }).format(Number(value))
    } catch {
      return `${value} ${effectiveCurrency}`
    }
  }

  const loadShopCurrency = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const resp = await fetch(`${API_URL}/api/shopify/shop`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })
      if (!resp.ok) return
      const data = await resp.json()
      const currency = String(data?.currency_code || '').toUpperCase()
      if (currency) {
        setShopCurrency(currency)
        if (typeof window !== 'undefined') {
          localStorage.setItem('shopCurrencyCache', currency)
        }
      }
    } catch (e) {
      // best-effort only
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

  const getPriceItems = (data) => {
    if (Array.isArray(data?.price_opportunities) && data.price_opportunities.length > 0) {
      return data.price_opportunities
    }
    if (Array.isArray(data?.price_analysis?.items)) {
      return data.price_analysis.items
    }
    return []
  }

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

  const clearStatus = (key) => {
    setStatusByKey((prev) => {
      if (!prev || !prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
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

  const normalizeNetworkErrorMessage = (err, fallback = 'Erreur réseau') => {
    const raw = String(err?.message || '').trim()
    if (err?.name === 'AbortError') {
      return 'L’analyse prend plus de temps que prévu (délai dépassé). Réessaie — le backend est joignable, mais la requête est trop lente.'
    }
    const isNetwork = /Failed to fetch|NetworkError|Load failed|fetch/i.test(raw)
    if (isNetwork) {
      const freshHealth = backendHealth && backendHealthTs && (Date.now() - backendHealthTs < 2 * 60 * 1000)
      if (freshHealth && backendHealth?.status === 'ok') {
        return 'Erreur réseau lors de la requête (le backend répond sur /health). Vérifie ta connexion ou bloqueurs réseau, puis réessaie.'
      }
      return 'Connexion au backend impossible pour le moment (serveur en réveil). Réessaie dans 10-20 secondes.'
    }
    return raw || fallback
  }

  const formatUserFacingError = (err, fallback = 'Une erreur est survenue') => {
    const message = normalizeNetworkErrorMessage(err, fallback)
    return message || fallback
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
    if (typeof window !== 'undefined') {
      localStorage.setItem('chatConversations', JSON.stringify(chatConversations))
    }
  }, [chatConversations])

  useEffect(() => {
    if (typeof window !== 'undefined' && activeConversationId) {
      localStorage.setItem('activeConversationId', activeConversationId)
    }
  }, [activeConversationId])

  useEffect(() => {
    if (!showConversationMenu) return
    const handleClickOutside = (e) => {
      if (conversationMenuRef.current && !conversationMenuRef.current.contains(e.target)) {
        setShowConversationMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showConversationMenu])

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
    if (typeof window !== 'undefined' && shopCurrency) {
      localStorage.setItem('shopCurrencyCache', shopCurrency)
    }
  }, [shopCurrency])

  useEffect(() => {
    if (shopifyConnected) {
      loadShopCurrency()
    }
  }, [shopifyConnected])

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

  // ============ CONVERSATION MANAGEMENT ============
  const startNewConversation = () => {
    // Save current conversation if it has messages
    if (chatMessages.length > 0 && activeConversationId) {
      setChatConversations(prev => prev.map(c =>
        c.id === activeConversationId ? { ...c, messages: chatMessages, updatedAt: new Date().toISOString() } : c
      ))
    } else if (chatMessages.length > 0 && !activeConversationId) {
      const firstUserMsg = chatMessages.find(m => m.role === 'user')
      const title = firstUserMsg ? firstUserMsg.text.slice(0, 40) + (firstUserMsg.text.length > 40 ? '...' : '') : 'Nouvelle conversation'
      const newConv = {
        id: Date.now().toString(),
        title,
        messages: chatMessages,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      setChatConversations(prev => [newConv, ...prev])
    }
    setChatMessages([])
    setActiveConversationId(null)
    setShowConversationMenu(false)
  }

  const loadConversation = (conv) => {
    // Save current first
    if (chatMessages.length > 0 && activeConversationId && activeConversationId !== conv.id) {
      setChatConversations(prev => prev.map(c =>
        c.id === activeConversationId ? { ...c, messages: chatMessages, updatedAt: new Date().toISOString() } : c
      ))
    }
    setChatMessages(conv.messages || [])
    setActiveConversationId(conv.id)
    setShowConversationMenu(false)
  }

  const renameConversation = (convId, newTitle) => {
    setChatConversations(prev => prev.map(c =>
      c.id === convId ? { ...c, title: newTitle } : c
    ))
    setRenamingConversationId(null)
    setRenamingValue('')
  }

  const deleteConversation = (convId) => {
    setChatConversations(prev => prev.filter(c => c.id !== convId))
    if (activeConversationId === convId) {
      setChatMessages([])
      setActiveConversationId(null)
    }
  }

  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour >= 5 && hour < 12) return 'Bonjour'
    if (hour >= 12 && hour < 18) return 'Bon après-midi'
    return 'Bonsoir'
  }

  const getConversationDateLabel = (dateStr) => {
    const date = new Date(dateStr)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    if (date.toDateString() === today.toDateString()) return "Aujourd'hui"
    if (date.toDateString() === yesterday.toDateString()) return 'Hier'
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
  }

  const filteredConversations = chatConversations
    .filter(c => !conversationSearch || c.title.toLowerCase().includes(conversationSearch.toLowerCase()))
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))

  const groupedConversations = filteredConversations.reduce((acc, conv) => {
    const label = getConversationDateLabel(conv.updatedAt || conv.createdAt)
    if (!acc[label]) acc[label] = []
    acc[label].push(conv)
    return acc
  }, {})

  const activeConversationTitle = activeConversationId
    ? (chatConversations.find(c => c.id === activeConversationId)?.title || 'Conversation')
    : 'Nouvelle conversation'

  // ============ ATTACHMENTS & VOICE ============
  useEffect(() => {
    if (!showAttachMenu) return
    const handleClick = (e) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target)) setShowAttachMenu(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showAttachMenu])

  const handleFileAttach = (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = () => {
        setChatAttachments(prev => [...prev, { name: file.name, type: file.type, size: file.size, preview: file.type.startsWith('image/') ? reader.result : null }])
      }
      reader.readAsDataURL(file)
    })
    setShowAttachMenu(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeAttachment = (idx) => {
    setChatAttachments(prev => prev.filter((_, i) => i !== idx))
  }

  // Start waveform animation (volume-reactive via AudioContext)
  const startWaveAnimation = async () => {
    stopWaveAnimation()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      audioContextRef.current = audioCtx
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 128
      analyser.smoothingTimeConstant = 0.6
      source.connect(analyser)
      analyserRef.current = analyser
      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      const updateBars = () => {
        analyser.getByteFrequencyData(dataArray)
        // Map 64 frequency bins → 40 bars
        const bars = []
        const binStep = dataArray.length / 40
        for (let i = 0; i < 40; i++) {
          const idx = Math.floor(i * binStep)
          const val = dataArray[idx] || 0
          // Scale 0-255 → 2-20px height
          bars.push(Math.max(2, (val / 255) * 20))
        }
        setVoiceWaveBars(bars)
        waveAnimFrameRef.current = requestAnimationFrame(updateBars)
      }
      updateBars()
    } catch (err) {
      console.warn('AudioContext waveform not available, falling back to random:', err)
      // Fallback: random bars if microphone access fails
      voiceWaveIntervalRef.current = setInterval(() => {
        setVoiceWaveBars(prev => prev.map(() => Math.random() * 18 + 2))
      }, 80)
    }
  }
  const stopWaveAnimation = () => {
    if (waveAnimFrameRef.current) { cancelAnimationFrame(waveAnimFrameRef.current); waveAnimFrameRef.current = null }
    if (voiceWaveIntervalRef.current) { clearInterval(voiceWaveIntervalRef.current); voiceWaveIntervalRef.current = null }
    if (analyserRef.current) { analyserRef.current = null }
    if (audioContextRef.current) { try { audioContextRef.current.close() } catch {}; audioContextRef.current = null }
    if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach(t => t.stop()); mediaStreamRef.current = null }
    setVoiceWaveBars(Array(40).fill(2))
  }

  // ── OpenAI Whisper transcription helper ──
  const transcribeWithWhisper = async (audioBlob) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return null
      const formData = new FormData()
      formData.append('audio', audioBlob, 'recording.webm')
      const response = await fetch(`${API_URL}/api/ai/stt`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
        body: formData
      })
      if (!response.ok) throw new Error(`STT API error: ${response.status}`)
      const data = await response.json()
      return data.success ? data.text : null
    } catch (err) {
      console.warn('Whisper STT failed:', err)
      return null
    }
  }

  // Start MediaRecorder for Whisper
  const startMediaRecorder = (stream) => {
    try {
      audioChunksRef.current = []
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4'
        : 'audio/wav'
      const recorder = new MediaRecorder(stream, { mimeType })
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      recorder.start(250) // collect chunks every 250ms
      mediaRecorderRef.current = recorder
    } catch (err) {
      console.warn('MediaRecorder failed to start:', err)
    }
  }

  const stopMediaRecorder = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop() } catch {}
    }
    mediaRecorderRef.current = null
  }

  const getRecordedBlob = () => {
    if (audioChunksRef.current.length === 0) return null
    return new Blob(audioChunksRef.current, { type: 'audio/webm' })
  }

  // ── Dictation mode (waveform in input bar) ──
  const dictationActiveRef = useRef(false)
  const dictationTranscriptRef = useRef('')

  const startDictation = async () => {
    dictationActiveRef.current = true
    dictationTranscriptRef.current = ''
    setVoiceDictationMode(true)
    setVoiceDictationTranscript('')
    // Start waveform first (requests mic permission)
    await startWaveAnimation()
    // Also start MediaRecorder for Whisper transcription
    if (mediaStreamRef.current) startMediaRecorder(mediaStreamRef.current)
    // Use browser SpeechRecognition for real-time preview
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition()
      recognition.lang = 'fr-FR'
      recognition.interimResults = true
      recognition.continuous = true
      voiceRecognitionRef.current = recognition
      recognition.onresult = (event) => {
        let final = ''
        let interim = ''
        for (let i = 0; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            final += (final ? ' ' : '') + event.results[i][0].transcript
          } else { interim += event.results[i][0].transcript }
        }
        dictationTranscriptRef.current = final
        setVoiceDictationTranscript(final + (interim ? ' ' + interim : ''))
      }
      recognition.onerror = (e) => {
        console.warn('Dictation recognition error:', e.error)
        if (e.error !== 'aborted' && dictationActiveRef.current) {
          try { recognition.start() } catch {}
        }
      }
      recognition.onend = () => {
        if (dictationActiveRef.current) {
          try { recognition.start() } catch {}
        }
      }
      recognition.start()
    }
    setVoiceListening(true)
  }

  const confirmDictation = async () => {
    dictationActiveRef.current = false
    if (voiceRecognitionRef.current) try { voiceRecognitionRef.current.stop() } catch {}
    stopMediaRecorder()
    // Try Whisper transcription first (more accurate), fallback to browser STT
    const audioBlob = getRecordedBlob()
    let text = null
    if (audioBlob && audioBlob.size > 1000) {
      setVoiceDictationTranscript('Transcription en cours...')
      text = await transcribeWithWhisper(audioBlob)
    }
    if (!text) text = (dictationTranscriptRef.current || voiceDictationTranscript || '').trim()
    if (text && text !== 'Transcription en cours...') setChatInput(prev => (prev ? prev + ' ' : '') + text)
    setVoiceDictationMode(false)
    setVoiceDictationTranscript('')
    setVoiceListening(false)
    stopWaveAnimation()
  }

  const cancelDictation = () => {
    dictationActiveRef.current = false
    if (voiceRecognitionRef.current) try { voiceRecognitionRef.current.stop() } catch {}
    stopMediaRecorder()
    setVoiceDictationMode(false)
    setVoiceDictationTranscript('')
    setVoiceListening(false)
    stopWaveAnimation()
  }

  // ── Voice call with TTS response (OpenAI TTS API) ──
  const speakText = async (text) => {
    setVoiceCallSpeaking(true)
    const resumeListening = () => {
      setVoiceCallSpeaking(false)
      if (voiceCallModeRef.current) startVoiceCallListening()
    }
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch(`${API_URL}/api/ai/tts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token || ''}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text, voice: 'nova' })
      })
      if (!response.ok) throw new Error(`TTS API error: ${response.status}`)
      const audioBlob = await response.blob()
      const audioUrl = URL.createObjectURL(audioBlob)
      const audio = new Audio(audioUrl)
      voiceCallAudioRef.current = audio
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl)
        voiceCallAudioRef.current = null
        resumeListening()
      }
      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl)
        voiceCallAudioRef.current = null
        resumeListening()
      }
      await audio.play()
    } catch (err) {
      console.warn('OpenAI TTS failed, falling back to browser speechSynthesis:', err)
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel()
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.lang = 'fr-FR'
        utterance.rate = 1.0
        utterance.pitch = 1.0
        const voices = window.speechSynthesis.getVoices()
        const frVoice = voices.find(v => v.lang.startsWith('fr') && v.name.toLowerCase().includes('female'))
          || voices.find(v => v.lang.startsWith('fr'))
        if (frVoice) utterance.voice = frVoice
        utterance.onend = () => resumeListening()
        utterance.onerror = () => resumeListening()
        window.speechSynthesis.speak(utterance)
      } else {
        resumeListening()
      }
    }
  }

  const voiceCallSilenceRef = useRef(null)

  const startVoiceCallListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!voiceCallModeRef.current) return
    // Stop any previous recognition
    if (voiceRecognitionRef.current) try { voiceRecognitionRef.current.stop() } catch {}
    // Start MediaRecorder for Whisper
    if (mediaStreamRef.current) startMediaRecorder(mediaStreamRef.current)
    let finalText = ''
    let hasResults = false

    const resetSilenceTimer = () => {
      if (voiceCallSilenceRef.current) clearTimeout(voiceCallSilenceRef.current)
      voiceCallSilenceRef.current = setTimeout(async () => {
        // 2s of silence after speech → transcribe with Whisper then send
        if (!voiceCallModeRef.current) return
        if (SpeechRecognition && voiceRecognitionRef.current) try { voiceRecognitionRef.current.stop() } catch {}
        stopMediaRecorder()
        setVoiceCallListening(false)
        // Try Whisper first for accurate transcription
        const audioBlob = getRecordedBlob()
        let textToSend = finalText.trim()
        if (audioBlob && audioBlob.size > 1000) {
          setVoiceCallTranscript('Transcription...')
          const whisperText = await transcribeWithWhisper(audioBlob)
          if (whisperText) textToSend = whisperText
        }
        if (textToSend) {
          setVoiceCallTranscript('')
          sendVoiceCallMessage(textToSend)
        } else {
          // No speech detected, restart listening
          if (voiceCallModeRef.current) startVoiceCallListening()
        }
      }, 2000)
    }

    // Use browser SpeechRecognition for real-time preview (if available)
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition()
      recognition.lang = 'fr-FR'
      recognition.interimResults = true
      recognition.continuous = true
      voiceRecognitionRef.current = recognition
      recognition.onresult = (event) => {
        let interim = ''
        finalText = ''
        for (let i = 0; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalText += (finalText ? ' ' : '') + event.results[i][0].transcript
          } else { interim += event.results[i][0].transcript }
        }
        hasResults = true
        setVoiceCallTranscript(finalText + (interim ? ' ' + interim : ''))
        resetSilenceTimer()
      }
      recognition.onerror = (e) => {
        console.warn('Voice call recognition error:', e.error)
        if (e.error !== 'aborted' && voiceCallModeRef.current) {
          setTimeout(() => { if (voiceCallModeRef.current) startVoiceCallListening() }, 500)
        }
      }
      recognition.onend = () => {
        if (voiceCallModeRef.current && !finalText.trim()) {
          setTimeout(() => { if (voiceCallModeRef.current) startVoiceCallListening() }, 300)
        }
      }
      recognition.start()
    } else {
      // No browser STT — rely solely on Whisper with silence detection via audio levels
      // Auto-send after 4 seconds of recording
      voiceCallSilenceRef.current = setTimeout(async () => {
        if (!voiceCallModeRef.current) return
        stopMediaRecorder()
        setVoiceCallListening(false)
        const audioBlob = getRecordedBlob()
        if (audioBlob && audioBlob.size > 1000) {
          setVoiceCallTranscript('Transcription...')
          const whisperText = await transcribeWithWhisper(audioBlob)
          if (whisperText) {
            setVoiceCallTranscript('')
            sendVoiceCallMessage(whisperText)
          } else {
            if (voiceCallModeRef.current) startVoiceCallListening()
          }
        } else {
          if (voiceCallModeRef.current) startVoiceCallListening()
        }
      }, 4000)
    }
    setVoiceCallListening(true)
  }

  const sendVoiceCallMessage = async (text) => {
    try {
      setChatMessages(prev => [...prev, { role: 'user', text }])
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch(`${API_URL}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, context: shopifyUrl ? `Boutique connectée: ${shopifyUrl}` : '' })
      })
      const data = await response.json()
      const reply = data.success ? data.message : 'Désolé, une erreur est survenue.'
      setChatMessages(prev => [...prev, { role: 'assistant', text: reply }])
      // Speak the response out loud
      speakText(reply)
    } catch {
      speakText('Désolé, je n\'ai pas pu me connecter.')
    }
  }

  const startVoiceCall = () => {
    voiceCallModeRef.current = true
    setVoiceCallMode(true)
    setVoiceCallTranscript('')
    setVoiceCallSpeaking(false)
    startWaveAnimation()
    // Greet first
    const greeting = `${getGreeting()}, ${profile?.first_name || 'là'}. Comment puis-je vous aider ?`
    speakText(greeting)
  }

  const endVoiceCall = () => {
    voiceCallModeRef.current = false
    if (voiceRecognitionRef.current) try { voiceRecognitionRef.current.stop() } catch {}
    if (voiceCallSilenceRef.current) { clearTimeout(voiceCallSilenceRef.current); voiceCallSilenceRef.current = null }
    if (window.speechSynthesis) window.speechSynthesis.cancel()
    stopMediaRecorder()
    // Stop any playing audio
    if (voiceCallAudioRef.current) { try { voiceCallAudioRef.current.pause() } catch {}; voiceCallAudioRef.current = null }
    setVoiceCallMode(false)
    setVoiceCallListening(false)
    setVoiceCallTranscript('')
    setVoiceCallSpeaking(false)
    stopWaveAnimation()
  }

  const toggleVoiceCallMic = () => {
    if (voiceCallSpeaking) return // don't toggle while AI speaks
    if (voiceCallListening) {
      if (voiceRecognitionRef.current) try { voiceRecognitionRef.current.stop() } catch {}
      setVoiceCallListening(false)
    } else {
      startVoiceCallListening()
    }
  }

  // ============ CHAT SEND ============
  const sendChatMessage = async (directMessage) => {
    const messageToSend = directMessage || chatInput.trim()
    if (!messageToSend) return
    
    try {
      setChatLoading(true)
      
      const userMessage = messageToSend
      setChatMessages(prev => [...prev, { role: 'user', text: userMessage }])
      setChatInput('')
      // Shrink textarea back to default
      setChatTextareaFocused(false)
      if (chatTextareaRef.current) chatTextareaRef.current.style.height = '44px'
      
      // Auto-create conversation on first message
      if (!activeConversationId) {
        const newId = Date.now().toString()
        const title = userMessage.slice(0, 40) + (userMessage.length > 40 ? '...' : '')
        const newConv = {
          id: newId,
          title,
          messages: [{ role: 'user', text: userMessage }],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
        setChatConversations(prev => [newConv, ...prev])
        setActiveConversationId(newId)
      }
      
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
        setChatMessages(prev => {
          const updated = [...prev, { role: 'assistant', text: data.message }]
          // Persist to conversation
          if (activeConversationId) {
            setChatConversations(prev2 => prev2.map(c =>
              c.id === activeConversationId ? { ...c, messages: updated, updatedAt: new Date().toISOString() } : c
            ))
          }
          return updated
        })
      } else {
        setChatMessages(prev => [...prev, { 
          role: 'assistant', 
          text: 'Erreur: ' + (data.detail || 'Erreur inconnue') 
        }])
      }
    } catch (err) {
      setChatMessages(prev => [...prev, { 
        role: 'assistant', 
        text: formatUserFacingError(err, 'Erreur de connexion')
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
      setStatus('profile', 'error', formatUserFacingError(err, 'Erreur profil'))
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
      setStatus('password', 'error', formatUserFacingError(err, 'Erreur mot de passe'))
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
      setStatus('2fa', 'error', formatUserFacingError(err, 'Erreur 2FA'))
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
      setStatus('interface', 'error', formatUserFacingError(err, 'Erreur paramètres'))
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
      setStatus('notifications', 'error', formatUserFacingError(err, 'Erreur notifications'))
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
      setStatus('billing-cancel', 'error', formatUserFacingError(err, 'Erreur annulation'))
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
      setStatus('billing-payment', 'error', formatUserFacingError(err, 'Erreur paiement'))
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
      const message = formatUserFacingError(err, 'Erreur Shopify')
      setStatus('shopify', 'error', message)
      setError(message)
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
        return data.products
        // Afficher les statistiques
        if (data.statistics) {
          console.log('Stats:', data.statistics)
        }
      } else {
        setProducts([])
        setError('Aucun produit trouvé. Connectez votre boutique Shopify d\'abord.')
        return []
      }
    } catch (err) {
      console.error('Error loading products:', err)
      setError(formatUserFacingError(err, 'Erreur chargement produits'))
      setProducts([])
      return []
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
      setAnalyticsError(formatUserFacingError(err, 'Erreur analytics'))
    } finally {
      setAnalyticsLoading(false)
    }
  }

  const fetchJsonWithRetry = async (url, options = {}, config = {}) => {
    const retries = config.retries ?? 2
    const retryDelayMs = config.retryDelayMs ?? 1200
    const timeoutMs = config.timeoutMs ?? 25000
    const retryStatuses = config.retryStatuses ?? [429, 500, 502, 503, 504]

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    let lastError = null

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal
        })

        clearTimeout(timeoutId)

        if (retryStatuses.includes(response.status) && attempt < retries) {
          await sleep(retryDelayMs)
          continue
        }

        let data = null
        try {
          data = await response.json()
        } catch {
          data = null
        }

        return { response, data }
      } catch (err) {
        clearTimeout(timeoutId)
        lastError = err

        const isTransient = err?.name === 'AbortError' || err instanceof TypeError
        if (isTransient && attempt < retries) {
          await sleep(retryDelayMs)
          continue
        }
        throw err
      }
    }

    throw lastError || new Error('Network request failed')
  }

  const fetchBackendHealth = async (config = {}) => {
    const healthUrl = `${API_URL}/health`
    const { data } = await fetchJsonWithRetry(healthUrl, { method: 'GET' }, {
      retries: config.retries ?? 3,
      retryDelayMs: config.retryDelayMs ?? 1500,
      timeoutMs: config.timeoutMs ?? 45000,
      retryStatuses: config.retryStatuses ?? [429, 500, 502, 503, 504]
    })
    setBackendHealth(data)
    setBackendHealthTs(Date.now())
    return data
  }

  const waitForBackendReady = async (config = {}) => {
    const freshnessMs = config.freshnessMs ?? 2 * 60 * 1000
    if (backendHealth && backendHealthTs && Date.now() - backendHealthTs < freshnessMs) {
      return backendHealth
    }

    const retries = config.retries ?? 12
    const retryDelayMs = config.retryDelayMs ?? 3000
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    let lastErr = null
    let wakePinged = false

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await fetchBackendHealth({
          retries: 0,
          timeoutMs: config.timeoutMs ?? 45000
        })
      } catch (err) {
        lastErr = err

        // Best-effort wake ping (opaque) to trigger Render cold-start without requiring CORS.
        if (!wakePinged) {
          wakePinged = true
          try {
            await fetch(`${API_URL}/health`, { method: 'GET', mode: 'no-cors', cache: 'no-store' })
          } catch {
            // ignore
          }
        }

        if (attempt < retries) {
          await sleep(retryDelayMs)
          continue
        }
      }
    }

    throw lastErr || new Error('Backend unreachable')
  }

  const warmupBackend = async (accessToken) => {
    const warmupUrl = `${API_URL}/api/shopify/keep-alive`
    try {
      await waitForBackendReady({ retries: 8, retryDelayMs: 2000, timeoutMs: 22000 })

      await fetchJsonWithRetry(warmupUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }, {
        retries: 6,
        retryDelayMs: 2000,
        timeoutMs: 60000,
        retryStatuses: [429, 500, 502, 503, 504]
      })
    } catch (err) {
      console.warn('Backend warmup failed, continuing to insights:', err)
    }
  }

  const loadInsights = async (rangeOverride, includeAi = false, productId, config = {}) => {
    try {
      const rangeValue = rangeOverride || analyticsRange
      if (!config?.silent) setInsightsLoading(true)
      if (!config?.silent) setInsightsError('')
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        throw new Error('Session expirée, reconnectez-vous')
      }

      // Ensure backend is reachable before authenticated calls.
      await waitForBackendReady({ retries: 8, retryDelayMs: 2000, timeoutMs: 22000 })

      await warmupBackend(session.access_token)

      const aiParam = includeAi ? '&include_ai=true' : ''
      const productParam = productId ? `&product_id=${encodeURIComponent(productId)}` : ''
      const insightsUrl = `${API_URL}/api/shopify/insights?range=${rangeValue}${aiParam}${productParam}`

      // AI insights can take longer (Shopify + AI market estimates).
      const insightsTimeoutMs = includeAi ? 180000 : 70000
      const { response, data } = await fetchJsonWithRetry(insightsUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      }, {
        retries: includeAi ? 1 : 4,
        retryDelayMs: 2000,
        timeoutMs: insightsTimeoutMs,
        retryStatuses: [429, 500, 502, 503, 504]
      })

      if (!response.ok) {
        const errorData = data || {}
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }

      if (!data.success) {
        throw new Error(data.detail || 'Analyse indisponible')
      }

      // In silent/background mode, do NOT overwrite insightsData — return data only
      if (!config?.silent) setInsightsData(data)
      // Cache health when a request succeeds.
      setBackendHealthTs(Date.now())
      return data
    } catch (err) {
      console.error('Error loading insights:', err)
      const errorMessage = normalizeNetworkErrorMessage(err)
      if (!config?.silent) setInsightsError(errorMessage)
      throw new Error(errorMessage)
    } finally {
      if (!config?.silent) setInsightsLoading(false)
    }
  }

  // Nouveau flow asynchrone bundles
  const loadBundlesAsync = async () => {
    try {
      setInsightsLoading(true)
      setInsightsError('')
      setBundlesJobStatus('starting')
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Session expirée, reconnectez-vous')
      await waitForBackendReady({ retries: 8, retryDelayMs: 2000, timeoutMs: 22000 })
      await warmupBackend(session.access_token)
      // Lancer le job async
      const resp = await fetch(`${API_URL}/api/shopify/bundles/async?range=${encodeURIComponent(analyticsRange)}&limit=10`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      })
      const data = await resp.json()
      if (!resp.ok || !data?.job_id) throw new Error(data?.detail || 'Erreur lancement analyse')
      // Poller le job
      await pollBundlesJob(data.job_id, session.access_token)
    } catch (err) {
      const errorMessage = normalizeNetworkErrorMessage(err)
      setInsightsError(errorMessage)
      setBundlesJobStatus('failed')
      setStatus('action-bundles', 'error', errorMessage)
      throw new Error(errorMessage)
    } finally {
      setInsightsLoading(false)
    }
  }

  // Polling du job bundles
  const pollBundlesJob = async (jobId, accessToken) => {
    let done = false
    let tries = 0
    setBundlesJobStatus('running')
    setStatus('action-bundles', 'info', 'Analyse bundles en cours...')
    while (!done && tries < 40) {
      tries++
      await new Promise((r) => setTimeout(r, 2000))
      const resp = await fetch(`${API_URL}/api/shopify/bundles/job/${jobId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })
      const data = await resp.json()
      const status = data?.status || data?.job?.status
      const result = data?.result || data?.job?.result
      if (status === 'done' || status === 'completed') {
        const suggestions = Array.isArray(result?.bundle_suggestions) ? result.bundle_suggestions : []
        const diagnostics = result?.diagnostics || null
        setInsightsData((prev) => ({
          ...(prev || {}),
          bundle_suggestions: suggestions
        }))
        setBundlesDiagnostics(diagnostics)
        if (suggestions.length === 0) {
          const reason = diagnostics?.no_result_reason || 'Analyse terminée: aucune opportunité détectée.'
          setStatus('action-bundles', 'warning', reason)
        } else {
          setStatus('action-bundles', 'success', `Analyse terminée: ${suggestions.length} suggestion(s).`)
        }
        setBundlesJobStatus('done')
        done = true
        break
      } else if (status === 'failed') {
        const failureMessage = data?.error || data?.job?.error || 'Erreur analyse'
        setInsightsError(failureMessage)
        setStatus('action-bundles', 'error', failureMessage)
        setBundlesJobStatus('failed')
        break
      }
    }
    if (!done) {
      setInsightsError('Analyse trop longue ou échouée')
      setStatus('action-bundles', 'error', 'Analyse trop longue ou échouée')
      setBundlesJobStatus('timeout')
    }
  }

  // Charger l’historique bundles
  const applyBundlesHistoryJob = (job) => {
    setSelectedBundlesHistoryJobId(job?.job_id || '')
    const result = job?.result || {}
    const suggestions = Array.isArray(result?.bundle_suggestions) ? result.bundle_suggestions : []
    const diagnostics = result?.diagnostics || null
    setInsightsData((prev) => ({
      ...(prev || {}),
      bundle_suggestions: suggestions
    }))
    setBundlesDiagnostics(diagnostics)
  }

  const loadBundlesHistory = async () => {
    try {
      setBundlesHistoryLoading(true)
      setInsightsError('')
      setBundlesHistoryOpen(true)
      clearStatus('action-bundles')
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Session expirée, reconnectez-vous')
      await waitForBackendReady({ retries: 8, retryDelayMs: 2000, timeoutMs: 22000 })
      await warmupBackend(session.access_token)
      const resp = await fetch(`${API_URL}/api/shopify/bundles/list`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      })
      const data = await resp.json()
      const jobs = Array.isArray(data?.jobs)
        ? data.jobs
        : (Array.isArray(data?.local_jobs) ? data.local_jobs : [])
      if (!resp.ok || !Array.isArray(jobs)) throw new Error(data?.detail || 'Erreur historique')
      setBundlesHistory(jobs)

      const firstWithResult = jobs.find((job) => Array.isArray(job?.result?.bundle_suggestions))
      if (firstWithResult) {
        applyBundlesHistoryJob(firstWithResult)
      }
    } catch (err) {
      setInsightsError(normalizeNetworkErrorMessage(err))
    } finally {
      setBundlesHistoryLoading(false)
    }
  }

  useEffect(() => {
    // Passive health probe to stabilize “Comparaison marché externe” status.
    // Also refresh periodically so status doesn't only change after a click.
    let cancelled = false

    const probe = async () => {
      try {
        await fetchBackendHealth({ retries: 2, retryDelayMs: 1500, timeoutMs: 20000 })
      } catch {
        // Keep silent: UI status uses last known value.
      }
    }

    probe()
    const intervalId = setInterval(() => {
      if (cancelled) return
      probe()
    }, 60_000)

    return () => {
      cancelled = true
      clearInterval(intervalId)
    }
  }, [])

  const loadBlockers = async (rangeOverride) => {
    const requestId = (blockersRequestIdRef.current += 1)
    try {
      const rangeValue = rangeOverride || analyticsRange
      setBlockersLoading(true)
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        setStatus('blockers', 'error', 'Session expirée, reconnectez-vous')
        return
      }

      await waitForBackendReady({ retries: 8, retryDelayMs: 2000, timeoutMs: 22000 })
      await warmupBackend(session.access_token)

      const { response, data } = await fetchJsonWithRetry(`${API_URL}/api/shopify/blockers?range=${rangeValue}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      }, {
        retries: 2,
        retryDelayMs: 2000,
        timeoutMs: 180000,
        retryStatuses: [429, 500, 502, 503, 504]
      })

      if (!response?.ok) {
        const detail = data?.detail || data?.error
        throw new Error(detail || `HTTP ${response?.status || 'ERR'}`)
      }

      if (data.success) {
        if (requestId !== blockersRequestIdRef.current) return
        setBlockersData(data)
        clearStatus('blockers')
      } else {
        setStatus('blockers', 'error', 'Analyse indisponible')
      }
    } catch (err) {
      console.error('Error loading blockers:', err)
      if (requestId !== blockersRequestIdRef.current) return
      const hasData = Array.isArray(blockersData?.blockers) && blockersData.blockers.length > 0
      const message = formatUserFacingError(err, 'Erreur analyse')
      setStatus('blockers', hasData ? 'warning' : 'error', message)
    } finally {
      if (requestId === blockersRequestIdRef.current) {
        setBlockersLoading(false)
      }
    }
  }

  const runActionAnalysis = async (actionKey, options = {}) => {
    try {
      setStatus(actionKey, 'info', 'Analyse en cours...')
      if (actionKey === 'action-rewrite') {
        setInsightsData(null)
      }

      if (actionKey === 'action-bundles') {
        await loadBundlesAsync()
        return
      }

      const loadAiPriceInsights = async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession()
          if (!session) return []

          // Reduce cold-start failures before calling an authenticated endpoint.
          await waitForBackendReady({ retries: 8, retryDelayMs: 2000, timeoutMs: 22000 })
          await warmupBackend(session.access_token)

          // Preferred: lightweight endpoint (if deployed).
          try {
            const { response, data: payload } = await fetchJsonWithRetry(`${API_URL}/api/ai/price-opportunities?limit=50`, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json'
              }
            }, {
              retries: 1,
              retryDelayMs: 1500,
              timeoutMs: 45000,
              retryStatuses: [429, 500, 502, 503, 504]
            })

            if (response?.ok && payload?.success) {
              if (Number.isFinite(Number(payload?.products_analyzed))) {
                setInsightsData((prev) => ({
                  ...(prev || {}),
                  products_analyzed: Number(payload.products_analyzed)
                }))
              }
              const items = Array.isArray(payload?.price_opportunities) ? payload.price_opportunities : []
              return items.slice(0, 10)
            }

            // If endpoint isn't available yet (404), fall back.
            if (response?.status !== 404) {
              const detail = payload?.detail || payload?.error
              throw new Error(detail || `HTTP ${response?.status || 'ERR'}`)
            }
          } catch (err) {
            // Continue to legacy fallback below.
            console.warn('Price-opportunities endpoint unavailable, using analyze-store fallback:', err)
          }

          // Legacy fallback: call analyze-store with a minimized products payload.
          let localProducts = Array.isArray(products) ? products : []
          if (localProducts.length === 0) {
            // Best effort: try to load products first.
            localProducts = await loadProducts()
          }
          if (localProducts.length === 0) return []

          const slimProducts = localProducts.slice(0, 120).map((p) => ({
            id: p?.id,
            title: p?.title,
            status: p?.status,
            vendor: p?.vendor,
            product_type: p?.product_type,
            variants: Array.isArray(p?.variants) ? p.variants.slice(0, 1).map((v) => ({ price: v?.price })) : []
          }))

          const { response: legacyResp, data: legacyPayload } = await fetchJsonWithRetry(`${API_URL}/api/ai/analyze-store`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              products: slimProducts,
              analytics: { timestamp: new Date().toISOString() },
              tier: subscription?.plan || 'standard'
            })
          }, {
            retries: 1,
            retryDelayMs: 1500,
            timeoutMs: 60000,
            retryStatuses: [429, 500, 502, 503, 504]
          })

          if (!legacyResp?.ok) {
            const detail = legacyPayload?.detail || legacyPayload?.error
            throw new Error(detail || `HTTP ${legacyResp?.status || 'ERR'}`)
          }
          if (!legacyPayload?.success) throw new Error(legacyPayload?.detail || 'Analyse IA indisponible')

          if (Number.isFinite(Number(legacyPayload?.products_analyzed))) {
            setInsightsData((prev) => ({
              ...(prev || {}),
              products_analyzed: Number(legacyPayload.products_analyzed)
            }))
          }

          const optimizations = legacyPayload?.analysis?.pricing_strategy?.optimizations
          if (!Array.isArray(optimizations) || optimizations.length === 0) return []

          const byTitle = new Map(slimProducts.map((p) => [String(p?.title || '').trim().toLowerCase(), p]))
          return optimizations.slice(0, 10).map((opt, index) => {
            const title = String(opt?.product || '').trim()
            const match = byTitle.get(title.toLowerCase())
            const currentPrice = Number(opt?.current_price)
            const suggestedPrice = Number(opt?.suggested_price)
            const targetDeltaPct = Number.isFinite(currentPrice) && currentPrice > 0 && Number.isFinite(suggestedPrice)
              ? Number((((suggestedPrice - currentPrice) / currentPrice) * 100).toFixed(2))
              : null

            return {
              product_id: match?.id ? String(match.id) : `ai-${index}`,
              title: title || match?.title || `Produit ${index + 1}`,
              suggestion: opt?.reason || 'Ajustement recommandé par analyse IA',
              current_price: Number.isFinite(currentPrice) ? currentPrice : null,
              suggested_price: Number.isFinite(suggestedPrice) ? suggestedPrice : null,
              target_delta_pct: Number.isFinite(targetDeltaPct) ? targetDeltaPct : null,
              reason: opt?.expected_impact || opt?.reason || 'Opportunité détectée par l’IA',
              source: 'ai_analyze_store'
            }
          })
        } catch (err) {
          console.warn('AI price fallback failed:', err)
          return []
        }
      }

      if (actionKey === 'action-blockers') {
        await loadBlockers()
      } else if (actionKey === 'action-images') {
        setInsightsLoading(true)
        try {
          const { data: { session } } = await supabase.auth.getSession()
          if (!session) {
            setStatus(actionKey, 'error', 'Session expirée, reconnectez-vous')
            return
          }

          await waitForBackendReady({ retries: 10, retryDelayMs: 2500, timeoutMs: 45000 })
          await warmupBackend(session.access_token)

          const rangeValue = analyticsRange
          const { response, data } = await fetchJsonWithRetry(`${API_URL}/api/shopify/image-risks?range=${encodeURIComponent(rangeValue)}&limit=120&ai=1`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json'
            }
          }, {
            retries: 2,
            retryDelayMs: 2000,
            timeoutMs: 90000,
            retryStatuses: [429, 500, 502, 503, 504]
          })

          if (!response?.ok) {
            const detail = data?.detail || data?.error
            throw new Error(detail || `HTTP ${response?.status || 'ERR'}`)
          }
          if (!data?.success) throw new Error(data?.detail || 'Analyse images indisponible')

          setInsightsData({
            success: true,
            image_risks: Array.isArray(data?.image_risks) ? data.image_risks : [],
            notes: Array.isArray(data?.notes) ? data.notes : [],
          })
          setStatus(actionKey, 'success', 'Analyse terminée.')
        } catch (err) {
          const message = normalizeNetworkErrorMessage(err, 'Erreur analyse')
          if (String(message || '').toLowerCase().includes('ia images non configurée') || String(message || '').includes('OPENAI_API_KEY')) {
            setStatus(actionKey, 'error', 'IA images non configurée côté backend (OPENAI_API_KEY). Ajoute la clé puis relance l’analyse.')
          } else {
            setStatus(actionKey, 'error', message)
          }
        } finally {
          setInsightsLoading(false)
        }
        return
      } else if (actionKey === 'action-rewrite') {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          setStatus(actionKey, 'error', 'Session expirée, reconnectez-vous')
          return
        }
        if (!options.productId) {
          setStatus(actionKey, 'warning', 'Sélectionne un produit à analyser')
          return
        }
        const response = await fetch(`${API_URL}/api/shopify/rewrite?product_id=${encodeURIComponent(options.productId)}`, {
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
        if (!data.success) {
          throw new Error(data.error || 'Erreur réécriture')
        }
        setInsightsData({
          rewrite_opportunities: [{
            product_id: data.product_id,
            title: data.title,
            reasons: data.reasons,
            recommendations: data.recommendations,
            suggested_title: data.suggested_title,
            suggested_description: data.suggested_description,
            current_title: data.current_title,
            current_description: data.current_description
          }],
          rewrite_ai: {
            enabled: true,
            generated: 1,
            notes: []
          }
        })
      } else {
        const includeAi = actionKey === 'action-price'

        // For pricing, generate AI opportunities first to avoid blocking on slow Shopify insights.
        if (actionKey === 'action-price') {
          setStatus(actionKey, 'info', 'Génération IA des opportunités de prix...')
          const aiPriceItems = await loadAiPriceInsights()
          if (Array.isArray(aiPriceItems) && aiPriceItems.length > 0) {
            const healthSaysOpenAI = backendHealth?.services?.openai === 'configured'
            const inferredMarket = healthSaysOpenAI ? { enabled: true, provider: 'openai', source: 'openai', inferred: true } : null
            const enriched = {
              success: true,
              price_opportunities: aiPriceItems,
              price_analysis: {
                items: aiPriceItems,
                market_comparison: inferredMarket
              },
              market_comparison: inferredMarket
            }

            setInsightsData(enriched)
            setStatus(actionKey, 'success', 'Analyse terminée (IA).')

            // Best-effort: try to fetch Shopify insights in background to enrich, but never fail the UI.
            loadInsights(undefined, true, options.productId, { silent: true }).then((data) => {
              if (!data) return
              const shopifyPriceItems = getPriceItems(data)
              if (Array.isArray(shopifyPriceItems) && shopifyPriceItems.length > 0) {
                // Merge: keep AI items + add any unique Shopify items
                const existingIds = new Set(aiPriceItems.map(i => i.product_id))
                const newItems = shopifyPriceItems.filter(i => !existingIds.has(i.product_id))
                const merged = [...aiPriceItems, ...newItems]
                setInsightsData(prev => ({
                  ...(prev || {}),
                  ...data,
                  price_opportunities: merged,
                  price_analysis: {
                    ...(data?.price_analysis || {}),
                    items: merged,
                    market_comparison: data?.market_comparison || data?.price_analysis?.market_comparison || inferredMarket
                  },
                  market_comparison: data?.market_comparison || data?.price_analysis?.market_comparison || inferredMarket
                }))
              }
            }).catch(() => {})

            return
          }
        }

        let data
        data = await loadInsights(undefined, includeAi, options.productId)

        let enrichedData = data
        let priceItems = getPriceItems(data)

        if (actionKey === 'action-price' && priceItems.length === 0) {
          setStatus(actionKey, 'info', 'Analyse IA avancée des prix en cours...')
          const aiPriceItems = await loadAiPriceInsights()
          if (Array.isArray(aiPriceItems) && aiPriceItems.length > 0) {
            enrichedData = {
              ...data,
              price_opportunities: aiPriceItems,
              price_analysis: {
                ...(data?.price_analysis || {}),
                items: aiPriceItems,
                market_comparison: data?.market_comparison || data?.price_analysis?.market_comparison || null
              }
            }
            setInsightsData(enrichedData)
            priceItems = aiPriceItems
          }
        }

        const listByActionKey = {
          'action-price': priceItems,
          'action-images': enrichedData.image_risks,
          'action-bundles': enrichedData.bundle_suggestions,
          'action-stock': enrichedData.stock_risks,
          'action-returns': enrichedData.return_risks,
        }

        const maybeList = listByActionKey[actionKey]
        if (Array.isArray(maybeList) && maybeList.length === 0) {
          setStatus(actionKey, 'warning', 'Analyse terminée: aucune opportunité détectée.')
          return
        }
      }
      setStatus(actionKey, 'success', 'Analyse terminée.')
    } catch (err) {
      setStatus(actionKey, 'error', normalizeNetworkErrorMessage(err, 'Erreur analyse'))
    }
  }

  const handleApplyBlockerAction = async (productId, action, statusKey = 'blockers') => {
    const plan = String(subscription?.plan || '').toLowerCase()
    if (!['pro', 'premium'].includes(plan)) {
      setStatus(statusKey, 'warning', 'Fonctionnalité réservée aux plans Pro/Premium')
      return
    }

    try {
      setApplyingBlockerActionId(`${productId}-${action.type}`)
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        setStatus(statusKey, 'error', 'Session expirée, reconnectez-vous')
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
          suggested_price: action.suggested_price,
          suggested_title: action.suggested_title,
          suggested_description: action.suggested_description
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }

      setStatus(statusKey, 'success', 'Succès: modification appliquée sur Shopify')
      loadBlockers()
    } catch (err) {
      console.error('Error applying blocker action:', err)
      setStatus(statusKey, 'error', formatUserFacingError(err, 'Erreur application'))
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
      setStatus('invoice', 'error', formatUserFacingError(err, 'Erreur chargement clients'))
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
      setStatus('invoice', 'error', formatUserFacingError(err, 'Erreur facture'))
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
    if (activeTab === 'action-rewrite' && (!products || products.length === 0)) {
      loadProducts()
    }
  }, [activeTab])

  useEffect(() => {
    if (!user) return
    let intervalId

    const checkShopifyConnection = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        const response = await fetch(`${API_URL}/api/shopify/keep-alive`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          }
        })

        if (!response.ok) return
        const data = await response.json()
        if (data.success && data.connected) {
          if (data.shop) {
            setShopifyUrl(data.shop)
          }
          setShopifyConnected(true)
        } else if (data.success && data.connected === false) {
          setShopifyConnected(false)
          setStatus('shopify', 'warning', 'Connexion Shopify expirée. Reconnecte ta boutique.')
        }
      } catch (err) {
        console.error('Shopify keep-alive failed:', err)
      }
    }

    checkShopifyConnection()
    intervalId = window.setInterval(checkShopifyConnection, 5 * 60 * 1000)

    return () => {
      if (intervalId) window.clearInterval(intervalId)
    }
  }, [user])

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
      setStatus('analyze', 'error', formatUserFacingError(err, 'Erreur analyse'))
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
      setStatus('apply-actions', 'error', formatUserFacingError(err, 'Erreur application'))
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
      setStatus(`rec-${productId}-${recommendationType}`, 'error', formatUserFacingError(err, 'Erreur application'))
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
              { key: 'action-rewrite', label: 'Réécriture intelligente' },
              { key: 'action-price', label: 'Optimisation prix' },
              { key: 'action-images', label: 'Assistance images' },
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
              <div className="flex flex-col sm:flex-row gap-3">
                <select
                  value={rewriteProductId}
                  onChange={(event) => setRewriteProductId(event.target.value)}
                  className="bg-gray-900 border border-gray-700 text-sm text-white rounded-lg px-3 py-2 min-w-[240px]"
                >
                  <option value="">Sélectionner un produit</option>
                  {(products || []).map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.title || product.name || `Produit ${product.id}`}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => runActionAnalysis('action-rewrite', { productId: rewriteProductId })}
                  disabled={insightsLoading || !rewriteProductId}
                  className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg disabled:opacity-50"
                >
                  {insightsLoading ? 'Analyse en cours...' : 'Lancer l\'analyse de réécriture'}
                </button>
              </div>
            </div>
            {renderStatus('action-rewrite')}
            {insightsData?.rewrite_ai?.notes?.length ? (
              <div className="text-xs text-amber-300 bg-amber-900/20 border border-amber-700/40 rounded px-3 py-2">
                {insightsData.rewrite_ai.notes.join(' · ')}
              </div>
            ) : null}
            <div className="space-y-3">
              {!rewriteProductId ? (
                <p className="text-sm text-gray-500">Sélectionne un produit pour lancer l'analyse.</p>
              ) : !insightsLoading && (!insightsData?.rewrite_opportunities || insightsData.rewrite_opportunities.length === 0) ? (
                <p className="text-sm text-gray-500">Aucune suggestion disponible pour l'instant.</p>
              ) : (
                insightsData?.rewrite_opportunities?.slice(0, 1).map((item, index) => (
                  <div key={item.product_id || index} className="bg-gray-900/70 border border-gray-700 rounded-lg p-6 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-white font-semibold text-lg">{item.title || 'Produit'}</p>
                        <p className="text-sm text-gray-400">{(item.reasons || []).join(' · ')}</p>
                      </div>
                      <div className="flex gap-2">
                        {(item.recommendations || []).includes('title') && (
                          <button
                            onClick={() => handleApplyBlockerAction(item.product_id, { type: 'title', suggested_title: item.suggested_title }, 'action-rewrite')}
                            className={`px-3 py-2 rounded text-sm font-semibold transition ${
                              applyingBlockerActionId === `${item.product_id}-title`
                                ? 'bg-amber-500 text-black shadow-[0_0_18px_rgba(245,158,11,0.8)]'
                                : 'bg-amber-400/90 hover:bg-amber-300 text-black'
                            }`}
                            disabled={applyingBlockerActionId === `${item.product_id}-title`}
                          >
                            Appliquer titre
                          </button>
                        )}
                        {(item.recommendations || []).includes('description') && (
                          <button
                            onClick={() => handleApplyBlockerAction(item.product_id, { type: 'description', suggested_description: item.suggested_description }, 'action-rewrite')}
                            className={`px-3 py-2 rounded text-sm font-semibold transition ${
                              applyingBlockerActionId === `${item.product_id}-description`
                                ? 'bg-amber-500 text-black shadow-[0_0_18px_rgba(245,158,11,0.8)]'
                                : 'bg-amber-400/90 hover:bg-amber-300 text-black'
                            }`}
                            disabled={applyingBlockerActionId === `${item.product_id}-description`}
                          >
                            Appliquer description
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="bg-gray-950/60 border border-gray-800 rounded-lg p-4">
                        <p className="text-sm font-semibold text-gray-300 mb-2">Contenu actuel</p>
                        <div className="text-sm text-gray-400 space-y-2">
                          <p><span className="text-gray-500">Titre:</span> {item.current_title || '—'}</p>
                          <div className="max-h-56 overflow-y-auto pr-2 text-base text-gray-300 whitespace-pre-wrap">
                            {item.current_description || '—'}
                          </div>
                        </div>
                      </div>
                      <div className="bg-gray-950/60 border border-gray-800 rounded-lg p-4">
                        <p className="text-sm font-semibold text-gray-300 mb-2">Suggestions IA</p>
                        <div className="text-sm text-gray-300 space-y-3">
                          {item.suggested_title ? (
                            <p className="text-base"><span className="text-gray-500">Titre suggéré:</span> {item.suggested_title}</p>
                          ) : null}
                          <div className="max-h-72 overflow-y-auto pr-2 text-base text-gray-200 whitespace-pre-wrap">
                            {item.suggested_description || '—'}
                          </div>
                        </div>
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
            {(() => {
              const priceItems = getPriceItems(insightsData)
              const rawMarketStatus = insightsData?.market_comparison || insightsData?.price_analysis?.market_comparison || null
              const healthSaysSerpApi = backendHealth?.services?.serpapi === 'configured'
              const healthSaysOpenAI = backendHealth?.services?.openai === 'configured'
              const marketStatus = rawMarketStatus || (healthSaysSerpApi
                ? { enabled: true, provider: 'serpapi', source: 'serpapi', mode: 'external_api', inferred: true }
                : healthSaysOpenAI
                  ? { enabled: true, provider: 'openai', source: 'openai', mode: 'ai_estimate', inferred: true }
                  : null)
              const withDelta = priceItems.filter((item) => Number.isFinite(Number(item.target_delta_pct)))
              const avgDelta = withDelta.length > 0
                ? (withDelta.reduce((sum, item) => sum + Number(item.target_delta_pct), 0) / withDelta.length)
                : null
              return (
                <>
            <div>
              <h2 className="text-white text-xl font-bold mb-2">Optimisation dynamique des prix</h2>
              <p className="text-gray-400">Analyse réelle de la performance prix puis recommandations actionnables.</p>
            </div>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm text-gray-400">{getInsightCount(priceItems)} opportunités</p>
                <p className={`text-xs ${marketStatus?.enabled ? 'text-green-400' : 'text-gray-400'}`}>
                  Comparaison marché externe: {marketStatus?.enabled ? 'Activée' : 'Non configurée'}
                  {marketStatus?.provider
                    ? marketStatus.provider === 'openai'
                      ? ' (IA — estimation)'
                      : marketStatus.provider === 'serpapi'
                        ? ' (SERP API)'
                        : ` (${marketStatus.provider})`
                    : ''}
                </p>
                {!marketStatus?.enabled ? (
                  <p className="text-xs text-gray-500">Analyse prix active via Shopify (commandes, stock, prix, conversion), même sans API marché externe.</p>
                ) : null}
              </div>
              <button
                onClick={() => runActionAnalysis('action-price')}
                disabled={insightsLoading}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg disabled:opacity-50"
              >
                {insightsLoading ? 'Analyse en cours...' : 'Lancer l\'analyse IA'}
              </button>
            </div>
            {renderStatus('action-price')}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gray-900/70 border border-gray-700 rounded-lg p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Produits analysés</p>
                <p className="text-2xl text-white font-bold mt-2">{formatCompactNumber(insightsData?.products_analyzed ?? (products?.length || 0))}</p>
              </div>
              <div className="bg-gray-900/70 border border-gray-700 rounded-lg p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Opportunités prix</p>
                <p className="text-2xl text-white font-bold mt-2">{formatCompactNumber(priceItems.length)}</p>
              </div>
              <div className="bg-gray-900/70 border border-gray-700 rounded-lg p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Ajustement moyen</p>
                <p className="text-2xl text-white font-bold mt-2">{avgDelta === null ? '—' : `${avgDelta > 0 ? '+' : ''}${avgDelta.toFixed(1)}%`}</p>
              </div>
            </div>
            <div className="space-y-3">
              {!insightsLoading && priceItems.length === 0 ? (
                <p className="text-sm text-gray-500">Aucune opportunité détectée.</p>
              ) : (
                priceItems.slice(0, 8).map((item, index) => (
                  <div key={item.product_id || index} className="bg-gray-900/70 border border-gray-700 rounded-lg p-4">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-white font-semibold">{item.title || item.product_id}</p>
                        <p className="text-xs text-gray-500">{item.suggestion || 'Ajuster le prix'}</p>
                        {(item.current_price !== undefined && item.current_price !== null) ? (
                          <p className="text-xs text-gray-400 mt-1">
                            Prix actuel: {formatCurrency(item.current_price, item.currency_code)}
                            {item.suggested_price !== undefined && item.suggested_price !== null ? ` • Prix suggéré: ${formatCurrency(item.suggested_price, item.currency_code)}` : ''}
                          </p>
                        ) : null}
                        {Number.isFinite(Number(item.target_delta_pct)) ? (
                          <p className={`text-xs font-semibold ${Number(item.target_delta_pct) > 0 ? 'text-green-400' : 'text-yellow-300'}`}>
                            Variation cible: {Number(item.target_delta_pct) > 0 ? '+' : ''}{Number(item.target_delta_pct).toFixed(1)}%
                          </p>
                        ) : null}
                        {item.reason ? <p className="text-xs text-gray-500 mt-1">{item.reason}</p> : null}
                      </div>
                      <div className="flex flex-col items-start md:items-end gap-2">
                        <button
                          onClick={() => handleApplyRecommendation(item.product_id, 'Prix')}
                          disabled={!item.product_id || applyingRecommendationId === `${item.product_id}-Prix`}
                          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 rounded"
                        >
                          {applyingRecommendationId === `${item.product_id}-Prix` ? 'Application...' : 'Appliquer prix'}
                        </button>
                        {renderStatus(`rec-${item.product_id}-Prix`)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
                </>
              )
            })()}
          </div>
        )}

        {activeTab === 'action-images' && (
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 space-y-6">
            <div>
              <h2 className="text-white text-2xl font-bold mb-2">Assistance images</h2>
              <p className="text-gray-300 text-base">Plan d’action ultra précis: combien d’images, quelles images produire, avec quel fond/ton/couleurs, et prompts prêts à utiliser.</p>
            </div>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <p className="text-base text-gray-300">{getInsightCount(insightsData?.image_risks)} produits analysés</p>
              <button
                onClick={() => runActionAnalysis('action-images')}
                disabled={insightsLoading}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg disabled:opacity-50"
              >
                {insightsLoading ? 'Analyse en cours...' : 'Lancer l\'analyse IA'}
              </button>
            </div>
            {renderStatus('action-images')}
            {Array.isArray(insightsData?.notes) && insightsData.notes.length > 0 ? (
              <div className="text-sm text-gray-400 space-y-1">
                {insightsData.notes.slice(0, 3).map((note, idx) => (
                  <div key={idx}>• {note}</div>
                ))}
              </div>
            ) : null}

            <div className="space-y-3">
              {!insightsLoading && (!insightsData?.image_risks || insightsData.image_risks.length === 0) ? (
                <p className="text-sm text-gray-500">Aucun signal détecté.</p>
              ) : (
                insightsData?.image_risks?.slice(0, 8).map((item, index) => (
                  <div key={item.product_id || index} className="bg-gray-900/70 border border-gray-700 rounded-lg p-4">
                    <p className="text-white font-semibold text-lg">{item.title || `Produit #${item.product_id}`}</p>
                    <p className="text-sm text-gray-400">
                      {item.images_count} images{item.missing_alt ? ' • alt manquant' : ''}
                      {item.view_to_cart_rate !== null && item.view_to_cart_rate !== undefined ? ` • v→panier ${Math.round(item.view_to_cart_rate * 100)}%` : ''}
                    </p>

                    {item?.recommendations ? (
                      <div className="mt-4 space-y-4">
                        <div className="text-base text-gray-200">
                          Cible: <span className="text-white font-semibold">{item.recommendations.target_total_images}</span> images
                          {Number.isFinite(Number(item.recommendations.recommended_new_images)) && item.recommendations.recommended_new_images > 0
                            ? <span className="text-gray-400"> • à produire: {item.recommendations.recommended_new_images}</span>
                            : <span className="text-gray-400"> • OK sur la quantité</span>
                          }
                        </div>

                        {item.recommendations?.source === 'ai' && item.recommendations?.ai ? (
                          <div className="text-sm text-gray-300 space-y-1">
                            <div className="text-white font-semibold">Direction artistique (spécifique produit)</div>
                            {item.recommendations.ai.tone ? <div>• Ton: <span className="text-white">{item.recommendations.ai.tone}</span></div> : null}
                            {item.recommendations.ai.background ? <div>• Fond / background: <span className="text-white">{item.recommendations.ai.background}</span></div> : null}
                            {Array.isArray(item.recommendations.ai.color_palette) && item.recommendations.ai.color_palette.length > 0 ? (
                              <div>• Palette: <span className="text-white">{item.recommendations.ai.color_palette.slice(0, 6).join(', ')}</span></div>
                            ) : null}
                            {Array.isArray(item.recommendations.ai.product_facts_used) && item.recommendations.ai.product_facts_used.length > 0 ? (
                              <div className="text-gray-400">
                                • Détails pris en compte: <span className="text-white">{item.recommendations.ai.product_facts_used.slice(0, 6).join(' · ')}</span>
                              </div>
                            ) : null}
                            {Array.isArray(item.recommendations.ai.notes) && item.recommendations.ai.notes.length > 0 ? (
                              <div className="text-gray-400">• Note: {item.recommendations.ai.notes[0]}</div>
                            ) : null}
                          </div>
                        ) : null}

                        {item.recommendations?.source === 'ai' && item.recommendations?.ai?.audit ? (
                          <div className="text-sm text-gray-300 space-y-2">
                            <div className="text-white font-semibold">Audit images existantes</div>
                            {Array.isArray(item.recommendations.ai.audit.issues) && item.recommendations.ai.audit.issues.length > 0 ? (
                              <div className="space-y-1">
                                <div className="text-gray-400">Problèmes détectés</div>
                                {item.recommendations.ai.audit.issues.slice(0, 5).map((line, idx) => (
                                  <div key={idx}>• {line}</div>
                                ))}
                              </div>
                            ) : null}
                            {Array.isArray(item.recommendations.ai.audit.quick_fixes) && item.recommendations.ai.audit.quick_fixes.length > 0 ? (
                              <div className="space-y-1">
                                <div className="text-gray-400">Fix rapides (aujourd’hui)</div>
                                {item.recommendations.ai.audit.quick_fixes.slice(0, 5).map((line, idx) => (
                                  <div key={idx}>• {line}</div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ) : null}


                        {item.recommendations?.source !== 'ai' && Array.isArray(item.recommendations.category_notes) && item.recommendations.category_notes.length > 0 ? (
                          <div className="text-sm text-gray-400 space-y-1">
                            {item.recommendations.category_notes.slice(0, 2).map((line, idx) => (
                              <div key={idx}>• {line}</div>
                            ))}
                          </div>
                        ) : null}

                        {Array.isArray(item.recommendations.action_plan) && item.recommendations.action_plan.length > 0 ? (
                          <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-4 space-y-2">
                            <div className="text-white font-semibold text-base">Plan d’action (quoi faire, dans l’ordre)</div>
                            <div className="space-y-2">
                              {item.recommendations.action_plan.slice(0, 7).map((stepObj, idx) => (
                                <div key={idx} className="text-sm text-gray-300">
                                  <div className="font-semibold text-white">{stepObj.step}. {stepObj.title}</div>
                                  {Array.isArray(stepObj.do) ? (
                                    <div className="mt-1 text-gray-300 space-y-1">
                                      {stepObj.do.slice(0, 4).map((line, lineIdx) => (
                                        <div key={lineIdx}>- {line}</div>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {Array.isArray(item.recommendations.images_to_create) && item.recommendations.images_to_create.length > 0 ? (
                          <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-4 space-y-2">
                            <div className="text-white font-semibold text-base">À créer (exactement)</div>
                            <div className="space-y-3">
                              {item.recommendations.images_to_create.slice(0, 8).map((img, idx) => (
                                <div key={idx} className="text-sm text-gray-300">
                                  <div className="font-semibold text-white">Image {img.index || (idx + 1)} — {img.name}</div>
                                  <div className="text-gray-300">{img.what_to_shoot}</div>
                                  {Array.isArray(img.uses_facts) && img.uses_facts.length > 0 ? (
                                    <div className="text-gray-400 mt-2">Pourquoi c’est adapté: <span className="text-white">{img.uses_facts.slice(0, 3).join(' · ')}</span></div>
                                  ) : null}
                                  <div className="text-gray-400 mt-1">
                                    Fond: {img.background} • Ton: {img.color_tone} • Props: {img.props}
                                  </div>
                                  <div className="text-gray-400">Caméra: {img.camera} • Lumière: {img.lighting}</div>
                                  {img.editing_notes ? <div className="text-gray-500">Retouche: {img.editing_notes}</div> : null}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {Array.isArray(item.recommendations.recommended_order) && item.recommendations.recommended_order.length > 0 ? (
                          <div className="text-sm text-gray-300 space-y-1">
                            <div className="text-white font-semibold">Ordre recommandé des images</div>
                            {item.recommendations.recommended_order.slice(0, 8).map((o, idx) => (
                              <div key={idx}>#{o.position} — <span className="text-white">{o.shot}</span> <span className="text-gray-400">({o.goal})</span></div>
                            ))}
                          </div>
                        ) : null}

                        {Array.isArray(item.recommendations.style_guidelines) && item.recommendations.style_guidelines.length > 0 ? (
                          <div className="text-sm text-gray-400 space-y-1">
                            <div className="text-white font-semibold">Style (fond, ton, background)</div>
                            {item.recommendations.style_guidelines.slice(0, 4).map((line, idx) => (
                              <div key={idx}>• {line}</div>
                            ))}
                          </div>
                        ) : null}

                        {Array.isArray(item.recommendations.prompt_blocks) && item.recommendations.prompt_blocks.length > 0 ? (
                          <div className="space-y-2">
                            <div className="text-white font-semibold">Prompts (génération d’images)</div>
                            {item.recommendations.prompt_blocks.slice(0, 3).map((pb, idx) => (
                              <div key={idx} className="bg-black/20 border border-gray-700 rounded-lg p-3 space-y-2">
                                <div className="text-sm text-gray-200 font-semibold">{pb.shot}</div>
                                {pb.outcome ? <div className="text-xs text-gray-400">Ce que tu obtiens: {pb.outcome}</div> : null}
                                {Array.isArray(pb.prompts) ? pb.prompts.slice(0, 2).map((pr, prIdx) => (
                                  <div key={prIdx} className="space-y-1">
                                    <div className="text-xs text-gray-400">{pr.label}{pr.when_to_use ? ` — ${pr.when_to_use}` : ''}</div>
                                    <div className="bg-black/30 border border-gray-700 rounded p-2 font-mono text-xs whitespace-pre-wrap break-words text-gray-200">
                                      {pr.prompt}
                                    </div>
                                  </div>
                                )) : null}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
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
                onClick={loadBundlesAsync}
                disabled={insightsLoading}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg disabled:opacity-50"
              >
                {insightsLoading ? 'Analyse en cours...' : 'Analyser'}
              </button>
              <button
                onClick={loadBundlesHistory}
                disabled={bundlesHistoryLoading}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg disabled:opacity-50"
              >
                {bundlesHistoryLoading ? 'Chargement historique...' : 'Historique'}
              </button>
            </div>
            {bundlesJobStatus !== 'idle' && (
              <p className="text-xs text-gray-400">État job: {bundlesJobStatus}</p>
            )}
            {renderStatus('action-bundles')}
            {bundlesDiagnostics && (
              <div className="bg-gray-900/60 border border-gray-700 rounded-lg p-4 text-sm">
                <div className="text-white font-semibold mb-1">Diagnostic analyse</div>
                <div className="text-gray-300">
                  {bundlesDiagnostics.orders_scanned || 0} commandes scannées • {bundlesDiagnostics.orders_with_2plus_items || 0} commandes avec 2+ articles • {bundlesDiagnostics.pairs_found || 0} paires trouvées
                </div>
                {bundlesDiagnostics.no_result_reason ? (
                  <div className="text-yellow-300 mt-2">{bundlesDiagnostics.no_result_reason}</div>
                ) : null}
                {Array.isArray(bundlesDiagnostics.recommendations) && bundlesDiagnostics.recommendations.length > 0 ? (
                  <div className="text-gray-400 mt-2">{bundlesDiagnostics.recommendations.join(' · ')}</div>
                ) : null}
              </div>
            )}
            <div className="space-y-3">
              {!insightsLoading && (!insightsData?.bundle_suggestions || insightsData.bundle_suggestions.length === 0) ? (
                <p className="text-sm text-gray-500">Aucune suggestion détectée.</p>
              ) : (
                insightsData?.bundle_suggestions?.slice(0, 8).map((item, index) => (
                  <div key={index} className="bg-gray-900/70 border border-gray-700 rounded-lg p-4">
                    <div className="flex flex-col gap-2">
                      <div>
                        <p className="text-white font-semibold">
                          {item.titles?.[0] || `#${item.pair?.[0] || 'A'}`} + {item.titles?.[1] || `#${item.pair?.[1] || 'B'}`}
                        </p>
                        <p className="text-xs text-gray-500">
                          {item.count || 0} commandes
                          {item.confidence ? ` • confiance ${item.confidence}` : ''}
                          {Array.isArray(item.discount_range_pct) && item.discount_range_pct.length >= 2 ? ` • remise ${item.discount_range_pct[0]}–${item.discount_range_pct[1]}%` : ''}
                        </p>
                      </div>

                      {item.offer?.message ? (
                        <div className="text-sm text-gray-300">
                          <div className="text-white font-semibold">Offre</div>
                          <div className="text-gray-300">{item.offer.message}</div>
                        </div>
                      ) : null}

                      {Array.isArray(item.placements) && item.placements.length > 0 ? (
                        <div className="text-sm text-gray-300">
                          <div className="text-white font-semibold">Où l’afficher</div>
                          <div className="text-gray-400">{item.placements.slice(0, 3).join(' · ')}</div>
                        </div>
                      ) : null}

                      {Array.isArray(item.copy) && item.copy.length > 0 ? (
                        <div className="text-sm text-gray-300">
                          <div className="text-white font-semibold">Copy (exemples)</div>
                          <div className="text-gray-400">{item.copy.slice(0, 2).join(' · ')}</div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
            {/* Historique des jobs bundles */}
            {bundlesHistoryOpen && (
              <div className="mt-6">
                <h3 className="text-white font-bold mb-2">Historique des analyses</h3>
                {bundlesHistory.length === 0 ? (
                  <p className="text-sm text-gray-500">Aucun ancien résultat disponible.</p>
                ) : (
                  <ul className="space-y-2">
                    {bundlesHistory.map((job, idx) => (
                      <li key={job.id || job.job_id || idx} className="bg-gray-900/70 border border-gray-700 rounded-lg p-3 flex flex-col gap-2">
                        <span className="text-xs text-gray-400">
                          {job.finished_at || job.started_at || job.created_at || '—'} • {job.status || 'unknown'}
                        </span>
                        {(job.result?.bundle_suggestions || job.bundle_suggestions) && (
                          <span className="text-sm text-white">{(job.result?.bundle_suggestions || job.bundle_suggestions || []).length} suggestions</span>
                        )}
                        <button
                          onClick={() => applyBundlesHistoryJob(job)}
                          className="self-start bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold py-1 px-3 rounded"
                          type="button"
                        >
                          {selectedBundlesHistoryJobId && selectedBundlesHistoryJobId === (job.job_id || '') ? 'Résultat affiché' : 'Charger ce résultat'}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
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

          {/* ====== FAB Bouton Assistant IA ====== */}
          <button
            onClick={() => setShowChatPanel(true)}
            className="fixed bottom-6 right-6 z-40 group"
            title="Assistant IA"
          >
            <div className="relative w-14 h-14 rounded-full bg-gradient-to-br from-yellow-500 to-yellow-700 shadow-2xl shadow-yellow-600/30 flex items-center justify-center border-2 border-yellow-400/40 transition-all duration-200 group-hover:scale-110 group-hover:shadow-yellow-500/50">
              <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="13" r="8" fill="#0b0d12" opacity="0.85"/>
                <circle cx="12" cy="12" r="2" fill="#facc15"/>
                <circle cx="20" cy="12" r="2" fill="#facc15"/>
                <path d="M11 17 Q16 21 21 17" stroke="#facc15" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                <circle cx="8" cy="8" r="1.5" fill="#facc15" opacity="0.7"/>
                <circle cx="24" cy="8" r="1.5" fill="#facc15" opacity="0.7"/>
              </svg>
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-gray-900"></span>
            </div>
          </button>

          {/* ====== Panneau latéral Assistant IA (style Sidekick) ====== */}
          {showChatPanel && (
            <>
              {/* Overlay (only when not expanded) */}
              {!chatExpanded && (
                <div
                  className="fixed inset-0 bg-black/40 z-50 transition-opacity duration-300"
                  onClick={() => setShowChatPanel(false)}
                />
              )}
              <div
                className={`fixed z-50 flex flex-col bg-[#0f1117] border-l border-gray-700/60 shadow-2xl transition-all duration-300 ease-in-out ${
                  chatExpanded
                    ? 'inset-0 rounded-none'
                    : 'top-0 right-0 bottom-0 w-full sm:w-[420px] md:w-[460px] rounded-l-2xl'
                }`}
                style={{ fontFamily: 'DM Sans, sans-serif' }}
              >
                {/* ── Header ── */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/50">
                  <div className="relative" ref={conversationMenuRef}>
                    <button
                      onClick={() => setShowConversationMenu(!showConversationMenu)}
                      className="flex items-center gap-1.5 text-sm text-gray-200 hover:text-white font-medium transition-colors"
                    >
                      <span className="truncate max-w-[180px]">{activeConversationTitle}</span>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0">
                        <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>

                    {/* ── Dropdown conversations ── */}
                    {showConversationMenu && (
                      <div className="absolute top-full left-0 mt-2 w-72 bg-[#1a1d27] border border-gray-700/60 rounded-xl shadow-2xl z-[60] overflow-hidden">
                        <div className="p-3 border-b border-gray-700/40">
                          <div className="relative">
                            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" width="14" height="14" viewBox="0 0 16 16" fill="none">
                              <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5"/>
                              <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                            </svg>
                            <input
                              type="text"
                              placeholder="Rechercher des conversations..."
                              value={conversationSearch}
                              onChange={(e) => setConversationSearch(e.target.value)}
                              className="w-full bg-[#0f1117] text-sm text-gray-300 pl-9 pr-8 py-2 rounded-lg border border-gray-700/50 focus:border-yellow-500/50 focus:outline-none placeholder:text-gray-600"
                            />
                            {conversationSearch && (
                              <button onClick={() => setConversationSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="max-h-64 overflow-y-auto">
                          <button
                            onClick={startNewConversation}
                            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700/40 transition-colors"
                          >
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                            Nouvelle conversation
                          </button>
                          {Object.entries(groupedConversations).map(([dateLabel, convs]) => (
                            <div key={dateLabel}>
                              <div className="px-4 py-1.5 text-[11px] text-gray-500 font-medium uppercase tracking-wider">{dateLabel}</div>
                              {convs.map(conv => (
                                <div key={conv.id} className={`group flex items-center gap-1 px-4 py-2 hover:bg-gray-700/40 transition-colors ${
                                  activeConversationId === conv.id ? 'bg-gray-700/30' : ''
                                }`}>
                                  {renamingConversationId === conv.id ? (
                                    <input
                                      autoFocus
                                      value={renamingValue}
                                      onChange={(e) => setRenamingValue(e.target.value)}
                                      onKeyDown={(e) => { if (e.key === 'Enter') renameConversation(conv.id, renamingValue); if (e.key === 'Escape') setRenamingConversationId(null) }}
                                      onBlur={() => renameConversation(conv.id, renamingValue)}
                                      className="flex-1 text-sm text-gray-200 bg-transparent border-b border-yellow-500 outline-none py-0.5"
                                    />
                                  ) : (
                                    <button
                                      onClick={() => loadConversation(conv)}
                                      className="flex-1 text-left text-sm text-gray-300 truncate"
                                    >
                                      {conv.title}
                                    </button>
                                  )}
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setRenamingConversationId(conv.id); setRenamingValue(conv.title) }}
                                    className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-gray-300 p-0.5 transition-opacity"
                                    title="Renommer"
                                  >
                                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M11 2L14 5L5 14H2V11L11 2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id) }}
                                    className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 p-0.5 transition-opacity"
                                    title="Supprimer"
                                  >
                                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                                  </button>
                                </div>
                              ))}
                            </div>
                          ))}
                          {filteredConversations.length === 0 && (
                            <div className="px-4 py-6 text-center text-sm text-gray-600">Aucune conversation</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={startNewConversation}
                      className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-700/40 transition-colors"
                      title="Nouvelle conversation"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    </button>
                    <button
                      onClick={() => setChatExpanded(!chatExpanded)}
                      className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-700/40 transition-colors"
                      title={chatExpanded ? 'Réduire' : 'Agrandir'}
                    >
                      {chatExpanded ? (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 2V6H14M6 14V10H2M14 10H10V14M2 6H6V2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 2L6 2V6M14 2L10 2V6M14 14L10 14V10M2 14L6 14V10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      )}
                    </button>
                    <button
                      onClick={() => setShowChatPanel(false)}
                      className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-700/40 transition-colors"
                      title="Fermer"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    </button>
                  </div>
                </div>

                {/* ── Messages / Welcome ── */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden">
                  {chatMessages.length === 0 ? (
                    /* Welcome Screen */
                    <div className="flex flex-col items-center justify-center h-full px-6">
                      {/* Logo avatar */}
                      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-yellow-500 to-yellow-700 flex items-center justify-center mb-5 shadow-lg shadow-yellow-600/20">
                        <svg width="36" height="36" viewBox="0 0 32 32" fill="none">
                          <circle cx="16" cy="13" r="8" fill="#0b0d12" opacity="0.85"/>
                          <circle cx="12" cy="12" r="2.2" fill="#facc15"/>
                          <circle cx="20" cy="12" r="2.2" fill="#facc15"/>
                          <path d="M11 17 Q16 21 21 17" stroke="#facc15" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                          <circle cx="8" cy="8" r="1.5" fill="#facc15" opacity="0.7"/>
                          <circle cx="24" cy="8" r="1.5" fill="#facc15" opacity="0.7"/>
                        </svg>
                      </div>
                      <p className="text-gray-500 text-sm mb-1">{getGreeting()}, {profile?.first_name || user?.user_metadata?.full_name?.split(' ')[0] || 'là'}</p>
                      <h3 className="text-white text-lg font-semibold mb-6">Comment puis-je vous aider ?</h3>
                      <button
                        onClick={() => sendChatMessage('Quoi de neuf ?')}
                        className="px-5 py-2 rounded-full border border-gray-600 text-gray-400 text-sm hover:border-yellow-500/50 hover:text-yellow-400 transition-all duration-200"
                      >
                        Quoi de neuf ?
                      </button>
                    </div>
                  ) : (
                    /* Messages list */
                    <div className="px-4 py-4 space-y-4">
                      {chatMessages.map((msg, idx) => (
                        <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                          {/* Avatar */}
                          {msg.role === 'assistant' && (
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-500 to-yellow-700 flex items-center justify-center shrink-0 mt-0.5 shadow-md">
                              <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
                                <circle cx="16" cy="13" r="8" fill="#0b0d12" opacity="0.85"/>
                                <circle cx="12" cy="12" r="2" fill="#facc15"/>
                                <circle cx="20" cy="12" r="2" fill="#facc15"/>
                                <path d="M11 17 Q16 21 21 17" stroke="#facc15" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                              </svg>
                            </div>
                          )}
                          {/* Bubble */}
                          <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl whitespace-pre-wrap break-words text-sm leading-relaxed ${
                            msg.role === 'user'
                              ? 'bg-yellow-600 text-black rounded-br-md'
                              : 'bg-[#1a1d27] text-gray-200 rounded-bl-md border border-gray-700/40'
                          }`}>
                            {msg.text}
                          </div>
                        </div>
                      ))}

                      {/* ── Typing indicator (3 bouncing dots with logo) ── */}
                      {chatLoading && (
                        <div className="flex gap-3 items-start">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-500 to-yellow-700 flex items-center justify-center shrink-0 shadow-md">
                            <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
                              <circle cx="16" cy="13" r="8" fill="#0b0d12" opacity="0.85"/>
                              <circle cx="12" cy="12" r="2" fill="#facc15"/>
                              <circle cx="20" cy="12" r="2" fill="#facc15"/>
                              <path d="M11 17 Q16 21 21 17" stroke="#facc15" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                            </svg>
                          </div>
                          <div className="bg-[#1a1d27] border border-gray-700/40 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1.5">
                            <span className="w-2 h-2 bg-yellow-500 rounded-full animate-bounce" style={{ animationDelay: '0ms', animationDuration: '0.8s' }}></span>
                            <span className="w-2 h-2 bg-yellow-500 rounded-full animate-bounce" style={{ animationDelay: '150ms', animationDuration: '0.8s' }}></span>
                            <span className="w-2 h-2 bg-yellow-500 rounded-full animate-bounce" style={{ animationDelay: '300ms', animationDuration: '0.8s' }}></span>
                          </div>
                        </div>
                      )}
                      <div ref={chatEndRef} />
                    </div>
                  )}
                </div>

                {/* ── Input area ── */}
                <div className="border-t border-gray-700/50 px-4 py-3">
                  {/* Attachment previews */}
                  {chatAttachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {chatAttachments.map((att, i) => (
                        <div key={i} className="relative group bg-[#1a1d27] border border-gray-700/50 rounded-lg p-1.5 flex items-center gap-2 text-xs text-gray-400 max-w-[180px]">
                          {att.preview ? (
                            <img src={att.preview} alt="" className="w-8 h-8 rounded object-cover" />
                          ) : (
                            <svg className="w-5 h-5 text-gray-500 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"/></svg>
                          )}
                          <span className="truncate">{att.name}</span>
                          <button onClick={() => removeAttachment(i)} className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <svg width="8" height="8" viewBox="0 0 12 12" fill="white"><path d="M3 3L9 9M9 3L3 9" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Dictation transcript preview */}
                  {voiceDictationMode && voiceDictationTranscript && (
                    <p className="text-gray-200 text-base font-medium text-center mb-3 px-2">{voiceDictationTranscript}</p>
                  )}

                  <div className={`flex items-end gap-2 bg-[#1a1d27] border border-gray-700/50 rounded-xl px-3 py-2 transition-colors ${
                    voiceDictationMode ? 'border-red-500/40' : 'focus-within:border-yellow-500/40'
                  }`}>
                    {/* Left buttons: + or Stop */}
                    <div className="relative shrink-0" ref={attachMenuRef}>
                      {voiceDictationMode ? (
                        /* Stop button (red square) */
                        <button
                          onClick={cancelDictation}
                          className="p-1.5 text-red-400 hover:text-red-300 rounded-lg transition-colors"
                          title="Arrêter la dictée"
                        >
                          <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="3" width="10" height="10" rx="2"/></svg>
                        </button>
                      ) : (
                        /* + button */
                        <>
                          <button
                            onClick={() => setShowAttachMenu(!showAttachMenu)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              showAttachMenu ? 'text-yellow-400 bg-gray-700/40' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-700/30'
                            }`}
                            title="Ajouter"
                          >
                            {showAttachMenu ? (
                              <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                            ) : (
                              <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
                            )}
                          </button>

                          {showAttachMenu && (
                            <div className="absolute bottom-full left-0 mb-2 w-60 bg-[#1e2130] border border-gray-700/60 rounded-xl shadow-2xl z-[60] overflow-hidden py-1">
                              <button onClick={() => { fileInputRef.current?.click() }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700/40 transition-colors">
                                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" className="text-gray-400"><path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" stroke="currentColor" strokeWidth="1.5"/></svg>
                                Fichiers
                              </button>
                              <button onClick={() => { fileInputRef.current?.click() }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700/40 transition-colors">
                                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" className="text-gray-400"><path d="M5 15L10 5L15 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><circle cx="10" cy="3" r="1.5" fill="currentColor"/></svg>
                                Charger depuis l'appareil
                              </button>
                              <div className="border-t border-gray-700/40 my-1"></div>
                              <button onClick={() => { setChatInput(prev => prev + '@'); setShowAttachMenu(false) }} className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700/40 transition-colors">
                                <span className="flex items-center gap-3"><svg width="16" height="16" viewBox="0 0 20 20" fill="none" className="text-gray-400"><circle cx="10" cy="10" r="4" stroke="currentColor" strokeWidth="1.5"/><path d="M14 10C14 12.2 12.2 14 10 14C7.8 14 6 12.2 6 10C6 7.8 7.8 6 10 6C12.2 6 14 7.8 14 10ZM14 10V11.5C14 12.88 15.12 14 16.5 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>Mention</span>
                                <span className="text-xs text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded">@</span>
                              </button>
                              <button onClick={() => { setChatInput(prev => prev + '/'); setShowAttachMenu(false) }} className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700/40 transition-colors">
                                <span className="flex items-center gap-3"><svg width="16" height="16" viewBox="0 0 20 20" fill="none" className="text-gray-400"><path d="M13 3L7 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>Compétences</span>
                                <span className="text-xs text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded">/</span>
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Waveform OR Textarea */}
                    {voiceDictationMode ? (
                      /* Animated waveform bars */
                      <div className="flex-1 flex items-center justify-center gap-[2px] h-10 px-2">
                        {voiceWaveBars.map((h, i) => (
                          <div
                            key={i}
                            className="w-[2px] bg-gray-400 rounded-full transition-all duration-75"
                            style={{ height: `${h}px` }}
                          />
                        ))}
                      </div>
                    ) : (
                      <textarea
                        ref={chatTextareaRef}
                        placeholder="Posez n'importe quelle question..."
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onFocus={() => {
                          setChatTextareaFocused(true)
                          if (chatTextareaRef.current) {
                            chatTextareaRef.current.style.height = 'auto'
                            chatTextareaRef.current.style.height = Math.max(80, Math.min(chatTextareaRef.current.scrollHeight, 168)) + 'px'
                          }
                        }}
                        onBlur={() => {
                          if (!chatInput.trim()) {
                            setChatTextareaFocused(false)
                            if (chatTextareaRef.current) chatTextareaRef.current.style.height = '44px'
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey && !chatLoading) {
                            e.preventDefault()
                            sendChatMessage()
                          }
                        }}
                        disabled={chatLoading}
                        rows={1}
                        className="flex-1 resize-none bg-transparent text-gray-200 text-sm placeholder:text-gray-600 outline-none py-2 overflow-y-auto"
                        style={{ minHeight: '44px', maxHeight: '168px', height: chatTextareaFocused ? undefined : '44px' }}
                        onInput={(e) => {
                          e.target.style.height = 'auto'
                          e.target.style.height = Math.min(e.target.scrollHeight, 168) + 'px'
                        }}
                      />
                    )}

                    {/* Right buttons */}
                    {voiceDictationMode ? (
                      /* ✕ Cancel + ✓ Confirm */
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={cancelDictation}
                          className="p-1.5 text-gray-500 hover:text-gray-300 transition-colors"
                          title="Annuler"
                        >
                          <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                        </button>
                        <button
                          onClick={confirmDictation}
                          className="p-1.5 text-yellow-500 hover:text-yellow-400 transition-colors"
                          title="Confirmer"
                        >
                          <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><path d="M3 8L6.5 11.5L13 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                      </div>
                    ) : chatInput.trim() ? (
                      /* Send button */
                      <button
                        onClick={sendChatMessage}
                        disabled={chatLoading}
                        className="p-1.5 text-yellow-500 hover:text-yellow-400 disabled:text-gray-600 transition-colors shrink-0"
                        title="Envoyer"
                      >
                        <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M3.105 2.29a1 1 0 011.265-.42l13 6.5a1 1 0 010 1.79l-13 6.5A1 1 0 013 15.79V11.5l8-1.5-8-1.5V4.21a1 1 0 01.105-.92z"/>
                        </svg>
                      </button>
                    ) : (
                      /* Mic button */
                      <button
                        onClick={startDictation}
                        className="p-1.5 text-gray-500 hover:text-gray-300 transition-colors shrink-0 rounded-lg"
                        title="Dictée vocale"
                      >
                        <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                          <rect x="7" y="2" width="6" height="10" rx="3" stroke="currentColor" strokeWidth="1.5"/>
                          <path d="M5 10C5 12.76 7.24 15 10 15C12.76 15 15 12.76 15 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          <path d="M10 15V18M7 18H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-2 px-1">
                    <p className="text-[10px] text-gray-600">ShopBrain IA peut faire des erreurs. Vérifiez les informations importantes.</p>
                    {/* Voice call button */}
                    <button
                      onClick={startVoiceCall}
                      className="p-1 text-gray-600 hover:text-yellow-500 transition-colors"
                      title="Appel vocal"
                    >
                      <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                        <path d="M3 5C3 3.9 3.9 3 5 3H7.5L9.5 7L7.5 8.5C8.57 10.67 10.33 12.43 12.5 13.5L14 11.5L18 13.5V16C18 17.1 17.1 18 16 18C8.82 18 3 12.18 3 5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>

                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileAttach}
                    multiple
                    accept="image/*,.pdf,.doc,.docx,.txt,.csv,.xlsx"
                    className="hidden"
                  />
                </div>
              </div>

              {/* ══════ Voice Call Mode (fullscreen overlay with TTS) ══════ */}
              {voiceCallMode && (
                <div className="absolute inset-0 z-[70] bg-gradient-to-b from-gray-100 to-white flex flex-col items-center justify-between py-8">
                  {/* Header icons */}
                  <div className="absolute top-3 right-3 flex items-center gap-1">
                    <button
                      onClick={() => setChatExpanded(!chatExpanded)}
                      className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
                      title={chatExpanded ? 'Réduire' : 'Agrandir'}
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 2L6 2V6M14 2L10 2V6M14 14L10 14V10M2 14L6 14V10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>
                    <button
                      onClick={endVoiceCall}
                      className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
                      title="Fermer"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    </button>
                  </div>

                  {/* Logo with rainbow halo */}
                  <div className="flex flex-col items-center mt-16">
                    <div className="relative">
                      <div className={`absolute -inset-8 rounded-full transition-all duration-500 ${
                        voiceCallSpeaking ? 'scale-110 opacity-80' : voiceCallListening ? 'scale-100 opacity-60 animate-pulse' : 'scale-90 opacity-30'
                      }`} style={{
                        background: 'conic-gradient(from 0deg, rgba(251,191,36,0.35), rgba(251,146,60,0.25), rgba(239,68,68,0.2), rgba(168,85,247,0.2), rgba(59,130,246,0.2), rgba(34,197,94,0.2), rgba(251,191,36,0.35))',
                        filter: 'blur(24px)'
                      }}></div>
                      <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-yellow-500 to-yellow-700 flex items-center justify-center shadow-xl">
                        <svg width="44" height="44" viewBox="0 0 32 32" fill="none">
                          <circle cx="16" cy="13" r="8" fill="#0b0d12" opacity="0.85"/>
                          <circle cx="12" cy="12" r="2.2" fill="#facc15"/>
                          <circle cx="20" cy="12" r="2.2" fill="#facc15"/>
                          <path d="M11 17 Q16 21 21 17" stroke="#facc15" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                          <circle cx="8" cy="8" r="1.5" fill="#facc15" opacity="0.7"/>
                          <circle cx="24" cy="8" r="1.5" fill="#facc15" opacity="0.7"/>
                        </svg>
                      </div>
                    </div>

                    {/* Status text */}
                    <div className="mt-8 text-center max-w-[280px]">
                      {voiceCallSpeaking && (
                        <p className="text-gray-700 text-sm font-medium animate-pulse">ShopBrain parle...</p>
                      )}
                      {voiceCallTranscript && (
                        <p className="text-gray-600 text-sm leading-relaxed mt-2">{voiceCallTranscript}</p>
                      )}
                      {!voiceCallTranscript && voiceCallListening && !voiceCallSpeaking && (
                        <p className="text-gray-400 text-sm animate-pulse">Parlez maintenant...</p>
                      )}
                      {!voiceCallListening && !voiceCallSpeaking && !voiceCallTranscript && (
                        <p className="text-gray-400 text-sm">Appuyez sur le micro pour parler</p>
                      )}
                    </div>
                  </div>

                  {/* Bottom controls: Mic + Hang up (phone icon) */}
                  <div className="flex items-center gap-6 mb-6">
                    <button
                      onClick={toggleVoiceCallMic}
                      disabled={voiceCallSpeaking}
                      className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-lg ${
                        voiceCallListening
                          ? 'bg-gray-200 text-gray-700'
                          : 'bg-gray-100 text-gray-400 border border-gray-200'
                      } ${voiceCallSpeaking ? 'opacity-50 cursor-not-allowed' : ''}`}
                      title={voiceCallListening ? 'Couper le micro' : 'Activer le micro'}
                    >
                      {voiceCallListening ? (
                        <svg width="24" height="24" viewBox="0 0 20 20" fill="none">
                          <rect x="7" y="2" width="6" height="10" rx="3" stroke="currentColor" strokeWidth="1.5"/>
                          <path d="M5 10C5 12.76 7.24 15 10 15C12.76 15 15 12.76 15 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          <path d="M10 15V18M7 18H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      ) : (
                        <svg width="24" height="24" viewBox="0 0 20 20" fill="none">
                          <rect x="7" y="2" width="6" height="10" rx="3" stroke="currentColor" strokeWidth="1.5"/>
                          <path d="M5 10C5 12.76 7.24 15 10 15C12.76 15 15 12.76 15 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          <path d="M10 15V18M7 18H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          <path d="M3 3L17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      )}
                    </button>
                    {/* Hang up button with phone icon */}
                    <button
                      onClick={endVoiceCall}
                      className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-lg transition-colors"
                      title="Raccrocher"
                    >
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="white">
                        <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 010-1.36C3.49 8.83 7.54 7 12 7s8.51 1.83 11.71 4.72c.18.18.29.44.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28a11.27 11.27 0 00-2.67-1.85.996.996 0 01-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/>
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}
