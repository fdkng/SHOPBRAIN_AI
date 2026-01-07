import React, { useEffect } from 'react'

// Prefill email/client reference so Stripe checkout is smoother
// Supports test mode via URL params: ?mode=test&pk=pk_test_...&ptid=prctbl_test_...
export default function StripePricingTable({ userEmail, userId }) {
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

            return (
              <stripe-pricing-table
                pricing-table-id={tableId}
                publishable-key={publishableKey}
                customer-email={userEmail || undefined}
                client-reference-id={userId || undefined}
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
      </div>
    </div>
  )
}
