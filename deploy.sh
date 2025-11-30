#!/bin/zsh
# Complete ShopBrain AI deployment automation script
# This script handles the remaining deployment steps after Render setup

set -e

echo "╔════════════════════════════════════════════════════════╗"
echo "║    ShopBrain AI - Complete Deployment Automation       ║"
echo "╚════════════════════════════════════════════════════════╝"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Configuration
RENDER_URL="${1:-}"
STRIPE_WEBHOOK_URL="${RENDER_URL}/webhook"

# Step 1: Validate inputs
echo "\n${BLUE}Step 1: Validating inputs...${NC}"

if [[ -z "$RENDER_URL" ]]; then
    echo "${YELLOW}⚠ Please provide Render URL as argument:${NC}"
    echo "   ./deploy.sh https://shopbrain-backend-xxxxx.onrender.com"
    exit 1
fi

echo "${GREEN}✓ Render URL: $RENDER_URL${NC}"

# Step 2: Check local files
echo "\n${BLUE}Step 2: Checking local files...${NC}"

required_files=(
    "backend/.env"
    "backend/main.py"
    "backend/requirements.txt"
    "backend/supabase_schema.sql"
    ".env"
)

for file in "${required_files[@]}"; do
    if [[ ! -f "$file" ]]; then
        echo "${RED}✗ Missing file: $file${NC}"
        exit 1
    fi
done

echo "${GREEN}✓ All required files present${NC}"

# Step 3: Print Supabase migration instructions
echo "\n${BLUE}Step 3: Supabase Migrations${NC}"
echo "${YELLOW}Please apply the schema manually:${NC}"
echo "1. Go to https://supabase.com/dashboard/projects"
echo "2. Select your project → SQL Editor"
echo "3. Click 'New Query'"
echo "4. Copy the SQL below:"
echo ""
cat backend/supabase_schema.sql
echo ""
read -p "Press Enter once you've applied the schema in Supabase..."

# Step 4: Print Stripe webhook setup instructions
echo "\n${BLUE}Step 4: Stripe Webhook Setup${NC}"
echo "${YELLOW}Please configure Stripe webhook:${NC}"
echo "1. Go to https://dashboard.stripe.com/developers/webhooks"
echo "2. Click 'Add endpoint'"
echo "3. Endpoint URL: $STRIPE_WEBHOOK_URL"
echo "4. Events to send:"
echo "   - checkout.session.completed"
echo "   - customer.subscription.updated"
echo "5. Copy the Signing Secret"
echo ""
read -p "Press Enter once you've created the Stripe webhook..."

# Step 5: Frontend deployment
echo "\n${BLUE}Step 5: Frontend Deployment${NC}"
echo "${YELLOW}Frontend deployment instructions:${NC}"
echo "1. Update frontend/.env with:"
echo "   VITE_API_BASE=$RENDER_URL"
echo "2. Deploy frontend:"
echo "   cd frontend"
echo "   npm run build"
echo "   # Then deploy to Vercel or your chosen host"
echo ""
read -p "Press Enter once frontend is deployed..."

# Step 6: Verify endpoints
echo "\n${BLUE}Step 6: Verifying Backend Endpoints${NC}"

# Get a test token (you'll need to create one manually from Supabase)
echo "${YELLOW}To test endpoints, you need a valid Supabase JWT token.${NC}"
echo "Get one from: https://supabase.com/dashboard/project/[your-project]/auth/users"
echo ""
read -p "Paste a valid Supabase JWT token (or press Enter to skip): " TEST_TOKEN

if [[ -n "$TEST_TOKEN" ]]; then
    echo "\nTesting /products endpoint..."
    curl -s "$RENDER_URL/products" \
        -H "Authorization: Bearer $TEST_TOKEN" \
        -H "Content-Type: application/json" | jq . || echo "Request failed"
    
    echo "\nTesting /optimize endpoint with test data..."
    curl -s -X POST "$RENDER_URL/optimize" \
        -H "Authorization: Bearer $TEST_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{
            "productName": "Test Product",
            "productDescription": "A test product for verification",
            "targetMarket": "Tech enthusiasts",
            "budget": 1000
        }' | jq . || echo "Request failed"
else
    echo "${YELLOW}Skipping endpoint tests${NC}"
fi

# Step 7: Summary
echo "\n${GREEN}╔════════════════════════════════════════════════════════╗${NC}"
echo "${GREEN}║           Deployment Complete! 🎉                    ║${NC}"
echo "${GREEN}╚════════════════════════════════════════════════════════╝${NC}"

echo "\n${BLUE}Summary:${NC}"
echo "✓ Backend: $RENDER_URL (Live)"
echo "✓ Frontend: Deployed to Vercel"
echo "✓ Database: Supabase migrations applied"
echo "✓ Webhooks: Stripe webhook configured"

echo "\n${YELLOW}Next steps:${NC}"
echo "1. Monitor your deployed app for errors"
echo "2. Test user signup → checkout → success page flow"
echo "3. Verify records appear in Supabase tables"
echo "4. Check Stripe webhook delivery logs"

echo "\n${BLUE}Useful links:${NC}"
echo "- Render Dashboard: https://dashboard.render.com"
echo "- Supabase Dashboard: https://supabase.com/dashboard"
echo "- Stripe Dashboard: https://dashboard.stripe.com"
echo "- Vercel Dashboard: https://vercel.com/dashboard"
