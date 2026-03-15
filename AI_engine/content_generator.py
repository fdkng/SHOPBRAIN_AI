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
        
        prompt = f"""Réécris ce titre de produit pour MAXIMISER les clics et les ventes.

    Contexte produit:
    - Titre actuel: {current_title}
    - Type: {product_type}
    - Marque: {vendor}
    - Tags: {tags}
    - Options: {option_summary}
    - Prix: {price_min:.2f} à {price_max:.2f} (comparé max: {compare_max:.2f} si dispo)

    TECHNIQUES À APPLIQUER:
    1. Commence par le BÉNÉFICE principal (ce que le client OBTIENT, pas ce que le produit EST)
    2. Inclus un mot déclencheur émotionnel (ex: Ultime, Premium, Essentiel, Irrésistible)
    3. Mentionne la catégorie ou le mot-clé principal pour le SEO
    4. Si pertinent: ajoute un élément de preuve sociale ou de qualité

    CONTRAINTES STRICTES:
    - 60 à 70 caractères maximum
    - Sans emojis
    - 1 seul titre final, rien d'autre
    - NE JAMAIS inclure le prix (pas de €, $, montant)
    - N'invente AUCUNE caractéristique absente du contexte
    - Le titre doit sonner naturel et professionnel, pas clickbait cheap

    Nouveau titre:"""

        try:
            response = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "Tu es le meilleur copywriter e-commerce au monde. Tu maîtrises AIDA, les power words, le SEO e-commerce et la psychologie du consommateur. Ton objectif: créer des titres qui STOPPENT le scroll et donnent immédiatement envie de cliquer."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7,
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
        
        prompt = f"""Réécris cette description de produit comme si tu étais le meilleur vendeur du monde et que ta commission dépendait de chaque vente.

    Contexte produit:
    - Titre: {title}
    - Type: {product_type}
    - Marque: {vendor}
    - Tags: {tags}
    - Options: {option_summary}
    - Prix: {price_min:.2f} à {price_max:.2f} (comparé max: {compare_max:.2f} si dispo)
    - Description actuelle: {current_desc[:800]}

    OBJECTIF: Écrire une description qui VEND. Pas juste décrire — CONVAINCRE.

    STRATÉGIE D'ÉCRITURE:
    1. ACCROCHE CHOC (1-2 phrases): Identifie le PROBLÈME ou le DÉSIR du client. Fais-lui ressentir pourquoi il a BESOIN de ce produit.
    2. PROMESSE DE VALEUR: Explique comment ce produit va TRANSFORMER son quotidien. Sois spécifique.
    3. BÉNÉFICES CLÉS (pas juste des features): Chaque point doit répondre à "Qu'est-ce que ça change pour MOI?"
    4. PREUVE ET CONFIANCE: Mentionne la qualité, les matériaux, le savoir-faire.
    5. APPEL À L'ACTION PUISSANT: Donne une raison d'acheter MAINTENANT.

    CONTRAINTES:
    - N'invente AUCUNE caractéristique absente du contexte
    - Si une info manque, utilise une formulation prudente (« conçu pour », « idéal pour »)
    - Ton: professionnel mais chaleureux, jamais agressif
    - Sans emojis, sans markdown
    - Longueur: {'450-700 mots' if tier == 'premium' else '300-500 mots'}

    STRUCTURE HTML:
    <p><strong>[Accroche percutante]</strong></p>
    <p>[Promesse de valeur — pourquoi ce produit change tout]</p>
    <h3>✦ Ce que vous allez adorer</h3>
    <ul><li><strong>[Bénéfice]</strong> — [explication concrète]</li></ul>
    <h3>✦ Qualité & Détails</h3>
    <ul><li>[Caractéristique → avantage]</li></ul>
    <h3>✦ Pour qui?</h3><p>[cible idéale]</p>
    <p><strong>[Appel à l'action irrésistible]</strong></p>

    Retourne uniquement le HTML brut, sans balises ```html ni aucun wrapper markdown."""

        try:
            response = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": """Tu es le meilleur vendeur e-commerce au monde — un copywriter d'élite. Tu maîtrises:
- AIDA (Attention → Intérêt → Désir → Action)
- PAS (Problem → Agitate → Solve)
- Storytelling sensoriel (faire VOIR, SENTIR, TOUCHER le produit)
- Les power words qui déclenchent l'achat
- La psychologie du consommateur: parler des BÉNÉFICES, pas des features
- Lever les objections AVANT qu'elles n'arrivent
RÈGLE D'OR: Chaque phrase doit rapprocher le lecteur de l'achat.
Tu retournes UNIQUEMENT du HTML brut. Jamais de markdown. Jamais de ```html."""},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.78,
                max_tokens=1200 if tier == "premium" else 800
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
                model="gpt-4o-mini",
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
