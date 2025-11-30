# ShopBrain AI - Deployment Checklist

## Pre-Deployment
- [ ] GitHub repo created: https://github.com/fdkng/SHOPBRAIN_AI
- [ ] Supabase project created
- [ ] Stripe account created (test mode enabled)
- [ ] Environment variables set in `backend/.env`
- [ ] Run `python3 automate_deployment.py` ✓

## Backend Deployment (Render)
- [ ] Create Render account: https://render.com
- [ ] Create Web Service from GitHub
- [ ] Set repository: fdkng/SHOPBRAIN_AI
- [ ] Set root directory: `backend`
- [ ] Set build command: `pip install -r requirements.txt`
- [ ] Set start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- [ ] Add environment variables:
  - [ ] OPENAI_API_KEY
  - [ ] STRIPE_SECRET_KEY
  - [ ] SUPABASE_URL
  - [ ] SUPABASE_KEY
  - [ ] SUPABASE_JWT_SECRET
  - [ ] FRONTEND_ORIGIN (http://localhost:5173 for now)
- [ ] Deploy service
- [ ] Wait for build to complete
- [ ] Note public URL: `https://shopbrain-backend-xxxxx.onrender.com`
- [ ] Test `/docs` endpoint

## Database Setup (Supabase)
- [ ] Go to https://supabase.com/dashboard/projects
- [ ] Select your project
- [ ] SQL Editor → New Query
- [ ] Copy and paste `backend/supabase_schema.sql`
- [ ] Click Run
- [ ] Verify tables created:
  - [ ] `products` table exists
  - [ ] `subscriptions` table exists
  - [ ] RLS policies enabled

## Stripe Configuration
- [ ] Create Stripe webhook endpoint: https://dashboard.stripe.com/developers/webhooks
- [ ] Endpoint URL: `https://<your-render-url>/webhook`
- [ ] Subscribe to events:
  - [ ] checkout.session.completed
  - [ ] customer.subscription.updated
- [ ] Copy Signing Secret
- [ ] Add to Render as `STRIPE_WEBHOOK_SECRET`
- [ ] Render redeploys automatically

## Frontend Deployment (Vercel)
- [ ] Update `frontend/.env`:
  - [ ] VITE_API_BASE=`https://<your-render-url>`
- [ ] Build frontend: `cd frontend && npm run build`
- [ ] Deploy to Vercel:
  - [ ] Option A: `npx vercel`
  - [ ] Option B: Connect GitHub → Auto-deploy
- [ ] Note public URL: `https://shopbrain-ai-xxxxx.vercel.app`
- [ ] Update Render `FRONTEND_ORIGIN` to frontend URL

## Testing
- [ ] Visit frontend URL
- [ ] Sign up with Supabase auth
- [ ] Backend /products endpoint returns data
- [ ] Test Stripe checkout (14-day trial)
- [ ] Check Supabase for subscription records
- [ ] Verify Stripe webhook delivery successful

## Post-Deployment
- [ ] Monitor Render logs for errors
- [ ] Monitor Stripe webhook deliveries
- [ ] Check Supabase for data
- [ ] Set up uptime monitoring
- [ ] Configure backups
- [ ] Document setup in team wiki

## Production Prep (Later)
- [ ] Switch from Stripe test keys to production keys
- [ ] Set up custom domain on Vercel
- [ ] Configure email notifications
- [ ] Set up error tracking (Sentry)
- [ ] Enable auto-scaling on Render
- [ ] Configure CDN for static assets

---

## Useful Commands

### Check Backend Status
```bash
curl https://<render-url>/docs
curl https://<render-url>/products \
  -H "Authorization: Bearer <jwt-token>"
```

### View Logs
- Render: https://dashboard.render.com → Your service → Logs
- Supabase: https://supabase.com/dashboard → Logs
- Vercel: https://vercel.com/dashboard → Your project → Logs

### Redeploy
- Render: Push to main or manual redeploy
- Vercel: Push to main or manual redeploy
- Supabase: N/A (database only)

### Debugging
- Check Render build logs for deployment errors
- Check Stripe webhook delivery logs
- Check browser console for frontend errors
- Check Supabase SQL query logs
