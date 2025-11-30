.PHONY: help deploy-backend deploy-frontend migrate-db setup-stripe smoke-tests clean

# Configuration
BACKEND_DIR := backend
FRONTEND_DIR := frontend
ENV_FILE := $(BACKEND_DIR)/.env
PYTHON := python3
PIP := $(PYTHON) -m pip

help:
	@echo "ShopBrain AI Deployment Commands"
	@echo "=================================="
	@echo ""
	@echo "make setup              - Setup local environment (install dependencies)"
	@echo "make deploy-backend     - Deploy backend to Render (requires Render service URL)"
	@echo "make deploy-frontend    - Deploy frontend to Vercel"
	@echo "make migrate-db         - Apply Supabase database migrations"
	@echo "make setup-stripe       - Configure Stripe webhook"
	@echo "make smoke-tests        - Run smoke tests against deployed app"
	@echo "make clean              - Clean temporary files"
	@echo ""
	@echo "Full deployment: make setup && make deploy-backend && make deploy-frontend"

setup:
	@echo "Setting up local environment..."
	@test -f $(ENV_FILE) || (echo "Error: $(ENV_FILE) not found"; exit 1)
	@$(PIP) install -r $(BACKEND_DIR)/requirements.txt
	@echo "✓ Backend dependencies installed"

deploy-backend:
	@echo "Backend deployment instructions:"
	@echo "1. Go to https://dashboard.render.com"
	@echo "2. Create Web Service from GitHub (fdkng/SHOPBRAIN_AI)"
	@echo "3. Set Root Directory to: backend"
	@echo "4. Build Command: pip install -r requirements.txt"
	@echo "5. Start Command: uvicorn main:app --host 0.0.0.0 --port $$PORT"
	@echo "6. Add Environment Variables (see RENDER_SETUP.md)"
	@echo "7. Deploy and get the public URL"

deploy-frontend:
	@echo "Frontend deployment instructions:"
	@echo "1. Update frontend env with Render backend URL"
	@echo "2. Deploy: cd $(FRONTEND_DIR) && npm run build && npx vercel"

migrate-db:
	@echo "Database migration instructions:"
	@echo "1. Go to https://supabase.com/dashboard/projects"
	@echo "2. SQL Editor → New Query"
	@echo "3. Paste contents of $(BACKEND_DIR)/supabase_schema.sql"
	@echo "4. Click Run"

setup-stripe:
	@echo "Stripe webhook setup instructions:"
	@echo "1. Go to https://dashboard.stripe.com/developers/webhooks"
	@echo "2. Add endpoint: https://<your-render-url>/webhook"
	@echo "3. Events: checkout.session.completed, customer.subscription.updated"
	@echo "4. Copy signing secret to Render environment as STRIPE_WEBHOOK_SECRET"

smoke-tests:
	@echo "Running smoke tests..."
	@test -f $(ENV_FILE) || (echo "Error: $(ENV_FILE) not found"; exit 1)
	@$(PYTHON) -c "\
import os; \
from dotenv import load_dotenv; \
load_dotenv('$(ENV_FILE)'); \
print('Environment loaded'); \
print('OPENAI_API_KEY:', '***' if os.getenv('OPENAI_API_KEY') else 'NOT SET'); \
print('STRIPE_SECRET_KEY:', '***' if os.getenv('STRIPE_SECRET_KEY') else 'NOT SET'); \
print('SUPABASE_URL:', os.getenv('SUPABASE_URL', 'NOT SET')); \
"

clean:
	@echo "Cleaning temporary files..."
	@find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	@find . -type f -name "*.pyc" -delete
	@find . -type f -name ".DS_Store" -delete
	@echo "✓ Cleaned"
