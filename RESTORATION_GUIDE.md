# 🚨 GUIDE DE RESTAURATION RAPIDE

## ⚡ En cas de problème (< 2 minutes pour restaurer)

### Étape 1: Voir l'état actuel
```bash
git log --oneline -3
git status
```

### Étape 2: Restaurer rapidement

**OPTION A - Utiliser la branche de backup (PLUS SÛR)**
```bash
git checkout backup-complete-7ab68b2
git push -f origin main
```

**OPTION B - Reset au dernier bon commit (7ab68b2)**
```bash
git reset --hard 7ab68b2
git push -f origin main
```

**OPTION C - Copier les fichiers manuellement**
```bash
# Frontend
cp -r BACKUP_COMPLET/frontend/src frontend/
cp BACKUP_COMPLET/frontend/package.json frontend/
cp BACKUP_COMPLET/frontend/vite.config.js frontend/

# Backend
cp BACKUP_COMPLET/backend/*.py backend/
cp BACKUP_COMPLET/backend/*.sql backend/

# AI Engine
cp -r BACKUP_COMPLET/AI_engine/*.py AI_engine/

# Config
cp BACKUP_COMPLET/deploy.yml .github/workflows/

# Puis commit
git add .
git commit -m "♻️ Restauré depuis backup"
git push
```

---

## 🔍 Vérifier que tout marche après restauration

### 1. Vérifier le déploiement
```bash
# Aller sur GitHub Actions
https://github.com/fdkng/SHOPBRAIN_AI/actions

# Attendre le ✅ build success
```

### 2. Vérifier le site
```bash
# Hard refresh le frontend
https://fdkng.github.io/SHOPBRAIN_AI
# Cmd+Shift+R (Mac) ou Ctrl+Shift+R (Windows)

# Vérifier le backend
curl https://shopbrain-backend.onrender.com/health
# Devrait retourner: {"status": "ok", "version": ...}
```

### 3. Tester les fonctionnalités
- ✅ Landing page charge
- ✅ Boutons pricing cliquables
- ✅ Formulaire inscription visible
- ✅ Bouton login fonctionnel
- ✅ Pas de page blanche
- ✅ Console pas d'erreurs (F12)

---

## 🛑 Problèmes courants et solutions

### Problème: "Build failed on GitHub Actions"
```bash
# Solution 1: Vérifier si c'est une erreur npm
git reset --hard 7ab68b2
git push -f origin main

# Solution 2: Si npm install hang, retirer le cache
# (Le workflow deploy.yml a déjà cette correction)

# Solution 3: Attendre 10 min et retrier
# (GitHub runners parfois surchargés)
```

### Problème: "Page blanche ou vide"
```bash
# Vérifier la console (F12)
# Si erreur JavaScript, restaurer depuis backup

git checkout backup-complete-7ab68b2
git push -f origin main
```

### Problème: "CORS error ou API timeout"
```bash
# 1. Vérifier que backend sur Render redémarrage
https://dashboard.render.com/services

# 2. Si backend down, redéployer
git push -f origin main
# Cela retrigger un redeploy automatique de Render
```

### Problème: "Supabase connection error"
```bash
# Vérifier les clés Supabase dans frontend/src/main.jsx
# Les clés doivent être:
VITE_SUPABASE_URL: https://jgmsfadayzbgykzajvmw.supabase.co
VITE_SUPABASE_ANON_KEY: eyJhbGciOi...

# Si faux, restaurer depuis backup qui a les bonnes clés
git checkout backup-complete-7ab68b2
git push -f origin main
```

---

## 📊 Checklist de santé du site

- [ ] Frontend build ✅ (GitHub Actions)
- [ ] Frontend déployé ✅ (GitHub Pages)
- [ ] Frontend charge sans erreur ✅ (https://fdkng.github.io/SHOPBRAIN_AI)
- [ ] Backend run ✅ (Render)
- [ ] Backend répond ✅ (curl /health)
- [ ] Supabase connecté ✅ (pas de connection errors)
- [ ] Stripe configuré ✅ (paiement visible)
- [ ] AI Engine charge ✅ (pas d'import errors)

---

## 🚀 Actions après restauration

1. ✅ Vérifier le build GitHub Actions
2. ✅ Hard refresh le frontend (Cmd+Shift+R)
3. ✅ Tester les fonctionnalités
4. ✅ Vérifier la console (F12)
5. ✅ Tester login/signup
6. ✅ Tester les pricing plans
7. ✅ Vérifier le backend /health

---

## 📞 Besoin d'aide?

Si le site ne marche pas après restauration:

1. **Vérifier les logs:**
   ```bash
   git log --oneline -10
   git diff HEAD~2 HEAD  # Voir les derniers changements
   ```

2. **Vérifier GitHub Actions:**
   ```
   https://github.com/fdkng/SHOPBRAIN_AI/actions
   ```

3. **Vérifier Render backend:**
   ```
   https://dashboard.render.com/services
   ```

4. **Vérifier Supabase:**
   ```
   https://app.supabase.com
   ```

5. **En dernier recours:**
   ```bash
   git reset --hard backup-complete-7ab68b2
   git push -f origin main
   # Puis attendre 5 minutes
   ```

---

**Créé:** 15 décembre 2025  
**Version:** 1.0  
**État:** ✅ Production-Ready
