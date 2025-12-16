import React, { useEffect } from 'react'

export default function StripePricingTable() {
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

        {/* Stripe Pricing Table Embed */}
        <stripe-pricing-table
          pricing-table-id="prctbl_1SczvvPSvADOSbOz3kGUkwwZ"
          publishable-key="pk_live_51REHBEPSvADOSbOzqhf7zqZKxA8T2OWPkMOeNsli4wc1n3GYgmTc7TboQlAL6GeeVSd7i5vfIG1IbkGeXvXqedyB009rEijMRi"
        ></stripe-pricing-table>
      </div>
    </div>
  )
}
