# TRUTH Multi-Tenant Integrations

## Goal

Make `TRUTH / Real Profit` work per client, not from one global `.env` ads configuration.

## Data Model

The backend now expects a `client_integrations` table keyed by:

- `user_id`
- `provider` (`meta`, `tiktok`, `google`)
- `external_account_id`

Each row can store:

- `access_token`
- `refresh_token`
- `token_expires_at`
- `api_version`
- `config` JSON for provider-specific secrets
- `metadata` JSON for labels or UI info
- `is_primary` to choose the default account per provider

## Backend Endpoints

- `GET /api/integrations`
- `GET /api/integrations/{provider}/status`
- `POST /api/integrations/{provider}/manual-connect`
- `POST /api/integrations/{provider}/oauth/start`
- `DELETE /api/integrations/{provider}`
- `GET /auth/integrations/{provider}/callback`

## Manual Connect Payloads

### Meta

```json
{
  "external_account_id": "123456789012345",
  "display_name": "Main Meta account",
  "access_token": "EAAB...",
  "api_version": "v20.0",
  "is_primary": true
}
```

### TikTok

```json
{
  "external_account_id": "1234567890123456789",
  "display_name": "TikTok FR",
  "access_token": "tiktok_access_token",
  "api_version": "v1.3",
  "is_primary": true
}
```

### Google Ads

```json
{
  "external_account_id": "123-456-7890",
  "display_name": "Google Ads MCC",
  "refresh_token": "refresh_token",
  "developer_token": "developer_token",
  "client_id": "oauth_client_id",
  "client_secret": "oauth_client_secret",
  "manager_account_id": "098-765-4321",
  "is_primary": true
}
```

## Fallback Mode

For onboarding or testing, each client integration can also store campaign data in `config.campaigns_json`.

That lets `TRUTH` work per client even before the final OAuth flows are built for every platform.

## Current Behavior

- `TRUTH` first reads the authenticated user's `client_integrations`
- then loads the user's primary ad account per provider
- then falls back to legacy global `.env` JSON only if the user has no provider-specific integration
- ad cache is scoped per user/account to avoid cross-client leaks

## OAuth Setup

The dashboard now supports provider OAuth launch buttons.

### Ready-to-paste backend env block

Use this on Render for the backend service:

```env
FRONTEND_ORIGIN=https://fdkng.github.io/SHOPBRAIN_AI
BACKEND_BASE_URL=https://shopbrain-backend.onrender.com

META_ADS_APP_ID=your_meta_app_id
META_ADS_APP_SECRET=your_meta_app_secret
META_ADS_REDIRECT_URI=https://shopbrain-backend.onrender.com/auth/integrations/meta/callback
META_ADS_SCOPES=ads_read,business_management

TIKTOK_ADS_CLIENT_ID=your_tiktok_ads_client_id
TIKTOK_ADS_CLIENT_SECRET=your_tiktok_ads_client_secret
TIKTOK_ADS_REDIRECT_URI=https://shopbrain-backend.onrender.com/auth/integrations/tiktok/callback
TIKTOK_ADS_SCOPES=ads.read

GOOGLE_ADS_CLIENT_ID=your_google_ads_oauth_client_id
GOOGLE_ADS_CLIENT_SECRET=your_google_ads_oauth_client_secret
GOOGLE_ADS_REDIRECT_URI=https://shopbrain-backend.onrender.com/auth/integrations/google/callback
GOOGLE_ADS_SCOPES=https://www.googleapis.com/auth/adwords
```

Then add these callback URLs in each provider console:

- Meta: `https://shopbrain-backend.onrender.com/auth/integrations/meta/callback`
- TikTok: `https://shopbrain-backend.onrender.com/auth/integrations/tiktok/callback`
- Google: `https://shopbrain-backend.onrender.com/auth/integrations/google/callback`

Notes:

- `FRONTEND_ORIGIN` is required so the backend redirects users back into the dashboard.
- `BACKEND_BASE_URL` is required so default callback URLs match the public backend URL.
- Google Ads also still needs the per-account `developer_token` in the dashboard card unless you decide to store one global server-side token for all clients.

### Meta Ads

Set:

- `META_ADS_APP_ID`
- `META_ADS_APP_SECRET`
- `META_ADS_REDIRECT_URI` (defaults to `/auth/integrations/meta/callback` on the backend base URL)
- optional `META_ADS_SCOPES`

### TikTok Ads

Set:

- `TIKTOK_ADS_CLIENT_ID` (or compatible alias already used in the backend)
- `TIKTOK_ADS_CLIENT_SECRET`
- `TIKTOK_ADS_REDIRECT_URI`
- optional `TIKTOK_ADS_SCOPES`

### Google Ads

Set:

- `GOOGLE_ADS_CLIENT_ID`
- `GOOGLE_ADS_CLIENT_SECRET`
- `GOOGLE_ADS_REDIRECT_URI`
- optional `GOOGLE_ADS_SCOPES`

Important: Google OAuth now captures the client's refresh token automatically, but `developer_token` and the final Google Ads customer/account ID may still need to be filled in the dashboard card if they cannot be inferred automatically.

## Next Step

Complete live Google Ads fetch support so OAuth-connected Google accounts become fully auto-discoverable end-to-end.