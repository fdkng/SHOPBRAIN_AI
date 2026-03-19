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
            Rapport d'analyse complet et détaillé
        """
        # 📊 Calculs de base pour tous les tiers
        total_products = len(products)
        published_products = len([p for p in products if p.get('status') == 'active'])
        total_variants = sum(len(p.get('variants', [])) for p in products)
        
        # Prix moyens
        prices = []
        for p in products:
            for v in p.get('variants', []):
                try:
                    price = float(v.get('price', 0))
                    if price > 0:
                        prices.append(price)
                except:
                    pass
        
        avg_price = sum(prices) / len(prices) if prices else 0
        min_price = min(prices) if prices else 0
        max_price = max(prices) if prices else 0
        
        # 🎯 ANALYSE COMPLÈTE - Structure uniforme pour tous les tiers
        results = {
            'tier': tier,
            'timestamp': analytics.get('timestamp', 'N/A'),
            
            # 📈 VUE D'ENSEMBLE DE LA BOUTIQUE
            'overview': {
                'total_products': total_products,
                'published': published_products,
                'drafts': total_products - published_products,
                'total_variants': total_variants,
                'avg_variants_per_product': round(total_variants / total_products, 1) if total_products > 0 else 0,
                'price_range': {
                    'min': round(min_price, 2),
                    'max': round(max_price, 2),
                    'average': round(avg_price, 2)
                },
                'catalog_health': 'Excellent' if published_products > 20 else 'Bon' if published_products > 10 else 'À améliorer'
            },
            
            # 🎯 RECOMMANDATIONS STRATÉGIQUES IMMÉDIATES
            'strategic_recommendations': self._generate_strategic_recommendations(products, analytics, tier),
            
            # 💰 OPTIMISATIONS DE PRIX
            'pricing_strategy': self._analyze_pricing_strategy(products, analytics, tier),
            
            # 📝 OPTIMISATIONS DE CONTENU
            'content_improvements': self._analyze_content_quality(products, tier),
            
            # 🛒 STRATÉGIES UPSELL & CROSS-SELL
            'sales_strategies': self._generate_sales_strategies(products, tier),
            
            # 🚀 OPPORTUNITÉS DE CROISSANCE
            'growth_opportunities': self._identify_growth_opportunities(products, analytics, tier),
            
            # ⚠️ POINTS D'ATTENTION CRITIQUES
            'critical_issues': self._identify_critical_issues(products, analytics),
            
            # 📊 ACTIONS CONCRÈTES À PRENDRE MAINTENANT
            'immediate_actions': self._generate_immediate_actions(products, analytics, tier),
            
            # 🎨 RECOMMANDATIONS PAR PRODUIT (TOP 10)
            'product_recommendations': self._generate_product_specific_recommendations(products, tier)
        }
        
        return results
    
    def _generate_strategic_recommendations(self, products: List[Dict], analytics: Dict, tier: str) -> Dict:
        """Génère les recommandations stratégiques globales"""
        total_products = len(products)
        published = len([p for p in products if p.get('status') == 'active'])
        
        recommendations = []
        
        # Analyse du catalogue
        if published < 10:
            recommendations.append({
                'priority': 'HAUTE',
                'category': 'Catalogue',
                'issue': 'Catalogue trop petit',
                'recommendation': f'Vous avez seulement {published} produits actifs. Visez au moins 15-20 produits pour crédibiliser votre boutique.',
                'impact': 'Augmentation de la crédibilité et des conversions (+25-40%)',
                'action': 'Ajouter 5-10 nouveaux produits complémentaires'
            })
        
        # Analyse des prix
        prices = []
        for p in products:
            for v in p.get('variants', []):
                try:
                    prices.append(float(v.get('price', 0)))
                except:
                    pass
        
        if prices:
            avg_price = sum(prices) / len(prices)
            if avg_price < 20:
                recommendations.append({
                    'priority': 'MOYENNE',
                    'category': 'Prix',
                    'issue': 'Prix moyens trop bas',
                    'recommendation': f'Prix moyen à {avg_price:.2f}$. Augmentez de 20-30% pour améliorer les marges sans affecter les ventes.',
                    'impact': 'Augmentation des revenus de 20-30% à volume constant',
                    'action': 'Tester une augmentation de 25% sur vos 3 meilleurs produits'
                })
        
        # Stratégie de contenu
        products_without_description = len([p for p in products[:10] if not p.get('body_html') or len(p.get('body_html', '')) < 100])
        if products_without_description > 3:
            recommendations.append({
                'priority': 'HAUTE',
                'category': 'Contenu',
                'issue': 'Descriptions de produits insuffisantes',
                'recommendation': f'{products_without_description} produits ont des descriptions trop courtes ou inexistantes. Les descriptions riches augmentent les conversions de 78%.',
                'impact': 'Amélioration du SEO et des conversions (+40-78%)',
                'action': 'Réécrire les descriptions des 5 produits les plus vendus avec 200+ mots'
            })
        
        # Stratégie de croissance
        if tier == 'standard':
            recommendations.append({
                'priority': 'MOYENNE',
                'category': 'Croissance',
                'issue': 'Potentiel inexploité',
                'recommendation': 'Avec le plan Pro, vous pourriez automatiser l\'optimisation de 500 produits et obtenir des recommandations cross-sell/upsell avancées.',
                'impact': 'ROI moyen de 3-5x sur le plan Pro',
                'action': 'Passer au plan Pro pour débloquer l\'automatisation complète'
            })
        
        return {
            'total_recommendations': len(recommendations),
            'high_priority': len([r for r in recommendations if r['priority'] == 'HAUTE']),
            'recommendations': recommendations
        }
    
    def _analyze_pricing_strategy(self, products: List[Dict], analytics: Dict, tier: str) -> Dict:
        """Analyse de la stratégie de prix"""
        price_analysis = {
            'current_strategy': 'Prix compétitifs',
            'opportunities': [],
            'optimizations': []
        }
        
        # Calculate category averages for comparison
        category_prices = {}
        for p in products:
            ptype = (p.get('product_type') or 'general').lower()
            for v in p.get('variants', []):
                try:
                    price = float(v.get('price', 0))
                    if price > 0:
                        category_prices.setdefault(ptype, []).append(price)
                except:
                    pass
        
        all_prices = []
        for p in products:
            for v in p.get('variants', []):
                try:
                    price = float(v.get('price', 0))
                    if price > 0:
                        all_prices.append(price)
                except:
                    pass
        
        overall_avg = sum(all_prices) / len(all_prices) if all_prices else 0
        
        # Analyse produit par produit (top 5)
        for p in products[:5]:
            product_name = p.get('title', 'Sans titre')
            variants = p.get('variants', [])
            
            if variants:
                current_price = float(variants[0].get('price', 0))
                
                # Skip products with zero price
                if current_price <= 0:
                    continue
                
                ptype = (p.get('product_type') or 'general').lower()
                cat_prices = category_prices.get(ptype, all_prices)
                cat_avg = sum(cat_prices) / len(cat_prices) if cat_prices else overall_avg
                
                # Smart suggestion based on position relative to category average
                if current_price < cat_avg * 0.7:
                    # Price is significantly below average — suggest increase
                    suggested_price = round(current_price * 1.20, 2)
                    reason = (
                        f'Your current price (${current_price:.2f}) is {round((1 - current_price/cat_avg) * 100)}% below the average for similar products (${cat_avg:.2f}). '
                        f'An increase of 20% would bring you closer to market value while keeping you competitive. '
                        f'Studies show that prices too low can reduce perceived quality and trust.'
                    )
                elif current_price > cat_avg * 1.3:
                    # Price is significantly above average — suggest decrease
                    suggested_price = round(current_price * 0.90, 2)
                    reason = (
                        f'Your current price (${current_price:.2f}) is {round((current_price/cat_avg - 1) * 100)}% above similar products (avg ${cat_avg:.2f}). '
                        f'A small decrease of 10% could improve conversions. '
                        f'Competitive positioning helps capture price-sensitive buyers without sacrificing margins significantly.'
                    )
                else:
                    # Price is near average — test a modest increase
                    suggested_price = round(current_price * 1.15, 2)
                    reason = (
                        f'Your price (${current_price:.2f}) is well-positioned vs similar products (avg ${cat_avg:.2f}). '
                        f'A test increase of 15% would validate price elasticity — '
                        f'e-commerce data shows that 15-25% increases rarely affect conversion rates for unique/quality products.'
                    )
                
                potential_increase = suggested_price - current_price
                
                price_analysis['optimizations'].append({
                    'product': product_name,
                    'current_price': round(current_price, 2),
                    'suggested_price': round(suggested_price, 2),
                    'increase': round(potential_increase, 2),
                    'category_average': round(cat_avg, 2),
                    'reason': reason,
                    'expected_impact': f'+{round((potential_increase / current_price) * 100, 1)}% revenue per unit sold'
                })
        
        # Opportunités générales
        price_analysis['opportunities'].append({
            'strategy': 'Bundles',
            'description': 'Créer des packs de 2-3 produits complémentaires avec 10-15% de réduction',
            'expected_impact': 'Augmentation du panier moyen de 35-50%'
        })
        
        price_analysis['opportunities'].append({
            'strategy': 'Pricing psychologique',
            'description': 'Utiliser des prix en .97 ou .99 au lieu de prix ronds (19.97$ au lieu de 20$)',
            'expected_impact': 'Augmentation des conversions de 8-12%'
        })
        
        return price_analysis
    
    def _analyze_content_quality(self, products: List[Dict], tier: str) -> Dict:
        """Analyse de la qualité du contenu"""
        content_analysis = {
            'overall_score': 0,
            'issues_found': [],
            'quick_wins': []
        }
        
        # Analyse des titres
        short_titles = len([p for p in products if len(p.get('title', '')) < 20])
        if short_titles > len(products) * 0.3:
            content_analysis['issues_found'].append({
                'issue': f'{short_titles} produits ont des titres trop courts',
                'fix': 'Les titres devraient faire 40-70 caractères et inclure des mots-clés SEO',
                'priority': 'HAUTE'
            })
        
        # Analyse des descriptions
        no_description = len([p for p in products if not p.get('body_html') or len(p.get('body_html', '')) < 50])
        if no_description > 0:
            content_analysis['issues_found'].append({
                'issue': f'{no_description} produits sans description détaillée',
                'fix': 'Ajouter 200+ mots avec bénéfices client, caractéristiques techniques, et FAQ',
                'priority': 'CRITIQUE'
            })
        
        # Quick wins
        content_analysis['quick_wins'].append({
            'action': 'Ajouter des émojis dans les titres',
            'example': '✨ ' + (products[0].get('title', '') if products else 'Votre Produit'),
            'impact': '+12% de CTR (taux de clic)'
        })
        
        content_analysis['quick_wins'].append({
            'action': 'Créer un tableau "Caractéristiques" dans les descriptions',
            'impact': 'Réduit les questions clients de 35%'
        })
        
        # Score global
        issues = len(content_analysis['issues_found'])
        content_analysis['overall_score'] = max(0, 100 - (issues * 15))
        
        return content_analysis
    
    def _generate_sales_strategies(self, products: List[Dict], tier: str) -> Dict:
        """Stratégies upsell/cross-sell"""
        strategies = {
            'upsell_opportunities': [],
            'cross_sell_bundles': [],
            'psychological_triggers': []
        }
        
        # Upsell - Version premium du produit
        if len(products) >= 2:
            strategies['upsell_opportunities'].append({
                'strategy': 'Version Premium',
                'description': f'Pour chaque produit, créer une version "Premium" ou "Deluxe" 30-50% plus chère avec bonus',
                'example': f'{products[0].get("title", "Produit")} → {products[0].get("title", "Produit")} Premium Edition',
                'expected_impact': '25-40% des clients choisissent la version premium si bien présentée'
            })
        
        # Cross-sell - Bundles
        if len(products) >= 3:
            bundle_products = products[:3]
            bundle_names = [p.get('title', '') for p in bundle_products]
            strategies['cross_sell_bundles'].append({
                'bundle_name': 'Pack Complet',
                'products': bundle_names,
                'discount': '15%',
                'positioning': 'Économisez 15% avec le pack complet au lieu d\'acheter séparément',
                'expected_impact': '+45% de panier moyen'
            })
        
        # Triggers psychologiques
        strategies['psychological_triggers'].extend([
            {
                'trigger': 'Urgence',
                'tactic': 'Ajouter "Stock limité" ou "Plus que X en stock"',
                'impact': '+22% de conversions'
            },
            {
                'trigger': 'Preuve sociale',
                'tactic': 'Afficher "127 personnes ont acheté ce produit cette semaine"',
                'impact': '+18% de confiance'
            },
            {
                'trigger': 'Garantie',
                'tactic': 'Badge "Satisfait ou Remboursé 30 jours"',
                'impact': '+31% de taux de conversion'
            }
        ])
        
        return strategies
    
    def _identify_growth_opportunities(self, products: List[Dict], analytics: Dict, tier: str) -> List[Dict]:
        """Identifie les opportunités de croissance"""
        opportunities = []
        
        opportunities.append({
            'category': '🎯 Acquisition',
            'opportunity': 'Google Shopping Ads',
            'description': 'Vos produits sont parfaits pour Google Shopping. Avec un budget de 10$/jour, attendez-vous à 50-100 clics qualifiés.',
            'investment': '300$/mois',
            'expected_return': '900-1500$/mois (ROI 3-5x)',
            'difficulty': 'Facile'
        })
        
        opportunities.append({
            'category': '📱 Social Media',
            'opportunity': 'Instagram Reels + TikTok',
            'description': 'Créez 1 vidéo/jour montrant vos produits en action. Les vidéos produits génèrent 10x plus d\'engagement.',
            'investment': '2h/semaine',
            'expected_return': '500-800 nouveaux visiteurs/mois',
            'difficulty': 'Moyenne'
        })
        
        opportunities.append({
            'category': '💌 Rétention',
            'opportunity': 'Email Marketing (Klaviyo)',
            'description': 'Séquence automatique: Bienvenue → Abandon panier → Réactivation. L\'email génère 30% des revenus e-commerce.',
            'investment': '30$/mois (Klaviyo) + 3h setup',
            'expected_return': '+25-35% de revenus',
            'difficulty': 'Moyenne'
        })
        
        if tier == 'standard':
            opportunities.append({
                'category': '🚀 Automatisation',
                'opportunity': 'Plan Pro ShopBrain',
                'description': 'Automatisez l\'optimisation des titres, descriptions, et obtenez des recommandations cross-sell pour 500 produits.',
                'investment': '49$/mois',
                'expected_return': 'Économie de 15h/mois + 20-30% d\'augmentation des conversions',
                'difficulty': 'Très facile'
            })
        
        return opportunities
    
    def _identify_critical_issues(self, products: List[Dict], analytics: Dict) -> List[Dict]:
        """Identifie les problèmes critiques à résoudre immédiatement"""
        issues = []
        
        # Produits sans image
        no_images = [p for p in products if not p.get('images') or len(p.get('images', [])) == 0]
        if no_images:
            issues.append({
                'severity': 'CRITIQUE',
                'issue': f'{len(no_images)} produit(s) sans image',
                'impact': 'Impossible de vendre sans images. Taux de conversion proche de 0%.',
                'action': 'Ajouter minimum 3-5 images professionnelles par produit AUJOURD\'HUI'
            })
        
        # Prix à 0
        zero_price = []
        for p in products:
            for v in p.get('variants', []):
                try:
                    if float(v.get('price', 0)) == 0:
                        zero_price.append(p.get('title'))
                        break
                except:
                    pass
        
        if zero_price:
            issues.append({
                'severity': 'CRITIQUE',
                'issue': f'{len(zero_price)} produit(s) avec prix à 0$',
                'impact': 'Impossible de vendre. Perte de revenus de 100%.',
                'action': f'Corriger immédiatement les prix pour: {", ".join(zero_price[:3])}'
            })
        
        # Produits brouillons mais prêts
        drafts_ready = [p for p in products if p.get('status') != 'active' and p.get('images') and p.get('body_html')]
        if drafts_ready:
            issues.append({
                'severity': 'HAUTE',
                'issue': f'{len(drafts_ready)} produit(s) prêt(s) mais en brouillon',
                'impact': f'Perte potentielle de {len(drafts_ready) * 500}$/mois en revenus',
                'action': 'Publier ces produits immédiatement - ils sont prêts!'
            })
        
        return issues
    
    def _generate_immediate_actions(self, products: List[Dict], analytics: Dict, tier: str) -> List[Dict]:
        """Actions concrètes à faire MAINTENANT"""
        actions = []
        
        # Action 1: Optimiser le top produit
        if products:
            top_product = products[0]
            actions.append({
                'priority': 1,
                'action': f'Optimiser "{top_product.get("title", "votre produit principal")}"',
                'steps': [
                    '1. Réécrire le titre avec mots-clés SEO (60-70 caractères)',
                    '2. Ajouter 300+ mots de description avec bénéfices clients',
                    '3. Ajouter 2-3 images supplémentaires haute qualité',
                    '4. Tester une augmentation de prix de 25%'
                ],
                'time_required': '45 minutes',
                'expected_impact': '+30-50% de conversions sur ce produit'
            })
        
        # Action 2: Créer premier bundle
        if len(products) >= 2:
            actions.append({
                'priority': 2,
                'action': 'Créer votre premier bundle',
                'steps': [
                    f'1. Combiner "{products[0].get("title", "Produit 1")}" + "{products[1].get("title", "Produit 2")}"',
                    '2. Prix du bundle: Prix total - 15%',
                    '3. Titre: "Pack Complet [Thème]"',
                    '4. Mettre en avant sur la page d\'accueil'
                ],
                'time_required': '30 minutes',
                'expected_impact': '+45% de panier moyen'
            })
        
        # Action 3: Setup email abandon panier
        actions.append({
            'priority': 3,
            'action': 'Activer les emails d\'abandon de panier',
            'steps': [
                '1. Aller dans Shopify → Paramètres → Notifications',
                '2. Personnaliser l\'email "Abandon de panier"',
                '3. Offrir 10% de réduction si retour dans 24h',
                '4. Envoyer automatiquement après 1h d\'abandon'
            ],
            'time_required': '20 minutes',
            'expected_impact': 'Récupération de 15-25% des paniers abandonnés'
        })
        
        return actions
    
    def _generate_product_specific_recommendations(self, products: List[Dict], tier: str) -> List[Dict]:
        """Recommandations spécifiques par produit (top 10)"""
        recommendations = []
        
        for idx, product in enumerate(products[:10], 1):
            product_rec = {
                'rank': idx,
                'product_name': product.get('title', 'Sans titre'),
                'product_id': product.get('id'),
                'current_status': product.get('status', 'unknown'),
                'recommendations': []
            }
            
            # Titre
            title = product.get('title', '')
            if len(title) < 30:
                product_rec['recommendations'].append({
                    'type': 'Titre',
                    'issue': f'Titre trop court ({len(title)} caractères)',
                    'suggestion': f'Allonger à 50-70 caractères avec mots-clés',
                    'priority': 'Haute'
                })
            
            # Description
            description = product.get('body_html', '')
            if len(description) < 100:
                product_rec['recommendations'].append({
                    'type': 'Description',
                    'issue': 'Description inexistante ou trop courte',
                    'suggestion': 'Ajouter 250+ mots: bénéfices, caractéristiques, garanties, FAQ',
                    'priority': 'Critique'
                })
            
            # Images
            images_count = len(product.get('images', []))
            if images_count < 3:
                product_rec['recommendations'].append({
                    'type': 'Images',
                    'issue': f'Seulement {images_count} image(s)',
                    'suggestion': 'Ajouter 5-7 images: produit seul, en contexte, détails, lifestyle',
                    'priority': 'Haute'
                })
            
            # Prix
            variants = product.get('variants', [])
            if variants:
                try:
                    price = float(variants[0].get('price', 0))
                    if price > 0:
                        suggested_price = price * 1.20
                        product_rec['recommendations'].append({
                            'type': 'Prix',
                            'issue': f'Prix actuel: {price}$',
                            'suggestion': f'Tester {suggested_price:.2f}$ (+20%) pour optimiser les marges',
                            'priority': 'Moyenne'
                        })
                except:
                    pass
            
            recommendations.append(product_rec)
        
        return recommendations
    
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
