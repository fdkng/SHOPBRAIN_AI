# TRUTH Ads Setup

## Objectif
Activer les intégrations réelles `Meta Ads` et `TikTok Ads` pour alimenter la page `TRUTH / Real Profit` avec des dépenses, clics, impressions, CTR, CPC et, quand disponible, le revenu reporté par plateforme.

## Variables d’environnement

### Meta Ads
Ajouter dans l’environnement backend:

```env
TRUTH_META_ACCESS_TOKEN=your_meta_access_token
TRUTH_META_AD_ACCOUNT_ID=123456789012345
TRUTH_META_API_VERSION=v20.0
```

Notes:
- `TRUTH_META_AD_ACCOUNT_ID` peut être fourni avec ou sans préfixe `act_`.
- Le token doit avoir accès aux insights de l’ad account.

### TikTok Ads
Ajouter dans l’environnement backend:

```env
TRUTH_TIKTOK_ACCESS_TOKEN=your_tiktok_access_token
TRUTH_TIKTOK_ADVERTISER_ID=1234567890123456789
TRUTH_TIKTOK_API_VERSION=v1.3
```

Notes:
- Le token doit donner accès au reporting `campaign`.
- L’endpoint TRUTH essaie de récupérer `spend`, `clicks`, `impressions`, `ctr`, `cpc` et `real_time_conversion_value`.

## Fallback JSON (optionnel)
Si les APIs ne sont pas encore branchées, tu peux injecter des campagnes via variables JSON:

```env
TRUTH_META_ADS_JSON={"campaigns":[{"campaign_name":"Meta Prospecting","spend":350,"clicks":820,"impressions":15400,"platform_revenue":910}]}
TRUTH_TIKTOK_ADS_JSON={"campaigns":[{"campaign_name":"TikTok UGC","spend":180,"clicks":420,"impressions":9800,"platform_revenue":300}]}
```

Le backend utilise ce fallback seulement si la source réelle n’est pas disponible pour la plateforme concernée.

## Cache
Le reporting ads est mis en cache en mémoire pour limiter les appels API:

```env
TRUTH_ADS_CACHE_TTL=300
```

## UTM Tracking MVP
Le script storefront est disponible ici:

- `frontend/public/truth-utm-tracker.js`

Snippet:

```html
<script src="/truth-utm-tracker.js" defer></script>
```

Ce script:
- capture `utm_source`, `utm_campaign`, `utm_content`
- stocke les valeurs dans `localStorage`
- les injecte dans les formulaires comme attributs cachés

## Endpoint utilisé
La page TRUTH consomme:

- `GET /api/truth/dashboard?range=30d`

## Résultat attendu
Une fois Shopify + Meta/TikTok + UTM actifs, TRUTH devient la source de vérité business:
- `Revenue REAL`
- `Ad Spend`
- `Profit`
- `ROAS REAL`
- `Platform ROAS`
- `Error %`
