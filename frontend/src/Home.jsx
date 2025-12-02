import React from 'react'

export default function Home({ setPage }) {
  return (
    <div className="min-h-screen text-white">
      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-6 py-20 text-center">
        <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
          ShopBrain AI
        </h1>
        <p className="text-xl md:text-2xl text-gray-300 mb-12 max-w-3xl mx-auto">
          L'assistant intelligent qui <span className="text-cyan-400 font-semibold">optimise automatiquement</span> vos produits Shopify et <span className="text-cyan-400 font-semibold">booste vos ventes</span>
        </p>
        <button
          onClick={() => setPage('pricing')}
          className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-8 py-4 rounded-xl text-lg font-semibold hover:shadow-2xl hover:shadow-cyan-500/50 transition-all transform hover:scale-105"
        >
          Voir les abonnements →
        </button>
      </div>

      {/* Features Section */}
      <div className="max-w-7xl mx-auto px-6 py-16">
        <h2 className="text-4xl font-bold text-center mb-16 text-white">
          Fonctionnalités puissantes
        </h2>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {/* Feature 1 */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20 hover:border-cyan-400/50 transition-all">
            <div className="text-5xl mb-4">🔍</div>
            <h3 className="text-2xl font-bold mb-3 text-cyan-400">Détection intelligente</h3>
            <p className="text-gray-300 mb-2">Repère automatiquement les produits qui vendent mal</p>
            <div className="text-yellow-400 font-semibold">⭐ Importance: 5/5</div>
          </div>

          {/* Feature 2 */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20 hover:border-cyan-400/50 transition-all">
            <div className="text-5xl mb-4">✍️</div>
            <h3 className="text-2xl font-bold mb-3 text-cyan-400">Réécriture IA</h3>
            <p className="text-gray-300 mb-2">Génère titres et descriptions optimisés pour la conversion</p>
            <div className="text-yellow-400 font-semibold">⭐ Importance: 5/5</div>
          </div>

          {/* Feature 3 */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20 hover:border-cyan-400/50 transition-all">
            <div className="text-5xl mb-4">⚡</div>
            <h3 className="text-2xl font-bold mb-3 text-cyan-400">Actions concrètes</h3>
            <p className="text-gray-300 mb-2">Ajuste prix et images principales automatiquement</p>
            <div className="text-yellow-400 font-semibold">⭐ Importance: 4/5</div>
          </div>

          {/* Feature 4 */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20 hover:border-cyan-400/50 transition-all">
            <div className="text-5xl mb-4">📊</div>
            <h3 className="text-2xl font-bold mb-3 text-cyan-400">Rapports hebdomadaires</h3>
            <p className="text-gray-300 mb-2">PDF ou email avec analyse de performance</p>
            <div className="text-yellow-400 font-semibold">⭐ Importance: 5/5</div>
          </div>

          {/* Feature 5 */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20 hover:border-cyan-400/50 transition-all">
            <div className="text-5xl mb-4">🛒</div>
            <h3 className="text-2xl font-bold mb-3 text-cyan-400">Cross-sell & Upsell</h3>
            <p className="text-gray-300 mb-2">Suggère produits complémentaires intelligemment</p>
            <div className="text-yellow-400 font-semibold">⭐ Importance: 4/5</div>
          </div>

          {/* Feature 6 */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20 hover:border-cyan-400/50 transition-all">
            <div className="text-5xl mb-4">🔗</div>
            <h3 className="text-2xl font-bold mb-3 text-cyan-400">Intégration Shopify</h3>
            <p className="text-gray-300 mb-2">Connexion directe à votre boutique en un clic</p>
            <div className="text-yellow-400 font-semibold">⭐ Importance: 5/5</div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="max-w-5xl mx-auto px-6 py-20 text-center">
        <div className="bg-gradient-to-r from-cyan-600 to-blue-700 rounded-3xl p-12 shadow-2xl">
          <h2 className="text-4xl font-bold mb-6">Prêt à booster vos ventes ?</h2>
          <p className="text-xl mb-8 text-cyan-100">
            Rejoignez les marchands qui optimisent leurs boutiques avec ShopBrain AI
          </p>
          <button
            onClick={() => setPage('pricing')}
            className="bg-white text-blue-600 px-10 py-4 rounded-xl text-lg font-bold hover:bg-gray-100 transition-all transform hover:scale-105 shadow-xl"
          >
            Choisir mon abonnement
          </button>
        </div>
      </div>

      {/* Footer */}
      <footer className="text-center py-8 text-gray-400 border-t border-white/10">
        <p>© 2025 ShopBrain AI. Tous droits réservés.</p>
      </footer>
    </div>
  )
}
