import React from 'react'

export default function Pricing() {
  const plans = [
    {
      name: 'Standard',
      price: '99',
      color: 'from-blue-500 to-cyan-600',
      stripeLink: 'https://buy.stripe.com/4gMfZj0q1fk9dQk4sh',
      features: [
        { text: 'Détecte jusqu\'à 5 produits faibles', icon: '🔍' },
        { text: 'Titres + descriptions simples', icon: '✍️' },
        { text: 'Actions sur 5 produits max', icon: '⚡' },
        { text: 'Rapport hebdomadaire PDF/email', icon: '📊' },
        { text: 'Cross-sell limité aux produits principaux', icon: '🛒' },
      ],
    },
    {
      name: 'Pro',
      price: '199',
      color: 'from-purple-500 to-pink-600',
      stripeLink: 'https://buy.stripe.com/bJebJ36Op5Jz13y3od',
      popular: true,
      features: [
        { text: 'Détecte jusqu\'à 20 produits faibles', icon: '🔍' },
        { text: 'Titres + descriptions avancées', icon: '✍️' },
        { text: 'Ajustements sur 20 produits', icon: '⚡' },
        { text: 'Rapport hebdo complet', icon: '📊' },
        { text: 'Suggestions cross-sell avancées', icon: '🛒' },
      ],
    },
    {
      name: 'Premium',
      price: '299',
      color: 'from-yellow-500 to-orange-600',
      stripeLink: 'https://buy.stripe.com/bJeaEZdcN7RHcMg9MB',
      features: [
        { text: 'Détecte TOUS les produits faibles', icon: '🔍' },
        { text: 'Descriptions optimisées conversions', icon: '✍️' },
        { text: 'Ajustements automatiques illimités', icon: '⚡' },
        { text: 'Analyses avancées + insights', icon: '📊' },
        { text: 'Cross-sell & upsell maximaux', icon: '🛒' },
      ],
    },
  ]

  return (
    <div className="min-h-screen py-20 px-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-white mb-4">
            Choisissez votre abonnement
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            Optimisez vos produits et boostez vos ventes grâce à notre IA intelligente
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative bg-white/10 backdrop-blur-lg rounded-3xl p-8 border-2 ${
                plan.popular 
                  ? 'border-cyan-400 shadow-2xl shadow-cyan-500/50 transform scale-105' 
                  : 'border-white/20 hover:border-white/40'
              } transition-all`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-6 py-2 rounded-full text-sm font-bold shadow-lg">
                  ⭐ POPULAIRE
                </div>
              )}

              <div className="text-center mb-8">
                <h3 className={`text-3xl font-bold mb-4 bg-gradient-to-r ${plan.color} bg-clip-text text-transparent`}>
                  {plan.name}
                </h3>
                <div className="flex items-baseline justify-center gap-2">
                  <span className="text-5xl font-bold text-white">{plan.price} $</span>
                  <span className="text-gray-400">/mois</span>
                </div>
              </div>

              <ul className="space-y-4 mb-8">
                {plan.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-3 text-gray-200">
                    <span className="text-2xl">{feature.icon}</span>
                    <span>{feature.text}</span>
                  </li>
                ))}
              </ul>

              <a
                href={plan.stripeLink}
                target="_blank"
                rel="noopener noreferrer"
                className={`block w-full text-center bg-gradient-to-r ${plan.color} text-white font-bold py-4 rounded-xl hover:shadow-2xl transition-all transform hover:scale-105`}
              >
                S'inscrire {plan.name} – {plan.price}$/mois
              </a>
            </div>
          ))}
        </div>

        {/* Footer Note */}
        <div className="text-center mt-16 text-gray-400 max-w-2xl mx-auto">
          <p className="text-sm">
            En vous inscrivant, vous acceptez nos conditions d'utilisation et notre politique de confidentialité.
          </p>
        </div>
      </div>
    </div>
  )
}
