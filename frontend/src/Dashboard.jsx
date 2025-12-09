import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

const API_BASE = 'https://shopbrain-backend.onrender.com';

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [shopDomain, setShopDomain] = useState('');
  const [products, setProducts] = useState([]);
  const [analyzing, setAnalyzing] = useState({});
  const [analyses, setAnalyses] = useState({});
  const [shopifyConnected, setShopifyConnected] = useState(false);

  useEffect(() => {
    checkUser();
    
    // Check if returning from Shopify OAuth
    const params = new URLSearchParams(window.location.hash.substring(1));
    if (params.get('shopify') === 'connected') {
      setShopifyConnected(true);
      setTimeout(() => loadProducts(), 1000);
    }
  }, []);

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      window.location.href = '/#';
      return;
    }
    setUser(session.user);
    setLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/#';
  };

  const connectShopify = () => {
    if (!shopDomain) {
      alert('Entre ton domaine Shopify (ex: monstore.myshopify.com)');
      return;
    }
    
    // Validate domain format
    if (!shopDomain.endsWith('.myshopify.com')) {
      alert('Le domaine doit finir par .myshopify.com');
      return;
    }

    // Redirect to backend OAuth
    window.location.href = `${API_BASE}/auth/shopify?shop=${shopDomain}&user_id=${user.id}`;
  };

  const loadProducts = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session.access_token;

      const response = await fetch(`${API_BASE}/api/shopify/products?limit=50`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setProducts(data.products || []);
        setShopifyConnected(true);
      } else {
        console.error('Failed to load products');
      }
    } catch (error) {
      console.error('Error loading products:', error);
    }
  };

  const analyzeProduct = async (product) => {
    setAnalyzing(prev => ({ ...prev, [product.id]: true }));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session.access_token;

      const response = await fetch(`${API_BASE}/api/analyze-product`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          product_id: product.id.toString(),
          title: product.title,
          description: product.body_html || '',
          price: product.variants?.[0]?.price || '0'
        })
      });

      if (response.ok) {
        const data = await response.json();
        setAnalyses(prev => ({ ...prev, [product.id]: data.analysis }));
      } else {
        alert('Erreur lors de l\'analyse');
      }
    } catch (error) {
      console.error('Error analyzing product:', error);
      alert('Erreur lors de l\'analyse');
    } finally {
      setAnalyzing(prev => ({ ...prev, [product.id]: false }));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <header className="bg-black/20 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
                <span className="text-white font-bold text-xl">S</span>
              </div>
              <h1 className="text-2xl font-bold text-white">ShopBrain AI</h1>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-white/70">{user?.email}</span>
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition"
              >
                Déconnexion
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Connect Shopify Section */}
        {!shopifyConnected && (
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-8 border border-white/20 mb-8">
            <h2 className="text-3xl font-bold text-white mb-4">🛍️ Connecte ta boutique Shopify</h2>
            <p className="text-white/70 mb-6">
              Entre ton domaine Shopify pour analyser tes produits avec l'IA
            </p>
            <div className="flex gap-4">
              <input
                type="text"
                placeholder="monstore.myshopify.com"
                value={shopDomain}
                onChange={(e) => setShopDomain(e.target.value)}
                className="flex-1 px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:border-purple-500"
              />
              <button
                onClick={connectShopify}
                className="px-8 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-purple-500/50 transition"
              >
                Connecter
              </button>
            </div>
          </div>
        )}

        {/* Products List */}
        {shopifyConnected && (
          <>
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-3xl font-bold text-white">📦 Mes Produits</h2>
              <button
                onClick={loadProducts}
                className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl transition"
              >
                🔄 Actualiser
              </button>
            </div>

            {products.length === 0 ? (
              <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-12 border border-white/20 text-center">
                <p className="text-white/70 text-lg">Aucun produit trouvé. Clique sur Actualiser.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {products.map((product) => (
                  <div
                    key={product.id}
                    className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 overflow-hidden hover:shadow-xl hover:shadow-purple-500/20 transition group"
                  >
                    {/* Product Image */}
                    {product.image && (
                      <div className="aspect-square bg-white/5 overflow-hidden">
                        <img
                          src={product.image.src}
                          alt={product.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        />
                      </div>
                    )}

                    {/* Product Info */}
                    <div className="p-6">
                      <h3 className="text-xl font-bold text-white mb-2 line-clamp-2">
                        {product.title}
                      </h3>
                      <p className="text-purple-300 font-semibold mb-4">
                        {product.variants?.[0]?.price} {product.variants?.[0]?.currency || 'CAD'}
                      </p>

                      {/* Analyze Button */}
                      <button
                        onClick={() => analyzeProduct(product)}
                        disabled={analyzing[product.id]}
                        className="w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-purple-500/50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {analyzing[product.id] ? '🔄 Analyse en cours...' : '✨ Analyser avec IA'}
                      </button>

                      {/* Analysis Results */}
                      {analyses[product.id] && (
                        <div className="mt-4 space-y-3 text-sm">
                          {/* Optimized Title */}
                          <div className="bg-white/5 rounded-lg p-3">
                            <div className="font-semibold text-purple-300 mb-1">📝 Titre optimisé:</div>
                            <div className="text-white/90">{analyses[product.id].optimized_title}</div>
                          </div>

                          {/* SEO Keywords */}
                          {analyses[product.id].seo_keywords?.length > 0 && (
                            <div className="bg-white/5 rounded-lg p-3">
                              <div className="font-semibold text-purple-300 mb-2">🔑 Mots-clés SEO:</div>
                              <div className="flex flex-wrap gap-2">
                                {analyses[product.id].seo_keywords.map((keyword, i) => (
                                  <span
                                    key={i}
                                    className="px-2 py-1 bg-purple-500/20 text-purple-200 rounded text-xs"
                                  >
                                    {keyword}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Price Recommendation */}
                          {analyses[product.id].price_recommendation && (
                            <div className="bg-white/5 rounded-lg p-3">
                              <div className="font-semibold text-purple-300 mb-1">💰 Prix:</div>
                              <div className="text-white/90 text-xs">
                                {analyses[product.id].price_recommendation}
                              </div>
                            </div>
                          )}

                          {/* Cross-sell */}
                          {analyses[product.id].cross_sell?.length > 0 && (
                            <div className="bg-white/5 rounded-lg p-3">
                              <div className="font-semibold text-purple-300 mb-1">🛒 Cross-sell:</div>
                              <ul className="text-white/90 text-xs space-y-1">
                                {analyses[product.id].cross_sell.map((item, i) => (
                                  <li key={i}>• {item}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* View Full Analysis */}
                          <button
                            onClick={() => {
                              const modal = document.getElementById(`modal-${product.id}`);
                              modal.classList.remove('hidden');
                            }}
                            className="w-full px-3 py-2 bg-white/10 hover:bg-white/20 text-white text-sm rounded-lg transition"
                          >
                            📊 Voir l'analyse complète
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Full Analysis Modal */}
                    {analyses[product.id] && (
                      <div
                        id={`modal-${product.id}`}
                        className="hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                        onClick={(e) => {
                          if (e.target.id === `modal-${product.id}`) {
                            e.target.classList.add('hidden');
                          }
                        }}
                      >
                        <div className="bg-slate-900 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto border border-white/20">
                          <div className="sticky top-0 bg-slate-900 border-b border-white/20 p-6 flex justify-between items-center">
                            <h3 className="text-2xl font-bold text-white">Analyse complète</h3>
                            <button
                              onClick={() => {
                                document.getElementById(`modal-${product.id}`).classList.add('hidden');
                              }}
                              className="text-white/70 hover:text-white text-2xl"
                            >
                              ×
                            </button>
                          </div>
                          <div className="p-6 space-y-6">
                            {/* Full Description */}
                            <div>
                              <h4 className="text-xl font-bold text-purple-300 mb-3">📝 Description optimisée</h4>
                              <p className="text-white/90 leading-relaxed whitespace-pre-wrap">
                                {analyses[product.id].optimized_description}
                              </p>
                            </div>

                            {/* Conversion Tips */}
                            {analyses[product.id].conversion_tips?.length > 0 && (
                              <div>
                                <h4 className="text-xl font-bold text-purple-300 mb-3">📈 Conseils conversion</h4>
                                <ul className="space-y-2">
                                  {analyses[product.id].conversion_tips.map((tip, i) => (
                                    <li key={i} className="text-white/90 flex gap-3">
                                      <span className="text-purple-400">•</span>
                                      <span>{tip}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
