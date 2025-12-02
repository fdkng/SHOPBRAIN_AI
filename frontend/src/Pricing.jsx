import React, { useState } from 'react'

export default function Pricing() {
  const [billingCycle, setBillingCycle] = useState('monthly')
  const [showModal, setShowModal] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState(null)

  const handleSubscribe = (plan) => {
    setSelectedPlan(plan)
    setShowModal(true)
  }

  const plans = [
    {
      name: 'Standard',
      price: '99',
      priceYearly: '950',
      color: 'from-blue-500 to-cyan-600',
      stripeLink: 'https://buy.stripe.com/4gMfZj0q1fk9dQk4sh',
      badge: null,
      features: [
        { text: 'Jusqu\'à 5 produits optimisés', icon: '🎯', included: true },
        { text: 'Titres + descriptions IA', icon: '✍️', included: true },
        { text: 'Ajustements automatiques', icon: '⚡', included: true },
        { text: 'Rapport hebdomadaire', icon: '📊', included: true },
        { text: 'Cross-sell basique', icon: '🛒', included: true },
        { text: 'Support email', icon: '💬', included: true },
        { text: 'Analyses avancées', icon: '📈', included: false },
        { text: 'API access', icon: '🔌', included: false },
      ],
    },
    {
      name: 'Pro',
      price: '199',
      priceYearly: '1,910',
      color: 'from-purple-500 to-pink-600',
      stripeLink: 'https://buy.stripe.com/bJebJ36Op5Jz13y3od',
      badge: '⭐ POPULAIRE',
      popular: true,
      features: [
        { text: 'Jusqu\'à 20 produits optimisés', icon: '🎯', included: true },
        { text: 'Titres + descriptions avancées IA', icon: '✍️', included: true },
        { text: 'Ajustements automatiques illimités', icon: '⚡', included: true },
        { text: 'Rapports détaillés quotidiens', icon: '📊', included: true },
        { text: 'Cross-sell & upsell avancés', icon: '🛒', included: true },
        { text: 'Support prioritaire 24/7', icon: '💬', included: true },
        { text: 'Analyses prédictives IA', icon: '📈', included: true },
        { text: 'API access complet', icon: '🔌', included: false },
      ],
    },
    {
      name: 'Premium',
      price: '299',
      priceYearly: '2,870',
      color: 'from-yellow-500 to-orange-600',
      stripeLink: 'https://buy.stripe.com/bJeaEZdcN7RHcMg9MB',
      badge: '🚀 ENTREPRISE',
      features: [
        { text: 'Produits illimités', icon: '🎯', included: true },
        { text: 'IA GPT-4 Turbo avancée', icon: '✍️', included: true },
        { text: 'Automatisation totale', icon: '⚡', included: true },
        { text: 'Dashboard temps réel', icon: '📊', included: true },
        { text: 'Stratégies de vente IA', icon: '🛒', included: true },
        { text: 'Support dédié + onboarding', icon: '💬', included: true },
        { text: 'Analyses prédictives avancées', icon: '📈', included: true },
        { text: 'API webhooks personnalisés', icon: '🔌', included: true },
      ],
    },
  ]

  const displayPrice = (plan) => {
    return billingCycle === 'monthly' ? plan.price : plan.priceYearly
  }

  const savings = (plan) => {
    const monthly = parseFloat(plan.price) * 12
    const yearly = parseFloat(plan.priceYearly.replace(',', ''))
    return Math.round(((monthly - yearly) / monthly) * 100)
  }

  return (
    <div className="min-h-screen py-20 px-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-block px-6 py-2 bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-400/30 rounded-full text-cyan-400 text-sm font-semibold mb-6">
            💎 Plans & Tarifs
          </div>
          <h1 className="text-6xl md:text-7xl font-black text-white mb-6">
            Un prix <span className="bg-gradient-to-r from-cyan-400 to-purple-600 bg-clip-text text-transparent">transparent</span>
          </h1>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto mb-10">
            Choisissez le plan qui correspond à vos ambitions. Changez ou annulez à tout moment.
          </p>

          {/* Billing Toggle */}
          <div className="flex items-center justify-center gap-4 mb-4">
            <span className={`text-lg font-semibold ${billingCycle === 'monthly' ? 'text-white' : 'text-gray-500'}`}>
              Mensuel
            </span>
            <button
              onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly')}
              className="relative w-16 h-8 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-full transition-all"
            >
              <div className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform ${billingCycle === 'yearly' ? 'translate-x-8' : ''}`} />
            </button>
            <span className={`text-lg font-semibold ${billingCycle === 'yearly' ? 'text-white' : 'text-gray-500'}`}>
              Annuel
            </span>
            {billingCycle === 'yearly' && (
              <span className="px-3 py-1 bg-green-500/20 border border-green-400/30 rounded-full text-green-400 text-sm font-bold">
                💰 Économisez jusqu'à 20%
              </span>
            )}
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 max-w-7xl mx-auto mb-20">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl rounded-3xl p-8 border-2 ${
                plan.popular 
                  ? 'border-purple-500 shadow-2xl shadow-purple-500/30 transform md:scale-110' 
                  : 'border-white/20 hover:border-white/40'
              } transition-all duration-500 hover:transform hover:scale-105`}
            >
              {/* Badge */}
              {plan.badge && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-purple-500 via-pink-600 to-purple-500 text-white px-6 py-2 rounded-full text-sm font-bold shadow-xl animate-gradient">
                  {plan.badge}
                </div>
              )}

              {/* Savings badge for yearly */}
              {billingCycle === 'yearly' && (
                <div className="absolute -top-4 -right-4 bg-green-500 text-white px-4 py-2 rounded-full text-xs font-bold shadow-xl rotate-12">
                  -{savings(plan)}%
                </div>
              )}

              <div className="text-center mb-8">
                <h3 className={`text-3xl font-black mb-4 bg-gradient-to-r ${plan.color} bg-clip-text text-transparent`}>
                  {plan.name}
                </h3>
                <div className="flex items-baseline justify-center gap-2 mb-2">
                  <span className="text-6xl font-black text-white">{displayPrice(plan)}</span>
                  <div className="text-left">
                    <span className="text-gray-400 text-lg">$</span>
                    <div className="text-gray-400 text-sm">/{billingCycle === 'monthly' ? 'mois' : 'an'}</div>
                  </div>
                </div>
                {billingCycle === 'yearly' && (
                  <p className="text-sm text-gray-400">
                    ({plan.price}$/mois facturé annuellement)
                  </p>
                )}
              </div>

              <ul className="space-y-4 mb-8">
                {plan.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <span className={`text-xl ${feature.included ? 'opacity-100' : 'opacity-30'}`}>
                      {feature.included ? '✅' : '❌'}
                    </span>
                    <span className={`text-sm ${feature.included ? 'text-gray-200' : 'text-gray-500'}`}>
                      {feature.icon} {feature.text}
                    </span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleSubscribe(plan)}
                className={`block w-full text-center bg-gradient-to-r ${plan.color} text-white font-bold py-4 rounded-xl hover:shadow-2xl transition-all transform hover:scale-105 shadow-lg ${plan.popular ? 'animate-pulse' : ''}`}
              >
                Commencer avec {plan.name}
              </button>
            </div>
          ))}
        </div>

        {/* Modal Stripe */}
        {showModal && selectedPlan && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={() => setShowModal(false)}>
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl max-w-md w-full p-8 border border-white/20 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold text-white">Finaliser l'abonnement</h3>
                <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white text-2xl">×</button>
              </div>
              
              <div className="bg-white/5 rounded-2xl p-6 mb-6 border border-white/10">
                <div className={`text-xl font-bold bg-gradient-to-r ${selectedPlan.color} bg-clip-text text-transparent mb-2`}>
                  Plan {selectedPlan.name}
                </div>
                <div className="text-4xl font-black text-white mb-4">
                  {displayPrice(selectedPlan)}$ <span className="text-lg text-gray-400">/{billingCycle === 'monthly' ? 'mois' : 'an'}</span>
                </div>
                <ul className="space-y-2 text-sm text-gray-300">
                  {selectedPlan.features.filter(f => f.included).slice(0, 3).map((f, idx) => (
                    <li key={idx}>✅ {f.text}</li>
                  ))}
                </ul>
              </div>

              <a
                href={selectedPlan.stripeLink}
                target="_blank"
                rel="noopener noreferrer"
                className={`block w-full text-center bg-gradient-to-r ${selectedPlan.color} text-white font-bold py-4 rounded-xl hover:shadow-2xl transition-all mb-4`}
              >
                Payer avec Stripe 💳
              </a>

              <p className="text-xs text-gray-400 text-center">
                🔒 Paiement sécurisé par Stripe • Annulation en un clic
              </p>
            </div>
          </div>
        )}

        {/* FAQ Section */}
        <div className="max-w-4xl mx-auto mt-32">
          <h2 className="text-4xl font-black text-center text-white mb-12">Questions fréquentes</h2>
          <div className="space-y-6">
            {[
              { q: 'Puis-je changer de plan à tout moment ?', a: 'Oui, vous pouvez upgrader ou downgrader votre plan à tout moment. Les changements sont appliqués immédiatement.' },
              { q: 'Y a-t-il un engagement ?', a: 'Non, aucun engagement. Vous pouvez annuler votre abonnement en un clic depuis votre dashboard.' },
              { q: 'Comment fonctionne l\'essai gratuit ?', a: '14 jours d\'essai gratuit sans carte de crédit. Accès complet à toutes les fonctionnalités du plan choisi.' },
              { q: 'Quels moyens de paiement acceptez-vous ?', a: 'Nous acceptons toutes les cartes de crédit via Stripe (Visa, Mastercard, Amex) ainsi que PayPal.' },
            ].map((faq, idx) => (
              <div key={idx} className="bg-white/5 backdrop-blur-lg rounded-2xl p-6 border border-white/10 hover:border-cyan-400/30 transition-all">
                <h3 className="text-lg font-bold text-white mb-2">{faq.q}</h3>
                <p className="text-gray-400">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Trust badges */}
        <div className="text-center mt-20 pb-20">
          <div className="flex flex-wrap justify-center items-center gap-8 text-gray-400 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🔒</span>
              <span>Paiement 100% sécurisé</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">✅</span>
              <span>Satisfait ou remboursé 30j</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">⚡</span>
              <span>Activation instantanée</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">💳</span>
              <span>Pas de frais cachés</span>
            </div>
          </div>
          <p className="mt-8 text-xs text-gray-500">
            En vous inscrivant, vous acceptez nos <span className="text-cyan-400 cursor-pointer hover:underline">conditions d'utilisation</span> et notre <span className="text-cyan-400 cursor-pointer hover:underline">politique de confidentialité</span>.
          </p>
        </div>
      </div>
    </div>
  )
}
