# Frontend README

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

Frontend runs on `http://localhost:5173` by default.

## Environment Variables

Create a `.env` file from `.env.example`:

```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_API_BASE=http://localhost:8000  # or your production API URL
```

## Build

```bash
npm run build
```

Outputs to `dist/`.

## Deployment to Vercel

1. Connect your GitHub repo to Vercel
2. In Vercel project settings, add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_API_BASE` (production backend URL, e.g., `https://backend-prod.railway.app`)
3. Vercel auto-deploys on push

## Auth Flow

- Uses Supabase Auth (email/password)
- JWT tokens stored in browser session
- Tokens sent in `Authorization: Bearer <token>` headers to backend

## Key Features

- Product optimization form
- Server-side history (fetched from backend)
- Pricing page with Stripe integration (14-day free trial)
- Notification system
