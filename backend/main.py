from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
import os
import openai
import stripe
from dotenv import load_dotenv
import jwt
from functools import lru_cache
import hmac
import hashlib
import requests
import json

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")

# Shopify OAuth credentials
SHOPIFY_API_KEY = os.getenv("SHOPIFY_API_KEY")
SHOPIFY_API_SECRET = os.getenv("SHOPIFY_API_SECRET")
SHOPIFY_ACCESS_TOKEN = os.getenv("SHOPIFY_ACCESS_TOKEN")
SHOPIFY_SCOPES = "read_products,write_products,read_orders,read_customers,read_analytics"
SHOPIFY_REDIRECT_URI = os.getenv("SHOPIFY_REDIRECT_URI", "https://shopbrain-backend.onrender.com/auth/shopify/callback")

if not OPENAI_API_KEY:
    print("Warning: OPENAI_API_KEY not set. /optimize will fail without it.")
else:
    openai.api_key = OPENAI_API_KEY

if STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Stripe price IDs
STRIPE_PLANS = {
    "99": "price_1SQfzmPSvADOSbOzpxoK8hG3",
    "199": "price_1SQg0xPSvADOSbOzrZbOGs06",
    "299": "price_1SQg3CPSvADOSbOzHXSoDkGN",
}

# Helper: get authenticated user from Authorization header
def get_user_id(request: Request) -> str:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    
    token = auth_header[7:]
    try:
        payload = jwt.decode(token, SUPABASE_JWT_SECRET, algorithms=["HS256"])
        return payload.get("sub")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


class OptimizeRequest(BaseModel):
    name: str
    description: str
    email: str | None = None


@app.post("/optimize")
async def optimize(req: OptimizeRequest, request: Request):
    """Receive product name+description, call OpenAI GPT-4 to generate improved title, description and 3 cross-sell suggestions."""
    user_id = get_user_id(request)
    
    if not openai.api_key:
        raise HTTPException(status_code=500, detail="OpenAI key not configured")

    prompt = f"""
You are a product copywriter.
Input product name: {req.name}
Input product description: {req.description}

Return a JSON object with keys: title, description, cross_sell (array of 3 short suggestions).
Keep outputs concise and use French language if inputs are French.
"""

    try:
        response = openai.ChatCompletion.create(
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
    return {"status": "ok", "version": "1.2"}


@app.post("/api/stripe/payment-link")
async def create_payment_link(payload: dict, request: Request):
    """Create a Stripe Payment Link for a subscription plan.
    Expects JSON: {"plan": "standard" | "pro" | "premium", "email": "customer@example.com"}
    """
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=500, detail="Stripe not configured")

    plan = payload.get("plan", "").lower()
    customer_email = payload.get("email")
    
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
                    "url": os.getenv("FRONTEND_ORIGIN", "http://localhost:5173") + "/#dashboard?payment=success"
                }
            },
            billing_address_collection="auto",
            metadata={
                "plan": plan,
                "email": customer_email if customer_email else "unknown"
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
    user_id = get_user_id(request)
    
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=500, detail="Stripe not configured")

    plan = payload.get("plan")
    customer_email = payload.get("email")
    
    if plan not in STRIPE_PLANS:
        raise HTTPException(status_code=400, detail="Invalid plan")

    price_id = STRIPE_PLANS[plan]

    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            mode="subscription",
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=os.getenv("FRONTEND_ORIGIN", "http://localhost:5173") + "?session_id={CHECKOUT_SESSION_ID}",
            cancel_url=os.getenv("FRONTEND_ORIGIN", "http://localhost:5173") + "/cancel",
            customer_email=customer_email,
            subscription_data={
                "trial_period_days": 14,
                "metadata": {"user_id": user_id},
            },
        )
        return {"url": session.url}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


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
        user_id = session.get("metadata", {}).get("user_id")
        
        # Persist subscription to Supabase if configured (best-effort)
        if SUPABASE_URL and SUPABASE_KEY and user_id:
            try:
                from supabase import create_client

                supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
                
                # Extract plan from subscription
                plan_tier = None
                for tier, price_id in STRIPE_PLANS.items():
                    if any(li.get("price") == price_id for li in session.get("line_items", {}).get("data", [])):
                        plan_tier = tier
                        break
                
                supabase.table("subscriptions").insert({
                    "user_id": user_id,
                    "email": session.get("customer_email"),
                    "stripe_session_id": session.get("id"),
                    "stripe_subscription_id": session.get("subscription"),
                    "stripe_customer_id": session.get("customer"),
                    "plan_tier": plan_tier,
                    "status": "active",
                }).execute()
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


@app.get("/api/shopify/products")
async def get_shopify_products(request: Request, limit: int = 50):
    """Fetch products from user's connected Shopify store."""
    user_id = get_user_id(request)
    
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise HTTPException(status_code=500, detail="Supabase not configured")
    
    try:
        from supabase import create_client
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        
        # Get user's Shopify connection
        connection = supabase.table("shopify_connections").select("*").eq("user_id", user_id).execute()
        
        if not connection.data:
            raise HTTPException(status_code=404, detail="No Shopify store connected")
        
        shop_domain = connection.data[0]["shop_domain"]
        access_token = connection.data[0]["access_token"]
        
        # Fetch products from Shopify API
        products_url = f"https://{shop_domain}/admin/api/2024-10/products.json?limit={limit}"
        headers = {
            "X-Shopify-Access-Token": access_token,
            "Content-Type": "application/json"
        }
        
        response = requests.get(products_url, headers=headers)
        response.raise_for_status()
        
        products_data = response.json()
        return {"products": products_data.get("products", [])}
        
    except Exception as e:
        print(f"Error fetching Shopify products: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
        response = openai.ChatCompletion.create(
            model="gpt-4",
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


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", 8000)), reload=True)
