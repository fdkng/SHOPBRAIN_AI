import React, { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://jgmsfadayzbgykzajvmw.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnbXNmYWRheXpiZ3lremFqdm13Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQwODk0NTksImV4cCI6MjA3OTY2NTQ1OX0.sg0O2QGdoKO5Zb6vcRJr5pSu2zlaxU3r7nHtyXb07hg'
)

// Stripe Checkout - Redirect to Netlify payment page
const PAYMENT_URL = 'https://agent-691bc09978ef5d16ca1--abonnementshopbrainai.netlify.app/'

const PRICING_PLANS = [
  {
    name: 'Starter',
    price: '€99',
    popular: false,
    features: ['Analyse 50 produits/mois', 'Support email', 'Exports CSV', '1 compte utilisateur'],
    cta: 'Commencer',
    plan_id: 'starter'
  },
  {
    name: 'Pro',
    price: '€199',
    popular: true,
    features: ['Analyse 500 produits/mois', 'Support prioritaire', 'Exports avancés', '5 comptes utilisateurs', 'API access'],
    cta: 'Commencer maintenant',
    plan_id: 'pro'
  },
  {
    name: 'Enterprise',
    price: '€299',
    popular: false,
    features: ['Analyse illimitée', 'Support 24/7', 'Intégrations custom', 'Comptes utilisateurs illimités', 'Dedicated account manager'],
    cta: 'Contacter sales',
    plan_id: 'enterprise'
  }
]

export default function App() {
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [email, setEmail] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Ensure magic link redirects to production site, not localhost
  const getRedirectUrl = () => {
    if (import.meta.env.VITE_SITE_URL) return import.meta.env.VITE_SITE_URL
    if (typeof window !== 'undefined') return window.location.origin + window.location.pathname
    return 'https://fdkng.github.io/SHOPBRAIN_AI/'
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    try {
      const redirectTo = getRedirectUrl()
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      })
      if (error) throw error
      setAuthMessage('✅ Email envoyé ! Vérifiez votre boîte de réception.')
      setEmail('')
    } catch (error) {
      setAuthMessage('❌ Erreur : ' + error.message)
    }
  }

  const handleStripeCheckout = () => {
    window.location.href = PAYMENT_URL
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${
        scrolled ? 'bg-white/80 backdrop-blur-md shadow-sm border-b border-gray-200' : 'bg-white border-b border-gray-100'
      }`}>
        <div className="max-w-7xl mx-auto px-6 sm:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                💡
              </div>
              <span className="text-lg sm:text-xl font-semibold text-gray-900">ShopBrain AI</span>
            </div>
            
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm font-normal text-gray-600 hover:text-gray-900 transition-colors">
                Fonctionnalités
              </a>
              <a href="#how-it-works" className="text-sm font-normal text-gray-600 hover:text-gray-900 transition-colors">
                Comment ça marche
              </a>
              <a href="#pricing" className="text-sm font-normal text-gray-600 hover:text-gray-900 transition-colors">
                Tarifs
              </a>
            </div>

            <button
              onClick={() => setShowAuthModal(true)}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-full hover:bg-blue-700 transition-all hover:scale-105 shadow-md"
            >
              Se connecter
            </button>
          </div>
        </div>
      </nav>

      {/* Auth Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-fadeIn" onClick={() => setShowAuthModal(false)}>
          <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl animate-scaleIn" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-semibold text-gray-900">Se connecter</h3>
              <button onClick={() => setShowAuthModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl font-light">×</button>
            </div>
            <p className="text-gray-600 mb-6 text-sm">Entrez votre email pour recevoir un lien de connexion magique.</p>
            <form onSubmit={handleLogin} className="space-y-4">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="votre@email.com"
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm"
              />
              <button
                type="submit"
                className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors text-sm"
              >
                Envoyer le lien de connexion
              </button>
            </form>
            {authMessage && (
              <div className="mt-4 p-3 bg-gray-100 rounded-xl text-xs text-gray-700">
                {authMessage}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6 animate-fadeIn">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-gray-900 tracking-tight leading-[1.05] mb-6">
            Analysez vos produits avec l'IA
          </h1>
          <p className="text-lg md:text-xl text-gray-600 mb-10 max-w-2xl mx-auto leading-relaxed">
            Optimisez vos listes et augmentez vos ventes avec des insights intelligents. L'IA au service de votre e-commerce Shopify.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => document.getElementById('pricing').scrollIntoView({ behavior: 'smooth' })}
              className="px-8 py-4 bg-blue-600 text-white text-base font-medium rounded-full hover:bg-blue-700 transition-all hover:scale-105 shadow-lg hover:shadow-xl"
            >
              Commencer maintenant
            </button>
            <button
              onClick={() => document.getElementById('features').scrollIntoView({ behavior: 'smooth' })}
              className="px-8 py-4 text-blue-600 text-base font-medium border border-blue-600 rounded-full hover:bg-blue-50 transition-all hover:scale-105"
            >
              En savoir plus
            </button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 text-center mb-16">Fonctionnalités puissantes</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {[
              {
                icon: '⚡',
                title: 'Analyse IA instantanée',
                desc: 'Analysez vos produits en quelques secondes avec nos modèles d\'IA avancés'
              },
              {
                icon: '✨',
                title: 'Optimisation automatique',
                desc: 'Générez des titres et descriptions optimisés pour les moteurs de recherche'
              },
              {
                icon: '📈',
                title: 'Insights produits',
                desc: 'Découvrez les tendances du marché et optimisez votre stratégie'
              },
              {
                icon: '🔗',
                title: 'Intégration Shopify',
                desc: 'Connectez directement votre magasin Shopify en un clic'
              }
            ].map((feature, idx) => (
              <div key={idx} className="p-8 bg-white border border-gray-200 rounded-2xl hover:shadow-lg hover:scale-[1.02] transition-all">
                <div className="text-4xl mb-4">{feature.icon}</div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-sm text-gray-600">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 text-center mb-16">Comment ça marche</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                number: '1',
                icon: '🔗',
                title: 'Connectez Shopify',
                desc: 'Liez votre magasin en toute sécurité'
              },
              {
                number: '2',
                icon: '👆',
                title: 'Sélectionnez produits',
                desc: 'Choisissez les articles à analyser'
              },
              {
                number: '3',
                icon: '💡',
                title: 'Recevez insights',
                desc: 'Obtenez des recommandations personnalisées'
              }
            ].map((step, idx) => (
              <div key={idx} className="text-center">
                <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-6 shadow-lg">
                  {step.number}
                </div>
                <div className="w-12 h-12 mx-auto bg-gray-100 rounded-xl flex items-center justify-center mb-4 text-2xl">
                  {step.icon}
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{step.title}</h3>
                <p className="text-sm text-gray-600">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 text-center mb-4">Tarification simple et transparente</h2>
          <p className="text-center text-gray-600 mb-16">Choisissez le plan qui correspond à vos besoins</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {PRICING_PLANS.map((plan, idx) => (
              <div
                key={idx}
                className={`relative p-8 bg-white rounded-2xl transition-all duration-300 hover:shadow-lg ${
                  plan.popular ? 'border-2 border-blue-600 shadow-md md:scale-105' : 'border border-gray-200'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="bg-blue-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                      Populaire
                    </span>
                  </div>
                )}
                <h3 className="text-lg font-semibold text-gray-900 mb-4">{plan.name}</h3>
                <div className="mb-6">
                  <span className="text-4xl font-bold text-gray-900">{plan.price}</span>
                  <span className="text-gray-600 text-sm">/mois</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, fidx) => (
                    <li key={fidx} className="flex items-center gap-3">
                      <span className="text-blue-600">✓</span>
                      <span className="text-sm text-gray-600">{feature}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={handleStripeCheckout}
                  className={`w-full py-3 rounded-full text-sm font-medium transition-all hover:scale-105 ${
                    plan.popular
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-white text-gray-900 border border-gray-300 hover:border-blue-600'
                  }`}
                >
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
            Prêt à transformer votre Shopify?
          </h2>
          <p className="text-lg text-gray-600 mb-10">
            Rejoignez des centaines de sellers qui utilisent ShopBrain AI
          </p>
          <button
            onClick={() => document.getElementById('pricing').scrollIntoView({ behavior: 'smooth' })}
            className="px-8 py-4 bg-blue-600 text-white text-base font-medium rounded-full hover:bg-blue-700 transition-all hover:scale-105 shadow-lg hover:shadow-xl"
          >
            Commencer gratuitement
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-12 px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            <div>
              <h4 className="text-xs font-semibold text-gray-900 mb-4 tracking-wide">PRODUIT</h4>
              <ul className="space-y-3 text-sm text-gray-600">
                <li><a href="#features" className="hover:text-gray-900 transition-colors">Fonctionnalités</a></li>
                <li><a href="#pricing" className="hover:text-gray-900 transition-colors">Tarifs</a></li>
                <li><a href="#how-it-works" className="hover:text-gray-900 transition-colors">Comment ça marche</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-gray-900 mb-4 tracking-wide">ENTREPRISE</h4>
              <ul className="space-y-3 text-sm text-gray-600">
                <li><a href="#" className="hover:text-gray-900 transition-colors">À propos</a></li>
                <li><a href="#" className="hover:text-gray-900 transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-gray-900 transition-colors">Contact</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-gray-900 mb-4 tracking-wide">LÉGAL</h4>
              <ul className="space-y-3 text-sm text-gray-600">
                <li><a href="#" className="hover:text-gray-900 transition-colors">Politique de confidentialité</a></li>
                <li><a href="#" className="hover:text-gray-900 transition-colors">Conditions d'utilisation</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-200 pt-8">
            <p className="text-center text-sm text-gray-600">© 2025 ShopBrain AI. Tous droits réservés.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
