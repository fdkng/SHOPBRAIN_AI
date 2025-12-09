# 📧 CONFIGURATION EMAIL SUPABASE - À FAIRE MAINTENANT

## Problème : Les emails ne sont pas envoyés

### ✅ SOLUTION : Active l'envoi d'emails dans Supabase

1. **Va sur Supabase** : https://supabase.com/dashboard/project/jgmsfadayzbgykzajvmw/settings/auth

2. **Section "Email Auth"** :
   - Scroll jusqu'à **"Email Settings"**
   - **IMPORTANT** : Coche ✅ **"Enable email confirmations"**
   - **Rate limits** : Mets au moins 4 emails/hour (ou plus)

3. **Section "Email Templates"** :
   - Vérifie que le template "Confirm signup" existe
   - Clique sur **"Confirm signup"**
   - Vérifie que l'URL de redirection est : `{{ .ConfirmationURL }}`

4. **Section "Auth Providers"** :
   - Clique sur **"Email"** dans la liste
   - **Enable Email provider** doit être activé ✅
   - **Confirm email** doit être coché ✅
   - **Secure email change** peut être coché aussi
   - Clique **"Save"**

5. **Redirect URLs** (important !) :
   - Va dans **Settings → Authentication → URL Configuration**
   - Dans **"Site URL"**, mets : `https://fdkng.github.io/SHOPBRAIN_AI`
   - Dans **"Redirect URLs"**, ajoute :
     - `https://fdkng.github.io/SHOPBRAIN_AI/**`
     - `https://fdkng.github.io/**`
   - Clique **"Save"**

---

## 🧪 TEST APRÈS CONFIGURATION

1. Retourne sur ton site : https://fdkng.github.io/SHOPBRAIN_AI/
2. Clique **"Se connecter"**
3. Remplis le formulaire d'inscription
4. Clique **"Créer mon compte"**
5. **→ Tu dois voir** : "✅ Email de confirmation envoyé !"
6. **→ Vérifie ta boîte email** (spam aussi !)

---

## ⚠️ SI TU NE REÇOIS TOUJOURS PAS D'EMAIL

### Option 1 : Utilise le mode développement
1. Dans Supabase → Auth → Email Templates → "Confirm signup"
2. Change le **"Confirmation URL"** en mode dev pour voir le lien direct :
   ```
   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup
   ```

### Option 2 : Vérifier les logs Supabase
1. Va dans **Logs → Auth logs**
2. Cherche les tentatives d'inscription
3. Regarde s'il y a des erreurs d'envoi d'email

### Option 3 : Configuration SMTP custom (si emails Supabase ne marchent pas)
Si les emails par défaut de Supabase ne fonctionnent pas, tu peux configurer ton propre SMTP :
1. Settings → Authentication → SMTP Settings
2. Active **"Enable Custom SMTP"**
3. Configure avec Gmail, SendGrid, ou Mailgun

---

## 📝 VÉRIFICATION RAPIDE

- [ ] "Enable email confirmations" activé dans Auth settings
- [ ] Email provider activé
- [ ] "Confirm email" coché
- [ ] Site URL configurée : `https://fdkng.github.io/SHOPBRAIN_AI`
- [ ] Redirect URLs ajoutées
- [ ] Template "Confirm signup" existe

**Une fois fait, réessaie de t'inscrire et dis-moi si tu reçois l'email !** 📧
