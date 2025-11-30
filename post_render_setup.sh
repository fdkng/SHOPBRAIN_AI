#!/bin/zsh
# Full automation script after Render service is created
# Usage: ./post_render_setup.sh https://shopbrain-backend-xxxxx.onrender.com

set -e

RENDER_URL="${1:-}"

if [[ -z "$RENDER_URL" ]]; then
    echo "Usage: $0 <render-url>"
    echo "Example: $0 https://shopbrain-backend-xxxxx.onrender.com"
    exit 1
fi

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "${BLUE}=== ShopBrain AI Post-Render Setup ===${NC}\n"

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_ROOT"

# Step 1: Verify Render service is live
echo "${BLUE}Step 1: Verifying Render service...${NC}"
if curl -s "$RENDER_URL/docs" > /dev/null 2>&1; then
    echo "${GREEN}✓ Render service is live${NC}"
else
    echo "${YELLOW}⚠ Warning: Render service may not be responding yet${NC}"
fi

# Step 2: Supabase migrations
echo "\n${BLUE}Step 2: Applying Supabase migrations...${NC}"
echo "Please follow these steps:"
echo "  1. Go to https://supabase.com/dashboard/projects"
echo "  2. Select your project"
echo "  3. SQL Editor → New Query"
echo "  4. Copy and paste backend/supabase_schema.sql"
echo "  5. Click Run"
echo ""
read -p "Press Enter once migrations are applied..."

# Step 3: Stripe webhook
echo "\n${BLUE}Step 3: Configuring Stripe webhook...${NC}"
echo "Please follow these steps:"
echo "  1. Go to https://dashboard.stripe.com/developers/webhooks"
echo "  2. Click 'Add endpoint'"
echo "  3. Endpoint URL: $RENDER_URL/webhook"
echo "  4. Events: checkout.session.completed, customer.subscription.updated"
echo "  5. Copy Signing Secret"
echo ""
read -p "Paste the Stripe webhook signing secret: " STRIPE_WEBHOOK_SECRET

# Update Render with webhook secret
echo "\nPlease add this to Render environment variables:"
echo "  STRIPE_WEBHOOK_SECRET=$STRIPE_WEBHOOK_SECRET"
echo ""
read -p "Press Enter once STRIPE_WEBHOOK_SECRET is added to Render..."

# Step 4: Frontend
echo "\n${BLUE}Step 4: Deploying frontend...${NC}"

# Update frontend .env
FRONTEND_ENV="$PROJECT_ROOT/frontend/.env"
if [[ -f "$FRONTEND_ENV" ]]; then
    # Replace VITE_API_BASE
    sed -i '' "s|VITE_API_BASE=.*|VITE_API_BASE=$RENDER_URL|" "$FRONTEND_ENV"
    echo "${GREEN}✓ Updated frontend/.env${NC}"
fi

echo "To deploy frontend:"
echo "  cd frontend"
echo "  npm run build"
echo "  npx vercel"
echo ""
read -p "Press Enter once frontend is deployed..."

# Get frontend URL
echo "\nWhat is your deployed frontend URL?"
read -p "Frontend URL: " FRONTEND_URL

if [[ -n "$FRONTEND_URL" ]]; then
    # Update Render FRONTEND_ORIGIN
    echo "\nPlease update Render environment variable:"
    echo "  FRONTEND_ORIGIN=$FRONTEND_URL"
    echo ""
    read -p "Press Enter once FRONTEND_ORIGIN is updated in Render..."
fi

# Step 5: Test
echo "\n${BLUE}Step 5: Running smoke tests...${NC}"
echo "Please test manually:"
echo "  1. Visit: $FRONTEND_URL"
echo "  2. Sign up with Supabase auth"
echo "  3. Test /optimize endpoint (if available in UI)"
echo "  4. Try Stripe checkout (14-day trial)"
echo "  5. Verify records in Supabase dashboard"
echo ""
read -p "Press Enter once you've tested the app..."

echo "\n${GREEN}🎉 Deployment complete!${NC}\n"
echo "Your ShopBrain AI app is now live!"
echo "  • Backend: $RENDER_URL"
echo "  • Frontend: $FRONTEND_URL"
echo ""
echo "Monitor your app:"
echo "  • Render Logs: https://dashboard.render.com"
echo "  • Supabase Dashboard: https://supabase.com/dashboard"
echo "  • Stripe Webhooks: https://dashboard.stripe.com/developers/webhooks"
