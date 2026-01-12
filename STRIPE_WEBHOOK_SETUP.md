# Configuration Stripe Webhook - Setup Final

## 🎯 Objectif
Faire en sorte que **quand un client paie**, le site s'en souvient et déverrouille le dashboard automatiquement.

## ✅ État actuel du code

### Backend (main.py) - PRÊT ✅
- Webhook endpoint: `POST /webhook` (ligne 325)
- Persiste subscription à `subscriptions` table via Supabase
- Subscription check endpoint: `POST /api/subscription/status` (ligne 942)
- Détecte plan via line items Stripe et persiste en DB

### Frontend (App.jsx) - PRÊT ✅
- Détecte paiement success via URL query (`?payment=success` ou `?session_id=...`)
- Poll subscription status pendant 15 sec
- Auto-route vers dashboard quand `hasSubscription=true`
- Affiche banner "Paiement réussi!" avec bouton dashboard

### Supabase Schema - PRÊT ✅
- Table `subscriptions` avec colonnes: `user_id, email, stripe_session_id, stripe_subscription_id, stripe_customer_id, plan_tier, status, created_at, updated_at`
- Policies RLS actives

---

## 🔧 ÉTAPES DE CONFIGURATION

### ÉTAPE 1: Vérifier Render env vars

Accède à **Render Dashboard** → ton service shopbrain-backend → **Environment**

Vérifie que ces variables sont SET (sinon, ajoute-les):

```
STRIPE_SECRET_KEY=sk_live_xxxx (ou sk_test_xxxx si test)
STRIPE_WEBHOOK_SECRET=whsec_xxxx (on la crée à l'étape 2)
SUPABASE_SERVICE_KEY=eyJ... (ta clé service Supabase)
SUPABASE_JWT_SECRET=votre-secret-jwt (ta clé JWT Supabase)
FRONTEND_ORIGIN=https://fdkng.github.io/SHOPBRAIN_AI
```

**➜ Redéploie le service après modification** (Manual Deploy)

---

### ÉTAPE 2: Créer Stripe Webhook

1. Va sur **Stripe Dashboard** → Developers → **Webhooks**
2. Clique **Add endpoint**
3. Rentre l'URL du webhook:
   ```
   https://shopbrain-backend.onrender.com/webhook
   ```
4. Sélectionne les événements:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
5. Clique **Add endpoint**
6. Copie le **Signing secret** (commence par `whsec_`)
7. Colle-la dans Render env var: `STRIPE_WEBHOOK_SECRET=whsec_xxxx`
8. **Redéploie** Render

---

### ÉTAPE 3: Tester le flow complet

#### Test 1: Health Check
```bash
curl https://shopbrain-backend.onrender.com/health
# Réponse attendue: {"status":"ok","version":"1.3","cors":"fixed"}
```

#### Test 2: Checkout Session
1. Va sur https://fdkng.github.io/SHOPBRAIN_AI
2. Clique **Se connecter** → crée un compte test (email de test)
3. Clique **Voir tous les plans** → Stripe Pricing Table s'ouvre
4. Sélectionne un plan, clique **Subscribe**
5. Paie avec la carte test: **4242 4242 4242 4242** (exp: 12/34, CVC: 999)
6. ✅ Tu es redirigé vers home avec `?payment=success&session_id=...`
7. ✅ Banner vert "Paiement réussi!" apparaît
8. Attends 2-3 sec (polling)
9. ✅ Bouton "Accéder au dashboard →" devient bleu/actif
10. Clique le bouton → tu entres au **dashboard** 🎉

#### Test 3: Vérifier DB
Va sur **Supabase Dashboard** → Table **subscriptions**
Tu dois voir une ligne avec:
- `user_id` = ton user ID
- `stripe_session_id` = l'ID de ta session checkout
- `plan_tier` = '99', '199', ou '299'
- `status` = 'active'

---

### Quick test helpers (dev)

Si les webhooks prennent du temps ou si tu veux forcer la persistance pendant les tests, utilise la méthode suivante :

- Active temporairement la variable d'environnement `DEV_ALLOW_UNAUTH_VERIFY=true` sur Render (ton service backend) et redéploie.
- Cela exposera un endpoint protégé `POST /dev/verify-session` qui récupère la session Stripe et persiste une ligne dans `subscriptions` en utilisant `SUPABASE_SERVICE_KEY`.

Un script d'aide est inclus dans le repo : `scripts/dev_verify_test.sh`.

Exemple d'utilisation :

```bash
# Appelle d'abord le endpoint dev (si activé) pour forcer la persistance
PROD_BACKEND_URL="https://shopbrain-backend.onrender.com" \
      ./scripts/dev_verify_test.sh <CHECKOUT_SESSION_ID> <OPTIONAL_USER_ID>
```

Le script appellera aussi l'endpoint de production `/api/subscription/verify-session` si tu fournis `SUPABASE_TOKEN` dans ton environnement (utile pour tester le flux réel où le front envoie un token Supabase).

IMPORTANT: Désactive `DEV_ALLOW_UNAUTH_VERIFY` après tests (mettre `false`) — c'est uniquement pour debug.


---

## 🐛 Troubleshooting

### Problem: "Failed to fetch" quand j'achète
- Vérifie CORS: backend doit inclure `https://fdkng.github.io/SHOPBRAIN_AI` dans `allowed_origins`
- Vérifie `FRONTEND_ORIGIN` env var est SET

### Problem: Paiement réussi mais dashboard reste verrouillé
- Vérifie STRIPE_WEBHOOK_SECRET est SET et correct dans Render
- Attends 15 sec (c'est le délai max de polling frontend)
- Regarde la table `subscriptions` en Supabase: la ligne existe-t-elle?
- Si non: webhook n'a pas déclenché → vérifie Stripe webhook logs

### Problem: Webhook n'est pas déclenché
- Va sur **Stripe Dashboard** → Developers → **Webhooks**
- Clique sur ton endpoint
- Regarde **Events** → y a-t-il des `checkout.session.completed` avec status `Sent`?
- Si ❌ (Failed): scroll down → voir le message d'erreur de réponse
- Possible causes:
  - `STRIPE_WEBHOOK_SECRET` incorrect → webhook signature fails
  - Backend `/webhook` ne répond pas → check Render logs

### Problem: Voir erreurs backend
- Va sur **Render Dashboard** → ton service → **Logs**
- Scroll et cherche logs après ton test (timestamps)
- Cherche `❌` ou `Error` pour diagnostiquer

---

## ✨ Le Flow Complet

```
Client paye via Stripe
      ↓
Stripe → POST /webhook (backend)
      ↓
Backend valide signature (STRIPE_WEBHOOK_SECRET)
      ↓
Backend lit line_items → determine plan_tier
      ↓
Backend insert into subscriptions table
      ↓
Frontend redirect to homepage ?payment=success&session_id=...
      ↓
Frontend détecte success dans URL
      ↓
Frontend poll POST /api/subscription/status chaque 1sec (15sec max)
      ↓
Supabase retourne subscription active
      ↓
Frontend set hasSubscription=true
      ↓
Frontend auto-route vers #dashboard
      ↓
Dashboard affiche ses outils (analyse produits, Shopify connect, IA)
      ↓
✅ CLIENT A ACCÈS AU DASHBOARD
```

---

## 📋 Checklist Final

- [ ] Render env vars SET: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_SERVICE_KEY, SUPABASE_JWT_SECRET
- [ ] Stripe webhook créé et signing secret copié
- [ ] Render redéployé
- [ ] Test checkout avec 4242 carte
- [ ] Paiement réussi → home redirect
- [ ] Dashboard banner vert apparaît
- [ ] After 2-3sec → bouton dashboard devient actif
- [ ] Clique dashboard → entre dans l'app
- [ ] Supabase table `subscriptions` contient la ligne

Une fois que tout fonctionne → **ton système de paiement est GO** 🚀
