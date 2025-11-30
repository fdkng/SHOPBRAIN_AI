# 🎯 Implementation Checklist

Use this checklist to go from project files to live production app.

## Phase 1: Setup & Configuration

- [ ] **Read** `PROJECT_SUMMARY.md` for overview
- [ ] **Get missing credentials:**
  - [ ] OpenAI API key (https://platform.openai.com/api-keys)
  - [ ] Stripe Webhook Secret (create webhook endpoint first)
  - [ ] Supabase JWT Secret (Supabase → Project Settings → Auth)
- [ ] **Update `backend/.env`:**
  ```bash
  cp backend/.env.example backend/.env
  # Edit backend/.env and add:
  # - OPENAI_API_KEY
  # - STRIPE_SECRET_KEY (get from Stripe dashboard)
  # - STRIPE_WEBHOOK_SECRET
  # - SUPABASE_JWT_SECRET
  ```

## Phase 2: Local Testing

- [ ] **Follow QUICKSTART.md** (5 minutes)
  - [ ] Install backend deps (`pip install -r requirements.txt`)
  - [ ] Start backend (`uvicorn main:app --reload`)
  - [ ] Install frontend deps (`npm install`)
  - [ ] Start frontend (`npm run dev`)
- [ ] **Test local flow:**
  - [ ] Open http://localhost:5173
  - [ ] Sign up with test email
  - [ ] Enter product name + description
  - [ ] Click "Analyser & Optimiser" (will fail without OPENAI_API_KEY, that's OK)
  - [ ] View pricing page (Stripe test cards work in test mode)

## Phase 3: Supabase Setup

- [ ] **Create Supabase project** (if not done)
  - [ ] Go to https://supabase.com
  - [ ] Create project
- [ ] **Run database migrations:**
  - [ ] Open Supabase SQL editor
  - [ ] Copy-paste `backend/supabase_schema.sql`
  - [ ] Execute
- [ ] **Enable Auth:**
  - [ ] Go to Authentication → Providers
  - [ ] Ensure Email is enabled
  - [ ] Go to URL Configuration
  - [ ] Note: You'll update redirect URLs after deploying frontend
- [ ] **Verify in Supabase dashboard:**
  - [ ] `products` table exists
  - [ ] `subscriptions` table exists
  - [ ] RLS policies are active

## Phase 4: Stripe Setup

- [ ] **Stripe Dashboard:**
  - [ ] Ensure you have 3 price IDs (you already do - see CREDENTIALS.md)
  - [ ] Test mode is enabled (top-left toggle)
- [ ] **Create Webhook Endpoint (after deploying backend):**
  - [ ] Go to Developers → Webhooks
  - [ ] Click "Add an endpoint"
  - [ ] URL: `https://yourbackend.railway.app/webhook`
  - [ ] Events: `checkout.session.completed`
  - [ ] Copy webhook secret → `STRIPE_WEBHOOK_SECRET`

## Phase 5: Deploy Backend (Railway)

- [ ] **Create Railway Project:**
  - [ ] Go to https://railway.app
  - [ ] Create new project
  - [ ] Connect GitHub repo
  - [ ] Select your repo
- [ ] **Configure Deployment:**
  - [ ] Set Root Directory: `backend/`
  - [ ] Set Start Command: `uvicorn main:app --port $PORT --host 0.0.0.0`
- [ ] **Add Environment Variables:**
  - [ ] All variables from `backend/.env`:
    - `OPENAI_API_KEY`
    - `STRIPE_SECRET_KEY`
    - `STRIPE_WEBHOOK_SECRET`
    - `SUPABASE_URL`
    - `SUPABASE_KEY`
    - `SUPABASE_JWT_SECRET`
    - `FRONTEND_ORIGIN=https://yourfrontend.vercel.app` (update after frontend deploy)
    - `PORT=8000`
- [ ] **Deploy:**
  - [ ] Click Deploy
  - [ ] Wait ~2-3 minutes
  - [ ] Copy your backend URL (e.g., `https://backend-prod-xyz.railway.app`)
- [ ] **Update Stripe Webhook:**
  - [ ] Go to Stripe Webhooks
  - [ ] Update endpoint URL to your Railway backend URL
  - [ ] Test event delivery

## Phase 6: Deploy Frontend (Vercel)

- [ ] **Connect to Vercel:**
  - [ ] Go to https://vercel.com
  - [ ] Click "Add New..." → "Project"
  - [ ] Import your GitHub repo
  - [ ] Select `frontend/` as root directory
- [ ] **Add Environment Variables:**
  - [ ] `VITE_SUPABASE_URL` (from Supabase)
  - [ ] `VITE_SUPABASE_ANON_KEY` (from Supabase)
  - [ ] `VITE_API_BASE=https://yourbackend.railway.app` (from Railway)
- [ ] **Deploy:**
  - [ ] Click Deploy
  - [ ] Wait ~1-2 minutes
  - [ ] Copy your frontend URL (e.g., `https://shopbrain.vercel.app`)

## Phase 7: Final Configuration

- [ ] **Update Supabase Auth:**
  - [ ] Go to Supabase → Authentication → URL Configuration
  - [ ] Add Redirect URL: `https://yourfrontend.vercel.app`
- [ ] **Update Railway Backend:**
  - [ ] Re-deploy with updated `FRONTEND_ORIGIN=https://yourfrontend.vercel.app`
- [ ] **Update Stripe Webhook:**
  - [ ] Verify endpoint URL matches your backend

## Phase 8: Production Testing

- [ ] **Visit your frontend URL**
- [ ] **Test complete flow:**
  - [ ] Sign up with real email
  - [ ] Confirm email (check inbox)
  - [ ] Log in
  - [ ] Add product name + description
  - [ ] Click "Analyser & Optimiser"
  - [ ] See GPT-4 result (or error if API key not set)
  - [ ] Check Supabase: verify product saved in `products` table
- [ ] **Test Stripe Checkout:**
  - [ ] Go to Pricing
  - [ ] Click "Start Free Trial"
  - [ ] Use test card: `4242 4242 4242 4242`
  - [ ] Complete checkout
  - [ ] Check Supabase `subscriptions` table
  - [ ] Verify webhook event in Stripe dashboard
- [ ] **Test History:**
  - [ ] Add multiple products
  - [ ] Refresh page
  - [ ] History persists (server-side)
- [ ] **Monitor Logs:**
  - [ ] Railway: check backend logs for errors
  - [ ] Vercel: check frontend logs
  - [ ] Supabase: check real-time database changes

## Phase 9: Monitoring & Optimization

- [ ] **Set up alerts (optional):**
  - [ ] Railway: Budget alerts
  - [ ] Vercel: Performance monitoring
  - [ ] Stripe: Payment failure alerts
- [ ] **Database backup:**
  - [ ] Supabase: enable automated backups
- [ ] **SSL/TLS:**
  - [ ] Verify HTTPS on all endpoints (auto with Vercel + Railway)
- [ ] **Custom domain (optional):**
  - [ ] Add domain in Vercel settings
  - [ ] Update Supabase Auth redirect URLs

## Phase 10: Go Live!

- [ ] **Announce**
- [ ] **Monitor first 48 hours**
- [ ] **Be ready to scale:**
  - [ ] Railway: upgrade from free to paid plan if needed
  - [ ] Supabase: monitor storage/connections
  - [ ] OpenAI: set usage limits to prevent bill shock

---

## Rollback Plan

If something goes wrong:

1. **Frontend:** Vercel lets you roll back to previous deployment (Settings → Deployments)
2. **Backend:** Revert code push to git; Railway auto-redeploys
3. **Database:** Supabase backups (enable in Project Settings)
4. **Stripe:** Test mode means no real charges during testing

---

## Estimated Time

- **Local setup:** 5 min
- **Supabase setup:** 10 min
- **Stripe setup:** 5 min
- **Backend deployment:** 10 min
- **Frontend deployment:** 10 min
- **Configuration:** 10 min
- **Testing:** 15 min

**Total:** ~1 hour from scratch to production

---

## Support

- 🆘 **Backend issues?** → See `backend/README.md` + `DEPLOYMENT.md` troubleshooting
- 🆘 **Frontend issues?** → See `frontend/README.md` + browser console
- 🆘 **Deployment issues?** → See `DEPLOYMENT.md` (comprehensive guide)
- 🆘 **Database issues?** → Check Supabase SQL editor + RLS policies

---

**Good luck! 🚀**
