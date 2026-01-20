#!/usr/bin/env bash
# Usage:
#   ./scripts/dev_verify_test.sh <CHECKOUT_SESSION_ID> [USER_ID]
# Environment variables:
#   PROD_BACKEND_URL - e.g. https://shopbrain-backend.onrender.com
#   SUPABASE_TOKEN - optional, Bearer token to call production /api/subscription/verify-session

set -euo pipefail
SESSION_ID=${1:-}
USER_ID=${2:-}
BACKEND_URL=${PROD_BACKEND_URL:-https://shopbrain-backend.onrender.com}

if [ -z "$SESSION_ID" ]; then
  echo "Usage: $0 <CHECKOUT_SESSION_ID> [USER_ID]"
  exit 2
fi

echo "Calling dev endpoint (if enabled) to persist session_id=$SESSION_ID user_id=$USER_ID"
curl -sS -X POST "$BACKEND_URL/dev/verify-session" \
  -H "Content-Type: application/json" \
  -d "{\"session_id\": \"$SESSION_ID\", \"user_id\": \"$USER_ID\"}" || true

echo -e "\nCalling production verify endpoint (requires SUPABASE_TOKEN env var)."
if [ -z "${SUPABASE_TOKEN:-}" ]; then
  echo "SUPABASE_TOKEN not set — skipping production /api/subscription/verify-session call. To test production verify, set SUPABASE_TOKEN to a valid Supabase access token."
  exit 0
fi

curl -sS -X POST "$BACKEND_URL/api/subscription/verify-session" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_TOKEN" \
  -d "{\"session_id\": \"$SESSION_ID\"}" || true

echo -e "\nDone. Check Supabase table 'subscriptions' for persisted rows."
