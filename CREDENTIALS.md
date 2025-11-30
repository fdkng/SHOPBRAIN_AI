# Your Credentials (Keep Safe!)

This file documents the credentials you provided. **DO NOT commit this to git.**

## Stripe

### Price IDs
- Starter ($99): `price_1SQfzmPSvADOSbOzpxoK8hG3`
- Pro ($199): `price_1SQg0xPSvADOSbOzrZbOGs06`
- Enterprise ($299): `price_1SQg3CPSvADOSbOzHXSoDkGN`

(Already configured in `backend/main.py` STRIPE_PLANS dict)

## Supabase

### URL
```
https://jgmsfadayzbgykzajvmw.supabase.co
```

### Anon Key (use in frontend `.env`)
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnbXNmYWRheXpiZ3lremFqdm13Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQwODk0NTksImV4cCI6MjA3OTY2NTQ1OX0.sg0O2QGdoKO5Zb6vcRJr5pSu2zlaxU3r7nHtyXb07hg
```

(Already in `frontend/.env` as `VITE_SUPABASE_ANON_KEY`)

### Service Role Key (use in backend `.env`)
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnbXNmYWRheXpiZ3lremFqdm13Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDA4OTQ1OSwiZXhwIjoyMDc5NjY1NDU5fQ.QUoVYb_WzO5B_BrY8z4BvDH7qeT7Db9Ircig3IKYBFI
```

(Already in `backend/.env` as `SUPABASE_KEY`)

## Still Needed (not provided)

You still need to get these from their respective services:

1. **OpenAI API Key** (`OPENAI_API_KEY`)
   - Get from: https://platform.openai.com/api-keys
   - Required for: GPT-4 access in `/optimize` endpoint
   - Add to: `backend/.env`

2. **Stripe Webhook Secret** (`STRIPE_WEBHOOK_SECRET`)
   - Get from: Stripe Dashboard → Developers → Webhooks (after creating endpoint)
   - Required for: Verifying webhook signatures
   - Add to: `backend/.env` (and railway deployment)

3. **Supabase JWT Secret** (`SUPABASE_JWT_SECRET`)
   - Get from: Supabase Dashboard → Project Settings → Auth → JWT Secret
   - Required for: Verifying JWT tokens from frontend
   - Add to: `backend/.env` (and railway deployment)

---

## Files Already Updated

- ✅ `backend/.env` — has SUPABASE_URL + SUPABASE_KEY
- ✅ `frontend/.env` — has VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
- ✅ `backend/main.py` — STRIPE_PLANS hardcoded with your price IDs

---

## Security Notes

- Never commit `.env` files to git
- `.gitignore` already excludes `.env`
- Use `.env.example` as template for team members
- Rotate credentials periodically in production
- Use environment variables in deployment platforms (Vercel, Railway)
