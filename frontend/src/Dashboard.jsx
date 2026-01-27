import React, { useState, useEffect, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://jgmsfadayzbgykzajvmw.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnbXNmYWRheXpiZ3lremFqdm13Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQwODk0NTksImV4cCI6MjA3OTY2NTQ1OX0.sg0O2QGdoKO5Zb6vcRJr5pSu2zlaxU3r7nHtyXb07hg'
)

const API_URL = 'https://shopbrain-backend.onrender.com'

export default function Dashboard() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [subscription, setSubscription] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [shopifyUrl, setShopifyUrl] = useState('')
  const [shopifyToken, setShopifyToken] = useState('')
  const [products, setProducts] = useState(null)
  const [error, setError] = useState('')
  const [isProcessingPayment, setIsProcessingPayment] = useState(false)
  const [showPlanMenu, setShowPlanMenu] = useState(false)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [settingsTab, setSettingsTab] = useState('profile')
  const [showApplyModal, setShowApplyModal] = useState(false)
  const [selectedActions, setSelectedActions] = useState([])
  const [applyingActions, setApplyingActions] = useState(false)
  const [analysisResults, setAnalysisResults] = useState(null)
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', text: '👋 Bonjour! Je suis ton assistant IA e-commerce. Tu peux me poser des questions sur tes produits, tes stratégies de vente, ou tout ce qui concerne ton e-commerce.' }
  ])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  
  // Settings form states
  const [profileFirstName, setProfileFirstName] = useState(profile?.first_name || '')
  const [profileLastName, setProfileLastName] = useState(profile?.last_name || '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [darkMode, setDarkMode] = useState(() => {
    const stored = localStorage.getItem('darkMode')
    return stored ? stored === 'true' : true
  })
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

  const translations = {
    fr: {
      accountSettings: 'Paramètres du compte',
      tabProfile: 'Profil',
      tabSecurity: 'Sécurité',
      tabInterface: 'Interface',
      tabNotifications: 'Notifications',
      tabBilling: 'Facturation',
      tabApiKeys: 'Clés API',
      profileInformation: 'Informations du profil',
      uploadPhoto: 'Importer une photo',
      firstName: 'Prénom',
      lastName: 'Nom',
      username: 'Nom d’utilisateur',
      usernameCannotChange: 'Le nom d’utilisateur ne peut pas être modifié',
      email: 'Email',
      saveChanges: 'Enregistrer',
      saving: '⏳ Enregistrement...',
      securitySettings: 'Paramètres de sécurité',
      changePassword: 'Changer le mot de passe',
      currentPassword: 'Mot de passe actuel',
      newPassword: 'Nouveau mot de passe',
      confirmNewPassword: 'Confirmer le nouveau mot de passe',
      updatePassword: 'Mettre à jour',
      updating: '⏳ Mise à jour...',
      twoFactorAuth: 'Authentification à deux facteurs',
      twoFactorDesc: 'Ajoute une couche de sécurité supplémentaire',
      enable2FA: 'Activer 2FA',
      disable2FA: 'Désactiver 2FA',
      twoFAEnabled: '✅ 2FA est activée',
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
      apiWarning: '⚠️ Garde tes clés API en sécurité. Ne les partage pas.',
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
      profileInformation: 'Profile Information',
      uploadPhoto: 'Upload Photo',
      firstName: 'First Name',
      lastName: 'Last Name',
      username: 'Username',
      usernameCannotChange: 'Username cannot be changed',
      email: 'Email',
      saveChanges: 'Save Changes',
      saving: '⏳ Saving...',
      securitySettings: 'Security Settings',
      changePassword: 'Change Password',
      currentPassword: 'Current Password',
      newPassword: 'New Password',
      confirmNewPassword: 'Confirm New Password',
      updatePassword: 'Update Password',
      updating: '⏳ Updating...',
      twoFactorAuth: 'Two-Factor Authentication',
      twoFactorDesc: 'Add an extra layer of security to your account',
      enable2FA: 'Enable 2FA',
      disable2FA: 'Disable 2FA',
      twoFAEnabled: '✅ 2FA is enabled',
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
      apiWarning: '⚠️ Keep your API keys secure. Do not share them publicly.',
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
        console.log('✅ Payment session verified and plan updated')
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
        alert(`✅ Nouvelle clé générée:\n${data.api_key}\n\nCopie-la maintenant, elle ne sera plus affichée.`)
        setApiKeys((prev) => [data.key, ...prev])
      } else {
        alert('❌ Erreur: ' + (data.detail || 'Erreur'))
      }
    } catch (err) {
      console.error('API key generate error:', err)
      alert('❌ Erreur lors de la génération')
    } finally {
      setApiLoading(false)
    }
  }

  const handleRevokeApiKey = async (keyId) => {
    if (!window.confirm('Révoquer cette clé ?')) return

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
      } else {
        alert('❌ Erreur: ' + (data.detail || 'Erreur'))
      }
    } catch (err) {
      console.error('API key revoke error:', err)
      alert('❌ Erreur lors de la révocation')
    } finally {
      setApiLoading(false)
    }
  }

  useEffect(() => {
    const root = document.documentElement
    if (darkMode) {
      root.classList.remove('theme-light')
    } else {
      root.classList.add('theme-light')
    }
  }, [darkMode])

  const initializeUser = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        window.location.hash = '#/'
        return
      }
      
      setUser(session.user)
      
      // Fetch user profile
      try {
        const profileResp = await fetch(`${API_URL}/api/auth/profile`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          }
        })
        if (profileResp.ok) {
          const profileData = await profileResp.json()
          setProfile(profileData)
        }
      } catch (err) {
        console.warn('Could not load profile:', err)
      }
      
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

  const handleChangePlan = async (targetPlan) => {
    try {
      if (!targetPlan || targetPlan === subscription?.plan) return
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
        body: JSON.stringify({ plan: targetPlan, email: user?.email || '' })
      })

      const data = await resp.json()
      if (data?.success && data?.url) {
        window.location.href = data.url
      } else {
        alert('Erreur lors de la création de la session Stripe')
      }
    } catch (e) {
      console.error('Change plan error:', e)
      alert('Une erreur est survenue')
    } finally {
      setShowPlanMenu(false)
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

  // ============ SETTINGS HANDLERS ============

  const handleAvatarFileChange = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      alert('❌ Format invalide. Choisis une image.')
      event.target.value = ''
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('❌ Image trop volumineuse (max 5MB).')
      event.target.value = ''
      return
    }

    try {
      setAvatarUploading(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        alert('Session expirée, reconnecte-toi.')
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
        alert('✅ Photo de profil mise à jour')
      } else {
        alert('❌ Erreur: ' + (data.detail || 'Erreur inconnue'))
      }
    } catch (err) {
      console.error('Avatar upload error:', err)
      alert('❌ Erreur lors de l’upload')
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
        alert('✅ Profil mis à jour')
        await initializeUser()
      } else {
        alert('❌ Erreur: ' + (data.detail || 'Erreur'))
      }
    } catch (err) {
      alert('❌ Erreur: ' + err.message)
    } finally {
      setSaveLoading(false)
    }
  }

  const handleUpdatePassword = async () => {
    if (!currentPassword || !newPassword) {
      alert('Veuillez remplir tous les champs')
      return
    }
    if (newPassword !== confirmPassword) {
      alert('Les mots de passe ne correspondent pas')
      return
    }
    if (newPassword.length < 8) {
      alert('Le mot de passe doit avoir au moins 8 caractères')
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
        alert('✅ Mot de passe mis à jour')
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      } else {
        alert('❌ Erreur: ' + (data.detail || 'Erreur'))
      }
    } catch (err) {
      alert('❌ Erreur: ' + err.message)
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
        alert('✅ 2FA ' + (twoFAEnabled ? 'désactivée' : 'activée'))
      } else {
        alert('❌ Erreur: ' + (data.detail || 'Erreur'))
      }
    } catch (err) {
      alert('❌ Erreur: ' + err.message)
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
        alert('✅ Paramètres updated')
        localStorage.setItem('darkMode', darkMode)
        localStorage.setItem('language', language)
      } else {
        alert('❌ Erreur: ' + (data.detail || 'Erreur'))
      }
    } catch (err) {
      alert('❌ Erreur: ' + err.message)
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
        alert('✅ Préférences mises à jour')
      } else {
        alert('❌ Erreur: ' + (data.detail || 'Erreur'))
      }
    } catch (err) {
      alert('❌ Erreur: ' + err.message)
    } finally {
      setSaveLoading(false)
    }
  }

  const handleCancelSubscription = async () => {
    if (!confirm('Êtes-vous sûr? Cette action est irréversible.')) return
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
        alert('✅ Abonnement annulé')
        await initializeUser()
      } else {
        alert('❌ Erreur: ' + (data.detail || 'Erreur'))
      }
    } catch (err) {
      alert('❌ Erreur: ' + err.message)
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
        alert('❌ Erreur: ' + (data.detail || 'Erreur'))
      }
    } catch (err) {
      alert('❌ Erreur: ' + err.message)
    } finally {
      setSaveLoading(false)
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
        alert('✅ Modifications appliquées avec succès!')
        setShowApplyModal(false)
        // Reload products to see changes
        await loadProducts()
      } else {
        alert('❌ Erreur: ' + (data.detail || 'Erreur lors de l\'application'))
      }
    } catch (err) {
      console.error('Error applying actions:', err)
      alert('❌ Erreur: ' + err.message)
    } finally {
      setApplyingActions(false)
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
      <div className="bg-gradient-to-r from-blue-900 to-purple-900 text-white p-4 shadow-lg">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          {/* Left: Profile Menu */}
          <div className="flex items-center gap-4 relative">
            <button
              onClick={() => setShowProfileMenu((v) => !v)}
              className="flex items-center gap-3 hover:bg-white/10 px-3 py-2 rounded-lg transition"
            >
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center font-bold text-lg shadow-lg overflow-hidden">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <span>{profile?.first_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'}</span>
                )}
              </div>
              <div className="text-left">
                <div className="font-semibold text-sm">{profile?.full_name || user?.email}</div>
                <div className="text-xs text-gray-300">@{profile?.username || 'user'}</div>
              </div>
              <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Profile Dropdown */}
            {showProfileMenu && (
              <div className="absolute top-full left-0 mt-2 w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-2xl z-50">
                <div className="p-4 border-b border-gray-700">
                  <div className="font-semibold">{profile?.full_name || user?.email}</div>
                  <div className="text-sm text-gray-400">{user?.email}</div>
                  <div className="mt-2 px-2 py-1 bg-yellow-600/20 text-yellow-400 text-xs rounded inline-block">
                    {subscription?.plan?.toUpperCase() || 'FREE'}
                  </div>
                </div>
                <div className="p-2">
                  <button
                    onClick={() => { setShowProfileMenu(false); setShowSettingsModal(true); setSettingsTab('profile') }}
                    className="w-full text-left px-3 py-2 rounded hover:bg-gray-700 flex items-center gap-2 text-sm"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    {t('accountSettings')}
                  </button>
                  <button
                    onClick={() => { setShowProfileMenu(false); setShowPlanMenu(true) }}
                    className="w-full text-left px-3 py-2 rounded hover:bg-gray-700 flex items-center gap-2 text-sm"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Subscription & Billing
                  </button>
                  <div className="border-t border-gray-700 my-2"></div>
                  <button
                    onClick={() => { setShowProfileMenu(false); handleLogout() }}
                    className="w-full text-left px-3 py-2 rounded hover:bg-red-700 flex items-center gap-2 text-sm text-red-400 hover:text-white"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right: Plan Badge */}
          <div className="text-right relative">
            <div className="text-xs text-gray-300 mb-1">Current Plan</div>
            <div className="font-bold text-yellow-400 text-lg">{subscription?.plan.toUpperCase()}</div>
          </div>
        </div>
      </div>

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
          </div>
        </div>
      )}

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
                {/* Auto-Apply Actions Button (Pro/Premium only) */}
                {(subscription?.plan === 'pro' || subscription?.plan === 'premium') && (
                  <div className="bg-gradient-to-r from-green-900 to-emerald-900 border-2 border-green-500 rounded-lg p-6 shadow-xl">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-white text-xl font-bold mb-2">🤖 Actions Automatiques IA</h3>
                        <p className="text-green-200 text-sm">L'IA peut appliquer automatiquement les optimisations recommandées à votre boutique Shopify.</p>
                        {subscription?.plan === 'premium' && (
                          <p className="text-yellow-300 text-xs mt-1">⭐ Premium: Modifications automatiques sans limites</p>
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

      {/* Apply Actions Confirmation Modal */}
      {showApplyModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => !applyingActions && setShowApplyModal(false)}>
          <div className="bg-gray-900 rounded-xl max-w-3xl w-full max-h-[80vh] overflow-hidden border border-green-500 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="bg-gradient-to-r from-green-900 to-emerald-900 p-6 flex justify-between items-center">
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
                <p className="text-yellow-300 font-bold mb-2">⚠️ Attention</p>
                <p className="text-yellow-200 text-sm">L'IA va modifier {selectedActions.length} éléments dans votre boutique Shopify. Cette action est irréversible.</p>
              </div>

              <h3 className="text-white font-bold mb-4 text-lg">Modifications à appliquer:</h3>
              
              <div className="space-y-3">
                {selectedActions.map((action, idx) => (
                  <div key={idx} className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                    <div className="flex items-start gap-3">
                      <div className={`mt-1 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                        action.type === 'price' ? 'bg-green-600' :
                        action.type === 'titre' ? 'bg-blue-600' : 'bg-purple-600'
                      }`}>
                        {action.type === 'price' ? '💰' : action.type === 'titre' ? '📝' : '📄'}
                      </div>
                      <div className="flex-1">
                        <p className="text-white font-bold mb-1">{action.product}</p>
                        {action.type === 'price' && (
                          <>
                            <p className="text-gray-300 text-sm mb-2">{action.reason}</p>
                            <div className="flex items-center gap-4 text-sm">
                              <span className="text-red-400">Prix actuel: {action.current}$</span>
                              <span className="text-gray-500">→</span>
                              <span className="text-green-400 font-bold">Nouveau prix: {action.new}$</span>
                            </div>
                          </>
                        )}
                        {(action.type === 'titre' || action.type === 'description') && (
                          <>
                            <div className="flex items-center gap-2 mb-2">
                              <span className={`px-2 py-1 rounded text-xs font-bold ${
                                action.priority === 'Critique' ? 'bg-red-600' :
                                action.priority === 'Haute' ? 'bg-orange-600' : 'bg-yellow-600'
                              }`}>
                                {action.priority}
                              </span>
                              <span className="text-blue-400 text-sm font-bold">{action.type.toUpperCase()}</span>
                            </div>
                            <p className="text-gray-400 text-sm mb-1">Problème: {action.issue}</p>
                            <p className="text-green-300 text-sm">✅ Solution: {action.suggestion}</p>
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
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setShowSettingsModal(false)}>
          <div className="bg-gray-900 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden border border-gray-700 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-900 to-purple-900 p-6 flex justify-between items-center">
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
                  {['profile', 'security', 'interface', 'notifications', 'billing', 'api'].map(tab => (
                    <button
                      key={tab}
                      onClick={() => setSettingsTab(tab)}
                      className={`w-full text-left px-4 py-2 rounded-lg transition ${
                        settingsTab === tab ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
                      }`}
                    >
                      {tab === 'profile' && `👤 ${t('tabProfile')}`}
                      {tab === 'security' && `🔐 ${t('tabSecurity')}`}
                      {tab === 'interface' && `🎨 ${t('tabInterface')}`}
                      {tab === 'notifications' && `🔔 ${t('tabNotifications')}`}
                      {tab === 'billing' && `💳 ${t('tabBilling')}`}
                      {tab === 'api' && `⚙️ ${t('tabApiKeys')}`}
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
                      </div>
                    </div>
                    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                      <h4 className="text-lg font-semibold text-white mb-2">{t('twoFactorAuth')}</h4>
                      <p className="text-gray-400 mb-4">{t('twoFactorDesc')}</p>
                      <button onClick={handleToggle2FA} disabled={saveLoading} className={`${twoFAEnabled ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'} disabled:opacity-50 px-6 py-2 rounded-lg text-white font-semibold`}>
                        {saveLoading ? '⏳...' : (twoFAEnabled ? t('disable2FA') : t('enable2FA'))}
                      </button>
                      {twoFAEnabled && <p className="text-green-400 text-sm mt-2">{t('twoFAEnabled')}</p>}
                    </div>
                  </div>
                )}

                {settingsTab === 'interface' && (
                  <div className="space-y-6">
                    <h3 className="text-xl font-bold text-white mb-4">{t('interfacePreferences')}</h3>
                    <div className="space-y-4">
                      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 flex justify-between items-center">
                        <div>
                          <h4 className="text-white font-semibold">{t('darkMode')}</h4>
                          <p className="text-sm text-gray-400">{darkMode ? t('enabled') : t('disabled')}</p>
                        </div>
                        <button onClick={() => setDarkMode(!darkMode)} className={`${darkMode ? 'bg-blue-600' : 'bg-gray-600'} w-12 h-6 rounded-full p-1 cursor-pointer transition`}>
                          <div className={`${darkMode ? 'bg-white ml-auto' : 'bg-white'} w-4 h-4 rounded-full transition`}></div>
                        </button>
                      </div>
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
                        <button onClick={handleCancelSubscription} disabled={saveLoading} className="bg-red-600 hover:bg-red-700 disabled:opacity-50 px-6 py-2 rounded-lg text-white font-semibold">
                          {saveLoading ? '⏳...' : t('cancelSubscription')}
                        </button>
                      </div>
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
                        {saveLoading ? '⏳...' : t('updatePaymentMethod')}
                      </button>
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
                              className="bg-red-600 hover:bg-red-700 disabled:opacity-50 px-4 py-2 rounded-lg text-white text-sm"
                            >
                              {keyItem.revoked ? 'Révoquée' : t('revoke')}
                            </button>
                          </div>
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
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
