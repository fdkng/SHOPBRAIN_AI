"""
Subscription Management Endpoints
Gère les abonnements, webhooks Stripe, et accès dashboard
"""

from fastapi import HTTPException, Request
from pydantic import BaseModel
from datetime import datetime, timedelta
import json
from supabase import create_client

# ============================================================================
# SUBSCRIPTION MANAGEMENT
# ============================================================================

class CheckSubscriptionRequest(BaseModel):
    user_id: str


@app.post("/api/subscription/status")
async def check_subscription_status(req: CheckSubscriptionRequest, request: Request):
    """
    ✅ Vérifie le statut d'abonnement de l'utilisateur
    Retourne: plan, statut, date expiration, accès features
    """
    try:
        user_id = get_user_id(request)
        
        if SUPABASE_URL and SUPABASE_SERVICE_KEY:
            supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
            
            # Récupère l'abonnement actif
            response = supabase.table("user_subscriptions").select("*").eq(
                "user_id", user_id
            ).eq("status", "active").order("created_at", desc=True).limit(1).execute()
            
            if response.data:
                subscription = response.data[0]
                plan = subscription['plan']
                
                # Retourne les capacités selon le plan
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
                        'product_limit': None,  # Illimité
                        'features': ['product_analysis', 'content_generation', 'cross_sell', 'automated_actions', 'reports', 'predictions']
                    }
                }
                
                return {
                    'success': True,
                    'has_subscription': True,
                    'plan': plan,
                    'status': subscription['status'],
                    'started_at': subscription['started_at'],
                    'ends_at': subscription['ends_at'],
                    'capabilities': capabilities.get(plan, {}),
                    'amount_paid': subscription['amount_paid'],
                    'currency': subscription['currency']
                }
            
            # Pas d'abonnement actif
            return {
                'success': True,
                'has_subscription': False,
                'plan': 'free',
                'capabilities': {}
            }
    
    except Exception as e:
        print(f"Error checking subscription: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class CreateCheckoutSessionRequest(BaseModel):
    plan: str
    email: str


@app.post("/api/subscription/create-session")
async def create_checkout_session(req: CreateCheckoutSessionRequest, request: Request):
    """
    Crée une session Stripe pour l'abonnement
    Retourne URL vers Stripe Checkout
    """
    try:
        user_id = get_user_id(request)
        plan = req.plan
        email = req.email
        
        if plan not in STRIPE_PLANS:
            raise HTTPException(status_code=400, detail="Plan invalide")
        
        price_id = STRIPE_PLANS[plan]
        
        # URL de redirection avec user_id en paramètre
        frontend_url = "https://fdkng.github.io/SHOPBRAIN_AI"
        
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            mode="subscription",
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=f"{frontend_url}/#dashboard?session_id={{CHECKOUT_SESSION_ID}}&user_id={user_id}",
            cancel_url=f"{frontend_url}/#pricing",
            customer_email=email,
            metadata={
                "user_id": user_id,
                "plan": plan,
                "email": email
            }
        )
        
        # Stocke l'intent de checkout
        if SUPABASE_URL and SUPABASE_SERVICE_KEY:
            supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
            supabase.table("stripe_events").insert({
                "stripe_event_id": f"session_{session.id}",
                "event_type": "checkout.session.created",
                "user_id": user_id,
                "data": {
                    "session_id": session.id,
                    "plan": plan,
                    "email": email
                }
            }).execute()
        
        return {
            "success": True,
            "session_id": session.id,
            "url": session.url
        }
    
    except Exception as e:
        print(f"Error creating checkout session: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class VerifyCheckoutRequest(BaseModel):
    session_id: str


@app.post("/api/subscription/verify-session")
async def verify_checkout_session(req: VerifyCheckoutRequest, request: Request):
    """
    ✅ Vérifie que le paiement a été reçu et crée l'abonnement
    Appelé après redirection de Stripe
    """
    try:
        user_id = get_user_id(request)
        
        session = stripe.checkout.Session.retrieve(req.session_id)
        
        if session.payment_status != "paid":
            return {
                "success": False,
                "message": "Paiement non confirmé"
            }
        
        # Récupère l'abonnement créé
        subscription = stripe.Subscription.retrieve(session.subscription)
        
        if SUPABASE_URL and SUPABASE_SERVICE_KEY:
            supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
            
            # Récupère le plan depuis la session
            plan = session.metadata.get("plan") if session.metadata else "pro"
            
            # Crée l'enregistrement d'abonnement
            supabase.table("user_subscriptions").insert({
                "user_id": user_id,
                "plan": plan,
                "status": "active",
                "stripe_session_id": session.id,
                "stripe_customer_id": session.customer,
                "amount_paid": session.amount_total,
                "currency": session.currency,
                "started_at": datetime.utcnow().isoformat(),
                "ends_at": None  # Abonnement actif indéfiniment
            }).execute()
            
            # Crée ou met à jour le profil utilisateur
            supabase.table("user_profiles").upsert({
                "id": user_id,
                "subscription_tier": plan,
                "updated_at": datetime.utcnow().isoformat()
            }).execute()
        
        return {
            "success": True,
            "plan": plan,
            "amount_paid": session.amount_total,
            "currency": session.currency,
            "message": f"✅ Abonnement {plan.upper()} activé avec succès!"
        }
    
    except Exception as e:
        print(f"Error verifying session: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/webhook/stripe")
async def stripe_webhook_handler(request: Request):
    """
    🔔 Webhook Stripe pour traiter les événements de paiement
    Reçoit: payment_intent.succeeded, customer.subscription.updated, etc.
    """
    try:
        payload = await request.body()
        sig_header = request.headers.get("stripe-signature")
        
        # Vérifie la signature
        event = stripe.Webhook.construct_event(
            payload, sig_header, STRIPE_WEBHOOK_SECRET
        )
        
        if SUPABASE_URL and SUPABASE_SERVICE_KEY:
            supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
            
            event_type = event['type']
            
            # payment_intent.succeeded - Paiement reçu
            if event_type == "payment_intent.succeeded":
                payment_intent = event['data']['object']
                customer_email = payment_intent.get('receipt_email')
                amount = payment_intent['amount']
                
                # Enregistre l'événement
                supabase.table("stripe_events").insert({
                    "stripe_event_id": event['id'],
                    "event_type": event_type,
                    "data": payment_intent
                }).execute()
            
            # customer.subscription.updated
            elif event_type == "customer.subscription.updated":
                subscription = event['data']['object']
                customer_id = subscription['customer']
                
                # Trouve l'utilisateur par customer_id
                subs = supabase.table("user_subscriptions").select("user_id").eq(
                    "stripe_customer_id", customer_id
                ).execute()
                
                if subs.data:
                    user_id = subs.data[0]['user_id']
                    
                    # Met à jour le statut
                    supabase.table("user_subscriptions").update({
                        "status": "active" if subscription['status'] == "active" else "canceled",
                        "updated_at": datetime.utcnow().isoformat()
                    }).eq("stripe_customer_id", customer_id).execute()
            
            # customer.subscription.deleted
            elif event_type == "customer.subscription.deleted":
                subscription = event['data']['object']
                customer_id = subscription['customer']
                
                subs = supabase.table("user_subscriptions").select("user_id").eq(
                    "stripe_customer_id", customer_id
                ).execute()
                
                if subs.data:
                    user_id = subs.data[0]['user_id']
                    supabase.table("user_subscriptions").update({
                        "status": "canceled",
                        "updated_at": datetime.utcnow().isoformat()
                    }).eq("stripe_customer_id", customer_id).execute()
            
            # Marque l'événement comme traité
            supabase.table("stripe_events").update({
                "processed": True,
                "processed_at": datetime.utcnow().isoformat()
            }).eq("stripe_event_id", event['id']).execute()
        
        return {"received": True}
    
    except Exception as e:
        print(f"Webhook error: {e}")
        raise HTTPException(status_code=400, detail=f"Webhook error: {e}")


@app.get("/api/user/profile")
async def get_user_profile(request: Request):
    """
    📋 Récupère le profil utilisateur complet
    Inclut: infos personnelles, subscription, données Shopify
    """
    try:
        user_id = get_user_id(request)
        
        if SUPABASE_URL and SUPABASE_SERVICE_KEY:
            supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
            
            # Récupère le profil
            profile_response = supabase.table("user_profiles").select("*").eq(
                "id", user_id
            ).execute()
            
            # Récupère l'abonnement actif
            subscription_response = supabase.table("user_subscriptions").select("*").eq(
                "user_id", user_id
            ).eq("status", "active").order("created_at", desc=True).limit(1).execute()
            
            profile = profile_response.data[0] if profile_response.data else {}
            subscription = subscription_response.data[0] if subscription_response.data else None
            
            return {
                "success": True,
                "profile": {
                    "user_id": user_id,
                    "email": profile.get("email"),
                    "full_name": profile.get("full_name"),
                    "subscription_tier": subscription['plan'] if subscription else "free",
                    "shopify_shop_url": profile.get("shopify_shop_url"),
                    "products_analyzed": profile.get("products_analyzed", 0),
                    "created_at": profile.get("created_at")
                },
                "subscription": subscription,
                "can_use_ai": bool(subscription)  # ✅ Peut utiliser IA si abonné
            }
    
    except Exception as e:
        print(f"Error getting profile: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class UpdateProfileRequest(BaseModel):
    full_name: str | None = None
    shopify_shop_url: str | None = None
    shopify_access_token: str | None = None


@app.post("/api/user/profile/update")
async def update_user_profile(req: UpdateProfileRequest, request: Request):
    """
    ✏️ Met à jour le profil utilisateur
    """
    try:
        user_id = get_user_id(request)
        
        if SUPABASE_URL and SUPABASE_SERVICE_KEY:
            supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
            
            update_data = {"updated_at": datetime.utcnow().isoformat()}
            
            if req.full_name:
                update_data["full_name"] = req.full_name
            if req.shopify_shop_url:
                update_data["shopify_shop_url"] = req.shopify_shop_url
            if req.shopify_access_token:
                update_data["shopify_access_token"] = req.shopify_access_token
            
            supabase.table("user_profiles").upsert({
                "id": user_id,
                **update_data
            }).execute()
            
            return {"success": True, "message": "Profil mis à jour"}
    
    except Exception as e:
        print(f"Error updating profile: {e}")
        raise HTTPException(status_code=500, detail=str(e))
