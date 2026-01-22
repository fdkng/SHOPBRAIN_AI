#!/bin/bash
# Test script to verify premium subscription status works

BACKEND_URL="https://shopbrain-ai.onrender.com"
USER_ID="${1:-550e8400-e29b-41d4-a716-446655440000}"  # Use provided user_id or dummy UUID
JWT_TOKEN="${2:-dummy_token}"

echo "🔍 Testing /api/subscription/status endpoint"
echo "Backend URL: $BACKEND_URL"
echo "User ID: $USER_ID"
echo ""

# Test with Bearer token
response=$(curl -s -w "\n%{http_code}" \
  -X POST "$BACKEND_URL/api/subscription/status" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-User-ID: $USER_ID")

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n-1)

echo "HTTP Status: $http_code"
echo "Response:"
echo "$body" | jq . 2>/dev/null || echo "$body"

if [ "$http_code" = "200" ]; then
    plan=$(echo "$body" | jq -r '.plan // .plan // "unknown"' 2>/dev/null)
    has_subscription=$(echo "$body" | jq -r '.has_subscription // false' 2>/dev/null)
    
    echo ""
    echo "✅ Status endpoint works!"
    echo "   Has subscription: $has_subscription"
    echo "   Plan: $plan"
    
    if [ "$plan" = "premium" ] || [ "$plan" = "PREMIUM" ]; then
        echo "✅ PREMIUM PLAN DETECTED!"
        exit 0
    else
        echo "⚠️  Plan is not premium: $plan"
        exit 1
    fi
else
    echo "❌ Status endpoint returned $http_code"
    exit 1
fi
