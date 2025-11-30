import React, { useState } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

const PLANS = [
  {
    name: 'Starter',
    price: '99',
    description: 'Perfect to get started',
    features: ['100 product optimizations/month', 'Basic analytics', 'Email support'],
    priceId: 'price_1SQfzmPSvADOSbOzpxoK8hG3',
  },
  {
    name: 'Pro',
    price: '199',
    description: 'For growing businesses',
    features: ['Unlimited optimizations', 'Advanced analytics', 'Priority support', 'API access'],
    priceId: 'price_1SQg0xPSvADOSbOzrZbOGs06',
    popular: true,
  },
  {
    name: 'Enterprise',
    price: '299',
    description: 'For large-scale operations',
    features: ['Custom optimizations', 'Dedicated support', 'Advanced integrations', 'Team access'],
    priceId: 'price_1SQg3CPSvADOSbOzHXSoDkGN',
  },
]

export default function Pricing({ user }) {
  const [loading, setLoading] = useState(null)
  const [message, setMessage] = useState('')

  async function handleCheckout(plan) {
    setLoading(plan.price)
    setMessage('')

    try {
      const res = await fetch(`${API_BASE}/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('sb_token') || ''}`,
        },
        body: JSON.stringify({ plan: plan.price, email: user.email }),
      })

      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        setMessage('Error creating checkout session')
      }
    } catch (e) {
      setMessage('Network error')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold mb-2">Plans & Pricing</h2>
        <p className="text-gray-600">Essai gratuit 14 jours inclus avec tous les plans</p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {PLANS.map(plan => (
          <div
            key={plan.price}
            className={`rounded-lg border-2 overflow-hidden transition ${
              plan.popular ? 'border-blue-600 shadow-xl' : 'border-gray-200'
            }`}
          >
            {plan.popular && (
              <div className="bg-blue-600 text-white text-center py-2 font-semibold">
                MOST POPULAR
              </div>
            )}

            <div className="p-6">
              <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
              <p className="text-gray-600 text-sm mb-4">{plan.description}</p>

              <div className="mb-4">
                <span className="text-4xl font-bold">${plan.price}</span>
                <span className="text-gray-600">/month</span>
              </div>

              <button
                onClick={() => handleCheckout(plan)}
                disabled={loading === plan.price}
                className={`w-full py-2 px-4 rounded-lg font-semibold transition ${
                  plan.popular
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'border-2 border-blue-600 text-blue-600 hover:bg-blue-50'
                } disabled:opacity-50`}
              >
                {loading === plan.price ? 'Processing...' : 'Start Free Trial'}
              </button>

              <ul className="mt-6 space-y-3">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-center">
                    <span className="text-green-500 mr-2">✓</span>
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>

      {message && (
        <div className="p-4 bg-red-100 text-red-800 rounded-lg text-center">
          {message}
        </div>
      )}
    </div>
  )
}
