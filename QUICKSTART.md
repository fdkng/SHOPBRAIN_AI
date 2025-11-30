# ShopBrain AI — Quick Start Guide

Get started locally in 5 minutes.

## Prerequisites

- Python 3.9+
- Node 16+
- Git

## 1. Clone & Setup

```bash
cd shopbrain_ai

# Backend
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env and add your API keys (see DEPLOYMENT.md for details)

# Frontend
cd ../frontend
npm install
cp .env.example .env
# Edit .env with Supabase keys and backend URL
```

## 2. Run Locally

**Terminal 1 (Backend):**
```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 8000
```

**Terminal 2 (Frontend):**
```bash
cd frontend
npm run dev
```

## 3. Open Browser

Navigate to `http://localhost:5173`

## 4. Test Flow

1. **Sign Up** — enter email + password
2. **Add Product** — enter product name and description
3. **Optimize** — click "Analyser & Optimiser"
4. **View Result** — see GPT-4 optimized title + description + cross-sell suggestions
5. **View Pricing** — explore Stripe plans (test with card `4242 4242 4242 4242`)

## Troubleshooting

### Port already in use
```bash
# Find process on port 8000
lsof -i :8000
# Kill it
kill -9 <PID>
```

### Module not found
```bash
cd backend
pip install -r requirements.txt
```

### Frontend can't reach backend
- Ensure backend runs on `http://localhost:8000`
- Check frontend `.env` has `VITE_API_BASE=http://localhost:8000`

### Supabase auth fails
- Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in frontend `.env`
- Ensure Supabase project is active

## Next Steps

See `DEPLOYMENT.md` for production deployment to Vercel + Railway + Supabase.
