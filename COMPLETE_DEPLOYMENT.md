# ShopBrain AI - Complete Deployment Guide

This guide walks you through deploying ShopBrain AI to production using Render (backend), Vercel (frontend), Supabase (database), and Stripe (payments).

## Quick Overview

| Component | Platform | Status |
|-----------|----------|--------|
| **Backend (FastAPI)** | Render | Ready to deploy |
| **Frontend (React)** | Vercel | Ready to deploy |
| **Database (PostgreSQL)** | Supabase | Ready to migrate |
| **Payments** | Stripe | Ready to configure |

## Prerequisites

✅ GitHub account with repo: https://github.com/fdkng/SHOPBRAIN_AI
✅ Environment variables configured in `backend/.env`
✅ Supabase project created
✅ Stripe account (test mode)

## Phase 1: Verify Your Setup

Run the automated verification script to ensure everything is ready:

```bash
python3 automate_deployment.py
```

This will:
- ✓ Verify all required files exist
- ✓ Validate environment variables
- ✓ Check Git repository
- ✓ Display database migration SQL
- ✓ Show deployment checklist

## Phase 2: Deploy Backend to Render

### Step 1: Create Render Web Service

1. Go to https://dashboard.render.com
2. Click **+ New** → **Web Service**
3. Select GitHub repository: **fdkng/SHOPBRAIN_AI**
4. Authorize if prompted

### Step 2: Configure Service

Fill in the following:

| Field | Value |
|-------|-------|
| **Name** | `shopbrain-backend` |
| **Environment** | Python 3 |
| **Region** | Choose closest to your users |
| **Branch** | `main` |
| **Root Directory** | `backend` |
| **Build Command** | `pip install -r requirements.txt` |
| **Start Command** | `uvicorn main:app --host 0.0.0.0 --port $PORT` |

### Step 3: Add Environment Variables

In Render service settings → **Environment**, add:

```
OPENAI_API_KEY=sk-proj-...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_... (add after webhook setup)
SUPABASE_URL=https://jgmsfadayzbgykzajvmw.supabase.co
SUPABASE_KEY=eyJhbGciOi...
SUPABASE_JWT_SECRET=N1Sqeh8Ht...
FRONTEND_ORIGIN=http://localhost:5173 (update after frontend deployment)
```

### Step 4: Deploy

Click **Create Web Service**. Render will:
1. Build your backend (5-10 minutes)
2. Start your service
3. Assign a public URL

**Note the public URL** - you'll need it for frontend configuration.

### Step 5: Verify Backend

Once live, verify endpoints:

```bash
# Get a Supabase JWT token from your dashboard first, then:
curl https://<your-render-url>/products \
  -H "Authorization: Bearer <supabase-jwt-token>"
```

Expected response: `{"products": []}`

## Phase 3: Apply Database Migrations

### Step 1: Access Supabase SQL Editor

1. Go to https://supabase.com/dashboard/projects
2. Select your project
3. **SQL Editor** → **New Query**

### Step 2: Apply Schema

Copy the contents of `backend/supabase_schema.sql` and paste into Supabase SQL editor:

```sql
-- This creates:
-- - products table (user product optimizations)
-- - subscriptions table (Stripe subscription tracking)
-- - Row-level security policies
```

Click **Run** to apply.

### Step 3: Verify

In **Table Editor**, you should see:
- ✓ `public.products` table
- ✓ `public.subscriptions` table
- ✓ RLS policies enabled

## Phase 4: Configure Stripe Webhook

### Step 1: Create Webhook Endpoint

1. Go to https://dashboard.stripe.com/developers/webhooks
2. Click **+ Add endpoint**
3. **Endpoint URL**: `https://<your-render-url>/webhook`
4. **Events to send**:
   - `checkout.session.completed`
   - `customer.subscription.updated`
5. Click **Add endpoint**

### Step 2: Copy Signing Secret

1. Click the webhook endpoint you just created
2. Copy the **Signing Secret** (starts with `whsec_`)
3. Add to Render environment as `STRIPE_WEBHOOK_SECRET`
4. Render will automatically redeploy

### Step 3: Verify

In Stripe dashboard, you should see **Signing Secret** displayed.

## Phase 5: Deploy Frontend to Vercel

### Step 1: Update Frontend Environment

Edit `frontend/.env`:

```env
VITE_SUPABASE_URL=https://jgmsfadayzbgykzajvmw.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
VITE_API_BASE=https://<your-render-url>
```

### Step 2: Build Frontend

```bash
cd frontend
npm install
npm run build
```

### Step 3: Deploy to Vercel

**Option A: Using Vercel CLI**
```bash
npx vercel
```

**Option B: Using Vercel GitHub Integration**
1. Go to https://vercel.com/dashboard
2. Import GitHub project: `fdkng/SHOPBRAIN_AI`
3. Set root directory: `frontend`
4. Add environment variables from `frontend/.env`
5. Deploy

**Note the frontend URL** - you'll need it to update Render.

### Step 4: Update Render FRONTEND_ORIGIN

1. Go back to Render dashboard
2. Select `shopbrain-backend` service
3. **Environment** → Update `FRONTEND_ORIGIN` to your Vercel URL
4. Render will redeploy automatically

## Phase 6: Smoke Tests

### Test 1: Backend Health

```bash
curl https://<render-url>/docs
```

Should show FastAPI Swagger UI.

### Test 2: Full User Flow

1. Visit your frontend URL
2. **Sign Up** with Supabase auth
3. After login, test `/optimize` endpoint (if available in UI)
4. Try Stripe checkout → should see 14-day trial
5. Check Supabase dashboard for new records in `subscriptions` table

### Test 3: Stripe Webhook

1. In Stripe dashboard, go to **Developers** → **Webhooks**
2. Click your webhook endpoint
3. Check **Events** tab for recent deliveries
4. Should see `checkout.session.completed` events

### Test 4: Database Records

1. Go to Supabase dashboard
2. **Table Editor** → `subscriptions` table
3. Should see records for your test purchase

## Post-Deployment

### Monitoring

- **Render Logs**: https://dashboard.render.com → Your service → Logs
- **Supabase Logs**: https://supabase.com/dashboard → Logs
- **Stripe Webhooks**: https://dashboard.stripe.com/developers/webhooks
- **Vercel Logs**: https://vercel.com/dashboard → Your project → Logs

### Updating Your App

To push new changes:

```bash
# Make changes locally
git add .
git commit -m "Your message"
git push origin main

# Render and Vercel will automatically redeploy
```

### Common Issues

**Backend returns 401 Unauthorized**
- Check that your Supabase JWT token is valid
- Verify `SUPABASE_JWT_SECRET` is set in Render

**Stripe webhook not working**
- Verify webhook endpoint URL in Stripe dashboard
- Check `STRIPE_WEBHOOK_SECRET` is set in Render
- View webhook delivery logs in Stripe dashboard

**Frontend can't connect to backend**
- Verify `VITE_API_BASE` points to correct Render URL
- Check CORS is enabled in backend (should be)
- Check browser console for errors

**Database migrations failed**
- Verify SQL was executed in Supabase SQL editor
- Check for syntax errors in SQL
- Verify tables exist in Table Editor

## Support Links

- **Render Docs**: https://render.com/docs
- **Supabase Docs**: https://supabase.com/docs
- **Stripe Docs**: https://stripe.com/docs
- **Vercel Docs**: https://vercel.com/docs
- **FastAPI Docs**: https://fastapi.tiangolo.com

## Next Steps

Once deployed and tested:

1. ✅ Set up production Stripe keys (not test keys)
2. ✅ Configure custom domain on Vercel
3. ✅ Set up monitoring/alerts
4. ✅ Configure backups for Supabase
5. ✅ Set up CI/CD for automated testing
6. ✅ Monitor costs on Render and Vercel

---

**You're all set! Your ShopBrain AI app is now live in production.** 🚀
