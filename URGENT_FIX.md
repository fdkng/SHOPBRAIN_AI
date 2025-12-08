# 🚨 URGENT - Fix Render Root Directory Issue

## Problème
```
Service Root Directory "/opt/render/project/src/Users/louis-felixgilbert/Library/CloudStorage/OneDrive-Personnel/Bureau/shopBrain_AI/backend" is missing.
```

**Cause:** Root Directory est défini comme `backend` au lieu d'être vide

## Solution Immédiate (2 minutes)

### Étape 1: Aller à Render Dashboard
URL: https://dashboard.render.com

### Étape 2: Sélectionner `shopbrain-backend`

### Étape 3: Settings → Onglet "Settings"

Chercher ces 3 champs:

```
┌─────────────────────────────────────────┐
│ Name: shopbrain-backend                 │
│ Root Directory: [backend]  ← CHANGER À  │
│                            ← [VIDE]     │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Build Command:                          │
│ [pip install -r backend/requirements.txt]
│ (correct, ne pas toucher)               │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Start Command:                          │
│ [uvicorn main:app --app-dir backend ... ]
│ (correct, ne pas toucher)               │
└─────────────────────────────────────────┘
```

### **IMPORTANT: Root Directory**
- ❌ ACTUEL: `backend`
- ✅ CORRECT: (laisser VIDE ou supprimer la valeur)

### Étape 4: Cliquer "Save"

### Étape 5: Aller à "Deployments"

### Étape 6: Cliquer "Manual Deploy" → "Deploy latest commit"

Attendre les logs...

## Résultat Attendu

Build logs devraient montrer:
```
==> Installing dependencies...
Running 'pip install -r backend/requirements.txt'...
Successfully installed [8 packages]

==> Building...
Building complete ✓

==> Starting service...
Running 'uvicorn main:app --app-dir backend --host 0.0.0.0 --port 8080'...
INFO:     Uvicorn running on http://0.0.0.0:8080

==> Build successful 🎉
```

## Si encore ça échoue:

1. Copy-paste les 20 dernières lignes des logs
2. Envoie-moi

**La solution devrait fonctionner en moins de 5 minutes.**
