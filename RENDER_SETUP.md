# Render Deployment Setup Instructions

## Step 1: Access Your Render Service
1. Go to https://dashboard.render.com
2. Click on your "shopbrain-backend" Web Service (or create a new one if it doesn't exist)

## Step 2: Check & Fix Configuration
In the service settings, verify:
- **Name**: shopbrain-backend
- **GitHub Repo**: fdkng/SHOPBRAIN_AI
- **Branch**: main
- **Root Directory**: leave blank (use default repo root)
- **Build Command**: `pip install -r backend/requirements.txt`
- **Start Command**: `uvicorn main:app --app-dir backend --host 0.0.0.0 --port $PORT`

## Step 3: Add Environment Variables
Go to **Environment** tab in Render service and add these:

```
OPENAI_API_KEY=sk-proj-YOUR_OPENAI_KEY_HERE

STRIPE_SECRET_KEY=sk_test_YOUR_STRIPE_KEY_HERE

STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET_HERE

SUPABASE_URL=https://jgmsfadayzbgykzajvmw.supabase.co

SUPABASE_KEY=eyJhbGciOi...YOUR_SUPABASE_KEY...

SUPABASE_JWT_SECRET=YOUR_JWT_SECRET_HERE

FRONTEND_ORIGIN=http://localhost:5173
```

## Step 4: Trigger a Redeploy
- Click **Manual Deploy** → **Deploy latest commit**
- Wait for build to complete (5-10 minutes)
- Once status shows "Live", note the public URL (e.g., https://shopbrain-backend-xxxxx.onrender.com)

## Step 5: Verify Backend is Working
```bash
# In terminal, after service is live:
curl https://<your-render-url>/products \
  -H "Authorization: Bearer <your-supabase-jwt-token>"
```

## Next Steps
1. Run Supabase migrations (apply supabase_schema.sql)
2. Set up Stripe webhook (point to https://<your-render-url>/webhook)
3. Update frontend with VITE_API_BASE and deploy
4. Run smoke tests
