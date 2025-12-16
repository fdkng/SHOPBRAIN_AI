# ⚡ QUICK REFERENCE - SHOPBRAIN AI

## 🎯 Trois façons de restaurer rapidement

### 1️⃣ Le plus facile (1 commande)
```bash
./restore-backup.sh
```
✅ Automatique  
✅ Demande confirmation  
✅ Force push automatique  

---

### 2️⃣ Rapide (2 commandes)
```bash
git checkout backup-complete-7ab68b2
git push -f origin main
```
✅ Utilise la branche de backup  
✅ Instant  

---

### 3️⃣ Manuel (copier les fichiers)
```bash
cp -r BACKUP_COMPLET/{frontend,backend,AI_engine} .
cp BACKUP_COMPLET/deploy.yml .github/workflows/
git add .
git commit -m "Restauré depuis backup"
git push -f origin main
```
✅ Plus de contrôle  
✅ Vérifie tout  

---

## 🔗 URLs principales

| Service | URL |
|---------|-----|
| **Site Frontend** | https://fdkng.github.io/SHOPBRAIN_AI |
| **Backend API** | https://shopbrain-backend.onrender.com |
| **Supabase** | https://app.supabase.com/projects |
| **GitHub Repo** | https://github.com/fdkng/SHOPBRAIN_AI |
| **GitHub Actions** | https://github.com/fdkng/SHOPBRAIN_AI/actions |
| **Render Backend** | https://dashboard.render.com |
| **Stripe Dashboard** | https://dashboard.stripe.com |

---

## ✅ Checklist après restauration

- [ ] Restore script run OU git commands executed
- [ ] GitHub Actions build passed (✅ green)
- [ ] Frontend URL loads without error
- [ ] Hard refresh done (Cmd+Shift+R)
- [ ] No white page or blank screen
- [ ] Console F12 has no errors
- [ ] Pricing plans visible ($99, $199, $299)
- [ ] Login/signup buttons work
- [ ] Backend /health responding
- [ ] Site fully functional

---

## 🐛 Problèmes rapides et fixes

| Problème | Solution |
|----------|----------|
| **Build fails** | `git reset --hard 7ab68b2 && git push -f` |
| **White page** | Hard refresh (Cmd+Shift+R) |
| **Console errors** | Check `.env` vars or restore backup |
| **API timeout** | Restart Render backend or `git push -f` |
| **CORS errors** | Ensure GitHub Pages in backend CORS |
| **Payment link fails** | Check Stripe keys in `.env` |
| **Can't login** | Verify Supabase connection |

---

## 📞 Emergency contacts

| Issue | Contact | URL |
|-------|---------|-----|
| Frontend build error | GitHub Actions | https://github.com/fdkng/SHOPBRAIN_AI/actions |
| Backend down | Render support | https://dashboard.render.com |
| Database issue | Supabase support | https://app.supabase.com/support |
| Stripe payment error | Stripe support | https://support.stripe.com |

---

## 🚀 Deploy process after fix

1. Make changes locally
2. Commit: `git commit -m "description"`
3. Push: `git push origin main`
4. Wait 2-3 min for build
5. Hard refresh frontend
6. Test functionality

---

## 🔒 Important files protected

```
⚠️ Don't delete:
- .env (contains API keys)
- backend/main.py (API logic)
- frontend/src/App.jsx (UI)
- AI_engine/ (all files)

✅ Safe to modify:
- frontend/src/index.css (styling)
- Comments in code
- Configuration files

🔄 Restore if broken:
./restore-backup.sh
```

---

## 📋 Status check commands

```bash
# Check git status
git log --oneline -5

# Check frontend build
https://github.com/fdkng/SHOPBRAIN_AI/actions

# Check backend running
curl https://shopbrain-backend.onrender.com/health

# Check site deployed
curl https://fdkng.github.io/SHOPBRAIN_AI

# Check backup exists
git branch -a | grep backup
```

---

## 💾 Backup location

```
Local: /BACKUP_COMPLET/
GitHub branch: backup-complete-7ab68b2
GitHub code: Commit 7ab68b2
```

---

## 🎉 Success indicators

✅ **Frontend works when:**
- Site loads at https://fdkng.github.io/SHOPBRAIN_AI
- No JavaScript errors in console (F12)
- Pricing plans visible
- Buttons clickable
- Forms responsive

✅ **Backend works when:**
- GET /health returns: `{"status": "ok"}`
- POST endpoints accept requests
- Stripe payment links create successfully
- Database queries return data

✅ **Overall works when:**
- User can signup/login
- User can select pricing plan
- User sees dashboard after login
- All pages load within 2 seconds

---

**Created:** 15 décembre 2025  
**Backup commit:** 7ab68b2  
**Status:** ✅ Production Ready  
**Last updated:** 3:45 AM
