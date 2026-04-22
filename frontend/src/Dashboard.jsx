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
const readStoredSubscription = () => {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem('subscriptionCache')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return (parsed && typeof parsed === 'object') ? parsed : null
  } catch {
    return null
  }
}

const resetSubscriptionClientCaches = ({ preserveLocal = false } = {}) => {
  _cachedSession = null
  _cachedSessionTs = 0
  _apiCache.clear()
  if (!preserveLocal && typeof window !== 'undefined') {
    localStorage.removeItem('subscriptionCache')
    localStorage.removeItem('profileCache')
  }
}

const getCachedSession = async (forceRefresh = false) => {
  if (!forceRefresh && _cachedSession && (Date.now() - _cachedSessionTs < SESSION_CACHE_TTL)) {
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
  const data = await resp.json().catch(() => ({ success: false, detail: `HTTP ${resp.status}` }))
  // Only cache successful responses
  if (resp.ok) {
    _apiCache.set(cacheKey, { data, ts: Date.now() })
  }
  return data
}

export default function Dashboard() {
  const initialStoredSubscription = readStoredSubscription()
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
  const [subscription, setSubscription] = useState(initialStoredSubscription)
  const [subscriptionReady, setSubscriptionReady] = useState(Boolean(initialStoredSubscription?.has_subscription))
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [shopifyUrl, setShopifyUrl] = useState(() => {
    if (typeof window === 'undefined') return ''
    return localStorage.getItem('shopifyUrlCache') || ''
  })
  const [shopifyToken, setShopifyToken] = useState('')
  const [shopifyConnected, setShopifyConnected] = useState(false)
  const [shopifyConnecting, setShopifyConnecting] = useState(false)
  const [showShopifyToken, setShowShopifyToken] = useState(false)
  // ── Multi-shop state ──
  const [shopList, setShopList] = useState([])       // all connected shops [{shop_domain, is_active, created_at, updated_at}]
  const [shopLimit, setShopLimit] = useState(1)       // plan limit (null = unlimited)
  const [showAddShop, setShowAddShop] = useState(false)
  const [newShopUrl, setNewShopUrl] = useState('')
  const [newShopToken, setNewShopToken] = useState('')
  const [switchingShop, setSwitchingShop] = useState(false)
  const [products, setProducts] = useState(null)
  const [error, setError] = useState('')
  const [isProcessingPayment, setIsProcessingPayment] = useState(false)

  // ──── STRICT PLAN FEATURE GATES ────
  // Standard $99: product analysis (50/mo), title rewrite, price suggestions, 1 shop, monthly report
  // Pro $199: + description rewrite, image recs, cross-sell/bundles, 500/mo, 3 shops, weekly reports, automated actions, invoices
  // Premium $299: + IA prédictive, auto stock, unlimited products/shops, daily reports, API, account manager
  const PLAN_GATES = {
    // feature_key: minimum plan required
    'product_analysis': 'standard',
    'title_optimization': 'standard',
    'price_suggestions': 'standard',
    'content_generation': 'pro',       // description rewrite
    'image_recommendations': 'pro',    // image AI
    'cross_sell': 'pro',               // bundles & upsell
    'reports': 'standard',                  // monthly reports (standard), weekly (pro), daily (premium)
    'reports_weekly': 'pro',               // weekly+ reports
    'reports_daily': 'premium',            // daily reports
    'automated_actions': 'pro',        // apply actions to Shopify
    'invoicing': 'pro',                // invoices tab
    'predictions': 'premium',          // IA prédictive
    'auto_stock': 'premium',           // automated stock actions
    'api_access': 'premium',           // API access
  }
  const PLAN_RANK = { standard: 1, pro: 2, premium: 3 }
  const userPlanRank = PLAN_RANK[subscription?.plan] || 0
  const canAccess = (feature) => userPlanRank >= (PLAN_RANK[PLAN_GATES[feature]] || 1)
  const getProductLimit = () => ({ standard: 50, pro: 500, premium: Infinity }[subscription?.plan] || 50)
  const planLabel = (feature) => PLAN_GATES[feature] === 'premium' ? 'Premium' : 'Pro'
  const [showPlanMenu, setShowPlanMenu] = useState(false)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [settingsTab, setSettingsTab] = useState(() => {
    if (typeof window === 'undefined') return 'profile'
    return localStorage.getItem('settingsTab') || 'profile'
  })
  const [subscriptionMissing, setSubscriptionMissing] = useState(false)
  const [loadingTimedOut, setLoadingTimedOut] = useState(false)
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
  const [darkMode, setDarkMode] = useState(true)
  const { t, language, setLanguage, LANGUAGES } = useTranslation()
  const [interfaceLanguageDraft, setInterfaceLanguageDraft] = useState(language)
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
  const analyticsCacheRef = useRef(new Map())
  const analyticsInFlightRef = useRef(new Set())
  const ANALYTICS_CACHE_TTL_MS = 60_000
  const ANALYTICS_POLL_MS = 10_000
  const [insightsData, setInsightsData] = useState(null)
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [insightsError, setInsightsError] = useState('')
  const [priceInstructions, setPriceInstructions] = useState('')
  const [priceProductId, setPriceProductId] = useState('')
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
  const [rewriteInstructions, setRewriteInstructions] = useState('')
  const [imageProductId, setImageProductId] = useState('')
  const [imageInstructions, setImageInstructions] = useState('')
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

  const buildSparklinePoints = (series, width = 520, height = 140, field = 'total_sales') => {
    if (!series || series.length === 0) return ''
    const values = series.map((point) => Number(point[field] || point.revenue || 0))
    const max = Math.max(...values)
    const min = Math.min(...values)
    const range = max - min || 1
    const step = width / Math.max(series.length - 1, 1)

    return series.map((point, index) => {
      const value = Number(point[field] || point.revenue || 0)
      const x = index * step
      const y = height - ((value - min) / range) * height
      return `${x},${y}`
    }).join(' ')
  }

  // Build a smooth SVG area chart path (line + closed fill area)
  // Handles edge cases: 0 points, 1 point, flat line, etc.
  const buildAreaChartPath = (series, width = 520, height = 180, field = 'total_sales', padding = { top: 15, bottom: 32, left: 55, right: 10 }) => {
    const empty = { linePath: '', areaPath: '', points: [], yLabels: [], xLabels: [] }
    if (!series || series.length === 0) return empty

    const chartW = width - padding.left - padding.right
    const chartH = height - padding.top - padding.bottom

    // ── Compute Y domain ──
    const values = series.map((p) => Number(p[field] || p.revenue || 0))
    let maxVal = Math.max(...values)
    let minVal = Math.min(...values)
    // If all values are the same (or zero), add headroom so the line isn't stuck at edge
    if (maxVal === minVal) {
      maxVal = maxVal > 0 ? maxVal * 1.3 : 100
      minVal = 0
    }
    // Always start Y at 0 for area charts (Shopify-style)
    if (minVal > 0) minVal = 0
    const valRange = maxVal - minVal || 1

    // ── Map series to pixel coords ──
    const step = series.length > 1 ? chartW / (series.length - 1) : 0
    const pts = series.map((p, i) => {
      const val = Number(p[field] || p.revenue || 0)
      const x = padding.left + (series.length > 1 ? i * step : chartW / 2)
      const y = padding.top + chartH - ((val - minVal) / valRange) * chartH
      return { x, y, val, date: p.date, orders: p.orders || 0 }
    })

    // ── Build SVG path ──
    let linePath = ''
    if (pts.length === 1) {
      // Single point: draw a short horizontal line so the area is visible
      const pt = pts[0]
      linePath = `M ${padding.left} ${pt.y} L ${padding.left + chartW} ${pt.y}`
      // Override points to span the full width for area fill
      pts.length = 0
      pts.push({ ...pt, x: padding.left })
      pts.push({ ...pt, x: padding.left + chartW })
    } else {
      // Smooth cubic bezier through all points
      linePath = `M ${pts[0].x} ${pts[0].y}`
      for (let i = 1; i < pts.length; i++) {
        const prev = pts[i - 1]
        const cur = pts[i]
        const cpx = (prev.x + cur.x) / 2
        linePath += ` C ${cpx} ${prev.y}, ${cpx} ${cur.y}, ${cur.x} ${cur.y}`
      }
    }

    // Area path: line → close to bottom
    const bottomY = padding.top + chartH
    const areaPath = `${linePath} L ${pts[pts.length - 1].x} ${bottomY} L ${pts[0].x} ${bottomY} Z`

    // ── Y-axis labels (5 ticks from 0 to max) ──
    const yTickCount = 4
    const yLabels = Array.from({ length: yTickCount + 1 }, (_, i) => {
      const val = minVal + (valRange * (yTickCount - i)) / yTickCount
      const y = padding.top + (chartH * i) / yTickCount
      return { val, y }
    })

    // ── X-axis labels: pick ~6 evenly spaced dates ──
    const formatDateLabel = (dateStr) => {
      const d = new Date(dateStr + 'T00:00:00')
      return !isNaN(d.getTime()) ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : dateStr.slice(5)
    }
    const targetLabels = Math.min(series.length, 7)
    const labelStep = Math.max(1, Math.floor((series.length - 1) / Math.max(targetLabels - 1, 1)))
    const xLabels = []
    for (let i = 0; i < series.length; i += labelStep) {
      xLabels.push({ x: padding.left + (series.length > 1 ? i * step : chartW / 2), label: formatDateLabel(series[i].date) })
    }
    // Ensure last date is always shown
    const lastX = padding.left + (series.length > 1 ? (series.length - 1) * step : chartW / 2)
    if (xLabels.length === 0 || Math.abs(xLabels[xLabels.length - 1].x - lastX) > 20) {
      xLabels.push({ x: lastX, label: formatDateLabel(series[series.length - 1].date) })
    }

    return { linePath, areaPath, points: pts, yLabels, xLabels }
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
      return <p className="text-xs text-[#8A8AA3] mt-2">{t('loading')}</p>
    }
    if (!Array.isArray(items) || items.length === 0) {
      return <p className="text-xs text-[#8A8AA3] mt-2">{t('noSignalDetected')}</p>
    }
    return (
      <ul className="mt-2 space-y-1 text-xs text-[#6A6A85]">
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
    const loc = language === 'fr' ? 'fr-FR' : (language === 'es' ? 'es-ES' : 'en-US')
    return `${startDate.toLocaleDateString(loc)} — ${endDate.toLocaleDateString(loc)}`
  }

  const formatPlan = (plan) => {
    const normalized = String(plan || '').toLowerCase()
    if (normalized === 'standard') return 'STANDARD'
    if (normalized === 'pro') return 'PRO'
    if (normalized === 'premium') return 'PREMIUM'
    return '—'
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

  const tr = (key, fallback) => {
    const translated = t(key)
    if (!translated) return fallback
    if (translated === key) return fallback
    return translated
  }

  const formatErrorDetail = (detail, fallback = t('error')) => {
    if (!detail) return fallback
    const str = typeof detail === 'string' ? detail : typeof detail?.message === 'string' ? detail.message : null
    if (str) {
      // Never show raw database/internal errors
      if (/column.*does not exist|relation.*does not exist|42703|42P01|SQLSTATE/i.test(str)) return fallback
      return str
    }
    return fallback
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
    // Never show raw database/internal errors to user
    if (/column.*does not exist|relation.*does not exist|42703|42P01|syntax error at|SQLSTATE/i.test(raw)) {
      return fallback
    }
    return raw || fallback
  }

  const formatUserFacingError = (err, fallback = t('anErrorOccurred')) => {
    const message = normalizeNetworkErrorMessage(err, fallback)
    return message || fallback
  }

  const formatPlanSwitchError = (detail) => {
    const raw = String(detail || '').trim()
    const lower = raw.toLowerCase()
    if (!raw) return tr('unableToSchedulePlanChange', 'Unable to schedule plan change. Please try again.')
    if (lower.includes('cannot determine current billing period end') || lower.includes('unable to determine renewal date')) {
      return tr('unableToDetermineRenewalDate', 'Unable to determine your renewal date right now. Please retry in 1 minute.')
    }
    if (lower.includes('no active subscription found')) {
      return tr('noActiveSubscription', 'No active subscription found.')
    }
    // Never leak raw Stripe/API errors — check for known safe messages only
    if (lower.includes('already on this plan')) return raw
    if (lower.includes('please retry') || lower.includes('please contact support')) return raw
    if (lower.includes('unable to') || lower.includes('plan change')) return raw
    return tr('unableToSchedulePlanChange', 'Unable to schedule plan change. Please try again.')
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
            className="text-[#FF6B35] hover:text-[#FF6B35] underline underline-offset-2 decoration-yellow-400/40 hover:decoration-yellow-300 transition-colors"
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
            className="text-[#FF6B35] hover:text-[#FF6B35] underline underline-offset-2 decoration-yellow-400/40 hover:decoration-yellow-300 transition-colors"
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
      ? 'bg-teal-50 border-teal-300 text-teal-700'
      : status.type === 'warning'
        ? 'bg-orange-50 border-[#FF6B35] text-[#E85A28]'
        : status.type === 'error'
          ? 'bg-white border-[#E85A28] text-[#FF8B60]'
          : 'bg-white border-[#E8E8EE] text-[#2A2A42]'

    // Show a retry button when the error is a cold-start / network error
    const isRetryable = status.type === 'error' && (
      String(status.message || '').includes(t('backendWaking')?.slice(0, 20)) ||
      /serveur|backend|wak|démarre|starting|connexion|connect|unreachable/i.test(status.message || '')
    )
    const retryAction = isRetryable ? {
      'action-returns': () => runActionAnalysis('action-returns'),
      'action-price': () => runActionAnalysis('action-price'),
      'action-bundles': () => runActionAnalysis('action-bundles'),
      'action-images': () => runActionAnalysis('action-images'),
      'action-blockers': () => runActionAnalysis('action-blockers'),
      'action-rewrite': () => runActionAnalysis('action-rewrite'),
      'underperforming': () => loadUnderperforming(),
    }[key] : null

    return (
      <div className={`mt-3 p-3 rounded-lg border ${styles} ${isRetryable ? 'flex items-center justify-between gap-3' : ''}`}>
        <span>{status.message}</span>
        {retryAction && (
          <button
            onClick={retryAction}
            disabled={insightsLoading}
            className="shrink-0 bg-[#FF6B35] hover:bg-[#E85A28] text-white text-xs font-bold py-1.5 px-4 rounded-md disabled:opacity-50 transition-colors"
          >
            {t('retry')}
          </button>
        )}
      </div>
    )
  }

  // Translations are now managed by LanguageContext

  // Normalize a timestamp value that may be a Unix seconds integer, ISO string, or ms number
  const normalizeTimestampValue = (val) => {
    if (!val) return null
    if (typeof val === 'string') {
      // ISO string — return as-is if it parses to a valid date
      const d = new Date(val)
      if (!isNaN(d.getTime()) && d.getFullYear() > 1971) return val
    }
    const num = Number(val)
    if (!num || isNaN(num)) return null
    // If it looks like Unix seconds (< 1e12 → before year ~2001 in ms), convert to ISO
    if (num > 0 && num < 2e10) return new Date(num * 1000).toISOString()
    // Already milliseconds
    if (num > 1e12) return new Date(num).toISOString()
    return null
  }

  const normalizeSubscription = (raw) => {
    const status = String(raw?.subscription_status || raw?.status || 'inactive').toLowerCase().trim()
    const paid = raw?.paid === true || raw?.plan === true || raw?.has_subscription === true
    const activePaid = (status === 'active' || status === 'cancelling') && paid
    // Plan tier: prefer explicit string plan from backend (Stripe-verified)
    // raw.plan can be boolean (true) from DB, so check typeof; also check plan_tier field
    const tier = (typeof raw?.plan === 'string' && raw.plan !== 'free' && raw.plan !== 'true')
      ? raw.plan
      : (typeof raw?.plan_tier === 'string' ? raw.plan_tier : null)
    const validTiers = ['standard', 'pro', 'premium']
    const resolvedPlan = (tier && validTiers.includes(tier.toLowerCase())) ? tier.toLowerCase() : null
    const rawUpcoming = typeof raw?.upcoming_plan === 'string' ? raw.upcoming_plan.toLowerCase() : null
    const upcomingPlan = (rawUpcoming && validTiers.includes(rawUpcoming) && rawUpcoming !== resolvedPlan) ? rawUpcoming : null
    // TRUST backend has_subscription if explicitly true — don't require resolvedPlan
    // Backend already verified via Stripe. If plan is null the user still has access,
    // we just can't determine the exact tier (fallback to 'standard').
    const backendSaysActive = raw?.has_subscription === true
    const isActive = backendSaysActive || (activePaid && !!resolvedPlan)
    const effectivePlan = resolvedPlan || (isActive ? 'standard' : null)
    return {
      has_subscription: isActive,
      paid: isActive || activePaid,
      status: isActive ? (status === 'inactive' ? 'active' : status) : 'inactive',
      subscription_status: isActive ? (status === 'inactive' ? 'active' : status) : 'inactive',
      plan: isActive ? effectivePlan : null,
      upcoming_plan: isActive ? upcomingPlan : null,
      upcoming_plan_effective_at: isActive ? (raw?.upcoming_plan_effective_at || null) : null,
      current_period_end: isActive ? normalizeTimestampValue(raw?.current_period_end) : null,
      payment_date: raw?.payment_date || null,
      started_at: raw?.started_at || null,
      capabilities: raw?.capabilities || null,
      cancel_at_period_end: raw?.cancel_at_period_end || false,
      cancel_at: raw?.cancel_at || null
    }
  }

  const refreshSubscriptionState = async (userId, accessToken) => {
    const resp = await fetch(`${API_URL}/api/subscription/status`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({ user_id: userId })
    })
    const data = await resp.json()
    console.log('[FRONT-SUB] read on login', data)
    const normalized = normalizeSubscription(data)
    setSubscription(normalized)
    setSubscriptionReady(true)
    setSubscriptionMissing(!normalized.has_subscription)
    if (typeof window !== 'undefined') {
      localStorage.setItem('subscriptionCache', JSON.stringify(normalized))
    }
    return normalized
  }

  const verifyPaymentSession = async (sessionId) => {
    try {
      resetSubscriptionClientCaches()
      const session = await getCachedSession(true)
      if (!session) {
        initializeUser(true)
        return
      }

      const response = await fetch(`${API_URL}/api/subscription/verify-session`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ session_id: sessionId }),
        signal: AbortSignal.timeout(120000) // 2min timeout for Render cold start
      })

      const data = await response.json()
      if (data.success) {
        console.log('Payment session verified and plan updated')
      }
      
      // Single authoritative call — do NOT call refreshSubscriptionState separately
      // initializeUser already reads subscription from /api/init
      await initializeUser(true)
    } catch (err) {
      console.error('Payment verification error:', err)
      await initializeUser(true)
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
      // Payment redirect — verify session first, then poll sequentially (not in parallel)
      resetSubscriptionClientCaches()
      setIsProcessingPayment(true)
      
      // Verify first, then poll if subscription not found yet
      verifyPaymentSession(sessionId || hashSessionId).then(() => {
        // After verify completes, poll sequentially only if no subscription
        let pollCount = 0
        const doPoll = async () => {
          if (pollCount >= 12) {
            setIsProcessingPayment(false)
            return
          }
          pollCount++
          const result = await initializeUser(true)
          if (result?.has_subscription) {
            setIsProcessingPayment(false)
          } else {
            // Increasing delay: 3s, 4s, 5s... up to 8s (backend cold start can take 2min)
            const delay = Math.min(3000 + pollCount * 1000, 8000)
            setTimeout(doPoll, delay)
          }
        }
        // Wait 4s before first poll — backend needs time to wake up + process webhook
        setTimeout(doPoll, 4000)
      })
      
      // Cleanup URL
      setTimeout(() => {
        const baseUrl = window.location.href.split('?')[0].split('#')[0]
        window.history.replaceState({}, document.title, baseUrl)
      }, 1000)
      
      // Safety timeout to stop processing indicator (2.5 min for cold start)
      setTimeout(() => {
        setIsProcessingPayment(false)
      }, 150000)
    } else if (hasHashSuccess) {
      // Fallback for hash-based success detection — single sequential flow
      resetSubscriptionClientCaches()
      setIsProcessingPayment(true)
      
      initializeUser(true).then(() => {
        let pollCount = 0
        const doPoll = async () => {
          if (pollCount >= 10) {
            setIsProcessingPayment(false)
            return
          }
          pollCount++
          const result = await initializeUser(true)
          if (result?.has_subscription) {
            setIsProcessingPayment(false)
          } else {
            const delay = Math.min(3000 + pollCount * 1000, 8000)
            setTimeout(doPoll, delay)
          }
        }
        setTimeout(doPoll, 4000)
      })
      
      setTimeout(() => {
        setIsProcessingPayment(false)
        window.location.hash = window.location.hash.replace('success=true', '')
      }, 120000)
    } else {
      // ── Shopify OAuth return handler ──
      const shopifyStatus = hashParams.get('shopify')
      if (shopifyStatus) {
        if (shopifyStatus === 'connected') {
          const connectedShop = hashParams.get('shop') || ''
          console.log('✅ Shopify OAuth connected:', connectedShop)
          setShopifyConnected(true)
          if (connectedShop) {
            setShopifyUrl(connectedShop)
            localStorage.setItem('shopifyUrlCache', connectedShop)
          }
          setActiveTab('settings')
          setTimeout(() => {
            setStatus('shopify', 'success', `${t('shopifyConnectedSuccess')}${connectedShop ? ` (${connectedShop})` : ''} ! 🎉`)
          }, 500)
          // Refresh shop list and products
          initializeUser(true).then(() => {
            refreshShopList()
            loadProducts()
          })
        } else if (shopifyStatus === 'limit_reached') {
          const plan = hashParams.get('plan') || ''
          const limit = hashParams.get('limit') || ''
          setActiveTab('settings')
          setTimeout(() => {
            setStatus('shopify', 'warning', t('shopLimitReached').replace('{limit}', limit).replace('{plan}', plan))
          }, 500)
          initializeUser(true)
        } else if (shopifyStatus === 'error') {
          const reason = hashParams.get('reason') || 'unknown'
          const reasonMessages = {
            missing_params: t('oauthMissingParams'),
            server_config: t('oauthServerConfig'),
            hmac_failed: t('oauthHmacFailed'),
            expired: t('oauthExpired'),
            state_mismatch: t('oauthStateMismatch'),
            no_user: t('oauthNoUser'),
            timeout: t('oauthTimeout'),
            exchange_failed: t('oauthExchangeFailed'),
            token_invalid: t('oauthTokenInvalid'),
            no_token: t('oauthNoToken'),
            internal: t('oauthInternal'),
          }
          setActiveTab('settings')
          setTimeout(() => {
            setStatus('shopify', 'error', reasonMessages[reason] || `${t('oauthGenericError')}: ${reason}`)
          }, 500)
          initializeUser(true)
        } else {
          initializeUser(true)
        }
        // Clean up the hash params
        setTimeout(() => {
          const cleanHash = hash.split('?')[0] || '#/dashboard'
          window.location.hash = cleanHash
        }, 1500)
      } else {
        // Normal initialization
        initializeUser(true)
      }
    }
  }, [])

  // 🔄 Auto-refresh subscription when user returns from Stripe Billing Portal / external redirect
  // The portal redirects to #dashboard with no session_id, so we detect tab visibility change
  useEffect(() => {
    let lastHidden = 0
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        lastHidden = Date.now()
      } else if (document.visibilityState === 'visible' && lastHidden > 0) {
        const awayMs = Date.now() - lastHidden
        // If user was away for more than 3 seconds (likely external redirect), refresh subscription
        if (awayMs > 3000) {
          console.log(`🔄 Tab refocused after ${(awayMs / 1000).toFixed(1)}s — refreshing subscription...`)
          resetSubscriptionClientCaches()
          initializeUser(true)
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  useEffect(() => {
    if (showSettingsModal && settingsTab === 'api') {
      loadApiKeys()
    }
  }, [showSettingsModal, settingsTab])

  useEffect(() => {
    if (showSettingsModal && settingsTab === 'interface') {
      setInterfaceLanguageDraft(language)
    }
  }, [showSettingsModal, settingsTab, language])

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
      // Tab persistence disabled — always start on overview
      // localStorage.setItem('activeTab', activeTab)
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
  const bundlesHistoryAutoLoadedRef = useRef(false)
  useEffect(() => {
    if (activeTab === 'action-bundles' && !bundlesAutoLoadedRef.current && !insightsLoading && subscription?.has_subscription) {
      // Only auto-load once per session, or if no data yet
      const hasBundleData = Array.isArray(insightsData?.bundle_suggestions) && insightsData.bundle_suggestions.length > 0
      if (!hasBundleData) {
        bundlesAutoLoadedRef.current = true
        loadBundlesAsync().catch(() => {})
      }
    }
    // Auto-load history in background when tab opens
    if (activeTab === 'action-bundles' && !bundlesHistoryAutoLoadedRef.current && subscription?.has_subscription) {
      bundlesHistoryAutoLoadedRef.current = true
      loadBundlesHistory({ openDropdown: false }).catch(() => {})
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
    if (showChatPanel) {
      setShowConversationMenu(false)
    }
  }, [showChatPanel])

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

  // ⚡ Warmup: ping backend immediately so cold start happens in parallel
  useEffect(() => {
    fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(120000) }).catch(() => {})
  }, [])

  // Safety valve: if loading screen persists for 8s, fall through to dashboard
  useEffect(() => {
    const timer = setTimeout(() => setLoadingTimedOut(true), 8000)
    return () => clearTimeout(timer)
  }, [])

  const initRetryRef = useRef(0)
  const initInFlightRef = useRef(false)
  const initBackgroundRetryTimerRef = useRef(null)

  useEffect(() => {
    return () => {
      if (initBackgroundRetryTimerRef.current) {
        clearTimeout(initBackgroundRetryTimerRef.current)
      }
    }
  }, [])

  const scheduleBackgroundInitRetry = (delayMs = 15000) => {
    if (initBackgroundRetryTimerRef.current) return
    initBackgroundRetryTimerRef.current = setTimeout(() => {
      initBackgroundRetryTimerRef.current = null
      initializeUser(true)
    }, delayMs)
  }

  const clearBackgroundInitRetry = () => {
    if (!initBackgroundRetryTimerRef.current) return
    clearTimeout(initBackgroundRetryTimerRef.current)
    initBackgroundRetryTimerRef.current = null
  }

  // lastSwitchedPlanRef removed — backend now live-syncs plan from Stripe, no local override needed
  const initializeUser = async (forceFresh = false) => {
    if (initInFlightRef.current) {
      return subscription || readStoredSubscription() || null
    }
    initInFlightRef.current = true
    try {
      setError('')  // Clear any previous error on each attempt
      clearBackgroundInitRetry()
      if (forceFresh) resetSubscriptionClientCaches({ preserveLocal: true })
      const session = await getCachedSession(forceFresh)
      
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
      // Pass force=1 when retrying (forceFresh) to bypass server-side cache
      const initUrl = forceFresh ? `${API_URL}/api/init?force=1` : `${API_URL}/api/init`
      const initResp = await fetch(initUrl, {
        headers: authHeaders,
        signal: AbortSignal.timeout(30000)
      })

      if (initResp.status === 401) {
        await supabase.auth.signOut()
        setUser(null)
        window.location.hash = '#/'
        return null
      }

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
            setInterfaceLanguageDraft(initData.interface.language)
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

        // Shopify connection (multi-shop)
        const nextConnections = Array.isArray(initData.shopify?.connections) ? initData.shopify.connections : []
        setShopList(nextConnections)
        const activeFromList = nextConnections.find((shop) => shop?.is_active) || nextConnections[0] || null
        const activeDomain = initData.shopify?.connection?.shop_domain || activeFromList?.shop_domain || ''
        if (activeDomain) {
          setShopifyUrl(activeDomain)
          setShopifyConnected(true)
          localStorage.setItem('shopifyUrlCache', activeDomain)
        } else {
          setShopifyUrl('')
          setShopifyConnected(false)
          localStorage.removeItem('shopifyUrlCache')
        }
        if (initData.shopify?.shop_limit !== undefined) {
          setShopLimit(initData.shopify.shop_limit)
        }

        setLoading(false)

        // ⚡ Load conversation history from Supabase in background
        loadConversationsFromServer()

        // Subscription — trust the backend (Stripe-verified), never override locally
        const subData = normalizeSubscription(initData.subscription || {})
        
        setSubscription(subData)
        setSubscriptionReady(true)
        // Clear stale subscription cache when backend says no active subscription
        if (!subData.has_subscription) {
          try { localStorage.removeItem('subscriptionCache') } catch {}
        }
        if (subData.has_subscription) {
          setSubscriptionMissing(false)
          initRetryRef.current = 0
          clearBackgroundInitRetry()
          console.log(`⚡ Subscription: ${subData.plan} — loading products + analytics in parallel...`)
          // Load products and analytics IN PARALLEL
          Promise.all([
            loadProducts(),
            loadAnalytics(analyticsRange)
          ])
          return subData
        } else {
          const cachedSub = readStoredSubscription()
          if (cachedSub?.has_subscription) {
            setSubscription(cachedSub)
            setSubscriptionReady(true)
            setSubscriptionMissing(false)
            if (initRetryRef.current < 6) {
              initRetryRef.current++
              const delay = Math.min(3000 * initRetryRef.current, 10000)
              console.log(`🔄 Backend returned no subscription; keeping cached plan and retrying in ${delay / 1000}s...`)
              setTimeout(() => initializeUser(true), delay)
            }
            return cachedSub
          }
          setSubscriptionMissing(true)
          // Auto-retry up to 6 times with increasing delay (for webhook propagation + cold start)
          if (initRetryRef.current < 6) {
            initRetryRef.current++
            const delay = Math.min(3000 * initRetryRef.current, 10000)
            console.log(`🔄 No subscription found, retrying in ${delay/1000}s (attempt ${initRetryRef.current}/6)...`)
            setTimeout(() => initializeUser(true), delay)
          } else {
            setError(t('backendStarting'))
            scheduleBackgroundInitRetry(15000)
          }
          return subData
        }
      } else {
        // Fallback to old method if /api/init fails
        console.warn('⚡ /api/init failed, falling back to individual calls...')
        const profilePromise = fetch(`${API_URL}/api/auth/profile`, {
          headers: authHeaders,
          signal: AbortSignal.timeout(30000)
        })
        const shopPromise = fetch(`${API_URL}/api/shopify/connection`, {
          headers: authHeaders,
          signal: AbortSignal.timeout(30000)
        })
        const subPromise = fetch(`${API_URL}/api/subscription/status`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ user_id: session.user.id }),
          signal: AbortSignal.timeout(30000)
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
          if (shopData.connections) setShopList(shopData.connections)
          if (shopData.shop_limit !== undefined) setShopLimit(shopData.shop_limit)
        }

        setLoading(false)

        const data = subResp.ok ? await subResp.json() : null
        const normalizedSub = normalizeSubscription(data || {})
        
        setSubscription(normalizedSub)
        setSubscriptionReady(true)
        if (!normalizedSub.has_subscription) {
          try { localStorage.removeItem('subscriptionCache') } catch {}
        }
        if (normalizedSub.has_subscription) {
          setSubscriptionMissing(false)
          initRetryRef.current = 0
          clearBackgroundInitRetry()
          Promise.all([loadProducts(), loadAnalytics(analyticsRange)])
          return normalizedSub
        } else {
          const cachedSub = readStoredSubscription()
          if (cachedSub?.has_subscription) {
            setSubscription(cachedSub)
            setSubscriptionReady(true)
            setSubscriptionMissing(false)
            if (initRetryRef.current < 6) {
              initRetryRef.current++
              const delay = Math.min(3000 * initRetryRef.current, 10000)
              console.log(`🔄 Fallback no subscription; keeping cached plan and retrying in ${delay / 1000}s...`)
              setTimeout(() => initializeUser(true), delay)
            }
            return cachedSub
          }
          setSubscriptionMissing(true)
          // Auto-retry
          if (initRetryRef.current < 6) {
            initRetryRef.current++
            const delay = Math.min(3000 * initRetryRef.current, 10000)
            console.log(`🔄 Fallback: no subscription, retrying in ${delay/1000}s...`)
            setTimeout(() => initializeUser(true), delay)
          } else {
            setError(t('backendStarting'))
            scheduleBackgroundInitRetry(15000)
          }
          return normalizedSub
        }
      }
    } catch (err) {
      console.error('Error:', err)
      // Backend may be cold. Keep local subscription cache to avoid plan disappearing.
      resetSubscriptionClientCaches({ preserveLocal: true })
      // Don't set permanent error — it persists across retries. Only set if max retries exhausted.
      setLoading(false)
      const cachedSub = readStoredSubscription()
      if (cachedSub?.has_subscription) {
        setSubscription(cachedSub)
        setSubscriptionReady(true)
        setSubscriptionMissing(false)
      }
      // Only set subscriptionMissing during active payment processing.
      // For normal returns (cold start), let the dashboard show with a warning banner.
      if (isProcessingPayment) {
        setSubscriptionMissing(true)
      }
      // Auto-retry on network errors
      if (initRetryRef.current < 6) {
        initRetryRef.current++
        const delay = Math.min(3000 * initRetryRef.current, 10000)
        console.log(`🔄 Init error, retrying in ${delay/1000}s...`)
        setTimeout(() => initializeUser(true), delay)
      } else {
        // Only show a soft warning after all retries exhausted — NOT a scary auth error
        setError(t('backendStarting'))
        scheduleBackgroundInitRetry(15000)
      }
    } finally {
      initInFlightRef.current = false
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.hash = '#/'
  }

  const [upgradeLoading, setUpgradeLoading] = useState(false)
  const handleUpgrade = async () => {
    if (upgradeLoading) return
    setUpgradeLoading(true)
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

      // GUARD: If user has no active subscription, redirect to Stripe checkout
      if (!subscription?.has_subscription || !subscription?.paid) {
        const checkoutResp = await fetch(`${API_URL}/api/subscription/create-session`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ plan: nextPlan, email: user?.email || '' })
        })
        const checkoutData = await checkoutResp.json().catch(() => ({}))
        if (checkoutData?.success && checkoutData?.url) {
          window.location.href = checkoutData.url
        } else {
          setStatus('upgrade', 'error', t('errorCreatingStripeSession') || 'Error creating checkout session')
        }
        return
      }

      setStatus('upgrade', 'info', t('switching') || 'Switching plan...')

      // Use inline switch-plan (modifies existing Stripe subscription)
      const resp = await fetch(`${API_URL}/api/subscription/switch-plan`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ plan: nextPlan })
      })

      const data = await resp.json().catch(() => ({}))
      if (data?.success && data?.plan) {
        // Do NOT update local state optimistically — wait for backend (Stripe-verified) refresh
        if (data?.scheduled_for_period_end) {
          const effectiveLabel = data?.effective_at
            ? new Date(data.effective_at).toLocaleDateString()
            : ''
          setStatus('upgrade', 'success', `✅ ${tr('planWillUpdateAtRenewal', 'Your plan will be updated to')} ${formatPlan(data.plan)} ${tr('atNextRenewalDate', 'at the next renewal date')}${effectiveLabel ? ` (${effectiveLabel})` : ''}.`)
        } else {
          setStatus('upgrade', 'success', `✅ Plan ${data.plan.toUpperCase()} ${t('activated') || 'activated'}!`)
        }
        resetSubscriptionClientCaches()
        // Immediately re-fetch from backend which now live-syncs with Stripe
        await initializeUser(true)
      } else {
        // Never redirect active subscribers to checkout for plan switch failures.
        // Keep the current plan and show actionable error.
        console.warn('switch-plan failed for upgrade (no checkout fallback):', data)
        setStatus('upgrade', 'error', formatPlanSwitchError(data?.detail))
      }
    } catch (e) {
      console.error('Upgrade error:', e)
      setStatus('upgrade', 'error', t('anErrorOccurred'))
    } finally {
      setUpgradeLoading(false)
    }
  }

  const [changePlanLoading, setChangePlanLoading] = useState(false)
  const [pendingPlanConfirm, setPendingPlanConfirm] = useState(null) // { plan, price } — awaits user confirmation
  const handleChangePlan = async (targetPlan) => {
    try {
      if (!targetPlan || targetPlan === subscription?.plan) return

      // GUARD: If user has no active subscription, redirect to Stripe checkout instead of switch-plan
      if (!subscription?.has_subscription || !subscription?.paid) {
        const session = await getCachedSession()
        if (!session) {
          setStatus('change-plan', 'error', t('sessionExpiredReconnect'))
          return
        }
        setChangePlanLoading(true)
        const checkoutResp = await fetch(`${API_URL}/api/subscription/create-session`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ plan: targetPlan, email: user?.email || '' })
        })
        const checkoutData = await checkoutResp.json().catch(() => ({}))
        if (checkoutData?.success && checkoutData?.url) {
          window.location.href = checkoutData.url
        } else {
          setStatus('change-plan', 'error', t('errorCreatingStripeSession') || 'Error creating checkout session')
        }
        setChangePlanLoading(false)
        return
      }

      const session = await getCachedSession()
      if (!session) {
        setStatus('change-plan', 'error', t('sessionExpiredReconnect'))
        return
      }

      setChangePlanLoading(true)
      setStatus('change-plan', 'info', t('switching') || 'Switching plan...')

      // Use the inline switch-plan endpoint (modifies existing subscription, no new checkout)
      const resp = await fetch(`${API_URL}/api/subscription/switch-plan`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ plan: targetPlan })
      })

      const data = await resp.json().catch(() => ({}))
      if (data?.success && data?.plan) {
        // Do NOT update local state optimistically — wait for backend (Stripe-verified) refresh
        if (data?.scheduled_for_period_end) {
          const effectiveLabel = data?.effective_at
            ? new Date(data.effective_at).toLocaleDateString()
            : ''
          setStatus('change-plan', 'success', `✅ ${tr('planWillUpdateAtRenewal', 'Your plan will be updated to')} ${formatPlan(data.plan)} ${tr('atNextRenewalDate', 'at the next renewal date')}${effectiveLabel ? ` (${effectiveLabel})` : ''}.`)
        } else {
          setStatus('change-plan', 'success', `✅ Plan ${data.plan.toUpperCase()} ${t('activated') || 'activated'}!`)
        }
        // Invalidate caches and immediately re-fetch from backend (Stripe-verified)
        resetSubscriptionClientCaches()
        await initializeUser(true)
      } else if (data?.changed === false) {
        // Already on this plan
        setStatus('change-plan', 'info', data.message || 'Already on this plan')
      } else {
        // Never redirect active subscribers to checkout for plan switch failures.
        console.warn('switch-plan failed (no checkout fallback):', data)
        setStatus('change-plan', 'error', formatPlanSwitchError(data?.detail))
      }
    } catch (e) {
      console.error('Change plan error:', e)
      setStatus('change-plan', 'error', t('anErrorOccurred'))
    } finally {
      setChangePlanLoading(false)
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
      const tempTitle = firstUserMsg ? firstUserMsg.text.slice(0, 40) + (firstUserMsg.text.length > 40 ? '...' : '') : t('newConversation')
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
    if (date.toDateString() === today.toDateString()) return t('today')
    if (date.toDateString() === yesterday.toDateString()) return t('yesterday')
    return date.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'long' })
  }

  const filteredConversations = useMemo(() => (
    chatConversations
      .filter(c => !conversationSearch || c.title.toLowerCase().includes(conversationSearch.toLowerCase()))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
  ), [chatConversations, conversationSearch])

  const groupedConversations = useMemo(() => (
    filteredConversations.reduce((acc, conv) => {
      const label = getConversationDateLabel(conv.updatedAt || conv.createdAt)
      if (!acc[label]) acc[label] = []
      acc[label].push(conv)
      return acc
    }, {})
  ), [filteredConversations, language])

  const activeConversationTitle = useMemo(() => (
    activeConversationId
      ? (chatConversations.find(c => c.id === activeConversationId)?.title || t('conversation'))
      : t('newConversation')
  ), [activeConversationId, chatConversations, t])

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
      // Skip downsample for small files (< 150KB) — send webm directly for speed
      let smallBlob = audioBlob
      if (audioBlob.size > 150 * 1024) {
        smallBlob = await downsampleToWav(audioBlob)
        console.log(`STT: downsample took ${Date.now() - sttStart}ms`)
      } else {
        console.log(`STT: small file (${audioBlob.size} bytes), skipping downsample for speed`)
      }
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
    // Guard: prevent double-send while already loading
    if (chatLoading) return
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
      const chatPayload = { message: userMessage || t('defaultVisionPrompt'), language: language }
      if (currentAttachments.length > 0) {
        chatPayload.images = currentAttachments
          .filter(a => a.preview && a.type?.startsWith('image/'))
          .map(a => a.preview)
      }
      // ── Build rich real-time dashboard context so AI knows everything ──
      const ctxParts = []

      // 1. Active tab context
      const tabNameMap = {
        overview: t('ctxOverview'),
        underperforming: t('ctxUnderperforming'),
        'action-blockers': t('ctxBlockers'),
        'action-rewrite': t('ctxRewrite'),
        'action-price': t('ctxPriceOptimization'),
        'action-images': t('ctxImages'),
        'action-bundles': t('ctxBundles'),
        'action-stock': t('ctxStockAlerts'),
        'action-returns': t('ctxReturns'),
        invoices: t('ctxInvoices'),
        ai: t('ctxFullAnalysis'),
        analysis: t('ctxAnalysisResults'),
        settings: t('ctxSettings')
      }
      ctxParts.push(`[DASHBOARD CONTEXT]`)
      ctxParts.push(`Active tab: ${tabNameMap[activeTab] || activeTab}`)

      // 2. Subscription & shop info
      ctxParts.push(`Plan: ${subscription?.plan || 'none'} | ${t('activeShop')}: ${shopifyUrl || t('notConnected')} | ${t('connected')}: ${shopifyConnected ? t('yes') : t('no')} | Shops: ${shopList.length}/${shopLimit === null ? '∞' : shopLimit}`)

      // 3. Products summary
      if (products && products.length > 0) {
        ctxParts.push(t('ctxProductCount').replace('{count}', products.length))
        const topProducts = products.slice(0, 5).map(p => `${p.title} (${p.variants?.[0]?.price || '?'}$)`).join(', ')
        ctxParts.push(`Examples: ${topProducts}`)
      } else {
        ctxParts.push(t('ctxNoProducts'))
      }

      // 4. Analytics data (if on overview or available)
      if (analyticsData?.totals) {
        const t2 = analyticsData.totals
        const cur = analyticsData.currency || 'EUR'
        ctxParts.push(`${t('ctxRevenue')} (${analyticsRange}): ${t2.revenue || 0} ${cur} | ${t('ctxOrders')}: ${t2.orders || 0} | AOV: ${t2.aov || 0} ${cur}`)
      }

      // 5. Tab-specific live data
      if (activeTab === 'underperforming' && underperformingData?.underperformers?.length > 0) {
        const items = underperformingData.underperformers.slice(0, 5)
        ctxParts.push(`${t('ctxUnderperforming')} (${underperformingData.underperformers.length} total): ${items.map(i => `${i.title} (score:${i.score}, ${i.orders} cmd, CA:${i.revenue})`).join(' | ')}`)
      }
      if (activeTab === 'action-price' && insightsData) {
        const priceItems = insightsData?.price_suggestions || insightsData?.price_analysis?.suggestions || []
        ctxParts.push(`${t('ctxPriceSuggestions')}: ${priceItems.length} ${t('opportunities')}`)
        if (priceItems.length > 0) {
          ctxParts.push(priceItems.slice(0, 3).map(i => `${i.title}: ${i.current_price}→${i.suggested_price}$ (${i.suggestion})`).join(' | '))
        }
      }
      if (activeTab === 'action-bundles') {
        const bundleItems = insightsData?.bundle_suggestions || []
        ctxParts.push(`Bundles: ${bundleItems.length} suggestions | Diagnostics: ${bundlesDiagnostics ? JSON.stringify(bundlesDiagnostics) : t('ctxNotLoaded')}`)
      }
      if (activeTab === 'action-stock' && stockProducts?.length > 0) {
        const lowStock = stockProducts.filter(p => p.inventory <= (p.threshold || 5))
        ctxParts.push(t('ctxStockStatus').replace('{tracked}', stockProducts.length).replace('{alerts}', lowStock.length))
      }
      if (activeTab === 'action-returns' && insightsData?.return_risks?.length > 0) {
        ctxParts.push(t('ctxReturnRisks').replace('{count}', insightsData.return_risks.length))
      }
      if (activeTab === 'action-images' && insightsData?.image_recommendations?.length > 0) {
        ctxParts.push(t('ctxImagesAnalyzed').replace('{count}', insightsData.image_recommendations.length))
      }
      if ((activeTab === 'analysis' || activeTab === 'ai') && analysisResults) {
        ctxParts.push(t('ctxAnalysisResultsSummary').replace('{products}', analysisResults.overview?.total_products || '?').replace('{recommendations}', analysisResults.strategic_recommendations?.total_recommendations || 0))
      }
      if (activeTab === 'action-blockers' && blockersData?.blockers?.length > 0) {
        ctxParts.push(`${t('tabBlockers')}: ${blockersData.blockers.length}`)
      }

      // 6. Error states
      if (analyticsError) ctxParts.push(t('ctxAnalyticsError').replace('{error}', analyticsError))
      if (insightsError) ctxParts.push(t('ctxInsightsError').replace('{error}', insightsError))

      ctxParts.push(`[END CONTEXT — Respond based on the user's current situation. If they ask about their data, use the context above. Respond in ${language === 'fr' ? 'French' : language === 'en' ? 'English' : language}.]`)

      chatPayload.dashboard_context = ctxParts.join('\n')

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
      if (!session) { setStatus('profile', 'error', t('sessionExpiredReconnect')); return }
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
      if (!session) { setStatus('password', 'error', t('sessionExpiredReconnect')); return }
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
      if (!session) { setStatus('2fa', 'error', t('sessionExpiredReconnect')); return }
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
      const nextLanguage = (interfaceLanguageDraft === 'fr' || interfaceLanguageDraft === 'en')
        ? interfaceLanguageDraft
        : language
      // Always save locally first (works immediately)
      localStorage.setItem('language', nextLanguage)
      localStorage.setItem('darkMode', JSON.stringify(darkMode))

      // Try backend save (best-effort — table may not exist yet)
      try {
        const session = await getCachedSession()
        if (!session) throw new Error('No session')
        const response = await fetch(`${API_URL}/api/settings/interface`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            dark_mode: darkMode,
            language: nextLanguage
          })
        })
        const data = await response.json()
        if (!data.success) {
          console.warn('Backend interface save failed (using localStorage):', data.detail)
        }
      } catch (backendErr) {
        console.warn('Backend interface save unavailable (using localStorage):', backendErr.message)
      }

      setLanguage(nextLanguage)

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
        if (!session) throw new Error('No session')
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

  const handleManageBilling = async () => {
    try {
      setSaveLoading(true)
      const session = await getCachedSession()
      if (!session) { setStatus('billing', 'error', t('sessionExpiredReconnect')); return }
      const response = await fetch(`${API_URL}/api/subscription/update-payment-method`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      })
      const data = await response.json()
      if (data.success && data.portal_url) {
        window.location.href = data.portal_url
      } else {
        setStatus('billing', 'error', formatErrorDetail(data.detail, t('errorPayment')))
      }
    } catch (err) {
      setStatus('billing', 'error', formatUserFacingError(err, t('errorPayment')))
    } finally {
      setSaveLoading(false)
    }
  }

  // ── Shopify OAuth flow ──
  const [oauthShopInput, setOauthShopInput] = useState('')
  const [showManualConnect, setShowManualConnect] = useState(false)

  const startShopifyOAuth = async (shopDomain) => {
    let shop = (shopDomain || oauthShopInput || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '')
    if (!shop) {
      setStatus('shopify', 'warning', t('enterShopName'))
      return
    }
    if (!shop.includes('.')) shop = `${shop}.myshopify.com`
    if (!shop.endsWith('.myshopify.com')) {
      setStatus('shopify', 'warning', t('shopUrlFormat'))
      return
    }
    try {
      const session = await getCachedSession()
      if (!session) {
        setStatus('shopify', 'error', t('sessionExpiredReconnect'))
        return
      }
      setStatus('shopify', 'success', 'Redirection vers Shopify...')
      // Navigate directly — backend accepts token as query param for browser redirects
      window.location.href = `${API_URL}/api/shopify/oauth/authorize?shop=${encodeURIComponent(shop)}&token=${encodeURIComponent(session.access_token)}`
    } catch (err) {
      console.error('OAuth start error:', err)
      setStatus('shopify', 'error', formatUserFacingError(err, t('oauthStartError')))
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
    
    // Valider le format de l'URL
    if (!shopifyUrl.endsWith('.myshopify.com')) {
      setStatus('shopify', 'warning', t('invalidUrlFormat'))
      return
    }
    
    try {
      setShopifyConnecting(true)
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
          shopify_shop_url: shopifyUrl,
          shopify_access_token: shopifyToken
        })
      })
      
      if (!testResponse.ok) {
        const errorData = await testResponse.json().catch(() => ({}))
        throw new Error(errorData.detail || t('connectionTestFailed'))
      }
      
      const testData = await testResponse.json().catch(() => ({}))
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
          shopify_shop_url: shopifyUrl,
          shopify_access_token: shopifyToken
        })
      })
      
      if (!saveResponse.ok) {
        const errorData = await saveResponse.json().catch(() => ({}))
        throw new Error(errorData.detail || t('saveFailed'))
      }
      
      const saveData = await saveResponse.json().catch(() => ({}))
      
      if (saveData.success) {
        setStatus('shopify', 'success', `Shopify ${t('connected')}. ${testData.tests?.products_fetch?.product_count || 0} ${t('productsFound')}.`)
        setShopifyConnected(true)
        setShowShopifyToken(false)
        setShopifyToken('')
        // Refresh shop list
        await refreshShopList()
        console.log('Connection saved, loading products...')
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
      setShopifyConnecting(false)
    }
  }

  // ── Multi-shop helpers ──
  const refreshShopList = async () => {
    try {
      const session = await getCachedSession()
      if (!session) return
      const resp = await fetch(`${API_URL}/api/shopify/connection`, {
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }
      })
      if (resp.ok) {
        const data = await resp.json()
        const connections = Array.isArray(data.connections) ? data.connections : []
        setShopList(connections)
        setShopLimit(data.shop_limit)
        const active = data.connection || connections.find((shop) => shop?.is_active) || connections[0] || null
        if (active?.shop_domain) {
          setShopifyUrl(active.shop_domain)
          setShopifyConnected(true)
          localStorage.setItem('shopifyUrlCache', active.shop_domain)
        } else {
          setShopifyUrl('')
          setShopifyConnected(false)
          localStorage.removeItem('shopifyUrlCache')
        }
      }
    } catch (e) {
      console.error('refreshShopList error:', e)
    }
  }

  const switchShop = async (domain) => {
    try {
      setSwitchingShop(true)
      const session = await getCachedSession()
      if (!session) return
      const resp = await fetch(`${API_URL}/api/shopify/switch-shop`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop_domain: domain })
      })
      if (resp.ok) {
        setShopifyUrl(domain)
        localStorage.setItem('shopifyUrlCache', domain)
        setInsightsData(null)
        setProducts(null)
        setShopList(prev => prev.map(s => ({ ...s, is_active: s.shop_domain === domain })))
        setStatus('shopify', 'success', `${t('activeShop')}: ${domain}`)
        await loadProducts()
      } else {
        const err = await resp.json().catch(() => ({}))
        setStatus('shopify', 'error', err.detail || t('shopSwitchError'))
      }
    } catch (e) {
      setStatus('shopify', 'error', formatUserFacingError(e, t('shopSwitchError')))
    } finally {
      setSwitchingShop(false)
    }
  }

  const deleteShop = async (domain) => {
    if (!confirm(t('confirmDeleteShop').replace('{domain}', domain))) return
    try {
      const session = await getCachedSession()
      if (!session) return
      const resp = await fetch(`${API_URL}/api/shopify/shop/${encodeURIComponent(domain)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      })
      if (resp.ok) {
        setStatus('shopify', 'success', `${domain} ${t('shopDeleted')}`)
        await refreshShopList()
        if (shopifyUrl === domain) {
          const remaining = shopList.filter(s => s.shop_domain !== domain)
          if (remaining.length > 0) {
            setShopifyUrl(remaining[0].shop_domain)
          } else {
            setShopifyUrl('')
            setShopifyConnected(false)
          }
        }
      } else {
        const err = await resp.json().catch(() => ({}))
        setStatus('shopify', 'error', err.detail || t('deleteError'))
      }
    } catch (e) {
      setStatus('shopify', 'error', formatUserFacingError(e, 'Erreur suppression'))
    }
  }

  const connectNewShop = async () => {
    if (!newShopUrl || !newShopToken) {
      setStatus('shopify', 'warning', 'URL et token requis')
      return
    }
    let url = newShopUrl.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '')
    if (!url.includes('.')) url = `${url}.myshopify.com`
    if (!url.endsWith('.myshopify.com')) {
      setStatus('shopify', 'warning', t('shopUrlFormatShort'))
      return
    }
    // Check limit client-side
    if (shopLimit !== null && shopList.length >= shopLimit) {
      setStatus('shopify', 'warning', `${t('shopLimitReached')} (${shopList.length}/${shopLimit}). ${t('upgrade')}`)
      return
    }
    try {
      setLoading(true)
      const session = await getCachedSession()
      if (!session) return
      // Test connection first
      const testResp = await fetch(`${API_URL}/api/shopify/test-connection`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopify_shop_url: url, shopify_access_token: newShopToken })
      })
      if (!testResp.ok) {
        const err = await testResp.json().catch(() => ({}))
        throw new Error(err.detail || t('connectionTestFailed'))
      }
      const testData = await testResp.json()
      if (!testData.ready_to_save) throw new Error(t('invalidConnection'))
      // Save
      const saveResp = await fetch(`${API_URL}/api/user/profile/update`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopify_shop_url: url, shopify_access_token: newShopToken })
      })
      if (!saveResp.ok) {
        const err = await saveResp.json().catch(() => ({}))
        throw new Error(err.detail || t('saveError'))
      }
      setStatus('shopify', 'success', `${url} ${t('connectedSuccessfully')}`)
      setNewShopUrl('')
      setNewShopToken('')
      setShowAddShop(false)
      setShopifyUrl(url)
      setShopifyConnected(true)
      await refreshShopList()
      await loadProducts()
    } catch (e) {
      setStatus('shopify', 'error', formatUserFacingError(e, t('newShopConnectionError')))
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
          'Authorization': `Bearer ${session.access_token}`
        }
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }
      
      const data = await response.json()
      console.log('Products loaded:', data.product_count)
      
      if (data.success && data.products) {
        setProducts(data.products)
        if (data.statistics) {
          console.log('Stats:', data.statistics)
        }
        return data.products
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

  const buildAnalyticsCacheKey = (rangeValue) => {
    const uid = user?.id || 'anon'
    const shop = shopifyUrl || 'no-shop'
    return `${uid}::${shop}::${rangeValue}`
  }

  const readAnalyticsCache = (cacheKey) => {
    const memoryHit = analyticsCacheRef.current.get(cacheKey)
    if (memoryHit && (Date.now() - (memoryHit.ts || 0) < ANALYTICS_CACHE_TTL_MS)) {
      return memoryHit
    }
    if (typeof window === 'undefined') return null
    try {
      const raw = localStorage.getItem(`analyticsCache:${cacheKey}`)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      if (!parsed?.data || !parsed?.ts) return null
      if (Date.now() - parsed.ts > ANALYTICS_CACHE_TTL_MS) return null
      analyticsCacheRef.current.set(cacheKey, parsed)
      return parsed
    } catch {
      return null
    }
  }

  const writeAnalyticsCache = (cacheKey, payload) => {
    const entry = { data: payload, ts: Date.now() }
    analyticsCacheRef.current.set(cacheKey, entry)
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(`analyticsCache:${cacheKey}`, JSON.stringify(entry))
      } catch {
      }
    }
  }

  const loadAnalytics = async (rangeOverride, opts = {}) => {
    try {
      const rangeValue = rangeOverride || analyticsRange
      const options = {
        silent: false,
        force: false,
        useCache: true,
        ...opts
      }
      const cacheKey = buildAnalyticsCacheKey(rangeValue)
      const hasVisibleData = !!(analyticsData?.totals)

      if (options.useCache) {
        const cached = readAnalyticsCache(cacheKey)
        if (cached?.data) {
          setAnalyticsData(cached.data)
          if (!options.force && !options.silent) {
            setAnalyticsLoading(false)
          }
          if (!options.force) {
            return cached.data
          }
        }
      }

      if (!options.silent && !hasVisibleData) {
        setAnalyticsLoading(true)
      }
      setAnalyticsError('')

      if (analyticsInFlightRef.current.has(cacheKey)) {
        return
      }
      analyticsInFlightRef.current.add(cacheKey)
      const session = await getCachedSession()

      if (!session) {
        setAnalyticsError(t('sessionExpiredReconnect'))
        analyticsInFlightRef.current.delete(cacheKey)
        return
      }

      const response = await fetch(`${API_URL}/api/shopify/analytics?range=${rangeValue}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }

      const data = await response.json()
      if (data.success) {
        writeAnalyticsCache(cacheKey, data)
        setAnalyticsData((prev) => {
          if (!prev) return data
          try {
            const prevStr = JSON.stringify(prev)
            const nextStr = JSON.stringify(data)
            return prevStr === nextStr ? prev : data
          } catch {
            return data
          }
        })
      } else {
        setAnalyticsError(t('analyticsUnavailable'))
      }
    } catch (err) {
      console.error('Error loading analytics:', err)
      setAnalyticsError(formatUserFacingError(err, t('errorAnalytics')))
    } finally {
      const rangeValue = rangeOverride || analyticsRange
      const cacheKey = buildAnalyticsCacheKey(rangeValue)
      analyticsInFlightRef.current.delete(cacheKey)
      if (!opts?.silent) {
        setAnalyticsLoading(false)
      }
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
        const method = String(options?.method || 'GET').toUpperCase()
        const hasBody = typeof options?.body !== 'undefined' && options?.body !== null
        const headers = new Headers(options?.headers || {})

        if ((method === 'GET' || method === 'HEAD') && !hasBody) {
          headers.delete('Content-Type')
        }

        const response = await fetch(url, {
          ...options,
          method,
          headers,
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
    const baseDelayMs = config.retryDelayMs ?? 3000
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    let lastErr = null
    let wakePinged = false
    let fastFailCount = 0  // Track CORS-blocked (instant) failures for adaptive delay

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const t0 = Date.now()
      try {
        return await fetchBackendHealth({
          retries: 0,
          timeoutMs: config.timeoutMs ?? 45000
        })
      } catch (err) {
        lastErr = err
        const elapsed = Date.now() - t0

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
          // If the request failed very fast (< 3s), it was likely a CORS block from Render's
          // cold-start loading page. Use a longer delay to give the backend time to boot.
          if (elapsed < 3000) {
            fastFailCount++
          }
          const adaptiveDelay = fastFailCount >= 2 ? Math.min(baseDelayMs * 2.5, 8000) : baseDelayMs
          await sleep(adaptiveDelay)
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
      await waitForBackendReady({ retries: 8, retryDelayMs: 4000, timeoutMs: 30000 })

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
      // Render cold-start can take 50–90s; CORS-blocked requests fail instantly,
      // so we need enough retries × delay to cover the full cold-start window.
      await waitForBackendReady({ retries: 14, retryDelayMs: 4000, timeoutMs: 30000 })

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

  const loadReturnRisks = async (rangeOverride, config = {}) => {
    try {
      const rangeValue = rangeOverride || analyticsRange
      if (!config?.silent) setInsightsLoading(true)
      if (!config?.silent) setInsightsError('')

      const session = await getCachedSession()
      if (!session) throw new Error(t('sessionExpiredReconnect'))

      await waitForBackendReady({ retries: 14, retryDelayMs: 4000, timeoutMs: 30000 })
      await warmupBackend(session.access_token)

      const url = `${API_URL}/api/shopify/returns-risk?range=${encodeURIComponent(rangeValue)}`
      const { response, data } = await fetchJsonWithRetry(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      }, {
        retries: 4,
        retryDelayMs: 2000,
        timeoutMs: 90000,
        retryStatuses: [429, 500, 502, 503, 504]
      })

      if (!response?.ok) {
        const detail = data?.detail || data?.error
        throw new Error(detail || `HTTP ${response?.status || 'ERR'}`)
      }
      if (!data?.success) {
        throw new Error(data?.detail || t('analysisUnavailable'))
      }

      if (!config?.silent) {
        setInsightsData(prev => ({
          ...(prev || {}),
          ...data,
          return_risks: Array.isArray(data?.return_risks) ? data.return_risks : []
        }))
      }
      setBackendHealthTs(Date.now())
      return data
    } catch (err) {
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
      await waitForBackendReady({ retries: 14, retryDelayMs: 4000, timeoutMs: 30000 })
      await warmupBackend(session.access_token)
      // Lancer le job async
      const resp = await fetch(`${API_URL}/api/shopify/bundles/async?range=${encodeURIComponent(analyticsRange)}&limit=10&language=${encodeURIComponent(language)}`, {
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
          'Authorization': `Bearer ${accessToken}`
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

  const loadBundlesHistory = async ({ openDropdown = false } = {}) => {
    try {
      setBundlesHistoryLoading(true)
      setInsightsError('')
      if (openDropdown) setBundlesHistoryOpen(true)
      clearStatus('action-bundles')
      const session = await getCachedSession()
      if (!session) throw new Error(t('sessionExpiredReconnect'))
      await waitForBackendReady({ retries: 14, retryDelayMs: 4000, timeoutMs: 30000 })
      await warmupBackend(session.access_token)
      const resp = await fetch(`${API_URL}/api/shopify/bundles/list?language=${encodeURIComponent(language)}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
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

      await waitForBackendReady({ retries: 14, retryDelayMs: 4000, timeoutMs: 30000 })
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
      await waitForBackendReady({ retries: 14, retryDelayMs: 4000, timeoutMs: 30000 })
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
      await waitForBackendReady({ retries: 8, retryDelayMs: 4000, timeoutMs: 30000 })
      const resp = await fetch(`${API_URL}/api/shopify/pixel-status`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
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
      // ── Plan gate check before running any analysis ──
      const actionGateMap = {
        'action-images': 'image_recommendations',
        'action-bundles': 'cross_sell',
        'action-returns': 'cross_sell',
      }
      const requiredFeature = actionGateMap[actionKey]
      if (requiredFeature && !canAccess(requiredFeature)) {
        setStatus(actionKey, 'warning', `${t('featureReservedPlan')} ${planLabel(requiredFeature)} ${t('orHigher')}`)
        return
      }

      setStatus(actionKey, 'info', t('analysisInProgress'))
      if (actionKey === 'action-rewrite') {
        setInsightsData(null)
      }

      if (actionKey === 'action-bundles') {
        await loadBundlesAsync()
        return
      }

      if (actionKey === 'action-returns') {
        const data = await loadReturnRisks(undefined)
        const returnsList = Array.isArray(data?.return_risks) ? data.return_risks : []
        if (returnsList.length === 0) {
          setStatus(actionKey, 'info', t('analysisNoReturnSignal'))
          return
        }
        setStatus(actionKey, 'success', t('analysisComplete'))
        return
      }

      const loadAiPriceInsights = async (userInstructions) => {
        try {
          const session = await getCachedSession()
          if (!session) return []

          // Reduce cold-start failures before calling an authenticated endpoint.
          await waitForBackendReady({ retries: 14, retryDelayMs: 4000, timeoutMs: 30000 })
          await warmupBackend(session.access_token)

          // Preferred: lightweight endpoint (if deployed).
          try {
            const instructionsParam = userInstructions ? `&instructions=${encodeURIComponent(userInstructions)}` : ''
            const productParam = priceProductId ? `&product_id=${encodeURIComponent(priceProductId)}` : ''
            const { response, data: payload } = await fetchJsonWithRetry(`${API_URL}/api/ai/price-opportunities?limit=50${instructionsParam}${productParam}`, {
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
              suggestion: opt?.reason || t('adjustmentRecommended'),
              current_price: Number.isFinite(currentPrice) ? currentPrice : null,
              suggested_price: Number.isFinite(suggestedPrice) ? suggestedPrice : null,
              target_delta_pct: Number.isFinite(targetDeltaPct) ? targetDeltaPct : null,
              reason: opt?.expected_impact || opt?.reason || t('opportunityDetected'),
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
          const session = await getCachedSession()
          if (!session) {
            setStatus(actionKey, 'error', t('sessionExpiredReconnect'))
            return
          }

          await waitForBackendReady({ retries: 14, retryDelayMs: 4000, timeoutMs: 45000 })
          await warmupBackend(session.access_token)

          const rangeValue = analyticsRange
          const productParam = imageProductId ? `&product_id=${encodeURIComponent(imageProductId)}` : ''
          const instructionsParam = imageInstructions ? `&instructions=${encodeURIComponent(imageInstructions)}` : ''
          const { response, data } = await fetchJsonWithRetry(`${API_URL}/api/shopify/image-risks?range=${encodeURIComponent(rangeValue)}&limit=120&ai=1${productParam}${instructionsParam}`, {
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
            setStatus(actionKey, 'error', t('aiImagesNotConfigured'))
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
            'Authorization': `Bearer ${session.access_token}`
          },
          signal: rewriteController.signal
        })
        clearTimeout(rewriteTimeout)
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
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
          const aiPriceItems = await loadAiPriceInsights(priceInstructions)
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
          const aiPriceItems = await loadAiPriceInsights(priceInstructions)
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
          if (actionKey === 'action-returns') {
            setStatus(actionKey, 'info', t('analysisNoReturnSignal'))
          } else {
            setStatus(actionKey, 'warning', t('analysisNoOpportunity'))
          }
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
    // Standard can only apply title rewrites, descriptions need Pro+
    if (action.type === 'description' && !canAccess('content_generation')) {
      setStatus(statusKey, 'warning', t('rewriteReservedPro'))
      return
    }
    if (!['standard', 'pro', 'premium'].includes(plan)) {
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
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }

      setStatus(statusKey, 'success', '✅ ' + t('modificationApplied'))
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
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
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
          'Authorization': `Bearer ${session.access_token}`
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
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }
      const data = await response.json()
      if (data.success) {
        setStatus('invoice', 'success', `${t('invoiceSentTo')} ${row.email}`)
      } else {
        setStatus('invoice', 'error', t('invoiceSendFailed'))
      }
    } catch (err) {
      console.error('Error sending invoice:', err)
      const invoiceErrMsg = String(err?.message || '')
      if (/gmail oauth2 refresh failed|invalid_grant|connexion gmail expirée|refresh token invalide/i.test(invoiceErrMsg)) {
        setStatus('invoice', 'error', t('invoiceEmailAuthExpired'))
      } else {
        setStatus('invoice', 'error', formatUserFacingError(err, t('errorSendingInvoice')))
      }
    } finally {
      setSendingInvoiceFor(null)
    }
  }

  const addInvoiceItem = () => {
    if (!invoiceProductId) {
      setStatus('invoice', 'warning', t('selectProduct'))
      return
    }
    const product = (products || []).find((p) => String(p.id) === String(invoiceProductId))
    if (!product || !product.variants || product.variants.length === 0) {
      setStatus('invoice', 'error', t('invalidProductNoVariant'))
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
      setStatus('invoice', 'warning', t('addAtLeastOneProduct'))
      return
    }
    if (!invoiceCustomerId && !invoiceCustomerEmail) {
      setStatus('invoice', 'warning', t('selectClientOrEmail'))
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
        const errorData = await response.json().catch(() => ({}))
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
    // ⚡ Re-fetch analytics when range changes or tab becomes active
    if (activeTab === 'overview') {
      loadAnalytics(analyticsRange, { silent: !!analyticsData, useCache: true })
    }
    if (activeTab === 'underperforming') {
      loadAnalytics(analyticsRange, { silent: !!analyticsData, useCache: true })
      if (!underperformingData) loadUnderperforming(analyticsRange)
    }
    if (activeTab === 'action-blockers') {
      if (!blockersData) loadBlockers(analyticsRange)
      if (!pixelStatus) loadPixelStatus()
    }
  }, [activeTab, analyticsRange])

  useEffect(() => {
    if (activeTab !== 'overview') return
    let stopped = false

    const poll = async () => {
      if (stopped) return
      await loadAnalytics(analyticsRange, { silent: true, force: true, useCache: true })
    }

    const intervalId = window.setInterval(poll, ANALYTICS_POLL_MS)
    return () => {
      stopped = true
      window.clearInterval(intervalId)
    }
  }, [activeTab, analyticsRange, shopifyUrl, user?.id])

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
          if (shopList.length > 0 || shopifyUrl) {
            return
          }
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
  }, [user, shopList.length, shopifyUrl])

  const analyzeProducts = async () => {
    if (!products || products.length === 0) {
      setStatus('analyze', 'warning', t('loadProductsFirst'))
      return
    }
    
    try {
      setLoading(true)
      console.log('🔍 Lancement de l\'analyse IA...')
      const session = await getCachedSession()
      if (!session) { setStatus('analyze', 'error', t('sessionExpiredReconnect')); setLoading(false); return }
      
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
      if (!session) { setStatus('apply-actions', 'error', t('sessionExpiredReconnect')); setApplyingActions(false); return }
      
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
    // Standard can apply titles only, descriptions/images need Pro+
    if (recommendationType === 'description' && !canAccess('content_generation')) {
      setStatus(`rec-${productId}-${recommendationType}`, 'warning', t('rewriteReservedPro'))
      return
    }
    if (recommendationType === 'images' && !canAccess('image_recommendations')) {
      setStatus(`rec-${productId}-${recommendationType}`, 'warning', t('imageRecsReserved'))
      return
    }
    if (!subscription?.plan) {
      setStatus(`rec-${productId}-${recommendationType}`, 'warning', t('featureReservedProPremium'))
      return
    }

    try {
      setApplyingRecommendationId(`${productId}-${recommendationType}`)
      const session = await getCachedSession()
      if (!session) { setStatus(`rec-${productId}-${recommendationType}`, 'error', t('sessionExpiredReconnect')); setApplyingRecommendationId(null); return }
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

  if (!loadingTimedOut && ((loading && !user) || (!subscriptionReady && !isProcessingPayment && !subscriptionMissing))) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-[#D8D8E2] border-t-[#FF6B35] rounded-full animate-spin"></div>
          <p className="text-[#6A6A85] text-sm">{t('loading')}</p>
        </div>
      </div>
    )
  }

  if (isProcessingPayment) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] flex items-center justify-center">
        <div className="text-center text-[#1A1A2E]">
          <div className="w-12 h-12 border-2 border-[#D8D8E2] border-t-[#FF6B35] rounded-full animate-spin mx-auto mb-6"></div>
          <h2 className="text-2xl font-bold mb-3">{t('paymentProcessing')}</h2>
          <p className="text-[#6A6A85] mb-6">{t('paymentRegistering')}</p>
          <p className="text-xs text-[#8A8AA3]">{t('autoRedirect')}</p>
        </div>
      </div>
    )
  }

  // If no user at all, redirect to landing
  if (!user) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] flex items-center justify-center px-4">
        <div className="text-center text-[#1A1A2E] max-w-md w-full">
          <div className="text-3xl mb-3">🔒</div>
          <div className="text-lg sm:text-xl mb-2 font-semibold">{t('sessionExpired')}</div>
          <div className="text-[#4A4A68] text-sm mb-4">{t('pleaseReconnect')}</div>
          <button onClick={() => { window.location.hash = '#/' }} className="bg-[#FF6B35] hover:bg-[#E85A28] px-5 py-2.5 rounded-lg text-white text-sm font-medium transition-colors">{t('backToHome')}</button>
        </div>
      </div>
    )
  }

  // Show blocking sync screen ONLY during active payment processing (just paid).
  // For normal dashboard loads (returning user, cold start), fall through to show the dashboard
  // with a soft inline banner — never block access.
  if (isProcessingPayment && (!subscription || !subscription.has_subscription) && subscriptionMissing && initRetryRef.current < 6 && initRetryRef.current > 0) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] flex items-center justify-center px-4">
        <div className="text-center text-[#1A1A2E] max-w-md w-full">
          <div className="w-10 h-10 border-2 border-[#D8D8E2] border-t-[#FF6B35] rounded-full animate-spin mx-auto mb-4"></div>
          <div className="text-lg sm:text-xl mb-2">{t('subscriptionSync')}</div>
          <div className="text-[#4A4A68] text-sm mb-2">{t('paymentDelay')}</div>
          <div className="text-[#8A8AA3] text-xs mb-4">
            {t('retry')} {initRetryRef.current}/6...
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 justify-center mt-4">
            <button onClick={() => { initRetryRef.current = 0; initializeUser(true) }} className="bg-[#FF6B35] hover:bg-[#E85A28] px-5 py-2.5 rounded-lg text-white text-sm font-medium transition-colors">{t('retry')}</button>
            <button onClick={() => { window.location.hash = '#stripe-pricing' }} className="bg-[#EFF1F5] hover:bg-[#E8E8EE] px-4 py-2.5 rounded-lg text-[#1A1A2E] text-sm">{t('viewPlans')}</button>
            <button onClick={() => { window.location.hash = '#/' }} className="bg-white hover:bg-[#EFF1F5] px-4 py-2.5 rounded-lg text-[#6A6A85] text-sm border border-[#E8E8EE]">{t('backToHome')}</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      {/* Mobile header with hamburger */}
      <div className="md:hidden flex items-center justify-between bg-white border-b border-[#E8E8EE] px-4 py-3 sticky top-0 z-40">
        <button onClick={() => setMobileSidebarOpen(true)} className="text-[#1A1A2E] p-1">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <span className="text-[#1A1A2E] font-semibold text-sm">ShopBrain AI</span>
        <div className="w-6" />{/* spacer */}
      </div>

      {/* Mobile sidebar overlay */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 bg-black/30 z-50 md:hidden" onClick={() => setMobileSidebarOpen(false)} />
      )}

      <div className="flex h-screen overflow-hidden">
        <aside className={`${
          mobileSidebarOpen ? 'fixed inset-y-0 left-0 z-50' : 'hidden'
        } md:sticky md:top-0 md:flex md:h-screen w-64 bg-white border-r border-[#E8E8EE] p-4 flex flex-col gap-4 overflow-y-auto shrink-0`}>
          {/* Mobile close button */}
          <button onClick={() => setMobileSidebarOpen(false)} className="md:hidden self-end text-[#6A6A85] hover:text-[#1A1A2E] mb-2">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <div className="flex items-center gap-3 relative">
            <button
              onClick={() => setShowProfileMenu((v) => !v)}
              className="flex items-center gap-3 hover:bg-white/10 px-3 py-2 rounded-lg transition w-full"
            >
              <div className="w-10 h-10 rounded-full bg-[#EFF1F5] flex items-center justify-center font-bold text-lg shadow-lg overflow-hidden">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <span>{profile?.first_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'}</span>
                )}
              </div>
              <div className="text-left">
                <div className="font-semibold text-sm text-[#1A1A2E]">{profile?.full_name || user?.email}</div>
                <div className="text-xs text-[#6A6A85]">@{profile?.username || 'user'}</div>
              </div>
            </button>

            {showProfileMenu && (
              <div className="absolute top-full left-0 mt-2 w-60 bg-white border border-[#E8E8EE] rounded-lg shadow-2xl z-50">
                <div className="p-4 border-b border-[#E8E8EE] relative">
                  <button
                    onClick={() => setShowProfileMenu(false)}
                    className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full hover:bg-[#EFF1F5] text-[#6A6A85] hover:text-[#1A1A2E] transition"
                    aria-label={t('close')}
                  >✕</button>
                  <div className="font-semibold text-[#1A1A2E]">{profile?.full_name || user?.email}</div>
                  <div className="text-sm text-[#6A6A85]">{user?.email}</div>
                  <div className="mt-2 px-2 py-1 bg-[#FF6B35]/20 text-[#FF6B35] text-xs rounded inline-block">
                    {formatPlan(subscription?.plan)}
                  </div>
                </div>
                <div className="p-2">
                  <button
                    onClick={() => { setShowProfileMenu(false); setShowSettingsModal(true); setSettingsTab('profile') }}
                    className="w-full text-left px-3 py-2 rounded hover:bg-[#EFF1F5] flex items-center gap-2 text-sm text-[#1A1A2E]"
                  >
                    {t('accountSettings')}
                  </button>
                  <button
                    onClick={() => { setShowProfileMenu(false); clearStatus('change-plan'); setPendingPlanConfirm(null); setShowPlanMenu(true) }}
                    className="w-full text-left px-3 py-2 rounded hover:bg-[#EFF1F5] flex items-center gap-2 text-sm text-[#1A1A2E]"
                  >
                    {t('subscriptionAndBilling')}
                  </button>
                  <div className="border-t border-[#E8E8EE] my-2"></div>
                  <button
                    onClick={() => { setShowProfileMenu(false); handleLogout() }}
                    className="w-full text-left px-3 py-2 rounded hover:bg-[#EFF1F5] text-sm text-[#4A4A68] hover:text-[#1A1A2E]"
                  >
                    {t('logout')}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="bg-[#F7F8FA] rounded-lg p-3">
            <div className="text-xs text-[#6A6A85] mb-1">{t('currentPlan')}</div>
            <div className="font-bold text-[#FF6B35] text-lg">{formatPlan(subscription?.plan)}</div>
          </div>

          {/* ── Shop Switcher ── */}
          {shopList.length > 0 && (
            <div className="bg-[#F7F8FA] rounded-lg p-3">
              <div className="text-xs text-[#6A6A85] mb-1.5">🏪 {t('activeShop')}</div>
              {shopList.length === 1 ? (
                <div className="text-sm font-semibold text-[#1A1A2E] truncate">{shopifyUrl}</div>
              ) : (
                <select
                  value={shopifyUrl}
                  onChange={(e) => switchShop(e.target.value)}
                  disabled={switchingShop}
                  className="w-full bg-white border border-[#D8D8E2] rounded-lg px-2 py-1.5 text-sm font-semibold text-[#1A1A2E] disabled:opacity-50"
                >
                  {shopList.map(s => (
                    <option key={s.shop_domain} value={s.shop_domain}>
                      {s.shop_domain} {s.is_active ? '✅' : ''}
                    </option>
                  ))}
                </select>
              )}
              <div className="text-[10px] text-[#8A8AA3] mt-1">
                {shopList.length} / {shopLimit === null ? '∞' : shopLimit} {t('shopCount')}
              </div>
            </div>
          )}

          <nav className="flex flex-col gap-1">
            {[
              { key: 'overview', label: t('tabOverview'), gate: null },
              { key: 'underperforming', label: t('tabUnderperforming'), gate: 'product_analysis' },
              { key: 'action-blockers', label: t('tabBlockers'), gate: 'product_analysis' },
              { key: 'action-rewrite', label: t('tabRewrite'), gate: null },
              { key: 'action-price', label: t('tabPriceOpt'), gate: 'price_suggestions' },
              { key: 'action-images', label: t('tabImages'), gate: 'image_recommendations' },
              { key: 'action-bundles', label: t('tabBundles'), gate: 'cross_sell' },
              { key: 'action-stock', label: t('tabStock'), gate: null },
              { key: 'action-returns', label: t('tabReturns'), gate: 'cross_sell' },
              { key: 'invoices', label: t('tabInvoices'), gate: 'invoicing' },
              { key: 'ai', label: t('aiAnalysis'), gate: null },
              { key: 'analysis', label: t('tabResults'), gate: null }
            ].map((item) => {
              const locked = item.gate && !canAccess(item.gate)
              return (
                <button
                  key={item.key}
                  onClick={() => {
                    if (locked) {
                      setStatus('upgrade', 'warning', `${item.label} — ${t('featureReservedPlan')} ${planLabel(item.gate)} ${t('orHigher')}.`)
                      return
                    }
                    setActiveTab(item.key); setMobileSidebarOpen(false)
                  }}
                  className={`text-left px-3 py-2 rounded-lg text-sm font-semibold transition flex items-center justify-between ${
                    locked
                      ? 'text-[#B0B0C8] cursor-not-allowed'
                      : activeTab === item.key
                        ? 'bg-[#FF6B35]/10 text-[#FF6B35] border-l-2 border-[#FF6B35]'
                        : 'text-[#6A6A85] hover:text-[#1A1A2E] hover:bg-[#EFF1F5]'
                  }`}
                >
                  {item.label}
                  {locked && <span className="text-[10px] bg-[#EFF1F5] text-[#8A8AA3] px-1.5 py-0.5 rounded">🔒 {planLabel(item.gate)}</span>}
                </button>
              )
            })}
          </nav>
        </aside>

        <main className="flex-1 overflow-y-auto">
          <div className="min-h-full">

      {/* Plan Change Menu — with confirmation step */}
      {showPlanMenu && (
        <div className="fixed inset-0 bg-black/25 z-40 flex items-center justify-center" onClick={() => { if (!changePlanLoading) { setShowPlanMenu(false); setPendingPlanConfirm(null); clearStatus('change-plan') } }}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 border border-[#E8E8EE]" onClick={(e) => e.stopPropagation()}>
            {pendingPlanConfirm ? (
              /* ── Confirmation step ── */
              <>
                <h3 className="text-xl font-bold text-[#1A1A2E] mb-2">{tr('confirmPlanChange', 'Confirm Plan Change')}</h3>
                <div className="bg-[#FFF7ED] border border-[#FF6B35]/30 rounded-lg p-4 mb-4">
                  <p className="text-sm text-[#1A1A2E] mb-1">
                    {tr('youAreAboutToSwitch', 'You Are About to Switch To:')}
                  </p>
                  <p className="text-lg font-bold text-[#FF6B35]">
                    {pendingPlanConfirm.plan.toUpperCase()} — ${pendingPlanConfirm.price}/{tr('month', 'month')}
                  </p>
                  <p className="text-xs text-[#6A6A85] mt-2">
                    {subscription?.current_period_end
                      ? `${tr('planChangeEffectiveOn', 'The change will take effect on your next renewal date')}: ${new Date(subscription.current_period_end).toLocaleDateString()}.`
                      : tr('planChangeEffectiveAtNextRenewal', 'The change will take effect at your next renewal date.')}
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => { setPendingPlanConfirm(null); clearStatus('change-plan') }}
                    disabled={changePlanLoading}
                    className="flex-1 px-4 py-3 rounded-lg border border-[#E8E8EE] text-[#6A6A85] hover:bg-[#EFF1F5] disabled:opacity-50"
                  >
                    {tr('cancel', 'Cancel')}
                  </button>
                  <button
                    onClick={async () => {
                      await handleChangePlan(pendingPlanConfirm.plan)
                      // Only dismiss confirmation if switch succeeded
                      if (!changePlanLoading) {
                        const statusObj = statusByKey['change-plan']
                        if (statusObj?.type === 'success' || statusObj?.type === 'info') {
                          setPendingPlanConfirm(null)
                        }
                      }
                    }}
                    disabled={changePlanLoading}
                    className="flex-1 px-4 py-3 rounded-lg bg-[#FF6B35] hover:bg-[#E85A28] text-white font-semibold disabled:opacity-50"
                  >
                    {changePlanLoading ? tr('switching', 'Switching...') : tr('confirmSwitch', 'Confirm & Switch')}
                  </button>
                </div>
                {renderStatus('change-plan')}
              </>
            ) : (
              /* ── Plan selection step ── */
              <>
                <h3 className="text-xl font-bold text-[#1A1A2E] mb-4">{tr('changeYourPlan', 'Change Your Plan')}</h3>
                <div className="space-y-2">
                  {[{plan:'standard',price:'99',desc:'50 produits/mo'},{plan:'pro',price:'199',desc:'500 produits/mo + reports'},{plan:'premium',price:'299',desc:'Unlimited + auto actions'}].filter(p => p.plan !== subscription?.plan).map(opt => (
                    <button
                      key={opt.plan}
                      onClick={() => { clearStatus('change-plan'); setPendingPlanConfirm({ plan: opt.plan, price: opt.price }) }}
                      disabled={changePlanLoading}
                      className="w-full text-left px-4 py-3 rounded-lg bg-[#EFF1F5] hover:bg-[#E8E8EE] text-[#1A1A2E] disabled:opacity-50"
                    >
                      <div className="font-semibold">{opt.plan.toUpperCase()} - ${opt.price}/{tr('month', 'month')}</div>
                      <div className="text-sm text-[#6A6A85]">{opt.desc}</div>
                    </button>
                  ))}
                  <div className="border-t border-[#D8D8E2] pt-2 mt-2">
                    <button
                      onClick={() => { clearStatus('change-plan'); setShowPlanMenu(false); window.location.hash = '#stripe-pricing' }}
                      disabled={changePlanLoading}
                      className="w-full text-center px-4 py-2 rounded-lg text-[#0D9488] hover:bg-[#EFF1F5]"
                    >
                      {tr('viewAllPlans', 'View All Plans')}
                    </button>
                  </div>
                </div>
                {renderStatus('change-plan')}
              </>
            )}
          </div>
        </div>
      )}

        {/* Post-payment success banner */}
        {typeof window !== 'undefined' && (window.location.hash.includes('success=true') || new URLSearchParams(window.location.search).has('session_id')) && (
          <div className="max-w-7xl mx-auto px-6 mb-4">
            <div className="bg-teal-50 border border-[#2DD4BF]/40 text-[#0D9488] p-4 rounded-lg flex items-center justify-between">
              <div>
                <p className="font-bold">{t('paymentConfirmed')}</p>
                <p className="text-sm opacity-90">{t('planApplied')}</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => { window.location.hash = '#/' }}
                  className="bg-[#0D9488] hover:bg-[#0F766E] text-white font-semibold px-4 py-2 rounded-lg"
                >{t('backToHome')}
                </button>
                <button
                  onClick={() => { window.location.hash = '#dashboard' }}
                  className="bg-[#FF6B35] hover:bg-[#E85A28] text-white font-semibold px-4 py-2 rounded-lg"
                >{t('goToDashboard')}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="max-w-7xl mx-auto p-3 md:p-6">

        {/* Soft inline banner when subscription is still loading (backend cold start) */}
        {!subscriptionReady && !error && (
          <div className="bg-white border border-[#E8E8EE] text-[#4A4A68] p-4 rounded-lg mb-6 flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-[#D8D8E2] border-t-[#FF6B35] rounded-full animate-spin shrink-0"></div>
            <span className="text-sm">{t('backendStarting')}</span>
          </div>
        )}

        {error && (
          <div className="bg-white border border-[#E85A28] text-[#FF8B60] p-4 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 space-y-6">
            <div className="bg-white border border-[#E8E8EE] rounded-2xl shadow-sm overflow-hidden">
              {/* ── Header: Title + Range Selector ── */}
              <div className="px-4 md:px-6 pt-4 md:pt-5 pb-0 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#FF6B35] animate-pulse" />
                    <p className="text-xs uppercase tracking-[0.25em] text-[#FF6B35] font-semibold">{t('realTimeSales')}</p>
                  </div>
                  <p className="text-sm text-[#8A8AA3] mt-1">Source Shopify · {getRangeLabel(analyticsData?.range || analyticsRange)}</p>
                </div>
                <div className="flex items-center gap-1 bg-[#F7F8FA] border border-[#E8E8EE] rounded-lg px-1 py-0.5">
                  {['7d', '30d', '90d', '365d'].map((range) => (
                    <button
                      key={range}
                      onClick={() => setAnalyticsRange(range)}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${analyticsRange === range ? 'bg-[#FF6B35] text-white shadow-sm' : 'text-[#6A6A85] hover:text-[#1A1A2E] hover:bg-white'}`}
                    >
                      {range}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Metrics: Total Sales Breakdown (matches Shopify Analytics) ── */}
              <div className="px-4 md:px-6 pt-4 pb-2">
                <div className="flex flex-col gap-3">
                  {/* Hero: Total Sales */}
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.2em] text-[#8A8AA3] mb-1">{t('totalSalesOverTime')}</p>
                    <p className="text-3xl md:text-4xl font-extrabold text-[#1A1A2E] leading-none">
                      {analyticsLoading ? <span className="inline-block w-40 h-9 bg-[#F0F0F5] rounded-lg animate-pulse" /> : formatCurrency(analyticsData?.totals?.total_sales ?? analyticsData?.totals?.revenue, analyticsData?.currency || 'CAD')}
                    </p>
                  </div>
                  {/* Breakdown row — Shopify-style */}
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-[#F0F0F5] pt-3">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#1A1A2E]" />
                      <p className="text-[10px] uppercase tracking-[0.12em] text-[#8A8AA3]">{t('grossSales')}</p>
                      <p className="text-xs font-semibold text-[#1A1A2E] ml-1">
                        {analyticsLoading ? '...' : formatCurrency(analyticsData?.totals?.gross_revenue, analyticsData?.currency || 'CAD')}
                      </p>
                    </div>
                    {(analyticsData?.totals?.discounts > 0) && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#FF6B35]" />
                        <p className="text-[10px] uppercase tracking-[0.12em] text-[#8A8AA3]">{t('discounts')}</p>
                        <p className="text-xs font-semibold text-[#FF6B35] ml-1">
                          −{formatCurrency(analyticsData?.totals?.discounts, analyticsData?.currency || 'CAD')}
                        </p>
                      </div>
                    )}
                    {(analyticsData?.totals?.returns > 0) && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#E85A28]" />
                        <p className="text-[10px] uppercase tracking-[0.12em] text-[#8A8AA3]">{t('returns')}</p>
                        <p className="text-xs font-semibold text-[#E85A28] ml-1">
                          −{formatCurrency(analyticsData?.totals?.returns, analyticsData?.currency || 'CAD')}
                        </p>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#6A6A85]" />
                      <p className="text-[10px] uppercase tracking-[0.12em] text-[#8A8AA3]">{t('orders')}</p>
                      <p className="text-xs font-semibold text-[#1A1A2E] ml-1">
                        {analyticsLoading ? '...' : (analyticsData?.totals?.orders || 0)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#6A6A85]" />
                      <p className="text-[10px] uppercase tracking-[0.12em] text-[#8A8AA3]">{t('averageCart')}</p>
                      <p className="text-xs font-semibold text-[#1A1A2E] ml-1">
                        {analyticsLoading ? '...' : formatCurrency(analyticsData?.totals?.aov, analyticsData?.currency || 'CAD')}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Chart: Total Sales Over Time ── */}
              <div className="px-2 md:px-4 pb-5 pt-1">
                {analyticsError && <p className="text-xs text-[#FF6B35] px-2 mb-1">{analyticsError}</p>}
                <div className="relative">
                  {analyticsLoading ? (
                    <div className="flex items-center justify-center py-20">
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-6 h-6 border-2 border-[#E8E8EE] border-t-[#FF6B35] rounded-full animate-spin" />
                        <p className="text-xs text-[#8A8AA3]">{t('chartLoading')}</p>
                      </div>
                    </div>
                  ) : analyticsData?.series?.length ? (() => {
                    const chartWidth = 620
                    const chartHeight = 220
                    const pad = { top: 20, bottom: 34, left: 58, right: 14 }
                    const { linePath, areaPath, points, yLabels, xLabels } = buildAreaChartPath(
                      analyticsData.series, chartWidth, chartHeight, 'total_sales', pad
                    )
                    const currency = analyticsData?.currency || 'CAD'
                    // Format Y value for display
                    const fmtY = (v) => {
                      if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`
                      if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`
                      return `$${v.toFixed(0)}`
                    }
                    // Find peak for tooltip
                    const peakIdx = points.reduce((best, pt, i) => pt.val > points[best].val ? i : best, 0)
                    return (
                      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full" style={{ height: 'auto', minHeight: '200px', maxHeight: '280px' }} preserveAspectRatio="xMidYMid meet">
                        <defs>
                          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#FF6B35" stopOpacity="0.18" />
                            <stop offset="70%" stopColor="#FF6B35" stopOpacity="0.04" />
                            <stop offset="100%" stopColor="#FF6B35" stopOpacity="0" />
                          </linearGradient>
                          <linearGradient id="lineStroke" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#FF6B35" />
                            <stop offset="100%" stopColor="#FF8B60" />
                          </linearGradient>
                          <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
                            <feGaussianBlur stdDeviation="1.5" result="blur" />
                            <feMerge>
                              <feMergeNode in="blur" />
                              <feMergeNode in="SourceGraphic" />
                            </feMerge>
                          </filter>
                        </defs>

                        {/* Horizontal grid lines */}
                        {yLabels.map((yl, i) => (
                          <line key={`g-${i}`} x1={pad.left} y1={yl.y} x2={chartWidth - pad.right} y2={yl.y}
                            stroke={i === yLabels.length - 1 ? '#D8D8E2' : '#F0F0F5'} strokeWidth={i === yLabels.length - 1 ? '0.8' : '0.5'} />
                        ))}

                        {/* Y-axis labels */}
                        {yLabels.map((yl, i) => (
                          <text key={`yl-${i}`} x={pad.left - 8} y={yl.y + 3.5}
                            textAnchor="end" fill="#A0A0B8" fontSize="7.5" fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" fontWeight="500">
                            {fmtY(yl.val)}
                          </text>
                        ))}

                        {/* X-axis labels */}
                        {xLabels.map((xl, i) => (
                          <text key={`xl-${i}`} x={xl.x} y={chartHeight - 8}
                            textAnchor="middle" fill="#A0A0B8" fontSize="7.5" fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" fontWeight="500">
                            {xl.label}
                          </text>
                        ))}

                        {/* Area fill */}
                        <path d={areaPath} fill="url(#areaFill)" />

                        {/* Main line */}
                        <path d={linePath} fill="none" stroke="url(#lineStroke)" strokeWidth="2"
                          strokeLinecap="round" strokeLinejoin="round" filter="url(#softGlow)" />

                        {/* Data dots — only on days with sales */}
                        {points.map((pt, i) => {
                          if (pt.val === 0) return null
                          const isPeak = i === peakIdx
                          return (
                            <g key={`d-${i}`}>
                              {isPeak && <circle cx={pt.x} cy={pt.y} r="7" fill="#FF6B35" opacity="0.12" />}
                              <circle cx={pt.x} cy={pt.y} r={isPeak ? 3.5 : 2.5}
                                fill="white" stroke="#FF6B35" strokeWidth={isPeak ? 2 : 1.5} />
                              {/* Tooltip on peak */}
                              {isPeak && (
                                <g>
                                  <rect x={Math.min(pt.x - 32, chartWidth - pad.right - 66)} y={pt.y - 26} width="64" height="19" rx="5"
                                    fill="#1A1A2E" opacity="0.93" />
                                  <text x={Math.min(pt.x, chartWidth - pad.right - 34)} y={pt.y - 13.5} textAnchor="middle"
                                    fill="white" fontSize="8.5" fontWeight="600" fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">
                                    {fmtY(pt.val)} {currency}
                                  </text>
                                </g>
                              )}
                            </g>
                          )
                        })}
                      </svg>
                    )
                  })() : shopifyUrl ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="w-12 h-12 rounded-full bg-[#F7F8FA] flex items-center justify-center mb-3">
                        <svg className="w-6 h-6 text-[#D8D8E2]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>
                      </div>
                      <p className="text-sm text-[#8A8AA3]">{t('noSalesInPeriod')}</p>
                      <p className="text-xs text-[#B0B0C4] mt-1">{t('tryWiderRange')}</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="w-12 h-12 rounded-full bg-[#FFF5F0] flex items-center justify-center mb-3">
                        <span className="text-xl">🏪</span>
                      </div>
                      <p className="text-sm font-medium text-[#4A4A68]">{t('connectYourShopify')}</p>
                      <p className="text-xs text-[#8A8AA3] mt-1">{t('toShowRealTimeSales')}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-lg p-5 border border-[#E8E8EE]">
              <h3 className="text-[#6A6A85] text-sm uppercase mb-2">{t('activePlan')}</h3>
              <div className="flex items-center justify-between">
                <p className="text-[#1A1A2E] text-2xl font-bold">{formatPlan(subscription?.plan)}</p>
                {subscription?.plan !== 'premium' && (
                  <button
                    onClick={handleUpgrade}
                    className="ml-4 bg-[#FF6B35] hover:bg-[#E85A28] text-white text-sm font-bold px-3 py-1 rounded-lg"
                  >
                    Upgrade
                  </button>
                )}
              </div>
              <p className="text-[#6A6A85] text-sm mt-2">Depuis: {formatDate(subscription?.started_at)}</p>
              {subscription?.plan === 'standard' && (
                <p className="text-[#6A6A85] text-xs mt-1">{t('limitedFeatures')}</p>
              )}
              {subscription?.plan === 'pro' && (
                <p className="text-[#6A6A85] text-xs mt-1">{t('goodChoiceUpgrade')}</p>
              )}
              {renderStatus('upgrade')}
            </div>
            
            <div className="bg-white rounded-lg p-5 border border-[#E8E8EE]">
              <h3 className="text-[#6A6A85] text-sm uppercase mb-2">{t('products')}</h3>
              <p className="text-[#1A1A2E] text-2xl font-bold">{subscription?.capabilities?.product_limit === null ? '∞' : subscription?.capabilities?.product_limit || 50}</p>
              <p className="text-[#6A6A85] text-sm mt-2">{t('monthlyLimit')}</p>
            </div>
            
            <div className="bg-white rounded-lg p-5 border border-[#E8E8EE]">
              <h3 className="text-[#6A6A85] text-sm uppercase mb-2">{t('features')}</h3>
              <ul className="text-sm space-y-1">
                {getPlanFeatures(subscription?.plan).map((feature, i) => (
                  <li key={i} className="text-[#4A4A68]">• {feature}</li>
                ))}
              </ul>
            </div>
            </div>

            <div className="hidden md:grid grid-cols-1 md:grid-cols-4 gap-4">
              {[
                {
                  label: t('totalSales'),
                  value: analyticsLoading ? '...' : formatCurrency(analyticsData?.totals?.total_sales ?? analyticsData?.totals?.revenue, analyticsData?.currency || 'CAD'),
                  hint: analyticsRange
                },
                {
                  label: t('orders'),
                  value: analyticsLoading ? '...' : formatCompactNumber(analyticsData?.totals?.orders || 0),
                  hint: 'volume'
                },
                {
                  label: t('aov'),
                  value: analyticsLoading ? '...' : formatCurrency(analyticsData?.totals?.aov, analyticsData?.currency || 'CAD'),
                  hint: t('averageCartHint')
                },
                {
                  label: t('activeProducts'),
                  value: `${products?.length || 0}`,
                  hint: 'catalogue'
                }
              ].map((item) => (
                <div key={item.label} className="bg-white rounded-xl p-4 border border-[#E8E8EE]">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#6A6A85]">{item.label}</p>
                  <p className="text-2xl font-bold text-[#1A1A2E] mt-2">{item.value}</p>
                  <p className="text-xs text-[#8A8AA3] mt-1">{item.hint}</p>
                </div>
              ))}
            </div>

            <div className="hidden md:grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-lg p-5 border border-[#E8E8EE]">
                <h4 className="text-[#6A6A85] text-xs uppercase tracking-[0.2em] mb-3">Ops Center</h4>
                <p className="text-[#1A1A2E] text-lg font-semibold mb-2">{t('unifiedShopifyFlow')}</p>
                <p className="text-[#6A6A85] text-sm">{t('opsDesc')}</p>
              </div>
              <div className="bg-white rounded-lg p-5 border border-[#E8E8EE]">
                <h4 className="text-[#6A6A85] text-xs uppercase tracking-[0.2em] mb-3">Insights</h4>
                <p className="text-[#1A1A2E] text-lg font-semibold mb-2">{t('dailyAIPriorities')}</p>
                <p className="text-[#6A6A85] text-sm">{t('optimizationsRanked')}</p>
              </div>
              <div className="bg-white rounded-lg p-5 border border-[#E8E8EE]">
                <h4 className="text-[#6A6A85] text-xs uppercase tracking-[0.2em] mb-3">Automation</h4>
                <p className="text-[#1A1A2E] text-lg font-semibold mb-2">{t('premiumScenarios')}</p>
                <p className="text-[#6A6A85] text-sm">{t('automationDesc')}</p>
              </div>
            </div>

            <div className="hidden md:grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-lg p-5 border border-[#E8E8EE]">
                <h4 className="text-[#6A6A85] text-xs uppercase tracking-[0.2em] mb-4">{t('recentActivity')}</h4>
                <ul className="space-y-3 text-sm text-[#4A4A68]">
                  <li className="flex items-center justify-between">
                    <span>{t('tabPriceOpt')}</span>
                    <span className="text-[#8A8AA3]">Aujourd’hui</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>{t('aiDescriptions')}</span>
                    <span className="text-[#8A8AA3]">{t('yesterday')}</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>{t('fullCatalogAnalysis')}</span>
                    <span className="text-[#8A8AA3]">{t('twoDaysAgo')}</span>
                  </li>
                </ul>
              </div>
              <div className="bg-white rounded-lg p-5 border border-[#E8E8EE]">
                <h4 className="text-[#6A6A85] text-xs uppercase tracking-[0.2em] mb-4">{t('executionQueue')}</h4>
                <div className="space-y-3">
                  {[
                    { label: t('titleOptimization'), status: t('inProgress') },
                    { label: t('priceAudit'), status: t('scheduled') },
                    { label: t('weeklyReport'), status: t('scheduled') }
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between text-sm text-[#4A4A68]">
                      <span>{row.label}</span>
                      <span className="text-[#8A8AA3]">{row.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="hidden md:grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-lg p-5 border border-[#E8E8EE]">
                <h4 className="text-[#6A6A85] text-xs uppercase tracking-[0.2em] mb-4">{t('criticalAlerts')}</h4>
                <ul className="space-y-3 text-sm text-[#4A4A68]">
                  <li className="flex items-center justify-between">
                    <span>{t('zeroPriceProducts')}</span>
                    <span className="text-red-500">2</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>{t('outOfStock')}</span>
                    <span className="text-[#FF6B35]">4</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>{t('weakSEO')}</span>
                    <span className="text-[#FF6B35]">11</span>
                  </li>
                </ul>
              </div>
            </div>
            </div>

            <div className="space-y-6">
              <div className="bg-white rounded-2xl p-6 border border-[#E8E8EE]">
                <h4 className="text-[#6A6A85] text-xs uppercase tracking-[0.2em] mb-3">Executive Summary</h4>
                <p className="text-[#1A1A2E] text-xl font-semibold mb-2">{t('accountGlobalState')}</p>
                <p className="text-[#4A4A68] text-sm">{t('execSummaryDesc')}</p>
                <div className="mt-4 space-y-2 text-sm text-[#4A4A68]">
                  <div className="flex items-center justify-between">
                    <span>{t('plan')}</span>
                    <span className="text-[#6A6A85]">{formatPlan(subscription?.plan)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>{t('store')}</span>
                    <span className="text-[#6A6A85]">{shopifyUrl || t('notConnected')}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>{t('lastSync')}</span>
                    <span className="text-[#6A6A85]">Aujourd’hui</span>
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
            <div className="bg-white rounded-2xl p-4 md:p-6 border border-[#E8E8EE]">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[#FF6B35]">{t('billing')}</p>
                  <h2 className="text-[#1A1A2E] text-xl md:text-2xl font-bold mt-2">{t('customerOrders')}</h2>
                  <p className="text-sm text-[#6A6A85] mt-1">Liste des achats de vos clients. Envoyez une facture par email en un clic.</p>
                </div>
                <button
                  onClick={loadOrdersList}
                  className="px-4 py-2 rounded-lg bg-[#EFF1F5] text-[#1A1A2E] hover:bg-[#E8E8EE] text-sm"
                >
                  {ordersListLoading ? t('loadingDots') : t('refresh')}
                </button>
              </div>
              {renderStatus('invoice')}
            </div>

            {/* Orders List */}
            <div className="bg-white rounded-2xl p-4 md:p-6 border border-[#E8E8EE]">
              <h3 className="text-[#1A1A2E] text-lg font-semibold mb-4">
                {ordersList.length > 0 ? t('purchaseCount').replace('{count}', ordersList.length) : t('customerPurchases')}
              </h3>

              {ordersListLoading ? (
                <div className="text-center py-8 text-[#8A8AA3] text-sm">{t('loadingShopifyOrders')}</div>
              ) : ordersList.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-[#8A8AA3] text-sm">{t('noOrdersFound')}</p>
                  <p className="text-gray-600 text-xs mt-1">{t('connectShopOrders')}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Desktop header row */}
                  <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-2 text-xs uppercase tracking-[0.15em] text-[#8A8AA3] border-b border-[#E8E8EE]">
                    <div className="col-span-3">{t('customerEmail')}</div>
                    <div className="col-span-3">{t('product')}</div>
                    <div className="col-span-1 text-center">{t('qty')}</div>
                    <div className="col-span-2 text-right">{t('priceLabel')}</div>
                    <div className="col-span-3 text-right">{t('action')}</div>
                  </div>

                  {ordersList.map((row, index) => (
                    <div key={`${row.order_id}-${index}`} className="bg-[#F7F8FA] border border-[#E8E8EE] rounded-xl px-4 py-3">
                      {/* Mobile layout */}
                      <div className="md:hidden space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[#1A1A2E] text-sm font-medium truncate max-w-[200px]">{row.email || t('noEmail')}</span>
                          <span className="text-xs text-[#8A8AA3]">{row.order_name}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[#4A4A68] text-sm truncate max-w-[180px]">{row.product_title}</span>
                          <span className="text-[#4A4A68] text-sm font-semibold">{Number(row.price).toFixed(2)} {row.currency}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-[#8A8AA3]">{t('qty')}: {row.quantity}</span>
                          <button
                            onClick={() => sendInvoiceEmailForRow(row, index)}
                            disabled={!row.email || sendingInvoiceFor === index}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                              !row.email
                                ? 'bg-[#EFF1F5] text-[#8A8AA3] cursor-not-allowed'
                                : sendingInvoiceFor === index
                                ? 'bg-[#E8E8EE] text-[#4A4A68]'
                                : 'bg-[#FF6B35] hover:bg-[#E85A28] text-black'
                            }`}
                          >
                            {sendingInvoiceFor === index ? 'Envoi...' : '📧 Facture'}
                          </button>
                        </div>
                      </div>

                      {/* Desktop layout */}
                      <div className="hidden md:grid grid-cols-12 gap-3 items-center">
                        <div className="col-span-3 text-[#1A1A2E] text-sm truncate" title={row.email}>
                          {row.email || <span className="text-[#8A8AA3] italic">Pas d'email</span>}
                        </div>
                        <div className="col-span-3 text-[#4A4A68] text-sm truncate" title={row.product_title}>
                          {row.product_title}
                          {row.variant_title && <span className="text-[#8A8AA3] text-xs ml-1">({row.variant_title})</span>}
                        </div>
                        <div className="col-span-1 text-center text-[#6A6A85] text-sm">{row.quantity}</div>
                        <div className="col-span-2 text-right text-[#4A4A68] text-sm font-medium">
                          {Number(row.price).toFixed(2)} {row.currency}
                        </div>
                        <div className="col-span-3 text-right">
                          <button
                            onClick={() => sendInvoiceEmailForRow(row, index)}
                            disabled={!row.email || sendingInvoiceFor === index}
                            className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
                              !row.email
                                ? 'bg-[#EFF1F5] text-[#8A8AA3] cursor-not-allowed'
                                : sendingInvoiceFor === index
                                ? 'bg-[#E8E8EE] text-[#4A4A68]'
                                : 'bg-[#FF6B35] hover:bg-[#E85A28] text-black'
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
            <div className="bg-white rounded-2xl p-6 border border-[#E8E8EE]">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-amber-400">{t('commercialPerformance')}</p>
                  <h3 className="text-[#1A1A2E] text-2xl font-bold mt-2">{t('underperformingProducts')}</h3>
                  <p className="text-sm text-[#6A6A85] mt-1">{t('underperformingDesc')}</p>
                </div>
                <div className="text-right">
                  <div className="text-xs text-[#8A8AA3]">{underperformingData?.underperforming_count ?? '—'} / {underperformingData?.total_products ?? '—'} {t('products')}</div>
                  {underperformingData?.benchmarks && (
                    <div className="text-xs text-gray-600 mt-1">{t('avgOrdersLabel')} {underperformingData.benchmarks.avg_orders} • {t('avgRevenueLabel')} {formatCurrency(underperformingData.benchmarks.avg_revenue, underperformingData?.currency || 'EUR')}</div>
                  )}
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {underperformingLoading ? (
                  <div className="px-4 py-8 text-sm text-[#8A8AA3] text-center">⏳ {t('salesAnalysisInProgress')}</div>
                ) : (!underperformingData?.underperformers || underperformingData.underperformers.length === 0) ? (
                  <div className="px-4 py-8 text-sm text-[#8A8AA3] text-center">✅ {t('allProductsPerforming')}</div>
                ) : (
                  underperformingData.underperformers.slice(0, 10).map((item) => (
                    <div key={item.product_id || item.title} className="bg-[#F7F8FA]/70 border border-[#E8E8EE] rounded-xl p-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm">{item.category}</span>
                          <span className="text-xs bg-orange-100 text-[#E85A28] px-2 py-0.5 rounded-full">{t('score')}: {item.score}/100</span>
                        </div>
                        <p className="text-[#1A1A2E] font-semibold mt-1">{item.title || t('productHeader')}</p>
                        <div className="flex flex-wrap gap-3 mt-2 text-xs text-[#6A6A85]">
                          <span>🛒 {t('ordersCountShort').replace('{count}', item.orders)}</span>
                          <span>💰 CA: {formatCurrency(item.revenue, underperformingData?.currency || 'EUR')}</span>
                          <span>📦 {t('stockHeader')}: {item.inventory}</span>
                          <span>🏷️ Prix: {formatCurrency(item.price, underperformingData?.currency || 'EUR')}</span>
                          {item.daily_sales != null && <span>📊 {item.daily_sales}{t('perDay')}</span>}
                          {item.days_of_stock != null && <span>⏱️ {t('daysOfStock').replace('{days}', item.days_of_stock)}</span>}
                          {item.refund_count > 0 && <span className="text-red-500">↩️ {t('returnsCountShort').replace('{count}', item.refund_count)} ({(item.refund_rate * 100).toFixed(0)}%)</span>}
                        </div>
                        {item.reasons?.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {item.reasons.map((r, i) => (
                              <div key={i} className="text-xs text-[#E85A28]/80">• {r}</div>
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
            <div className="bg-white rounded-2xl p-6 border border-[#E8E8EE]">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-red-500">🚫 {t('conversionAnalysis')}</p>
                  <h3 className="text-[#1A1A2E] text-2xl font-bold mt-2">{t('blockerProductsLabel')}</h3>
                  <p className="text-sm text-[#6A6A85] mt-1">{t('blockerProductsDesc')}</p>
                </div>
                <div className="text-right">
                  <div className="text-xs text-[#8A8AA3]">{blockersData?.blockers?.length ?? '—'} {t('blockerProductsLabel')}</div>
                </div>
              </div>

              {/* Shopify Pixel Status + Guide */}
              <div className="mt-4 rounded-lg border border-[#E8E8EE] bg-[#F7F8FA]">
                <div className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[#4A4A68]">Shopify Pixel :</span>
                    {pixelLoading ? (
                      <span className="text-xs text-[#8A8AA3]">{t('verifying')}</span>
                    ) : pixelStatus ? (
                      <span className={`text-xs font-medium ${
                        pixelStatus.status === 'active' ? 'text-[#0D9488]' :
                        pixelStatus.status === 'installed_inactive' ? 'text-[#FF6B35]' :
                        'text-red-500'
                      }`}>
                        {pixelStatus.status_label}
                      </span>
                    ) : (
                      <span className="text-xs text-[#8A8AA3]">—</span>
                    )}
                  </div>
                  <button
                    onClick={() => setShowPixelGuide(!showPixelGuide)}
                    className="flex items-center gap-1 px-2 py-1 rounded-md bg-white hover:bg-[#EFF1F5] border border-[#D8D8E2] text-xs text-[#4A4A68] hover:text-[#1A1A2E] transition"
                  >
                    <span>{showPixelGuide ? '−' : '+'}</span>
                    <span>{t('howToConnectPixel')}</span>
                  </button>
                </div>

                {pixelStatus?.has_recent_events && (
                  <div className="px-3 pb-2">
                    <p className="text-xs text-[#0D9488]/70">{t('pixelEventsReceived')}</p>
                  </div>
                )}
                {pixelStatus && !pixelStatus.pixel_installed && !showPixelGuide && (
                  <div className="px-3 pb-3">
                    <p className="text-xs text-[#8A8AA3]">{t('withoutPixelData')} pas disponibles.</p>
                  </div>
                )}

                {/* Guide d'installation du Pixel */}
                {showPixelGuide && (
                  <div className="border-t border-[#E8E8EE] p-4 space-y-4">
                    <h4 className="text-[#1A1A2E] font-bold text-sm">📋 Guide d'installation du Shopify Pixel</h4>

                    <div className="space-y-3">
                      <div className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-red-50 text-red-500 flex items-center justify-center text-xs font-bold">1</span>
                        <div>
                          <p className="text-sm text-[#1A1A2E] font-medium">{t('pixelStep1Title')}</p>
                          <p className="text-xs text-[#6A6A85]">{t('pixelStep2')} <span className="text-[#1A1A2E] font-mono bg-white px-1 rounded">Settings</span> {t('pixelSettingsHint')}</p>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-red-50 text-red-500 flex items-center justify-center text-xs font-bold">2</span>
                        <div>
                          <p className="text-sm text-[#1A1A2E] font-medium">{t('pixelStep2Title')}</p>
                          <p className="text-xs text-[#6A6A85]">{t('pixelStep2FrenchNote')}</p>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-red-50 text-red-500 flex items-center justify-center text-xs font-bold">3</span>
                        <div>
                          <p className="text-sm text-[#1A1A2E] font-medium">{t('pixelStep3Title')}</p>
                          <p className="text-xs text-[#6A6A85]">{t('pixelStep3FrenchNote')}</p>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-red-50 text-red-500 flex items-center justify-center text-xs font-bold">4</span>
                        <div>
                          <p className="text-sm text-[#1A1A2E] font-medium">{t('pixelStep4Title')}</p>
                          <p className="text-xs text-[#6A6A85]">{t('pixelStep4Desc')}</p>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-red-50 text-red-500 flex items-center justify-center text-xs font-bold">5</span>
                        <div>
                          <p className="text-sm text-[#1A1A2E] font-medium">{t('pixelStep5Title')}</p>
                          <p className="text-xs text-[#6A6A85]"><b>{t('permission')}:</b> « Not required » · <b>{t('dataSale')}:</b> « Data collected does not qualify as data sale ».</p>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-red-50 text-red-500 flex items-center justify-center text-xs font-bold">6</span>
                        <div>
                          <p className="text-sm text-[#1A1A2E] font-medium">{t('pixelStep6Title')}</p>
                          <p className="text-xs text-[#6A6A85]">{t('pixelStep3')} :</p>
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
                        className="absolute top-2 right-2 px-2 py-1 rounded bg-[#EFF1F5] hover:bg-[#E8E8EE] text-xs text-[#4A4A68] hover:text-[#1A1A2E] transition z-10"
                      >
                        {pixelCodeCopied ? t('copied') : t('copyCode')}
                      </button>
                      <pre className="bg-[#1A1A2E] border border-[#E8E8EE] rounded-lg p-3 text-xs text-[#2DD4BF] overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">{`const BACKEND = "https://shopbrain-backend.onrender.com/api/shopify/pixel-event";
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
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-red-50 text-red-500 flex items-center justify-center text-xs font-bold">7</span>
                      <div>
                        <p className="text-sm text-[#1A1A2E] font-medium">{t('pixelStep7Title')}</p>
                        <p className="text-xs text-[#6A6A85]">{t('pixelStep7Desc')}</p>
                      </div>
                    </div>

                    {/* Ask AI button */}
                    <div className="pt-2 border-t border-[#E8E8EE]">
                      <button
                        onClick={() => {
                          setShowChatPanel(true);
                          setTimeout(() => {
                            sendChatMessage(t('pixelInstallQuestion'));
                          }, 500);
                        }}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#FF6B35]/20 hover:bg-[#FF6B35]/30 border border-[#FF6B35]/30 text-xs text-[#FF8B60] hover:text-[#E85A28] transition"
                      >
                        🤖 {t('askAiQuestion')}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {renderStatus('action-blockers')}

              <div className="mt-5 space-y-3">
                {blockersLoading ? (
                  <div className="px-4 py-8 text-sm text-[#8A8AA3] text-center">⏳ {t('blockerAnalysisInProgress')}</div>
                ) : (!blockersData?.blockers || blockersData.blockers.length === 0) ? (
                  <div className="px-4 py-8 text-sm text-[#8A8AA3] text-center">{t('noBlockersFound')}</div>
                ) : (
                  blockersData.blockers.slice(0, 10).map((item) => (
                    <div key={item.product_id || item.title} className="bg-[#F7F8FA]/70 border border-[#E8E8EE] rounded-xl p-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm">{item.category || '⚠️ ' + t('blockerDetected')}</span>
                        </div>
                        <p className="text-[#1A1A2E] font-semibold mt-1">{item.title || t('productHeader')}</p>
                        <div className="flex flex-wrap gap-3 mt-2 text-xs text-[#6A6A85]">
                          <span>🛒 {t('ordersCountShort').replace('{count}', item.orders)}</span>
                          <span>💰 {formatCurrency(item.revenue, blockersData?.currency || analyticsData?.currency || 'EUR')}</span>
                          {item.views > 0 && <span>👁️ {t('viewsCount').replace('{count}', item.views)}</span>}
                          {item.add_to_cart > 0 && <span>🛒 {t('addToCartCount').replace('{count}', item.add_to_cart)}</span>}
                          {item.view_to_cart_rate != null && <span className={item.view_to_cart_rate < 0.03 ? 'text-red-500' : 'text-[#0D9488]'}>{t('viewToCartRate').replace('{rate}', (item.view_to_cart_rate * 100).toFixed(1))}</span>}
                          {item.cart_to_order_rate != null && <span className={item.cart_to_order_rate < 0.2 ? 'text-red-500' : 'text-[#0D9488]'}>{t('cartToOrderRate').replace('{rate}', (item.cart_to_order_rate * 100).toFixed(1))}</span>}
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
          <div className="bg-white rounded-lg p-6 border border-[#E8E8EE] space-y-6">
            <div>
              <h2 className="text-[#1A1A2E] text-xl font-bold mb-2">{t('smartRewrite')}</h2>
              <p className="text-[#6A6A85]">{t('rewriteDesc')}</p>
            </div>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <p className="text-sm text-[#6A6A85]">{getInsightCount(insightsData?.rewrite_opportunities)} {t('productsToRewrite')}</p>
              <div className="flex flex-col sm:flex-row gap-3">
                <select
                  value={rewriteProductId}
                  onChange={(event) => setRewriteProductId(event.target.value)}
                  className="bg-[#F7F8FA] border border-[#E8E8EE] text-sm text-[#1A1A2E] rounded-lg px-3 py-2 min-w-[240px]"
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
                  className="bg-[#FF6B35] hover:bg-[#E85A28] text-white font-bold py-3 px-6 rounded-lg disabled:opacity-50"
                >
                  {insightsLoading ? t('analysisInProgress') : t('launchRewriteAnalysis')}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#6A6A85] mb-1">{t('customInstructions')}</label>
              <textarea
                value={rewriteInstructions}
                onChange={(e) => setRewriteInstructions(e.target.value)}
                placeholder="Ex: Ton humoristique, mentionne la livraison gratuite, cibler les jeunes mamans, utiliser un vocabulaire luxe..."
                className="w-full bg-[#F7F8FA] border border-[#E8E8EE] text-[#1A1A2E] text-sm rounded-lg px-3 py-2 min-h-[80px] resize-y placeholder-gray-600 focus:border-[#FF6B35] focus:ring-1 focus:ring-[#FF6B35] outline-none"
                rows={3}
              />
              <p className="text-xs text-gray-600 mt-1">{t('aiWillUseInstructions')}</p>
            </div>
            {renderStatus('action-rewrite')}
            {insightsData?.rewrite_ai?.notes?.length ? (
              <div className="text-xs text-[#E85A28] bg-orange-50 border border-[#FF6B35]/30 rounded px-3 py-2">
                {insightsData.rewrite_ai.notes.join(' · ')}
              </div>
            ) : null}
            <div className="space-y-3">
              {!rewriteProductId ? (
                <p className="text-sm text-[#8A8AA3]">{t('selectProductToAnalyze')}</p>
              ) : !insightsLoading && (!insightsData?.rewrite_opportunities || insightsData.rewrite_opportunities.length === 0) ? (
                <p className="text-sm text-[#8A8AA3]">{t('noSuggestionsYet')}</p>
              ) : (
                insightsData?.rewrite_opportunities?.slice(0, 1).map((item, index) => (
                  <div key={item.product_id || index} className="bg-[#F7F8FA]/70 border border-[#E8E8EE] rounded-lg p-6 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[#1A1A2E] font-semibold text-lg">{item.title || t('productHeader')}</p>
                        <p className="text-sm text-[#6A6A85]">{(item.reasons || []).join(' · ')}</p>
                      </div>
                      <div className="flex gap-2">
                        {(item.recommendations || []).includes('title') && (
                          <button
                            onClick={() => handleApplyBlockerAction(item.product_id, { type: 'title', suggested_title: item.suggested_title }, 'action-rewrite')}
                            className={`px-3 py-2 rounded text-sm font-semibold transition ${
                              applyingBlockerActionId === `${item.product_id}-title`
                                ? 'bg-[#E85A28] text-white shadow-[0_0_18px_rgba(255,107,53,0.5)]'
                                : 'bg-[#FF6B35] hover:bg-[#E85A28] text-white'
                            }`}
                            disabled={applyingBlockerActionId === `${item.product_id}-title`}
                          >
                            {t('applyTitle')}
                          </button>
                        )}
                        {(item.recommendations || []).includes('description') && (
                          <button
                            onClick={() => handleApplyBlockerAction(item.product_id, { type: 'description', suggested_description: item.suggested_description }, 'action-rewrite')}
                            className={`px-3 py-2 rounded text-sm font-semibold transition ${
                              applyingBlockerActionId === `${item.product_id}-description`
                                ? 'bg-[#E85A28] text-white shadow-[0_0_18px_rgba(255,107,53,0.5)]'
                                : 'bg-[#FF6B35] hover:bg-[#E85A28] text-white'
                            }`}
                            disabled={applyingBlockerActionId === `${item.product_id}-description`}
                          >
                            {t('applyDescription')}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="bg-[#F7F8FA] border border-[#E8E8EE] rounded-lg p-4">
                        <p className="text-sm font-semibold text-[#4A4A68] mb-2">{t('currentContent')}</p>
                        <div className="text-sm text-[#6A6A85] space-y-2">
                          <p><span className="text-[#8A8AA3]">Titre:</span> {item.current_title || '—'}</p>
                          <div className="max-h-56 overflow-y-auto pr-2 text-base text-[#4A4A68] whitespace-pre-wrap">
                            {stripHtmlTags(item.current_description) || '—'}
                          </div>
                        </div>
                      </div>
                      <div className="bg-[#F7F8FA] border border-[#E8E8EE] rounded-lg p-4">
                        <p className="text-sm font-semibold text-[#4A4A68] mb-2">{t('aiSuggestions')}</p>
                        <div className="text-sm text-[#4A4A68] space-y-3">
                          {item.suggested_title ? (
                            <p className="text-base"><span className="text-[#8A8AA3]">{t('suggestedTitle')}:</span> {stripHtmlTags(item.suggested_title)}</p>
                          ) : null}
                          <div className="max-h-72 overflow-y-auto pr-2 text-base text-[#2A2A42] whitespace-pre-wrap">
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
          <div className="bg-white rounded-lg p-6 border border-[#E8E8EE] space-y-6">
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
              <h2 className="text-[#1A1A2E] text-xl font-bold mb-2">{t('dynamicPriceOptimization')}</h2>
              <p className="text-[#6A6A85]">{t('priceAnalysisDesc')}</p>
            </div>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm text-[#6A6A85]">{getInsightCount(priceItems)} {t('opportunities')}</p>
                <p className={`text-xs ${marketStatus?.enabled ? 'text-[#0D9488]' : 'text-[#6A6A85]'}`}>
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
                  <p className="text-xs text-[#8A8AA3]">{t('priceAnalysisNote')}</p>
                ) : null}
              </div>
              <select
                value={priceProductId}
                onChange={(e) => setPriceProductId(e.target.value)}
                className="bg-[#F7F8FA] border border-[#E8E8EE] text-sm text-[#1A1A2E] rounded-lg px-3 py-2 min-w-[260px] focus:border-[#FF6B35] focus:ring-1 focus:ring-[#FF6B35] outline-none"
              >
                <option value="">{t('allProducts')}</option>
                {(products || []).map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.title || product.name || `Produit ${product.id}`}
                  </option>
                ))}
              </select>
              <button
                onClick={() => runActionAnalysis('action-price')}
                disabled={insightsLoading}
                className="bg-[#FF6B35] hover:bg-[#E85A28] text-white font-bold py-3 px-6 rounded-lg disabled:opacity-50 transition-all duration-200 shadow-md hover:shadow-lg hover:-translate-y-0.5"
              >
                {insightsLoading ? t('analysisInProgress') : t('launchPriceOptimization')}
              </button>
            </div>

            {/* Custom instructions for the AI */}
            <div className="bg-[#F7F8FA] border border-[#E8E8EE] rounded-lg p-4">
              <label className="block text-sm text-[#4A4A68] font-medium mb-2">{t('aiInstructionsLabel')}</label>
              <textarea
                value={priceInstructions}
                onChange={(e) => setPriceInstructions(e.target.value)}
                placeholder={t('aiInstructionsPlaceholder')}
                className="w-full bg-white border border-[#D8D8E2] rounded-lg px-3 py-2 text-sm text-[#1A1A2E] placeholder-gray-500 focus:border-[#FF6B35] focus:ring-1 focus:ring-[#FF6B35] outline-none resize-none"
                rows={2}
              />
              <p className="text-xs text-[#8A8AA3] mt-1">{t('aiInstructionsHint')}</p>
            </div>
            {renderStatus('action-price')}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-[#F7F8FA]/70 border border-[#E8E8EE] rounded-lg p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[#8A8AA3]">{t('productsAnalyzed')}</p>
                <p className="text-2xl text-[#1A1A2E] font-bold mt-2">{formatCompactNumber(insightsData?.products_analyzed ?? (products?.length || 0))}</p>
              </div>
              <div className="bg-[#F7F8FA]/70 border border-[#E8E8EE] rounded-lg p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[#8A8AA3]">{t('priceOpportunities')}</p>
                <p className="text-2xl text-[#1A1A2E] font-bold mt-2">{formatCompactNumber(priceItems.length)}</p>
              </div>
              <div className="bg-[#F7F8FA]/70 border border-[#E8E8EE] rounded-lg p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[#8A8AA3]">{t('averageAdjustment')}</p>
                <p className="text-2xl text-[#1A1A2E] font-bold mt-2">{avgDelta === null ? '—' : `${avgDelta > 0 ? '+' : ''}${avgDelta.toFixed(1)}%`}</p>
              </div>
            </div>
            <div className="space-y-3">
              {!insightsLoading && priceItems.length === 0 ? (
                <p className="text-sm text-[#8A8AA3]">{t('noOpportunityDetected')}</p>
              ) : (
                priceItems.slice(0, 8).map((item, index) => (
                  <div key={item.product_id || index} className="bg-[#F7F8FA]/70 border border-[#E8E8EE] rounded-lg p-4">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-[#1A1A2E] font-semibold">{item.title || item.product_id}</p>
                        <p className="text-xs text-[#8A8AA3]">{item.suggestion || t('adjustPrice')}</p>
                        {(item.current_price !== undefined && item.current_price !== null) ? (
                          <p className="text-xs text-[#6A6A85] mt-1">
                            {t('currentPrice')}: {formatCurrency(item.current_price, item.currency_code)}
                            {item.suggested_price !== undefined && item.suggested_price !== null ? ` • ${t('suggestedPrice')}: ${formatCurrency(item.suggested_price, item.currency_code)}` : ''}
                          </p>
                        ) : null}
                        {Number.isFinite(Number(item.target_delta_pct)) ? (
                          <p className={`text-xs font-semibold ${Number(item.target_delta_pct) > 0 ? 'text-[#0D9488]' : 'text-[#FF6B35]'}`}>
                            {t('targetVariation')}: {Number(item.target_delta_pct) > 0 ? '+' : ''}{Number(item.target_delta_pct).toFixed(1)}%
                          </p>
                        ) : null}
                        {item.reason ? <p className="text-xs text-[#8A8AA3] mt-1">{item.reason}</p> : null}
                        {item.market_estimate?.comparable_products?.length > 0 ? (
                          <div className="mt-2 bg-white/70 rounded p-2">
                            <p className="text-xs text-[#FF6B35] font-semibold mb-1">📊 {t('comparableProductsFound')}:</p>
                            {item.market_estimate.comparable_products.slice(0, 5).map((cp, i) => (
                              <p key={i} className="text-xs text-[#6A6A85]">
                                • {typeof cp === 'string' ? cp : `${cp?.title || '?'}: ${cp?.price || '?'}$`}
                              </p>
                            ))}
                          </div>
                        ) : null}
                        {item.search_stats ? (
                          <div className="mt-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                const panel = e.currentTarget.nextElementSibling
                                if (panel) panel.classList.toggle('hidden')
                              }}
                              className="text-xs text-[#0D9488] hover:text-[#2DD4BF] underline cursor-pointer bg-transparent border-none p-0"
                            >
                              🔍 {item.search_stats.queries_run?.length || 0} {t('searches')} · {item.search_stats.total_prices_found || 0} {t('pricesFound')} — {t('viewResults')} ▾
                            </button>
                            <div className="hidden mt-2 bg-white/70 border border-[#D8D8E2] rounded-lg p-3 max-h-[300px] overflow-y-auto">
                              {item.search_stats.vision?.search_query ? (
                                <div className="mb-3 bg-teal-50 border border-[#2DD4BF]/30 rounded-lg p-2">
                                  <p className="text-xs text-[#0D9488] font-semibold mb-1">👁️ {t('visualAnalysis')}:</p>
                                  <p className="text-xs text-[#4A4A68]">
                                    <span className="text-[#0D9488]">{t('searchQuery')}:</span> {item.search_stats.vision.search_query}
                                  </p>
                                  {item.search_stats.vision.attributes ? (
                                    <p className="text-xs text-[#6A6A85] mt-0.5">
                                      <span className="text-[#0D9488]">{t('attributes')}:</span> {item.search_stats.vision.attributes}
                                    </p>
                                  ) : null}
                                </div>
                              ) : null}
                              <p className="text-xs text-[#6A6A85] font-semibold mb-2">🌐 {t('queriesPerformed')}:</p>
                              <div className="flex flex-wrap gap-1 mb-3">
                                {(item.search_stats.queries_run || []).map((q, qi) => (
                                  <span key={qi} className="text-[10px] bg-[#EFF1F5] text-[#4A4A68] px-2 py-0.5 rounded-full">{q}</span>
                                ))}
                              </div>
                              <p className="text-xs text-[#6A6A85] font-semibold mb-2">🛒 {item.search_stats.refs?.length || 0} {t('productsFoundOnWeb')}:</p>
                              <div className="space-y-1.5">
                                {(item.search_stats.refs || []).map((ref, ri) => (
                                  <div key={ri} className="flex items-start justify-between gap-2 text-xs">
                                    <div className="flex-1 min-w-0">
                                      {ref.link ? (
                                        <a href={ref.link} target="_blank" rel="noopener noreferrer" className="text-[#0D9488] hover:text-[#2DD4BF] hover:underline truncate block">
                                          {ref.title || 'Produit'}
                                        </a>
                                      ) : (
                                        <span className="text-[#4A4A68] truncate block">{ref.title || 'Produit'}</span>
                                      )}
                                      <span className="text-[#8A8AA3]">{ref.source || ''}</span>
                                    </div>
                                    <span className="text-[#0D9488] font-semibold whitespace-nowrap">{ref.price}$ {ref.currency_code || ''}</span>
                                  </div>
                                ))}
                              </div>
                              {(!item.search_stats.refs || item.search_stats.refs.length === 0) ? (
                                <p className="text-xs text-[#8A8AA3] italic">{t('noProductLinks')}</p>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                      </div>
                      <div className="flex flex-col items-start md:items-end gap-2">
                        <button
                          onClick={() => handleApplyRecommendation(item.product_id, 'Prix', { suggested_price: item.suggested_price })}
                          disabled={!item.product_id || applyingRecommendationId === `${item.product_id}-Prix`}
                          className="bg-[#FF6B35] hover:bg-[#E85A28] disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 rounded"
                        >
                          {applyingRecommendationId === `${item.product_id}-Prix` ? t('applying') : t('applyPrice')}
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
          <div className="bg-white rounded-lg p-6 border border-[#E8E8EE] space-y-6">
            {/* Header with expert badge */}
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#FF6B35] to-[#E85A28] flex items-center justify-center text-2xl flex-shrink-0 shadow-lg shadow-[#FF6B35]/10">📸</div>
              <div className="flex-1">
                <h2 className="text-[#1A1A2E] text-2xl font-bold mb-1">{t('imgAssistTitle')}</h2>
                <p className="text-[#4A4A68] text-base">{t('imgAssistDesc')}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1 text-xs bg-teal-50 text-[#0D9488] border border-[#2DD4BF]/30 rounded-full px-3 py-1">🎨 {t('imgBadgeDesign')}</span>
                  <span className="inline-flex items-center gap-1 text-xs bg-orange-50 text-[#FF6B35] border border-[#FF6B35]/20 rounded-full px-3 py-1">📷 {t('imgBadgePhoto')}</span>
                  <span className="inline-flex items-center gap-1 text-xs bg-teal-50 text-[#0D9488] border border-[#2DD4BF]/30 rounded-full px-3 py-1">📈 {t('imgBadgeConversion')}</span>
                </div>
              </div>
            </div>

            {/* Product selector + analyze button */}
            <div className="flex flex-col md:flex-row md:items-end gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-[#6A6A85] mb-1">{t('imgSelectProduct')}</label>
                <select
                  value={imageProductId}
                  onChange={(e) => setImageProductId(e.target.value)}
                  className="w-full bg-[#F7F8FA] border border-[#E8E8EE] text-sm text-[#1A1A2E] rounded-lg px-3 py-2.5 focus:border-[#FF6B35] focus:ring-1 focus:ring-[#FF6B35] outline-none"
                >
                  <option value="">{t('imgAllProducts')}</option>
                  {(products || []).map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.title || product.name || `Produit ${product.id}`}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => runActionAnalysis('action-images')}
                disabled={insightsLoading}
                className="font-bold py-2.5 px-6 rounded-lg disabled:opacity-50 transition-all duration-200 text-white whitespace-nowrap"
                style={{ background: 'linear-gradient(135deg, #D97706 0%, #F59E0B 50%, #D97706 100%)', boxShadow: '0 2px 12px rgba(217, 119, 6, 0.3)' }}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 20px rgba(217, 119, 6, 0.6)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 2px 12px rgba(217, 119, 6, 0.3)'; e.currentTarget.style.transform = 'translateY(0)' }}
              >
                {insightsLoading ? t('analysisInProgress') : (imageProductId ? t('imgAnalyzeThisProduct') : t('imgAnalyzeAll'))}
              </button>
            </div>

            {/* Custom AI instructions */}
            <div className="bg-[#F7F8FA] border border-[#E8E8EE] rounded-lg p-4">
              <label className="block text-sm text-[#4A4A68] font-medium mb-2">🎯 {t('imgInstructionsLabel')}</label>
              <textarea
                value={imageInstructions}
                onChange={(e) => setImageInstructions(e.target.value)}
                placeholder={t('imgInstructionsPlaceholder')}
                className="w-full bg-white border border-[#D8D8E2] rounded-lg px-3 py-2 text-sm text-[#1A1A2E] placeholder-gray-500 focus:border-[#FF6B35] focus:ring-1 focus:ring-[#FF6B35] outline-none resize-none"
                rows={2}
              />
              <p className="text-xs text-gray-600 mt-1">{t('imgInstructionsHint')}</p>
            </div>

            {/* Status + count */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-[#6A6A85]">{getInsightCount(insightsData?.image_risks)} {t('imgProductsAnalyzed')}</p>
            </div>
            {renderStatus('action-images')}
            {Array.isArray(insightsData?.notes) && insightsData.notes.length > 0 ? (
              <div className="text-sm text-[#6A6A85] space-y-1 bg-[#F7F8FA]/40 rounded-lg p-3">
                {insightsData.notes.slice(0, 3).map((note, idx) => (
                  <div key={idx}>ℹ️ {note}</div>
                ))}
              </div>
            ) : null}

            {/* Results */}
            <div className="space-y-6">
              {!insightsLoading && (!insightsData?.image_risks || insightsData.image_risks.length === 0) ? (
                <div className="text-center py-12">
                  <div className="text-5xl mb-4">🖼️</div>
                  <p className="text-[#6A6A85] text-base">{imageProductId ? t('imgNoSignalProduct') : t('imgNoSignal')}</p>
                  <p className="text-gray-600 text-sm mt-2">{t('imgNoSignalHint')}</p>
                </div>
              ) : (
                insightsData?.image_risks?.slice(0, 8).map((item, index) => (
                  <div key={item.product_id || index} className="bg-[#F7F8FA]/70 border border-[#E8E8EE] rounded-xl p-5 space-y-5">
                    {/* Product header */}
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[#1A1A2E] font-bold text-xl">{item.title || `Produit #${item.product_id}`}</p>
                        <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-[#6A6A85]">
                          <span>{item.images_count} {t('imgImagesLabel')}</span>
                          {item.missing_alt ? <span className="text-amber-400">⚠️ {t('imgMissingAlt')}</span> : null}
                          {item.view_to_cart_rate !== null && item.view_to_cart_rate !== undefined ? (
                            <span className={item.view_to_cart_rate < 0.02 ? 'text-red-500' : item.view_to_cart_rate < 0.05 ? 'text-[#FF6B35]' : 'text-[#0D9488]'}>
                              {t('imgViewToCart')} {Math.round(item.view_to_cart_rate * 100)}%
                            </span>
                          ) : null}
                        </div>
                      </div>
                      {item?.recommendations?.target_total_images ? (
                        <div className="text-right flex-shrink-0">
                          <div className="text-2xl font-bold text-[#0D9488]">{item.recommendations.target_total_images}</div>
                          <div className="text-xs text-[#8A8AA3]">{t('imgTargetImages')}</div>
                        </div>
                      ) : null}
                    </div>

                    {/* Product image thumbnails */}
                    {Array.isArray(item.image_urls) && item.image_urls.length > 0 ? (
                      <div>
                        <p className="text-sm font-medium text-[#6A6A85] mb-2">📷 {t('imgCurrentPhotos')}</p>
                        <div className="flex flex-wrap gap-3">
                          {item.image_urls.slice(0, 8).map((url, imgIdx) => (
                            <div key={imgIdx} className="relative group">
                              <img
                                src={url}
                                alt={`${item.title} #${imgIdx + 1}`}
                                className="w-24 h-24 object-cover rounded-lg border-2 border-[#E8E8EE] group-hover:border-[#FF6B35] transition-colors cursor-pointer"
                                onError={(e) => { e.target.style.display = 'none' }}
                              />
                              <div className="absolute bottom-0 left-0 right-0 bg-black/30 text-center text-[10px] text-[#4A4A68] py-0.5 rounded-b-lg">#{imgIdx + 1}</div>
                            </div>
                          ))}
                          {item.images_count > 8 ? (
                            <div className="w-24 h-24 rounded-lg border-2 border-[#E8E8EE] flex items-center justify-center text-[#8A8AA3] text-sm bg-[#F7F8FA]">
                              +{item.images_count - 8}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    {/* Quality scores (vision audit) */}
                    {item.recommendations?.source === 'ai' && item.recommendations?.ai?.quality_scores && typeof item.recommendations.ai.quality_scores === 'object' ? (() => {
                      const scores = item.recommendations.ai.quality_scores
                      const scoreMap = {
                        'excellent': { color: 'text-[#0D9488] bg-[#0D9488]/10 border-[#0D9488]/30', icon: '✅', val: 4 },
                        'good': { color: 'text-[#0D9488] bg-[#0D9488]/10 border-[#2DD4BF]/30', icon: '👍', val: 3 },
                        'needs_improvement': { color: 'text-[#FF6B35] bg-[#FF6B35]/10 border-[#FF6B35]/30', icon: '⚠️', val: 2 },
                        'poor': { color: 'text-red-500 bg-red-500/10 border-red-200', icon: '❌', val: 1 },
                      }
                      const labels = {
                        sharpness: t('imgScoreSharpness'),
                        lighting: t('imgScoreLighting'),
                        background_contrast: t('imgScoreContrast'),
                        composition: t('imgScoreComposition'),
                        color_accuracy: t('imgScoreColor'),
                        design_appeal: t('imgScoreDesign'),
                        brand_consistency: t('imgScoreConsistency'),
                      }
                      return (
                        <div>
                          <p className="text-sm font-medium text-[#6A6A85] mb-3">🔬 {t('imgQualityAudit')}</p>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            {Object.entries(labels).map(([key, label]) => {
                              const rating = String(scores[key] || '').toLowerCase()
                              const s = scoreMap[rating] || scoreMap['good']
                              return (
                                <div key={key} className={`rounded-lg border px-3 py-2 ${s.color}`}>
                                  <div className="text-xs opacity-70">{label}</div>
                                  <div className="font-semibold text-sm mt-0.5">{s.icon} {rating === 'needs_improvement' ? t('imgNeedsImprovement') : rating === 'excellent' ? t('imgExcellent') : rating === 'poor' ? t('imgPoor') : t('imgGood')}</div>
                                </div>
                              )
                            })}
                          </div>
                          {Number.isFinite(Number(scores?.overall)) ? (
                            <div className="mt-3 flex items-center gap-3">
                              <div className="flex-1 bg-white rounded-full h-2">
                                <div
                                  className={`h-2 rounded-full transition-all ${Number(scores.overall) >= 0.75 ? 'bg-[#0D9488]' : Number(scores.overall) >= 0.5 ? 'bg-[#FF6B35]' : 'bg-red-500'}`}
                                  style={{ width: `${Math.min(100, Math.round(Number(scores.overall) * 100))}%` }}
                                />
                              </div>
                              <span className="text-sm text-[#4A4A68] font-semibold">{Math.round(Number(scores.overall) * 100)}%</span>
                            </div>
                          ) : null}
                        </div>
                      )
                    })() : null}

                    {item?.recommendations ? (
                      <div className="space-y-5">
                        {/* Need to create count */}
                        {Number.isFinite(Number(item.recommendations.recommended_new_images)) && item.recommendations.recommended_new_images > 0 ? (
                          <div className="bg-orange-50 border border-[#FF6B35]/20 rounded-lg px-4 py-3 text-[#E85A28] text-sm font-medium">
                            📌 {t('imgNeedToCreate')} <span className="text-[#1A1A2E] font-bold">{item.recommendations.recommended_new_images}</span> {t('imgNewImages')}
                          </div>
                        ) : item.recommendations.target_total_images ? (
                          <div className="bg-[#0D9488]/10 border border-[#0D9488]/30 rounded-lg px-4 py-3 text-[#0D9488] text-sm font-medium">
                            ✅ {t('imgQuantityOk')}
                          </div>
                        ) : null}

                        {/* Art direction */}
                        {item.recommendations?.source === 'ai' && item.recommendations?.ai ? (
                          <div className="bg-white/80 border border-[#E8E8EE] rounded-lg p-4 space-y-3">
                            <div className="text-[#1A1A2E] font-semibold flex items-center gap-2">🎨 {t('imgArtDirection')}</div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                              {item.recommendations.ai.tone ? (
                                <div className="bg-[#F7F8FA]/60 rounded-lg p-3">
                                  <div className="text-xs text-[#8A8AA3] mb-1">{t('toneLabel')}</div>
                                  <div className="text-[#1A1A2E]">{item.recommendations.ai.tone}</div>
                                </div>
                              ) : null}
                              {item.recommendations.ai.background ? (
                                <div className="bg-[#F7F8FA]/60 rounded-lg p-3">
                                  <div className="text-xs text-[#8A8AA3] mb-1">{t('backgroundLabel')}</div>
                                  <div className="text-[#1A1A2E]">{item.recommendations.ai.background}</div>
                                </div>
                              ) : null}
                            </div>
                            {Array.isArray(item.recommendations.ai.color_palette) && item.recommendations.ai.color_palette.length > 0 ? (
                              <div>
                                <div className="text-xs text-[#8A8AA3] mb-2">{t('imgColorPalette')}</div>
                                <div className="flex flex-wrap gap-2">
                                  {item.recommendations.ai.color_palette.slice(0, 6).map((color, cIdx) => (
                                    <div key={cIdx} className="flex items-center gap-2 bg-[#F7F8FA]/60 rounded-lg px-3 py-1.5">
                                      <div className="w-4 h-4 rounded-full border border-[#D8D8E2]" style={{ backgroundColor: String(color).startsWith('#') ? color : undefined }} />
                                      <span className="text-[#1A1A2E] text-sm">{color}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                            {Array.isArray(item.recommendations.ai.product_facts_used) && item.recommendations.ai.product_facts_used.length > 0 ? (
                              <div className="text-xs text-[#8A8AA3]">
                                💡 {t('imgFactsUsed')}: <span className="text-[#4A4A68]">{item.recommendations.ai.product_facts_used.slice(0, 6).join(' · ')}</span>
                              </div>
                            ) : null}
                            {Array.isArray(item.recommendations.ai.notes) && item.recommendations.ai.notes.length > 0 ? (
                              <div className="text-xs text-[#8A8AA3] italic">{item.recommendations.ai.notes[0]}</div>
                            ) : null}
                          </div>
                        ) : null}

                        {/* Vision audit (issues + quick fixes) */}
                        {item.recommendations?.source === 'ai' && item.recommendations?.ai?.audit ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {Array.isArray(item.recommendations.ai.audit.issues) && item.recommendations.ai.audit.issues.length > 0 ? (
                              <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4 space-y-2">
                                <div className="text-red-500 font-semibold text-sm flex items-center gap-2">🔴 {t('imgIssuesFound')}</div>
                                {item.recommendations.ai.audit.issues.slice(0, 5).map((line, idx) => (
                                  <div key={idx} className="text-sm text-[#4A4A68]">• {line}</div>
                                ))}
                              </div>
                            ) : null}
                            {Array.isArray(item.recommendations.ai.audit.quick_fixes) && item.recommendations.ai.audit.quick_fixes.length > 0 ? (
                              <div className="bg-[#0D9488]/5 border border-[#0D9488]/20 rounded-lg p-4 space-y-2">
                                <div className="text-[#0D9488] font-semibold text-sm flex items-center gap-2">⚡ {t('imgQuickFixes')}</div>
                                {item.recommendations.ai.audit.quick_fixes.slice(0, 5).map((line, idx) => (
                                  <div key={idx} className="text-sm text-[#4A4A68]">• {line}</div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        {/* What I see (vision audit description) */}
                        {item.recommendations?.source === 'ai' && Array.isArray(item.recommendations?.ai?.audit?.what_i_see) && item.recommendations.ai.audit.what_i_see.length > 0 ? (
                          <div className="bg-white/80 border border-[#E8E8EE] rounded-lg p-4 space-y-2">
                            <div className="text-[#1A1A2E] font-semibold flex items-center gap-2">👁️ {t('imgWhatISee')}</div>
                            {item.recommendations.ai.audit.what_i_see.slice(0, 5).map((line, idx) => (
                              <div key={idx} className="text-sm text-[#4A4A68]">• {line}</div>
                            ))}
                          </div>
                        ) : null}

                        {/* Category notes (non-AI fallback) */}
                        {item.recommendations?.source !== 'ai' && Array.isArray(item.recommendations.category_notes) && item.recommendations.category_notes.length > 0 ? (
                          <div className="text-sm text-[#6A6A85] space-y-1">
                            {item.recommendations.category_notes.slice(0, 2).map((line, idx) => (
                              <div key={idx}>• {line}</div>
                            ))}
                          </div>
                        ) : null}

                        {/* Action plan */}
                        {Array.isArray(item.recommendations.action_plan) && item.recommendations.action_plan.length > 0 ? (
                          <div className="bg-white/80 border border-[#E8E8EE] rounded-lg p-4 space-y-3">
                            <div className="text-[#1A1A2E] font-semibold flex items-center gap-2">📋 {t('imgActionPlan')}</div>
                            <div className="space-y-3">
                              {item.recommendations.action_plan.slice(0, 7).map((stepObj, idx) => (
                                <div key={idx} className="flex gap-3 text-sm">
                                  <div className="w-7 h-7 rounded-full bg-teal-50 text-[#0D9488] flex items-center justify-center flex-shrink-0 text-xs font-bold">{stepObj.step}</div>
                                  <div>
                                    <div className="font-semibold text-[#1A1A2E]">{stepObj.title}</div>
                                    {Array.isArray(stepObj.do) ? (
                                      <div className="mt-1 text-[#6A6A85] space-y-0.5">
                                        {stepObj.do.slice(0, 4).map((line, lineIdx) => (
                                          <div key={lineIdx}>→ {line}</div>
                                        ))}
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {/* Images to create */}
                        {Array.isArray(item.recommendations.images_to_create) && item.recommendations.images_to_create.length > 0 ? (
                          <div className="bg-white/80 border border-[#2DD4BF]/20 rounded-lg p-4 space-y-4">
                            <div className="text-[#1A1A2E] font-semibold flex items-center gap-2">🎯 {t('imgToCreate')}</div>
                            <div className="grid grid-cols-1 gap-4">
                              {item.recommendations.images_to_create.slice(0, 8).map((img, idx) => (
                                <div key={idx} className="bg-[#F7F8FA]/60 border border-[#E8E8EE] rounded-lg p-4 space-y-2">
                                  <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#FF6B35]/30 to-[#E85A28]/30 flex items-center justify-center text-[#FF6B35] text-xs font-bold flex-shrink-0">{img.index || (idx + 1)}</div>
                                    <div className="font-semibold text-[#1A1A2E]">{img.name}</div>
                                  </div>
                                  <div className="text-sm text-[#4A4A68] pl-10">{img.what_to_shoot}</div>
                                  {Array.isArray(img.uses_facts) && img.uses_facts.length > 0 ? (
                                    <div className="text-xs text-[#0D9488] pl-10">💡 {t('whyItFits')}: {img.uses_facts.slice(0, 3).join(' · ')}</div>
                                  ) : null}
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pl-10 text-xs">
                                    {img.background ? <div className="bg-white rounded px-2 py-1"><span className="text-[#8A8AA3]">{t('backgroundLabel')}:</span> <span className="text-[#1A1A2E]">{img.background}</span></div> : null}
                                    {img.color_tone ? <div className="bg-white rounded px-2 py-1"><span className="text-[#8A8AA3]">{t('toneLabel')}:</span> <span className="text-[#1A1A2E]">{img.color_tone}</span></div> : null}
                                    {img.camera ? <div className="bg-white rounded px-2 py-1"><span className="text-[#8A8AA3]">{t('cameraLabel')}:</span> <span className="text-[#1A1A2E]">{img.camera}</span></div> : null}
                                    {img.lighting ? <div className="bg-white rounded px-2 py-1"><span className="text-[#8A8AA3]">{t('lightingLabel')}:</span> <span className="text-[#1A1A2E]">{img.lighting}</span></div> : null}
                                  </div>
                                  {img.props ? <div className="text-xs text-[#8A8AA3] pl-10">🎬 Props: {img.props}</div> : null}
                                  {img.editing_notes ? <div className="text-xs text-[#8A8AA3] pl-10">✏️ {t('retouchLabel')}: {img.editing_notes}</div> : null}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {/* Recommended order */}
                        {Array.isArray(item.recommendations.recommended_order) && item.recommendations.recommended_order.length > 0 ? (
                          <div className="bg-white/80 border border-[#E8E8EE] rounded-lg p-4 space-y-2">
                            <div className="text-[#1A1A2E] font-semibold flex items-center gap-2">🔢 {t('imgRecommendedOrder')}</div>
                            <div className="space-y-1">
                              {item.recommendations.recommended_order.slice(0, 8).map((o, idx) => (
                                <div key={idx} className="flex items-center gap-3 text-sm">
                                  <span className="w-6 h-6 rounded-full bg-[#EFF1F5] text-[#4A4A68] flex items-center justify-center text-xs font-bold flex-shrink-0">{o.position}</span>
                                  <span className="text-[#1A1A2E]">{o.shot}</span>
                                  <span className="text-[#8A8AA3]">— {o.goal}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {/* Style guidelines */}
                        {Array.isArray(item.recommendations.style_guidelines) && item.recommendations.style_guidelines.length > 0 ? (
                          <div className="bg-white/80 border border-[#E8E8EE] rounded-lg p-4 space-y-2">
                            <div className="text-[#1A1A2E] font-semibold flex items-center gap-2">🎨 {t('imgStyleGuide')}</div>
                            {item.recommendations.style_guidelines.slice(0, 4).map((line, idx) => (
                              <div key={idx} className="text-sm text-[#4A4A68]">• {line}</div>
                            ))}
                          </div>
                        ) : null}

                        {/* Prompt blocks */}
                        {Array.isArray(item.recommendations.prompt_blocks) && item.recommendations.prompt_blocks.length > 0 ? (
                          <div className="space-y-3">
                            <div className="text-[#1A1A2E] font-semibold flex items-center gap-2">✨ {t('imgPromptBlocks')}</div>
                            {item.recommendations.prompt_blocks.slice(0, 3).map((pb, idx) => (
                              <div key={idx} className="bg-[#F7F8FA] border border-[#E8E8EE] rounded-lg p-4 space-y-2">
                                <div className="text-sm text-[#2A2A42] font-semibold">{pb.shot}</div>
                                {pb.outcome ? <div className="text-xs text-[#6A6A85]">{t('imgExpectedResult')}: {pb.outcome}</div> : null}
                                {Array.isArray(pb.prompts) ? pb.prompts.slice(0, 2).map((pr, prIdx) => (
                                  <div key={prIdx} className="space-y-1">
                                    <div className="text-xs text-[#6A6A85]">{pr.label}{pr.when_to_use ? ` — ${pr.when_to_use}` : ''}</div>
                                    <div className="bg-[#F7F8FA] border border-[#E8E8EE] rounded p-2 font-mono text-xs whitespace-pre-wrap break-words text-[#2A2A42]">
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
          <div className="bg-white rounded-lg p-6 border border-[#E8E8EE] space-y-6">
            <div>
              <h2 className="text-[#1A1A2E] text-xl font-bold mb-2">Bundles & cross-sell</h2>
              <p className="text-[#6A6A85]">{t('bundlesDescription')}</p>
            </div>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <p className="text-sm text-[#6A6A85]">{insightsLoading ? t('analysisInProgress') : `${getInsightCount(insightsData?.bundle_suggestions)} suggestions`}</p>
              <div className="relative">
                <button
                  onClick={() => {
                    if (!bundlesHistoryOpen) loadBundlesHistory({ openDropdown: true })
                    else setBundlesHistoryOpen(false)
                  }}
                  disabled={bundlesHistoryLoading}
                  className="flex items-center gap-1.5 text-sm text-[#2A2A42] hover:text-[#1A1A2E] font-medium transition-colors border border-[#E8E8EE] rounded-full px-4 py-2 hover:bg-[#F7F8FA]"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className={bundlesHistoryOpen ? 'rotate-45' : ''} style={{transition:'transform .2s', transformOrigin:'8px 8px'}}/></svg>
                  <span>{bundlesHistoryLoading ? t('loadingDots') : t('history')}</span>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0">
                    <path d={bundlesHistoryOpen ? "M3 7.5L6 4.5L9 7.5" : "M3 4.5L6 7.5L9 4.5"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>

                {/* ── Dropdown historique bundles ── */}
                {bundlesHistoryOpen && (
                  <div className="absolute top-full right-0 mt-2 w-96 bg-white border border-[#E8E8EE] rounded-xl shadow-2xl z-[60] overflow-hidden">
                    <div className="px-4 py-3 border-b border-[#E8E8EE]/40">
                      <span className="text-sm font-semibold text-[#1A1A2E]">Historique des analyses</span>
                    </div>
                    <div className="max-h-72 overflow-y-auto">
                      {bundlesHistory.length === 0 ? (
                        <p className="px-4 py-4 text-sm text-[#8A8AA3]">{t('noOldResults')}</p>
                      ) : (
                        bundlesHistory.map((job, idx) => {
                          const isSelected = selectedBundlesHistoryJobId === (job.job_id || '')
                          const raw = job.finished_at || job.started_at || job.created_at
                          let dateStr = '—'
                          if (raw) {
                            const ts = typeof raw === 'number' ? (raw > 1e12 ? raw : raw * 1000) : Date.parse(raw)
                            if (ts && !isNaN(ts)) dateStr = new Date(ts).toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' })
                          }
                          const suggestions = job.result?.bundle_suggestions || job.bundle_suggestions || []
                          const count = suggestions.length
                          // Build a summary of product names in the bundles
                          const bundleNames = suggestions.slice(0, 3).map(s => {
                            const t0 = s.titles?.[0] || ''
                            const t1 = s.titles?.[1] || ''
                            // Shorten each title to ~25 chars
                            const short = (t) => t.length > 25 ? t.slice(0, 23) + '…' : t
                            return `${short(t0)} + ${short(t1)}`
                          })
                          return (
                            <button
                              key={job.id || job.job_id || idx}
                              onClick={() => { applyBundlesHistoryJob(job); setBundlesHistoryOpen(false) }}
                              className={`w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#EFF1F5]/60 transition-colors border-b border-[#E8E8EE]/20 last:border-b-0 ${
                                isSelected ? 'bg-[#EFF1F5]/40' : ''
                              }`}
                            >
                              <div className="flex flex-col gap-0.5 min-w-0 flex-1 mr-2">
                                {bundleNames.length > 0 ? bundleNames.map((name, i) => (
                                  <span key={i} className="text-sm text-[#2A2A42] font-medium truncate">{name}</span>
                                )) : (
                                  <span className="text-sm text-[#2A2A42] font-medium truncate">{count} suggestion{count !== 1 ? 's' : ''}</span>
                                )}
                                <span className="text-xs text-[#8A8AA3]">{dateStr} — {count} bundle{count !== 1 ? 's' : ''}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                                  job.status === 'completed' ? 'bg-green-50 text-green-700' : job.status === 'failed' ? 'bg-red-50 text-red-600' : 'bg-yellow-50 text-yellow-700'
                                }`}>{job.status === 'completed' ? '✓' : job.status === 'failed' ? '✗' : '…'}</span>
                                {isSelected && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#0D9488]"></span>
                                )}
                              </div>
                            </button>
                          )
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            {bundlesJobStatus !== 'idle' && (
              <p className="text-xs text-[#6A6A85]">{t('jobStatusLabel')}: {bundlesJobStatus}</p>
            )}
            {renderStatus('action-bundles')}
            {bundlesDiagnostics && (
              <div className="bg-[#F7F8FA]/60 border border-[#E8E8EE] rounded-lg p-4 text-sm">
                <div className="text-[#1A1A2E] font-semibold mb-1">{t('analysisDiagnostics')}</div>
                <div className="text-[#4A4A68]">
                  {bundlesDiagnostics.orders_scanned || 0} {t('ordersScanned')} • {bundlesDiagnostics.orders_with_2plus_items || 0} {t('multiItemOrders')} • {bundlesDiagnostics.pairs_found || 0} {t('pairsFound')}
                </div>
                {bundlesDiagnostics.no_result_reason ? (
                  <div className="text-[#FF6B35] mt-2">{bundlesDiagnostics.no_result_reason}</div>
                ) : null}
                {Array.isArray(bundlesDiagnostics.recommendations) && bundlesDiagnostics.recommendations.length > 0 ? (
                  <div className="text-[#6A6A85] mt-2">{bundlesDiagnostics.recommendations.join(' · ')}</div>
                ) : null}
              </div>
            )}
            <div className="space-y-3">
              {!insightsLoading && (!insightsData?.bundle_suggestions || insightsData.bundle_suggestions.length === 0) ? (
                <p className="text-sm text-[#8A8AA3]">{t('noSuggestionDetected')}</p>
              ) : (
                insightsData?.bundle_suggestions?.slice(0, 8).map((item, index) => (
                  <div key={index} className="bg-[#F7F8FA]/70 border border-[#E8E8EE] rounded-lg p-4">
                    <div className="flex flex-col gap-2">
                      <div>
                        <p className="text-[#1A1A2E] font-semibold">
                          {item.titles?.[0] || `#${item.pair?.[0] || 'A'}`} + {item.titles?.[1] || `#${item.pair?.[1] || 'B'}`}
                        </p>
                        <p className="text-xs text-[#8A8AA3]">
                          {item.count || 0} {t('orders')?.toLowerCase() || 'orders'}
                          {item.confidence ? ` • ${t('confidenceLabel')} ${item.confidence}` : ''}
                          {Array.isArray(item.discount_range_pct) && item.discount_range_pct.length >= 2 ? ` • ${t('discountLabel')} ${item.discount_range_pct[0]}–${item.discount_range_pct[1]}%` : ''}
                        </p>
                      </div>

                      {item.offer?.message ? (
                        <div className="text-sm text-[#4A4A68]">
                          <div className="text-[#1A1A2E] font-semibold">{t('offer')}</div>
                          <div className="text-[#4A4A68]">{item.offer.message}</div>
                        </div>
                      ) : null}

                      {Array.isArray(item.placements) && item.placements.length > 0 ? (
                        <div className="text-sm text-[#4A4A68]">
                          <div className="text-[#1A1A2E] font-semibold">{t('whereToDisplay')}</div>
                          <div className="text-[#6A6A85]">{item.placements.slice(0, 3).join(' · ')}</div>
                        </div>
                      ) : null}

                      {Array.isArray(item.copy) && item.copy.length > 0 ? (
                        <div className="text-sm text-[#4A4A68]">
                          <div className="text-[#1A1A2E] font-semibold">{t('copyExamples')}</div>
                          <div className="text-[#6A6A85]">{item.copy.slice(0, 2).join(' · ')}</div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'action-stock' && (
          <div className="bg-white rounded-lg border border-[#E8E8EE]">
            <div className="px-6 py-5 border-b border-[#E8E8EE]">
              <h2 className="text-[#1A1A2E] text-xl font-bold flex items-center gap-2">
                {t('stockAlertTitle')}
              </h2>
              <p className="text-[#6A6A85] text-sm mt-1">{t('stockAlertDesc')}</p>
            </div>

            {stockProductsLoading ? (
              <div className="p-8 text-center">
                <svg className="animate-spin h-6 w-6 text-[#FF6B35] mx-auto mb-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                <p className="text-[#6A6A85] text-sm">{t('loadingProducts')}</p>
              </div>
            ) : stockProducts.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-[#8A8AA3] text-sm">{t('noShopifyProducts')}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#E8E8EE] bg-[#F7F8FA]">
                      <th className="text-left px-6 py-3 text-xs text-[#6A6A85] font-semibold uppercase">{t('productHeader')}</th>
                      <th className="text-center px-4 py-3 text-xs text-[#6A6A85] font-semibold uppercase w-28">{t('stockHeader')}</th>
                      <th className="text-center px-4 py-3 text-xs text-[#6A6A85] font-semibold uppercase w-36">{t('alertThreshold')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E8EE]">
                    {stockProducts.map((p) => (
                      <tr key={p.id} className="hover:bg-[#EFF1F5]/20 transition-colors">
                        <td className="px-6 py-3">
                          <p className="text-[#1A1A2E] text-sm font-medium">{p.title}</p>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-sm font-bold ${p.inventory <= 0 ? 'text-red-500' : p.inventory <= (p.threshold || 999999) ? 'text-[#FF6B35]' : 'text-[#0D9488]'}`}>
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
                            className="w-20 bg-[#F7F8FA] border border-[#D8D8E2] rounded px-2 py-1.5 text-[#FF6B35] font-bold text-sm text-center outline-none focus:border-[#FF6B35] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="px-6 py-3 border-t border-[#E8E8EE] bg-[#F7F8FA]/30">
              <p className="text-xs text-[#8A8AA3]">{t('serverChecksStock')} <span className="text-[#FF6B35]">{t('every5Minutes')}</span>{t('stockAlertEmailNotice')}</p>
            </div>
          </div>
        )}

        {activeTab === 'action-returns' && (
          <div className="bg-white rounded-lg p-6 border border-[#E8E8EE] space-y-6">
            <div>
              <h2 className="text-[#1A1A2E] text-xl font-bold mb-2">{t('antiReturns')}</h2>
              <p className="text-[#6A6A85]">{t('antiReturnsDescription')}</p>
            </div>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <p className="text-sm text-[#6A6A85]">{getInsightCount(insightsData?.return_risks)} {t('productsAtRisk')}</p>
              <button
                onClick={() => runActionAnalysis('action-returns')}
                disabled={insightsLoading}
                className="bg-[#FF6B35] hover:bg-[#E85A28] text-white font-bold py-3 px-6 rounded-lg disabled:opacity-50"
              >
                {insightsLoading ? t('analysisInProgress') : t('analyzeProducts')}
              </button>
            </div>
            {renderStatus('action-returns')}
            <div className="space-y-4">
              {!insightsLoading && (!insightsData?.return_risks || insightsData.return_risks.length === 0) ? (
                <div className="text-center py-8">
                  <p className="text-[#8A8AA3]">{t('noRiskProductsDetected')}</p>
                  <p className="text-xs text-[#B0B0C0] mt-1">{t('clickAnalyzeToStart')}</p>
                </div>
              ) : (
                insightsData?.return_risks?.slice(0, 10).map((item, index) => {
                  const riskColor = (item.risk_level === 'élevé' || item.risk_level === 'high') ? '#EF4444' : (item.risk_level === 'modéré' || item.risk_level === 'medium') ? '#F59E0B' : '#6B7280'
                  const riskBg = (item.risk_level === 'élevé' || item.risk_level === 'high') ? 'bg-red-50 border-red-200' : (item.risk_level === 'modéré' || item.risk_level === 'medium') ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'
                  const returnedOrders = Number(item?.returned_orders ?? item?.refunds ?? 0)
                  const returnedItems = Number(item?.returned_items ?? 0)
                  const orderRate = (item?.return_rate_orders ?? item?.refund_rate)
                  return (
                    <div key={item.product_id || index} className={`${riskBg} border rounded-lg p-5`}>
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex-1">
                          <p className="text-[#1A1A2E] font-bold text-base">{item.title || item.product_id}</p>
                          <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-[#6A6A85]">
                            {returnedOrders > 0 && <span>🔁 {returnedOrders} {t('returnedOrders')}</span>}
                            {returnedItems > 0 && <span>📦 {returnedItems} {t('refundedItems')}</span>}
                            {orderRate !== null && orderRate !== undefined && Number(orderRate) > 0 && (
                              <span>📊 {t('orderReturnRate')}: {Math.round(Number(orderRate) * 100)}%</span>
                            )}
                            {item.signals?.orders > 0 && <span>📦 {item.signals.orders} commande(s)</span>}
                            {item.signals?.price > 0 && <span>💰 {item.signals.price}$</span>}
                          </div>
                        </div>
                        <span
                          className="text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap"
                          style={{ backgroundColor: riskColor + '20', color: riskColor }}
                        >
                          {t('riskLevel')} {item.risk_level || t('notSpecified')} {item.risk_score ? `(${Math.round(item.risk_score)})` : ''}
                        </span>
                      </div>

                      {/* Raisons du risque */}
                      {Array.isArray(item.reasons) && item.reasons.length > 0 && (
                        <div className="mb-3">
                          <p className="text-xs font-semibold text-[#1A1A2E] mb-1">{t('riskSignals')}</p>
                          <ul className="text-xs text-[#6A6A85] space-y-0.5 pl-4 list-disc">
                            {item.reasons.map((r, i) => <li key={i}>{r}</li>)}
                          </ul>
                        </div>
                      )}

                      {/* Recommandations */}
                      {Array.isArray(item.recommendations) && item.recommendations.length > 0 && (
                        <div className="bg-white/60 rounded-md p-3">
                          <p className="text-xs font-semibold text-[#0D9488] mb-1">{t('recommendations')}</p>
                          <ul className="text-xs text-[#6A6A85] space-y-0.5 pl-4 list-disc">
                            {item.recommendations.map((r, i) => <li key={i}>{r}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}


        {/* AI Analysis Tab */}
        {activeTab === 'ai' && (
          <div className="bg-white rounded-lg p-6 border border-[#E8E8EE]">
            <h2 className="text-[#1A1A2E] text-xl font-bold mb-4">{t('analyzeWithAI')}</h2>
            
            {products && products.length > 0 ? (
              <div>
                <p className="text-[#6A6A85] mb-4">{products.length} {t('productsToAnalyze')}</p>
                <button
                  onClick={analyzeProducts}
                  disabled={loading}
                  className="bg-[#FF6B35] hover:bg-[#E85A28] text-white font-bold py-3 px-6 rounded-lg disabled:opacity-50"
                >
                  {loading ? t('analysisInProgress') : t('launchAIAnalysis')}
                </button>
                {renderStatus('analyze')}
              </div>
            ) : (
              <p className="text-[#6A6A85]">{t('loadProductsFirst')}</p>
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
                  <div className="bg-gradient-to-r from-teal-50 to-orange-50 border-2 border-[#2DD4BF]/40 rounded-lg p-6 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-[#1A1A2E] text-xl font-bold mb-2">{t('autoAIActions')}</h3>
                        <p className="text-[#0D9488] text-sm">{t('aiCanAutoApply')}</p>
                        {subscription?.plan === 'premium' && (
                          <p className="text-[#FF6B35] text-xs mt-1">Premium: Modifications automatiques sans limites</p>
                        )}
                      </div>
                      <button
                        onClick={prepareActionsForApply}
                        className="bg-[#FF6B35] hover:bg-[#E85A28] text-white font-bold py-3 px-6 rounded-lg shadow-lg transition flex items-center gap-2"
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
                <div className="bg-white rounded-lg p-6 border border-[#E8E8EE]">
                  <h2 className="text-[#1A1A2E] text-2xl font-bold mb-4">Vue d'ensemble de votre boutique</h2>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-[#EFF1F5] p-4 rounded-lg">
                      <p className="text-[#6A6A85] text-sm">{t('totalProducts')}</p>
                      <p className="text-[#1A1A2E] text-2xl font-bold">{analysisResults.overview?.total_products}</p>
                    </div>
                    <div className="bg-[#EFF1F5] p-4 rounded-lg">
                      <p className="text-[#6A6A85] text-sm">{t('published')}</p>
                      <p className="text-[#0D9488] text-2xl font-bold">{analysisResults.overview?.published}</p>
                    </div>
                    <div className="bg-[#EFF1F5] p-4 rounded-lg">
                      <p className="text-[#6A6A85] text-sm">{t('variants')}</p>
                      <p className="text-[#2DD4BF] text-2xl font-bold">{analysisResults.overview?.total_variants}</p>
                    </div>
                    <div className="bg-[#EFF1F5] p-4 rounded-lg">
                      <p className="text-[#6A6A85] text-sm">{t('averagePrice')}</p>
                      <p className="text-[#FF6B35] text-2xl font-bold">{analysisResults.overview?.price_range?.average?.toFixed(2)}$</p>
                    </div>
                  </div>
                  <div className="mt-4 bg-[#EFF1F5] p-4 rounded-lg">
                    <p className="text-[#6A6A85] text-sm">{t('catalogHealth')}</p>
                    <p className="text-[#1A1A2E] text-xl font-bold">{analysisResults.overview?.catalog_health}</p>
                  </div>
                </div>

                {/* Points critiques */}
                {analysisResults.critical_issues && analysisResults.critical_issues.length > 0 && (
                  <div className="bg-white border-2 border-[#E85A28] rounded-lg p-6">
                    <h2 className="text-[#1A1A2E] text-2xl font-bold mb-4">{t('criticalPointsNow')}</h2>
                    <div className="space-y-4">
                      {analysisResults.critical_issues.map((issue, idx) => (
                        <div key={idx} className="bg-[#F7F8FA] p-4 rounded-lg">
                          <div className="flex items-start gap-3">
                            <div className="flex-1">
                              <p className="text-[#FF6B35] font-bold text-sm mb-1">{t('severity')}: {issue.severity}</p>
                              <p className="text-[#1A1A2E] font-bold mb-2">{issue.issue}</p>
                              <p className="text-[#4A4A68] text-sm mb-2">{issue.impact}</p>
                              <div className="bg-white p-3 rounded mt-2">
                                <p className="text-[#1A1A2E] font-bold text-sm">{t('immediateAction')}:</p>
                                <p className="text-[#2A2A42] text-sm mt-1">{issue.action}</p>
                                {issue.affected_products && issue.affected_products.length > 0 && (
                                  <div className="mt-2 pt-2 border-t border-gray-200">
                                    <p className="text-[#6A6A85] text-xs font-semibold mb-1">{t('affectedProducts')}:</p>
                                    <div className="flex flex-wrap gap-1">
                                      {issue.affected_products.slice(0, 12).map((name, pidx) => (
                                        <span key={pidx} className="inline-block bg-[#FFF4F0] text-[#E85A28] text-xs px-2 py-0.5 rounded-full border border-[#FF6B35]/20">{name}</span>
                                      ))}
                                      {issue.affected_products.length > 12 && (
                                        <span className="text-[#6A6A85] text-xs">+{issue.affected_products.length - 12} {t('others')}</span>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions immédiates */}
                <div className="bg-gradient-to-r from-teal-50 to-orange-50 border-2 border-[#2DD4BF]/30 rounded-lg p-6">
                  <h2 className="text-[#1A1A2E] text-2xl font-bold mb-4">🎯 {t('actionsNow')}</h2>
                  <div className="space-y-4">
                    {analysisResults.immediate_actions?.map((action, idx) => (
                      <div key={idx} className="bg-teal-50/50 p-5 rounded-lg">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="bg-[#FF6B35] text-white font-bold px-3 py-1 rounded-full text-sm">{t('priority')} {action.priority}</span>
                          <h3 className="text-[#1A1A2E] font-bold text-lg">{action.action}</h3>
                        </div>
                        <div className="space-y-2 mb-3">
                          {action.steps?.map((step, sidx) => (
                            <p key={sidx} className="text-[#0D9488] pl-4">{step}</p>
                          ))}
                        </div>
                        <div className="flex gap-4 text-sm">
                          <span className="text-[#4A4A68]">{t('timeLabel')}: {action.time_required}</span>
                          <span className="text-[#FF6B35]">{t('impactLabel')}: {action.expected_impact}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recommandations stratégiques */}
                <div className="bg-white rounded-lg p-6 border border-[#E8E8EE]">
                  <h2 className="text-[#1A1A2E] text-2xl font-bold mb-4">🎯 {t('strategicRecommendations')}</h2>
                  <p className="text-[#6A6A85] mb-4">
                    {analysisResults.strategic_recommendations?.total_recommendations} {t('recommendationsFound')} 
                    ({analysisResults.strategic_recommendations?.high_priority} {t('highPriority')})
                  </p>
                  <div className="space-y-4">
                    {analysisResults.strategic_recommendations?.recommendations?.map((rec, idx) => (
                      <div key={idx} className="bg-[#EFF1F5] p-5 rounded-lg border-l-4 border-[#2DD4BF]">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`px-2 py-1 rounded text-xs font-bold ${
                            rec.priority === 'HAUTE' ? 'bg-[#E85A28]' : 
                            rec.priority === 'MOYENNE' ? 'bg-[#0D9488]' : 'bg-[#EFF1F5]'
                          }`}>
                            {rec.priority}
                          </span>
                          <span className="text-[#0D9488] font-bold">{rec.category}</span>
                        </div>
                        <h3 className="text-[#1A1A2E] font-bold mb-2">{rec.issue}</h3>
                        <p className="text-[#4A4A68] mb-3">{rec.recommendation}</p>
                        <div className="bg-white p-3 rounded">
                          <p className="text-[#0D9488] text-sm font-bold">💰 Impact attendu:</p>
                          <p className="text-[#0D9488] text-sm">{rec.impact}</p>
                        </div>
                        <div className="bg-teal-50 p-3 rounded mt-2">
                          <p className="text-[#0D9488] text-sm font-bold">Action:</p>
                          <p className="text-[#0D9488] text-sm">{rec.action}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Stratégie de prix */}
                <div className="bg-white rounded-lg p-6 border border-[#E8E8EE]">
                  <h2 className="text-[#1A1A2E] text-2xl font-bold mb-4">💰 Optimisation des prix</h2>
                  <div className="space-y-4">
                    <div className="bg-[#EFF1F5] p-4 rounded-lg">
                      <h3 className="text-[#1A1A2E] font-bold mb-2">{t('currentStrategy')}</h3>
                      <p className="text-[#4A4A68]">{analysisResults.pricing_strategy?.current_strategy}</p>
                    </div>
                    
                    <h3 className="text-[#1A1A2E] font-bold mt-4">{t('suggestedOptimizations')}</h3>
                    <div className="space-y-3">
                      {analysisResults.pricing_strategy?.optimizations?.map((opt, idx) => (
                        <div key={idx} className="bg-[#EFF1F5] p-4 rounded-lg">
                          <div className="flex justify-between items-start mb-2">
                            <p className="text-[#1A1A2E] font-bold">{opt.product}</p>
                            <span className="bg-[#0D9488] text-white px-3 py-1 rounded-full text-sm font-bold">
                              +{opt.increase}$
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-4 mb-2">
                            <div>
                              <p className="text-[#6A6A85] text-sm">Prix actuel</p>
                              <p className="text-[#1A1A2E] text-lg font-bold">{opt.current_price}$</p>
                            </div>
                            <div>
                              <p className="text-[#6A6A85] text-sm">{t('suggestedPrice')}</p>
                              <p className="text-[#0D9488] text-lg font-bold">{opt.suggested_price}$</p>
                            </div>
                          </div>
                          <p className="text-[#4A4A68] text-sm mb-2">{opt.reason}</p>
                          <p className="text-[#0D9488] text-sm font-bold">{opt.expected_impact}</p>
                        </div>
                      ))}
                    </div>

                    <h3 className="text-[#1A1A2E] font-bold mt-4">{t('pricingOpportunities')}:</h3>
                    <div className="space-y-3">
                      {analysisResults.pricing_strategy?.opportunities?.map((opp, idx) => (
                        <div key={idx} className="bg-teal-50 p-4 rounded-lg border border-[#2DD4BF]/20">
                          <h4 className="text-[#0D9488] font-bold mb-2">{opp.strategy}</h4>
                          <p className="text-[#4A4A68] text-sm mb-2">{opp.description}</p>
                          <p className="text-[#0D9488] text-sm font-bold">{opp.expected_impact}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Qualité du contenu */}
                <div className="bg-white rounded-lg p-6 border border-[#E8E8EE]">
                  <h2 className="text-[#1A1A2E] text-2xl font-bold mb-4">📝 {t('contentQuality')}</h2>
                  <div className="bg-[#EFF1F5] p-4 rounded-lg mb-4">
                    <p className="text-[#6A6A85] text-sm mb-2">Score global</p>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 bg-[#E8E8EE] rounded-full h-4">
                        <div 
                          className={`h-4 rounded-full ${
                            analysisResults.content_improvements?.overall_score >= 80 ? 'bg-[#0D9488]' :
                            analysisResults.content_improvements?.overall_score >= 60 ? 'bg-[#FF6B35]' : 'bg-[#E85A28]'
                          }`}
                          style={{width: `${analysisResults.content_improvements?.overall_score}%`}}
                        />
                      </div>
                      <span className="text-[#1A1A2E] font-bold text-xl">{analysisResults.content_improvements?.overall_score}/100</span>
                    </div>
                  </div>

                  {analysisResults.content_improvements?.issues_found?.length > 0 && (
                    <>
                      <h3 className="text-[#1A1A2E] font-bold mb-3">{t('detectedIssues')}:</h3>
                      <div className="space-y-3 mb-4">
                        {analysisResults.content_improvements.issues_found.map((issue, idx) => (
                          <div key={idx} className="bg-orange-50 p-4 rounded-lg border border-[#FF6B35]/20">
                            <div className="flex items-center gap-2 mb-2">
                              <span className={`px-2 py-1 rounded text-xs font-bold ${
                                issue.priority === 'CRITIQUE' ? 'bg-[#E85A28]' : 
                                issue.priority === 'HAUTE' ? 'bg-[#0D9488]' : 'bg-[#EFF1F5]'
                              }`}>
                                {issue.priority}
                              </span>
                              <p className="text-[#FF6B35] font-bold">{issue.issue}</p>
                            </div>
                            <p className="text-[#4A4A68] text-sm">💡 Solution: {issue.fix}</p>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  <h3 className="text-[#1A1A2E] font-bold mb-3">{t('quickWins')}:</h3>
                  <div className="space-y-3">
                    {analysisResults.content_improvements?.quick_wins?.map((win, idx) => (
                      <div key={idx} className="bg-[#F7F8FA] p-4 rounded-lg border border-[#E8E8EE]">
                        <p className="text-[#0D9488] font-bold mb-2">{win.action}</p>
                        {win.example && <p className="text-[#4A4A68] text-sm mb-2">Exemple: {win.example}</p>}
                        <p className="text-[#0D9488] text-sm">{win.impact}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Stratégies de vente */}
                <div className="bg-white rounded-lg p-6 border border-[#E8E8EE]">
                  <h2 className="text-[#1A1A2E] text-2xl font-bold mb-4">{t('upsellCrossSellStrategies')}</h2>
                  
                  {analysisResults.sales_strategies?.upsell_opportunities?.length > 0 && (
                    <>
                      <h3 className="text-[#1A1A2E] font-bold mb-3">{t('upsellOpportunities')}:</h3>
                      <div className="space-y-3 mb-6">
                        {analysisResults.sales_strategies.upsell_opportunities.map((upsell, idx) => (
                          <div key={idx} className="bg-[#F7F8FA] p-4 rounded-lg border border-[#E8E8EE]">
                            <h4 className="text-[#FF6B35] font-bold mb-2">{upsell.strategy}</h4>
                            <p className="text-[#4A4A68] text-sm mb-2">{upsell.description}</p>
                            {upsell.example && <p className="text-[#4A4A68] text-sm mb-2">{t('example')}: {upsell.example}</p>}
                            <p className="text-[#0D9488] text-sm font-bold">{upsell.expected_impact}</p>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {analysisResults.sales_strategies?.cross_sell_bundles?.length > 0 && (
                    <>
                      <h3 className="text-[#1A1A2E] font-bold mb-3">{t('suggestedBundles')}:</h3>
                      <div className="space-y-3 mb-6">
                        {analysisResults.sales_strategies.cross_sell_bundles.map((bundle, idx) => (
                          <div key={idx} className="bg-[#F7F8FA] p-4 rounded-lg border border-[#E8E8EE]">
                            <h4 className="text-[#FF6B35] font-bold mb-2">{bundle.bundle_name} (-{bundle.discount})</h4>
                            <div className="mb-2">
                              <p className="text-[#6A6A85] text-sm mb-1">{t('includedProducts')}:</p>
                              <ul className="list-disc list-inside text-[#4A4A68] text-sm">
                                {bundle.products?.map((p, pidx) => (
                                  <li key={pidx}>{p}</li>
                                ))}
                              </ul>
                            </div>
                            <p className="text-[#4A4A68] text-sm mb-2">{bundle.positioning}</p>
                            <p className="text-[#0D9488] text-sm font-bold">{bundle.expected_impact}</p>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  <h3 className="text-[#1A1A2E] font-bold mb-3">{t('psychologicalTriggers')}:</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {analysisResults.sales_strategies?.psychological_triggers?.map((trigger, idx) => (
                      <div key={idx} className="bg-[#EFF1F5] p-4 rounded-lg">
                        <p className="text-[#FF6B35] font-bold mb-2">{trigger.trigger}</p>
                        <p className="text-[#4A4A68] text-sm mb-2">{trigger.tactic}</p>
                        <p className="text-[#0D9488] text-sm font-bold">{trigger.impact}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Opportunités de croissance */}
                <div className="bg-gradient-to-r from-teal-50 to-orange-50 rounded-lg p-6 border border-[#2DD4BF]/30">
                  <h2 className="text-[#1A1A2E] text-2xl font-bold mb-4">{t('growthOpportunities')}</h2>
                  <div className="space-y-4">
                    {analysisResults.growth_opportunities?.map((opp, idx) => (
                      <div key={idx} className="bg-white p-5 rounded-lg border border-[#E8E8EE]">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-2xl">{opp.category.split(' ')[0]}</span>
                          <h3 className="text-[#1A1A2E] font-bold text-lg">{opp.opportunity}</h3>
                        </div>
                        <p className="text-[#2A2A42] mb-4">{opp.description}</p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                          <div className="bg-white p-3 rounded">
                            <p className="text-[#6A6A85] text-xs mb-1">{t('investment')}</p>
                            <p className="text-[#1A1A2E] font-bold">{opp.investment}</p>
                          </div>
                          <div className="bg-white p-3 rounded">
                            <p className="text-[#6A6A85] text-xs mb-1">{t('expectedReturn')}</p>
                            <p className="text-[#0D9488] font-bold">{opp.expected_return}</p>
                          </div>
                          <div className="bg-white p-3 rounded">
                            <p className="text-[#6A6A85] text-xs mb-1">{t('difficulty')}</p>
                            <p className="text-[#FF6B35] font-bold">{opp.difficulty}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recommandations par produit */}
                <div className="bg-white rounded-lg p-6 border border-[#E8E8EE]">
                  <h2 className="text-[#1A1A2E] text-2xl font-bold mb-4">{t('productRecommendationsTop10')}</h2>
                  <div className="space-y-4">
                    {analysisResults.product_recommendations?.map((rec, idx) => (
                      <div key={idx} className="bg-[#EFF1F5] p-5 rounded-lg">
                        <div className="flex items-center gap-3 mb-3">
                          <span className="bg-[#2DD4BF] text-white font-bold px-3 py-1 rounded-full">#{rec.rank}</span>
                          <h3 className="text-[#1A1A2E] font-bold text-lg">{rec.product_name}</h3>
                          <span className={`ml-auto px-2 py-1 rounded text-xs font-bold ${
                            rec.current_status === 'active' ? 'bg-[#0D9488]' : 'bg-[#FF6B35]'
                          }`}>
                            {rec.current_status}
                          </span>
                        </div>
                        {rec.recommendations?.length > 0 ? (
                          <div className="space-y-2">
                            {rec.recommendations.map((recItem, ridx) => (
                              <div key={ridx} className="bg-white p-3 rounded">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={`px-2 py-1 rounded text-xs font-bold ${
                                    recItem.priority === 'Critique' ? 'bg-[#E85A28]' :
                                    recItem.priority === 'Haute' ? 'bg-[#0D9488]' : 'bg-[#EFF1F5]'
                                  }`}>
                                    {recItem.priority}
                                  </span>
                                  <span className="text-[#0D9488] font-bold text-sm">{recItem.type}</span>
                                </div>
                                <p className="text-[#4A4A68] text-sm mb-1">{recItem.issue}</p>
                                <p className="text-[#0D9488] text-sm">{recItem.suggestion}</p>
                                <div className="mt-3 flex items-center gap-2">
                                  {['Titre', 'Description', 'Prix'].includes(recItem.type) ? (
                                    <button
                                      onClick={() => handleApplyRecommendation(rec.product_id, recItem.type)}
                                      disabled={subscription?.plan !== 'premium' || applyingRecommendationId === `${rec.product_id}-${recItem.type}`}
                                      className="bg-[#FF6B35] hover:bg-[#E85A28] disabled:opacity-50 text-white text-xs font-semibold px-3 py-1 rounded"
                                    >
                                      {applyingRecommendationId === `${rec.product_id}-${recItem.type}` ? 'Application...' : 'Faire modification'}
                                    </button>
                                  ) : (
                                    <button
                                      disabled
                                      className="bg-[#E8E8EE] text-[#6A6A85] text-xs font-semibold px-3 py-1 rounded opacity-70"
                                    >
                                      {t('modificationUnavailable')}
                                    </button>
                                  )}
                                  {subscription?.plan !== 'premium' && (
                                    <span className="text-xs text-[#FF6B35]">{t('premiumRequired')}</span>
                                  )}
                                </div>
                                {renderStatus(`rec-${rec.product_id}-${recItem.type}`)}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[#0D9488]">{t('noCriticalImprovement')}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bouton retour */}
                <div className="flex justify-center">
                  <button
                    onClick={() => setActiveTab('ai')}
                    className="bg-[#FF6B35] hover:bg-[#E85A28] text-white font-bold py-3 px-8 rounded-lg"
                  >
                    🔄 Lancer une nouvelle analyse
                  </button>
                </div>
              </>
            ) : (
              <div className="bg-white rounded-lg p-6 border border-[#E8E8EE] text-center">
                <p className="text-[#6A6A85] mb-4">{t('noAnalysisAvailable')}</p>
                <button
                  onClick={() => setActiveTab('ai')}
                  className="bg-[#FF6B35] hover:bg-[#E85A28] text-white font-bold py-3 px-6 rounded-lg"
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
          <div className="bg-[#F7F8FA] rounded-xl max-w-3xl w-full max-h-[80vh] overflow-hidden border border-[#2DD4BF] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="bg-gradient-to-r from-[#0D9488] to-[#2DD4BF] p-6 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Confirmer les modifications
              </h2>
              <button
                onClick={() => !applyingActions && setShowApplyModal(false)}
                disabled={applyingActions}
                className="text-[#6A6A85] hover:bg-[#EFF1F5] p-2 rounded-lg disabled:opacity-50"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(80vh-200px)]">
              <div className="bg-[#FFF4F0] border border-[#FF6B35] rounded-lg p-4 mb-6">
                <p className="text-[#FF6B35] font-bold mb-2">Attention</p>
                <p className="text-[#FF8B60] text-sm">{t('aiWillModify').replace('{n}', selectedActions.length)}</p>
              </div>

              <h3 className="text-[#1A1A2E] font-bold mb-4 text-lg">{t('modificationsToApply')}:</h3>
              
              <div className="space-y-3">
                {selectedActions.map((action, idx) => (
                  <div key={idx} className="bg-white p-4 rounded-lg border border-[#E8E8EE]">
                    <div className="flex items-start gap-3">
                      <div className={`mt-1 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                        action.type === 'price' ? 'bg-[#0D9488]' :
                        action.type === 'titre' ? 'bg-[#2DD4BF]' : 'bg-[#FF6B35]'
                      }`}>
                        {action.type === 'price' ? '💰' : action.type === 'titre' ? '📝' : '📄'}
                      </div>
                      <div className="flex-1">
                        <p className="text-[#1A1A2E] font-bold mb-1">{action.product}</p>
                        {action.type === 'price' && (
                          <>
                            <p className="text-[#4A4A68] text-sm mb-2">{action.reason}</p>
                            <div className="flex items-center gap-4 text-sm">
                              <span className="text-[#1A1A2E]">Prix actuel: {action.current}$</span>
                              <span className="text-[#8A8AA3]">→</span>
                              <span className="text-[#0D9488] font-bold">{t('newPrice')}: {action.new}$</span>
                            </div>
                          </>
                        )}
                        {(action.type === 'titre' || action.type === 'description') && (
                          <>
                            <div className="flex items-center gap-2 mb-2">
                              <span className={`px-2 py-1 rounded text-xs font-bold ${
                                action.priority === 'Critique' ? 'bg-[#E85A28]' :
                                action.priority === 'Haute' ? 'bg-[#0D9488]' : 'bg-[#EFF1F5]'
                              }`}>
                                {action.priority}
                              </span>
                              <span className="text-[#0D9488] text-sm font-bold">{action.type.toUpperCase()}</span>
                            </div>
                            <p className="text-[#6A6A85] text-sm mb-1">{t('problem')}: {action.issue}</p>
                            <p className="text-[#0D9488] text-sm">Solution: {action.suggestion}</p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {selectedActions.length === 0 && (
                <div className="text-center text-[#6A6A85] py-8">
                  <p>{t('noAutoActions')}</p>
                  <p className="text-sm mt-2">Lance une nouvelle analyse pour obtenir des recommandations.</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="bg-white border-t border-[#E8E8EE] p-6 flex justify-between items-center">
              <button
                onClick={() => setShowApplyModal(false)}
                disabled={applyingActions}
                className="text-[#6A6A85] hover:text-[#1A1A2E] px-6 py-2 rounded-lg transition disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={handleApplyActions}
                disabled={applyingActions || selectedActions.length === 0}
                className="bg-[#FF6B35] hover:bg-[#E85A28] text-white font-bold py-3 px-8 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-2 sm:p-4" onClick={() => setShowSettingsModal(false)}>
          <div className="bg-[#F7F8FA] rounded-xl w-full max-w-4xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden border border-[#E8E8EE] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="bg-white border-b border-[#E8E8EE] p-4 sm:p-6 flex justify-between items-center">
              <h2 className="text-xl sm:text-2xl font-bold text-[#1A1A2E]">{t('accountSettings')}</h2>
              <button onClick={() => setShowSettingsModal(false)} className="text-[#6A6A85] hover:bg-[#EFF1F5] p-2 rounded-lg">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex flex-col md:flex-row h-[calc(95vh-120px)] sm:h-[calc(90vh-120px)]">
              {/* Sidebar - horizontal on mobile, vertical on desktop */}
              <div className="md:w-64 bg-white md:border-r border-b md:border-b-0 border-[#E8E8EE] p-2 md:p-4 overflow-x-auto md:overflow-x-visible shrink-0">
                <nav className="flex md:flex-col md:space-y-1 gap-1 md:gap-0 min-w-max md:min-w-0">
                  {['profile', 'security', 'interface', 'notifications', 'shopify', 'billing', 'api'].map(tab => (
                    <button
                      key={tab}
                      onClick={() => setSettingsTab(tab)}
                      className={`whitespace-nowrap text-left px-3 md:px-4 py-2 rounded-lg transition text-sm md:text-base ${
                        settingsTab === tab ? 'bg-[#0D9488] text-white' : 'text-[#4A4A68] hover:bg-[#EFF1F5]'
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
              <div className="flex-1 p-6 overflow-y-auto bg-[#F7F8FA]">
                {settingsTab === 'profile' && (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-xl font-bold text-[#1A1A2E] mb-4">{t('profileInformation')}</h3>
                      <div className="flex items-center gap-6 mb-6">
                        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#2DD4BF] to-[#FF6B35] flex items-center justify-center font-bold text-3xl shadow-lg overflow-hidden">
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
                          className="bg-[#0D9488] hover:bg-[#0F766E] disabled:opacity-50 px-4 py-2 rounded-lg text-white font-semibold"
                        >
                          {avatarUploading ? t('saving') : t('uploadPhoto')}
                        </button>
                      </div>
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm text-[#6A6A85] mb-2">{t('firstName')}</label>
                            <input type="text" value={profileFirstName} onChange={(e) => setProfileFirstName(e.target.value)} autoComplete="off" className="w-full bg-white border border-[#E8E8EE] rounded-lg px-4 py-2 text-[#1A1A2E]" />
                          </div>
                          <div>
                            <label className="block text-sm text-[#6A6A85] mb-2">{t('lastName')}</label>
                            <input type="text" value={profileLastName} onChange={(e) => setProfileLastName(e.target.value)} autoComplete="off" className="w-full bg-white border border-[#E8E8EE] rounded-lg px-4 py-2 text-[#1A1A2E]" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm text-[#6A6A85] mb-2">{t('username')}</label>
                          <input type="text" defaultValue={profile?.username} disabled className="w-full bg-[#EFF1F5] border border-[#D8D8E2] rounded-lg px-4 py-2 text-[#6A6A85] cursor-not-allowed" />
                          <p className="text-xs text-[#8A8AA3] mt-1">{t('usernameCannotChange')}</p>
                        </div>
                        <div>
                          <label className="block text-sm text-[#6A6A85] mb-2">{t('email')}</label>
                          <input type="email" defaultValue={user?.email} disabled className="w-full bg-[#EFF1F5] border border-[#D8D8E2] rounded-lg px-4 py-2 text-[#6A6A85] cursor-not-allowed" />
                        </div>
                        <button onClick={handleSaveProfile} disabled={saveLoading} className="bg-[#0D9488] hover:bg-[#0F766E] disabled:opacity-50 px-6 py-2 rounded-lg text-white font-semibold">
                          {saveLoading ? t('saving') : t('saveChanges')}
                        </button>
                        {renderStatus('profile')}
                      </div>
                    </div>
                  </div>
                )}

                {settingsTab === 'security' && (
                  <div className="space-y-6">
                    <h3 className="text-xl font-bold text-[#1A1A2E] mb-4">{t('securitySettings')}</h3>
                    <div className="bg-white rounded-lg p-6 border border-[#E8E8EE]">
                      <h4 className="text-lg font-semibold text-[#1A1A2E] mb-4">{t('changePassword')}</h4>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm text-[#6A6A85] mb-2">{t('currentPassword')}</label>
                          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="off" className="w-full bg-[#EFF1F5] border border-[#D8D8E2] rounded-lg px-4 py-2 text-[#1A1A2E]" />
                        </div>
                        <div>
                          <label className="block text-sm text-[#6A6A85] mb-2">{t('newPassword')}</label>
                          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" className="w-full bg-[#EFF1F5] border border-[#D8D8E2] rounded-lg px-4 py-2 text-[#1A1A2E]" />
                        </div>
                        <div>
                          <label className="block text-sm text-[#6A6A85] mb-2">{t('confirmNewPassword')}</label>
                          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" className="w-full bg-[#EFF1F5] border border-[#D8D8E2] rounded-lg px-4 py-2 text-[#1A1A2E]" />
                        </div>
                        <button onClick={handleUpdatePassword} disabled={saveLoading} className="bg-[#0D9488] hover:bg-[#0F766E] disabled:opacity-50 px-6 py-2 rounded-lg text-white font-semibold">
                          {saveLoading ? t('updating') : t('updatePassword')}
                        </button>
                        {renderStatus('password')}
                      </div>
                    </div>
                    <div className="bg-white rounded-lg p-6 border border-[#E8E8EE]">
                      <h4 className="text-lg font-semibold text-[#1A1A2E] mb-2">{t('twoFactorAuth')}</h4>
                      <p className="text-[#6A6A85] mb-4">{t('twoFactorDesc')}</p>
                      <button onClick={handleToggle2FA} disabled={saveLoading} className={`${twoFAEnabled ? 'bg-[#EFF1F5] hover:bg-[#E8E8EE]' : 'bg-[#0D9488] hover:bg-[#0F766E]'} disabled:opacity-50 px-6 py-2 rounded-lg text-white font-semibold`}>
                        {saveLoading ? '...' : (twoFAEnabled ? t('disable2FA') : t('enable2FA'))}
                      </button>
                      {twoFAEnabled && <p className="text-[#0D9488] text-sm mt-2">{t('twoFAEnabled')}</p>}
                      {renderStatus('2fa')}
                    </div>
                  </div>
                )}

                {settingsTab === 'interface' && (
                  <div className="space-y-6">
                    <h3 className="text-xl font-bold text-[#1A1A2E] mb-4">{t('interfacePreferences')}</h3>
                    <div className="space-y-4">
                      <div className="bg-white rounded-lg p-4 border border-[#E8E8EE]">
                        <h4 className="text-[#1A1A2E] font-semibold mb-2">{t('language')}</h4>
                        <select value={interfaceLanguageDraft} onChange={(e) => setInterfaceLanguageDraft(e.target.value)} className="w-full bg-[#EFF1F5] border border-[#D8D8E2] rounded-lg px-4 py-2 text-[#1A1A2E]">
                          {LANGUAGES.map(l => (
                            <option key={l.code} value={l.code}>{l.flag} {l.name}</option>
                          ))}
                        </select>
                      </div>
                      <button onClick={handleSaveInterface} disabled={saveLoading} className="bg-[#0D9488] hover:bg-[#0F766E] disabled:opacity-50 px-6 py-2 rounded-lg text-white font-semibold w-full">
                        {saveLoading ? t('saving') : t('saveInterface')}
                      </button>
                      {renderStatus('interface')}
                    </div>
                  </div>
                )}

                {settingsTab === 'shopify' && (
                  <div className="space-y-6">
                    <h3 className="text-xl font-bold text-[#1A1A2E] mb-4">{t('shopifyConnection')}</h3>

                    {/* ── Shop Limit Banner ── */}
                    <div className="flex items-center gap-2 text-sm text-[#6A6A85] bg-[#F7F8FA] border border-[#E8E8EE] rounded-lg px-4 py-2">
                      <span>🏪</span>
                      <span>
                        {shopList.length} {t('shopsConnected')}
                        {shopLimit !== null ? ` / ${shopLimit} max` : ` (${t('unlimited')})`}
                      </span>
                    </div>

                    {/* ── Connected Shops List ── */}
                    {shopList.length > 0 && (
                      <div className="bg-white rounded-lg border border-[#E8E8EE] divide-y divide-[#E8E8EE]">
                        {shopList.map((shop) => (
                          <div key={shop.shop_domain} className={`flex items-center justify-between px-5 py-4 ${shop.is_active ? 'bg-teal-50/40' : ''}`}>
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${shop.is_active ? 'bg-[#0D9488]' : 'bg-[#D8D8E2]'}`} />
                              <div className="min-w-0">
                                <p className="text-[#1A1A2E] font-semibold truncate">{shop.shop_domain}</p>
                                <p className="text-xs text-[#8A8AA3]">
                                  {shop.is_active ? '✅ ' + t('activeShop') : t('inactive')}
                                  {shop.updated_at && ` · ${t('updatedAt')} ${new Date(shop.updated_at).toLocaleDateString()}`}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                              {!shop.is_active && (
                                <button
                                  onClick={() => switchShop(shop.shop_domain)}
                                  disabled={switchingShop}
                                  className="text-xs bg-[#0D9488] hover:bg-[#0F766E] text-white px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50"
                                >
                                  {switchingShop ? '...' : 'Activer'}
                                </button>
                              )}
                              <button
                                onClick={() => deleteShop(shop.shop_domain)}
                                className="text-xs bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-lg font-semibold"
                              >
                                Supprimer
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* ── Add New Shop (if no shops yet, show inline; else toggle) ── */}
                    {shopList.length === 0 ? (
                      <div className="bg-white rounded-lg p-6 border border-[#E8E8EE] max-w-2xl space-y-5">
                        <p className="text-[#6A6A85] text-sm">{t('connectFirstShop')}</p>

                        {/* ── OAuth Connect (recommended) ── */}
                        <div className="space-y-3">
                          <label className="block text-[#1A1A2E] text-sm font-semibold">Nom de votre boutique</label>
                          <input
                            type="text"
                            placeholder="ma-boutique.myshopify.com"
                            value={oauthShopInput}
                            onChange={(e) => setOauthShopInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && startShopifyOAuth()}
                            className="w-full bg-[#EFF1F5] text-[#1A1A2E] px-4 py-2.5 rounded-lg border border-[#D8D8E2]"
                          />
                          <button
                            onClick={() => startShopifyOAuth()}
                            className="w-full bg-[#96BF48] hover:bg-[#7FA83D] text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 shadow-sm"
                          >
                            Connecter avec Shopify
                          </button>
                          <p className="text-xs text-[#8A8AA3] text-center">{t('secureOAuthConnection')} copier.</p>
                        </div>

                        {/* ── Manual fallback (advanced) ── */}
                        <div className="border-t border-[#E8E8EE] pt-4">
                          <button
                            onClick={() => setShowManualConnect(!showManualConnect)}
                            className="text-xs text-[#8A8AA3] hover:text-[#6A6A85] underline"
                          >
                            {showManualConnect ? t('hideManualConnect') : '⚙️ ' + t('manualConnectAdvanced')}
                          </button>
                          {showManualConnect && (
                            <div className="mt-3 space-y-3">
                              <div>
                                <label className="block text-[#6A6A85] text-sm mb-2">URL de boutique</label>
                                <input
                                  type="text"
                                  placeholder="ma-boutique.myshopify.com"
                                  value={shopifyUrl}
                                  onChange={(e) => setShopifyUrl(e.target.value)}
                                  className="w-full bg-[#EFF1F5] text-[#1A1A2E] px-4 py-2 rounded-lg border border-[#D8D8E2]"
                                />
                              </div>
                              <div>
                                <label className="block text-[#6A6A85] text-sm mb-2">{t('accessToken')}</label>
                                <input
                                  type="password"
                                  placeholder="shpat_..."
                                  value={shopifyToken}
                                  onChange={(e) => setShopifyToken(e.target.value)}
                                  className="w-full bg-[#EFF1F5] text-[#1A1A2E] px-4 py-2 rounded-lg border border-[#D8D8E2]"
                                />
                                <p className="text-xs text-[#8A8AA3] mt-2">Scopes requis: read_products, write_products, read_orders, read_customers, read_analytics.</p>
                              </div>
                              <button onClick={connectShopify} className="w-full bg-[#FF6B35] hover:bg-[#E85A28] text-white font-bold py-2 px-4 rounded-lg">
                                Connecter manuellement
                              </button>
                            </div>
                          )}
                        </div>
                        {renderStatus('shopify')}
                      </div>
                    ) : (
                      <div className="max-w-2xl">
                        {!showAddShop ? (
                          <button
                            onClick={() => {
                              if (shopLimit !== null && shopList.length >= shopLimit) {
                                setStatus('shopify', 'warning', `${t('shopLimitReached')} (${shopLimit}).`)
                              } else {
                                setShowAddShop(true)
                              }
                            }}
                            className="w-full bg-[#EFF1F5] hover:bg-[#E8E8EE] text-[#1A1A2E] font-semibold py-3 px-4 rounded-lg border border-dashed border-[#D8D8E2] flex items-center justify-center gap-2"
                          >
                            <span className="text-lg">+</span> Ajouter une boutique
                          </button>
                        ) : (
                          <div className="bg-white rounded-lg p-6 border border-[#E8E8EE] space-y-4">
                            <div className="flex items-center justify-between">
                              <h4 className="font-semibold text-[#1A1A2E]">Ajouter une boutique</h4>
                              <button onClick={() => setShowAddShop(false)} className="text-[#8A8AA3] hover:text-[#1A1A2E] text-sm">✕ {t('cancel')}</button>
                            </div>
                            {/* OAuth for adding new shops */}
                            <div className="space-y-3">
                              <label className="block text-[#6A6A85] text-sm mb-1">Nom de la boutique</label>
                              <input
                                type="text"
                                placeholder="autre-boutique.myshopify.com"
                                value={oauthShopInput}
                                onChange={(e) => setOauthShopInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && startShopifyOAuth()}
                                className="w-full bg-[#EFF1F5] text-[#1A1A2E] px-4 py-2.5 rounded-lg border border-[#D8D8E2]"
                              />
                              <button
                                onClick={() => startShopifyOAuth()}
                                className="w-full bg-[#96BF48] hover:bg-[#7FA83D] text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 shadow-sm"
                              >
                                Connecter avec Shopify
                              </button>
                              <p className="text-xs text-[#8A8AA3] text-center">{t('secureOAuthConnection')}</p>
                            </div>
                            {/* Manual fallback for adding shops */}
                            <div className="border-t border-[#E8E8EE] pt-3">
                              <button
                                onClick={() => setShowManualConnect(!showManualConnect)}
                                className="text-xs text-[#8A8AA3] hover:text-[#6A6A85] underline"
                              >
                                {showManualConnect ? t('hide') : '⚙️ ' + t('manualConnectAdvanced')}
                              </button>
                              {showManualConnect && (
                                <div className="mt-3 space-y-3">
                                  <div>
                                    <label className="block text-[#6A6A85] text-sm mb-2">URL de boutique</label>
                                    <input
                                      type="text"
                                      placeholder="ma-boutique.myshopify.com"
                                      value={newShopUrl}
                                      onChange={(e) => setNewShopUrl(e.target.value)}
                                      className="w-full bg-[#EFF1F5] text-[#1A1A2E] px-4 py-2 rounded-lg border border-[#D8D8E2]"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[#6A6A85] text-sm mb-2">{t('accessToken')}</label>
                                    <input
                                      type="password"
                                      placeholder="shpat_..."
                                      value={newShopToken}
                                      onChange={(e) => setNewShopToken(e.target.value)}
                                      className="w-full bg-[#EFF1F5] text-[#1A1A2E] px-4 py-2 rounded-lg border border-[#D8D8E2]"
                                    />
                                  </div>
                                  <button onClick={connectNewShop} disabled={loading} className="w-full bg-[#FF6B35] hover:bg-[#E85A28] text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50">
                                    {loading ? 'Connexion...' : 'Connecter manuellement'}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        {renderStatus('shopify')}

                        {/* Reconnect active shop via OAuth */}
                        {shopifyConnected && (
                          <div className="mt-4 space-y-2">
                            <button
                              onClick={() => startShopifyOAuth(shopifyUrl)}
                              className="w-full bg-[#EFF1F5] hover:bg-[#E8E8EE] text-[#1A1A2E] font-semibold py-2 px-4 rounded-lg text-sm flex items-center justify-center gap-2"
                            >
                              🔄 Reconnecter {shopifyUrl} via OAuth
                            </button>
                            <button
                              onClick={() => setShowShopifyToken((prev) => !prev)}
                              className="w-full bg-transparent hover:bg-[#EFF1F5] text-[#8A8AA3] py-1.5 px-4 rounded-lg text-xs"
                            >
                              {showShopifyToken ? t('hide') : `⚙️ ${t('updateTokenManually')}`}
                            </button>
                            {showShopifyToken && (
                              <div className="mt-2 space-y-3 bg-white rounded-lg p-4 border border-[#E8E8EE]">
                                <input
                                  type="password"
                                  placeholder="shpat_..."
                                  value={shopifyToken}
                                  onChange={(e) => setShopifyToken(e.target.value)}
                                  className="w-full bg-[#EFF1F5] text-[#1A1A2E] px-4 py-2 rounded-lg border border-[#D8D8E2]"
                                />
                                <button onClick={connectShopify} className="w-full bg-[#FF6B35] hover:bg-[#E85A28] text-white font-bold py-2 px-4 rounded-lg">
                                  {t('update')}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {settingsTab === 'notifications' && (
                  <div className="space-y-6">
                    <h3 className="text-xl font-bold text-[#1A1A2E] mb-4">{t('notificationPreferences')}</h3>
                    <div className="space-y-4">
                      {[
                        { key: 'email_notifications', label: t('emailNotifications') },
                        { key: 'analysis_complete', label: t('analysisComplete') },
                        { key: 'weekly_reports', label: t('weeklyReports') },
                        { key: 'billing_updates', label: t('billingUpdates') }
                      ].map(item => (
                        <div key={item.key} className="bg-white rounded-lg p-4 border border-[#E8E8EE] flex justify-between items-center">
                          <span className="text-[#1A1A2E]">{item.label}</span>
                          <button onClick={() => setNotifications(prev => ({...prev, [item.key]: !prev[item.key]}))} className={`${notifications[item.key] ? 'bg-[#0D9488]' : 'bg-[#E8E8EE]'} w-12 h-6 rounded-full p-1 cursor-pointer transition`}>
                            <div className={`${notifications[item.key] ? 'bg-white ml-auto' : 'bg-white'} w-4 h-4 rounded-full transition`}></div>
                          </button>
                        </div>
                      ))}
                      <button onClick={handleSaveNotifications} disabled={saveLoading} className="bg-[#0D9488] hover:bg-[#0F766E] disabled:opacity-50 px-6 py-2 rounded-lg text-white font-semibold w-full mt-4">
                        {saveLoading ? t('saving') : t('saveNotifications')}
                      </button>
                      {renderStatus('notifications')}
                    </div>
                  </div>
                )}

                {settingsTab === 'billing' && (
                  <div className="space-y-6">
                    <h3 className="text-xl font-bold text-[#1A1A2E] mb-4">{t('billingAndSubscription')}</h3>
                    {subscription?.has_subscription && subscription?.plan ? (
                      <>
                    <div className="bg-white rounded-lg p-4 sm:p-6 border border-[#E8E8EE]">
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-4 sm:mb-6">
                        <div>
                          <h4 className="text-lg sm:text-xl font-bold text-[#1A1A2E]">{formatPlan(subscription?.plan)} Plan</h4>
                          {subscription?.started_at && new Date(subscription.started_at).getFullYear() > 1970 && (
                            <p className="text-[#6A6A85] text-sm mt-1">{t('activeSince')} {new Date(subscription.started_at).toLocaleDateString()}</p>
                          )}
                          {subscription?.upcoming_plan && (
                            <p className="text-[#0D9488] text-sm mt-1 font-semibold">
                              {tr('upcomingPlan', 'Upcoming plan')}: {formatPlan(subscription.upcoming_plan)}
                              {subscription?.upcoming_plan_effective_at ? ` (${new Date(subscription.upcoming_plan_effective_at).toLocaleDateString()})` : ''}
                            </p>
                          )}
                        </div>
                        <div className="sm:text-right">
                          <div className="text-xl sm:text-2xl font-bold text-[#0D9488]">
                            ${subscription?.plan === 'standard' ? '99' : subscription?.plan === 'pro' ? '199' : '299'}/mo
                          </div>
                        </div>
                      </div>

                      {/* Inline plan switch buttons — with confirmation */}
                      <div className="mb-4">
                        <p className="text-sm font-semibold text-[#1A1A2E] mb-2">{tr('changeYourPlan', 'Change Your Plan')}</p>
                        {pendingPlanConfirm ? (
                          <div className="bg-[#FFF7ED] border border-[#FF6B35]/30 rounded-lg p-4 mb-2">
                            <p className="text-sm text-[#1A1A2E] mb-1">{tr('youAreAboutToSwitch', 'You Are About to Switch To:')}</p>
                            <p className="text-lg font-bold text-[#FF6B35]">{pendingPlanConfirm.plan.toUpperCase()} — ${pendingPlanConfirm.price}/mo</p>
                            <p className="text-xs text-[#6A6A85] mt-1 mb-3">
                              {subscription?.current_period_end
                                ? `${tr('planChangeEffectiveOn', 'The change will take effect on your next renewal date')}: ${new Date(subscription.current_period_end).toLocaleDateString()}.`
                                : tr('planChangeEffectiveAtNextRenewal', 'The change will take effect at your next renewal date.')}
                            </p>
                            <div className="flex gap-2">
                              <button onClick={() => { setPendingPlanConfirm(null); clearStatus('change-plan') }} disabled={changePlanLoading} className="flex-1 px-3 py-2 rounded-lg border border-[#E8E8EE] text-[#6A6A85] hover:bg-[#EFF1F5] disabled:opacity-50 text-sm">{tr('cancel', 'Cancel')}</button>
                              <button onClick={async () => { await handleChangePlan(pendingPlanConfirm.plan); const s = statusByKey['change-plan']; if (s?.type === 'success' || s?.type === 'info') setPendingPlanConfirm(null) }} disabled={changePlanLoading} className="flex-1 px-3 py-2 rounded-lg bg-[#FF6B35] hover:bg-[#E85A28] text-white font-semibold disabled:opacity-50 text-sm">{changePlanLoading ? '...' : tr('confirmSwitch', 'Confirm & Switch')}</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col sm:flex-row gap-2">
                            {['standard', 'pro', 'premium'].filter(p => p !== subscription?.plan).map(targetPlan => (
                              <button
                                key={targetPlan}
                                onClick={() => { clearStatus('change-plan'); setPendingPlanConfirm({ plan: targetPlan, price: targetPlan === 'standard' ? '99' : targetPlan === 'pro' ? '199' : '299' }) }}
                                disabled={changePlanLoading}
                                className="flex-1 px-4 py-3 rounded-lg border border-[#E8E8EE] bg-[#EFF1F5] hover:bg-[#E8E8EE] text-[#1A1A2E] disabled:opacity-50 transition text-left"
                              >
                                <div className="font-semibold text-sm">{formatPlan(targetPlan)}</div>
                                <div className="text-xs text-[#6A6A85]">
                                  ${targetPlan === 'standard' ? '99' : targetPlan === 'pro' ? '199' : '299'}/{t('month') || 'mo'}
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                        {renderStatus('change-plan')}
                      </div>

                      <div className="border-t border-[#E8E8EE] pt-4">
                        <p className="text-sm text-[#6A6A85] mb-4">{t('manageBillingDesc')}</p>
                        <button onClick={handleManageBilling} disabled={saveLoading} className="bg-[#0D9488] hover:bg-[#0F766E] disabled:opacity-50 px-6 py-3 rounded-lg text-white font-semibold w-full">
                          {saveLoading ? '...' : t('manageBilling')}
                        </button>
                        {renderStatus('billing')}
                      </div>
                    </div>
                      </>
                    ) : (
                      <div className="bg-white rounded-lg p-6 border border-[#E8E8EE] text-center">
                        <p className="text-[#6A6A85] mb-4">{t('noActiveSubscription')}</p>
                        <button onClick={() => { clearStatus('change-plan'); setPendingPlanConfirm(null); setShowSettingsModal(false); setShowPlanMenu(true) }} className="bg-[#FF6B35] hover:bg-[#E85A28] px-6 py-3 rounded-lg text-white font-semibold">
                          {t('subscribeToPlan')}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {settingsTab === 'api' && (
                  <div className="space-y-6">
                    <h3 className="text-xl font-bold text-[#1A1A2E] mb-4">{t('apiKeys')}</h3>
                    <div className="bg-orange-50 border border-[#E85A28]/40 rounded-lg p-4 mb-4">
                      <p className="text-[#FF6B35] text-sm">{t('apiWarning')}</p>
                    </div>
                    {apiLoading && <div className="text-[#6A6A85]">Chargement...</div>}
                    {!apiLoading && apiKeys.length === 0 && (
                      <div className="text-[#6A6A85]">{t('noApiKeyAvailable')}</div>
                    )}
                    <div className="space-y-4">
                      {apiKeys.map((keyItem) => (
                        <div key={keyItem.id} className="bg-white rounded-lg p-6 border border-[#E8E8EE]">
                          <div className="flex justify-between items-center mb-4">
                            <div>
                              <h4 className="text-[#1A1A2E] font-semibold">{keyItem.name || t('productionApiKey')}</h4>
                              <p className="text-sm text-[#6A6A85]">{t('createdOn')} {new Date(keyItem.created_at).toLocaleDateString()}</p>
                            </div>
                            <button
                              onClick={() => handleRevokeApiKey(keyItem.id)}
                              disabled={keyItem.revoked || apiLoading}
                              className="bg-[#EFF1F5] hover:bg-[#E8E8EE] disabled:opacity-50 px-4 py-2 rounded-lg text-[#1A1A2E] text-sm"
                            >
                              {keyItem.revoked ? t('revoked') : t('revoke')}
                            </button>
                          </div>
                          {pendingRevokeKeyId === keyItem.id && !keyItem.revoked && (
                            <div className="flex gap-2 mb-4">
                              <button
                                onClick={() => handleRevokeApiKey(keyItem.id)}
                                disabled={apiLoading}
                                className="bg-[#EFF1F5] hover:bg-[#E8E8EE] disabled:opacity-50 px-4 py-2 rounded-lg text-[#1A1A2E] text-sm"
                              >
                                Confirmer
                              </button>
                              <button
                                onClick={() => setPendingRevokeKeyId(null)}
                                className="bg-[#EFF1F5] hover:bg-[#E8E8EE] px-4 py-2 rounded-lg text-[#1A1A2E] text-sm"
                              >
                                Annuler
                              </button>
                            </div>
                          )}
                          <div className="bg-[#EFF1F5] rounded p-3 font-mono text-sm text-[#4A4A68]">
                            {keyItem.key_prefix}••••{keyItem.key_last4}
                          </div>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={handleGenerateApiKey}
                      disabled={apiLoading}
                      className="bg-[#0D9488] hover:bg-[#0F766E] disabled:opacity-50 px-6 py-2 rounded-lg text-white font-semibold"
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
            title={t('aiAssistant')}
          >
            <div className="relative w-14 h-14 rounded-full bg-gradient-to-br from-[#FF6B35] to-[#0D9488] shadow-2xl shadow-[#FF6B35]/30 flex items-center justify-center border-2 border-[#2DD4BF]/40 transition-all duration-200 group-hover:scale-110 group-hover:shadow-[#FF6B35]/50">
              <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="13" r="8" fill="#0b0d12" opacity="0.85"/>
                <circle cx="12" cy="12" r="2" fill="#2DD4BF"/>
                <circle cx="20" cy="12" r="2" fill="#2DD4BF"/>
                <path d="M11 17 Q16 21 21 17" stroke="#2DD4BF" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                <circle cx="8" cy="8" r="1.5" fill="#2DD4BF" opacity="0.7"/>
                <circle cx="24" cy="8" r="1.5" fill="#2DD4BF" opacity="0.7"/>
              </svg>
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-[#0D9488] rounded-full border-2 border-white"></span>
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
                className={`fixed z-50 flex flex-col bg-white border-l border-[#E8E8EE] shadow-2xl transition-all duration-300 ease-in-out ${
                  chatExpanded
                    ? 'inset-0 rounded-none'
                    : 'top-0 right-0 bottom-0 w-full sm:w-[420px] md:w-[460px] rounded-l-2xl'
                }`}
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                {/* ── Header ── */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#E8E8EE]">
                  <div className="relative" ref={conversationMenuRef}>
                    <button
                      onClick={() => setShowConversationMenu(!showConversationMenu)}
                      className="flex items-center gap-1.5 text-sm text-[#2A2A42] hover:text-[#1A1A2E] font-medium transition-colors"
                    >
                      <span className="truncate max-w-[180px]">{activeConversationTitle}</span>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0">
                        <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>

                    {/* ── Dropdown conversations ── */}
                    {showConversationMenu && (
                      <div className="absolute top-full left-0 mt-2 w-72 bg-white border border-[#E8E8EE] rounded-xl shadow-2xl z-[60] overflow-hidden">
                        <div className="p-3 border-b border-[#E8E8EE]/40">
                          <div className="relative">
                            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A8AA3]" width="14" height="14" viewBox="0 0 16 16" fill="none">
                              <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5"/>
                              <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                            </svg>
                            <input
                              type="text"
                              placeholder={t('searchConversations')}
                              value={conversationSearch}
                              onChange={(e) => setConversationSearch(e.target.value)}
                              className="w-full bg-[#F7F8FA] text-sm text-[#1A1A2E] pl-9 pr-8 py-2 rounded-lg border border-[#E8E8EE]/50 focus:border-[#FF6B35]/50 focus:outline-none placeholder:text-gray-600"
                            />
                            {conversationSearch && (
                              <button onClick={() => setConversationSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8A8AA3] hover:text-[#4A4A68]">
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="max-h-64 overflow-y-auto">
                          <button
                            onClick={startNewConversation}
                            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-[#4A4A68] hover:bg-[#EFF1F5]/60 transition-colors"
                          >
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                            {t('newConversation')}
                          </button>
                          {Object.entries(groupedConversations).map(([dateLabel, convs]) => (
                            <div key={dateLabel}>
                              <div className="px-4 py-1.5 text-[11px] text-[#8A8AA3] font-medium uppercase tracking-wider">{dateLabel}</div>
                              {convs.map(conv => (
                                <div key={conv.id} className={`group flex items-center gap-1 px-4 py-2 hover:bg-[#EFF1F5]/60 transition-colors ${
                                  activeConversationId === conv.id ? 'bg-[#EFF1F5]/30' : ''
                                }`}>
                                  {renamingConversationId === conv.id ? (
                                    <input
                                      autoFocus
                                      value={renamingValue}
                                      onChange={(e) => setRenamingValue(e.target.value)}
                                      onKeyDown={(e) => { if (e.key === 'Enter') renameConversation(conv.id, renamingValue); if (e.key === 'Escape') setRenamingConversationId(null) }}
                                      onBlur={() => renameConversation(conv.id, renamingValue)}
                                      className="flex-1 text-sm text-[#2A2A42] bg-transparent border-b border-[#FF6B35] outline-none py-0.5"
                                    />
                                  ) : (
                                    <button
                                      onClick={() => loadConversation(conv)}
                                      className="flex-1 text-left text-sm text-[#4A4A68] truncate"
                                    >
                                      {conv.title}
                                    </button>
                                  )}
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setRenamingConversationId(conv.id); setRenamingValue(conv.title) }}
                                    className="opacity-0 group-hover:opacity-100 text-[#8A8AA3] hover:text-[#4A4A68] p-0.5 transition-opacity"
                                    title={t('rename')}
                                  >
                                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M11 2L14 5L5 14H2V11L11 2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id) }}
                                    className="opacity-0 group-hover:opacity-100 text-[#8A8AA3] hover:text-red-500 p-0.5 transition-opacity"
                                    title={t('delete')}
                                  >
                                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                                  </button>
                                </div>
                              ))}
                            </div>
                          ))}
                          {filteredConversations.length === 0 && (
                            <div className="px-4 py-6 text-center text-sm text-gray-600">t('noConversation')</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={startNewConversation}
                      className="p-2 text-[#6A6A85] hover:text-[#1A1A2E] rounded-lg hover:bg-[#EFF1F5]/60 transition-colors"
                      title={t('newConversation')}
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    </button>
                    <button
                      onClick={() => setChatExpanded(!chatExpanded)}
                      className="p-2 text-[#6A6A85] hover:text-[#1A1A2E] rounded-lg hover:bg-[#EFF1F5]/60 transition-colors"
                      title={chatExpanded ? t('collapse') : t('expand')}
                    >
                      {chatExpanded ? (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 2V6H14M6 14V10H2M14 10H10V14M2 6H6V2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 2L6 2V6M14 2L10 2V6M14 14L10 14V10M2 14L6 14V10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      )}
                    </button>
                    <button
                      onClick={() => setShowChatPanel(false)}
                      className="p-2 text-[#6A6A85] hover:text-[#1A1A2E] rounded-lg hover:bg-[#EFF1F5]/60 transition-colors"
                      title={t('close')}
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
                      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#FF6B35] to-[#0D9488] flex items-center justify-center mb-5 shadow-lg shadow-[#FF6B35]/20">
                        <svg width="36" height="36" viewBox="0 0 32 32" fill="none">
                          <circle cx="16" cy="13" r="8" fill="#0b0d12" opacity="0.85"/>
                          <circle cx="12" cy="12" r="2.2" fill="#2DD4BF"/>
                          <circle cx="20" cy="12" r="2.2" fill="#2DD4BF"/>
                          <path d="M11 17 Q16 21 21 17" stroke="#2DD4BF" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                          <circle cx="8" cy="8" r="1.5" fill="#2DD4BF" opacity="0.7"/>
                          <circle cx="24" cy="8" r="1.5" fill="#2DD4BF" opacity="0.7"/>
                        </svg>
                      </div>
                      <p className="text-[#8A8AA3] text-sm mb-1">{getGreeting()}, {profile?.first_name || user?.user_metadata?.full_name?.split(' ')[0] || (language === 'fr' ? 'là' : 'there')}</p>
                      <h3 className="text-[#1A1A2E] text-lg font-semibold mb-6">{t('howCanIHelp')}</h3>
                      <button
                        onClick={() => sendChatMessage(t('whatsNew'))}
                        className="px-5 py-2 rounded-full border border-[#D8D8E2] text-[#6A6A85] text-sm hover:border-[#FF6B35]/50 hover:text-[#FF6B35] transition-all duration-200"
                      >
                        {t('whatsNew')}
                      </button>
                    </div>
                  ) : (
                    /* Messages list */
                    <div className="px-4 py-4 space-y-4">
                      {chatMessages.map((msg, idx) => (
                        <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                          {/* Avatar */}
                          {msg.role === 'assistant' && (
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#FF6B35] to-[#0D9488] flex items-center justify-center shrink-0 mt-0.5 shadow-md">
                              <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
                                <circle cx="16" cy="13" r="8" fill="#0b0d12" opacity="0.85"/>
                                <circle cx="12" cy="12" r="2" fill="#2DD4BF"/>
                                <circle cx="20" cy="12" r="2" fill="#2DD4BF"/>
                                <path d="M11 17 Q16 21 21 17" stroke="#2DD4BF" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                              </svg>
                            </div>
                          )}
                          {/* Bubble */}
                          <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl whitespace-pre-wrap break-words text-sm leading-relaxed ${
                            msg.role === 'user'
                              ? 'bg-[#FF6B35] text-black rounded-br-md'
                              : 'bg-[#F7F8FA] text-[#2A2A42] rounded-bl-md border border-[#E8E8EE]'
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
                                  <img key={imgIdx} src={typeof img === 'string' ? img : ''} alt="" className="max-w-[200px] max-h-[200px] rounded-lg object-cover border border-[#D8D8E2]/30" />
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
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#FF6B35] to-[#0D9488] flex items-center justify-center shrink-0 shadow-md">
                            <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
                              <circle cx="16" cy="13" r="8" fill="#0b0d12" opacity="0.85"/>
                              <circle cx="12" cy="12" r="2" fill="#2DD4BF"/>
                              <circle cx="20" cy="12" r="2" fill="#2DD4BF"/>
                              <path d="M11 17 Q16 21 21 17" stroke="#2DD4BF" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                            </svg>
                          </div>
                          <div className="bg-[#F7F8FA] border border-[#E8E8EE] rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1.5">
                            <span className="w-2 h-2 bg-[#FF6B35] rounded-full animate-bounce" style={{ animationDelay: '0ms', animationDuration: '0.8s' }}></span>
                            <span className="w-2 h-2 bg-[#FF6B35] rounded-full animate-bounce" style={{ animationDelay: '150ms', animationDuration: '0.8s' }}></span>
                            <span className="w-2 h-2 bg-[#FF6B35] rounded-full animate-bounce" style={{ animationDelay: '300ms', animationDuration: '0.8s' }}></span>
                          </div>
                        </div>
                      )}
                      <div ref={chatEndRef} />
                    </div>
                  )}
                </div>

                {/* ── Input area ── */}
                <div className="border-t border-[#E8E8EE] px-4 py-3">
                  {/* Product Picker Modal */}
                  {showProductPicker && (
                    <div className="mb-3 bg-white border border-[#FF6B35]/30 rounded-xl overflow-hidden" ref={productPickerRef}>
                      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#E8E8EE]">
                        <span className="text-sm font-semibold text-[#FF6B35]">🛍️ {t('mentionProduct')}</span>
                        <button onClick={() => { setShowProductPicker(false); setProductPickerSearch('') }} className="text-[#6A6A85] hover:text-[#1A1A2E] text-lg">✕</button>
                      </div>
                      <div className="px-3 py-2">
                        <input
                          type="text"
                          value={productPickerSearch}
                          onChange={(e) => setProductPickerSearch(e.target.value)}
                          placeholder={t('searchProduct')}
                          className="w-full bg-white text-[#1A1A2E] px-3 py-2 rounded-lg border border-[#E8E8EE] text-sm placeholder:text-[#8A8AA3] outline-none focus:border-[#FF6B35]/40"
                          autoFocus
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto px-1 pb-2">
                        {(!products || products.length === 0) ? (
                          <p className="text-center text-[#8A8AA3] text-xs py-4">{t('connectShopifyToSeeProducts')}</p>
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
                              className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-[#FF6B35]/10 rounded-lg transition-colors"
                            >
                              {product.image?.src ? (
                                <img src={product.image.src} alt="" className="w-9 h-9 rounded-lg object-cover border border-[#E8E8EE]" />
                              ) : (
                                <div className="w-9 h-9 rounded-lg bg-[#EFF1F5] flex items-center justify-center text-[#8A8AA3] text-xs">📦</div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-[#1A1A2E] truncate">{product.title}</p>
                                <p className="text-xs text-[#8A8AA3]">{product.variants?.[0]?.price || '—'} {product.variants?.[0]?.currency || 'CAD'}</p>
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
                      <div className="flex items-center gap-2 bg-orange-50 border border-[#FF6B35]/30 rounded-xl px-3 py-2">
                        {mentionedProduct.image?.src ? (
                          <img src={mentionedProduct.image.src} alt="" className="w-8 h-8 rounded-lg object-cover" />
                        ) : (
                          <span className="text-lg">📦</span>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-[#FF8B60] font-medium truncate">{mentionedProduct.title}</p>
                          <p className="text-[11px] text-[#6A6A85]">{mentionedProduct.variants?.[0]?.price || ''} {mentionedProduct.variants?.[0]?.currency || 'CAD'}</p>
                        </div>
                        <button onClick={() => setMentionedProduct(null)} className="text-[#6A6A85] hover:text-[#1A1A2E] shrink-0">
                          <svg width="14" height="14" viewBox="0 0 12 12" fill="none"><path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          t('chatSuggestionDescription'),
                          t('chatSuggestionPhotos'),
                          t('chatSuggestionSEO'),
                          t('chatSuggestionPrice'),
                          t('chatSuggestionStrengths'),
                        ].map((q) => (
                          <button
                            key={q}
                            onClick={() => { setChatInput(q); chatTextareaRef.current?.focus() }}
                            className="px-2.5 py-1 bg-white hover:bg-[#FF6B35]/20 border border-[#E8E8EE] hover:border-[#FF6B35]/40 rounded-full text-xs text-[#4A4A68] hover:text-[#FF8B60] transition-colors"
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
                        <div key={i} className="relative group bg-[#F7F8FA] border border-[#E8E8EE] rounded-lg p-1.5 flex items-center gap-2 text-xs text-[#6A6A85] max-w-[180px]">
                          {att.preview ? (
                            <img src={att.preview} alt="" className="w-8 h-8 rounded object-cover" />
                          ) : (
                            <svg className="w-5 h-5 text-[#8A8AA3] shrink-0" viewBox="0 0 20 20" fill="currentColor"><path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"/></svg>
                          )}
                          <span className="truncate">{att.name}</span>
                          <button onClick={() => removeAttachment(i)} className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <svg width="8" height="8" viewBox="0 0 12 12" fill="white"><path d="M3 3L9 9M9 3L3 9" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className={`flex items-end gap-2 bg-[#F7F8FA] border border-[#E8E8EE] rounded-xl px-3 py-2 transition-colors ${
                    voiceDictationMode ? 'border-[#E8E8EE]/50' : 'focus-within:border-[#FF6B35]/40'
                  }`}>
                    {/* Left buttons: + (always visible) */}
                    <div className="relative shrink-0" ref={attachMenuRef}>
                      {!voiceDictationMode && (
                        /* + button (normal mode only) */
                        <>
                          <button
                            onClick={() => setShowAttachMenu(!showAttachMenu)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              showAttachMenu ? 'text-[#FF6B35] bg-[#EFF1F5]/60' : 'text-[#8A8AA3] hover:text-[#4A4A68] hover:bg-[#EFF1F5]/30'
                            }`}
                            title={t('add')}
                          >
                            {showAttachMenu ? (
                              <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                            ) : (
                              <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
                            )}
                          </button>

                          {showAttachMenu && (
                            <div className="absolute bottom-full left-0 mb-2 w-60 bg-white border border-[#E8E8EE] rounded-xl shadow-2xl z-[60] overflow-hidden py-1">
                              <button onClick={() => { fileInputRef.current?.click() }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#4A4A68] hover:bg-[#EFF1F5]/60 transition-colors">
                                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" className="text-[#6A6A85]"><path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" stroke="currentColor" strokeWidth="1.5"/></svg>
                                {t('files')}
                              </button>
                              <button onClick={() => { fileInputRef.current?.click() }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#4A4A68] hover:bg-[#EFF1F5]/60 transition-colors">
                                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" className="text-[#6A6A85]"><path d="M5 15L10 5L15 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><circle cx="10" cy="3" r="1.5" fill="currentColor"/></svg>
                                {t('uploadFromDevice')}
                              </button>
                              <div className="border-t border-[#E8E8EE]/40 my-1"></div>
                              <button onClick={() => { setShowProductPicker(true); setShowAttachMenu(false); if (!products || products.length === 0) loadProducts() }} className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-[#FF6B35] hover:bg-[#FF6B35]/10 transition-colors">
                                <span className="flex items-center gap-3"><svg width="16" height="16" viewBox="0 0 20 20" fill="none" className="text-[#FF6B35]"><path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17M17 17a2 2 0 100-4 2 2 0 000 4zM7 17a2 2 0 100-4 2 2 0 000 4z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>{t('mentionProduct')}</span>
                                <span className="text-xs text-[#E85A28]/70 bg-[#FFF4F0] px-1.5 py-0.5 rounded">🛍️</span>
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
                          <span className="text-sm text-[#4A4A68]">{t('transcribing')}…</span>
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
                        placeholder={t('chatPlaceholder')}
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
                        className="flex-1 resize-none bg-transparent text-[#2A2A42] text-sm placeholder:text-gray-600 outline-none py-2 overflow-y-auto"
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
                            className="w-8 h-8 flex items-center justify-center text-[#4A4A68] hover:text-[#1A1A2E] bg-[#EFF1F5]/50 hover:bg-[#E8E8EE]/70 rounded-full transition-colors"
                            title={t('cancel')}
                          >
                            <span className="text-base font-semibold">✕</span>
                          </button>
                          <button
                            onClick={confirmDictation}
                            className="w-8 h-8 flex items-center justify-center text-white bg-[#0D9488]/80 hover:bg-[#0D9488] rounded-full transition-colors"
                            title={t('confirm')}
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
                        className="p-1.5 text-[#FF6B35] hover:text-[#FF6B35] disabled:text-gray-600 transition-colors shrink-0"
                        title={t('send')}
                      >
                        <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M3.105 2.29a1 1 0 011.265-.42l13 6.5a1 1 0 010 1.79l-13 6.5A1 1 0 013 15.79V11.5l8-1.5-8-1.5V4.21a1 1 0 01.105-.92z"/>
                        </svg>
                      </button>
                    ) : (
                      /* Mic button */
                      <button
                        onClick={startDictation}
                        className="p-1.5 text-[#8A8AA3] hover:text-[#4A4A68] transition-colors shrink-0 rounded-lg"
                        title={t('voiceDictation')}
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
                    <p className="text-[10px] text-gray-600">{t('aiDisclaimer')}</p>
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
