"""
Content Generator - Réécriture automatique de contenu
======================================================
Génère des titres et descriptions optimisés pour le SEO et les conversions.
"""

import openai
from typing import Dict, List, Optional


class ContentGenerator:
    """Génère du contenu optimisé avec OpenAI GPT-4"""
    
    def __init__(self, openai_api_key: str):
        self.client = openai.OpenAI(api_key=openai_api_key)
    
    def generate_title(self, product: Dict, tier: str = "standard") -> str:
        """
        Génère un titre optimisé pour le produit
        
        Args:
            product: Produit Shopify
            tier: Plan (standard/pro/premium) - plus sophistiqué pour tiers supérieurs
        
        Returns:
            Nouveau titre optimisé
        """
        current_title = product.get('title', '')
        product_type = product.get('product_type', '')
        vendor = product.get('vendor', '')
        
        complexity = {
            'standard': "simple et clair",
            'pro': "optimisé SEO avec mots-clés",
            'premium': "ultra-optimisé avec storytelling et émotions"
        }
        
        prompt = f"""Réécris ce titre de produit e-commerce de manière {complexity.get(tier, 'simple')}:

Titre actuel: {current_title}
Type: {product_type}
Marque: {vendor}

Contraintes:
- Maximum 70 caractères
- Inclure mots-clés pertinents
- Attirer l'attention
- Optimisé pour Google Shopping

Nouveau titre:"""

        try:
            response = self.client.chat.completions.create(
                model="gpt-4",
                messages=[
                    {"role": "system", "content": "Tu es un expert en copywriting e-commerce et SEO."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7,
                max_tokens=100
            )
            
            new_title = response.choices[0].message.content.strip()
            return new_title if new_title else current_title
        
        except Exception as e:
            print(f"Erreur génération titre: {e}")
            return current_title
    
    def generate_description(self, product: Dict, tier: str = "pro") -> str:
        """
        Génère une description complète et persuasive
        
        Args:
            product: Produit Shopify
            tier: Plan - Pro et Premium ont descriptions complètes
        
        Returns:
            Description HTML optimisée
        """
        if tier == "standard":
            return product.get('body_html', '')  # Standard ne génère pas de descriptions
        
        title = product.get('title', '')
        current_desc = product.get('body_html', '')
        product_type = product.get('product_type', '')
        price = product.get('variants', [{}])[0].get('price', '0')
        
        style = {
            'pro': "persuasive avec bénéfices clairs",
            'premium': "storytelling captivant avec urgence et émotions"
        }
        
        prompt = f"""Crée une description de produit {style.get(tier, 'basique')} pour:

Produit: {title}
Type: {product_type}
Prix: ${price}
Description actuelle: {current_desc[:200]}...

Inclure:
- Accroche puissante
- 3-5 bénéfices clés
- Caractéristiques techniques
- Appel à l'action
{'- Storytelling émotionnel' if tier == 'premium' else ''}
{'- Sentiment d\'urgence/rareté' if tier == 'premium' else ''}

Format: HTML simple (p, ul, li, strong)"""

        try:
            response = self.client.chat.completions.create(
                model="gpt-4",
                messages=[
                    {"role": "system", "content": "Tu es un copywriter e-commerce expert qui booste les conversions."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.8,
                max_tokens=500 if tier == "premium" else 300
            )
            
            description = response.choices[0].message.content.strip()
            return description if description else current_desc
        
        except Exception as e:
            print(f"Erreur génération description: {e}")
            return current_desc
    
    def generate_seo_metadata(self, product: Dict) -> Dict:
        """
        Génère meta title, meta description et tags SEO (Premium)
        
        Returns:
            Dict avec seo_title, seo_description, tags
        """
        title = product.get('title', '')
        product_type = product.get('product_type', '')
        
        prompt = f"""Génère les métadonnées SEO optimales pour:

Produit: {title}
Catégorie: {product_type}

Fournis en JSON:
{{
  "seo_title": "titre SEO 60 chars max",
  "seo_description": "meta description 155 chars max",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}}"""

        try:
            response = self.client.chat.completions.create(
                model="gpt-4",
                messages=[
                    {"role": "system", "content": "Tu es un expert SEO e-commerce."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.5,
                response_format={"type": "json_object"}
            )
            
            import json
            metadata = json.loads(response.choices[0].message.content)
            return metadata
        
        except Exception as e:
            print(f"Erreur SEO metadata: {e}")
            return {
                "seo_title": title,
                "seo_description": "",
                "tags": []
            }
    
    def batch_optimize_content(self, products: List[Dict], tier: str) -> List[Dict]:
        """
        Optimise le contenu de plusieurs produits en batch
        
        Returns:
            Liste de produits avec nouveau contenu
        """
        optimized = []
        
        for product in products:
            result = {
                'product_id': product.get('id'),
                'original_title': product.get('title'),
                'new_title': self.generate_title(product, tier)
            }
            
            # Pro et Premium ont descriptions
            if tier in ['pro', 'premium']:
                result['new_description'] = self.generate_description(product, tier)
            
            # Premium a SEO metadata
            if tier == 'premium':
                result['seo_metadata'] = self.generate_seo_metadata(product)
            
            optimized.append(result)
        
        return optimized
