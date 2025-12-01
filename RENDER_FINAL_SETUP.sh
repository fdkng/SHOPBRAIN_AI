#!/bin/bash
# Final Render Configuration Update Instructions
# Run these steps manually in Render Dashboard to deploy successfully

cat << 'EOF'

╔════════════════════════════════════════════════════════════════════════════╗
║                    FINAL RENDER CONFIGURATION STEPS                       ║
║                                                                            ║
║ ⚠️  IMPORTANT: Update these settings BEFORE redeploying                  ║
╚════════════════════════════════════════════════════════════════════════════╝

STEP 1: Go to Render Dashboard
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
URL: https://dashboard.render.com
Select your "shopbrain-backend" Web Service

STEP 2: Update Settings
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Go to "Settings" tab and update:

📌 Build Command (IMPORTANT!)
   OLD: pip install -r requirements.txt
   NEW: pip install -r backend/requirements.txt
   
   Action: Click "Build Command" field, clear it, paste:
   pip install -r backend/requirements.txt

📌 Start Command (IMPORTANT!)
   OLD: uvicorn main:app --host 0.0.0.0 --port $PORT
   NEW: uvicorn main:app --app-dir backend --host 0.0.0.0 --port $PORT
   
   Action: Click "Start Command" field, clear it, paste:
   uvicorn main:app --app-dir backend --host 0.0.0.0 --port $PORT

📌 Root Directory (OPTIONAL but RECOMMENDED)
   CURRENT: backend
   CHANGE TO: (leave blank - use default repo root)
   
   Action: If "Root Directory" is set to "backend", clear it to use repo root.
           This allows the build to find requirements.txt at the repo level.

STEP 3: Verify Environment Variables
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Go to "Environment" tab and confirm these are set:
  ✓ OPENAI_API_KEY
  ✓ STRIPE_SECRET_KEY
  ✓ STRIPE_WEBHOOK_SECRET
  ✓ SUPABASE_URL
  ✓ SUPABASE_KEY
  ✓ SUPABASE_JWT_SECRET
  ✓ FRONTEND_ORIGIN

STEP 4: Save and Redeploy
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

After updating commands:
1. Click "Save" (if prompted)
2. Go to "Deployments" tab
3. Click "Manual Deploy" → "Deploy latest commit"
4. Watch the build logs for success ✓

Expected Output:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Build phase should show:
  ==> Running build command 'pip install -r backend/requirements.txt'...
  [... lots of packages installing ...]
  Successfully installed ...
  ==> Build successful 🎉

Start phase should show:
  ==> Running 'uvicorn main:app --app-dir backend --host 0.0.0.0 --port $PORT'
  INFO:     Started server process
  INFO:     Uvicorn running on http://0.0.0.0:$PORT

Finally should show:
  Deployment live! ✓

TROUBLESHOOTING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

If build still fails:
1. Check "Logs" tab for error messages
2. Copy the error and send it over
3. Common issues:
   - Root Directory set to "backend" (should be blank)
   - Build Command wrong (should be: pip install -r backend/requirements.txt)
   - Start Command wrong (should include: --app-dir backend)

If deployment succeeds but service crashes:
1. Check "Logs" for runtime errors
2. Verify all Environment Variables are set
3. Check SUPABASE_JWT_SECRET is not empty

TESTING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Once "Live" status shows:
1. Get your service URL (e.g., https://shopbrain-backend-xxxxx.onrender.com)
2. Test health endpoint:
   curl https://shopbrain-backend-xxxxx.onrender.com/docs
   
   Should return FastAPI Swagger UI (HTML page)

3. If you get 502 Bad Gateway:
   - Wait 30 seconds and retry (still starting up)
   - Check logs again

NEXT STEPS AFTER DEPLOYMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Once your backend is live:
1. Get the public URL (e.g., https://shopbrain-backend-xxxxx.onrender.com)
2. Update frontend VITE_API_BASE to this URL
3. Deploy frontend to Vercel
4. Update Render FRONTEND_ORIGIN to your frontend URL
5. Redeploy backend (so CORS headers are correct)
6. Test the full flow: sign up → optimize → checkout

════════════════════════════════════════════════════════════════════════════════

Now go to Render Dashboard and follow STEP 1-4 above. Good luck! 🚀

EOF
