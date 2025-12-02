import React, { useState, useEffect } from 'react'

export default function Home({ setPage }) {
  const [scrollY, setScrollY] = useState(0)

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const stats = [
    { value: '10M+', label: 'Produits optimisés' },
    { value: '5,000+', label: 'Marchands actifs' },
    { value: '+127%', label: 'Augmentation moyenne des ventes' },
    { value: '24/7', label: 'Optimisation automatique' },
  ]

  const features = [
    {
      icon: '🧠',
      title: 'IA Avancée',
      description: 'Analyse en temps réel de vos produits et génère des descriptions qui convertissent',
      gradient: 'from-purple-500 to-pink-600'
    },
    {
      icon: '📈',
      title: 'Détection Intelligente',
      description: 'Identifie automatiquement les produits sous-performants et applique les corrections',
      gradient: 'from-cyan-500 to-blue-600'
    },
    {
      icon: '⚡',
      title: 'Actions Automatiques',
      description: 'Ajuste prix, images et descriptions sans intervention manuelle',
      gradient: 'from-yellow-500 to-orange-600'
    },
    {
      icon: '🎯',
      title: 'Cross-sell & Upsell',
      description: 'Suggère intelligemment des produits complémentaires pour augmenter votre panier moyen',
      gradient: 'from-green-500 to-teal-600'
    },
    {
      icon: '📊',
      title: 'Rapports Avancés',
      description: 'Tableaux de bord et insights détaillés sur la performance de chaque produit',
      gradient: 'from-indigo-500 to-purple-600'
    },
    {
      icon: '🔗',
      title: 'Intégration Shopify',
      description: 'Connexion en un clic, synchronisation automatique, zéro configuration technique',
      gradient: 'from-pink-500 to-rose-600'
    },
  ]

  return (
    <div className="min-h-screen text-white overflow-hidden">
      {/* Hero Section avec animation */}
      <div className="relative min-h-screen flex items-center justify-center px-6">
        {/* Animated background elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div 
            className="absolute top-1/4 -left-40 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl animate-pulse"
            style={{ transform: `translateY(${scrollY * 0.5}px)` }}
          />
          <div 
            className="absolute bottom-1/4 -right-40 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse"
            style={{ transform: `translateY(${-scrollY * 0.3}px)` }}
          />
        </div>

        <div className="relative z-10 max-w-6xl mx-auto text-center">
          <div className="mb-8 inline-block px-6 py-2 bg-cyan-500/10 border border-cyan-400/30 rounded-full text-cyan-400 text-sm font-semibold backdrop-blur-sm">
            🚀 Propulsé par GPT-4 & Intelligence Artificielle
          </div>
          
          <h1 className="text-6xl md:text-8xl font-black mb-8 leading-tight">
            <span className="bg-gradient-to-r from-white via-cyan-200 to-white bg-clip-text text-transparent animate-gradient">
              ShopBrain AI
            </span>
            <br />
            <span className="text-4xl md:text-5xl bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent">
              L'IA qui transforme vos ventes
            </span>
          </h1>
          
          <p className="text-xl md:text-2xl text-gray-300 mb-12 max-w-4xl mx-auto leading-relaxed">
            Connectez votre boutique Shopify et laissez notre IA <span className="text-cyan-400 font-bold">optimiser automatiquement</span> vos produits, 
            titres, descriptions et stratégies de vente. <span className="text-purple-400 font-bold">+127% de ventes en moyenne</span>.
          </p>

          <div className="flex flex-col sm:flex-row gap-6 justify-center items-center mb-16">
            <button
              onClick={() => setPage('pricing')}
              className="group relative px-10 py-5 bg-gradient-to-r from-cyan-500 via-blue-600 to-purple-600 text-white text-lg font-bold rounded-2xl shadow-2xl shadow-cyan-500/50 hover:shadow-cyan-500/80 transition-all transform hover:scale-105 hover:-translate-y-1"
            >
              <span className="relative z-10">Commencer maintenant</span>
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 rounded-2xl blur opacity-0 group-hover:opacity-70 transition-opacity" />
            </button>
            
            <button className="px-10 py-5 bg-white/10 backdrop-blur-md border border-white/20 text-white text-lg font-semibold rounded-2xl hover:bg-white/20 transition-all transform hover:scale-105">
              Voir la démo 🎥
            </button>
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-5xl mx-auto">
            {stats.map((stat, idx) => (
              <div key={idx} className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-all">
                <div className="text-4xl font-black bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent mb-2">
                  {stat.value}
                </div>
                <div className="text-gray-400 text-sm font-medium">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="max-w-7xl mx-auto px-6 py-32">
        <div className="text-center mb-20">
          <h2 className="text-5xl md:text-6xl font-black mb-6">
            <span className="bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent">
              Une suite complète
            </span>
          </h2>
          <p className="text-xl text-gray-400 max-w-3xl mx-auto">
            Tout ce dont vous avez besoin pour transformer votre boutique en machine à vendre
          </p>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, idx) => (
            <div 
              key={idx}
              className="group relative bg-gradient-to-br from-white/5 to-white/10 backdrop-blur-xl rounded-3xl p-8 border border-white/10 hover:border-white/30 transition-all duration-500 hover:transform hover:scale-105 hover:-translate-y-2"
            >
              {/* Gradient glow effect */}
              <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-20 rounded-3xl blur-xl transition-opacity duration-500`} />
              
              <div className="relative">
                <div className={`text-6xl mb-6 inline-block p-4 bg-gradient-to-br ${feature.gradient} rounded-2xl shadow-lg`}>
                  {feature.icon}
                </div>
                <h3 className={`text-2xl font-bold mb-4 bg-gradient-to-r ${feature.gradient} bg-clip-text text-transparent`}>
                  {feature.title}
                </h3>
                <p className="text-gray-300 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Social Proof / Testimonials */}
      <div className="max-w-7xl mx-auto px-6 py-32">
        <div className="text-center mb-20">
          <h2 className="text-5xl md:text-6xl font-black mb-6 text-white">
            Ils ont <span className="bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">explosé leurs ventes</span>
          </h2>
          <p className="text-xl text-gray-400">Des milliers de marchands nous font confiance</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {[
            { name: 'Sophie M.', store: 'Boutique Mode', result: '+240% de ventes en 3 mois', quote: 'ShopBrain a transformé ma boutique. Les descriptions générées par l\'IA convertissent 3x mieux !' },
            { name: 'Marc L.', store: 'Électronique Pro', result: '+180% de panier moyen', quote: 'Le cross-sell automatique a augmenté mon panier moyen de 180%. Incroyable ROI.' },
            { name: 'Claire D.', store: 'Cosmétiques Luxe', result: '+310% sur produits optimisés', quote: 'J\'ai arrêté de réécrire mes produits manuellement. L\'IA fait mieux que moi en 10 secondes.' },
          ].map((testimonial, idx) => (
            <div key={idx} className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl rounded-3xl p-8 border border-white/20 hover:border-cyan-400/50 transition-all">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-full flex items-center justify-center text-2xl font-bold">
                  {testimonial.name[0]}
                </div>
                <div>
                  <div className="font-bold text-lg text-white">{testimonial.name}</div>
                  <div className="text-gray-400 text-sm">{testimonial.store}</div>
                </div>
              </div>
              <div className="text-2xl font-black text-green-400 mb-4">{testimonial.result}</div>
              <p className="text-gray-300 italic">"{testimonial.quote}"</p>
            </div>
          ))}
        </div>
      </div>

      {/* How it works */}
      <div className="max-w-7xl mx-auto px-6 py-32">
        <div className="text-center mb-20">
          <h2 className="text-5xl md:text-6xl font-black mb-6 text-white">
            Simple comme <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">1, 2, 3</span>
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-12">
          {[
            { step: '01', title: 'Connectez Shopify', desc: 'Un clic suffit pour synchroniser votre boutique', icon: '🔗' },
            { step: '02', title: 'L\'IA analyse', desc: 'Notre intelligence artificielle scanne tous vos produits', icon: '🧠' },
            { step: '03', title: 'Ventes explosent', desc: 'Les optimisations automatiques boostent vos conversions', icon: '🚀' },
          ].map((item, idx) => (
            <div key={idx} className="text-center group">
              <div className="relative mb-8">
                <div className="text-8xl font-black text-white/5 absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-4">
                  {item.step}
                </div>
                <div className="relative text-6xl group-hover:scale-125 transition-transform duration-500">
                  {item.icon}
                </div>
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">{item.title}</h3>
              <p className="text-gray-400 text-lg">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA Section */}
      <div className="max-w-6xl mx-auto px-6 py-32">
        <div className="relative overflow-hidden bg-gradient-to-br from-cyan-600 via-blue-700 to-purple-800 rounded-[3rem] p-16 shadow-2xl">
          {/* Animated background */}
          <div className="absolute inset-0 bg-grid-white/[0.05] bg-[size:20px_20px]" />
          <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/30 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-cyan-500/30 rounded-full blur-3xl animate-pulse" />
          
          <div className="relative z-10 text-center">
            <h2 className="text-5xl md:text-6xl font-black mb-8 text-white">
              Prêt à <span className="text-yellow-300">10x</span> vos ventes ?
            </h2>
            <p className="text-2xl mb-12 text-cyan-100 max-w-3xl mx-auto">
              Rejoignez les <span className="font-bold">5,000+ marchands</span> qui optimisent leurs boutiques avec ShopBrain AI
            </p>
            <div className="flex flex-col sm:flex-row gap-6 justify-center">
              <button
                onClick={() => setPage('pricing')}
                className="group px-12 py-6 bg-white text-blue-600 text-xl font-black rounded-2xl hover:bg-yellow-300 transition-all transform hover:scale-110 shadow-2xl"
              >
                Démarrer maintenant
                <span className="inline-block ml-2 group-hover:translate-x-2 transition-transform">→</span>
              </button>
              <button className="px-12 py-6 bg-white/10 backdrop-blur-md border-2 border-white/30 text-white text-xl font-bold rounded-2xl hover:bg-white/20 transition-all">
                Parler à un expert
              </button>
            </div>
            <p className="mt-8 text-cyan-200 text-sm">
              ✨ Pas de carte de crédit requise • 🎁 Essai gratuit 14 jours • 🔒 Annulation en un clic
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/10 py-12">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <img src="https://i.postimg.cc/BbVk5fzw/upscalemedia-transformed.png" alt="ShopBrain" className="h-8" />
                <span className="text-xl font-bold text-white">ShopBrain AI</span>
              </div>
              <p className="text-gray-400 text-sm">L'IA qui transforme vos ventes Shopify</p>
            </div>
            <div>
              <h4 className="font-bold text-white mb-4">Produit</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li className="hover:text-cyan-400 cursor-pointer transition-colors">Fonctionnalités</li>
                <li className="hover:text-cyan-400 cursor-pointer transition-colors">Tarifs</li>
                <li className="hover:text-cyan-400 cursor-pointer transition-colors">Intégrations</li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-white mb-4">Entreprise</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li className="hover:text-cyan-400 cursor-pointer transition-colors">À propos</li>
                <li className="hover:text-cyan-400 cursor-pointer transition-colors">Blog</li>
                <li className="hover:text-cyan-400 cursor-pointer transition-colors">Carrières</li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-white mb-4">Support</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li className="hover:text-cyan-400 cursor-pointer transition-colors">Centre d'aide</li>
                <li className="hover:text-cyan-400 cursor-pointer transition-colors">Contact</li>
                <li className="hover:text-cyan-400 cursor-pointer transition-colors">API</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/10 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-gray-400 text-sm">© 2025 ShopBrain AI. Tous droits réservés.</p>
            <div className="flex gap-6 text-gray-400 text-sm">
              <span className="hover:text-cyan-400 cursor-pointer transition-colors">Confidentialité</span>
              <span className="hover:text-cyan-400 cursor-pointer transition-colors">Conditions</span>
              <span className="hover:text-cyan-400 cursor-pointer transition-colors">Cookies</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
