import React from 'react'

export default function App() {
  return (
    <div className="min-h-screen bg-white">
      {/* Apple-style Navigation */}
      <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-xl border-b border-gray-200/50 z-50">
        <div className="max-w-[980px] mx-auto px-6">
          <div className="flex items-center justify-between h-11">
            <div className="flex items-center gap-2">
              <img 
                src="https://i.postimg.cc/BbVk5fzw/upscalemedia-transformed.png" 
                alt="ShopBrain AI" 
                className="h-5 w-auto"
              />
              <span className="text-xl font-semibold text-gray-900">ShopBrain</span>
            </div>
            
            <div className="flex items-center gap-8">
              <a href="#features" className="text-xs font-normal text-gray-600 hover:text-gray-900 transition-colors">
                Fonctionnalités
              </a>
              <a href="#how-it-works" className="text-xs font-normal text-gray-600 hover:text-gray-900 transition-colors">
                Comment ça marche
              </a>
              <a
                href="https://agent-691bc09978ef5d16ca1--abonnementshopbrainai.netlify.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1 bg-blue-600 text-white text-xs font-medium rounded-full hover:bg-blue-700 transition-colors"
              >
                S'abonner
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section - Apple Style */}
      <section className="pt-32 pb-16 px-6">
        <div className="max-w-[980px] mx-auto text-center">
          <h1 className="text-6xl md:text-7xl font-semibold text-gray-900 tracking-tight leading-[1.05] mb-6">
            L'IA qui transforme<br />vos ventes Shopify.
          </h1>
          <p className="text-xl md:text-2xl text-gray-600 font-normal mb-8 max-w-2xl mx-auto leading-relaxed">
            Optimisation automatique de vos produits, descriptions et stratégies de vente.<br/>
            Augmentation moyenne de <span className="text-gray-900 font-medium">+127%</span> des ventes.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <a
              href="https://agent-691bc09978ef5d16ca1--abonnementshopbrainai.netlify.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 bg-blue-600 text-white text-base font-medium rounded-full hover:bg-blue-700 transition-all"
            >
              Commencer maintenant
            </a>
            <button className="px-6 py-3 text-blue-600 text-base font-medium hover:underline">
              En savoir plus →
            </button>
          </div>
        </div>
      </section>

      {/* Product Showcase - Apple Style */}
      <section className="py-16 px-6 bg-gray-50">
        <div className="max-w-[1200px] mx-auto">
          <div className="bg-white rounded-3xl overflow-hidden shadow-2xl">
            <div className="p-12 md:p-20 text-center">
              <div className="inline-block p-8 bg-gradient-to-br from-blue-50 to-purple-50 rounded-3xl mb-8">
                <div className="text-7xl">🧠</div>
              </div>
              <h2 className="text-4xl md:text-5xl font-semibold text-gray-900 mb-6 tracking-tight">
                Intelligence artificielle avancée
              </h2>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
                Notre IA analyse en temps réel vos produits et génère automatiquement des descriptions qui convertissent.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features - Apple Grid Style */}
      <section id="features" className="py-20 px-6">
        <div className="max-w-[1200px] mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-5xl md:text-6xl font-semibold text-gray-900 tracking-tight mb-4">
              Une suite complète.
            </h2>
            <p className="text-xl text-gray-600">
              Tout ce dont vous avez besoin pour réussir.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                icon: '🔍',
                title: 'Détection intelligente',
                desc: 'Repère automatiquement les produits sous-performants et applique les corrections nécessaires.',
              },
              {
                icon: '✍️',
                title: 'Réécriture IA',
                desc: 'Génère des titres et descriptions optimisés pour maximiser les conversions.',
              },
              {
                icon: '⚡',
                title: 'Actions automatiques',
                desc: 'Ajuste les prix, images et descriptions sans aucune intervention manuelle.',
              },
              {
                icon: '📊',
                title: 'Rapports avancés',
                desc: 'Tableaux de bord détaillés et insights sur la performance de chaque produit.',
              },
            ].map((feature, idx) => (
              <div key={idx} className="bg-gray-50 rounded-3xl p-10 hover:bg-gray-100 transition-colors">
                <div className="text-5xl mb-4">{feature.icon}</div>
                <h3 className="text-2xl font-semibold text-gray-900 mb-3">{feature.title}</h3>
                <p className="text-lg text-gray-600 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works - Apple Style */}
      <section id="how-it-works" className="py-20 px-6 bg-gray-50">
        <div className="max-w-[980px] mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-5xl md:text-6xl font-semibold text-gray-900 tracking-tight mb-4">
              Simple. Puissant. Efficace.
            </h2>
            <p className="text-xl text-gray-600">
              Trois étapes pour transformer votre boutique.
            </p>
          </div>

          <div className="space-y-20">
            {[
              {
                step: '1',
                title: 'Connectez votre boutique',
                desc: 'Un clic suffit pour synchroniser votre boutique Shopify avec ShopBrain.',
                icon: '🔗',
              },
              {
                step: '2',
                title: 'L\'IA analyse vos produits',
                desc: 'Notre intelligence artificielle scanne et identifie les opportunités d\'optimisation.',
                icon: '🧠',
              },
              {
                step: '3',
                title: 'Les ventes décollent',
                desc: 'Les optimisations automatiques boostent vos conversions et votre chiffre d\'affaires.',
                icon: '📈',
              },
            ].map((item, idx) => (
              <div key={idx} className="flex items-center gap-12">
                <div className="flex-shrink-0">
                  <div className="w-20 h-20 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center text-3xl shadow-lg">
                    {item.icon}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-500 mb-2">ÉTAPE {item.step}</div>
                  <h3 className="text-3xl font-semibold text-gray-900 mb-3">{item.title}</h3>
                  <p className="text-xl text-gray-600 leading-relaxed max-w-xl">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section - Apple Style */}
      <section className="py-24 px-6">
        <div className="max-w-[980px] mx-auto text-center">
          <h2 className="text-5xl md:text-6xl font-semibold text-gray-900 tracking-tight mb-6">
            Prêt à transformer<br />vos ventes ?
          </h2>
          <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
            Rejoignez les milliers de marchands qui font confiance à ShopBrain AI.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <a
              href="https://agent-691bc09978ef5d16ca1--abonnementshopbrainai.netlify.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="px-8 py-4 bg-blue-600 text-white text-lg font-medium rounded-full hover:bg-blue-700 transition-all shadow-lg hover:shadow-xl"
            >
              Choisir mon abonnement
            </a>
          </div>
          <p className="text-sm text-gray-500 mt-6">
            Essai gratuit 14 jours • Sans carte de crédit
          </p>
        </div>
      </section>

      {/* Footer - Apple Style */}
      <footer className="border-t border-gray-200 py-12 px-6">
        <div className="max-w-[980px] mx-auto">
          <div className="grid md:grid-cols-3 gap-8 mb-8">
            <div>
              <h4 className="text-xs font-semibold text-gray-900 mb-4 tracking-wide">PRODUIT</h4>
              <ul className="space-y-3 text-sm text-gray-600">
                <li><a href="#features" className="hover:text-gray-900 transition-colors">Fonctionnalités</a></li>
                <li><a href="https://agent-691bc09978ef5d16ca1--abonnementshopbrainai.netlify.app/" target="_blank" rel="noopener noreferrer" className="hover:text-gray-900 transition-colors">Tarifs</a></li>
                <li><a href="#" className="hover:text-gray-900 transition-colors">Intégrations</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-gray-900 mb-4 tracking-wide">ENTREPRISE</h4>
              <ul className="space-y-3 text-sm text-gray-600">
                <li><a href="#" className="hover:text-gray-900 transition-colors">À propos</a></li>
                <li><a href="#" className="hover:text-gray-900 transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-gray-900 transition-colors">Carrières</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-gray-900 mb-4 tracking-wide">SUPPORT</h4>
              <ul className="space-y-3 text-sm text-gray-600">
                <li><a href="#" className="hover:text-gray-900 transition-colors">Centre d'aide</a></li>
                <li><a href="#" className="hover:text-gray-900 transition-colors">Contact</a></li>
                <li><a href="#" className="hover:text-gray-900 transition-colors">Documentation API</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-200 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-xs text-gray-500">© 2025 ShopBrain AI. Tous droits réservés.</p>
            <div className="flex gap-6 text-xs text-gray-500">
              <a href="#" className="hover:text-gray-900 transition-colors">Confidentialité</a>
              <a href="#" className="hover:text-gray-900 transition-colors">Conditions</a>
              <a href="#" className="hover:text-gray-900 transition-colors">Cookies</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
