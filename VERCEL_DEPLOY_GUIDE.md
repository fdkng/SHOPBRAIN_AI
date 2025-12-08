# Guide Vercel - Déploiement Frontend (Ultra-Précis)

## Étape 1: Créer un compte Vercel (2 min)

1. Va sur https://vercel.com/signup
2. Clique **"Continue with GitHub"**
3. Autorise Vercel à accéder à ton compte GitHub
4. Tu arrives sur le Dashboard Vercel

## Étape 2: Importer le projet (3 min)

### 2.1 Créer un nouveau projet
1. Sur le Dashboard Vercel, clique **"Add New..."** → **"Project"**
2. Dans "Import Git Repository", cherche **`SHOPBRAIN_AI`**
3. Clique **"Import"** à côté du repo `fdkng/SHOPBRAIN_AI`

### 2.2 Configurer le projet

**Important: Configure le Root Directory**
- Cherche **"Root Directory"**
- Clique **"Edit"**
- Sélectionne **`frontend`** dans la liste déroulante
- Clique **"Continue"**

**Framework Preset:**
- Vercel devrait détecter automatiquement **"Vite"**
- Si pas détecté, sélectionne **"Vite"** dans le dropdown

**Build & Output Settings:**
- Build Command: `npm ci && npm run build` (par défaut, ne pas toucher)
- Output Directory: `dist` (par défaut, ne pas toucher)
- Install Command: `npm ci` (par défaut, ne pas toucher)

## Étape 3: Variables d'environnement (CRITIQUE - 5 min)

**Avant de déployer, ajoute les variables d'environnement:**

1. Dans la page de configuration du projet, descends jusqu'à **"Environment Variables"**

2. **Ajoute ces variables UNE PAR UNE:**

   **Variable 1:**
   - Name: `VITE_API_BASE`
   - Value: `https://shopbrain-backend.onrender.com`
   - Environment: Coche **"Production"**, **"Preview"**, **"Development"**
   - Clique **"Add"**

   **Variable 2 (si tu utilises Supabase côté frontend):**
   - Name: `VITE_SUPABASE_URL`
   - Value: [Ton URL Supabase, ex: `https://xxxxx.supabase.co`]
   - Environment: Coche **"Production"**, **"Preview"**, **"Development"**
   - Clique **"Add"**

   **Variable 3 (si tu utilises Supabase côté frontend):**
   - Name: `VITE_SUPABASE_ANON_KEY`
   - Value: [Ta clé anon Supabase]
   - Environment: Coche **"Production"**, **"Preview"**, **"Development"**
   - Clique **"Add"**

## Étape 4: Déployer (2 min)

1. Une fois les variables ajoutées, clique **"Deploy"** (bouton bleu en bas)
2. Vercel va:
   - Cloner le repo
   - Installer les dépendances (`npm ci`)
   - Builder le projet (`npm run build`)
   - Déployer sur CDN

3. **Attends la fin du build** (1-3 minutes)
   - Tu verras des logs en temps réel
   - Attends le message **"✓ Production: [URL]"**

4. **Récupère ton URL:**
   - Format: `https://shopbrain-ai-xxxxx.vercel.app` ou `https://shopbrain-frontend.vercel.app`
   - **COPIE CETTE URL EXACTE** (tu en auras besoin pour l'étape 5)

## Étape 5: Tester le déploiement (1 min)

1. Clique sur l'URL de production
2. Le site devrait charger
3. Si erreur 404 ou page blanche:
   - Vérifie que Root Directory = `frontend`
   - Vérifie que les variables d'environnement sont bien set
   - Redéploie: Project Settings → Deployments → "..." → Redeploy

## Étape 6: Configurer CORS sur Render (OBLIGATOIRE - 3 min)

1. Va sur https://dashboard.render.com
2. Sélectionne **`shopbrain-backend`**
3. Clique **"Environment"** dans le menu gauche
4. Cherche la variable **`FRONTEND_ORIGIN`**
5. **Change sa valeur pour l'URL Vercel EXACTE** (celle que tu as copiée à l'étape 4)
   - Exemple: `https://shopbrain-ai-xxxxx.vercel.app`
   - **IMPORTANT: Pas de slash `/` à la fin**
6. Clique **"Save"**
7. Va dans **"Deployments"**
8. Clique **"Manual Deploy"** → **"Deploy latest commit"**
9. Attends que le backend redémarre (2-3 min)

## Étape 7: Vérification finale (2 min)

### Test 1: Frontend charge
- Ouvre ton URL Vercel
- La page doit charger sans erreur

### Test 2: Backend accessible
- Ouvre `https://shopbrain-backend.onrender.com/docs`
- Swagger UI doit s'afficher

### Test 3: CORS fonctionne
- Sur ton site Vercel, ouvre la console navigateur (F12)
- Essaie de faire une requête à ton API (ex: connexion/inscription)
- **PAS d'erreur CORS** = ✅ OK
- **Erreur CORS** = vérifie que `FRONTEND_ORIGIN` dans Render correspond EXACTEMENT à l'URL Vercel

## Récapitulatif des URLs

Après déploiement, tu auras:
- **Frontend (Vercel):** `https://ton-site.vercel.app`
- **Backend (Render):** `https://shopbrain-backend.onrender.com`
- **API Docs:** `https://shopbrain-backend.onrender.com/docs`

## Prochaines étapes

1. ✅ Frontend déployé sur Vercel
2. ✅ CORS configuré sur Render
3. ⏳ Créer le webhook Stripe (étape suivante)
4. ⏳ Tester le flow complet (signup → optimize → checkout)

## Dépannage rapide

**Erreur: "Build failed"**
- Vérifie que Root Directory = `frontend`
- Vérifie que `frontend/package.json` existe
- Regarde les logs de build pour l'erreur exacte

**Erreur: "CORS policy"**
- Vérifie `FRONTEND_ORIGIN` dans Render
- Doit être l'URL Vercel EXACTE (copie-colle depuis Vercel)
- Pas de slash à la fin
- Redéploie le backend après changement

**Page blanche**
- Ouvre console navigateur (F12)
- Vérifie les erreurs JS
- Vérifie que `VITE_API_BASE` est bien set dans Vercel

**API calls fail**
- Vérifie que `VITE_API_BASE` pointe vers `https://shopbrain-backend.onrender.com`
- Vérifie que le backend est bien "Live" sur Render
- Test direct: `curl https://shopbrain-backend.onrender.com/docs`
