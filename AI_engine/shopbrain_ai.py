"""
ShopBrain AI - Main Orchestrator
=================================
Orchestre tous les modules IA selon le tier de l'abonnement.
"""

from typing import Dict, List, Optional
from .product_analyzer import ProductAnalyzer
from .content_generator import ContentGenerator
from .price_optimizer import PriceOptimizer
from .action_engine import ActionEngine
from .recommendation_engine import RecommendationEngine
from .report_generator import ReportGenerator


class ShopBrainAI:
    """
    Classe principale qui orchestre tous les modules IA
    selon le tier d'abonnement (standard/pro/premium)
    """
    
    def __init__(self, openai_api_key: str, shopify_config: Optional[Dict] = None):
        """
        Initialise le moteur IA ShopBrain
        
        Args:
            openai_api_key: Clé API OpenAI
            shopify_config: Config Shopify (shop_url, access_token)
        """
        self.analyzer = ProductAnalyzer(openai_api_key)
        self.content_gen = ContentGenerator(openai_api_key)
        self.price_opt = PriceOptimizer(openai_api_key)
        self.recommender = RecommendationEngine(openai_api_key)
        self.reporter = ReportGenerator(openai_api_key)
        
        # Action Engine nécessite config Shopify
        if shopify_config:
            self.action_engine = ActionEngine(
                shopify_config.get('shop_url'),
                shopify_config.get('access_token')
            )
        else:
            self.action_engine = None
    
    def analyze_store(self, products: List[Dict], analytics: Dict, tier: str) -> Dict:
        """
        Analyse complète de la boutique selon le tier
        
        Args:
            products: Liste des produits Shopify
            analytics: Données analytiques
            tier: standard/pro/premium
        
        Returns:
            Rapport d'analyse complet
        """
        results = {
            'tier': tier,
            'analysis': {}
        }
        
        # 🔍 Tous les tiers: Détection produits faibles
        results['analysis']['weak_products'] = self.analyzer.analyze_product_performance(
            products, analytics
        )
        
        # 📝 Standard: Réécriture titres uniquement
        if tier == "standard":
            results['analysis']['optimized_titles'] = [
                {
                    'product_id': p.get('id'),
                    'original_title': p.get('title'),
                    'new_title': self.content_gen.generate_title(p, tier)
                }
                for p in products[:50]  # Limite 50 produits
            ]
            
            results['analysis']['price_suggestions'] = self.price_opt.batch_optimize_prices(
                products[:50], analytics, tier
            )
        
        # 🚀 Pro: Titres + Descriptions + Cross-sell/Upsell + Rapports hebdo
        elif tier == "pro":
            results['analysis']['content_optimization'] = self.content_gen.batch_optimize_content(
                products[:500], tier  # Limite 500 produits
            )
            
            results['analysis']['price_optimization'] = self.price_opt.batch_optimize_prices(
                products[:500], analytics, tier
            )
            
            # Cross-sell & Upsell pour top produits
            top_products = products[:20]
            results['analysis']['recommendations'] = []
            for product in top_products:
                cross_sell = self.recommender.generate_cross_sell(product, products, tier)
                upsell = self.recommender.generate_upsell(product, products, tier)
                results['analysis']['recommendations'].append({
                    'product_id': product.get('id'),
                    'cross_sell': cross_sell,
                    'upsell': upsell
                })
        
        # 💎 Premium: Tout + Actions automatiques + Rapports quotidiens + IA prédictive
        elif tier == "premium":
            # Contenu complet avec SEO
            results['analysis']['content_optimization'] = self.content_gen.batch_optimize_content(
                products, tier  # Illimité
            )
            
            # Prix IA prédictive
            results['analysis']['price_optimization'] = self.price_opt.batch_optimize_prices(
                products, analytics, tier
            )
            
            # Recommandations avancées
            results['analysis']['recommendations'] = []
            for product in products[:50]:
                cross_sell = self.recommender.generate_cross_sell(product, products, tier)
                upsell = self.recommender.generate_upsell(product, products, tier)
                results['analysis']['recommendations'].append({
                    'product_id': product.get('id'),
                    'cross_sell': cross_sell,
                    'upsell': upsell
                })
            
            # Bundles
            results['analysis']['bundle_suggestions'] = self.recommender.generate_bundle_suggestions(products)
            
            # Prédictions IA
            results['analysis']['predictions'] = [
                self.analyzer.predict_future_performance(p, analytics.get('historical', []))
                for p in products[:20]
            ]
        
        return results
    
    def execute_optimizations(self, optimization_plan: List[Dict], tier: str) -> Dict:
        """
        Exécute les optimisations (Premium uniquement pour actions auto)
        
        Args:
            optimization_plan: Plan d'actions à exécuter
            tier: Tier de l'abonnement
        
        Returns:
            Résultat de l'exécution
        """
        if tier != "premium":
            return {
                'error': 'Actions automatiques disponibles uniquement pour Premium',
                'tier_required': 'premium'
            }
        
        if not self.action_engine:
            return {
                'error': 'Action Engine non configuré. Shopify config requise.'
            }
        
        return self.action_engine.execute_optimization_plan(optimization_plan)
    
    def generate_report(self, analytics_data: Dict, tier: str, report_type: str = "weekly") -> Dict:
        """
        Génère un rapport selon le tier
        
        Args:
            analytics_data: Données analytiques
            tier: standard/pro/premium
            report_type: weekly (pro+) ou daily (premium)
        
        Returns:
            Rapport généré
        """
        if tier == "standard":
            return {
                'error': 'Rapports disponibles à partir du plan Pro',
                'tier_required': 'pro'
            }
        
        if report_type == "daily" and tier != "premium":
            return {
                'error': 'Rapports quotidiens disponibles uniquement pour Premium',
                'tier_required': 'premium'
            }
        
        if report_type == "weekly":
            return self.reporter.generate_weekly_report(analytics_data, tier)
        elif report_type == "daily":
            return self.reporter.generate_daily_report(analytics_data)
        elif report_type == "monthly":
            return self.reporter.generate_monthly_summary(analytics_data)
        
        return {'error': 'Type de rapport invalide'}
    
    def get_tier_capabilities(self, tier: str) -> Dict:
        """
        Retourne les capacités disponibles pour un tier
        
        Returns:
            Dict des fonctionnalités disponibles
        """
        capabilities = {
            'standard': {
                'product_analysis': True,
                'title_optimization': True,
                'price_suggestions': True,
                'description_generation': False,
                'cross_sell_upsell': False,
                'automated_actions': False,
                'reports': False,
                'ai_predictions': False,
                'product_limit': 50,
                'report_frequency': None
            },
            'pro': {
                'product_analysis': True,
                'title_optimization': True,
                'price_suggestions': True,
                'description_generation': True,
                'cross_sell_upsell': True,
                'automated_actions': False,
                'reports': True,
                'ai_predictions': False,
                'product_limit': 500,
                'report_frequency': 'weekly'
            },
            'premium': {
                'product_analysis': True,
                'title_optimization': True,
                'price_suggestions': True,
                'description_generation': True,
                'cross_sell_upsell': True,
                'automated_actions': True,
                'reports': True,
                'ai_predictions': True,
                'product_limit': None,  # Illimité
                'report_frequency': 'daily'
            }
        }
        
        return capabilities.get(tier, capabilities['standard'])
