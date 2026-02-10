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
        tags = product.get('tags', '')
        variants = product.get('variants', []) or []
        options = product.get('options', []) or []
        prices = [float(v.get('price') or 0) for v in variants if v.get('price')]
        compare_prices = [float(v.get('compare_at_price') or 0) for v in variants if v.get('compare_at_price')]
        price_min = min(prices) if prices else 0
        price_max = max(prices) if prices else 0
        compare_max = max(compare_prices) if compare_prices else 0
        option_summary = ", ".join([o.get('name', '') for o in options if o.get('name')])
        
        complexity = {
            'standard': "simple et clair",
            'pro': "optimisé SEO avec mots-clés",
            'premium': "ultra-optimisé avec storytelling et émotions"
        }
        
        prompt = f"""Réécris ce titre de produit e-commerce en français, de manière {complexity.get(tier, 'simple')}.

    Contexte produit:
    - Titre actuel: {current_title}
    - Type: {product_type}
    - Marque: {vendor}
    - Tags: {tags}
    - Options: {option_summary}
    - Prix: {price_min:.2f} à {price_max:.2f} (comparé max: {compare_max:.2f} si dispo)

    Contraintes strictes:
    - 60 à 70 caractères maximum
    - Sans emojis
    - 1 seul titre final
    - Clair, précis, orienté bénéfice
    - N'invente pas de caractéristiques non présentes dans le contexte

    Nouveau titre:"""

        try:
            response = self.client.chat.completions.create(
                model="gpt-4",
                messages=[
                    {"role": "system", "content": "Tu es un expert en copywriting e-commerce et SEO."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.65,
                max_tokens=120
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
        vendor = product.get('vendor', '')
        tags = product.get('tags', '')
        variants = product.get('variants', []) or []
        options = product.get('options', []) or []
        prices = [float(v.get('price') or 0) for v in variants if v.get('price')]
        compare_prices = [float(v.get('compare_at_price') or 0) for v in variants if v.get('compare_at_price')]
        price_min = min(prices) if prices else 0
        price_max = max(prices) if prices else 0
        compare_max = max(compare_prices) if compare_prices else 0
        option_summary = ", ".join([o.get('name', '') for o in options if o.get('name')])
        
        style = {
            'pro': "persuasive avec bénéfices clairs",
            'premium': "storytelling captivant avec urgence et émotions"
        }
        
        prompt = f"""Crée une description de produit en français, très détaillée et professionnelle.

    Contexte produit:
    - Titre: {title}
    - Type: {product_type}
    - Marque: {vendor}
    - Tags: {tags}
    - Options: {option_summary}
    - Prix: {price_min:.2f} à {price_max:.2f} (comparé max: {compare_max:.2f} si dispo)
    - Extrait description actuelle: {current_desc[:300]}...

    Exigences:
    - N'invente pas de caractéristiques non présentes dans le contexte.
    - Si une info manque, utilise une formulation prudente (ex: « conçu pour », « idéal pour »).
    - Ton: {style.get(tier, 'basique')}.
    - Sans emojis.
    - Longueur: {'450-700 mots' if tier == 'premium' else '300-500 mots'}.

    Structure attendue (HTML simple):
    1) <p><strong>Accroche</strong> ...</p>
    2) <p>Résumé valeur (2-3 phrases)</p>
    3) <h3>Bénéfices clés</h3><ul><li>...</li></ul>
    4) <h3>Caractéristiques</h3><ul><li>...</li></ul>
    5) <h3>Pour qui / usages</h3><p>...</p>
    6) <h3>Pourquoi ce produit</h3><p>...</p>
    7) <h3>FAQ</h3><ul><li><strong>Q:</strong> ... <strong>R:</strong> ...</li></ul>
    8) <p><strong>Appel à l'action</strong> ...</p>

    Retourne uniquement le HTML."""

        try:
            response = self.client.chat.completions.create(
                model="gpt-4",
                messages=[
                    {"role": "system", "content": "Tu es un copywriter e-commerce expert qui booste les conversions."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.75,
                max_tokens=900 if tier == "premium" else 600
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
