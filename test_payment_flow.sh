#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🧪 Testing ShopBrain Payment Flow..."
echo ""

# Test backend health
echo "1️⃣  Testing backend health endpoint..."
RESPONSE=$(curl -s https://shopbrain-backend.onrender.com/health)
if echo "$RESPONSE" | grep -q '"status":"ok"'; then
    echo -e "${GREEN}✅ Backend is healthy${NC}"
else
    echo -e "${RED}❌ Backend health check failed${NC}"
    echo "Response: $RESPONSE"
fi
echo ""

# Test payment link endpoint (without auth - should fail gracefully)
echo "2️⃣  Testing payment link endpoint (should require auth)..."
RESPONSE=$(curl -s -X POST https://shopbrain-backend.onrender.com/api/stripe/payment-link \
  -H "Content-Type: application/json" \
  -d '{"plan":"standard","email":"test@example.com"}')

if echo "$RESPONSE" | grep -q "detail\|error\|Unauthorized"; then
    echo -e "${GREEN}✅ Payment endpoint correctly requires authentication${NC}"
else
    echo -e "${YELLOW}⚠️  Unexpected response${NC}"
    echo "Response: $RESPONSE"
fi
echo ""

# Test subscription status endpoint (without auth - should fail)
echo "3️⃣  Testing subscription status endpoint (should require auth)..."
RESPONSE=$(curl -s -X POST https://shopbrain-backend.onrender.com/api/subscription/status \
  -H "Content-Type: application/json" \
  -d '{"user_id":"test"}')

if echo "$RESPONSE" | grep -q "detail\|error\|Unauthorized"; then
    echo -e "${GREEN}✅ Subscription endpoint correctly requires authentication${NC}"
else
    echo -e "${YELLOW}⚠️  Response: $RESPONSE${NC}"
fi
echo ""

# Test webhook endpoint
echo "4️⃣  Testing webhook endpoint (ping)..."
RESPONSE=$(curl -s -X POST https://shopbrain-backend.onrender.com/webhook \
  -H "Content-Type: application/json" \
  -d '{}')

if echo "$RESPONSE" | grep -q "received"; then
    echo -e "${GREEN}✅ Webhook endpoint is accessible${NC}"
else
    echo -e "${RED}❌ Webhook endpoint failed${NC}"
    echo "Response: $RESPONSE"
fi
echo ""

echo -e "${GREEN}🎉 Basic backend tests completed!${NC}"
echo ""
echo "📝 Manual testing checklist:"
echo "  [ ] Visit https://fdkng.github.io/SHOPBRAIN_AI and verify landing page loads"
echo "  [ ] Verify 'Voir tous les plans →' button navigates to #stripe-pricing"
echo "  [ ] Verify Stripe Pricing Table loads on #stripe-pricing page"
echo "  [ ] Try signing up with a test account"
echo "  [ ] Try clicking a plan button (should show Stripe checkout)"
echo "  [ ] Complete payment on Stripe"
echo "  [ ] Verify redirect to dashboard after payment"
echo "  [ ] Verify dashboard shows subscription info"
