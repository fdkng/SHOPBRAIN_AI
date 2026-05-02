import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from './LanguageContext'
import { supabase } from './supabaseClient'
import { getMarketingPricingPlans, getPlanUiLabel } from './pricingConfig'

// Prefill email/client reference so Stripe checkout is smoother
// Supports test mode via URL params: ?mode=test&pk=pk_test_...&ptid=prctbl_test_...
export default function StripePricingTable({ userEmail, userId, hasActiveSubscription, currentPlan }) {
  const { t } = useTranslation()
  const readyIdentity = Boolean(userId && userEmail)
  const currentPlanLabel = getPlanUiLabel(currentPlan)
  const pricingPlans = useMemo(() => getMarketingPricingPlans(t), [t])
  const [checkoutPlanId, setCheckoutPlanId] = useState(null)
  const [status, setStatus] = useState(null)

  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  const mode = params?.get('mode') || 'live'
  const overridePk = params?.get('pk') || ''
  const overrideTableId = params?.get('ptid') || ''
  const livePublishableKey = (import.meta?.env?.VITE_STRIPE_LIVE_PUBLISHABLE_KEY) || ''
  const liveTableId = (import.meta?.env?.VITE_STRIPE_LIVE_TABLE_ID) || ''
  const testPublishableKey = (import.meta?.env?.VITE_STRIPE_TEST_PUBLISHABLE_KEY) || ''
  const testTableId = (import.meta?.env?.VITE_STRIPE_TEST_TABLE_ID) || ''
  const publishableKey = overridePk || (mode === 'test' ? testPublishableKey : livePublishableKey)
  const tableId = overrideTableId || (mode === 'test' ? testTableId : liveTableId)
  const canRenderStripeEmbed = Boolean(readyIdentity && publishableKey && tableId)

  useEffect(() => {
    if (!canRenderStripeEmbed) {
      return undefined
    }

    // Load Stripe Pricing Table script
    const script = document.createElement('script')
    script.src = 'https://js.stripe.com/v3/pricing-table.js'
    script.async = true
    document.body.appendChild(script)
    
    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script)
      }
    }
  }, [canRenderStripeEmbed])

  const handleStripeCheckout = async (planId) => {
    setStatus(null)

    if (!readyIdentity) {
      setStatus({ type: 'error', message: t('sessionNotFound') })
      return
    }

    try {
      setCheckoutPlanId(planId)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setStatus({ type: 'error', message: t('sessionNotFound') })
        return
      }

      if (!session.access_token) {
        setStatus({ type: 'error', message: t('accessTokenMissing') })
        return
      }

      const response = await fetch('https://shopbrain-backend.onrender.com/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          plan: planId,
          email: userEmail,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        setStatus({
          type: 'error',
          message: `${t('error')}: ${errorData.detail || response.statusText || t('unableToCreateCheckoutSession')}`,
        })
        return
      }

      const data = await response.json()
      if (data.url) {
        window.location.href = data.url
        return
      }

      setStatus({ type: 'error', message: t('checkoutUrlMissing') })
    } catch (error) {
      setStatus({ type: 'error', message: `${t('connectionError')}: ${error.message}` })
    } finally {
      setCheckoutPlanId(null)
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            {t('chooseSubscription')}
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            {t('pricingSubtitle')}
          </p>
        </div>

        {/* GUARD: If user already has an active subscription, show warning + redirect */}
        {hasActiveSubscription ? (
          <div className="max-w-lg mx-auto rounded-2xl border-2 border-orange-300 bg-orange-50 p-8 text-center">
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">
              Vous avez déjà un abonnement actif
            </h2>
            <p className="text-gray-600 mb-2">
              Votre plan actuel : <strong className="text-orange-600">{currentPlanLabel}</strong>
            </p>
            <p className="text-gray-600 mb-6">
              Pour changer de plan, utilisez le bouton "Changer de plan" dans votre dashboard.
              Acheter un nouveau plan ici créerait un doublon de facturation.
            </p>
            <button
              onClick={() => { window.location.hash = '#dashboard' }}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#FF6B35] text-white text-base font-semibold hover:bg-[#E85A28] transition shadow-lg"
            >
              Aller au Dashboard
              <span aria-hidden>→</span>
            </button>
          </div>
        ) : (
        <>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 max-w-6xl mx-auto">
          {pricingPlans.map((plan) => (
            <div
              key={plan.plan_id}
              className={`relative rounded-2xl border-2 bg-white p-8 transition-all duration-300 ${
                plan.highlight
                  ? 'border-[#2DD4BF] shadow-xl'
                  : 'border-[#FF6B35]/30 shadow-sm'
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center gap-1 bg-[#0D9488] text-white px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide shadow-md">
                    {t('mostPopularBadge')}
                  </span>
                </div>
              )}

              <div className="text-center mb-8">
                <h2 className="text-2xl font-semibold text-[#1A1A2E] mb-3">{plan.name}</h2>
                <div className="mb-2">
                  <span className="font-serif text-5xl text-[#1A1A2E]">{plan.price}</span>
                  <span className="text-[#8A8AA3] text-base ml-1">{t('perMonth')}</span>
                </div>
                <p className="text-xs text-[#8A8AA3]">{t('billedMonthly')}</p>
              </div>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature) => (
                  <li key={`${plan.plan_id}-${feature}`} className="flex items-start gap-3">
                    <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs mt-0.5 ${
                      plan.highlight ? 'bg-[#ECFDF5] text-[#0D9488]' : 'bg-[#F7F8FA] text-[#8A8AA3]'
                    }`}>
                      ✓
                    </span>
                    <span className="text-sm text-[#4A4A68] leading-relaxed">{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleStripeCheckout(plan.plan_id)}
                disabled={checkoutPlanId === plan.plan_id}
                className={`w-full py-3.5 rounded-full text-sm font-semibold text-center transition-all disabled:opacity-60 ${
                  plan.highlight
                    ? 'bg-[#0D9488] text-white hover:bg-[#2DD4BF] hover:text-[#0D9488] shadow-sm'
                    : 'bg-[#F7F8FA] text-[#1A1A2E] border border-[#FF6B35]/40 hover:bg-[#EFF1F5] hover:border-[#FF6B35]/65'
                }`}
              >
                {checkoutPlanId === plan.plan_id ? t('processingPayment') : plan.cta}
              </button>

              <p className="text-center text-xs text-[#8A8AA3] mt-4">{t('cancelInOneClick')}</p>
            </div>
          ))}
        </div>

        {status?.message && (
          <div className={`max-w-3xl mx-auto mt-8 rounded-2xl border px-5 py-4 text-sm ${
            status.type === 'error'
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-green-200 bg-green-50 text-green-800'
          }`}>
            {status.message}
          </div>
        )}

        {canRenderStripeEmbed && (
          <div className="mt-16">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-semibold text-[#1A1A2E]">Stripe</h2>
              <p className="text-sm text-[#6A6A85] mt-2">Version embarquée configurée pour ce build.</p>
            </div>
            <div id="stripe-pricing-table">
              <stripe-pricing-table
                key={`${userId}-${userEmail}`}
                pricing-table-id={tableId}
                publishable-key={publishableKey}
                customer-email={userEmail}
                client-reference-id={userId}
              ></stripe-pricing-table>
            </div>
          </div>
        )}

        {/* Fallback: if Stripe shows a success message but doesn't redirect, let user continue */}
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500 mb-3">
            Si Stripe affiche "Thanks for subscribing" sans redirection,
            cliquez ci-dessous pour accéder à votre dashboard.
          </p>
          <button
            onClick={() => {
              // Trigger the dashboard payment success flow
              window.location.hash = '#dashboard?success=true'
            }}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition shadow"
          >
            Continuer vers le dashboard
            <span aria-hidden>→</span>
          </button>
        </div>
        </>
        )}
      </div>
    </div>
  )
}
