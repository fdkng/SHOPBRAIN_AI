# ShopBrain AI — Complete Deployment Guide

This guide walks you through deploying the fullstack ShopBrain AI app to production (Vercel + Railway + Supabase).

## Prerequisites

1. **Supabase account** (free tier OK)
2. **Stripe account** (for payments)
3. **OpenAI API key** (GPT-4 access)
4. **GitHub account** (for connecting to Vercel & Railway)
5. **Vercel account** (free tier)
6. **Railway account** (free tier with limited hours)

## Step 1: Setup Supabase

### 1.1 Create Project

1. Go to https://supabase.com
2. Click "New Project"
3. Fill in name, password, region
4. Wait for project to initialize (~2 min)

### 1.2 Run Database Migrations

1. In Supabase dashboard, go to **SQL Editor**
2. Click **New Query**
3. Copy-paste entire contents of `backend/supabase_schema.sql`
4. Click **Run**
5. Verify tables are created (check **Table Editor**)

### 1.3 Enable Auth

1. Go to **Authentication** → **Providers**
2. Ensure **Email** is enabled
3. Go to **URL Configuration**
4. Add your Vercel frontend URL (you'll fill this in after deploying frontend):
   - Redirect URLs: `https://yourfrontend.vercel.app`

### 1.4 Collect Keys

1. Go to **Project Settings** → **API**
2. Copy these to your `.env`:
   - `Project URL` → `SUPABASE_URL`
   - `anon public` key → `VITE_SUPABASE_ANON_KEY` (frontend)
   - `service_role secret` key → `SUPABASE_KEY` (backend)
   - Find **JWT Secret** under **Project Settings** → **Auth** → **JWT Secret** → `SUPABASE_JWT_SECRET`

## Step 2: Setup Stripe

### 2.1 Get API Keys

1. Go to https://dashboard.stripe.com
2. Ensure you're in **Test Mode** (top-left toggle)
3. Go to **Developers** → **API Keys**
4. Copy **Secret Key** → `STRIPE_SECRET_KEY` in `.env`

### 2.2 Create Webhook

1. Go to **Developers** → **Webhooks**
2. Click **Add an endpoint**
3. Endpoint URL: `https://yourbackend.railway.app/webhook` (you'll fill this in after deploying backend)
4. Events to send:
   - `checkout.session.completed`
5. Copy **Signing secret** → `STRIPE_WEBHOOK_SECRET`

## Step 3: Deploy Backend to Railway

### 3.1 Push to GitHub

1. Initialize git repo (if not already):
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```
2. Create GitHub repo and push:
   ```bash
   git remote add origin https://github.com/youruser/shopbrain.git
   git push -u origin main
   ```

### 3.2 Connect to Railway

1. Go to https://railway.app
2. Click **Create New Project**
3. Select **Deploy from GitHub**
4. Connect your GitHub account
5. Select your repo
6. Railway will auto-detect Python
7. Set **Root Directory** to `backend/`

### 3.3 Add Environment Variables

1. In Railway project settings, go to **Variables**
2. Add all variables from `backend/.env`:
   - `OPENAI_API_KEY`
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `SUPABASE_URL`
   - `SUPABASE_KEY`
   - `SUPABASE_JWT_SECRET`
   - `FRONTEND_ORIGIN=https://yourfrontend.vercel.app`
   - `PORT=8000`

### 3.4 Set Start Command

1. In Railway, go to **Settings** → **Deployment**
2. Set **Start Command** to:
   ```
   uvicorn main:app --port $PORT --host 0.0.0.0
   ```
3. Railway auto-deploys on push

### 3.5 Get Backend URL

1. In Railway, click your app
2. Copy the **Public URL** (e.g., `https://backend-prod-xyz.railway.app`)
3. Update `STRIPE_WEBHOOK_SECRET` endpoint URL in Stripe to: `https://backend-prod-xyz.railway.app/webhook`
4. Update frontend `.env` `VITE_API_BASE` to this URL

## Step 4: Deploy Frontend to Vercel

### 4.1 Connect to Vercel

1. Go to https://vercel.com
2. Click **Add New...** → **Project**
3. Import your GitHub repo
4. Select **Next.js** or generic **Other** framework
5. Set **Root Directory** to `frontend/`

### 4.2 Add Environment Variables

1. Before deploying, add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_API_BASE=https://backend-prod-xyz.railway.app`

2. Click **Deploy**

### 4.3 Get Frontend URL

1. Vercel shows your URL (e.g., `https://shopbrain.vercel.app`)
2. Update Supabase Auth **Redirect URLs** with this URL
3. Update backend `.env` `FRONTEND_ORIGIN` to this URL (re-deploy)

## Step 5: Configure Stripe Webhook (Final)

1. Go back to Stripe **Webhooks**
2. Update endpoint URL to: `https://backend-prod-xyz.railway.app/webhook`
3. Test webhook (Stripe sends a test event)

## Step 6: Final Testing

1. Navigate to `https://yourfrontend.vercel.app`
2. Sign up with email
3. Go to **Dashboard** → fill in product name/description → click **Analyze & Optimize**
4. Go to **Plans** → select a plan → proceed to Stripe checkout
5. Use Stripe test card: `4242 4242 4242 4242` (exp: any future date, any CVC)
6. Confirm subscription is created in Supabase `subscriptions` table

## Troubleshooting

### Backend not connecting

- Verify `FRONTEND_ORIGIN` matches frontend URL (no trailing slash)
- Check Railway logs for errors
- Ensure `SUPABASE_JWT_SECRET` is set (required for auth)

### Frontend can't connect to backend

- Check `VITE_API_BASE` env var matches backend URL
- Check CORS is enabled (backend should allow frontend origin)
- Open browser console and check Network tab for requests

### Supabase Auth not working

- Ensure **Redirect URLs** in Supabase Auth include your frontend URL
- Check email confirmation emails are arriving
- Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are correct

### Stripe webhook not firing

- Verify endpoint URL is reachable from Stripe (test with curl)
- Check `STRIPE_WEBHOOK_SECRET` is correctly set
- Inspect webhook delivery logs in Stripe dashboard

## Cost Estimates (Monthly)

- **Supabase:** $0–25 (free tier includes Auth + DB + 50GB storage)
- **Railway:** $0–20 (free tier: 500 hours/month; ~$0.30/hour after)
- **Vercel:** $0 (free tier; unlimited deployments)
- **Stripe:** 2.9% + $0.30 per transaction
- **OpenAI:** $0.01–1 per optimization (depends on usage)

**Total:** ~$50–100/month for moderate usage.

## Next Steps

1. Monitor usage in each platform's dashboard
2. Set up monitoring/alerting (optional)
3. Add custom domain (Vercel + Supabase support CNAME)
4. Consider enabling analytics (optional)

---

For questions, check individual service documentation or the README files in `backend/` and `frontend/`.
