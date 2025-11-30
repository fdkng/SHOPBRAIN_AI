# ShopBrain AI — Fullstack Product Optimization Platform

A complete, production-ready fullstack application to help e-commerce sellers optimize product listings with AI and Stripe billing.

**Features:**
- Product optimization powered by OpenAI GPT-4
- Supabase Auth (email/password signup)
- Server-side history (RLS-protected)
- Stripe pricing (3 plans: $99, $199, $299; 14-day free trial)
- Deployed to Vercel (frontend) + Railway (backend) + Supabase (database)

## Quick Start

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your credentials
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
# Edit .env with your Supabase + backend URL
npm run dev
```

Open `http://localhost:5173` and sign up with an email.

## Project Structure

```
.
├── backend/
│   ├── main.py               # FastAPI app
│   ├── requirements.txt
│   ├── supabase_schema.sql   # Database migrations
│   ├── .env.example
│   └── README.md
├── frontend/
│   ├── src/
│   │   ├── App.jsx           # Main router (Auth / Dashboard / Pricing)
│   │   ├── Auth.jsx          # Supabase login/signup
│   │   ├── Dashboard.jsx     # Product optimizer
│   │   ├── Pricing.jsx       # Stripe checkout
│   │   └── index.css         # Tailwind
│   ├── package.json
│   ├── vite.config.js
│   ├── .env.example
│   └── README.md
└── README.md (this file)
```

## Deployment

### Vercel (Frontend)

1. Push code to GitHub
2. Connect repo to Vercel
3. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_API_BASE` (production backend URL)
4. Auto-deploys on push

### Railway (Backend)

1. Create a new Railway project
2. Add environment variables (from `.env.example`)
3. Connect GitHub repo
4. Railway auto-deploys

### Supabase Setup

1. Create Supabase project
2. In SQL editor, run `backend/supabase_schema.sql`
3. Enable Auth (email/password)
4. Copy URL + keys to backend `.env`

## Environment Variables

**Backend (.env):**
```
OPENAI_API_KEY=sk-...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
SUPABASE_URL=https://...supabase.co
SUPABASE_KEY=eyJ...
SUPABASE_JWT_SECRET=eyJ...
FRONTEND_ORIGIN=https://yourfrontend.vercel.app
PORT=8000
```

**Frontend (.env):**
```
VITE_SUPABASE_URL=https://...supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_API_BASE=https://yourbackend.railway.app
```

## Tech Stack

- **Frontend:** React 18 + Vite + Tailwind CSS
- **Backend:** FastAPI + Uvicorn
- **Database:** Supabase (PostgreSQL + Auth + RLS)
- **Payments:** Stripe (subscriptions + webhooks)
- **AI:** OpenAI GPT-4
- **Deployment:** Vercel + Railway

## Key Endpoints

### Backend

- `POST /optimize` — optimize a product (requires auth)
- `GET /products` — get user's product history (requires auth)
- `POST /create-checkout-session` — start Stripe checkout
- `POST /webhook` — Stripe webhook handler

### Frontend

- `/` (Dashboard) — optimizer form + history
- `/pricing` — subscription plans
- Unauthenticated → Auth page (signup/login)

## Development Notes

- All product data is per-user (RLS enforced in Supabase)
- Subscriptions are tracked in `subscriptions` table; webhook persists them
- Frontend calls backend with JWT tokens (Supabase Auth)
- CORS is open to `FRONTEND_ORIGIN` environment variable
