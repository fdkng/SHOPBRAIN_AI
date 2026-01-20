#!/usr/bin/env python3
"""
TEST COMPLET: Connexion Shopify et Récupération des Produits
========================================================

Ce script teste si la connexion Shopify fonctionne vraiment en:
1. Validant les credentials
2. Testant la connexion API
3. Récupérant les produits
4. Affichant les résultats détaillés
"""

import requests
import json
import sys

print("=" * 80)
print("🧪 TEST SHOPIFY CONNECTION - v1.0")
print("=" * 80)
print()

# ============================================================================
# ÉTAPE 1: Configurer les paramètres de test
# ============================================================================

print("📋 ÉTAPE 1: Configuration")
print("-" * 80)

# Remplacez ces valeurs par vos données de test réelles
SHOPIFY_SHOP_URL = input("📍 Entrez l'URL de votre boutique Shopify (ex: ma-boutique.myshopify.com): ").strip()
SHOPIFY_ACCESS_TOKEN = input("🔑 Entrez votre Access Token d'Admin API Shopify: ").strip()

if not SHOPIFY_SHOP_URL or not SHOPIFY_ACCESS_TOKEN:
    print("❌ URL et Token requis!")
    sys.exit(1)

# Valider le format
if not SHOPIFY_SHOP_URL.endswith('.myshopify.com'):
    print(f"❌ URL invalide. Format attendu: something.myshopify.com")
    print(f"   Vous avez entré: {SHOPIFY_SHOP_URL}")
    sys.exit(1)

print(f"✅ Shop URL: {SHOPIFY_SHOP_URL}")
print(f"✅ Token: {SHOPIFY_ACCESS_TOKEN[:10]}...{SHOPIFY_ACCESS_TOKEN[-5:]}")
print()

# ============================================================================
# ÉTAPE 2: Tester la validation du Token
# ============================================================================

print("🔐 ÉTAPE 2: Validation du Token")
print("-" * 80)

# Endpoint simple pour vérifier que le token est valide
# On va essayer de récupérer les produits
products_url = f"https://{SHOPIFY_SHOP_URL}/admin/api/2024-10/products.json?limit=1"
headers = {
    "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
    "Content-Type": "application/json"
}

print(f"📡 Envoi de requête à: {products_url}")

try:
    response = requests.get(products_url, headers=headers, timeout=10)
    print(f"📊 Status Code: {response.status_code}")
    
    if response.status_code == 200:
        print("✅ Token VALIDE - Connexion réussie!")
        data = response.json()
    elif response.status_code == 401:
        print("❌ Token INVALIDE ou EXPIRÉ")
        print(f"   Message: {response.text}")
        sys.exit(1)
    elif response.status_code == 404:
        print("❌ Shop URL non trouvée")
        print(f"   Message: {response.text}")
        sys.exit(1)
    else:
        print(f"❌ Erreur {response.status_code}")
        print(f"   Message: {response.text}")
        sys.exit(1)
        
except requests.exceptions.Timeout:
    print("❌ Timeout - La boutique prend trop longtemps à répondre")
    sys.exit(1)
except requests.exceptions.ConnectionError:
    print("❌ Erreur de connexion - Vérifiez votre URL Shopify")
    sys.exit(1)
except Exception as e:
    print(f"❌ Erreur: {e}")
    sys.exit(1)

print()

# ============================================================================
# ÉTAPE 3: Récupérer TOUS les produits
# ============================================================================

print("📦 ÉTAPE 3: Récupération des produits")
print("-" * 80)

products_url_all = f"https://{SHOPIFY_SHOP_URL}/admin/api/2024-10/products.json?limit=250"

try:
    response = requests.get(products_url_all, headers=headers, timeout=10)
    
    if response.status_code != 200:
        print(f"❌ Erreur lors de la récupération: {response.status_code}")
        print(f"   Message: {response.text}")
        sys.exit(1)
    
    products_data = response.json()
    products = products_data.get("products", [])
    
    print(f"✅ {len(products)} produit(s) trouvé(s)!")
    print()
    
    if len(products) == 0:
        print("⚠️  Votre boutique n'a pas de produits.")
        print("   Pour tester complètement, créez au moins 1 produit dans Shopify.")
        sys.exit(0)
    
    # ========================================================================
    # ÉTAPE 4: Analyser les produits
    # ========================================================================
    
    print("📊 ÉTAPE 4: Analyse des produits")
    print("-" * 80)
    print()
    
    total_variants = sum(len(p.get("variants", [])) for p in products)
    total_images = sum(len(p.get("images", [])) for p in products)
    
    print(f"📈 Statistiques:")
    print(f"   • Total de produits: {len(products)}")
    print(f"   • Total de variantes: {total_variants}")
    print(f"   • Total d'images: {total_images}")
    print()
    
    # ========================================================================
    # ÉTAPE 5: Afficher les détails de chaque produit
    # ========================================================================
    
    print("🔍 ÉTAPE 5: Détails des produits")
    print("-" * 80)
    
    for i, product in enumerate(products[:10], 1):  # Afficher les 10 premiers
        print()
        print(f"Produit #{i}")
        print(f"├─ ID: {product.get('id')}")
        print(f"├─ Titre: {product.get('title')}")
        print(f"├─ Description: {product.get('body_html', '')[:100]}{'...' if len(product.get('body_html', '')) > 100 else ''}")
        print(f"├─ Type: {product.get('product_type')}")
        print(f"├─ Variantes: {len(product.get('variants', []))}")
        
        variants = product.get("variants", [])
        if variants:
            for j, variant in enumerate(variants[:3], 1):  # Afficher les 3 premières variantes
                print(f"│  ├─ Variante #{j}: {variant.get('title')} - {variant.get('price')} CAD")
        
        images = product.get("images", [])
        print(f"├─ Images: {len(images)}")
        if images:
            print(f"│  └─ Image principale: {images[0].get('src', 'N/A')[:80]}...")
        
        status = "✅ PUBLIÉ" if product.get("published_at") else "❌ BROUILLON"
        print(f"└─ Statut: {status}")
    
    if len(products) > 10:
        print()
        print(f"... et {len(products) - 10} produit(s) supplémentaire(s)")
    
    print()
    
    # ========================================================================
    # ÉTAPE 6: Vérifications de validation
    # ========================================================================
    
    print("✔️ ÉTAPE 6: Validations")
    print("-" * 80)
    
    checks = {
        "Produits trouvés": len(products) > 0,
        "Au moins 1 variante par produit": all(len(p.get('variants', [])) > 0 for p in products),
        "Tous les produits ont un titre": all(p.get('title') for p in products),
        "Tous les produits ont un prix": all(
            any(v.get('price') for v in p.get('variants', [])) 
            for p in products
        ),
    }
    
    for check_name, result in checks.items():
        status = "✅" if result else "⚠️"
        print(f"{status} {check_name}")
    
    print()
    
    # ========================================================================
    # RÉSULTAT FINAL
    # ========================================================================
    
    print("=" * 80)
    print("✅ TEST RÉUSSI!")
    print("=" * 80)
    print()
    print("✅ Connexion Shopify fonctionne PARFAITEMENT")
    print(f"✅ {len(products)} produit(s) récupérés avec succès")
    print(f"✅ API Shopify répond correctement")
    print()
    print("💡 Prochaines étapes:")
    print("1. Utilisez ces données pour optimiser vos produits")
    print("2. L'IA peut maintenant analyser vos produits")
    print("3. Vous pouvez mettre à jour les titres, descriptions, prix, etc.")
    print()
    
except Exception as e:
    print(f"❌ Erreur lors de la récupération des produits: {e}")
    sys.exit(1)
