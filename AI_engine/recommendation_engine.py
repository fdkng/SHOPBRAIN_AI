"""
Recommendation Engine - Cross-sell & Upsell
============================================
Suggère des produits complémentaires et upsells personnalisés.
Pro et Premium.
"""

import openai
from typing import Dict, List, Optional
import json


class RecommendationEngine:
    """Génère des recommandations de produits intelligentes"""
    
    def __init__(self, openai_api_key: str):
        self.client = openai.OpenAI(api_key=openai_api_key)
    
    def generate_cross_sell(self, product: Dict, all_products: List[Dict], tier: str = "pro") -> List[Dict]:
        """
        Suggère des produits complémentaires (cross-sell)
        
        Args:
            product: Produit de base
            all_products: Tous les produits disponibles
            tier: pro (basique) / premium (IA avancée)
        
        Returns:
            Liste de produits recommandés avec scores
        """
        if tier == "pro":
            return self._rule_based_cross_sell(product, all_products)
        elif tier == "premium":
            return self._ai_powered_cross_sell(product, all_products)
        
        return []
    
    def generate_upsell(self, product: Dict, all_products: List[Dict], tier: str = "pro") -> List[Dict]:
        """
        Suggère des produits supérieurs (upsell)
        
        Args:
            product: Produit de base
            all_products: Tous les produits disponibles
            tier: pro (basique) / premium (IA avancée)
        
        Returns:
            Liste de produits upsell avec justifications
        """
        current_price = float(product.get('variants', [{}])[0].get('price', 0))
        product_type = product.get('product_type', '')
        
        # Trouve produits similaires plus chers
        upsell_candidates = [
            p for p in all_products
            if p.get('product_type') == product_type
            and float(p.get('variants', [{}])[0].get('price', 0)) > current_price
            and float(p.get('variants', [{}])[0].get('price', 0)) <= current_price * 1.5
        ]
        
        if tier == "premium" and upsell_candidates:
            return self._ai_powered_upsell(product, upsell_candidates)
        
        # Simple upsell basé sur prix
        return [
            {
                'product_id': p.get('id'),
                'title': p.get('title'),
                'price': p.get('variants', [{}])[0].get('price'),
                'reason': 'Version supérieure',
                'confidence': 0.7
            }
            for p in upsell_candidates[:3]
        ]
    
    def _rule_based_cross_sell(self, product: Dict, all_products: List[Dict]) -> List[Dict]:
        """Cross-sell basé sur règles simples (Pro)"""
        product_type = product.get('product_type', '')
        product_tags = set(product.get('tags', '').split(','))
        
        recommendations = []
        
        for p in all_products:
            if p.get('id') == product.get('id'):
                continue
            
            score = 0
            p_tags = set(p.get('tags', '').split(','))
            
            # Même catégorie = +30
            if p.get('product_type') == product_type:
                score += 30
            
            # Tags communs
            common_tags = product_tags.intersection(p_tags)
            score += len(common_tags) * 10
            
            # Prix similaire = +20
            current_price = float(product.get('variants', [{}])[0].get('price', 0))
            p_price = float(p.get('variants', [{}])[0].get('price', 0))
            if 0.7 * current_price <= p_price <= 1.3 * current_price:
                score += 20
            
            if score >= 40:
                recommendations.append({
                    'product_id': p.get('id'),
                    'title': p.get('title'),
                    'price': p_price,
                    'score': score,
                    'reason': f"{len(common_tags)} tags communs"
                })
        
        # Top 5 recommandations
        recommendations.sort(key=lambda x: x['score'], reverse=True)
        return recommendations[:5]
    
    def _ai_powered_cross_sell(self, product: Dict, all_products: List[Dict]) -> List[Dict]:
        """Cross-sell intelligent avec IA (Premium)"""
        title = product.get('title', '')
        product_type = product.get('product_type', '')
        description = product.get('body_html', '')[:300]
        
        # Liste des produits disponibles (simplifié)
        products_summary = [
            {
                'id': p.get('id'),
                'title': p.get('title'),
                'type': p.get('product_type'),
                'price': p.get('variants', [{}])[0].get('price')
            }
            for p in all_products[:50]  # Limite pour le prompt
        ]
        
        prompt = f"""Tu es un expert en merchandising e-commerce. 

Un client regarde ce produit:
Titre: {title}
Catégorie: {product_type}
Description: {description}

Parmi ces produits disponibles, recommande les 5 meilleurs produits COMPLÉMENTAIRES (cross-sell):
{json.dumps(products_summary, indent=2)}

Critères:
- Produits qui vont naturellement ensemble
- Maximise la valeur panier
- Logique d'achat

Réponds en JSON:
{{
  "recommendations": [
    {{
      "product_id": "123",
      "title": "...",
      "reason": "Complément parfait car...",
      "confidence": 0.95
    }}
  ]
}}"""

        try:
            response = self.client.chat.completions.create(
                model="gpt-4",
                messages=[
                    {"role": "system", "content": "Tu es un expert merchandising qui comprend les comportements d'achat."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.4,
                response_format={"type": "json_object"}
            )
            
            result = json.loads(response.choices[0].message.content)
            return result.get('recommendations', [])
        
        except Exception as e:
            print(f"Erreur AI cross-sell: {e}")
            return self._rule_based_cross_sell(product, all_products)
    
    def _ai_powered_upsell(self, product: Dict, upsell_candidates: List[Dict]) -> List[Dict]:
        """Upsell intelligent avec IA (Premium)"""
        title = product.get('title', '')
        current_price = product.get('variants', [{}])[0].get('price')
        
        candidates_summary = [
            {
                'id': p.get('id'),
                'title': p.get('title'),
                'price': p.get('variants', [{}])[0].get('price'),
                'description': p.get('body_html', '')[:200]
            }
            for p in upsell_candidates
        ]
        
        prompt = f"""Un client considère:
Produit: {title}
Prix: ${current_price}

Recommande les 3 meilleurs UPSELLS parmi:
{json.dumps(candidates_summary, indent=2)}

Fournis arguments convaincants pour justifier la différence de prix.

JSON:
{{
  "upsells": [
    {{
      "product_id": "123",
      "title": "...",
      "price_difference": "+$20",
      "value_proposition": "argument convaincant",
      "confidence": 0.9
    }}
  ]
}}"""

        try:
            response = self.client.chat.completions.create(
                model="gpt-4",
                messages=[
                    {"role": "system", "content": "Tu es un expert en upselling persuasif."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.5,
                response_format={"type": "json_object"}
            )
            
            result = json.loads(response.choices[0].message.content)
            return result.get('upsells', [])
        
        except Exception as e:
            print(f"Erreur AI upsell: {e}")
            return []
    
    def generate_bundle_suggestions(self, products: List[Dict]) -> List[Dict]:
        """
        Suggère des bundles de produits (Premium)
        
        Returns:
            Bundles optimaux avec pricing suggéré
        """
        prompt = f"""Analyse ces produits et crée 3-5 bundles attractifs:

Produits:
{json.dumps([{'id': p.get('id'), 'title': p.get('title'), 'price': p.get('variants', [{}])[0].get('price')} for p in products[:30]], indent=2)}

Pour chaque bundle:
- 2-4 produits complémentaires
- Prix bundle (10-20% discount)
- Nom accrocheur
- Arguments de vente

JSON:
{{
  "bundles": [
    {{
      "name": "...",
      "product_ids": ["123", "456"],
      "individual_total": 100,
      "bundle_price": 85,
      "savings": 15,
      "pitch": "..."
    }}
  ]
}}"""

        try:
            response = self.client.chat.completions.create(
                model="gpt-4",
                messages=[
                    {"role": "system", "content": "Tu es un expert en création de bundles e-commerce profitables."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.6,
                response_format={"type": "json_object"}
            )
            
            result = json.loads(response.choices[0].message.content)
            return result.get('bundles', [])
        
        except Exception as e:
            print(f"Erreur bundle suggestions: {e}")
            return []
    
    def personalized_recommendations(self, customer_history: List[Dict], all_products: List[Dict]) -> List[Dict]:
        """
        Recommandations personnalisées basées sur l'historique client (Premium)
        
        Args:
            customer_history: Achats précédents du client
            all_products: Catalogue complet
        
        Returns:
            Produits recommandés personnalisés
        """
        # Analyse des patterns d'achat
        purchased_types = [p.get('product_type') for p in customer_history]
        avg_spend = sum(float(p.get('variants', [{}])[0].get('price', 0)) for p in customer_history) / len(customer_history)
        
        # Filtre produits similaires non achetés
        recommendations = []
        purchased_ids = set(p.get('id') for p in customer_history)
        
        for product in all_products:
            if product.get('id') in purchased_ids:
                continue
            
            product_price = float(product.get('variants', [{}])[0].get('price', 0))
            
            # Dans la gamme de prix habituelle
            if 0.8 * avg_spend <= product_price <= 1.5 * avg_spend:
                # Catégories similaires
                if product.get('product_type') in purchased_types:
                    recommendations.append({
                        'product_id': product.get('id'),
                        'title': product.get('title'),
                        'price': product_price,
                        'reason': 'Basé sur vos achats précédents',
                        'confidence': 0.85
                    })
        
        return recommendations[:10]
