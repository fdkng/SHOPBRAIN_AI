"""
Product Analyzer - Détection des produits sous-performants
============================================================
Analyse les métriques de vente et identifie les produits qui nécessitent une optimisation.
"""

import openai
from typing import Dict, List, Optional
from datetime import datetime, timedelta
import statistics


class ProductAnalyzer:
    """Analyse la performance des produits Shopify"""
    
    def __init__(self, openai_api_key: str):
        self.client = openai.OpenAI(api_key=openai_api_key)
    
    def analyze_product_performance(self, products: List[Dict], analytics: Dict) -> Dict:
        """
        Détecte les produits sous-performants basés sur les métriques.
        
        Args:
            products: Liste des produits Shopify
            analytics: Données analytiques (vues, conversions, etc.)
        
        Returns:
            Dict contenant produits faibles et recommandations
        """
        weak_products = []
        
        for product in products:
            product_id = product.get('id')
            
            # Calcul du score de performance
            score = self._calculate_performance_score(product, analytics)
            
            if score < 50:  # Seuil de sous-performance
                analysis = {
                    'product_id': product_id,
                    'title': product.get('title'),
                    'score': score,
                    'issues': self._identify_issues(product, analytics),
                    'recommendations': self._generate_recommendations(product, analytics)
                }
                weak_products.append(analysis)
        
        return {
            'weak_products': weak_products,
            'total_analyzed': len(products),
            'weak_count': len(weak_products),
            'timestamp': datetime.utcnow().isoformat()
        }
    
    def _calculate_performance_score(self, product: Dict, analytics: Dict) -> float:
        """Calcule un score de performance 0-100"""
        product_id = product.get('id')
        product_analytics = analytics.get(str(product_id), {})
        
        # Métriques
        views = product_analytics.get('views', 0)
        orders = product_analytics.get('orders', 0)
        revenue = product_analytics.get('revenue', 0)
        conversion_rate = (orders / views * 100) if views > 0 else 0
        
        # Scoring pondéré
        score = 0
        score += min(conversion_rate * 2, 30)  # 30% max pour conversion
        score += min(orders * 2, 30)  # 30% max pour ventes
        score += min(views / 10, 20)  # 20% max pour visibilité
        score += min(revenue / 100, 20)  # 20% max pour revenu
        
        return round(score, 2)
    
    def _identify_issues(self, product: Dict, analytics: Dict) -> List[str]:
        """Identifie les problèmes spécifiques du produit"""
        issues = []
        product_id = product.get('id')
        product_analytics = analytics.get(str(product_id), {})
        
        views = product_analytics.get('views', 0)
        orders = product_analytics.get('orders', 0)
        
        if views < 10:
            issues.append("Très faible visibilité")
        if views > 50 and orders == 0:
            issues.append("Taux de conversion nul")
        if not product.get('images'):
            issues.append("Pas d'image")
        if len(product.get('title', '')) < 20:
            issues.append("Titre trop court")
        if not product.get('body_html'):
            issues.append("Description manquante")
        
        return issues
    
    def _generate_recommendations(self, product: Dict, analytics: Dict) -> List[str]:
        """Génère des recommandations d'optimisation"""
        recommendations = []
        issues = self._identify_issues(product, analytics)
        
        if "Très faible visibilité" in issues:
            recommendations.append("Améliorer le SEO et les tags")
        if "Taux de conversion nul" in issues:
            recommendations.append("Revoir le prix et la description")
        if "Pas d'image" in issues:
            recommendations.append("Ajouter des images de qualité")
        if "Titre trop court" in issues:
            recommendations.append("Optimiser le titre avec mots-clés")
        if "Description manquante" in issues:
            recommendations.append("Créer une description détaillée")
        
        return recommendations
    
    def predict_future_performance(self, product: Dict, historical_data: List[Dict]) -> Dict:
        """
        Utilise l'IA pour prédire la performance future (Premium)
        
        Args:
            product: Produit Shopify
            historical_data: Données historiques de vente
        
        Returns:
            Prédictions et tendances
        """
        prompt = f"""Analyse les données historiques de ce produit et prédit sa performance future:

Produit: {product.get('title')}
Prix: ${product.get('variants', [{}])[0].get('price', 0)}

Données historiques:
{historical_data[-30:]}  # 30 derniers jours

Prédis:
1. Tendance de vente (hausse/baisse/stable)
2. Ventes estimées prochain mois
3. Actions recommandées
4. Score de confiance (0-100)

Format: JSON"""

        try:
            response = self.client.chat.completions.create(
                model="gpt-4",
                messages=[
                    {"role": "system", "content": "Tu es un expert en analyse prédictive e-commerce."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3
            )
            
            prediction = response.choices[0].message.content
            return {
                'product_id': product.get('id'),
                'prediction': prediction,
                'generated_at': datetime.utcnow().isoformat()
            }
        except Exception as e:
            return {'error': str(e)}
