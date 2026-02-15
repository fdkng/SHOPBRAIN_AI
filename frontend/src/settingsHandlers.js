// Settings handlers for Dashboard component
export const createSettingsHandlers = (state, setState, supabase, API_URL) => {

  const formatUserFacingError = (err, fallback = 'Une erreur est survenue') => {
    const raw = String(err?.message || '').trim()
    const isNetwork = err?.name === 'AbortError' || /Failed to fetch|NetworkError|Load failed|fetch/i.test(raw)
    if (isNetwork) {
      return 'Connexion au backend impossible pour le moment (serveur en réveil). Réessaie dans 10-20 secondes.'
    }
    return raw || fallback
  }
  
  const handleSaveProfile = async () => {
    try {
      setState(prev => ({ ...prev, saveLoading: true }))
      const { data: { session } } = await supabase.auth.getSession()
      
      const response = await fetch(`${API_URL}/api/auth/profile`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          first_name: state.profileFirstName,
          last_name: state.profileLastName
        })
      })
      
      const data = await response.json()
      if (data.success) {
        alert('✅ Profil mis à jour')
        // Trigger profile reload
        window.location.reload()
      } else {
        alert('❌ Erreur: ' + (data.detail || 'Erreur'))
      }
    } catch (err) {
      alert('❌ ' + formatUserFacingError(err, 'Erreur'))
    } finally {
      setState(prev => ({ ...prev, saveLoading: false }))
    }
  }

  const handleUpdatePassword = async () => {
    if (!state.currentPassword || !state.newPassword) {
      alert('Veuillez remplir tous les champs')
      return
    }
    if (state.newPassword !== state.confirmPassword) {
      alert('Les mots de passe ne correspondent pas')
      return
    }
    if (state.newPassword.length < 8) {
      alert('Le mot de passe doit avoir au moins 8 caractères')
      return
    }
    
    try {
      setState(prev => ({ ...prev, saveLoading: true }))
      const { data: { session } } = await supabase.auth.getSession()
      
      const response = await fetch(`${API_URL}/api/settings/password`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          current_password: state.currentPassword,
          new_password: state.newPassword
        })
      })
      
      const data = await response.json()
      if (data.success) {
        alert('✅ Mot de passe mis à jour')
        setState(prev => ({
          ...prev,
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        }))
      } else {
        alert('❌ Erreur: ' + (data.detail || 'Erreur'))
      }
    } catch (err) {
      alert('❌ ' + formatUserFacingError(err, 'Erreur'))
    } finally {
      setState(prev => ({ ...prev, saveLoading: false }))
    }
  }

  const handleToggle2FA = async () => {
    try {
      setState(prev => ({ ...prev, saveLoading: true }))
      const { data: { session } } = await supabase.auth.getSession()
      
      const endpoint = state.twoFAEnabled ? '/api/settings/2fa/disable' : '/api/settings/2fa/enable'
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      })
      
      const data = await response.json()
      if (data.success) {
        setState(prev => ({ ...prev, twoFAEnabled: !prev.twoFAEnabled }))
        alert('✅ 2FA ' + (state.twoFAEnabled ? 'désactivée' : 'activée'))
      } else {
        alert('❌ Erreur: ' + (data.detail || 'Erreur'))
      }
    } catch (err) {
      alert('❌ ' + formatUserFacingError(err, 'Erreur'))
    } finally {
      setState(prev => ({ ...prev, saveLoading: false }))
    }
  }

  const handleSaveInterface = async () => {
    try {
      setState(prev => ({ ...prev, saveLoading: true }))
      const { data: { session } } = await supabase.auth.getSession()
      
      const response = await fetch(`${API_URL}/api/settings/interface`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          dark_mode: state.darkMode,
          language: state.language
        })
      })
      
      const data = await response.json()
      if (data.success) {
        alert('✅ Paramètres d\'interface mis à jour')
        localStorage.setItem('darkMode', state.darkMode)
        localStorage.setItem('language', state.language)
      } else {
        alert('❌ Erreur: ' + (data.detail || 'Erreur'))
      }
    } catch (err) {
      alert('❌ ' + formatUserFacingError(err, 'Erreur'))
    } finally {
      setState(prev => ({ ...prev, saveLoading: false }))
    }
  }

  const handleSaveNotifications = async () => {
    try {
      setState(prev => ({ ...prev, saveLoading: true }))
      const { data: { session } } = await supabase.auth.getSession()
      
      const response = await fetch(`${API_URL}/api/settings/notifications`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(state.notifications)
      })
      
      const data = await response.json()
      if (data.success) {
        alert('✅ Préférences de notifications mises à jour')
      } else {
        alert('❌ Erreur: ' + (data.detail || 'Erreur'))
      }
    } catch (err) {
      alert('❌ ' + formatUserFacingError(err, 'Erreur'))
    } finally {
      setState(prev => ({ ...prev, saveLoading: false }))
    }
  }

  const handleCancelSubscription = async () => {
    if (!confirm('Êtes-vous sûr de vouloir annuler votre abonnement? Cette action est irréversible.')) return
    
    try {
      setState(prev => ({ ...prev, saveLoading: true }))
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
        window.location.reload()
      } else {
        alert('❌ Erreur: ' + (data.detail || 'Erreur'))
      }
    } catch (err) {
      alert('❌ ' + formatUserFacingError(err, 'Erreur'))
    } finally {
      setState(prev => ({ ...prev, saveLoading: false }))
    }
  }

  const handleUpdatePaymentMethod = async () => {
    try {
      setState(prev => ({ ...prev, saveLoading: true }))
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
      alert('❌ ' + formatUserFacingError(err, 'Erreur'))
    } finally {
      setState(prev => ({ ...prev, saveLoading: false }))
    }
  }

  return {
    handleSaveProfile,
    handleUpdatePassword,
    handleToggle2FA,
    handleSaveInterface,
    handleSaveNotifications,
    handleCancelSubscription,
    handleUpdatePaymentMethod
  }
}
