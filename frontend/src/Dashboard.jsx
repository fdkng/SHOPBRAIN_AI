import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useTranslation } from './LanguageContext'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://jgmsfadayzbgykzajvmw.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnbXNmYWRheXpiZ3lremFqdm13Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQwODk0NTksImV4cCI6MjA3OTY2NTQ1OX0.sg0O2QGdoKO5Zb6vcRJr5pSu2zlaxU3r7nHtyXb07hg'
)

const API_URL = 'https://shopbrain-backend.onrender.com'

// ⚡ Session cache — avoid redundant Supabase getSession() calls (each takes ~50ms)
let _cachedSession = null
let _cachedSessionTs = 0
const SESSION_CACHE_TTL = 30_000 // 30 seconds
const getCachedSession = async () => {
  if (_cachedSession && (Date.now() - _cachedSessionTs < SESSION_CACHE_TTL)) {
    return _cachedSession
  }
  const { data: { session } } = await supabase.auth.getSession()
  if (session) {
    _cachedSession = session
    _cachedSessionTs = Date.now()
  }
  return session
}

// ⚡ API response cache — avoid re-fetching same data on tab switches
const _apiCache = new Map()
const cachedFetch = async (url, options = {}, ttlMs = 60_000) => {
  const cacheKey = url + (options.body || '')
  const cached = _apiCache.get(cacheKey)
  if (cached && (Date.now() - cached.ts < ttlMs)) {
    return cached.data
  }
  const resp = await fetch(url, options)
  const data = await resp.json()
  _apiCache.set(cacheKey, { data, ts: Date.now() })
  return data
}

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
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
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
      // First try to load from active conversation (most reliable)
      const activeId = localStorage.getItem('activeConversationId')
      if (activeId) {
        const convStored = localStorage.getItem('chatConversations')
        if (convStored) {
          const convs = JSON.parse(convStored)
          if (Array.isArray(convs)) {
            const activeConv = convs.find(c => c.id === activeId)
            if (activeConv && Array.isArray(activeConv.messages) && activeConv.messages.length > 0) {
              return activeConv.messages.map(m => ({
                ...m,
                text: typeof m.text === 'string' ? m.text : (m.text ? String(m.text) : '')
              }))
            }
          }
        }
      }
      // Fallback to flat chatMessages
      const stored = localStorage.getItem('chatMessages')
      if (!stored) return []
      const parsed = JSON.parse(stored)
      if (!Array.isArray(parsed)) return []
      // Sanitize: ensure every message has text as a string (never object/undefined)
      return parsed.map(m => ({
        ...m,
        text: typeof m.text === 'string' ? m.text : (m.text ? String(m.text) : '')
      }))
    } catch {
      localStorage.removeItem('chatMessages')
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
  const { t: tCtx, language, setLanguage, LANGUAGES } = useTranslation()
  // Language is now managed by LanguageContext
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
      if (!stored) return []
      const parsed = JSON.parse(stored)
      if (!Array.isArray(parsed)) return []
      // Sanitize all conversation messages
      return parsed.map(c => ({
        ...c,
        messages: Array.isArray(c.messages) ? c.messages.map(m => ({
          ...m,
          text: typeof m.text === 'string' ? m.text : (m.text ? String(m.text) : '')
        })) : []
      }))
    } catch {
      localStorage.removeItem('chatConversations')
      return []
    }
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
  const [showProductPicker, setShowProductPicker] = useState(false)
  const [mentionedProduct, setMentionedProduct] = useState(null)
  const [productPickerSearch, setProductPickerSearch] = useState('')
  const productPickerRef = useRef(null)
  const [voiceListening, setVoiceListening] = useState(false)
  const voiceRecognitionRef = useRef(null)
  const [voiceDictationMode, setVoiceDictationMode] = useState(false)
  const [voiceDictationTranscript, setVoiceDictationTranscript] = useState('')
  const [voiceTranscribing, setVoiceTranscribing] = useState(false)
  const voiceWaveIntervalRef = useRef(null)
  const [voiceWaveBars, setVoiceWaveBars] = useState(Array(48).fill(2))
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const waveAnimFrameRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const chatTextareaRef = useRef(null)
  const [chatTextareaFocused, setChatTextareaFocused] = useState(false)
  const [analyticsRange, setAnalyticsRange] = useState('30d')
  const [analyticsData, setAnalyticsData] = useState(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [analyticsError, setAnalyticsError] = useState('')
  const [topProductsData, setTopProductsData] = useState(null)
  const [topProductsLoading, setTopProductsLoading] = useState(false)
  const [topProductsRange, setTopProductsRange] = useState('1d')
  const [insightsData, setInsightsData] = useState(null)
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [insightsError, setInsightsError] = useState('')
  const [priceInstructions, setPriceInstructions] = useState('')
  const [bundlesHistory, setBundlesHistory] = useState([])
  const [bundlesDiagnostics, setBundlesDiagnostics] = useState(null)
  const [bundlesJobStatus, setBundlesJobStatus] = useState('idle')
  const [bundlesHistoryOpen, setBundlesHistoryOpen] = useState(false)
  const [bundlesHistoryLoading, setBundlesHistoryLoading] = useState(false)
  const [selectedBundlesHistoryJobId, setSelectedBundlesHistoryJobId] = useState('')
  const [backendHealth, setBackendHealth] = useState(null)
  const [backendHealthTs, setBackendHealthTs] = useState(0)
  // Stock alert — liste multi-produit, auto-save, zéro popup
  const [stockProducts, setStockProducts] = useState([])
  const [stockProductsLoading, setStockProductsLoading] = useState(false)
  const stockLoadedRef = useRef(false)
  const [shopCurrency, setShopCurrency] = useState(() => {
    if (typeof window === 'undefined') return ''
    return localStorage.getItem('shopCurrencyCache') || ''
  })
  const [rewriteProductId, setRewriteProductId] = useState('')
  const [imageProductId, setImageProductId] = useState('')
  const [rewriteInstructions, setRewriteInstructions] = useState('')
  const [blockersData, setBlockersData] = useState(null)
  const [blockersLoading, setBlockersLoading] = useState(false)
  const [underperformingData, setUnderperformingData] = useState(null)
  const [underperformingLoading, setUnderperformingLoading] = useState(false)
  const [pixelStatus, setPixelStatus] = useState(null)
  const [pixelLoading, setPixelLoading] = useState(false)
  const [showPixelGuide, setShowPixelGuide] = useState(false)
  const [pixelCodeCopied, setPixelCodeCopied] = useState(false)
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
  // New: orders list for invoices tab
  const [ordersList, setOrdersList] = useState([])
  const [ordersListLoading, setOrdersListLoading] = useState(false)
  const [sendingInvoiceFor, setSendingInvoiceFor] = useState(null) // order row index being sent

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
      const session = await getCachedSession()
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

  const formatErrorDetail = (detail, fallback = t('error')) => {
    if (!detail) return fallback
    if (typeof detail === 'string') return detail
    if (typeof detail?.message === 'string') return detail.message
    try {
      return JSON.stringify(detail)
    } catch {
      return fallback
    }
  }

  const normalizeNetworkErrorMessage = (err, fallback = t('networkError')) => {
    const raw = String(err?.message || '').trim()
    if (err?.name === 'AbortError') {
      return t('analysisTimeout')
    }
    const isNetwork = /Failed to fetch|NetworkError|Load failed|fetch/i.test(raw)
    if (isNetwork) {
      const freshHealth = backendHealth && backendHealthTs && (Date.now() - backendHealthTs < 2 * 60 * 1000)
      if (freshHealth && backendHealth?.status === 'ok') {
        return t('networkErrorHealthy')
      }
      return t('backendWaking')
    }
    return raw || fallback
  }

  const formatUserFacingError = (err, fallback = t('anErrorOccurred')) => {
    const message = normalizeNetworkErrorMessage(err, fallback)
    return message || fallback
  }

  // 🧹 Strip HTML tags from AI-generated suggestions (show clean text to user)
  const stripHtmlTags = (html) => {
    if (!html || typeof html !== 'string') return html || ''
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n\n')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }

  // 🔗 Format chat text: Markdown links [text](url), **bold**, raw URLs → clickable React elements
  const formatChatText = (text) => {
    if (!text || typeof text !== 'string') return text || ''
    // Split by markdown links [text](url), **bold**, and raw URLs
    // Order matters: markdown links first, then bold, then raw URLs
    const parts = []
    // Regex to match: [text](url) | **bold** | raw URLs
    const combinedRegex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)|\*\*([^*]+)\*\*|(https?:\/\/[^\s)<>]+)/g
    let lastIndex = 0
    let match
    while ((match = combinedRegex.exec(text)) !== null) {
      // Add text before this match
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index))
      }
      if (match[1] && match[2]) {
        // Markdown link [text](url)
        parts.push(
          <a key={`link-${match.index}`} href={match[2]} target="_blank" rel="noopener noreferrer"
            className="text-yellow-400 hover:text-yellow-300 underline underline-offset-2 decoration-yellow-400/40 hover:decoration-yellow-300 transition-colors"
          >{match[1]}</a>
        )
      } else if (match[3]) {
        // **bold**
        parts.push(<strong key={`bold-${match.index}`} className="font-semibold">{match[3]}</strong>)
      } else if (match[4]) {
        // Raw URL
        const url = match[4].replace(/[.,;:!?)]+$/, '') // Trim trailing punctuation
        const trimmed = match[4].length - url.length
        let displayUrl = url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 45)
        if (displayUrl.length >= 45) displayUrl += '…'
        parts.push(
          <a key={`url-${match.index}`} href={url} target="_blank" rel="noopener noreferrer"
            className="text-yellow-400 hover:text-yellow-300 underline underline-offset-2 decoration-yellow-400/40 hover:decoration-yellow-300 transition-colors"
          >🔗 {displayUrl}</a>
        )
        if (trimmed > 0) parts.push(match[4].slice(-trimmed))
      }
      lastIndex = match.index + match[0].length
    }
    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex))
    }
    return parts.length > 0 ? parts : text
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

  // Translations are now managed by LanguageContext
  const t = tCtx

  const verifyPaymentSession = async (sessionId) => {
    try {
      const session = await getCachedSession()
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
      const session = await getCachedSession()
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
      const session = await getCachedSession()
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
        setStatus('api', 'success', t('keyGenerated') + ': ' + data.api_key)
        setApiKeys((prev) => [data.key, ...prev])
      } else {
        setStatus('api', 'error', t('error') + ': ' + (data.detail || t('error')))
      }
    } catch (err) {
      console.error('API key generate error:', err)
      setStatus('api', 'error', t('errorGeneratingKey'))
    } finally {
      setApiLoading(false)
    }
  }

  const handleRevokeApiKey = async (keyId) => {
    if (pendingRevokeKeyId !== keyId) {
      setPendingRevokeKeyId(keyId)
      setStatus('api', 'warning', t('confirmRevoke'))
      return
    }
    setPendingRevokeKeyId(null)

    try {
      setApiLoading(true)
      const session = await getCachedSession()
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
        setStatus('api', 'success', t('keyRevoked'))
      } else {
        setStatus('api', 'error', t('error') + ': ' + (data.detail || t('error')))
      }
    } catch (err) {
      console.error('API key revoke error:', err)
      setStatus('api', 'error', t('errorRevokingKey'))
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

  // Auto-load bundles when tab is opened (no button needed)
  const bundlesAutoLoadedRef = useRef(false)
  useEffect(() => {
    if (activeTab === 'action-bundles' && !bundlesAutoLoadedRef.current && !insightsLoading && subscription?.has_subscription) {
      // Only auto-load once per session, or if no data yet
      const hasBundleData = Array.isArray(insightsData?.bundle_suggestions) && insightsData.bundle_suggestions.length > 0
      if (!hasBundleData) {
        bundlesAutoLoadedRef.current = true
        loadBundlesAsync().catch(() => {})
      }
    }
  }, [activeTab])

  // ⚡ Debounced sync timer ref
  const syncConvTimerRef = useRef(null)

  // Strip images helper
  const stripImagesFromMessages = (messages) => (messages || []).map(m => {
    if (m.images) {
      const { images, ...rest } = m
      return { ...rest, hadImages: true }
    }
    return m
  })

  // ⚡ Sync conversations to Supabase (debounced)
  const syncConversationsToServer = useCallback(async (convs) => {
    try {
      const session = await getCachedSession()
      if (!session) return
      const convsToSync = convs.filter(c => c.messages && c.messages.length > 0)
      if (convsToSync.length === 0) return
      await fetch(`${API_URL}/api/conversations/save`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ conversations: convsToSync.map(c => ({
          ...c,
          messages: stripImagesFromMessages(c.messages)
        })) })
      })
    } catch (e) {
      console.warn('Sync conversations to server failed:', e)
    }
  }, [])

  // ⚡ Load conversations from Supabase on init
  const loadConversationsFromServer = useCallback(async () => {
    try {
      const session = await getCachedSession()
      if (!session) return
      const resp = await fetch(`${API_URL}/api/conversations`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      })
      const data = await resp.json()
      if (data.success && data.conversations && data.conversations.length > 0) {
        // Merge server conversations with local ones (server wins on conflict)
        setChatConversations(prev => {
          const serverIds = new Set(data.conversations.map(c => c.id))
          const localOnly = prev.filter(c => !serverIds.has(c.id))
          const merged = [...data.conversations, ...localOnly]
            .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
          // If we have an active conversation, reload its messages
          const activeId = localStorage.getItem('activeConversationId')
          if (activeId) {
            const activeConv = merged.find(c => c.id === activeId)
            if (activeConv && activeConv.messages && activeConv.messages.length > 0) {
              setChatMessages(activeConv.messages.map(m => ({
                ...m,
                text: typeof m.text === 'string' ? m.text : (m.text ? String(m.text) : '')
              })))
            }
          }
          return merged
        })
        console.log(`📚 Loaded ${data.conversations.length} conversations from server`)
      }
    } catch (e) {
      console.warn('Load conversations from server failed:', e)
    }
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        // ⚡ Save ALL messages (no more slice(-50) limit)
        const messagesForStorage = stripImagesFromMessages(chatMessages)
        localStorage.setItem('chatMessages', JSON.stringify(messagesForStorage))
      } catch (e) {
        // If localStorage is full, trim old messages
        try {
          const trimmed = stripImagesFromMessages(chatMessages.slice(-200))
          localStorage.setItem('chatMessages', JSON.stringify(trimmed))
        } catch (_) {
          console.warn('Could not save chat messages to localStorage')
        }
      }
    }
  }, [chatMessages])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        // Save to localStorage (fast cache)
        const convsForStorage = chatConversations.map(c => ({
          ...c,
          messages: stripImagesFromMessages(c.messages)
        }))
        localStorage.setItem('chatConversations', JSON.stringify(convsForStorage))
      } catch (e) {
        console.warn('Could not save chat conversations to localStorage:', e)
      }
      // ⚡ Debounced sync to Supabase (3 seconds after last change)
      if (syncConvTimerRef.current) clearTimeout(syncConvTimerRef.current)
      syncConvTimerRef.current = setTimeout(() => {
        syncConversationsToServer(chatConversations)
      }, 3000)
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

  // Auto-load stock products when Shopify is connected
  useEffect(() => {
    if (shopifyConnected && !stockLoadedRef.current) {
      stockLoadedRef.current = true
      loadStockProducts()
    }
  }, [shopifyConnected])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [chatMessages, chatLoading])

  // ⚡ Scroll to bottom when chat panel OPENS (or conversation changes)
  useEffect(() => {
    if (showChatPanel && chatMessages.length > 0) {
      // Use multiple delays to ensure DOM is fully rendered before scrolling
      const t1 = setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'auto' })
      }, 50)
      const t2 = setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'auto' })
      }, 200)
      const t3 = setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'auto' })
      }, 500)
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
    }
  }, [showChatPanel, activeConversationId])

  const initializeUser = async () => {
    try {
      const initStart = performance.now()
      const session = await getCachedSession()
      
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

      // ⚡ FAST INIT — single API call replaces 5 separate calls
      const initResp = await fetch(`${API_URL}/api/init`, { headers: authHeaders })

      if (initResp.ok) {
        const initData = await initResp.json()
        console.log(`⚡ /api/init loaded in ${initData.elapsed_ms || '?'}ms (cached: ${initData.cached || false})`)

        // Mark backend as alive so warmupBackend skips redundant pings
        setBackendHealth({ status: 'ok' })
        setBackendHealthTs(Date.now())

        // Profile
        if (initData.profile) {
          setProfile(initData.profile)
          setProfileFirstName(initData.profile.first_name || '')
          setProfileLastName(initData.profile.last_name || '')
          setTwoFAEnabled(Boolean(initData.profile.two_factor_enabled))
        }

        // Interface preferences
        if (initData.interface) {
          if (initData.interface.language) {
            setLanguage(initData.interface.language)
          }
        }

        // Notifications
        if (initData.notifications) {
          setNotifications({
            email_notifications: Boolean(initData.notifications.email_notifications),
            analysis_complete: Boolean(initData.notifications.analysis_complete),
            weekly_reports: Boolean(initData.notifications.weekly_reports),
            billing_updates: Boolean(initData.notifications.billing_updates)
          })
        }

        // Shopify connection
        if (initData.shopify?.connection?.shop_domain) {
          setShopifyUrl(initData.shopify.connection.shop_domain)
          setShopifyConnected(true)
        }

        setLoading(false)

        // ⚡ Load conversation history from Supabase in background
        loadConversationsFromServer()

        // Subscription — no retry loop, trust the DB
        const subData = initData.subscription
        if (subData && subData.has_subscription) {
          setSubscription({ success: true, ...subData })
          console.log(`⚡ Subscription: ${subData.plan} — loading products + analytics in parallel...`)
          // Load products and analytics IN PARALLEL
          Promise.all([
            loadProducts(),
            loadAnalytics(analyticsRange)
          ])
        } else {
          setSubscriptionMissing(true)
        }
      } else {
        // Fallback to old method if /api/init fails
        console.warn('⚡ /api/init failed, falling back to individual calls...')
        const profilePromise = fetch(`${API_URL}/api/auth/profile`, { headers: authHeaders })
        const shopPromise = fetch(`${API_URL}/api/shopify/connection`, { headers: authHeaders })
        const subPromise = fetch(`${API_URL}/api/subscription/status`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ user_id: session.user.id })
        })

        const [profileResp, shopResp, subResp] = await Promise.all([
          profilePromise, shopPromise, subPromise
        ])

        if (profileResp.ok) {
          const profileData = await profileResp.json()
          setProfile(profileData)
          setProfileFirstName(profileData.first_name || '')
          setProfileLastName(profileData.last_name || '')
        }

        if (shopResp.ok) {
          const shopData = await shopResp.json()
          if (shopData.success && shopData.connection?.shop_domain) {
            setShopifyUrl(shopData.connection.shop_domain)
            setShopifyConnected(true)
          }
        }

        setLoading(false)

        const data = subResp.ok ? await subResp.json() : null
        if (data && data.success && data.has_subscription) {
          setSubscription(data)
          Promise.all([loadProducts(), loadAnalytics(analyticsRange)])
        } else {
          setSubscriptionMissing(true)
        }
      }
      console.log(`⚡ Total init time: ${Math.round(performance.now() - initStart)}ms`)
    } catch (err) {
      console.error('Error:', err)
      setError(t('authError'))
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    sessionStorage.removeItem('sb_authenticated')
    await supabase.auth.signOut()
    window.location.hash = '#/'
  }

  const handleUpgrade = async () => {
    try {
      const currentPlan = subscription?.plan
      const nextPlan = currentPlan === 'standard' ? 'pro' : currentPlan === 'pro' ? 'premium' : null
      if (!nextPlan) {
        setStatus('upgrade', 'warning', t('alreadyPremium'))
        return
      }

      const session = await getCachedSession()
      if (!session) {
        setStatus('upgrade', 'error', t('sessionExpiredReconnect'))
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
        setStatus('upgrade', 'error', t('errorCreatingStripeSession'))
      }
    } catch (e) {
      console.error('Upgrade error:', e)
      setStatus('upgrade', 'error', t('anErrorOccurred'))
    }
  }

  const handleChangePlan = async (targetPlan) => {
    try {
      if (!targetPlan || targetPlan === subscription?.plan) return
      const session = await getCachedSession()
      if (!session) {
        setStatus('change-plan', 'error', t('sessionExpiredReconnect'))
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
        setStatus('change-plan', 'error', t('errorCreatingStripeSession'))
      }
    } catch (e) {
      console.error('Change plan error:', e)
      setStatus('change-plan', 'error', t('anErrorOccurred'))
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
      const tempTitle = firstUserMsg ? firstUserMsg.text.slice(0, 40) + (firstUserMsg.text.length > 40 ? '...' : '') : 'Nouvelle conversation'
      const newConvId = Date.now().toString()
      const newConv = {
        id: newConvId,
        title: tempTitle,
        messages: chatMessages,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      setChatConversations(prev => [newConv, ...prev])
      // 🏷️ Generate smart title in background
      ;(async () => {
        try {
          const s = await getCachedSession()
          if (!s) return
          const resp = await fetch(`${API_URL}/api/conversations/generate-title`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${s.access_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: chatMessages.slice(0, 6).map(m => ({ role: m.role, text: m.text })) })
          })
          const d = await resp.json()
          if (d.success && d.title) {
            setChatConversations(prev => prev.map(c => c.id === newConvId ? { ...c, title: d.title } : c))
          }
        } catch (e) { console.log('Title gen skipped:', e.message) }
      })()
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
    // Sanitize messages before loading
    const sanitizedMessages = (conv.messages || []).map(m => ({
      ...m,
      text: typeof m.text === 'string' ? m.text : (m.text ? String(m.text) : '')
    }))
    setChatMessages(sanitizedMessages)
    setActiveConversationId(conv.id)
    setShowConversationMenu(false)
    // Scroll to bottom after messages render
    setTimeout(() => {
      if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }, 50)
  }

  const renameConversation = (convId, newTitle) => {
    setChatConversations(prev => prev.map(c =>
      c.id === convId ? { ...c, title: newTitle } : c
    ))
    setRenamingConversationId(null)
    setRenamingValue('')
  }

  const deleteConversation = async (convId) => {
    setChatConversations(prev => prev.filter(c => c.id !== convId))
    if (activeConversationId === convId) {
      setChatMessages([])
      setActiveConversationId(null)
    }
    // ⚡ Also delete from Supabase
    try {
      const session = await getCachedSession()
      if (session) {
        fetch(`${API_URL}/api/conversations/${convId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        })
      }
    } catch (_) {}
  }

  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour >= 5 && hour < 12) return t('goodMorning')
    if (hour >= 12 && hour < 18) return t('goodAfternoon')
    return t('goodEvening')
  }

  const getConversationDateLabel = (dateStr) => {
    const date = new Date(dateStr)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    if (date.toDateString() === today.toDateString()) return "Aujourd'hui"
    if (date.toDateString() === yesterday.toDateString()) return t('yesterday')
    return date.toLocaleDateString(language === 'fr' ? 'fr-FR' : language === 'es' ? 'es-ES' : language === 'de' ? 'de-DE' : 'en-US', { day: 'numeric', month: 'long' })
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

  // Close product picker on outside click
  useEffect(() => {
    if (!showProductPicker) return
    const handleClick = (e) => {
      if (productPickerRef.current && !productPickerRef.current.contains(e.target)) {
        setShowProductPicker(false)
        setProductPickerSearch('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showProductPicker])

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

  // Start waveform animation (ChatGPT-style: dense bars across full width, voice-reactive)
  const NUM_WAVE_BARS = 48
  const startWaveAnimation = async () => {
    stopWaveAnimation()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      audioContextRef.current = audioCtx
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.7
      source.connect(analyser)
      analyserRef.current = analyser
      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      const smoothBars = new Array(NUM_WAVE_BARS).fill(2)
      // Pre-compute a bell-curve weight: center bars taller, edges shorter
      const bellWeights = Array.from({ length: NUM_WAVE_BARS }, (_, i) => {
        const x = (i - NUM_WAVE_BARS / 2) / (NUM_WAVE_BARS / 2)
        return 0.3 + 0.7 * Math.exp(-2.5 * x * x)
      })
      const updateBars = () => {
        analyser.getByteFrequencyData(dataArray)
        const binSize = Math.floor(dataArray.length / NUM_WAVE_BARS)
        for (let i = 0; i < NUM_WAVE_BARS; i++) {
          // Average a slice of the frequency spectrum for this bar
          let sum = 0
          const start = i * binSize
          for (let j = start; j < start + binSize && j < dataArray.length; j++) sum += dataArray[j]
          const avg = sum / binSize / 255 // 0-1
          const target = 2 + avg * 28 * bellWeights[i] // 2px idle, ~30px max
          const jitter = (Math.random() - 0.5) * 3 * avg
          smoothBars[i] = smoothBars[i] + (Math.max(2, Math.min(30, target + jitter)) - smoothBars[i]) * 0.4
        }
        setVoiceWaveBars([...smoothBars])
        waveAnimFrameRef.current = requestAnimationFrame(updateBars)
      }
      updateBars()
    } catch (err) {
      console.warn('AudioContext waveform not available, falling back to random:', err)
      voiceWaveIntervalRef.current = setInterval(() => {
        const bars = Array.from({ length: NUM_WAVE_BARS }, (_, i) => {
          const x = (i - NUM_WAVE_BARS / 2) / (NUM_WAVE_BARS / 2)
          const bell = 0.3 + 0.7 * Math.exp(-2.5 * x * x)
          return 2 + Math.random() * 20 * bell
        })
        setVoiceWaveBars(bars)
      }, 100)
    }
  }
  const stopWaveAnimation = () => {
    if (waveAnimFrameRef.current) { cancelAnimationFrame(waveAnimFrameRef.current); waveAnimFrameRef.current = null }
    if (voiceWaveIntervalRef.current) { clearInterval(voiceWaveIntervalRef.current); voiceWaveIntervalRef.current = null }
    if (analyserRef.current) { analyserRef.current = null }
    if (audioContextRef.current) { try { audioContextRef.current.close() } catch {}; audioContextRef.current = null }
    if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach(t => t.stop()); mediaStreamRef.current = null }
    setVoiceWaveBars(Array(NUM_WAVE_BARS).fill(2))
  }

  // ── Downsample audio blob to mono 16kHz WAV for fast Whisper upload ──
  const downsampleToWav = async (audioBlob) => {
    try {
      const arrayBuf = await audioBlob.arrayBuffer()
      const offlineCtx = new OfflineAudioContext(1, 1, 16000) // temp, replaced below
      const decoded = await offlineCtx.decodeAudioData !== undefined
        ? await new AudioContext().decodeAudioData(arrayBuf)
        : null
      if (!decoded) return audioBlob // fallback
      const duration = decoded.duration
      const targetSR = 16000
      const offCtx = new OfflineAudioContext(1, Math.ceil(duration * targetSR), targetSR)
      const source = offCtx.createBufferSource()
      source.buffer = decoded
      source.connect(offCtx.destination)
      source.start(0)
      const rendered = await offCtx.startRendering()
      const pcm = rendered.getChannelData(0)
      // Build WAV
      const wavBuf = new ArrayBuffer(44 + pcm.length * 2)
      const view = new DataView(wavBuf)
      const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)) }
      writeStr(0, 'RIFF')
      view.setUint32(4, 36 + pcm.length * 2, true)
      writeStr(8, 'WAVE')
      writeStr(12, 'fmt ')
      view.setUint32(16, 16, true)
      view.setUint16(20, 1, true)
      view.setUint16(22, 1, true)
      view.setUint32(24, targetSR, true)
      view.setUint32(28, targetSR * 2, true)
      view.setUint16(32, 2, true)
      view.setUint16(34, 16, true)
      writeStr(36, 'data')
      view.setUint32(40, pcm.length * 2, true)
      for (let i = 0; i < pcm.length; i++) {
        const s = Math.max(-1, Math.min(1, pcm[i]))
        view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
      }
      const wavBlob = new Blob([wavBuf], { type: 'audio/wav' })
      console.log(`STT: downsampled ${audioBlob.size} bytes webm → ${wavBlob.size} bytes wav (16kHz mono)`)
      return wavBlob
    } catch (e) {
      console.warn('STT: downsample failed, using original blob', e)
      return audioBlob
    }
  }

  // ── OpenAI Whisper transcription helper ──
  const transcribeWithWhisper = async (audioBlob, accessToken) => {
    try {
      console.log('STT: transcribeWithWhisper called, blob size=', audioBlob ? audioBlob.size : null)
      const sttStart = Date.now()
      // Downsample to small mono 16kHz WAV
      const smallBlob = await downsampleToWav(audioBlob)
      console.log(`STT: downsample took ${Date.now() - sttStart}ms`)
      // Use pre-fetched token or fetch now
      let token = accessToken
      if (!token) {
        const session = await getCachedSession()
        if (!session) return null
        token = session.access_token
      }
      const formData = new FormData()
      const ext = smallBlob.type.includes('wav') ? 'wav' : 'webm'
      formData.append('audio', smallBlob, `recording.${ext}`)
      const uploadStart = Date.now()
      const response = await fetch(`${API_URL}/api/ai/stt`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      })
      const uploadEnd = Date.now()
      console.log(`STT: upload+server time ${(uploadEnd - uploadStart)}ms`)
      if (!response.ok) throw new Error(`STT API error: ${response.status}`)
      const data = await response.json()
      const sttEnd = Date.now()
      console.log(`STT: total time ${(sttEnd - sttStart)}ms`)
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
      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 16000 })
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      recorder.start(250) // collect chunks every 250ms
      mediaRecorderRef.current = recorder
    } catch (err) {
      console.warn('MediaRecorder failed to start:', err)
    }
  }

  const stopMediaRecorder = () => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current
      if (recorder && recorder.state !== 'inactive') {
        let settled = false
        const finish = () => {
          if (settled) return
          settled = true
          mediaRecorderRef.current = null
          resolve()
        }
        recorder.onstop = finish
        try { recorder.requestData() } catch {}
        try { recorder.stop() } catch { finish() }
        setTimeout(finish, 500)
      } else {
        mediaRecorderRef.current = null
        resolve()
      }
    })
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
    setVoiceTranscribing(false)
    // Start waveform first (requests mic permission)
    await startWaveAnimation()
    // Start MediaRecorder for Whisper transcription
    if (mediaStreamRef.current) startMediaRecorder(mediaStreamRef.current)
    setVoiceListening(true)
  }

  const confirmDictation = async () => {
    dictationActiveRef.current = false
    if (voiceRecognitionRef.current) try { voiceRecognitionRef.current.stop() } catch {}
    setVoiceTranscribing(true)
    // Pre-fetch auth token IN PARALLEL with stopping the recorder (saves ~200ms)
    const sessionPromise = supabase.auth.getSession()
    // Wait for MediaRecorder to finalize all chunks
    await stopMediaRecorder()
    // Get the audio blob BEFORE killing the stream
    const audioBlob = getRecordedBlob()
    // Stop waveform while we transcribe
    stopWaveAnimation()
    // Get pre-fetched token
    let accessToken = null
    try {
      const { data: { session } } = await sessionPromise
      accessToken = session?.access_token || null
    } catch {}
    // Transcribe with Whisper
    if (audioBlob && audioBlob.size > 500) {
      const text = await transcribeWithWhisper(audioBlob, accessToken)
      if (text) setChatInput(prev => (prev ? prev + ' ' : '') + text)
    } else {
      console.warn('STT skipped: empty or too small audio blob')
    }
    setVoiceTranscribing(false)
    setVoiceDictationMode(false)
    setVoiceDictationTranscript('')
    setVoiceListening(false)
  }

  const cancelDictation = async () => {
    dictationActiveRef.current = false
    await stopMediaRecorder()
    setVoiceTranscribing(false)
    setVoiceDictationMode(false)
    setVoiceDictationTranscript('')
    setVoiceListening(false)
    stopWaveAnimation()
  }


  // ============ CHAT SEND ============
  const sendChatMessage = async (directMessage) => {
    // Guard: if directMessage is a React event or non-string, ignore it
    const rawMessage = (typeof directMessage === 'string') ? directMessage : ''
    const messageToSend = rawMessage || chatInput.trim()
    if (!messageToSend && chatAttachments.length === 0) return
    
    try {
      setChatLoading(true)
      
      const userMessage = messageToSend || ''
      // Capture current attachments and clear them immediately
      const currentAttachments = [...chatAttachments]
      setChatAttachments([])
      
      // Build user message object with optional image previews for display
      const userMsgObj = { role: 'user', text: userMessage }
      if (currentAttachments.length > 0) {
        userMsgObj.images = currentAttachments.filter(a => a.preview).map(a => a.preview)
        userMsgObj.attachmentNames = currentAttachments.map(a => a.name)
      }
      // Attach mentioned product info for display in the message bubble
      if (mentionedProduct) {
        userMsgObj.mentionedProduct = {
          title: mentionedProduct.title,
          price: mentionedProduct.variants?.[0]?.price || '',
          currency: mentionedProduct.variants?.[0]?.currency || 'CAD',
          image: mentionedProduct.image?.src || mentionedProduct.images?.[0]?.src || '',
        }
      }
      setChatMessages(prev => [...prev, userMsgObj])
      setChatInput('')
      // Shrink textarea back to default
      setChatTextareaFocused(false)
      if (chatTextareaRef.current) chatTextareaRef.current.style.height = '44px'
      
      // Auto-create conversation on first message
      let isNewConversation = false
      let newConvId = activeConversationId
      if (!activeConversationId) {
        isNewConversation = true
        newConvId = Date.now().toString()
        const tempTitle = (userMessage || 'Image').slice(0, 40) + ((userMessage || '').length > 40 ? '...' : '')
        const newConv = {
          id: newConvId,
          title: tempTitle,
          messages: [userMsgObj],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
        setChatConversations(prev => [newConv, ...prev])
        setActiveConversationId(newConvId)
      }
      
      const session = await getCachedSession()
      if (!session) throw new Error(t('sessionExpiredReconnect'))

      // Build payload with images if attached
      const chatPayload = { message: userMessage || t('defaultVisionPrompt') }
      if (currentAttachments.length > 0) {
        chatPayload.images = currentAttachments
          .filter(a => a.preview && a.type?.startsWith('image/'))
          .map(a => a.preview)
      }
      // Inject mentioned product context
      if (mentionedProduct) {
        const p = mentionedProduct
        const variant = p.variants?.[0] || {}
        const imgUrl = p.image?.src || p.images?.[0]?.src || ''
        chatPayload.context = [
          `${t('mentionedProductContext')}:`,
          `${t('titleLabel')}: ${p.title}`,
          `${t('priceLabel')}: ${variant.price || 'N/A'} ${variant.currency || 'CAD'}`,
          `${t('descriptionLabel')}: ${(p.body_html || '').replace(/<[^>]*>/g, '').slice(0, 800)}`,
          `${t('tagsLabel')}: ${p.tags || t('none')}`,
          `${t('typeLabel')}: ${p.product_type || t('notSpecified')}`,
          `${t('vendorLabel')}: ${p.vendor || t('notSpecified')}`,
          `${t('mainImage')}: ${imgUrl}`,
          `${t('variantsLabel')}: ${(p.variants || []).map(v => `${v.title} - ${v.price}`).join(', ')}`,
          `${t('stockLabel')}: ${(p.variants || []).map(v => `${v.title}: ${v.inventory_quantity ?? 'N/A'}`).join(', ')}`,
          `${t('statusLabel')}: ${p.status || t('active')}`,
        ].join('\n')
        setMentionedProduct(null)
      }

      const resp = await fetch(`${API_URL}/api/ai/chat`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(chatPayload)
      })
      const data = await resp.json()

      if (data.success) {
        const aiMsg = { role: 'assistant', text: data.message }
        setChatMessages(prev => {
          const updated = [...prev, aiMsg]
          // Persist to conversation
          const convIdToUpdate = newConvId || activeConversationId
          if (convIdToUpdate) {
            setChatConversations(prev2 => prev2.map(c =>
              c.id === convIdToUpdate ? { ...c, messages: updated, updatedAt: new Date().toISOString() } : c
            ))
          }
          return updated
        })
        // 🏷️ Auto-generate smart title for NEW conversations (after first AI response)
        if (isNewConversation && newConvId) {
          try {
            const titleSession = await getCachedSession()
            if (titleSession) {
              const titleResp = await fetch(`${API_URL}/api/conversations/generate-title`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${titleSession.access_token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: [userMsgObj, aiMsg] })
              })
              const titleData = await titleResp.json()
              if (titleData.success && titleData.title) {
                setChatConversations(prev => prev.map(c =>
                  c.id === newConvId ? { ...c, title: titleData.title } : c
                ))
              }
            }
          } catch (e) { console.log('Title generation skipped:', e.message) }
        }
      } else {
        setChatMessages(prev => [...prev, { 
          role: 'assistant', 
          text: t('error') + ': ' + (data.detail || t('unknownError')) 
        }])
      }
    } catch (err) {
      setChatMessages(prev => [...prev, { 
        role: 'assistant', 
        text: formatUserFacingError(err, t('connectionError'))
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
      setStatus('profile', 'warning', t('invalidImageFormat'))
      event.target.value = ''
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setStatus('profile', 'warning', t('imageTooLarge'))
      event.target.value = ''
      return
    }

    try {
      setAvatarUploading(true)
      const session = await getCachedSession()
      if (!session) {
        setStatus('profile', 'error', t('sessionExpiredReconnect'))
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
        setStatus('profile', 'success', t('avatarUpdated'))
      } else {
        setStatus('profile', 'error', t('error') + ': ' + (data.detail || t('unknownError')))
      }
    } catch (err) {
      console.error('Avatar upload error:', err)
      setStatus('profile', 'error', t('errorUpload'))
    } finally {
      setAvatarUploading(false)
      event.target.value = ''
    }
  }

  const handleSaveProfile = async () => {
    try {
      setSaveLoading(true)
      const session = await getCachedSession()
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
        setStatus('profile', 'success', t('profileUpdated'))
        await initializeUser()
      } else {
        setStatus('profile', 'error', t('error') + ': ' + (data.detail || t('error')))
      }
    } catch (err) {
      setStatus('profile', 'error', formatUserFacingError(err, t('profileError')))
    } finally {
      setSaveLoading(false)
    }
  }

  const handleUpdatePassword = async () => {
    if (!currentPassword || !newPassword) {
      setStatus('password', 'warning', t('fillAllFields'))
      return
    }
    if (newPassword !== confirmPassword) {
      setStatus('password', 'warning', t('passwordsDontMatch'))
      return
    }
    if (newPassword.length < 8) {
      setStatus('password', 'warning', t('passwordMinChars'))
      return
    }
    try {
      setSaveLoading(true)
      const session = await getCachedSession()
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
        setStatus('password', 'success', t('passwordUpdated'))
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      } else {
        setStatus('password', 'error', t('error') + ': ' + (data.detail || t('error')))
      }
    } catch (err) {
      setStatus('password', 'error', formatUserFacingError(err, t('passwordError')))
    } finally {
      setSaveLoading(false)
    }
  }

  const handleToggle2FA = async () => {
    try {
      setSaveLoading(true)
      const session = await getCachedSession()
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
        setStatus('2fa', 'success', '2FA ' + (twoFAEnabled ? t('disabled') : t('enabled')))
      } else {
        setStatus('2fa', 'error', t('error') + ': ' + (data.detail || t('error')))
      }
    } catch (err) {
      setStatus('2fa', 'error', formatUserFacingError(err, t('error2FA')))
    } finally {
      setSaveLoading(false)
    }
  }

  const handleSaveInterface = async () => {
    try {
      setSaveLoading(true)
      // Always save locally first (works immediately)
      localStorage.setItem('language', language)
      localStorage.setItem('darkMode', JSON.stringify(darkMode))

      // Try backend save (best-effort — table may not exist yet)
      try {
        const session = await getCachedSession()
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
        if (!data.success) {
          console.warn('Backend interface save failed (using localStorage):', data.detail)
        }
      } catch (backendErr) {
        console.warn('Backend interface save unavailable (using localStorage):', backendErr.message)
      }

      setStatus('interface', 'success', t('settingsUpdated'))
    } catch (err) {
      setStatus('interface', 'error', formatUserFacingError(err, t('errorSettings')))
    } finally {
      setSaveLoading(false)
    }
  }

  const handleSaveNotifications = async () => {
    try {
      setSaveLoading(true)
      // Save locally first
      localStorage.setItem('notifications', JSON.stringify(notifications))

      // Try backend save (best-effort)
      try {
        const session = await getCachedSession()
        const response = await fetch(`${API_URL}/api/settings/notifications`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(notifications)
        })
        const data = await response.json()
        if (!data.success) {
          console.warn('Backend notification save failed (using localStorage):', data.detail)
        }
      } catch (backendErr) {
        console.warn('Backend notification save unavailable (using localStorage):', backendErr.message)
      }

      setStatus('notifications', 'success', t('preferencesSaved'))
    } catch (err) {
      setStatus('notifications', 'error', formatUserFacingError(err, t('errorNotifications')))
    } finally {
      setSaveLoading(false)
    }
  }

  const handleCancelSubscription = async () => {
    if (!pendingCancelSubscription) {
      setPendingCancelSubscription(true)
      setStatus('billing-cancel', 'warning', t('confirmCancelSubscription'))
      return
    }
    setPendingCancelSubscription(false)
    try {
      setSaveLoading(true)
      const session = await getCachedSession()
      const response = await fetch(`${API_URL}/api/subscription/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      })
      const data = await response.json()
      if (data.success) {
        setStatus('billing-cancel', 'success', t('subscriptionCancelled'))
        await initializeUser()
      } else {
        setStatus('billing-cancel', 'error', t('error') + ': ' + (data.detail || t('error')))
      }
    } catch (err) {
      setStatus('billing-cancel', 'error', formatUserFacingError(err, t('errorCancellation')))
    } finally {
      setSaveLoading(false)
    }
  }

  const handleUpdatePaymentMethod = async () => {
    try {
      setSaveLoading(true)
      const session = await getCachedSession()
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
        setStatus('billing-payment', 'error', t('error') + ': ' + (data.detail || t('error')))
      }
    } catch (err) {
      setStatus('billing-payment', 'error', formatUserFacingError(err, t('errorPayment')))
    } finally {
      setSaveLoading(false)
    }
  }

  const connectShopify = async () => {
    if (shopifyConnected && !shopifyToken) {
      setStatus('shopify', 'success', t('shopifyAlreadyConnected'))
      return
    }
    if (!shopifyUrl || !shopifyToken) {
      setStatus('shopify', 'warning', t('fillUrlAndToken'))
      return
    }
    
    // Normalize: lowercase, strip protocol, strip trailing slashes
    let cleanUrl = shopifyUrl.trim().toLowerCase().replace(/\/+$/, '')
    if (cleanUrl.startsWith('https://')) cleanUrl = cleanUrl.slice(8)
    if (cleanUrl.startsWith('http://')) cleanUrl = cleanUrl.slice(7)
    // If user typed just the store name, append .myshopify.com
    if (!cleanUrl.includes('.')) cleanUrl = cleanUrl + '.myshopify.com'
    setShopifyUrl(cleanUrl)
    
    // Valider le format de l'URL
    if (!cleanUrl.endsWith('.myshopify.com')) {
      setStatus('shopify', 'warning', t('invalidUrlFormat'))
      return
    }
    
    try {
      setLoading(true)
      setError('')
      
      const session = await getCachedSession()
      
      if (!session) {
        setStatus('shopify', 'error', t('sessionExpiredReconnect'))
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
          shopify_shop_url: cleanUrl,
          shopify_access_token: shopifyToken
        })
      })
      
      if (!testResponse.ok) {
        const errorData = await testResponse.json()
        throw new Error(errorData.detail || t('connectionTestFailed'))
      }
      
      const testData = await testResponse.json()
      console.log('Test passed:', testData)
      
      if (!testData.ready_to_save) {
        setStatus('shopify', 'error', t('connectionFailed'))
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
          shopify_shop_url: cleanUrl,
          shopify_access_token: shopifyToken
        })
      })
      
      if (!saveResponse.ok) {
        const errorData = await saveResponse.json()
        throw new Error(errorData.detail || t('saveFailed'))
      }
      
      const saveData = await saveResponse.json()
      
      if (saveData.success) {
        setStatus('shopify', 'success', `Shopify ${t('connected')}. ${testData.tests?.products_fetch?.product_count || 0} ${t('productsFound')}.`)
        setShopifyConnected(true)
        setShowShopifyToken(false)
        setShopifyToken('')
        console.log('Connection saved, loading products...')
        
        // Charger les produits
        await loadProducts()
      } else {
        throw new Error(t('saveFailed'))
      }
    } catch (err) {
      console.error('Error:', err)
      const message = formatUserFacingError(err, t('errorShopify'))
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
      
      const session = await getCachedSession()
      
      if (!session) {
        setError(t('sessionExpiredReconnect'))
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
        setError(t('noProductsFound'))
        return []
      }
    } catch (err) {
      console.error('Error loading products:', err)
      setError(formatUserFacingError(err, t('errorLoadingProducts')))
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
      const session = await getCachedSession()

      if (!session) {
        setAnalyticsError(t('sessionExpiredReconnect'))
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
        setAnalyticsError(t('analyticsUnavailable'))
      }
    } catch (err) {
      console.error('Error loading analytics:', err)
      setAnalyticsError(formatUserFacingError(err, t('errorAnalytics')))
    } finally {
      setAnalyticsLoading(false)
    }
  }

  const loadTopProducts = async (rangeOverride) => {
    try {
      const rangeValue = rangeOverride || topProductsRange
      setTopProductsLoading(true)
      const session = await getCachedSession()
      if (!session) return

      const response = await fetch(`${API_URL}/api/shopify/top-products?range=${rangeValue}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error('Top products error:', errorData)
        return
      }

      const data = await response.json()
      if (data.success) {
        setTopProductsData(data)
      }
    } catch (err) {
      console.error('Error loading top products:', err)
    } finally {
      setTopProductsLoading(false)
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
    // ⚡ If backend was already confirmed alive by /api/init (within 5 min), skip warmup entirely
    if (backendHealth && backendHealthTs && Date.now() - backendHealthTs < 5 * 60 * 1000) {
      return // Backend already warm, no need to ping again
    }
    const warmupUrl = `${API_URL}/api/shopify/keep-alive`
    try {
      await waitForBackendReady({ retries: 4, retryDelayMs: 2000, timeoutMs: 15000 })

      await fetchJsonWithRetry(warmupUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }, {
        retries: 2,
        retryDelayMs: 2000,
        timeoutMs: 20000,
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
      const session = await getCachedSession()

      if (!session) {
        throw new Error(t('sessionExpiredReconnect'))
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
        throw new Error(data.detail || t('analysisUnavailable'))
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

  // ---------------------------------------------------------------------------
  // Stock Alert — chargement + auto-save multi-produit (zéro popup)
  // ---------------------------------------------------------------------------

  // Charger tous les produits Shopify avec leurs seuils sauvegardés
  const loadStockProducts = async () => {
    try {
      setStockProductsLoading(true)
      const session = await getCachedSession()
      if (!session) return
      const resp = await fetch(`${API_URL}/api/stock-alerts/products-with-thresholds`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      })
      if (resp.ok) {
        const d = await resp.json()
        if (d.success) setStockProducts(d.products || [])
      }
    } catch (err) {
      console.error('Erreur chargement produits stock:', err)
    } finally {
      setStockProductsLoading(false)
    }
  }

  // Auto-save seuil pour un produit (appelé à chaque modification du champ)
  const autoSaveThreshold = async (productId, productTitle, threshold) => {
    try {
      const session = await getCachedSession()
      if (!session) return
      await fetch(`${API_URL}/api/stock-alerts/save-threshold`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: productId, product_title: productTitle, threshold })
      })
    } catch (err) {
      console.error('Erreur auto-save seuil:', err)
    }
  }

  // Nouveau flow asynchrone bundles
  const loadBundlesAsync = async () => {
    try {
      setInsightsLoading(true)
      setInsightsError('')
      setBundlesJobStatus('starting')
      const session = await getCachedSession()
      if (!session) throw new Error(t('sessionExpiredReconnect'))
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
      if (!resp.ok || !data?.job_id) throw new Error(data?.detail || t('errorLaunchAnalysis'))
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
    setStatus('action-bundles', 'info', t('analysisBundlesInProgress'))
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
          const reason = diagnostics?.no_result_reason || t('analysisNoOpportunity')
          setStatus('action-bundles', 'warning', reason)
        } else {
          setStatus('action-bundles', 'success', `${t('analysisComplete')}: ${suggestions.length} ${t('suggestions')}.`)
        }
        setBundlesJobStatus('done')
        done = true
        break
      } else if (status === 'failed') {
        const failureMessage = data?.error || data?.job?.error || t('errorAnalysis')
        setInsightsError(failureMessage)
        setStatus('action-bundles', 'error', failureMessage)
        setBundlesJobStatus('failed')
        break
      }
    }
    if (!done) {
      setInsightsError(t('analysisTooLong'))
      setStatus('action-bundles', 'error', t('analysisTooLong'))
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
      const session = await getCachedSession()
      if (!session) throw new Error(t('sessionExpiredReconnect'))
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
      if (!resp.ok || !Array.isArray(jobs)) throw new Error(data?.detail || t('errorHistory'))
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
    }, 300_000)  // ⚡ Every 5 min instead of 60s — backend already confirmed alive by /api/init

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
      const session = await getCachedSession()

      if (!session) {
        setStatus('blockers', 'error', t('sessionExpiredReconnect'))
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
        setStatus('blockers', 'error', t('analysisUnavailable'))
      }
    } catch (err) {
      console.error('Error loading blockers:', err)
      if (requestId !== blockersRequestIdRef.current) return
      const hasData = Array.isArray(blockersData?.blockers) && blockersData.blockers.length > 0
      const message = formatUserFacingError(err, t('errorAnalysis'))
      setStatus('blockers', hasData ? 'warning' : 'error', message)
    } finally {
      if (requestId === blockersRequestIdRef.current) {
        setBlockersLoading(false)
      }
    }
  }

  const loadUnderperforming = async (rangeOverride) => {
    try {
      const rangeValue = rangeOverride || analyticsRange
      setUnderperformingLoading(true)
      const session = await getCachedSession()
      if (!session) {
        setStatus('underperforming', 'error', t('sessionExpiredReconnect'))
        return
      }
      await waitForBackendReady({ retries: 8, retryDelayMs: 2000, timeoutMs: 22000 })
      await warmupBackend(session.access_token)
      const { response, data } = await fetchJsonWithRetry(`${API_URL}/api/shopify/underperforming?range=${rangeValue}`, {
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
        setUnderperformingData(data)
        clearStatus('underperforming')
      } else {
        setStatus('underperforming', 'error', t('analysisUnavailable'))
      }
    } catch (err) {
      console.error('Error loading underperforming:', err)
      const message = formatUserFacingError(err, t('errorAnalysis'))
      setStatus('underperforming', 'error', message)
    } finally {
      setUnderperformingLoading(false)
    }
  }

  const loadPixelStatus = async () => {
    try {
      setPixelLoading(true)
      const session = await getCachedSession()
      if (!session) return
      await waitForBackendReady({ retries: 4, retryDelayMs: 2000, timeoutMs: 12000 })
      const resp = await fetch(`${API_URL}/api/shopify/pixel-status`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      })
      if (resp.ok) {
        const data = await resp.json()
        if (data.success) setPixelStatus(data)
      }
    } catch (err) {
      console.error('Error loading pixel status:', err)
    } finally {
      setPixelLoading(false)
    }
  }

  const runActionAnalysis = async (actionKey, options = {}) => {
    try {
      setStatus(actionKey, 'info', t('analysisInProgress'))
      if (actionKey === 'action-rewrite') {
        setInsightsData(null)
      }

      if (actionKey === 'action-bundles') {
        await loadBundlesAsync()
        return
      }

      const loadAiPriceInsights = async (userInstructions) => {
        try {
          const session = await getCachedSession()
          if (!session) return { items: [], market_comparison: null, currency_code: null }

          // Reduce cold-start failures before calling an authenticated endpoint.
          await waitForBackendReady({ retries: 8, retryDelayMs: 2000, timeoutMs: 22000 })
          await warmupBackend(session.access_token)

          // Preferred: lightweight endpoint (if deployed).
          try {
            const instructionsParam = userInstructions ? `&instructions=${encodeURIComponent(userInstructions)}` : ''
            const { response, data: payload } = await fetchJsonWithRetry(`${API_URL}/api/ai/price-opportunities?limit=50${instructionsParam}`, {
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
              return {
                items: items.slice(0, 10),
                market_comparison: payload?.market_comparison || null,
                currency_code: payload?.currency_code || null
              }
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
          if (!legacyPayload?.success) throw new Error(legacyPayload?.detail || t('analysisUnavailable'))

          if (Number.isFinite(Number(legacyPayload?.products_analyzed))) {
            setInsightsData((prev) => ({
              ...(prev || {}),
              products_analyzed: Number(legacyPayload.products_analyzed)
            }))
          }

          const optimizations = legacyPayload?.analysis?.pricing_strategy?.optimizations
          if (!Array.isArray(optimizations) || optimizations.length === 0) return []

          const byTitle = new Map(slimProducts.map((p) => [String(p?.title || '').trim().toLowerCase(), p]))
            return {
              items: optimizations.slice(0, 10).map((opt, index) => {
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
              suggestion: opt?.reason || t('adjustmentRecommended'),
              current_price: Number.isFinite(currentPrice) ? currentPrice : null,
              suggested_price: Number.isFinite(suggestedPrice) ? suggestedPrice : null,
              target_delta_pct: Number.isFinite(targetDeltaPct) ? targetDeltaPct : null,
              reason: opt?.expected_impact || opt?.reason || t('opportunityDetected'),
              source: 'ai_analyze_store'
            }
          }),
              market_comparison: null,
              currency_code: null
            }
        } catch (err) {
          console.warn('AI price fallback failed:', err)
          return { items: [], market_comparison: null, currency_code: null }
        }
      }

      if (actionKey === 'action-blockers') {
        await loadBlockers()
      } else if (actionKey === 'action-images') {
        setInsightsLoading(true)
        try {
          const session = await getCachedSession()
          if (!session) {
            setStatus(actionKey, 'error', t('sessionExpiredReconnect'))
            return
          }

          await waitForBackendReady({ retries: 10, retryDelayMs: 2500, timeoutMs: 45000 })
          await warmupBackend(session.access_token)

          const rangeValue = analyticsRange
          const productParam = options?.productId ? `&product_id=${encodeURIComponent(options.productId)}` : ''
          const { response, data } = await fetchJsonWithRetry(`${API_URL}/api/shopify/image-risks?range=${encodeURIComponent(rangeValue)}&limit=120&ai=1${productParam}`, {
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
          if (!data?.success) throw new Error(data?.detail || t('analysisUnavailable'))

          setInsightsData({
            success: true,
            image_risks: Array.isArray(data?.image_risks) ? data.image_risks : [],
            notes: Array.isArray(data?.notes) ? data.notes : [],
          })
          setStatus(actionKey, 'success', t('analysisComplete'))
        } catch (err) {
          const message = normalizeNetworkErrorMessage(err, t('errorAnalysis'))
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
        clearStatus(actionKey)
        setStatus(actionKey, 'info', t('rewriteAnalysisInProgress'))
        const session = await getCachedSession()
        if (!session) {
          setStatus(actionKey, 'error', t('sessionExpiredReconnect'))
          return
        }
        if (!options.productId) {
          setStatus(actionKey, 'warning', t('selectProductToAnalyze'))
          return
        }
        const rewriteController = new AbortController()
        const rewriteTimeout = setTimeout(() => rewriteController.abort(), 120000)
        const instructionsParam = options.instructions ? `&instructions=${encodeURIComponent(options.instructions)}` : ''
        const response = await fetch(`${API_URL}/api/shopify/rewrite?product_id=${encodeURIComponent(options.productId)}${instructionsParam}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          signal: rewriteController.signal
        })
        clearTimeout(rewriteTimeout)
        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.detail || `HTTP ${response.status}`)
        }
        const data = await response.json()
        if (!data.success) {
          throw new Error(data.error || t('errorRewrite'))
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
          setStatus(actionKey, 'info', t('aiPriceGeneration'))
          const aiResult = await loadAiPriceInsights(priceInstructions)
          const aiPriceItems = aiResult?.items || []
          const aiMarketComparison = aiResult?.market_comparison || null
          if (Array.isArray(aiPriceItems) && aiPriceItems.length > 0) {
            const marketFromApi = aiMarketComparison
            const healthSaysOpenAI = backendHealth?.services?.openai === 'configured'
            const inferredMarket = marketFromApi || (healthSaysOpenAI ? { enabled: true, provider: 'openai', source: 'openai', mode: 'ai_estimate', inferred: true } : null)
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
            setStatus(actionKey, 'success', t('analysisCompleteAI'))

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
          setStatus(actionKey, 'info', t('priceAnalysisInProgress'))
          const aiResult = await loadAiPriceInsights(priceInstructions)
          const aiPriceItems = aiResult?.items || []
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
          setStatus(actionKey, 'warning', t('analysisNoOpportunity'))
          return
        }
      }
      setStatus(actionKey, 'success', t('analysisComplete'))
    } catch (err) {
      setStatus(actionKey, 'error', normalizeNetworkErrorMessage(err, t('errorAnalysis')))
    }
  }

  const handleApplyBlockerAction = async (productId, action, statusKey = 'blockers') => {
    const plan = String(subscription?.plan || '').toLowerCase()
    if (!['pro', 'premium'].includes(plan)) {
      setStatus(statusKey, 'warning', t('featureReservedProPremium'))
      return
    }

    try {
      clearStatus(statusKey)
      setApplyingBlockerActionId(`${productId}-${action.type}`)
      setStatus(statusKey, 'info', `Application ${action.type === 'title' ? 'du titre' : 'de la description'} en cours...`)
      const session = await getCachedSession()

      if (!session) {
        setStatus(statusKey, 'error', t('sessionExpiredReconnect'))
        return
      }

      const applyController = new AbortController()
      const applyTimeout = setTimeout(() => applyController.abort(), 60000)
      const payload = {
        product_id: productId,
        action_type: action.type,
      }
      if (action.type === 'price' && typeof action.suggested_price !== 'undefined') {
        payload.suggested_price = action.suggested_price
      }
      if (action.type === 'title' && action.suggested_title) {
        payload.suggested_title = action.suggested_title
      }
      if (action.type === 'description' && action.suggested_description) {
        payload.suggested_description = action.suggested_description
      }

      const response = await fetch(`${API_URL}/api/shopify/apply-action`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: applyController.signal
      })
      clearTimeout(applyTimeout)

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }

      setStatus(statusKey, 'success', '✅ Modification appliquée avec succès sur Shopify !')
      setTimeout(() => clearStatus(statusKey), 8000)
      loadBlockers()
    } catch (err) {
      console.error('Error applying blocker action:', err)
      const errMsg = err?.name === 'AbortError'
        ? t('requestTimeout')
        : (err?.message && err.message !== 'Failed to fetch')
          ? err.message
          : t('errorApplyingRetry')
      setStatus(statusKey, 'error', errMsg)
    } finally {
      setApplyingBlockerActionId(null)
    }
  }

  const loadCustomers = async () => {
    try {
      setCustomersLoading(true)
      const session = await getCachedSession()

      if (!session) {
        setStatus('invoice', 'error', t('sessionExpiredReconnect'))
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
      setStatus('invoice', 'error', formatUserFacingError(err, t('errorLoadingClients')))
    } finally {
      setCustomersLoading(false)
    }
  }

  const loadOrdersList = async () => {
    try {
      setOrdersListLoading(true)
      const session = await getCachedSession()
      if (!session) {
        setStatus('invoice', 'error', t('sessionExpiredReconnect'))
        return
      }
      const response = await fetch(`${API_URL}/api/shopify/orders-list?limit=100`, {
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
      if (data.success && data.orders) {
        setOrdersList(data.orders)
      }
    } catch (err) {
      console.error('Error loading orders list:', err)
      setStatus('invoice', 'error', formatUserFacingError(err, t('errorLoadingOrders')))
    } finally {
      setOrdersListLoading(false)
    }
  }

  const sendInvoiceEmailForRow = async (row, index) => {
    try {
      setSendingInvoiceFor(index)
      const session = await getCachedSession()
      if (!session) {
        setStatus('invoice', 'error', t('sessionExpiredReconnect'))
        return
      }
      const response = await fetch(`${API_URL}/api/shopify/send-invoice-email`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          to_email: row.email,
          product_title: row.product_title,
          quantity: row.quantity,
          price: row.price,
          currency: row.currency || 'CAD',
          order_name: row.order_name || ''
        })
      })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }
      const data = await response.json()
      if (data.success) {
        setStatus('invoice', 'success', `Facture envoyée à ${row.email}`)
      } else {
        setStatus('invoice', 'error', 'Échec envoi facture')
      }
    } catch (err) {
      console.error('Error sending invoice:', err)
      setStatus('invoice', 'error', formatUserFacingError(err, t('errorSendingInvoice')))
    } finally {
      setSendingInvoiceFor(null)
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
      const session = await getCachedSession()
      if (!session) {
        setStatus('invoice', 'error', t('sessionExpiredReconnect'))
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
        setStatus('invoice', 'success', t('invoiceCreated'))
      } else {
        setStatus('invoice', 'error', t('invoiceCreationFailed'))
      }
    } catch (err) {
      console.error('Error creating invoice:', err)
      setStatus('invoice', 'error', formatUserFacingError(err, t('errorInvoice')))
    } finally {
      setInvoiceSubmitting(false)
    }
  }

  useEffect(() => {
    // ⚡ Skip re-fetch if data is already loaded (instant tab switches)
    if (activeTab === 'overview') {
      if (!analyticsData) loadAnalytics(analyticsRange)
      else if (analyticsRange !== '30d') loadAnalytics(analyticsRange)
      if (!topProductsData) loadTopProducts(topProductsRange)
    }
    if (activeTab === 'underperforming') {
      if (!analyticsData) loadAnalytics(analyticsRange)
      if (!underperformingData) loadUnderperforming(analyticsRange)
    }
    if (activeTab === 'action-blockers') {
      if (!blockersData) loadBlockers(analyticsRange)
      if (!pixelStatus) loadPixelStatus()
    }
  }, [activeTab, analyticsRange])

  useEffect(() => {
    if (activeTab === 'overview') {
      loadTopProducts(topProductsRange)
    }
  }, [topProductsRange])

  useEffect(() => {
    if (activeTab === 'invoices' && customers.length === 0) {
      loadCustomers()
    }
    if (activeTab === 'invoices' && (!products || products.length === 0)) {
      loadProducts()
    }
    if (activeTab === 'invoices' && ordersList.length === 0) {
      loadOrdersList()
    }
    if (activeTab === 'action-rewrite' && (!products || products.length === 0)) {
      loadProducts()
    }
    if (activeTab === 'action-images' && (!products || products.length === 0)) {
      loadProducts()
    }
  }, [activeTab])

  useEffect(() => {
    if (!user) return
    let intervalId

    const checkShopifyConnection = async () => {
      try {
        const session = await getCachedSession()
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
          setStatus('shopify', 'warning', t('shopifyConnectionExpired'))
        }
      } catch (err) {
        console.error('Shopify keep-alive failed:', err)
      }
    }

    checkShopifyConnection()
    intervalId = window.setInterval(checkShopifyConnection, 10 * 60 * 1000)  // ⚡ Every 10 min instead of 5

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
      const session = await getCachedSession()
      
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
        setStatus('analyze', 'success', t('analysisCompleteResults'))
      } else {
        setStatus('analyze', 'error', t('errorAnalysis') + ': ' + (data.detail || t('unknownError')))
      }
    } catch (err) {
      console.error('Erreur analyse:', err)
      setStatus('analyze', 'error', formatUserFacingError(err, t('errorAnalysis')))
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
      const session = await getCachedSession()
      
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
        setStatus('apply-actions', 'success', t('changesApplied'))
        setShowApplyModal(false)
        // Reload products to see changes
        await loadProducts()
      } else {
        setStatus('apply-actions', 'error', t('error') + ': ' + formatErrorDetail(data.detail, t('errorApplying')))
      }
    } catch (err) {
      console.error('Error applying actions:', err)
      setStatus('apply-actions', 'error', formatUserFacingError(err, t('errorApplying')))
    } finally {
      setApplyingActions(false)
    }
  }

  const handleApplyRecommendation = async (productId, recommendationType, extraData = {}) => {
    if (!['pro', 'premium'].includes(subscription?.plan)) {
      setStatus(`rec-${productId}-${recommendationType}`, 'warning', t('featureReservedProPremium'))
      return
    }

    try {
      setApplyingRecommendationId(`${productId}-${recommendationType}`)
      const session = await getCachedSession()
      const response = await fetch(`${API_URL}/api/ai/apply-recommendation`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          product_id: productId,
          recommendation_type: recommendationType,
          ...extraData
        })
      })
      const data = await response.json()
      if (data.success) {
        setStatus(`rec-${productId}-${recommendationType}`, 'success', t('modificationApplied'))
        await loadProducts()
      } else {
        setStatus(`rec-${productId}-${recommendationType}`, 'error', t('error') + ': ' + formatErrorDetail(data.detail))
      }
    } catch (err) {
      setStatus(`rec-${productId}-${recommendationType}`, 'error', formatUserFacingError(err, t('errorApplying')))
    } finally {
      setApplyingRecommendationId(null)
    }
  }

  if (loading && !user) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-gray-600 border-t-yellow-500 rounded-full animate-spin"></div>
          <p className="text-gray-400 text-sm">Chargement...</p>
        </div>
      </div>
    )
  }

  if (isProcessingPayment) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center text-white">
          <div className="w-12 h-12 border-2 border-gray-600 border-t-yellow-500 rounded-full animate-spin mx-auto mb-6"></div>
          <h2 className="text-2xl font-bold mb-3">Paiement en cours de traitement...</h2>
          <p className="text-gray-400 mb-6">{t('paymentRegistering')}</p>
          <p className="text-xs text-gray-500">{t('autoRedirect')}</p>
        </div>
      </div>
    )
  }

  if (!user || (!subscription && subscriptionMissing)) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center text-white">
          <div className="text-xl mb-2">{t('subscriptionSync')}</div>
          <div className="text-gray-300 text-sm mb-4">{t('paymentDelay')}</div>
          <div className="flex gap-3 justify-center">
            <button onClick={initializeUser} className="bg-yellow-600 hover:bg-yellow-700 px-5 py-2 rounded-lg text-white text-sm font-medium transition-colors">{t('retry')}</button>
            <button onClick={() => { window.location.hash = '#stripe-pricing' }} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-white">{t('viewPlans')}</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Mobile header with hamburger */}
      <div className="md:hidden flex items-center justify-between bg-gray-800 border-b border-gray-700 px-4 py-3 sticky top-0 z-40">
        <button onClick={() => setMobileSidebarOpen(true)} className="text-white p-1">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <span className="text-white font-semibold text-sm">ShopBrain AI</span>
        <div className="w-6" />{/* spacer */}
      </div>

      {/* Mobile sidebar overlay */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 md:hidden" onClick={() => setMobileSidebarOpen(false)} />
      )}

      <div className="flex min-h-screen">
        <aside className={`${
          mobileSidebarOpen ? 'fixed inset-y-0 left-0 z-50' : 'hidden'
        } md:relative md:flex w-64 bg-gray-800 border-r border-gray-700 p-4 flex flex-col gap-4 overflow-y-auto`}>
          {/* Mobile close button */}
          <button onClick={() => setMobileSidebarOpen(false)} className="md:hidden self-end text-gray-400 hover:text-white mb-2">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
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
              { key: 'overview', label: t('tabOverview') },
              { key: 'underperforming', label: t('tabUnderperforming') },
              { key: 'action-blockers', label: t('tabBlockers') },
              { key: 'action-rewrite', label: t('tabRewrite') },
              { key: 'action-price', label: t('tabPriceOpt') },
              { key: 'action-images', label: t('tabImages') },
              { key: 'action-bundles', label: t('tabBundles') },
              { key: 'action-stock', label: t('tabStock') },
              { key: 'action-returns', label: t('tabReturns') },
              { key: 'invoices', label: t('tabInvoices') },
              { key: 'ai', label: t('aiAnalysis') },
              { key: 'analysis', label: t('tabResults') }
            ].map((item) => (
              <button
                key={item.key}
                onClick={() => { setActiveTab(item.key); setMobileSidebarOpen(false) }}
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
                    <div className="text-sm text-gray-400">{t('unlimitedAutoActions')}</div>
                  </button>
                </>
              )}
              {subscription?.plan === 'pro' && (
                <button
                  onClick={() => handleChangePlan('premium')}
                  className="w-full text-left px-4 py-3 rounded-lg bg-gray-700 hover:bg-gray-600 text-white"
                >
                  <div className="font-semibold">PREMIUM - $299/mois</div>
                  <div className="text-sm text-gray-400">{t('unlimitedAutoActions')}</div>
                </button>
              )}
              {subscription?.plan === 'premium' && (
                <div className="px-4 py-3 text-gray-400">{t('alreadyOnPremium')}</div>
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
                <p className="font-bold">{t('paymentConfirmed')}</p>
                <p className="text-sm opacity-90">{t('planApplied')}</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => { window.location.hash = '#/' }}
                  className="bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2 rounded-lg"
                >{t('backToHome')}
                </button>
                <button
                  onClick={() => { window.location.hash = '#dashboard' }}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-lg"
                >{t('goToDashboard')}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="max-w-7xl mx-auto p-3 md:p-6">

        {error && (
          <div className="bg-gray-800 border border-yellow-700 text-yellow-200 p-4 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 space-y-6">
            <div className="bg-gradient-to-br from-gray-800 via-gray-900 to-black border border-yellow-700/40 rounded-2xl p-4 md:p-6">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-yellow-300/70">Performance</p>
                  <h3 className="text-2xl font-bold text-white mt-2">Revenus & commandes en temps réel</h3>
                  <p className="text-sm text-gray-400 mt-2">Source Shopify · {analyticsData?.range || analyticsRange} · {getRangeLabel(analyticsData?.range || analyticsRange)}</p>
                </div>
                <div className="flex items-center gap-1 md:gap-2 bg-gray-800/70 border border-gray-700 rounded-full px-1.5 md:px-2 py-1">
                  {['7d', '30d', '90d', '365d'].map((range) => (
                    <button
                      key={range}
                      onClick={() => setAnalyticsRange(range)}
                      className={`px-3 md:px-3 py-1.5 md:py-1 rounded-full text-xs font-semibold transition ${analyticsRange === range ? 'bg-yellow-600 text-black' : 'text-gray-300 hover:text-white'}`}
                    >
                      {range}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-900/70 border border-gray-700 rounded-xl p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Revenus</p>
                  <p className="text-xl md:text-2xl font-bold text-white mt-2">
                    {analyticsLoading ? 'Chargement...' : formatCurrency(analyticsData?.totals?.revenue, analyticsData?.currency || 'EUR')}
                  </p>
                </div>
                <div className="bg-gray-900/70 border border-gray-700 rounded-xl p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Commandes</p>
                  <p className="text-xl md:text-2xl font-bold text-white mt-2">
                    {analyticsLoading ? '...' : formatCompactNumber(analyticsData?.totals?.orders || 0)}
                  </p>
                </div>
                <div className="bg-gray-900/70 border border-gray-700 rounded-xl p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-gray-500">AOV</p>
                  <p className="text-xl md:text-2xl font-bold text-white mt-2">
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

            {/* ── Produits Phares (Pixel-based top products) ────────────────── */}
            <div className="bg-gradient-to-br from-gray-800 via-gray-900 to-black border border-yellow-700/40 rounded-2xl p-4 md:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-yellow-300/70">⭐ Shopify Pixel</p>
                  <h3 className="text-xl font-bold text-white mt-1">Produits Phares</h3>
                  <p className="text-xs text-gray-400 mt-1">Classement basé sur les vues, ajouts au panier et achats réels</p>
                </div>
                <div className="flex items-center gap-1 bg-gray-800/70 border border-gray-700 rounded-full px-1.5 py-1">
                  {[
                    { key: '1d', label: "Aujourd'hui" },
                    { key: '7d', label: '7 jours' },
                    { key: '30d', label: '30 jours' }
                  ].map((r) => (
                    <button
                      key={r.key}
                      onClick={() => setTopProductsRange(r.key)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${topProductsRange === r.key ? 'bg-yellow-600 text-black' : 'text-gray-300 hover:text-white'}`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {topProductsLoading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="w-6 h-6 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="ml-3 text-sm text-gray-400">Analyse des données pixel...</span>
                </div>
              ) : !topProductsData?.products?.length ? (
                <div className="text-center py-8">
                  <p className="text-3xl mb-3">📊</p>
                  <p className="text-gray-400 text-sm">
                    {shopifyUrl
                      ? "Aucune donnée pixel pour cette période. Les produits phares apparaîtront quand le pixel recevra des événements."
                      : "Connecte Shopify et installe le pixel pour voir tes produits phares."
                    }
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {topProductsData.products.map((product, index) => {
                    const rankIcon = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`;
                    const changeIcon = product.rank_change === 'up' ? '↑' : product.rank_change === 'down' ? '↓' : product.rank_change === 'new' ? '🆕' : '';
                    const changeColor = product.rank_change === 'up' ? 'text-green-400' : product.rank_change === 'down' ? 'text-red-400' : product.rank_change === 'new' ? 'text-blue-400' : 'text-gray-500';
                    const maxScore = topProductsData.products[0]?.score || 1;
                    const barWidth = Math.max(8, Math.round((product.score / maxScore) * 100));

                    return (
                      <div key={product.product_id} className="group bg-gray-900/60 hover:bg-gray-900/90 border border-gray-700/60 hover:border-yellow-600/40 rounded-xl p-3 transition-all duration-200">
                        <div className="flex items-center gap-3">
                          {/* Rank */}
                          <div className="flex-shrink-0 w-10 text-center">
                            <span className="text-lg">{rankIcon}</span>
                            {changeIcon && (
                              <p className={`text-[10px] font-bold ${changeColor}`}>{changeIcon}</p>
                            )}
                          </div>

                          {/* Product Image */}
                          <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-gray-800 border border-gray-700 overflow-hidden">
                            {product.image_url ? (
                              <img
                                src={product.image_url}
                                alt={product.title}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-600 text-lg">📦</div>
                            )}
                          </div>

                          {/* Product Info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-semibold truncate">{product.title}</p>
                            <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-400">
                              <span title="Vues (pixel)">👁 {product.views}</span>
                              <span title="Ajouts au panier (pixel)">🛒 {product.add_to_cart}</span>
                              <span title="Achats confirmés">💰 {product.purchases}</span>
                              {product.price && (
                                <span className="text-gray-500">{parseFloat(product.price).toFixed(2)} $</span>
                              )}
                            </div>
                            {/* Score bar */}
                            <div className="mt-1.5 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-yellow-500 to-yellow-300 rounded-full transition-all duration-700"
                                style={{ width: `${barWidth}%` }}
                              />
                            </div>
                          </div>

                          {/* Score */}
                          <div className="flex-shrink-0 text-right">
                            <p className="text-yellow-400 text-sm font-bold">{product.score}</p>
                            <p className="text-[10px] text-gray-500">pts</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Score explanation */}
                  <div className="mt-3 pt-3 border-t border-gray-700/50">
                    <p className="text-[10px] text-gray-500 text-center">
                      Score = Vues ×1 + Ajouts panier ×5 + Achats ×15 · Données Shopify Pixel en temps réel
                    </p>
                    {topProductsData.total_scored > 5 && (
                      <p className="text-[10px] text-gray-500 text-center mt-1">
                        {topProductsData.total_scored} produits avec activité · Top 5 affiché
                      </p>
                    )}
                  </div>
                </div>
              )}
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

            <div className="hidden md:grid grid-cols-1 md:grid-cols-4 gap-4">
              {[
                {
                  label: t('revenue'),
                  value: analyticsLoading ? '...' : formatCurrency(analyticsData?.totals?.revenue, analyticsData?.currency || 'EUR'),
                  hint: analyticsRange
                },
                {
                  label: t('orders'),
                  value: analyticsLoading ? '...' : formatCompactNumber(analyticsData?.totals?.orders || 0),
                  hint: 'volume'
                },
                {
                  label: t('aov'),
                  value: analyticsLoading ? '...' : formatCurrency(analyticsData?.totals?.aov, analyticsData?.currency || 'EUR'),
                  hint: 'panier moyen'
                },
                {
                  label: t('activeProducts'),
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

            <div className="hidden md:grid grid-cols-1 md:grid-cols-3 gap-6">
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

            <div className="hidden md:grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
                <h4 className="text-gray-400 text-xs uppercase tracking-[0.2em] mb-4">Activité récente</h4>
                <ul className="space-y-3 text-sm text-gray-300">
                  <li className="flex items-center justify-between">
                    <span>{t('tabPriceOpt')}</span>
                    <span className="text-gray-500">Aujourd’hui</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>{t('aiDescriptions')}</span>
                    <span className="text-gray-500">Hier</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>{t('fullCatalogAnalysis')}</span>
                    <span className="text-gray-500">Il y a 2 jours</span>
                  </li>
                </ul>
              </div>
              <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
                <h4 className="text-gray-400 text-xs uppercase tracking-[0.2em] mb-4">File d’exécution</h4>
                <div className="space-y-3">
                  {[
                    { label: t('titleOptimization'), status: t('inProgress') },
                    { label: t('priceAudit'), status: t('scheduled') },
                    { label: t('weeklyReport'), status: t('scheduled') }
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between text-sm text-gray-300">
                      <span>{row.label}</span>
                      <span className="text-gray-500">{row.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="hidden md:grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
                <h4 className="text-gray-400 text-xs uppercase tracking-[0.2em] mb-4">Alertes critiques</h4>
                <ul className="space-y-3 text-sm text-gray-300">
                  <li className="flex items-center justify-between">
                    <span>{t('zeroPriceProducts')}</span>
                    <span className="text-red-300">2</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>{t('outOfStock')}</span>
                    <span className="text-yellow-300">4</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>{t('weakSEO')}</span>
                    <span className="text-yellow-300">11</span>
                  </li>
                </ul>
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
                    <span>{t('plan')}</span>
                    <span className="text-gray-400">{formatPlan(subscription?.plan)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>{t('store')}</span>
                    <span className="text-gray-400">{shopifyUrl || t('notConnected')}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>{t('lastSync')}</span>
                    <span className="text-gray-400">Aujourd’hui</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* Invoices Tab */}
        {activeTab === 'invoices' && (
          <div className="space-y-6">
            {/* Header */}
            <div className="bg-gray-800 rounded-2xl p-4 md:p-6 border border-gray-700">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-yellow-400">Facturation</p>
                  <h2 className="text-white text-xl md:text-2xl font-bold mt-2">Commandes clients</h2>
                  <p className="text-sm text-gray-400 mt-1">Liste des achats de vos clients. Envoyez une facture par email en un clic.</p>
                </div>
                <button
                  onClick={loadOrdersList}
                  className="px-4 py-2 rounded-lg bg-gray-700 text-white hover:bg-gray-600 text-sm"
                >
                  {ordersListLoading ? t('loadingDots') : t('refresh')}
                </button>
              </div>
              {renderStatus('invoice')}
            </div>

            {/* Orders List */}
            <div className="bg-gray-800 rounded-2xl p-4 md:p-6 border border-gray-700">
              <h3 className="text-white text-lg font-semibold mb-4">
                {ordersList.length > 0 ? `${ordersList.length} achat(s)` : 'Achats clients'}
              </h3>

              {ordersListLoading ? (
                <div className="text-center py-8 text-gray-500 text-sm">⏳ Chargement des commandes Shopify...</div>
              ) : ordersList.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 text-sm">Aucune commande trouvée.</p>
                  <p className="text-gray-600 text-xs mt-1">Connecte ta boutique Shopify et les achats apparaîtront automatiquement.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Desktop header row */}
                  <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-2 text-xs uppercase tracking-[0.15em] text-gray-500 border-b border-gray-700">
                    <div className="col-span-3">Email client</div>
                    <div className="col-span-3">Produit</div>
                    <div className="col-span-1 text-center">Qté</div>
                    <div className="col-span-2 text-right">Prix</div>
                    <div className="col-span-3 text-right">Action</div>
                  </div>

                  {ordersList.map((row, index) => (
                    <div key={`${row.order_id}-${index}`} className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-3">
                      {/* Mobile layout */}
                      <div className="md:hidden space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-white text-sm font-medium truncate max-w-[200px]">{row.email || 'Pas d\'email'}</span>
                          <span className="text-xs text-gray-500">{row.order_name}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-300 text-sm truncate max-w-[180px]">{row.product_title}</span>
                          <span className="text-gray-300 text-sm font-semibold">{Number(row.price).toFixed(2)} {row.currency}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">{t('qty')}: {row.quantity}</span>
                          <button
                            onClick={() => sendInvoiceEmailForRow(row, index)}
                            disabled={!row.email || sendingInvoiceFor === index}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                              !row.email
                                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                : sendingInvoiceFor === index
                                ? 'bg-gray-600 text-gray-300'
                                : 'bg-yellow-600 hover:bg-yellow-500 text-black'
                            }`}
                          >
                            {sendingInvoiceFor === index ? 'Envoi...' : '📧 Facture'}
                          </button>
                        </div>
                      </div>

                      {/* Desktop layout */}
                      <div className="hidden md:grid grid-cols-12 gap-3 items-center">
                        <div className="col-span-3 text-white text-sm truncate" title={row.email}>
                          {row.email || <span className="text-gray-500 italic">Pas d'email</span>}
                        </div>
                        <div className="col-span-3 text-gray-300 text-sm truncate" title={row.product_title}>
                          {row.product_title}
                          {row.variant_title && <span className="text-gray-500 text-xs ml-1">({row.variant_title})</span>}
                        </div>
                        <div className="col-span-1 text-center text-gray-400 text-sm">{row.quantity}</div>
                        <div className="col-span-2 text-right text-gray-300 text-sm font-medium">
                          {Number(row.price).toFixed(2)} {row.currency}
                        </div>
                        <div className="col-span-3 text-right">
                          <button
                            onClick={() => sendInvoiceEmailForRow(row, index)}
                            disabled={!row.email || sendingInvoiceFor === index}
                            className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
                              !row.email
                                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                : sendingInvoiceFor === index
                                ? 'bg-gray-600 text-gray-300'
                                : 'bg-yellow-600 hover:bg-yellow-500 text-black'
                            }`}
                          >
                            {sendingInvoiceFor === index ? t('sendingDots') : t('createInvoice')}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
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
                  <p className="text-xs uppercase tracking-[0.3em] text-amber-400">📉 Performance commerciale</p>
                  <h3 className="text-white text-2xl font-bold mt-2">Produits sous-performants</h3>
                  <p className="text-sm text-gray-400 mt-1">Produits avec peu de ventes, faible CA ou stock dormant.</p>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500">{underperformingData?.underperforming_count ?? '—'} / {underperformingData?.total_products ?? '—'} produits</div>
                  {underperformingData?.benchmarks && (
                    <div className="text-xs text-gray-600 mt-1">Moy. commandes: {underperformingData.benchmarks.avg_orders} • Moy. CA: {formatCurrency(underperformingData.benchmarks.avg_revenue, underperformingData?.currency || 'EUR')}</div>
                  )}
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {underperformingLoading ? (
                  <div className="px-4 py-8 text-sm text-gray-500 text-center">⏳ {t('salesAnalysisInProgress')}</div>
                ) : (!underperformingData?.underperformers || underperformingData.underperformers.length === 0) ? (
                  <div className="px-4 py-8 text-sm text-gray-500 text-center">✅ Tous vos produits performent correctement.</div>
                ) : (
                  underperformingData.underperformers.slice(0, 10).map((item) => (
                    <div key={item.product_id || item.title} className="bg-gray-900/70 border border-gray-700 rounded-xl p-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm">{item.category}</span>
                          <span className="text-xs bg-amber-900/40 text-amber-300 px-2 py-0.5 rounded-full">Score: {item.score}/100</span>
                        </div>
                        <p className="text-white font-semibold mt-1">{item.title || 'Produit'}</p>
                        <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-400">
                          <span>🛒 {item.orders} cmd{item.orders !== 1 ? 's' : ''}</span>
                          <span>💰 CA: {formatCurrency(item.revenue, underperformingData?.currency || 'EUR')}</span>
                          <span>📦 Stock: {item.inventory}</span>
                          <span>🏷️ Prix: {formatCurrency(item.price, underperformingData?.currency || 'EUR')}</span>
                          {item.daily_sales != null && <span>📊 {item.daily_sales}/jour</span>}
                          {item.days_of_stock != null && <span>⏱️ {item.days_of_stock}j de stock</span>}
                          {item.refund_count > 0 && <span className="text-red-400">↩️ {item.refund_count} retour{item.refund_count > 1 ? 's' : ''} ({(item.refund_rate * 100).toFixed(0)}%)</span>}
                        </div>
                        {item.reasons?.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {item.reasons.map((r, i) => (
                              <div key={i} className="text-xs text-amber-300/80">• {r}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
              {renderStatus('underperforming')}
            </div>
          </div>
        )}

        {activeTab === 'action-blockers' && (
          <div className="space-y-6">
            <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-red-400">🚫 {t('conversionAnalysis')}</p>
                  <h3 className="text-white text-2xl font-bold mt-2">Produits freins</h3>
                  <p className="text-sm text-gray-400 mt-1">Produits qui cassent la conversion : vus mais pas ajoutés au panier, ou ajoutés mais pas achetés.</p>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500">{blockersData?.blockers?.length ?? '—'} produit{(blockersData?.blockers?.length ?? 0) > 1 ? 's' : ''} frein{(blockersData?.blockers?.length ?? 0) > 1 ? 's' : ''}</div>
                </div>
              </div>

              {/* Shopify Pixel Status + Guide */}
              <div className="mt-4 rounded-lg border border-gray-700 bg-gray-900/50">
                <div className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-300">Shopify Pixel :</span>
                    {pixelLoading ? (
                      <span className="text-xs text-gray-500">⏳ Vérification...</span>
                    ) : pixelStatus ? (
                      <span className={`text-xs font-medium ${
                        pixelStatus.status === 'active' ? 'text-green-400' :
                        pixelStatus.status === 'installed_inactive' ? 'text-yellow-400' :
                        'text-red-400'
                      }`}>
                        {pixelStatus.status_label}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-500">—</span>
                    )}
                    <button
                      onClick={() => { setPixelStatus(null); loadPixelStatus() }}
                      disabled={pixelLoading}
                      className="ml-1 text-xs text-gray-500 hover:text-gray-300 transition"
                      title="Refresh pixel status"
                    >
                      🔄
                    </button>
                  </div>
                  <button
                    onClick={() => setShowPixelGuide(!showPixelGuide)}
                    className="flex items-center gap-1 px-2 py-1 rounded-md bg-gray-800 hover:bg-gray-700 border border-gray-600 text-xs text-gray-300 hover:text-white transition"
                  >
                    <span>{showPixelGuide ? '−' : '+'}</span>
                    <span>Comment connecter le Shopify Pixel</span>
                  </button>
                </div>

                {/* Debug info for pixel detection */}
                {pixelStatus?.debug && pixelStatus.status !== 'active' && (
                  <div className="px-3 pb-2">
                    <details className="text-xs text-gray-600">
                      <summary className="cursor-pointer hover:text-gray-400">Debug info</summary>
                      <pre className="mt-1 text-xs text-gray-500 bg-gray-950 p-2 rounded overflow-x-auto">
                        {JSON.stringify(pixelStatus.debug, null, 2)}
                      </pre>
                    </details>
                  </div>
                )}

                {pixelStatus?.has_recent_events && (
                  <div className="px-3 pb-2">
                    <p className="text-xs text-green-400/70">✅ Des événements Pixel ont été reçus au cours des 30 derniers jours.</p>
                  </div>
                )}
                {pixelStatus && !pixelStatus.pixel_installed && !showPixelGuide && (
                  <div className="px-3 pb-3">
                    <p className="text-xs text-gray-500">Sans le Pixel, les données de vues et d'ajouts panier ne sont pas disponibles.</p>
                  </div>
                )}

                {/* Guide d'installation du Pixel */}
                {showPixelGuide && (
                  <div className="border-t border-gray-700 p-4 space-y-4">
                    <h4 className="text-white font-bold text-sm">📋 Guide d'installation du Shopify Pixel</h4>

                    <div className="space-y-3">
                      <div className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-red-600/30 text-red-300 flex items-center justify-center text-xs font-bold">1</span>
                        <div>
                          <p className="text-sm text-white font-medium">Ouvre ton admin Shopify</p>
                          <p className="text-xs text-gray-400">Va dans <span className="text-white font-mono bg-gray-800 px-1 rounded">Settings</span> (Paramètres) en bas à gauche.</p>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-red-600/30 text-red-300 flex items-center justify-center text-xs font-bold">2</span>
                        <div>
                          <p className="text-sm text-white font-medium">Clique sur « Customer events »</p>
                          <p className="text-xs text-gray-400">{t('pixelStep2FrenchNote')}</p>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-red-600/30 text-red-300 flex items-center justify-center text-xs font-bold">3</span>
                        <div>
                          <p className="text-sm text-white font-medium">Clique « Add custom pixel »</p>
                          <p className="text-xs text-gray-400">{t('pixelStep3FrenchNote')}</p>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-red-600/30 text-red-300 flex items-center justify-center text-xs font-bold">4</span>
                        <div>
                          <p className="text-sm text-white font-medium">Nomme le pixel</p>
                          <p className="text-xs text-gray-400">{t('pixelStep4Desc')}</p>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-red-600/30 text-red-300 flex items-center justify-center text-xs font-bold">5</span>
                        <div>
                          <p className="text-sm text-white font-medium">Paramètres de confidentialité</p>
                          <p className="text-xs text-gray-400"><b>{t('permission')}:</b> « Not required » · <b>{t('dataSale')}:</b> « Data collected does not qualify as data sale ».</p>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-red-600/30 text-red-300 flex items-center justify-center text-xs font-bold">6</span>
                        <div>
                          <p className="text-sm text-white font-medium">Colle le code ci-dessous</p>
                          <p className="text-xs text-gray-400">Supprime tout le contenu par défaut dans la zone de code et colle uniquement ce script :</p>
                        </div>
                      </div>
                    </div>

                    {/* Code Block */}
                    <div className="relative">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(`const BACKEND = "https://shopbrain-backend.onrender.com/api/shopify/pixel-event";
const SHOP_DOMAIN = (typeof Shopify !== "undefined" && Shopify.shop) ? Shopify.shop : null;
const SESSION_ID = (window.__sb_session_id = window.__sb_session_id || Math.random().toString(36).slice(2));

function sendEvent(eventType, productId) {
  try {
    fetch(BACKEND, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shop_domain: SHOP_DOMAIN,
        event_type: eventType,
        product_id: productId ? String(productId) : null,
        session_id: SESSION_ID,
        user_agent: navigator.userAgent
      })
    }).catch(() => {});
  } catch (e) {}
}

// Auto-register: tells ShopBrain this pixel is installed
sendEvent("pixel_installed", null);

analytics.subscribe("product_viewed", (event) => {
  const productId = event?.data?.product?.id;
  sendEvent("view_item", productId);
});

analytics.subscribe("product_added_to_cart", (event) => {
  const productId =
    event?.data?.cartLine?.merchandise?.product?.id ||
    event?.data?.product?.id;
  sendEvent("add_to_cart", productId);
});`);
                          setPixelCodeCopied(true);
                          setTimeout(() => setPixelCodeCopied(false), 3000);
                        }}
                        className="absolute top-2 right-2 px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-xs text-gray-300 hover:text-white transition z-10"
                      >
                        {pixelCodeCopied ? t('copied') : t('copyCode')}
                      </button>
                      <pre className="bg-gray-950 border border-gray-700 rounded-lg p-3 text-xs text-green-400 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">{`const BACKEND = "https://shopbrain-backend.onrender.com/api/shopify/pixel-event";
const SHOP_DOMAIN = (typeof Shopify !== "undefined" && Shopify.shop) ? Shopify.shop : null;
const SESSION_ID = (window.__sb_session_id = window.__sb_session_id || Math.random().toString(36).slice(2));

function sendEvent(eventType, productId) {
  try {
    fetch(BACKEND, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shop_domain: SHOP_DOMAIN,
        event_type: eventType,
        product_id: productId ? String(productId) : null,
        session_id: SESSION_ID,
        user_agent: navigator.userAgent
      })
    }).catch(() => {});
  } catch (e) {}
}

// Auto-register: tells ShopBrain this pixel is installed
sendEvent("pixel_installed", null);

analytics.subscribe("product_viewed", (event) => {
  const productId = event?.data?.product?.id;
  sendEvent("view_item", productId);
});

analytics.subscribe("product_added_to_cart", (event) => {
  const productId =
    event?.data?.cartLine?.merchandise?.product?.id ||
    event?.data?.product?.id;
  sendEvent("add_to_cart", productId);
});`}</pre>
                    </div>

                    <div className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-red-600/30 text-red-300 flex items-center justify-center text-xs font-bold">7</span>
                      <div>
                        <p className="text-sm text-white font-medium">Clique « Save » puis « Connect »</p>
                        <p className="text-xs text-gray-400">{t('pixelStep7Desc')}</p>
                      </div>
                    </div>

                    {/* Ask AI button */}
                    <div className="pt-2 border-t border-gray-700">
                      <button
                        onClick={() => {
                          setShowChatPanel(true);
                          setTimeout(() => {
                            sendChatMessage(t('pixelInstallQuestion'));
                          }, 500);
                        }}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow-600/20 hover:bg-yellow-600/30 border border-yellow-600/30 text-xs text-yellow-200 hover:text-yellow-100 transition"
                      >
                        🤖 Tu as des questions ? Demande à l'IA
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {renderStatus('action-blockers')}

              <div className="mt-5 space-y-3">
                {blockersLoading ? (
                  <div className="px-4 py-8 text-sm text-gray-500 text-center">⏳ {t('blockerAnalysisInProgress')}</div>
                ) : (!blockersData?.blockers || blockersData.blockers.length === 0) ? (
                  <div className="px-4 py-8 text-sm text-gray-500 text-center">{t('noBlockersFound')}</div>
                ) : (
                  blockersData.blockers.slice(0, 10).map((item) => (
                    <div key={item.product_id || item.title} className="bg-gray-900/70 border border-gray-700 rounded-xl p-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm">{item.category || '⚠️ Frein détecté'}</span>
                        </div>
                        <p className="text-white font-semibold mt-1">{item.title || 'Produit'}</p>
                        <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-400">
                          <span>🛒 {item.orders} cmd{item.orders !== 1 ? 's' : ''}</span>
                          <span>💰 {formatCurrency(item.revenue, blockersData?.currency || analyticsData?.currency || 'EUR')}</span>
                          {item.views > 0 && <span>👁️ {item.views} vues</span>}
                          {item.add_to_cart > 0 && <span>🛒 {item.add_to_cart} ajouts panier</span>}
                          {item.view_to_cart_rate != null && <span className={item.view_to_cart_rate < 0.03 ? 'text-red-400' : 'text-green-400'}>Vue→Panier: {(item.view_to_cart_rate * 100).toFixed(1)}%</span>}
                          {item.cart_to_order_rate != null && <span className={item.cart_to_order_rate < 0.2 ? 'text-red-400' : 'text-green-400'}>Panier→Achat: {(item.cart_to_order_rate * 100).toFixed(1)}%</span>}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
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
                  <option value="">{t("selectProduct")}</option>
                  {(products || []).map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.title || product.name || `Produit ${product.id}`}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => runActionAnalysis('action-rewrite', { productId: rewriteProductId, instructions: rewriteInstructions })}
                  disabled={insightsLoading || !rewriteProductId}
                  className="font-bold py-3 px-6 rounded-lg disabled:opacity-50 transition-all duration-200 text-black"
                  style={{ background: 'linear-gradient(135deg, #D4A843 0%, #F2D272 25%, #BF953F 50%, #FCF6BA 75%, #B38728 100%)', boxShadow: '0 2px 12px rgba(212, 168, 67, 0.3)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 20px rgba(212, 168, 67, 0.6)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 2px 12px rgba(212, 168, 67, 0.3)'; e.currentTarget.style.transform = 'translateY(0)' }}
                >
                  {insightsLoading ? t('analysisInProgress') : t('launchRewriteAnalysis')}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">📝 Instructions personnalisées (optionnel)</label>
              <textarea
                value={rewriteInstructions}
                onChange={(e) => setRewriteInstructions(e.target.value)}
                placeholder="Ex: Ton humoristique, mentionne la livraison gratuite, cibler les jeunes mamans, utiliser un vocabulaire luxe..."
                className="w-full bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 min-h-[80px] resize-y placeholder-gray-600 focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none"
                rows={3}
              />
              <p className="text-xs text-gray-600 mt-1">L'IA prendra ces instructions en compte pour générer le titre et la description.</p>
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
                            {stripHtmlTags(item.current_description) || '—'}
                          </div>
                        </div>
                      </div>
                      <div className="bg-gray-950/60 border border-gray-800 rounded-lg p-4">
                        <p className="text-sm font-semibold text-gray-300 mb-2">Suggestions IA</p>
                        <div className="text-sm text-gray-300 space-y-3">
                          {item.suggested_title ? (
                            <p className="text-base"><span className="text-gray-500">Titre suggéré:</span> {stripHtmlTags(item.suggested_title)}</p>
                          ) : null}
                          <div className="max-h-72 overflow-y-auto pr-2 text-base text-gray-200 whitespace-pre-wrap">
                            {stripHtmlTags(item.suggested_description) || '—'}
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
              <p className="text-gray-400">{t('priceAnalysisDesc')}</p>
            </div>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm text-gray-400">{getInsightCount(priceItems)} opportunités</p>
                <p className={`text-xs ${marketStatus?.enabled ? 'text-green-400' : 'text-gray-400'}`}>
                  {t('marketComparison')}: {marketStatus?.enabled ? t('enabled') : t('notConfigured')}
                  {marketStatus?.provider
                    ? marketStatus.provider === 'openai'
                      ? ' (IA — estimation)'
                      : marketStatus.provider === 'serpapi'
                        ? ' (SERP API)'
                        : ` (${marketStatus.provider})`
                    : ''}
                </p>
                {!marketStatus?.enabled ? (
                  <p className="text-xs text-gray-500">{t('priceAnalysisNote')}</p>
                ) : null}
              </div>
              <button
                onClick={() => runActionAnalysis('action-price')}
                disabled={insightsLoading}
                className="font-bold py-3 px-6 rounded-lg disabled:opacity-50 transition-all duration-200 text-black"
                  style={{ background: 'linear-gradient(135deg, #D4A843 0%, #F2D272 25%, #BF953F 50%, #FCF6BA 75%, #B38728 100%)', boxShadow: '0 2px 12px rgba(212, 168, 67, 0.3)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 20px rgba(212, 168, 67, 0.6)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 2px 12px rgba(212, 168, 67, 0.3)'; e.currentTarget.style.transform = 'translateY(0)' }}
              >
                {insightsLoading ? t('analysisInProgress') : t('launchPriceOptimization')}
              </button>
            </div>

            {/* Custom instructions for the AI */}
            <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4">
              <label className="block text-sm text-gray-300 font-medium mb-2">💡 Instructions pour l'IA (optionnel)</label>
              <textarea
                value={priceInstructions}
                onChange={(e) => setPriceInstructions(e.target.value)}
                placeholder="Ex: Mon chandail est un produit de luxe premium, compare avec des marques haut de gamme comme Gucci, Balenciaga... / Ignore les produits en solde / Focus sur le marché canadien..."
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 outline-none resize-none"
                rows={2}
              />
              <p className="text-xs text-gray-500 mt-1">Donne du contexte à l'IA pour des résultats plus précis. Relance l'analyse après avoir modifié.</p>
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
                          onClick={() => handleApplyRecommendation(item.product_id, 'Prix', { suggested_price: item.suggested_price })}
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
              <h2 className="text-white text-2xl font-bold mb-2">📸 Assistance images — Expert IA</h2>
              <p className="text-gray-300 text-base">Analyse de niveau photographe professionnel: direction artistique, psychologie des couleurs, composition, éclairage — basée sur des études de conversion réelles.</p>
            </div>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="flex flex-col sm:flex-row gap-3 flex-1">
                <select
                  value={imageProductId}
                  onChange={(event) => setImageProductId(event.target.value)}
                  className="bg-gray-900 border border-gray-700 text-sm text-white rounded-lg px-3 py-2 min-w-[260px] focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 outline-none"
                >
                  <option value="">Tous les produits (auto-détection)</option>
                  {(products || []).map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.title || product.name || `Produit ${product.id}`}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => runActionAnalysis('action-images', { productId: imageProductId || undefined })}
                  disabled={insightsLoading}
                  className="font-bold py-3 px-6 rounded-lg disabled:opacity-50 transition-all duration-200 text-black"
                  style={{
                    background: 'linear-gradient(135deg, #D4A843 0%, #F2D272 25%, #BF953F 50%, #FCF6BA 75%, #B38728 100%)',
                    boxShadow: '0 2px 12px rgba(212, 168, 67, 0.3)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = '0 4px 20px rgba(212, 168, 67, 0.6)'
                    e.currentTarget.style.transform = 'translateY(-1px)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = '0 2px 12px rgba(212, 168, 67, 0.3)'
                    e.currentTarget.style.transform = 'translateY(0)'
                  }}
                >
                  {insightsLoading ? '⏳ Analyse en cours...' : '🔍 Analyser les images'}
                </button>
              </div>
              <p className="text-sm text-gray-400">{getInsightCount(insightsData?.image_risks)} produits analysés</p>
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
                <div className="text-center py-8">
                  <p className="text-3xl mb-3">📸</p>
                  <p className="text-sm text-gray-500">
                    {imageProductId
                      ? 'Clique sur "Analyser les images" pour lancer l\'expertise IA sur ce produit.'
                      : 'Sélectionne un produit ou lance l\'analyse globale pour obtenir des recommandations d\'expert.'}
                  </p>
                </div>
              ) : (
                insightsData?.image_risks?.slice(0, 8).map((item, index) => (
                  <div key={item.product_id || index} className="bg-gray-900/70 border border-gray-700 rounded-xl p-5 space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-white font-bold text-lg">{item.title || `Produit #${item.product_id}`}</p>
                        <p className="text-sm text-gray-400 mt-1">
                          {item.images_count} image{item.images_count !== 1 ? 's' : ''}{item.missing_alt ? ' • ⚠️ alt manquant' : ''}
                          {item.view_to_cart_rate !== null && item.view_to_cart_rate !== undefined ? ` • vue→panier ${Math.round(item.view_to_cart_rate * 100)}%` : ''}
                        </p>
                      </div>
                      {item.recommendations?.source === 'ai' && (
                        <span className="text-xs px-2 py-1 rounded-full font-semibold text-black" style={{ background: 'linear-gradient(135deg, #D4A843, #F2D272, #BF953F)' }}>
                          IA Expert
                        </span>
                      )}
                    </div>

                    {item?.recommendations ? (
                      <div className="space-y-4">
                        <div className="text-base text-gray-200">
                          Cible: <span className="text-white font-semibold">{item.recommendations.target_total_images}</span> images
                          {Number.isFinite(Number(item.recommendations.recommended_new_images)) && item.recommendations.recommended_new_images > 0
                            ? <span className="text-gray-400"> • à produire: {item.recommendations.recommended_new_images}</span>
                            : <span className="text-gray-400"> • ✓ quantité OK</span>
                          }
                        </div>

                        {item.recommendations?.source === 'ai' && item.recommendations?.ai ? (
                          <div className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 border border-yellow-700/30 rounded-xl p-4 space-y-3">
                            <div className="text-white font-bold text-base flex items-center gap-2">
                              🎨 Direction artistique
                              <span className="text-xs text-gray-500 font-normal">(spécifique à ce produit)</span>
                            </div>
                            {item.recommendations.ai.tone ? (
                              <div className="text-sm text-gray-300">
                                <span className="text-gray-500">Ton visuel:</span> <span className="text-white">{item.recommendations.ai.tone}</span>
                              </div>
                            ) : null}
                            {item.recommendations.ai.background ? (
                              <div className="text-sm text-gray-300">
                                <span className="text-gray-500">Fond recommandé:</span> <span className="text-white">{item.recommendations.ai.background}</span>
                              </div>
                            ) : null}
                            {Array.isArray(item.recommendations.ai.color_palette) && item.recommendations.ai.color_palette.length > 0 ? (
                              <div className="text-sm text-gray-300">
                                <span className="text-gray-500">Palette chromatique:</span>
                                <div className="flex flex-wrap gap-2 mt-1">
                                  {item.recommendations.ai.color_palette.slice(0, 6).map((color, ci) => (
                                    <span key={ci} className="inline-flex items-center gap-1.5 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-white">
                                      {/^#[0-9a-fA-F]{3,8}$/.test(color) ? (
                                        <span className="w-3 h-3 rounded-full border border-gray-600 inline-block" style={{ backgroundColor: color }}></span>
                                      ) : null}
                                      {color}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                            {Array.isArray(item.recommendations.ai.product_facts_used) && item.recommendations.ai.product_facts_used.length > 0 ? (
                              <div className="text-sm text-gray-400 mt-2">
                                <span className="text-gray-500">Éléments du produit pris en compte:</span>
                                <div className="flex flex-wrap gap-1.5 mt-1">
                                  {item.recommendations.ai.product_facts_used.slice(0, 6).map((fact, fi) => (
                                    <span key={fi} className="bg-gray-800/80 border border-gray-700 text-gray-300 rounded px-2 py-0.5 text-xs">{fact}</span>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                            {Array.isArray(item.recommendations.ai.notes) && item.recommendations.ai.notes.length > 0 ? (
                              <div className="text-xs text-gray-500 mt-1 italic">💡 {item.recommendations.ai.notes[0]}</div>
                            ) : null}
                          </div>
                        ) : null}

                        {/* Quality Scores (vision audit) */}
                        {item.recommendations?.source === 'ai' && item.recommendations?.ai?.quality_scores && Object.keys(item.recommendations.ai.quality_scores).length > 1 ? (
                          <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 space-y-3">
                            <div className="text-white font-bold text-base">📊 Scores qualité</div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                              {Object.entries(item.recommendations.ai.quality_scores).filter(([k]) => k !== 'overall').map(([key, val]) => {
                                const labelMap = { sharpness: 'Netteté', lighting: 'Éclairage', background_contrast: 'Contraste fond', composition: 'Composition', color_accuracy: 'Couleurs', design_appeal: 'Design', brand_consistency: 'Cohérence' }
                                const colorMap = { excellent: 'text-green-400 bg-green-900/30 border-green-700/40', good: 'text-blue-400 bg-blue-900/30 border-blue-700/40', needs_improvement: 'text-yellow-400 bg-yellow-900/30 border-yellow-700/40', poor: 'text-red-400 bg-red-900/30 border-red-700/40' }
                                const displayVal = String(val || '').replace(/_/g, ' ')
                                return (
                                  <div key={key} className={`rounded-lg border px-3 py-2 text-center ${colorMap[val] || 'text-gray-400 bg-gray-800 border-gray-700'}`}>
                                    <p className="text-[10px] uppercase tracking-wider opacity-70">{labelMap[key] || key}</p>
                                    <p className="text-xs font-bold mt-0.5 capitalize">{displayVal}</p>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ) : null}

                        {item.recommendations?.source === 'ai' && item.recommendations?.ai?.audit ? (
                          <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 space-y-3">
                            <div className="text-white font-bold text-base">🔍 Audit images existantes</div>
                            {Array.isArray(item.recommendations.ai.audit.what_i_see) && item.recommendations.ai.audit.what_i_see.length > 0 ? (
                              <div className="space-y-1">
                                <div className="text-xs text-gray-500 uppercase tracking-wider">Ce que je vois</div>
                                {item.recommendations.ai.audit.what_i_see.slice(0, 4).map((line, idx) => (
                                  <div key={idx} className="text-sm text-gray-300">• {line}</div>
                                ))}
                              </div>
                            ) : null}
                            {Array.isArray(item.recommendations.ai.audit.issues) && item.recommendations.ai.audit.issues.length > 0 ? (
                              <div className="space-y-1">
                                <div className="text-xs text-gray-500 uppercase tracking-wider">⚠️ Problèmes détectés</div>
                                {item.recommendations.ai.audit.issues.slice(0, 5).map((line, idx) => (
                                  <div key={idx} className="text-sm text-gray-300">• {line}</div>
                                ))}
                              </div>
                            ) : null}
                            {Array.isArray(item.recommendations.ai.audit.quick_fixes) && item.recommendations.ai.audit.quick_fixes.length > 0 ? (
                              <div className="space-y-1">
                                <div className="text-xs text-gray-500 uppercase tracking-wider">⚡ Corrections rapides</div>
                                {item.recommendations.ai.audit.quick_fixes.slice(0, 5).map((line, idx) => (
                                  <div key={idx} className="text-sm text-green-300/90">✓ {line}</div>
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
                          <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 space-y-2">
                            <div className="text-white font-bold text-base">📋 Plan d'action</div>
                            <div className="space-y-2">
                              {item.recommendations.action_plan.slice(0, 7).map((stepObj, idx) => (
                                <div key={idx} className="text-sm text-gray-300">
                                  <div className="font-semibold text-white">Étape {stepObj.step}. {stepObj.title}</div>
                                  {Array.isArray(stepObj.do) ? (
                                    <div className="mt-1 text-gray-300 space-y-1 pl-4">
                                      {stepObj.do.slice(0, 4).map((line, lineIdx) => (
                                        <div key={lineIdx}>→ {line}</div>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {Array.isArray(item.recommendations.images_to_create) && item.recommendations.images_to_create.length > 0 ? (
                          <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 space-y-3">
                            <div className="text-white font-bold text-base">📸 Photos à réaliser</div>
                            <div className="space-y-4">
                              {item.recommendations.images_to_create.slice(0, 8).map((img, idx) => (
                                <div key={idx} className="bg-gray-900/50 border border-gray-700/60 rounded-lg p-3 space-y-2">
                                  <div className="font-bold text-white text-sm">Image {img.index || (idx + 1)} — {img.name}</div>
                                  <div className="text-sm text-gray-300">{img.what_to_shoot}</div>
                                  {img.why ? <div className="text-xs text-yellow-400/80 italic">💡 {img.why}</div> : null}
                                  {Array.isArray(img.uses_facts) && img.uses_facts.length > 0 ? (
                                    <div className="text-xs text-gray-500">Basé sur: <span className="text-gray-300">{img.uses_facts.slice(0, 3).join(' · ')}</span></div>
                                  ) : null}
                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                                    {img.background ? <div className="bg-gray-800/80 rounded px-2 py-1"><span className="text-gray-500">Fond:</span> <span className="text-gray-300">{img.background}</span></div> : null}
                                    {img.color_tone ? <div className="bg-gray-800/80 rounded px-2 py-1"><span className="text-gray-500">Ton:</span> <span className="text-gray-300">{img.color_tone}</span></div> : null}
                                    {img.props ? <div className="bg-gray-800/80 rounded px-2 py-1"><span className="text-gray-500">Props:</span> <span className="text-gray-300">{img.props}</span></div> : null}
                                    {img.camera ? <div className="bg-gray-800/80 rounded px-2 py-1"><span className="text-gray-500">Caméra:</span> <span className="text-gray-300">{img.camera}</span></div> : null}
                                    {img.lighting ? <div className="bg-gray-800/80 rounded px-2 py-1"><span className="text-gray-500">Éclairage:</span> <span className="text-gray-300">{img.lighting}</span></div> : null}
                                  </div>
                                  {img.editing_notes ? <div className="text-xs text-gray-500">✏️ Post-production: {img.editing_notes}</div> : null}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {Array.isArray(item.recommendations.recommended_order) && item.recommendations.recommended_order.length > 0 ? (
                          <div className="text-sm text-gray-300 space-y-1">
                            <div className="text-white font-bold">🔢 Ordre recommandé dans la galerie</div>
                            {item.recommendations.recommended_order.slice(0, 8).map((o, idx) => (
                              <div key={idx}>#{o.position} — <span className="text-white">{o.shot}</span> <span className="text-gray-400">({o.goal})</span></div>
                            ))}
                          </div>
                        ) : null}

                        {Array.isArray(item.recommendations.style_guidelines) && item.recommendations.style_guidelines.length > 0 ? (
                          <div className="text-sm text-gray-400 space-y-1">
                            <div className="text-white font-bold">🎯 Règles de style</div>
                            {item.recommendations.style_guidelines.slice(0, 4).map((line, idx) => (
                              <div key={idx}>• {line}</div>
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
              <p className="text-sm text-gray-400">{insightsLoading ? t('analysisInProgress') : `${getInsightCount(insightsData?.bundle_suggestions)} suggestions`}</p>
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
                          {selectedBundlesHistoryJobId && selectedBundlesHistoryJobId === (job.job_id || '') ? t('resultShown') : t('loadResult')}
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
          <div className="bg-gray-800 rounded-lg border border-gray-700">
            <div className="px-6 py-5 border-b border-gray-700">
              <h2 className="text-white text-xl font-bold flex items-center gap-2">
                <span>📦</span> Alertes rupture de stock
              </h2>
              <p className="text-gray-400 text-sm mt-1">Entrez un seuil à côté de chaque produit. La sauvegarde est automatique. Vous recevrez un email si le stock atteint le seuil.</p>
            </div>

            {stockProductsLoading ? (
              <div className="p-8 text-center">
                <svg className="animate-spin h-6 w-6 text-yellow-400 mx-auto mb-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                <p className="text-gray-400 text-sm">Chargement des produits...</p>
              </div>
            ) : stockProducts.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-gray-500 text-sm">{t('noShopifyProducts')}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-700 bg-gray-900/50">
                      <th className="text-left px-6 py-3 text-xs text-gray-400 font-semibold uppercase">Produit</th>
                      <th className="text-center px-4 py-3 text-xs text-gray-400 font-semibold uppercase w-28">Stock</th>
                      <th className="text-center px-4 py-3 text-xs text-gray-400 font-semibold uppercase w-36">Seuil d'alerte</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700/50">
                    {stockProducts.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-700/20 transition-colors">
                        <td className="px-6 py-3">
                          <p className="text-white text-sm font-medium">{p.title}</p>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-sm font-bold ${p.inventory <= 0 ? 'text-red-400' : p.inventory <= (p.threshold || 999999) ? 'text-yellow-400' : 'text-green-400'}`}>
                            {p.inventory}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="number"
                            min={0}
                            max={9999}
                            defaultValue={p.threshold || ''}
                            placeholder="—"
                            onBlur={(e) => {
                              const val = Math.max(0, Number(e.target.value) || 0)
                              autoSaveThreshold(p.id, p.title, val)
                              setStockProducts(prev => prev.map(x => x.id === p.id ? { ...x, threshold: val } : x))
                            }}
                            className="w-20 bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-yellow-400 font-bold text-sm text-center outline-none focus:border-yellow-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="px-6 py-3 border-t border-gray-700 bg-gray-900/30">
              <p className="text-xs text-gray-500">Le serveur vérifie automatiquement vos stocks <span className="text-yellow-400">toutes les 5 minutes</span>, 24/7. Un email est envoyé quand le stock atteint le seuil configuré.</p>
            </div>
          </div>
        )}

        {activeTab === 'action-returns' && (
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 space-y-6">
            <div>
              <h2 className="text-white text-xl font-bold mb-2">Anti-retours</h2>
              <p className="text-gray-400">Détecte les produits à risque de retours.</p>
            </div>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <p className="text-sm text-gray-400">{getInsightCount(insightsData?.return_risks)} alertes</p>
              <button
                onClick={() => runActionAnalysis('action-returns')}
                disabled={insightsLoading}
                className="font-bold py-3 px-6 rounded-lg disabled:opacity-50 transition-all duration-200 text-black"
                  style={{ background: 'linear-gradient(135deg, #D4A843 0%, #F2D272 25%, #BF953F 50%, #FCF6BA 75%, #B38728 100%)', boxShadow: '0 2px 12px rgba(212, 168, 67, 0.3)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 20px rgba(212, 168, 67, 0.6)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 2px 12px rgba(212, 168, 67, 0.3)'; e.currentTarget.style.transform = 'translateY(0)' }}
              >
                {insightsLoading ? t('analysisInProgress') : t('analyzeProducts')}
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
            <h2 className="text-white text-xl font-bold mb-4">{t('analyzeWithAI')}</h2>
            
            {products && products.length > 0 ? (
              <div>
                <p className="text-gray-400 mb-4">{products.length} produits à analyser</p>
                <button
                  onClick={analyzeProducts}
                  disabled={loading}
                  className="font-bold py-3 px-6 rounded-lg disabled:opacity-50 transition-all duration-200 text-black"
                  style={{ background: 'linear-gradient(135deg, #D4A843 0%, #F2D272 25%, #BF953F 50%, #FCF6BA 75%, #B38728 100%)', boxShadow: '0 2px 12px rgba(212, 168, 67, 0.3)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 20px rgba(212, 168, 67, 0.6)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 2px 12px rgba(212, 168, 67, 0.3)'; e.currentTarget.style.transform = 'translateY(0)' }}
                >
                  {loading ? t('analysisInProgress') : t('launchAIAnalysis')}
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
                                      {t('modificationUnavailable')}
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
                              <span className="text-green-400 font-bold">{t('newPrice')}: {action.new}$</span>
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
                            <p className="text-gray-400 text-sm mb-1">{t('problem')}: {action.issue}</p>
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
                  <p>{t('noAutoActions')}</p>
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

            <div className="flex flex-col md:flex-row h-[calc(90vh-120px)]">
              {/* Sidebar - horizontal on mobile, vertical on desktop */}
              <div className="md:w-64 bg-gray-800 md:border-r border-b md:border-b-0 border-gray-700 p-2 md:p-4 overflow-x-auto md:overflow-x-visible">
                <nav className="flex md:flex-col md:space-y-1 gap-1 md:gap-0 min-w-max md:min-w-0">
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
                          {LANGUAGES.map(l => (
                            <option key={l.code} value={l.code}>{l.flag} {l.name}</option>
                          ))}
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
                    <h3 className="text-xl font-bold text-white mb-4">{t('shopifyConnection')}</h3>
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
                      <p className="text-sm text-gray-400 mb-4">Géré par Stripe. Cliquez ci-dessous pour mettre à jour.</p>
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
            onClick={() => {
              setShowChatPanel(true)
              // Scroll to bottom if conversation has messages
              setTimeout(() => {
                if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'auto' })
              }, 100)
            }}
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
                            {/* Product mention badge */}
                            {msg.mentionedProduct && (
                              <div className="flex items-center gap-1.5 mb-1.5 -mt-0.5">
                                <span className="inline-flex items-center gap-1.5 bg-black/20 backdrop-blur-sm border border-black/20 rounded-full pl-1 pr-2.5 py-0.5">
                                  {msg.mentionedProduct.image ? (
                                    <img src={msg.mentionedProduct.image} alt="" className="w-4 h-4 rounded-full object-cover" />
                                  ) : (
                                    <span className="text-[11px]">📦</span>
                                  )}
                                  <span className="text-[11px] font-semibold">@{msg.mentionedProduct.title}</span>
                                </span>
                              </div>
                            )}
                            {msg.images && Array.isArray(msg.images) && msg.images.length > 0 && (
                              <div className="flex flex-wrap gap-2 mb-2">
                                {msg.images.map((img, imgIdx) => (
                                  <img key={imgIdx} src={typeof img === 'string' ? img : ''} alt="" className="max-w-[200px] max-h-[200px] rounded-lg object-cover border border-gray-600/30" />
                                ))}
                              </div>
                            )}
                            {msg.role === 'assistant'
                              ? formatChatText(typeof msg.text === 'string' ? msg.text : String(msg.text || ''))
                              : (typeof msg.text === 'string' ? msg.text : String(msg.text || ''))
                            }
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
                  {/* Product Picker Modal */}
                  {showProductPicker && (
                    <div className="mb-3 bg-[#1a1d27] border border-yellow-600/30 rounded-xl overflow-hidden" ref={productPickerRef}>
                      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-700/50">
                        <span className="text-sm font-semibold text-yellow-300">🛍️ Mentionner un produit</span>
                        <button onClick={() => { setShowProductPicker(false); setProductPickerSearch('') }} className="text-gray-400 hover:text-white text-lg">✕</button>
                      </div>
                      <div className="px-3 py-2">
                        <input
                          type="text"
                          value={productPickerSearch}
                          onChange={(e) => setProductPickerSearch(e.target.value)}
                          placeholder="Rechercher un produit..."
                          className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg border border-gray-700 text-sm placeholder:text-gray-500 outline-none focus:border-yellow-500/40"
                          autoFocus
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto px-1 pb-2">
                        {(!products || products.length === 0) ? (
                          <p className="text-center text-gray-500 text-xs py-4">Connecte Shopify pour voir tes produits.</p>
                        ) : (
                          (products || []).filter(p =>
                            !productPickerSearch || p.title?.toLowerCase().includes(productPickerSearch.toLowerCase())
                          ).map((product) => (
                            <button
                              key={product.id}
                              onClick={() => {
                                setMentionedProduct(product)
                                setShowProductPicker(false)
                                setProductPickerSearch('')
                                chatTextareaRef.current?.focus()
                              }}
                              className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-yellow-600/10 rounded-lg transition-colors"
                            >
                              {product.image?.src ? (
                                <img src={product.image.src} alt="" className="w-9 h-9 rounded-lg object-cover border border-gray-700" />
                              ) : (
                                <div className="w-9 h-9 rounded-lg bg-gray-700 flex items-center justify-center text-gray-500 text-xs">📦</div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-white truncate">{product.title}</p>
                                <p className="text-xs text-gray-500">{product.variants?.[0]?.price || '—'} {product.variants?.[0]?.currency || 'CAD'}</p>
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {/* Mentioned product chip + suggested questions */}
                  {mentionedProduct && (
                    <div className="mb-3 space-y-2">
                      <div className="flex items-center gap-2 bg-yellow-900/20 border border-yellow-600/30 rounded-xl px-3 py-2">
                        {mentionedProduct.image?.src ? (
                          <img src={mentionedProduct.image.src} alt="" className="w-8 h-8 rounded-lg object-cover" />
                        ) : (
                          <span className="text-lg">📦</span>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-yellow-200 font-medium truncate">{mentionedProduct.title}</p>
                          <p className="text-[11px] text-gray-400">{mentionedProduct.variants?.[0]?.price || ''} {mentionedProduct.variants?.[0]?.currency || 'CAD'}</p>
                        </div>
                        <button onClick={() => setMentionedProduct(null)} className="text-gray-400 hover:text-white shrink-0">
                          <svg width="14" height="14" viewBox="0 0 12 12" fill="none"><path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          'Ma description est-elle bonne ?',
                          'Mes photos sont-elles attrayantes ?',
                          'Comment améliorer mon titre SEO ?',
                          'Quel prix recommandes-tu ?',
                          'Quels sont les points forts et faibles ?',
                        ].map((q) => (
                          <button
                            key={q}
                            onClick={() => { setChatInput(q); chatTextareaRef.current?.focus() }}
                            className="px-2.5 py-1 bg-gray-800 hover:bg-yellow-600/20 border border-gray-700 hover:border-yellow-600/40 rounded-full text-xs text-gray-300 hover:text-yellow-200 transition-colors"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

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

                  <div className={`flex items-end gap-2 bg-[#1a1d27] border border-gray-700/50 rounded-xl px-3 py-2 transition-colors ${
                    voiceDictationMode ? 'border-gray-700/50' : 'focus-within:border-yellow-500/40'
                  }`}>
                    {/* Left buttons: + (always visible) */}
                    <div className="relative shrink-0" ref={attachMenuRef}>
                      {!voiceDictationMode && (
                        /* + button (normal mode only) */
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
                                <span className="flex items-center gap-3"><svg width="16" height="16" viewBox="0 0 20 20" fill="none" className="text-gray-400"><path d="M13 3L7 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>{t('skills')}</span>
                                <span className="text-xs text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded">/</span>
                              </button>
                              <div className="border-t border-gray-700/40 my-1"></div>
                              <button onClick={() => { setShowProductPicker(true); setShowAttachMenu(false); if (!products || products.length === 0) loadProducts() }} className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-yellow-300 hover:bg-yellow-600/10 transition-colors">
                                <span className="flex items-center gap-3"><svg width="16" height="16" viewBox="0 0 20 20" fill="none" className="text-yellow-400"><path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17M17 17a2 2 0 100-4 2 2 0 000 4zM7 17a2 2 0 100-4 2 2 0 000 4z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>Mentionner un produit</span>
                                <span className="text-xs text-yellow-600/70 bg-yellow-900/30 px-1.5 py-0.5 rounded">🛍️</span>
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Waveform OR Textarea */}
                    {voiceDictationMode ? (
                      voiceTranscribing ? (
                        <div className="flex-1 flex items-center justify-center h-11 px-1">
                          <span className="text-sm text-gray-300">Retranscription en cours…</span>
                        </div>
                      ) : (
                        /* ChatGPT-style dense waveform across full width */
                        <div className="flex-1 flex items-center justify-center gap-[2px] h-11 px-1 overflow-hidden">
                          {voiceWaveBars.map((h, i) => (
                            <div
                              key={i}
                              className="w-[2px] min-w-[2px] rounded-full"
                              style={{
                                height: `${Math.round(h)}px`,
                                background: '#d1d5db',
                                transition: 'height 60ms ease-out'
                              }}
                            />
                          ))}
                        </div>
                      )
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
                      voiceTranscribing ? null : (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={cancelDictation}
                            className="w-8 h-8 flex items-center justify-center text-gray-300 hover:text-white bg-gray-700/50 hover:bg-gray-600/70 rounded-full transition-colors"
                            title="Annuler"
                          >
                            <span className="text-base font-semibold">✕</span>
                          </button>
                          <button
                            onClick={confirmDictation}
                            className="w-8 h-8 flex items-center justify-center text-white bg-green-600/80 hover:bg-green-500 rounded-full transition-colors"
                            title="Valider"
                          >
                            <span className="text-base font-semibold">✓</span>
                          </button>
                        </div>
                      )
                    ) : chatInput.trim() ? (
                      /* Send button */
                      <button
                        onClick={() => sendChatMessage()}
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

                  <div className="flex items-center justify-center mt-2 px-1">
                    <p className="text-[10px] text-gray-600">ShopBrain IA peut faire des erreurs. Vérifiez les informations importantes.</p>
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


            </>
          )}
        </main>
      </div>

    </div>
  )
}
