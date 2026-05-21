# ShopBrain AI — Backend

This is a FastAPI backend that exposes:

- `POST /optimize` — accepts `{name, description, email?}` and returns optimized product copy using OpenAI GPT-4 (requires auth token in header).
- `GET /products` — fetch all products for authenticated user (requires auth token).
- `POST /create-checkout-session` — creates Stripe Checkout session for subscriptions (expects `plan` and `email`).
- `POST /webhook` — Stripe webhook endpoint to persist subscription events.

## Environment Variables

See `.env.example`:

- `OPENAI_API_KEY` — OpenAI API key (GPT-4 required)
- `STRIPE_SECRET_KEY` — Stripe secret key
- `STRIPE_WEBHOOK_SECRET` — webhook secret to verify events
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_KEY` — Supabase service role key (for server-side operations)
- `SUPABASE_JWT_SECRET` — Supabase JWT secret (for verifying tokens from frontend)
- `FRONTEND_ORIGIN` — frontend origin for CORS + redirects (use `https://shopbrainai.netlify.app` in production)
- `PORT` — server port (default 8000)

## Local Setup

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Create `.env` from `.env.example` and fill in credentials.

```bash
uvicorn main:app --reload --port 8000
```

## Supabase Setup

1. Create a Supabase project
2. Run the SQL from `supabase_schema.sql` in your Supabase SQL editor
3. Run the SQL from `supabase_shopify_schema.sql` if you use the Shopify connection features
4. Run the SQL from `supabase_subscriptions_schema.sql` and `supabase_user_profiles.sql` for billing and profile persistence
5. Optionally run the SQL from `supabase_financials.sql` to create `financial_entries` and `tracked_products` for financial tracking extensions and future Truth-related inputs
6. Enable Auth (email/password) in Supabase dashboard
7. Copy your project URL and keys to `.env`

## Authentication

The backend expects JWT tokens in the `Authorization: Bearer <token>` header:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Tokens are obtained from Supabase Auth on the frontend.

## Stripe Webhook

Configure Stripe webhook to POST to `https://<your-domain>/webhook` with events:
- `checkout.session.completed`

Stripe will send events with your webhook secret. Ensure `STRIPE_WEBHOOK_SECRET` is set.

## Deployment to Railway

1. Create a new Railway project
2. Add environment variables (see `.env.example`)
3. Point to `backend/` directory
4. Set start command: `uvicorn main:app --port $PORT`
5. Railway auto-deploys on push

## Database

Products and subscriptions are persisted to Supabase tables:
- `products` — per-user optimized products
- `subscriptions` — Stripe subscription events + metadata
- `financial_entries` — optional user-owned revenue/expense records for financial tracking extensions
- `tracked_products` — optional user-owned Shopify products explicitly tracked for follow-up workflows
- RLS policies enforce per-user data access

