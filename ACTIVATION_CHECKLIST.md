# AUTH SYSTEM ACTIVATION CHECKLIST

## Pre-Activation (Already Done ✅)

- [x] Professional signup/login forms created
- [x] Backend auth routes deployed
- [x] Database schema designed
- [x] Profile API endpoints ready
- [x] Dashboard UI with profile tab
- [x] Navigation system implemented
- [x] Code deployed to production
- [x] Documentation created

## Activation Checklist (YOU DO THIS)

### Step 1: Supabase Configuration

**Location**: Supabase Dashboard → Settings → Authentication

- [ ] Go to https://app.supabase.com
- [ ] Select your project
- [ ] Click **Settings** in left menu
- [ ] Click **Authentication** (under Configuration)
- [ ] Scroll to **Email Settings**
- [ ] Find: "Enable email confirmations"
- [ ] **UNCHECK** this setting (very important!)
- [ ] Click **Save** button
- [ ] Wait 30 seconds for change to apply

**Why**: Removes the requirement for email verification on signup, allowing instant account creation.

---

### Step 2: Database Schema Setup

**Location**: Supabase Dashboard → SQL Editor

- [ ] Go to https://app.supabase.com
- [ ] Select your project
- [ ] Click **SQL Editor** in left menu
- [ ] Click **New Query** button
- [ ] Copy-paste the entire file:
  ```
  📂 backend/supabase_user_profiles.sql
  ```
- [ ] Click **Run** button (or Cmd+Enter)
- [ ] Wait for success message (should take ~5 seconds)

**Verify Creation** - Run this query:
```sql
SELECT tablename FROM pg_tables 
WHERE tablename IN ('user_profiles', 'user_sessions');
```

Results should show:
- ✓ user_profiles
- ✓ user_sessions

---

### Step 3: Live Signup Test

**Location**: https://fdkng.github.io/SHOPBRAIN_AI/

**Test Data**:
```
Prénom:              Jean
Nom:                 Test
Nom d'utilisateur:   jeantest123
Email:               jean.test@example.com
Mot de passe:        TestPassword123 (6+ chars required)
```

**Actions**:
- [ ] Click **"Se connecter"** button (top-right)
- [ ] Click **"Créer mon compte"** tab
- [ ] Fill in all fields above
- [ ] Click **"Créer mon compte"** button
- [ ] Wait 2-3 seconds for processing

**Verification Checklist**:
- [ ] Page doesn't show error message
- [ ] Header shows **"Connecté"** (green badge)
- [ ] Header displays user's name: "Jean Test"
- [ ] Header displays username: "@jeantest123"
- [ ] **"👤 Mon Profil"** tab appears in navigation
- [ ] Products tab shows "Connect Shopify" option
- [ ] Can click **"Déconnexion"** button

---

### Step 4: Database Verification

**Location**: Supabase Dashboard → SQL Editor

- [ ] Go to **SQL Editor**
- [ ] Click **New Query**
- [ ] Paste:
  ```sql
  SELECT id, email, first_name, last_name, username, 
         subscription_plan, subscription_status, created_at 
  FROM user_profiles 
  ORDER BY created_at DESC 
  LIMIT 1;
  ```
- [ ] Click **Run**
- [ ] Verify results show your test account

**Expected Results**:
| Column | Expected Value |
|--------|-----------------|
| email | jean.test@example.com |
| first_name | Jean |
| last_name | Test |
| username | jeantest123 |
| subscription_plan | free |
| subscription_status | inactive |

---

## Post-Activation Verification

### Dashboard Profile Tab Test

- [ ] Click **"👤 Mon Profil"** tab in Dashboard
- [ ] Verify profile card shows:
  - [ ] User avatar (first letter in circle)
  - [ ] Full name: "Jean Test"
  - [ ] Username: @jeantest123
  - [ ] Email: jean.test@example.com
  - [ ] Plan: free
  - [ ] Status: inactive
  - [ ] Created date: today's date

### Logout/Login Test

- [ ] Click **"Déconnexion"** button
- [ ] Verify redirects to landing page
- [ ] Click **"Se connecter"** button
- [ ] Click **"Se connecter"** tab (login form)
- [ ] Enter:
  - Email: jean.test@example.com
  - Password: TestPassword123
- [ ] Click **"Se connecter"** button
- [ ] Verify dashboard loads again with profile data

---

## Troubleshooting

### Issue: Signup form says "Email already exists"
**Solution**: Use a different email address (you already created an account with that email)

### Issue: After signup, dashboard is blank
**Solution**: 
1. Refresh page (F5)
2. Check if user_profiles table exists (Step 4)
3. Verify SQL schema executed successfully

### Issue: Profile tab doesn't show account info
**Solution**:
1. Close browser completely
2. Clear browser cache
3. Open site in incognito/private window
4. Try signing up again

### Issue: Can't create account, says "Email confirmation required"
**Solution**: Email confirmation wasn't disabled in Step 1
1. Go back to Step 1
2. **UNCHECK** "Enable email confirmations"
3. Wait 30 seconds
4. Try signup again

### Issue: Username validation fails
**Valid Username Format**:
- ✓ jeantest123 (letters + numbers)
- ✓ jean_test (underscore allowed)
- ✓ jean-test (hyphen allowed)
- ❌ jean test (spaces not allowed)
- ❌ jean@test (special chars not allowed)
- ❌ jt (too short, need 3+ chars)

---

## Success Indicators

After completing all 4 steps, you should have:

- ✅ Professional signup working
- ✅ Instant account creation (no email confirmation)
- ✅ Real persistent accounts in database
- ✅ Profile tab showing account information
- ✅ Unique username enforcement
- ✅ Login/logout working
- ✅ Profile survives logout/login cycle
- ✅ Professional header with user info

---

## What's Next

Once signup is verified working:

**Phase 2**: Shopify OAuth Integration
- Connect Shopify store
- Load products
- AI product analysis

**Phase 3**: Stripe Webhook Integration
- Subscribe to plans
- Update subscription status
- Track expiration

**Phase 4**: Profile Editing (Optional)
- Update profile info
- Upload avatar
- Delete account

---

## Support

If you encounter issues:

1. Check **Troubleshooting** section above
2. Verify all 4 steps completed in order
3. Check your Supabase project name and region
4. Verify backend is running: https://shopbrain-backend.onrender.com/docs
5. Check browser console for error messages (F12 → Console tab)

---

## Files for Reference

- **Quick Start**: QUICK_START.md
- **Full Docs**: AUTH_SYSTEM_COMPLETE.md
- **Dashboard Code**: frontend/src/Dashboard.jsx
- **Backend Routes**: backend/main.py
- **Database Schema**: backend/supabase_user_profiles.sql

---

**Estimated Time**: 10-15 minutes to complete all 4 steps

**Status**: Ready to activate! ✨

---

Date Started: [Your date here]
Date Completed: [Mark when done]
Verified By: [Your name]
