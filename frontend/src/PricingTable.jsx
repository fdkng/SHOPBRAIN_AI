import React from 'react'

const PLANS = [
  {
    id: 'standard',
    name: 'Standard',
    price: '$99/mois',
    description: 'Pour lancer ShopBrain AI avec les fonctions essentielles.',
    features: ['50 produits / mois', 'Optimisation titres et prix', 'Rapport mensuel', 'Essai gratuit de 14 jours'],
    accent: 'border-orange-200'
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$199/mois',
    description: 'Le meilleur choix pour une boutique en croissance.',
    features: ['500 produits / mois', 'Descriptions IA', 'Cross-sell et image reco', 'Support prioritaire'],
    accent: 'border-teal-300 ring-2 ring-teal-100'
  },
  {
    id: 'premium',
    name: 'Premium',
    price: '$299/mois',
    description: 'Le plan complet pour tout automatiser à grande échelle.',
    features: ['Produits illimités', 'Actions avancées', 'Fonctions prédictives', 'Support 24/7'],
    accent: 'border-orange-200'
  }
]

export default function StripePricingTable({ userEmail, onCheckout }) {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            Choisissez votre plan
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Cette page utilise maintenant le checkout backend sécurisé pour garantir que chaque abonnement est relié au bon compte utilisateur.
          </p>
          <p className="text-sm text-gray-500 mt-4">
            Compte connecté : <span className="font-semibold text-gray-700">{userEmail}</span>
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map((plan) => (
            <div key={plan.id} className={`rounded-3xl border bg-white p-8 shadow-sm ${plan.accent}`}>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900">{plan.name}</h2>
                <p className="text-4xl font-bold text-gray-900 mt-3">{plan.price}</p>
                <p className="text-sm text-gray-500 mt-3">{plan.description}</p>
              </div>

              <ul className="space-y-3 mb-8 text-sm text-gray-700">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <span className="mt-0.5 text-green-600">✓</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => onCheckout?.(plan.id)}
                className="w-full rounded-full bg-[#1A1A2E] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#2A2A42]"
              >
                Continuer avec {plan.name}
              </button>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-2xl border border-blue-100 bg-blue-50 p-5 text-center text-sm text-blue-900">
          Après le paiement, Stripe redirige automatiquement vers le site et le backend persiste l’abonnement avec le bon `user_id`.
        </div>
      </div>
    </div>
  )
}
