"""
Price Optimizer - Optimisation dynamique des prix
==================================================
Suggère et applique automatiquement des ajustements de prix basés sur la performance.
"""

import openai
from typing import Dict, List, Optional
from datetime import datetime
import statistics


class PriceOptimizer:
    """Optimise les prix pour maximiser conversions et revenus"""
    
    def __init__(self, openai_api_key: str):
        self.client = openai.OpenAI(api_key=openai_api_key)
    
    def suggest_price_adjustment(self, product: Dict, analytics: Dict, tier: str) -> Dict:
        """
        Suggère un ajustement de prix basé sur la performance
        
        Args:
            product: Produit Shopify
            analytics: Données de performance
            tier: standard (suggestions) / pro (optimisation auto) / premium (IA prédictive)
        
        Returns:
            Recommandation de prix avec justification
        """
        product_id = product.get('id')
        current_price = float(product.get('variants', [{}])[0].get('price', 0))
        product_analytics = analytics.get(str(product_id), {})
        
        views = product_analytics.get('views', 0)
        orders = product_analytics.get('orders', 0)
        conversion_rate = (orders / views * 100) if views > 0 else 0
        
        # Logique de base (Standard)
        if tier == "standard":
            return self._basic_price_suggestion(current_price, conversion_rate, orders)
        
        # Optimisation avancée (Pro)
        elif tier == "pro":
            return self._advanced_price_optimization(product, analytics)
        
        # IA prédictive (Premium)
        elif tier == "premium":
            return self._ai_predictive_pricing(product, analytics)
        
        return {'current_price': current_price, 'suggested_price': current_price, 'action': 'none'}
    
    def _basic_price_suggestion(self, current_price: float, conversion_rate: float, orders: int) -> Dict:
        """Suggestions simples basées sur règles (Standard)"""
        suggested_price = current_price
        action = "maintain"
        reason = "Prix actuel approprié"
        
        # Règles simples
        if conversion_rate < 1 and orders == 0:
            suggested_price = current_price * 0.90  # -10%
            action = "decrease"
            reason = "Taux de conversion trop faible, baisse de prix recommandée"
        
        elif conversion_rate > 5:
            suggested_price = current_price * 1.10  # +10%
            action = "increase"
            reason = "Excellente conversion, possibilité d'augmenter"
        
        return {
            'current_price': round(current_price, 2),
            'suggested_price': round(suggested_price, 2),
            'action': action,
            'reason': reason,
            'confidence': 'medium'
        }
    
    def _advanced_price_optimization(self, product: Dict, analytics: Dict) -> Dict:
        """Optimisation basée sur multiples facteurs (Pro)"""
        product_id = product.get('id')
        current_price = float(product.get('variants', [{}])[0].get('price', 0))
        product_analytics = analytics.get(str(product_id), {})
        
        views = product_analytics.get('views', 0)
        orders = product_analytics.get('orders', 0)
        revenue = product_analytics.get('revenue', 0)
        cart_adds = product_analytics.get('cart_adds', 0)
        
        # Calcul de métriques avancées
        conversion_rate = (orders / views * 100) if views > 0 else 0
        cart_to_order = (orders / cart_adds * 100) if cart_adds > 0 else 0
        avg_order_value = revenue / orders if orders > 0 else 0
        
        # Algorithme d'optimisation
        price_multiplier = 1.0
        
        # Facteurs d'ajustement
        if conversion_rate < 2:
            price_multiplier *= 0.95  # Baisse si faible conversion
        elif conversion_rate > 5:
            price_multiplier *= 1.05  # Hausse si excellente conversion
        
        if cart_to_order < 50:
            price_multiplier *= 0.97  # Prix peut être un frein
        
        if orders > 20 and conversion_rate > 3:
            price_multiplier *= 1.08  # Produit populaire, peut supporter hausse
        
        suggested_price = current_price * price_multiplier
        
        # Déterminer l'action
        if suggested_price < current_price * 0.98:
            action = "decrease"
        elif suggested_price > current_price * 1.02:
            action = "increase"
        else:
            action = "maintain"
        
        return {
            'current_price': round(current_price, 2),
            'suggested_price': round(suggested_price, 2),
            'action': action,
            'reason': f"Basé sur {orders} ventes, {conversion_rate:.1f}% conversion",
            'confidence': 'high',
            'metrics': {
                'conversion_rate': round(conversion_rate, 2),
                'cart_to_order': round(cart_to_order, 2),
                'avg_order_value': round(avg_order_value, 2)
            }
        }
    
    def _ai_predictive_pricing(self, product: Dict, analytics: Dict) -> Dict:
        """Prix optimal prédit par IA (Premium)"""
        product_id = product.get('id')
        current_price = float(product.get('variants', [{}])[0].get('price', 0))
        title = product.get('title', '')
        product_type = product.get('product_type', '')
        
        prompt = f"""Analyse ce produit e-commerce et recommande le prix optimal:

Produit: {title}
Catégorie: {product_type}
Prix actuel: ${current_price}

Analytics:
{analytics.get(str(product_id), {})}

Basé sur:
- Psychologie du pricing
- Élasticité prix-demande
- Positionnement marché
- Patterns de conversion

Fournis en JSON:
{{
  "optimal_price": 49.99,
  "confidence": 85,
  "reasoning": "explication détaillée",
  "action": "increase|decrease|maintain",
  "expected_impact": "+15% revenue"
}}"""

        try:
            response = self.client.chat.completions.create(
                model="gpt-4",
                messages=[
                    {"role": "system", "content": "Tu es un expert en pricing stratégique e-commerce."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                response_format={"type": "json_object"}
            )
            
            import json
            result = json.loads(response.choices[0].message.content)
            result['current_price'] = current_price
            return result
        
        except Exception as e:
            print(f"Erreur AI pricing: {e}")
            return self._advanced_price_optimization(product, analytics)
    
    def batch_optimize_prices(self, products: List[Dict], analytics: Dict, tier: str) -> List[Dict]:
        """
        Optimise les prix de plusieurs produits
        
        Returns:
            Liste de recommandations de prix
        """
        recommendations = []
        
        for product in products:
            rec = self.suggest_price_adjustment(product, analytics, tier)
            rec['product_id'] = product.get('id')
            rec['product_title'] = product.get('title')
            recommendations.append(rec)
        
        return recommendations
    
    def apply_dynamic_pricing_rules(self, products: List[Dict], market_conditions: Dict) -> List[Dict]:
        """
        Applique des règles de pricing dynamique (Premium)
        - Ajustements saisonniers
        - Prix compétitifs
        - Urgence/rareté
        """
        adjusted = []
        
        season_multiplier = market_conditions.get('season_multiplier', 1.0)
        demand_level = market_conditions.get('demand_level', 'normal')
        
        for product in products:
            current_price = float(product.get('variants', [{}])[0].get('price', 0))
            new_price = current_price * season_multiplier
            
            # Ajustements selon la demande
            if demand_level == 'high':
                new_price *= 1.05
            elif demand_level == 'low':
                new_price *= 0.95
            
            adjusted.append({
                'product_id': product.get('id'),
                'original_price': current_price,
                'adjusted_price': round(new_price, 2),
                'reason': f"Ajustement saisonnier + demande {demand_level}"
            })
        
        return adjusted
