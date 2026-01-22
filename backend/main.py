from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
import os
import openai
try:
    from openai import OpenAI
except Exception:
    OpenAI = None
import stripe
from dotenv import load_dotenv
import re
import jwt
from functools import lru_cache
import hmac
import hashlib
import requests
import json
import sys
from datetime import datetime, timedelta
from supabase import create_client

# Ajouter le répertoire parent au path pour importer AI_engine
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from AI_engine.shopbrain_ai import ShopBrainAI
from shopbrain_expert_system import SHOPBRAIN_EXPERT_SYSTEM

load_dotenv()

# Load and sanitize OpenAI API key.
# Priority: OPENAI_API_KEY_CLEAN > OPENAI_API_KEY_ALT > OPENAI_API_KEY
OPENAI_API_KEY_RAW = (
    os.getenv("OPENAI_API_KEY_CLEAN")
    or os.getenv("OPENAI_API_KEY_ALT")
    or os.getenv("OPENAI_API_KEY", "")
)

def _sanitize_key(raw: str) -> str:
    # Keep ONLY alphanumeric, dash, underscore (valid in OpenAI keys). Removes newlines/spaces/control chars.
    return re.sub(r'[^A-Za-z0-9_\-]', '', raw)

OPENAI_API_KEY = _sanitize_key(OPENAI_API_KEY_RAW) if OPENAI_API_KEY_RAW else ""

if OPENAI_API_KEY_RAW and OPENAI_API_KEY_RAW != OPENAI_API_KEY:
    print(
        f"⚠️ OPENAI_API_KEY sanitized. raw_len={len(OPENAI_API_KEY_RAW)} sanitized_len={len(OPENAI_API_KEY)}"
    )
print(
    f"🔑 OPENAI_API_KEY loaded: {len(OPENAI_API_KEY)} chars, starts with '{OPENAI_API_KEY[:15] if OPENAI_API_KEY else 'EMPTY'}...'"
)
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "https://fdkng.github.io/SHOPBRAIN_AI")

# Shopify OAuth credentials
SHOPIFY_API_KEY = os.getenv("SHOPIFY_API_KEY")
SHOPIFY_API_SECRET = os.getenv("SHOPIFY_API_SECRET")
SHOPIFY_ACCESS_TOKEN = os.getenv("SHOPIFY_ACCESS_TOKEN")
SHOPIFY_SCOPES = "read_products,write_products,read_orders,read_customers,read_analytics"
SHOPIFY_REDIRECT_URI = os.getenv("SHOPIFY_REDIRECT_URI", "https://shopbrain-backend.onrender.com/auth/shopify/callback")

if not OPENAI_API_KEY:
    print("Warning: OPENAI_API_KEY not set. /optimize will fail without it.")
else:
    # Keep legacy api_key for compatibility; client class will use explicit key.
    openai.api_key = OPENAI_API_KEY

if STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY

app = FastAPI()

# Allow CORS from GitHub Pages and local development
allowed_origins = [
    "https://fdkng.github.io",
    "https://fdkng.github.io/SHOPBRAIN_AI",
    "http://localhost:5173",
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Stripe price IDs - Mapping tier names to price IDs
STRIPE_PLANS = {
    "standard": "price_1SQfzmPSvADOSbOzpxoK8hG3",
    "pro": "price_1SQg0xPSvADOSbOzrZbOGs06",
    "premium": "price_1SQg3CPSvADOSbOzHXSoDkGN",
}

# Reverse mapping: price_id -> tier
PRICE_TO_TIER = {
    "price_1SQfzmPSvADOSbOzpxoK8hG3": "standard",
    "price_1SQg0xPSvADOSbOzrZbOGs06": "pro",
    "price_1SQg3CPSvADOSbOzHXSoDkGN": "premium",
}

# Helper: get authenticated user from Authorization header or request body
def get_user_id(request: Request) -> str:
    auth_header = request.headers.get("Authorization", "")
    
    # Try JWT first
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        try:
            if not SUPABASE_JWT_SECRET:
                print(f"⚠️ SUPABASE_JWT_SECRET not set!")
            else:
                # Decode with audience validation for Supabase tokens
                # Supabase sets aud="authenticated" by default
                payload = jwt.decode(
                    token, 
                    SUPABASE_JWT_SECRET, 
                    algorithms=["HS256"],
                    audience="authenticated"  # Match Supabase token audience
                )
                user_id = payload.get("sub")
                print(f"✅ JWT decoded. User ID: {user_id}")
                return user_id
        except jwt.InvalidAudienceError as e:
            print(f"❌ JWT audience validation failed: {e}")
        except Exception as e:
            print(f"❌ JWT decode error: {e}")
    
    # Fallback: try to extract user_id from header (for dev/testing)
    try:
        user_id = request.headers.get("X-User-ID", "")
        if user_id:
            print(f"✅ User ID from header: {user_id}")
            return user_id
    except:
        pass
    
    print(f"❌ Missing Bearer token or user_id. Headers: {dict(request.headers)}")
    raise HTTPException(status_code=401, detail="Missing or invalid token")


class OptimizeRequest(BaseModel):
    name: str
    description: str
    email: str | None = None


@app.post("/optimize")
async def optimize(req: OptimizeRequest, request: Request):
    """Receive product name+description, call OpenAI GPT-4 to generate improved title, description and 3 cross-sell suggestions."""
    user_id = get_user_id(request)
    
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OpenAI key not configured")

    prompt = f"""
You are a product copywriter.
Input product name: {req.name}
Input product description: {req.description}

Return a JSON object with keys: title, description, cross_sell (array of 3 short suggestions).
Keep outputs concise and use French language if inputs are French.
"""

    try:
        # OpenAI 1.0+ API
        client = (OpenAI(api_key=OPENAI_API_KEY) if OpenAI else openai.OpenAI(api_key=OPENAI_API_KEY))
        response = client.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "Tu es un copywriter produit expert."},
                {"role": "user", "content": prompt},
            ],
            max_tokens=400,
            temperature=0.8,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    text = response.choices[0].message.content.strip()

    # Best-effort: attempt to parse JSON returned by the model.
    import json

    try:
        data = json.loads(text)
    except Exception:
        # Fallback: naive parsing
        data = {
            "title": req.name,
            "description": text,
            "cross_sell": [],
        }

    # Persist to Supabase if configured (best-effort)
    if SUPABASE_URL and SUPABASE_KEY:
        try:
            from supabase import create_client

            supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
            payload = {
                "user_id": user_id,
                "name": req.name,
                "original_description": req.description,
                "optimized_title": data.get("title"),
                "optimized_description": data.get("description"),
                "cross_sell": data.get("cross_sell"),
            }
            supabase.table("products").insert(payload).execute()
        except Exception as e:
            print(f"Warning: could not persist to Supabase: {e}")

    return {"ok": True, "result": data}


@app.get("/products")
async def get_products(request: Request):
    """Fetch all products for the authenticated user."""
    user_id = get_user_id(request)
    
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise HTTPException(status_code=500, detail="Supabase not configured")
    
    try:
        from supabase import create_client
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        response = supabase.table("products").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
        return {"products": response.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health():
    """Health check endpoint for Render"""
    return {"status": "ok", "version": "1.3", "cors": "fixed"}


@app.post("/api/stripe/payment-link")
async def create_payment_link(payload: dict, request: Request):
    """Create a Stripe Payment Link for a subscription plan.
    Expects JSON: {"plan": "standard" | "pro" | "premium", "email": "customer@example.com", "user_id": "..."}
    """
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=500, detail="Stripe not configured")

    plan = payload.get("plan", "").lower()
    customer_email = payload.get("email")
    
    # Try to get user_id from token, fallback to payload
    try:
        user_id = get_user_id(request)
    except:
        # If token validation fails, get from payload
        user_id = payload.get("user_id", "unknown")
    
    # Plan pricing configuration
    plan_config = {
        "standard": {
            "name": "ShopBrain AI - Standard",
            "description": "Analyse 50 produits/mois",
            "amount": 9900,  # $99.00
        },
        "pro": {
            "name": "ShopBrain AI - Pro",
            "description": "Analyse 500 produits/mois + Support prioritaire",
            "amount": 19900,  # $199.00
        },
        "premium": {
            "name": "ShopBrain AI - Premium",
            "description": "Analyse illimitée + Support 24/7",
            "amount": 29900,  # $299.00
        }
    }
    
    if plan not in plan_config:
        raise HTTPException(status_code=400, detail="Invalid plan. Must be: standard, pro, or premium")
    
    config = plan_config[plan]
    
    try:
        # Use direct GitHub Pages URL for redirect
        redirect_url = "https://fdkng.github.io/SHOPBRAIN_AI/?payment=success"
        print(f"🔍 DEBUG - Redirect URL: {redirect_url}")
        
        # Create payment link (one-time checkout for subscription)
        link = stripe.PaymentLink.create(
            line_items=[
                {
                    "price_data": {
                        "currency": "usd",
                        "product_data": {
                            "name": config["name"],
                            "description": config["description"],
                        },
                        "unit_amount": config["amount"],
                        "recurring": {
                            "interval": "month",
                            "interval_count": 1,
                        },
                    },
                    "quantity": 1,
                }
            ],
            after_completion={
                "type": "redirect",
                "redirect": {
                    "url": redirect_url
                }
            },
            billing_address_collection="auto",
            customer_creation="always",
            metadata={
                "plan": plan,
                "email": customer_email if customer_email else "unknown",
                "user_id": user_id if user_id else "unknown"
            }
        )
        
        return {
            "success": True,
            "url": link.url,
            "plan": plan,
            "amount": config["amount"]
        }
    except Exception as e:
        print(f"Stripe Error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Failed to create payment link: {str(e)}")


@app.post("/create-checkout-session")
async def create_checkout(payload: dict, request: Request):
    """Create a Stripe Checkout Session for subscription plans.
    Expects JSON: {"plan": "99" | "199" | "299", "email": "customer@example.com"}
    """
    print(f"📋 Checkout request received. Payload: {payload}")
    
    user_id = get_user_id(request)
    print(f"✅ User authenticated: {user_id}")
    
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=500, detail="Stripe not configured")

    plan = payload.get("plan")
    customer_email = payload.get("email")
    
    print(f"📊 Plan: {plan}, Email: {customer_email}")
    
    if plan not in STRIPE_PLANS:
        raise HTTPException(status_code=400, detail="Invalid plan")

    price_id = STRIPE_PLANS[plan]

    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            mode="subscription",
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=FRONTEND_ORIGIN + "?payment=success&session_id={CHECKOUT_SESSION_ID}",
            cancel_url=FRONTEND_ORIGIN + "#pricing",
            customer_email=customer_email,
            subscription_data={
                "trial_period_days": 14,
                "metadata": {"user_id": user_id},
            },
        )
        print(f"✅ Checkout session created: {session.id}")
        return {"url": session.url}
    except Exception as e:
        print(f"❌ Checkout error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/dev/force-persist")
async def dev_force_persist(session_id: str, user_id: str):
    """
    DEV ONLY: Force persist a subscription from Stripe session.
    Example: GET /dev/force-persist?session_id=cs_...&user_id=uuid
    """
    allow = os.getenv("DEV_ALLOW_UNAUTH_VERIFY", "false").lower() == "true"
    if not allow:
        raise HTTPException(status_code=403, detail="Dev verify disabled")

    if not session_id or not user_id:
        raise HTTPException(status_code=400, detail="session_id and user_id required")

    try:
        session = stripe.checkout.Session.retrieve(session_id)
        
        if session.payment_status != "paid":
            return {"success": False, "message": "Payment not confirmed"}

        # Persist to Supabase (use HTTP directly to avoid SDK UUID parsing issues)
        if SUPABASE_URL and SUPABASE_SERVICE_KEY:
            plan = (session.metadata or {}).get("plan") or "standard"

            subscription_payload = {
                "user_id": user_id,
                "email": session.get("customer_email"),
                "stripe_session_id": session.get("id"),
                "stripe_subscription_id": session.get("subscription"),
                "stripe_customer_id": session.get("customer"),
                "plan_tier": plan,
                "status": "active",
            }

            headers = {
                'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
                'apikey': SUPABASE_SERVICE_KEY,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            }

            # Check if subscription exists with this user_id (HTTP GET)
            filter_str = f'user_id=eq.{user_id}'
            resp = requests.get(
                f'{SUPABASE_URL}/rest/v1/subscriptions?{filter_str}&select=id',
                headers=headers,
                timeout=5
            )
            
            existing_data = resp.json() if resp.status_code == 200 else []
            
            if existing_data and len(existing_data) > 0:
                # Update existing (HTTP PATCH)
                resp = requests.patch(
                    f'{SUPABASE_URL}/rest/v1/subscriptions?{filter_str}',
                    headers=headers,
                    json=subscription_payload,
                    timeout=5
                )
                print(f"✅ [DEV] Subscription updated: user_id={user_id}, plan={plan}")
            else:
                # Insert new (HTTP POST)
                resp = requests.post(
                    f'{SUPABASE_URL}/rest/v1/subscriptions',
                    headers=headers,
                    json=subscription_payload,
                    timeout=5
                )
                print(f"✅ [DEV] Subscription inserted: user_id={user_id}, plan={plan}")

            return {"success": True, "message": "Subscription persisted"}

        return {"success": False, "message": "Supabase not configured"}

    except Exception as e:
        print(f"Dev force-persist error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/dev/check-db")
async def dev_check_db(user_id: str):
    """
    DEV ONLY: Check what's in the database for a user.
    """
    allow = os.getenv("DEV_ALLOW_UNAUTH_VERIFY", "false").lower() == "true"
    if not allow:
        raise HTTPException(status_code=403, detail="Dev verify disabled")

    if not user_id:
        raise HTTPException(status_code=400, detail="user_id required")

    try:
        if SUPABASE_URL and SUPABASE_SERVICE_KEY:
            import urllib.parse
            filter_str = f'user_id=eq.{user_id}'
            
            headers = {
                'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
                'apikey': SUPABASE_SERVICE_KEY,
                'Content-Type': 'application/json',
            }
            
            resp = requests.get(
                f'{SUPABASE_URL}/rest/v1/subscriptions?{filter_str}',
                headers=headers,
                timeout=5
            )
            
            data = resp.json() if resp.status_code == 200 else None
            
            return {
                "user_id": user_id,
                "found": bool(data and len(data) > 0),
                "count": len(data) if data else 0,
                "subscriptions": data or []
            }

        return {"error": "Supabase not configured"}

    except Exception as e:
        print(f"Dev check-db error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/dev/simulate-webhook")
async def dev_simulate_webhook(session_id: str):
    """
    DEV ONLY: Simulate a Stripe webhook event for testing.
    This mimics what happens when Stripe sends checkout.session.completed event.
    """
    allow = os.getenv("DEV_ALLOW_UNAUTH_VERIFY", "false").lower() == "true"
    if not allow:
        raise HTTPException(status_code=403, detail="Dev verify disabled")

    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")

    try:
        # Fetch session from Stripe
        session = stripe.checkout.Session.retrieve(session_id)
        
        if session.payment_status != "paid":
            return {"success": False, "message": f"Payment not confirmed: {session.payment_status}"}

        user_id = session.get("metadata", {}).get("user_id") if session.metadata else None
        
        if not user_id:
            return {"success": False, "message": "user_id not in session metadata"}

        # Persist subscription (use HTTP directly to avoid SDK UUID parsing issues)
        if SUPABASE_URL and SUPABASE_SERVICE_KEY and user_id:
            plan_tier = session.get("metadata", {}).get("plan") if session.metadata else "standard"
            if not plan_tier:
                plan_tier = "standard"
            
            subscription_payload = {
                "user_id": user_id,
                "email": session.get("customer_email"),
                "stripe_session_id": session.get("id"),
                "stripe_subscription_id": session.get("subscription"),
                "stripe_customer_id": session.get("customer"),
                "plan_tier": plan_tier,
                "status": "active",
            }

            headers = {
                'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
                'apikey': SUPABASE_SERVICE_KEY,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            }

            # Check if subscription exists with this user_id (HTTP GET)
            filter_str = f'user_id=eq.{user_id}'
            resp = requests.get(
                f'{SUPABASE_URL}/rest/v1/subscriptions?{filter_str}&select=id',
                headers=headers,
                timeout=5
            )
            
            existing_data = resp.json() if resp.status_code == 200 else []
            
            if existing_data and len(existing_data) > 0:
                # Update existing (HTTP PATCH)
                resp = requests.patch(
                    f'{SUPABASE_URL}/rest/v1/subscriptions?{filter_str}',
                    headers=headers,
                    json=subscription_payload,
                    timeout=5
                )
                print(f"✅ [DEV Webhook Simulation] Subscription updated: user_id={user_id}, plan={plan_tier}")
            else:
                # Insert new (HTTP POST)
                resp = requests.post(
                    f'{SUPABASE_URL}/rest/v1/subscriptions',
                    headers=headers,
                    json=subscription_payload,
                    timeout=5
                )
                print(f"✅ [DEV Webhook Simulation] Subscription inserted: user_id={user_id}, plan={plan_tier}")
            
            return {
                "success": True,
                "message": "Subscription persisted via webhook simulation",
                "user_id": user_id,
                "plan": plan_tier
            }

        return {"success": False, "message": "Supabase not configured or user_id missing"}

    except Exception as e:
        print(f"Dev simulate-webhook error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/dev/verify-session")
async def dev_verify_session(payload: dict):
    """
    DEV helper: verify a Stripe checkout session and persist subscription without requiring user JWT.
    Enabled only when environment variable `DEV_ALLOW_UNAUTH_VERIFY` is set to 'true'.
    Body: { "session_id": "cs_...", "user_id": "..." (optional) }
    """
    allow = os.getenv("DEV_ALLOW_UNAUTH_VERIFY", "false").lower() == "true"
    if not allow:
        raise HTTPException(status_code=403, detail="Dev verify disabled")

    session_id = payload.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")

    try:
        session = stripe.checkout.Session.retrieve(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        if session.payment_status != "paid":
            return {"success": False, "message": "Paiement non confirmé"}

        subscription = None
        if session.subscription:
            try:
                subscription = stripe.Subscription.retrieve(session.subscription)
            except Exception:
                subscription = None

        # Determine user_id from metadata or payload
        user_id = (session.metadata or {}).get("user_id") or payload.get("user_id")

        if SUPABASE_URL and SUPABASE_SERVICE_KEY and user_id:
            supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
            plan = (session.metadata or {}).get("plan") or "standard"

            supabase.table("subscriptions").insert({
                "user_id": user_id,
                "email": session.get("customer_email"),
                "stripe_session_id": session.get("id"),
                "stripe_subscription_id": session.get("subscription"),
                "stripe_customer_id": session.get("customer"),
                "plan_tier": plan,
                "status": "active",
            }).execute()

            supabase.table("user_profiles").upsert({
                "id": user_id,
                "subscription_tier": plan,
            }).execute()

            return {"success": True, "message": "Subscription persisted (dev)"}

        return {"success": False, "message": "Supabase not configured or user_id missing"}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Dev verify error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    event = None

    if STRIPE_WEBHOOK_SECRET:
        try:
            event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Webhook signature verification failed: {e}")
    else:
        # If no webhook secret, try to parse raw
        import json

        event = json.loads(payload)

    # Handle the checkout.session.completed event
    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        # Ensure we have line_items and subscription expanded
        try:
            if not session.get("line_items") or not session.get("subscription"):
                session = stripe.checkout.Session.retrieve(
                    session["id"],
                    expand=["line_items", "subscription"]
                )
        except Exception as e:
            print(f"Warning: could not expand session in webhook: {e}")

        user_id = session.get("metadata", {}).get("user_id")
        
        # Persist subscription to Supabase if configured (best-effort)
        if SUPABASE_URL and SUPABASE_SERVICE_KEY and user_id:
            try:
                from supabase import create_client

                supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
                
                # Extract plan from subscription - try different sources
                plan_tier = None
                
                # Helper to map by amount if price_id unknown
                def tier_from_amount(amount_cents: int):
                    if amount_cents is None:
                        return None
                    if amount_cents >= 29900:
                        return "premium"
                    if amount_cents >= 19900:
                        return "pro"
                    if amount_cents >= 9900:
                        return "standard"
                    return None

                # 1. Try from metadata (most reliable)
                if session.get("metadata", {}).get("plan"):
                    plan_tier = session["metadata"]["plan"]
                    print(f"📋 Plan from metadata: {plan_tier}")
                
                # 2. Try to get subscription and check price_id
                if not plan_tier and session.get("subscription"):
                    try:
                        subscription = stripe.Subscription.retrieve(session["subscription"])
                        if subscription and subscription.get("items", {}).get("data"):
                            price_id = subscription["items"]["data"][0].get("price", {}).get("id")
                            plan_tier = PRICE_TO_TIER.get(price_id)
                            amount = subscription["items"]["data"][0].get("price", {}).get("unit_amount")
                            if not plan_tier:
                                plan_tier = tier_from_amount(amount)
                            print(f"💰 Plan from subscription price_id {price_id}, amount {amount}: {plan_tier}")
                    except Exception as e:
                        print(f"Could not retrieve subscription: {e}")
                
                # 3. Try from line items
                if not plan_tier:
                    for li in session.get("line_items", {}).get("data", []):
                        price_id = li.get("price", {}).get("id")
                        amount = li.get("price", {}).get("unit_amount")
                        if price_id in PRICE_TO_TIER:
                            plan_tier = PRICE_TO_TIER[price_id]
                            print(f"🛒 Plan from line items price_id {price_id}: {plan_tier}")
                            break
                        if not plan_tier:
                            plan_tier = tier_from_amount(amount)
                            if plan_tier:
                                print(f"🛒 Plan inferred from amount {amount}: {plan_tier}")
                                break
                
                # Default to standard if still no plan found
                if not plan_tier:
                    plan_tier = "standard"
                    print(f"⚠️ Using default plan: {plan_tier}")
                
                # Insert to subscriptions table
                supabase.table("subscriptions").upsert({
                    "user_id": user_id,
                    "email": session.get("customer_email"),
                    "stripe_session_id": session.get("id"),
                    "stripe_subscription_id": session.get("subscription"),
                    "stripe_customer_id": session.get("customer"),
                    "plan_tier": plan_tier,
                    "status": subscription.status if 'subscription' in locals() and subscription else "active",
                }, on_conflict="user_id").execute()

                # Keep user profile in sync so the dashboard always sees the latest tier
                supabase.table("user_profiles").upsert({
                    "id": user_id,
                    "subscription_tier": plan_tier,
                    "updated_at": datetime.utcnow().isoformat()
                }, on_conflict="id").execute()
                
                print(f"✅ Subscription saved: user_id={user_id}, plan={plan_tier}")
            except Exception as e:
                print(f"Warning: could not persist subscription: {e}")

    return {"received": True}


# ============== AUTH & PROFILE ROUTES ==============

@app.post("/api/auth/check-username")
async def check_username(payload: dict):
    """Vérifie si un username est disponible"""
    username = payload.get("username", "").lower().strip()
    
    if not username or len(username) < 3:
        return {"available": False, "message": "Username doit avoir au moins 3 caractères"}
    
    if not username.replace("_", "").replace("-", "").isalnum():
        return {"available": False, "message": "Username doit contenir seulement lettres, chiffres, - et _"}
    
    try:
        from supabase import create_client
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        
        # Vérifier si username existe déjà
        result = supabase.table("user_profiles").select("id").eq("username", username).execute()
        
        if result.data:
            return {"available": False, "message": "Ce username est déjà pris"}
        
        return {"available": True, "message": "Username disponible"}
        
    except Exception as e:
        print(f"Error checking username: {e}")
        return {"available": False, "message": "Erreur lors de la vérification"}


@app.post("/api/auth/check-email")
async def check_email(payload: dict):
    """Vérifie si un email est disponible"""
    email = payload.get("email", "").lower().strip()
    
    try:
        from supabase import create_client
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        
        # Vérifier si email existe déjà dans auth.users
        result = supabase.table("user_profiles").select("id").eq("email", email).execute()
        
        if result.data:
            return {"available": False, "message": "Cet email est déjà utilisé"}
        
        return {"available": True, "message": "Email disponible"}
        
    except Exception as e:
        print(f"Error checking email: {e}")
        return {"available": False, "message": "Erreur lors de la vérification"}


@app.get("/api/auth/profile")
async def get_profile(request: Request):
    """Récupère le profil complet de l'utilisateur connecté"""
    user_id = get_user_id(request)
    
    try:
        from supabase import create_client
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        
        result = supabase.table("user_profiles").select("*").eq("id", user_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Profil non trouvé")
        
        profile = result.data[0]
        return {
            "id": profile["id"],
            "email": profile["email"],
            "first_name": profile["first_name"],
            "last_name": profile["last_name"],
            "username": profile["username"],
            "full_name": f"{profile['first_name']} {profile['last_name']}",
            "subscription_plan": profile["subscription_plan"],
            "subscription_status": profile["subscription_status"],
            "created_at": profile["created_at"]
        }
        
    except Exception as e:
        print(f"Error fetching profile: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/auth/profile")
async def update_profile(payload: dict, request: Request):
    """Met à jour le profil de l'utilisateur"""
    user_id = get_user_id(request)
    
    allowed_fields = ["first_name", "last_name", "bio", "avatar_url"]
    update_data = {k: v for k, v in payload.items() if k in allowed_fields}
    
    if not update_data:
        raise HTTPException(status_code=400, detail="Aucun champ à mettre à jour")
    
    try:
        from supabase import create_client
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        
        result = supabase.table("user_profiles").update(update_data).eq("id", user_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Profil non trouvé")
        
        return {"success": True, "message": "Profil mis à jour avec succès"}
        
    except Exception as e:
        print(f"Error updating profile: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/user/profile/update")
async def update_user_shopify(payload: dict, request: Request):
    """Met à jour les credentials Shopify de l'utilisateur"""
    user_id = get_user_id(request)
    
    shopify_url = payload.get("shopify_shop_url", "").strip()
    shopify_token = payload.get("shopify_access_token", "").strip()
    
    if not shopify_url or not shopify_token:
        raise HTTPException(status_code=400, detail="Shop URL et Access Token requis")
    
    # Valider le format du shop URL
    if not shopify_url.endswith('.myshopify.com'):
        raise HTTPException(status_code=400, detail="URL invalide. Format attendu: boutique.myshopify.com")
    
    try:
        from supabase import create_client
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        
        # Vérifier si une connexion existe déjà
        existing = supabase.table("shopify_connections").select("*").eq("user_id", user_id).execute()
        
        if existing.data:
            # Mettre à jour
            supabase.table("shopify_connections").update({
                "shop_domain": shopify_url,
                "access_token": shopify_token,
                "updated_at": "now()"
            }).eq("user_id", user_id).execute()
        else:
            # Créer
            supabase.table("shopify_connections").insert({
                "user_id": user_id,
                "shop_domain": shopify_url,
                "access_token": shopify_token
            }).execute()
        
        return {"success": True, "message": "Shopify connecté avec succès"}
        
    except Exception as e:
        print(f"Error saving Shopify credentials: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur Shopify: {str(e)}")


async def shopify_auth(shop: str, user_id: str):
    """Initiate Shopify OAuth flow.
    Example: /auth/shopify?shop=mystore.myshopify.com&user_id=abc123
    """
    if not SHOPIFY_API_KEY:
        raise HTTPException(status_code=500, detail="Shopify API key not configured")
    
    # Validate shop domain format
    if not shop or not shop.endswith('.myshopify.com'):
        raise HTTPException(status_code=400, detail="Invalid shop domain")
    
    # Build OAuth authorization URL
    auth_url = (
        f"https://{shop}/admin/oauth/authorize?"
        f"client_id={SHOPIFY_API_KEY}"
        f"&scope={SHOPIFY_SCOPES}"
        f"&redirect_uri={SHOPIFY_REDIRECT_URI}"
        f"&state={user_id}"  # Pass user_id as state for verification
    )
    
    return RedirectResponse(url=auth_url)


@app.get("/auth/shopify/callback")
async def shopify_callback(code: str, shop: str, state: str, hmac: str = None):
    """Handle Shopify OAuth callback and exchange code for access token."""
    if not SHOPIFY_API_KEY or not SHOPIFY_API_SECRET:
        raise HTTPException(status_code=500, detail="Shopify credentials not configured")
    
    user_id = state  # Retrieve user_id from state parameter
    
    # Exchange authorization code for access token
    token_url = f"https://{shop}/admin/oauth/access_token"
    payload = {
        "client_id": SHOPIFY_API_KEY,
        "client_secret": SHOPIFY_API_SECRET,
        "code": code
    }
    
    try:
        response = requests.post(token_url, json=payload)
        response.raise_for_status()
        data = response.json()
        access_token = data.get("access_token")
        
        if not access_token:
            raise HTTPException(status_code=500, detail="Failed to obtain access token")
        
        # Store access token in Supabase for this user
        if SUPABASE_URL and SUPABASE_SERVICE_KEY:
            from supabase import create_client
            supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
            
            # Check if user already has a Shopify connection
            existing = supabase.table("shopify_connections").select("*").eq("user_id", user_id).execute()
            
            if existing.data:
                # Update existing connection
                supabase.table("shopify_connections").update({
                    "shop_domain": shop,
                    "access_token": access_token,
                    "updated_at": "now()"
                }).eq("user_id", user_id).execute()
            else:
                # Create new connection
                supabase.table("shopify_connections").insert({
                    "user_id": user_id,
                    "shop_domain": shop,
                    "access_token": access_token
                }).execute()
        
        # Redirect back to frontend dashboard with success
        frontend_url = os.getenv("FRONTEND_ORIGIN", "https://fdkng.github.io/SHOPBRAIN_AI")
        return RedirectResponse(url=f"{frontend_url}/#/dashboard?shopify=connected")
        
    except Exception as e:
        print(f"Error in Shopify OAuth callback: {e}")
        raise HTTPException(status_code=500, detail=f"OAuth failed: {str(e)}")


@app.post("/api/shopify/test-connection")
async def test_shopify_connection(payload: dict, request: Request):
    """🧪 TEST: Valide la connexion Shopify AVANT de l'utiliser
    
    Cette fonction teste:
    1. Format du shop URL
    2. Validité du token (connexion API)
    3. Permissions du token
    4. Nombre de produits disponibles
    5. Structure des données
    """
    user_id = get_user_id(request)
    
    shop_url = payload.get("shopify_shop_url", "").strip()
    access_token = payload.get("shopify_access_token", "").strip()
    
    print(f"🔍 [SHOPIFY TEST] Testing connection for user {user_id}")
    print(f"   Shop: {shop_url}")
    print(f"   Token: {access_token[:10]}...{access_token[-5:]}")
    
    # ========================================================================
    # TEST 1: Validation du format
    # ========================================================================
    
    test_results = {
        "user_id": user_id,
        "shop_url": shop_url,
        "tests": {}
    }
    
    if not shop_url or not access_token:
        print(f"❌ TEST 1 FAILED: Shop URL ou Token vide")
        test_results["tests"]["format_validation"] = {
            "status": "failed",
            "error": "Shop URL et Access Token requis"
        }
        raise HTTPException(status_code=400, detail="Shop URL et Access Token requis")
    
    if not shop_url.endswith('.myshopify.com'):
        print(f"❌ TEST 1 FAILED: Format invalide - {shop_url}")
        test_results["tests"]["format_validation"] = {
            "status": "failed",
            "error": f"Format invalide. Attendu: something.myshopify.com, reçu: {shop_url}"
        }
        raise HTTPException(status_code=400, detail=f"Format URL invalide: {shop_url}")
    
    print(f"✅ TEST 1 PASSED: Format validé")
    test_results["tests"]["format_validation"] = {"status": "passed"}
    
    # ========================================================================
    # TEST 2: Validation du Token (essayer de récupérer des produits)
    # ========================================================================
    
    print(f"🔐 TEST 2: Validation du token...")
    
    try:
        products_url = f"https://{shop_url}/admin/api/2024-10/products.json?limit=1"
        headers = {
            "X-Shopify-Access-Token": access_token,
            "Content-Type": "application/json"
        }
        
        response = requests.get(products_url, headers=headers, timeout=15)
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 401:
            print(f"❌ TEST 2 FAILED: Token invalide ou expiré")
            test_results["tests"]["token_validation"] = {
                "status": "failed",
                "error": "Token invalide, expiré ou révoqué",
                "http_status": 401
            }
            raise HTTPException(status_code=401, detail="Token Shopify invalide ou expiré")
        
        elif response.status_code == 404:
            print(f"❌ TEST 2 FAILED: Shop non trouvé")
            test_results["tests"]["token_validation"] = {
                "status": "failed",
                "error": f"Boutique {shop_url} non trouvée",
                "http_status": 404
            }
            raise HTTPException(status_code=404, detail=f"Boutique Shopify non trouvée: {shop_url}")
        
        elif response.status_code != 200:
            print(f"❌ TEST 2 FAILED: Erreur API {response.status_code}")
            error_text = response.text[:200]
            test_results["tests"]["token_validation"] = {
                "status": "failed",
                "error": f"Erreur Shopify API: {error_text}",
                "http_status": response.status_code
            }
            raise HTTPException(status_code=response.status_code, detail=f"Erreur Shopify: {error_text}")
        
        print(f"✅ TEST 2 PASSED: Token valide et actif")
        test_results["tests"]["token_validation"] = {"status": "passed"}
        
    except requests.exceptions.Timeout:
        print(f"❌ TEST 2 FAILED: Timeout")
        test_results["tests"]["token_validation"] = {
            "status": "failed",
            "error": "Timeout - la boutique prend trop longtemps à répondre"
        }
        raise HTTPException(status_code=408, detail="Timeout Shopify API")
    except requests.exceptions.ConnectionError as ce:
        print(f"❌ TEST 2 FAILED: Connexion impossible - {ce}")
        test_results["tests"]["token_validation"] = {
            "status": "failed",
            "error": f"Impossible de se connecter à Shopify: {str(ce)}"
        }
        raise HTTPException(status_code=503, detail="Impossible de se connecter à Shopify")
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ TEST 2 FAILED: Exception - {e}")
        test_results["tests"]["token_validation"] = {
            "status": "failed",
            "error": str(e)
        }
        raise HTTPException(status_code=500, detail=f"Erreur validation token: {str(e)}")
    
    # ========================================================================
    # TEST 3: Vérifier les permissions du token
    # ========================================================================
    
    print(f"🔒 TEST 3: Vérification des permissions...")
    
    try:
        # Essayer de récupérer les informations du shop
        shop_info_url = f"https://{shop_url}/admin/api/2024-10/shop.json"
        response = requests.get(shop_info_url, headers=headers, timeout=15)
        
        if response.status_code == 200:
            shop_info = response.json().get("shop", {})
            print(f"✅ TEST 3 PASSED: Token a accès aux infos du shop")
            print(f"   Shop name: {shop_info.get('name')}")
            print(f"   Plan: {shop_info.get('plan_name')}")
            test_results["tests"]["permissions"] = {
                "status": "passed",
                "shop_name": shop_info.get('name'),
                "plan": shop_info.get('plan_name')
            }
        else:
            print(f"⚠️ TEST 3 WARNING: Permissions limitées (status {response.status_code})")
            test_results["tests"]["permissions"] = {
                "status": "warning",
                "message": "Token a accès aux produits mais pas aux infos du shop"
            }
    
    except Exception as e:
        print(f"⚠️ TEST 3 WARNING: Impossible de vérifier permissions - {e}")
        test_results["tests"]["permissions"] = {
            "status": "warning",
            "message": str(e)
        }
    
    # ========================================================================
    # TEST 4: Récupérer et analyser les produits
    # ========================================================================
    
    print(f"📦 TEST 4: Récupération des produits...")
    
    try:
        products_url_all = f"https://{shop_url}/admin/api/2024-10/products.json?limit=250"
        response = requests.get(products_url_all, headers=headers, timeout=15)
        
        if response.status_code != 200:
            print(f"❌ TEST 4 FAILED: Impossible de récupérer les produits")
            test_results["tests"]["products_fetch"] = {
                "status": "failed",
                "error": f"HTTP {response.status_code}",
                "http_status": response.status_code
            }
            raise HTTPException(status_code=response.status_code, detail="Impossible de récupérer les produits")
        
        products_data = response.json()
        products = products_data.get("products", [])
        
        total_variants = sum(len(p.get("variants", [])) for p in products)
        total_images = sum(len(p.get("images", [])) for p in products)
        
        print(f"✅ TEST 4 PASSED: {len(products)} produit(s) trouvé(s)")
        print(f"   Variantes totales: {total_variants}")
        print(f"   Images totales: {total_images}")
        
        test_results["tests"]["products_fetch"] = {
            "status": "passed",
            "product_count": len(products),
            "total_variants": total_variants,
            "total_images": total_images
        }
        
        # Afficher quelques produits
        sample_products = []
        for p in products[:3]:
            sample_products.append({
                "id": p.get("id"),
                "title": p.get("title"),
                "variants_count": len(p.get("variants", [])),
                "price": p.get("variants", [{}])[0].get("price") if p.get("variants") else None
            })
        
        test_results["tests"]["products_fetch"]["sample_products"] = sample_products
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ TEST 4 FAILED: {e}")
        test_results["tests"]["products_fetch"] = {
            "status": "failed",
            "error": str(e)
        }
        raise HTTPException(status_code=500, detail=f"Erreur récupération produits: {str(e)}")
    
    # ========================================================================
    # TEST 5: Vérifier la structure des données
    # ========================================================================
    
    print(f"📊 TEST 5: Vérification de la structure...")
    
    data_checks = {
        "tous_produits_ont_titre": all(p.get('title') for p in products),
        "tous_produits_ont_variantes": all(len(p.get('variants', [])) > 0 for p in products),
        "tous_produits_ont_prix": all(
            any(v.get('price') for v in p.get('variants', [])) 
            for p in products
        ) if products else False,
        "produits_ont_description": sum(1 for p in products if p.get('body_html')) / len(products) if products else 0,
    }
    
    print(f"✅ TEST 5 PASSED: Vérification des données complétée")
    for check, result in data_checks.items():
        print(f"   • {check}: {result}")
    
    test_results["tests"]["data_structure"] = {
        "status": "passed",
        "checks": data_checks
    }
    
    # ========================================================================
    # RÉSULTAT FINAL
    # ========================================================================
    
    print(f"")
    print(f"=" * 60)
    print(f"✅ TOUS LES TESTS RÉUSSIS!")
    print(f"=" * 60)
    
    test_results["status"] = "success"
    test_results["message"] = f"Connexion Shopify valide! {len(products)} produit(s) accessible."
    test_results["ready_to_save"] = True
    
    return test_results


@app.get("/api/shopify/products")
async def get_shopify_products(request: Request, limit: int = 250):
    """📦 Récupère les produits de la boutique Shopify connectée
    
    Cette fonction:
    1. Vérifie que l'utilisateur a une boutique connectée
    2. Récupère les produits avec TOUS les détails
    3. Les organise de manière facile à utiliser
    4. Inclut les infos d'optimisation possibles
    """
    user_id = get_user_id(request)
    
    print(f"📦 [GET PRODUCTS] User {user_id} requesting products (limit={limit})")
    
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print(f"❌ Supabase not configured")
        raise HTTPException(status_code=500, detail="Supabase not configured")
    
    try:
        from supabase import create_client
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        
        # Get user's Shopify connection
        print(f"🔍 Fetching Shopify connection for user {user_id}...")
        connection = supabase.table("shopify_connections").select("*").eq("user_id", user_id).execute()
        
        if not connection.data:
            print(f"❌ No Shopify connection found for user {user_id}")
            raise HTTPException(status_code=404, detail="Aucune boutique Shopify connectée. Veuillez vous connecter d'abord.")
        
        shop_domain = connection.data[0]["shop_domain"]
        access_token = connection.data[0]["access_token"]
        
        print(f"✅ Found connection: {shop_domain}")
        
        # Fetch products from Shopify API
        products_url = f"https://{shop_domain}/admin/api/2024-10/products.json?limit={limit}"
        headers = {
            "X-Shopify-Access-Token": access_token,
            "Content-Type": "application/json"
        }
        
        print(f"📡 Fetching from: {products_url}")
        response = requests.get(products_url, headers=headers, timeout=30)
        
        # Better error handling
        if response.status_code == 401:
            print(f"❌ Token invalid or expired")
            raise HTTPException(status_code=401, detail="Token Shopify expiré ou invalide. Reconnectez-vous.")
        
        elif response.status_code == 404:
            print(f"❌ Shop not found: {shop_domain}")
            raise HTTPException(status_code=404, detail=f"Boutique Shopify non trouvée: {shop_domain}")
        
        elif response.status_code != 200:
            error_text = response.text[:300]
            print(f"❌ Shopify API error: {response.status_code} - {error_text}")
            raise HTTPException(status_code=response.status_code, detail=f"Erreur Shopify: {error_text}")
        
        products_data = response.json()
        products = products_data.get("products", [])
        
        print(f"✅ Retrieved {len(products)} products")
        
        # Transform products to be more useful for optimization
        transformed_products = []
        for p in products:
            variants = p.get("variants", [])
            images = p.get("images", [])
            
            # Get first variant's price as "main price"
            main_price = variants[0].get("price") if variants else None
            
            transformed = {
                "id": p.get("id"),
                "title": p.get("title"),
                "handle": p.get("handle"),
                "body_html": p.get("body_html", ""),
                "product_type": p.get("product_type", ""),
                "vendor": p.get("vendor", ""),
                "created_at": p.get("created_at"),
                "published_at": p.get("published_at"),
                "main_price": main_price,
                "variants_count": len(variants),
                "images_count": len(images),
                "featured_image": p.get("featured_image", {}).get("src") if p.get("featured_image") else None,
                "status": "published" if p.get("published_at") else "draft",
                
                # Include full details for optimization
                "variants": [
                    {
                        "id": v.get("id"),
                        "title": v.get("title"),
                        "sku": v.get("sku"),
                        "price": v.get("price"),
                        "compare_at_price": v.get("compare_at_price"),
                        "inventory_quantity": v.get("inventory_quantity"),
                        "weight": v.get("weight")
                    }
                    for v in variants
                ],
                "images": [
                    {
                        "id": img.get("id"),
                        "src": img.get("src"),
                        "alt": img.get("alt")
                    }
                    for img in images[:5]  # Limit to 5 images per product
                ]
            }
            
            transformed_products.append(transformed)
        
        # Calculate statistics
        total_variants = sum(p["variants_count"] for p in transformed_products)
        total_images = sum(p["images_count"] for p in transformed_products)
        published_count = sum(1 for p in transformed_products if p["status"] == "published")
        
        print(f"📊 Stats: {len(transformed_products)} products, {total_variants} variants, {total_images} images")
        
        return {
            "success": True,
            "shop": shop_domain,
            "product_count": len(transformed_products),
            "statistics": {
                "total_products": len(transformed_products),
                "published_products": published_count,
                "draft_products": len(transformed_products) - published_count,
                "total_variants": total_variants,
                "total_images": total_images,
                "average_variants_per_product": total_variants / len(transformed_products) if transformed_products else 0,
                "average_images_per_product": total_images / len(transformed_products) if transformed_products else 0,
            },
            "products": transformed_products
        }
        
    except HTTPException:
        raise
    except requests.exceptions.Timeout:
        print(f"❌ Timeout: Shopify API took too long")
        raise HTTPException(status_code=408, detail="Timeout - Shopify API prend trop longtemps à répondre")
    except requests.exceptions.ConnectionError:
        print(f"❌ Connection error: Cannot reach Shopify")
        raise HTTPException(status_code=503, detail="Impossible de se connecter à Shopify")
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")



@app.post("/api/analyze-product")
async def analyze_product(payload: dict, request: Request):
    """Analyze a Shopify product with OpenAI and return optimization suggestions.
    Expects: {"product_id": "123", "title": "...", "description": "...", "price": "99.99"}
    """
    user_id = get_user_id(request)
    
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OpenAI not configured")
    
    product_id = payload.get("product_id")
    title = payload.get("title", "")
    description = payload.get("description", "")
    price = payload.get("price", "")
    
    prompt = f"""Tu es un expert en e-commerce et optimisation de fiches produits Shopify.

Produit à analyser:
- Titre: {title}
- Description: {description}
- Prix: {price}

Fournis une analyse complète au format JSON avec ces clés:
- "optimized_title": Un titre optimisé pour le SEO et les conversions (max 70 caractères)
- "optimized_description": Une description améliorée et persuasive (2-3 paragraphes)
- "seo_keywords": Array de 5-8 mots-clés pertinents
- "cross_sell": Array de 3 suggestions de produits complémentaires
- "price_recommendation": Analyse du pricing avec suggestion (string)
- "conversion_tips": Array de 3-5 conseils pour améliorer le taux de conversion

Réponds uniquement avec du JSON valide, sans markdown ni commentaires."""

    try:
        # OpenAI 1.0+ API
        client = (OpenAI(api_key=OPENAI_API_KEY) if OpenAI else openai.OpenAI(api_key=OPENAI_API_KEY))
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "Tu es un expert e-commerce spécialisé en optimisation Shopify."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=1000,
            temperature=0.7
        )
        
        result_text = response.choices[0].message.content.strip()
        
        # Parse JSON response
        try:
            analysis = json.loads(result_text)
        except:
            # Fallback if not valid JSON
            analysis = {
                "optimized_title": title,
                "optimized_description": result_text,
                "seo_keywords": [],
                "cross_sell": [],
                "price_recommendation": "Analyse non disponible",
                "conversion_tips": []
            }
        
        # Store analysis in Supabase
        if SUPABASE_URL and SUPABASE_SERVICE_KEY:
            from supabase import create_client
            supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
            
            supabase.table("product_analyses").insert({
                "user_id": user_id,
                "shopify_product_id": product_id,
                "original_title": title,
                "original_description": description,
                "analysis_result": analysis
            }).execute()
        
        return {"success": True, "analysis": analysis}
        
    except Exception as e:
        print(f"Error analyzing product: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class ChatRequest(BaseModel):
    message: str
    context: str = None  # Optionnel: contexte (ex: product_id, store info)


@app.post("/api/ai/chat")
async def chat_with_ai(req: ChatRequest, request: Request):
    """💬 Chat avec l'IA - Réponses à des questions sur e-commerce, produits, etc."""
    user_id = get_user_id(request)
    print(f"🔔 /api/ai/chat called. user_id={user_id}")
    
    if not OPENAI_API_KEY:
        print(f"❌ OPENAI_API_KEY not set!")
        raise HTTPException(status_code=500, detail="OpenAI not configured")
    
    # Sanity check: ensure no control characters in key
    if any(ord(ch) < 32 for ch in OPENAI_API_KEY):
        print(f"❌ OPENAI_API_KEY contains control characters! Aborting.")
        raise HTTPException(status_code=500, detail="OpenAI key configuration error")
    
    message = req.message.strip()
    context = req.context or ""
    
    if not message:
        raise HTTPException(status_code=400, detail="Message vide")
    
    # Limiter à 500 caractères pour éviter les abus
    if len(message) > 500:
        raise HTTPException(status_code=400, detail="Message trop long (max 500 caractères)")
    
    system_prompt = SHOPBRAIN_EXPERT_SYSTEM

    try:
        # Construire le prompt avec contexte si fourni
        full_message = message
        if context:
            full_message = f"Contexte: {context}\n\nQuestion: {message}"
        
        # OpenAI 1.0+ API - utiliser le client
        print(f"🔍 Creating OpenAI client with API key starting with: {OPENAI_API_KEY[:10]}...")
        client = (OpenAI(api_key=OPENAI_API_KEY) if OpenAI else openai.OpenAI(api_key=OPENAI_API_KEY))
        print(f"✅ OpenAI client created")
        try:
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": full_message}
                ],
                max_tokens=500,
                temperature=0.7
            )
            print(f"✅ OpenAI response received")
            assistant_message = response.choices[0].message.content.strip()
        except Exception as ce:
            print(f"⚠️ OpenAI client call failed: {type(ce).__name__}: {str(ce)}. Trying direct HTTP fallback...")
            try:
                payload = {
                    "model": "gpt-4o-mini",
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": full_message}
                    ],
                    "max_tokens": 500,
                    "temperature": 0.7
                }
                r = requests.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {OPENAI_API_KEY}",
                        "Content-Type": "application/json"
                    },
                    data=json.dumps(payload),
                    timeout=20,
                )
                if r.status_code == 200:
                    resp_json = r.json()
                    assistant_message = resp_json["choices"][0]["message"]["content"].strip()
                    print("✅ Fallback HTTP call succeeded")
                else:
                    print(f"❌ Fallback HTTP error: status={r.status_code} body={r.text[:200]}")
                    raise HTTPException(status_code=500, detail="Erreur IA: OpenAI HTTP fallback failed")
            except Exception as he:
                print(f"❌ Fallback HTTP exception: {type(he).__name__}: {str(he)}")
                raise HTTPException(status_code=500, detail="Erreur IA: OpenAI HTTP fallback exception")
        
        return {
            "success": True,
            "message": assistant_message,
            "user_id": user_id
        }
        
    except Exception as e:
        print(f"❌ Error in chat: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Erreur IA: {str(e)}")


# ============================================================================
@app.get("/api/ai/diag")
async def ai_diag():
    """Detailed diagnostics for OpenAI key and header construction."""
    key_after_sanitize = OPENAI_API_KEY
    header_value = f"Bearer {key_after_sanitize}"
    
    return {
        "raw_env_var_len": len(OPENAI_API_KEY_RAW or ""),
        "after_regex_len": len(key_after_sanitize),
        "key_starts_with": key_after_sanitize[:10] if key_after_sanitize else "EMPTY",
        "key_ends_with": key_after_sanitize[-10:] if key_after_sanitize else "EMPTY",
        "header_starts": header_value[:30],
        "header_ends": repr(header_value[-30:]),  # repr to show any hidden chars
        "header_contains_newline": "\n" in header_value,
        "header_contains_carriage_return": "\r" in header_value,
        "header_byte_check": repr(header_value.encode('utf-8')[-30:])  # Show bytes at end
    }

# NOUVEAUX ENDPOINTS - MOTEUR IA SHOPBRAIN
@app.get("/api/ai/ping")
async def ai_ping():
    """Diagnostic léger pour vérifier la connectivité OpenAI et la configuration.
    Ne nécessite pas d'authentification. Retourne des infos basiques sans secrets."""
    status = {
        "has_env_key": bool(OPENAI_API_KEY),
        "key_len": len(OPENAI_API_KEY or ""),
        "has_newline": ("\n" in (OPENAI_API_KEY or "")) or ("\r" in (OPENAI_API_KEY or "")),
        # Minimal, non-sensitive diagnostics to help identify trailing characters
        "key_tail_preview": repr((OPENAI_API_KEY or "")[-5:]) if OPENAI_API_KEY else None,
        "key_tail_ord": ord((OPENAI_API_KEY or "")[ -1 ]) if OPENAI_API_KEY else None,
    }
    if not OPENAI_API_KEY:
        print("❌ AI ping: OPENAI_API_KEY missing")
        status["ok"] = False
        status["error"] = "OPENAI_API_KEY missing"
        return status

    try:
        print(f"🔍 AI ping: creating client with key prefix {OPENAI_API_KEY[:10]}...")
        # Prefer explicit import for clarity with v1 client
        try:
            from openai import OpenAI
            client = OpenAI(api_key=OPENAI_API_KEY)
        except Exception:
            # Fallback to module attribute if needed
            client = openai.OpenAI(api_key=OPENAI_API_KEY)

        # Simple request to validate connectivity/authorization
        models = client.models.list()
        count = len(getattr(models, "data", []) or [])
        print(f"✅ AI ping success. models_count={count}")
        status["ok"] = True
        status["models_count"] = count
        return status
    except Exception as e:
        print(f"❌ AI ping error: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        status["ok"] = False
        status["error"] = f"{type(e).__name__}: {str(e)}"
        # Secondary probe via direct HTTP to detect TLS/DNS issues
        try:
            resp = requests.get(
                "https://api.openai.com/v1/models",
                headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
                timeout=10,
            )
            status["http_probe_status"] = resp.status_code
            try:
                status["http_probe_body"] = resp.json()
            except Exception:
                status["http_probe_body"] = resp.text[:200]
        except Exception as pe:
            status["http_probe_error"] = f"{type(pe).__name__}: {str(pe)}"
        # Generic egress probe (Google)
        try:
            g = requests.get("https://www.google.com", timeout=10)
            status["google_probe_status"] = g.status_code
        except Exception as ge:
            status["google_probe_error"] = f"{type(ge).__name__}: {str(ge)}"
        return status
# ============================================================================

# Initialize AI Engine
ai_engine = None

def get_ai_engine():
    """Lazy load AI engine avec config Shopify si disponible"""
    global ai_engine
    if ai_engine is None:
        shopify_config = None
        if SHOPIFY_ACCESS_TOKEN:
            # Format: shop-name.myshopify.com
            shopify_config = {
                'shop_url': os.getenv('SHOPIFY_SHOP_URL', ''),
                'access_token': SHOPIFY_ACCESS_TOKEN
            }
        ai_engine = ShopBrainAI(OPENAI_API_KEY, shopify_config)
    return ai_engine


class AnalyzeStoreRequest(BaseModel):
    products: list
    analytics: dict
    tier: str  # standard, pro, premium


@app.post("/api/ai/analyze-store")
async def analyze_store_endpoint(req: AnalyzeStoreRequest, request: Request):
    """
    🧠 Analyse complète de la boutique avec toutes les fonctionnalités IA
    selon le tier de l'abonnement
    """
    try:
        user_id = get_user_id(request)
        engine = get_ai_engine()
        
        # Limite de produits selon tier
        limits = {'standard': 50, 'pro': 500, 'premium': None}
        limit = limits.get(req.tier, 50)
        products = req.products[:limit] if limit else req.products
        
        analysis = engine.analyze_store(products, req.analytics, req.tier)
        
        return {
            "success": True,
            "tier": req.tier,
            "products_analyzed": len(products),
            "analysis": analysis
        }
    
    except Exception as e:
        print(f"Error in analyze_store: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class OptimizeContentRequest(BaseModel):
    product: dict
    tier: str


@app.post("/api/ai/optimize-content")
async def optimize_content_endpoint(req: OptimizeContentRequest, request: Request):
    """
    📝 Optimise le contenu d'un produit (titre, description, SEO)
    Standard: Titre uniquement
    Pro/Premium: Titre + Description + SEO
    """
    try:
        user_id = get_user_id(request)
        engine = get_ai_engine()
        
        result = {
            "product_id": req.product.get('id'),
            "tier": req.tier
        }
        
        # Tous les tiers: nouveau titre
        result['new_title'] = engine.content_gen.generate_title(req.product, req.tier)
        
        # Pro et Premium: description
        if req.tier in ['pro', 'premium']:
            result['new_description'] = engine.content_gen.generate_description(req.product, req.tier)
        
        # Premium: SEO metadata
        if req.tier == 'premium':
            result['seo_metadata'] = engine.content_gen.generate_seo_metadata(req.product)
        
        return {"success": True, "optimization": result}
    
    except Exception as e:
        print(f"Error optimizing content: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class OptimizePriceRequest(BaseModel):
    product: dict
    analytics: dict
    tier: str


@app.post("/api/ai/optimize-price")
async def optimize_price_endpoint(req: OptimizePriceRequest, request: Request):
    """
    💰 Suggère un prix optimal pour un produit
    Standard: Suggestions simples
    Pro: Optimisation avancée
    Premium: IA prédictive
    """
    try:
        user_id = get_user_id(request)
        engine = get_ai_engine()
        
        recommendation = engine.price_opt.suggest_price_adjustment(
            req.product, req.analytics, req.tier
        )
        
        return {"success": True, "price_recommendation": recommendation}
    
    except Exception as e:
        print(f"Error optimizing price: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class RecommendationsRequest(BaseModel):
    product: dict
    all_products: list
    tier: str


@app.post("/api/ai/recommendations")
async def get_recommendations_endpoint(req: RecommendationsRequest, request: Request):
    """
    🛒 Génère des recommandations Cross-sell & Upsell
    Pro et Premium uniquement
    """
    try:
        user_id = get_user_id(request)
        
        if req.tier not in ['pro', 'premium']:
            raise HTTPException(status_code=403, detail="Fonctionnalité disponible à partir du plan Pro")
        
        engine = get_ai_engine()
        
        cross_sell = engine.recommender.generate_cross_sell(
            req.product, req.all_products, req.tier
        )
        upsell = engine.recommender.generate_upsell(
            req.product, req.all_products, req.tier
        )
        
        return {
            "success": True,
            "product_id": req.product.get('id'),
            "cross_sell": cross_sell,
            "upsell": upsell
        }
    
    except Exception as e:
        print(f"Error generating recommendations: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class ExecuteActionsRequest(BaseModel):
    optimization_plan: list
    tier: str


@app.post("/api/ai/execute-actions")
async def execute_actions_endpoint(req: ExecuteActionsRequest, request: Request):
    """
    ⚡ Exécute automatiquement les optimisations (Premium uniquement)
    Change prix, images, contenu, stock
    """
    try:
        user_id = get_user_id(request)
        
        if req.tier != 'premium':
            raise HTTPException(status_code=403, detail="Actions automatiques disponibles uniquement pour Premium")
        
        engine = get_ai_engine()
        result = engine.execute_optimizations(req.optimization_plan, req.tier)
        
        return {"success": True, "execution_result": result}
    
    except Exception as e:
        print(f"Error executing actions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class GenerateReportRequest(BaseModel):
    analytics_data: dict
    tier: str
    report_type: str = "weekly"  # weekly, daily, monthly


@app.post("/api/ai/generate-report")
async def generate_report_endpoint(req: GenerateReportRequest, request: Request):
    """
    📊 Génère un rapport d'analyse
    Pro: Rapports hebdomadaires
    Premium: Rapports quotidiens + PDF/Email
    """
    try:
        user_id = get_user_id(request)
        
        engine = get_ai_engine()
        report = engine.generate_report(req.analytics_data, req.tier, req.report_type)
        
        return {"success": True, "report": report}
    
    except Exception as e:
        print(f"Error generating report: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/ai/capabilities/{tier}")
async def get_capabilities_endpoint(tier: str):
    """
    ℹ️ Retourne les capacités disponibles pour un tier
    """
    try:
        engine = get_ai_engine()
        capabilities = engine.get_tier_capabilities(tier)
        
        return {
            "success": True,
            "tier": tier,
            "capabilities": capabilities
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# SUBSCRIPTION & USER MANAGEMENT
# ============================================================================

class CheckSubscriptionRequest(BaseModel):
    user_id: str


@app.post("/api/subscription/status")
async def check_subscription_status(request: Request):
    """✅ Vérifie le statut d'abonnement de l'utilisateur"""
    print(f"🔍 [v5b2f458] check_subscription_status called")
    try:
        try:
            user_id = get_user_id(request)
        except HTTPException as http_err:
            print(f"❌ get_user_id failed with HTTPException: {http_err.detail}")
            raise http_err
        except Exception as auth_err:
            print(f"❌ get_user_id failed with exception: {auth_err}")
            raise HTTPException(status_code=401, detail=f"Auth failed: {str(auth_err)}")
            
        print(f"🔍 User ID extracted: {user_id}")
        
        if SUPABASE_URL and SUPABASE_SERVICE_KEY:
            # Check in database first (from webhook)
            subscription = None
            try:
                # Use HTTP directly to avoid SDK parsing issues with UUID filters
                import urllib.parse
                # Inclure les statuts actifs ou en cours (trialing, past_due, incomplete)
                filter_str = f'user_id=eq.{user_id}&status=in.(active,trialing,past_due,incomplete,incomplete_expired)'
                
                headers = {
                    'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
                    'apikey': SUPABASE_SERVICE_KEY,
                    'Content-Type': 'application/json',
                    'Range': '0-0',  # Limit to first row
                    'Range-Unit': 'items'
                }
                
                resp = requests.get(
                    f'{SUPABASE_URL}/rest/v1/subscriptions?{filter_str}&order=created_at.desc',
                    headers=headers,
                    timeout=5
                )
                
                if resp.status_code == 200:
                    data = resp.json()
                    if isinstance(data, list) and len(data) > 0:
                        subscription = data[0]
                        print(f"✅ Found subscription via HTTP query: {subscription.get('id')}")
                else:
                    print(f"HTTP query error: {resp.status_code} - {resp.text}")
            except Exception as e:
                print(f"Query error (HTTP): {e}")
                subscription = None
            
            if subscription:
                plan = subscription.get('plan_tier') or 'standard'
                
                capabilities = {
                    'standard': {
                        'product_limit': 50,
                        'features': ['product_analysis', 'title_optimization', 'price_suggestions']
                    },
                    'pro': {
                        'product_limit': 500,
                        'features': ['product_analysis', 'content_generation', 'cross_sell', 'reports']
                    },
                    'premium': {
                        'product_limit': None,
                        'features': ['product_analysis', 'content_generation', 'cross_sell', 'automated_actions', 'reports', 'predictions']
                    }
                }
                
                return {
                    'success': True,
                    'has_subscription': True,
                    'plan': plan,
                    'status': subscription.get('status', 'active'),
                    'started_at': subscription.get('created_at'),
                    'capabilities': capabilities.get(plan, {})
                }

            # Fallback: use user_profiles if no subscription row found yet (e.g., race condition)
            try:
                profile_resp = requests.get(
                    f"{SUPABASE_URL}/rest/v1/user_profiles?id=eq.{user_id}",
                    headers={
                        'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
                        'apikey': SUPABASE_SERVICE_KEY,
                        'Content-Type': 'application/json',
                        'Range': '0-0',
                        'Range-Unit': 'items'
                    },
                    timeout=5
                ) if SUPABASE_URL and SUPABASE_SERVICE_KEY else None

                if profile_resp and profile_resp.status_code == 200:
                    profile_data = profile_resp.json()
                    if isinstance(profile_data, list) and len(profile_data) > 0:
                        profile = profile_data[0]
                        plan = profile.get('subscription_tier', 'standard')
                        capabilities = {
                            'standard': {
                                'product_limit': 50,
                                'features': ['product_analysis', 'title_optimization', 'price_suggestions']
                            },
                            'pro': {
                                'product_limit': 500,
                                'features': ['product_analysis', 'content_generation', 'cross_sell', 'reports']
                            },
                            'premium': {
                                'product_limit': None,
                                'features': ['product_analysis', 'content_generation', 'cross_sell', 'automated_actions', 'reports', 'predictions']
                            }
                        }
                        return {
                            'success': True,
                            'has_subscription': plan is not None,
                            'plan': plan,
                            'status': profile.get('subscription_status', 'active'),
                            'started_at': profile.get('created_at'),
                            'capabilities': capabilities.get(plan, {})
                        }
            except Exception as e:
                print(f"Profile fallback error: {e}")
            
            # Not found in database - return immediately (don't check Stripe, it's too slow)
            print(f"ℹ️ No active subscription found for user {user_id}")
            return {
                'success': True,
                'has_subscription': False,
                'plan': 'free'
            }
    
    except HTTPException:
        raise  # Re-raise HTTP exceptions
    except Exception as e:
        print(f"❌ Error checking subscription: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


class CreateCheckoutSessionRequest(BaseModel):
    plan: str
    email: str


@app.post("/api/subscription/create-session")
async def create_checkout_session(req: CreateCheckoutSessionRequest, request: Request):
    """Crée une session Stripe checkout"""
    try:
        user_id = get_user_id(request)
        plan = req.plan
        email = req.email
        
        if plan not in STRIPE_PLANS:
            raise HTTPException(status_code=400, detail="Plan invalide")
        
        price_id = STRIPE_PLANS[plan]
        frontend_url = "https://fdkng.github.io/SHOPBRAIN_AI"
        
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            mode="subscription",
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=f"{frontend_url}/#dashboard?session_id={{CHECKOUT_SESSION_ID}}&success=true",
            cancel_url=f"{frontend_url}/#pricing",
            customer_email=email,
            allow_promotion_codes=True,  # ✅ Active les codes promo
            metadata={
                "user_id": user_id,
                "plan": plan
            }
        )
        
        return {
            "success": True,
            "session_id": session.id,
            "url": session.url
        }
    
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class VerifyCheckoutRequest(BaseModel):
    session_id: str


@app.post("/api/subscription/verify-session")
async def verify_checkout_session(req: VerifyCheckoutRequest, request: Request):
    """✅ Vérifie le paiement et crée l'abonnement"""
    try:
        user_id = get_user_id(request)
        
        session = stripe.checkout.Session.retrieve(req.session_id, expand=["line_items", "subscription"])
        
        if session.payment_status != "paid":
            return {
                "success": False,
                "message": "Paiement non confirmé"
            }
        
        subscription = stripe.Subscription.retrieve(session.subscription)
        
        if SUPABASE_URL and SUPABASE_SERVICE_KEY:
            supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
            
            # Determine plan from the most reliable source: metadata -> price_id -> amount
            plan = session.metadata.get("plan") if session.metadata else None

            def tier_from_amount(amount_cents: int | None):
                if amount_cents is None:
                    return None
                if amount_cents >= 29900:
                    return "premium"
                if amount_cents >= 19900:
                    return "pro"
                if amount_cents >= 9900:
                    return "standard"
                return None

            # Try subscription item price_id
            if not plan and subscription:
                items = subscription.get("items", {}).get("data", [])
                if items:
                    price_id = items[0].get("price", {}).get("id")
                    amount = items[0].get("price", {}).get("unit_amount")
                    plan = PRICE_TO_TIER.get(price_id) or tier_from_amount(amount)

            # Try line_items if still missing
            if not plan:
                for li in session.get("line_items", {}).get("data", []):
                    price_id = li.get("price", {}).get("id")
                    amount = li.get("price", {}).get("unit_amount")
                    plan = PRICE_TO_TIER.get(price_id) or tier_from_amount(amount)
                    if plan:
                        break

            # Final fallback
            if not plan:
                plan = "standard"
            
            supabase.table("subscriptions").upsert({
                "user_id": user_id,
                "plan_tier": plan,
                "status": subscription.status if subscription else "active",
                "stripe_session_id": session.id,
                "stripe_customer_id": session.customer,
                "email": session.customer_email
            }, on_conflict="user_id").execute()
            
            supabase.table("user_profiles").upsert({
                "id": user_id,
                "subscription_tier": plan,
                "updated_at": datetime.utcnow().isoformat()
            }).execute()
        
        return {
            "success": True,
            "plan": plan,
            "message": f"✅ Abonnement {plan.upper()} activé!"
        }
    
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/user/profile")
async def get_user_profile(request: Request):
    """📋 Récupère le profil et l'abonnement"""
    try:
        user_id = get_user_id(request)
        
        if SUPABASE_URL and SUPABASE_SERVICE_KEY:
            supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
            
            profile_response = supabase.table("user_profiles").select("*").eq(
                "id", user_id
            ).execute()
            
            subscription_response = supabase.table("subscriptions").select("*").eq(
                "user_id", user_id
            ).eq("status", "active").order("created_at", desc=True).limit(1).execute()
            
            profile = profile_response.data[0] if profile_response.data else {}
            subscription = subscription_response.data[0] if subscription_response.data else None
            
            return {
                "success": True,
                "profile": {
                    "user_id": user_id,
                    "email": profile.get("email"),
                    "full_name": profile.get("full_name")
                },
                "subscription": subscription,
                "has_active_subscription": bool(subscription)
            }
    
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", 8000)), reload=True)
