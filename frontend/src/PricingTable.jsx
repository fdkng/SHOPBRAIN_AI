import React, { useEffect } from 'react'

// Prefill email/client reference so Stripe checkout is smoother
// Supports test mode via URL params: ?mode=test&pk=pk_test_...&ptid=prctbl_test_...
export default function StripePricingTable({ userEmail, userId, hasActiveSubscription, currentPlan }) {
  const readyIdentity = Boolean(userId && userEmail)

  useEffect(() => {
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
  }, [])

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            Plans de pricing
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Choisissez le plan qui correspond à vos besoins. Tous les plans incluent 14 jours d'essai gratuit.
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
              Votre plan actuel : <strong className="text-orange-600">{(currentPlan || 'Pro').toUpperCase()}</strong>
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
        {/* Stripe Pricing Table Embed (supports overrides via URL params) */}
        <div id="stripe-pricing-table">
          {(() => {
            const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
            const mode = params?.get('mode') || 'live'
            const overridePk = params?.get('pk') || ''
            const overrideTableId = params?.get('ptid') || ''

            // Live defaults
            const LIVE_PUBLISHABLE_KEY = 'pk_live_51REHBEPSvADOSbOzqhf7zqZKxA8T2OWPkMOeNsli4wc1n3GYgmTc7TboQlAL6GeeVSd7i5vfIG1IbkGeXvXqedyB009rEijMRi'
            const LIVE_TABLE_ID = 'prctbl_1SczvvPSvADOSbOz3kGUkwwZ'

            // Optional test env (fallbacks if provided at build time)
            const TEST_PUBLISHABLE_KEY = (import.meta?.env?.VITE_STRIPE_TEST_PUBLISHABLE_KEY) || ''
            const TEST_TABLE_ID = (import.meta?.env?.VITE_STRIPE_TEST_TABLE_ID) || ''

            const publishableKey = overridePk || (mode === 'test' ? TEST_PUBLISHABLE_KEY : LIVE_PUBLISHABLE_KEY)
            const tableId = overrideTableId || (mode === 'test' ? TEST_TABLE_ID : LIVE_TABLE_ID)

            if (!readyIdentity) {
              return (
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-8 text-center text-gray-700">
                  Chargement de votre compte sécurisé…
                </div>
              )
            }

            return (
              <stripe-pricing-table
                key={`${userId}-${userEmail}`}
                pricing-table-id={tableId}
                publishable-key={publishableKey}
                customer-email={userEmail}
                client-reference-id={userId}
              ></stripe-pricing-table>
            )
          })()}
        </div>

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
