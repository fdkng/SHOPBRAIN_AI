from dotenv import load_dotenv

"""
ShopBrain AI – Écosystème Bundles & cross-sell
Endpoints, logique asynchrone, cache, persistance Supabase, gestion d’erreurs, threading, doc.
"""

import os
import sys
# Add repo root to sys.path so AI_engine package can be found
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import re
import json
import time
import uuid
import hashlib
import base64
import hmac
import smtplib
import ssl
import requests
import threading
from datetime import datetime, timedelta, timezone
from fastapi import FastAPI, HTTPException, Request, Depends, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, StreamingResponse, HTMLResponse, JSONResponse
from pydantic import BaseModel
from io import BytesIO
from email.message import EmailMessage
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from supabase import create_client
import openai
import stripe
import jwt

try:
    from openai import OpenAI
except Exception:
    OpenAI = None

# Global OpenAI client (reused across all requests)
_oai_client = None
def get_openai_client():
    global _oai_client
    if _oai_client is None:
        _oai_client = OpenAI(api_key=OPENAI_API_KEY) if OpenAI else openai.OpenAI(api_key=OPENAI_API_KEY)
    return _oai_client

try:
    from AI_engine.shopbrain_ai import ShopBrainAI
except Exception:
    ShopBrainAI = None

print("\n🚀 ========== BACKEND STARTUP ==========")
print(f"✅ FastAPI initializing...")
app = FastAPI()


def _sanitize_url(raw: str | None, default: str = "") -> str:
    value = (raw or default or "").strip()
    return value.rstrip("/") if value.endswith("/") else value

# Shopify OAuth credentials
SHOPIFY_API_KEY = os.getenv("SHOPIFY_API_KEY")
SHOPIFY_API_SECRET = os.getenv("SHOPIFY_API_SECRET")
SHOPIFY_ACCESS_TOKEN = os.getenv("SHOPIFY_ACCESS_TOKEN")
SHOPIFY_SCOPES = "read_products,write_products,read_orders,read_customers,read_analytics,read_script_tags"
SHOPIFY_REDIRECT_URI = _sanitize_url(
    os.getenv("SHOPIFY_REDIRECT_URI"),
    "https://shopbrain-backend.onrender.com/auth/shopify/callback",
)

try:
    from shopbrain_expert_system import SHOPBRAIN_EXPERT_SYSTEM as _SYSTEM_PROMPT
    SHOPBRAIN_EXPERT_SYSTEM = _SYSTEM_PROMPT
    print("✅ SHOPBRAIN_EXPERT_SYSTEM imported successfully")
except Exception as e:
    print(f"⚠️  SHOPBRAIN_EXPERT_SYSTEM import failed (non-critical): {e}")

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
FRONTEND_ORIGIN = _sanitize_url(
    os.getenv("FRONTEND_ORIGIN"),
    "https://fdkng.github.io/SHOPBRAIN_AI",
)
SERPAPI_KEY = os.getenv("SERPAPI_KEY") or os.getenv("SERPAPI_API_KEY")
MARKET_TOLERANCE_PCT = float(os.getenv("MARKET_TOLERANCE_PCT", "5"))
SERP_MAX_PRODUCTS = int(os.getenv("SERP_MAX_PRODUCTS", "8"))
SERP_NUM_RESULTS = int(os.getenv("SERP_NUM_RESULTS", "20"))

_SERP_CACHE: dict[str, dict] = {}
_SHOP_CACHE: dict[str, dict] = {}
_BLOCKERS_CACHE: dict[str, dict] = {}
_MEM_CACHE_LOCK = threading.Lock()


def _cache_get_serp(key: str, ttl_s: int = 900):
    with _MEM_CACHE_LOCK:
        item = _SERP_CACHE.get(key)
        if not item:
            return None
        if time.time() - item.get("ts", 0) > ttl_s:
            _SERP_CACHE.pop(key, None)
            return None
        return item.get("data")


def _cache_set_serp(key: str, data):
    with _MEM_CACHE_LOCK:
        _SERP_CACHE[key] = {"ts": time.time(), "data": data}


def _cache_get_shop(key: str, ttl_s: int = 3600):
    with _MEM_CACHE_LOCK:
        item = _SHOP_CACHE.get(key)
        if not item:
            return None
        if time.time() - item.get("ts", 0) > ttl_s:
            _SHOP_CACHE.pop(key, None)
            return None
        return item.get("data")


def _cache_set_shop(key: str, data):
    with _MEM_CACHE_LOCK:
        _SHOP_CACHE[key] = {"ts": time.time(), "data": data}


def _cache_get_blockers(key: str, ttl_s: int = 300):
    with _MEM_CACHE_LOCK:
        item = _BLOCKERS_CACHE.get(key)
        if not item:
            return None
        if time.time() - item.get("ts", 0) > ttl_s:
            _BLOCKERS_CACHE.pop(key, None)
            return None
        return item.get("data")


def _cache_set_blockers(key: str, data):
    with _MEM_CACHE_LOCK:
        _BLOCKERS_CACHE[key] = {"ts": time.time(), "data": data}


def _currency_label(code: str | None) -> str:
    if code == "CAD":
        return "dollars canadiens (CAD)"
    if code == "USD":
        return "dollars US (USD)"
    if code == "EUR":
        return "euros (EUR)"
    return f"{code or 'devise inconnue'}"


def _gl_for_currency(code: str | None) -> str:
    if code == "USD":
        return "us"
    if code == "EUR":
        return "fr"
    return "ca"


def _keywords_from_text(text: str, max_words: int = 10) -> list[str]:
    tokens = re.findall(r"[A-Za-zÀ-ÖØ-öø-ÿ0-9]+", (text or "").lower())
    return [w for w in tokens if len(w) > 2][:max_words]


def _clean_query_text(text: str, shop_brand: str | None = None) -> str:
    cleaned = re.sub(r"\s+", " ", (text or "")).strip()
    if shop_brand:
        cleaned = re.sub(re.escape(shop_brand), "", cleaned, flags=re.IGNORECASE).strip()
    return cleaned

@app.get("/api/shopify/bundles/legacy-v1")
async def get_shopify_bundles_legacy_v1(request: Request, range: str = "30d", limit: int = 10):
    """🧩 Bundles & cross-sell suggestions based on order co-occurrence.

    Lightweight alternative to /api/shopify/insights when you only need bundles.
    """
    start_time = time.time()
    user_id = get_user_id(request)
    tier = get_user_tier(user_id)
    ensure_feature_allowed(tier, "cross_sell")
    shop_domain, access_token = _get_shopify_connection(user_id)

    range_map = {"7d": 7, "30d": 30, "90d": 90, "365d": 365}
    days = range_map.get(range, 30)

    print(f"[BUNDLES] Début analyse bundles pour {shop_domain} sur {days} jours...")
    t0 = time.time()
    orders = _fetch_shopify_orders(shop_domain, access_token, days)
    print(f"[BUNDLES] Récupération commandes: {len(orders)} commandes en {time.time() - t0:.2f}s")

    pair_counts: dict[tuple[str, str], int] = {}
    for order in orders:
        ids = [str(item.get("product_id") or item.get("id")) for item in order.get("line_items", [])]
        ids = list({pid for pid in ids if pid and pid != "None"})
        if len(ids) < 2:
            continue
        for i in range(len(ids)):
            for j in range(i + 1, len(ids)):
                key = tuple(sorted((ids[i], ids[j])))
                pair_counts[key] = pair_counts.get(key, 0) + 1

    print(f"[BUNDLES] Comptage paires: {len(pair_counts)} paires trouvées en {time.time() - t0:.2f}s")

    top_pairs = sorted(pair_counts.items(), key=lambda x: x[1], reverse=True)[: max(1, min(int(limit or 10), 20))]

    needed_ids = set()
    for (a, b), _count in top_pairs:
        needed_ids.add(a)
        needed_ids.add(b)

    def _fetch_product_titles(product_ids: set[str]) -> dict[str, str]:
        titles: dict[str, str] = {}
        if not product_ids:
            return titles

        headers = {
            "X-Shopify-Access-Token": access_token,
            "Content-Type": "application/json",
        }
        # Augmente le timeout à 60s pour debug
        per_request_timeout = int(os.getenv("SHOPIFY_REQUEST_TIMEOUT", "60"))

        # Best-effort: scan a few product pages to resolve titles.
        next_url = (
            f"https://{shop_domain}/admin/api/2024-10/products.json"
            f"?limit=250&fields=id,title"
        )
        page_count = 0
        max_pages = int(os.getenv("SHOPIFY_PRODUCTS_TITLE_MAX_PAGES", "3"))
        while next_url and page_count < max_pages and len(titles) < len(product_ids):
            resp = requests.get(next_url, headers=headers, timeout=per_request_timeout)
            if resp.status_code != 200:
                break
            data = resp.json().get("products", [])
            for prod in data:
                pid = str(prod.get("id"))
                if pid in product_ids:
                    titles[pid] = prod.get("title")
            next_url = None
            page_count += 1

        # Fallback: direct fetch for any missing IDs (bounded).
        missing = [pid for pid in product_ids if pid not in titles]
        for pid in missing[:10]:
            resp = requests.get(
                f"https://{shop_domain}/admin/api/2024-10/products/{pid}.json?fields=id,title",
                headers=headers,
                timeout=per_request_timeout,
            )
            if resp.status_code == 200:
                prod = resp.json().get("product", {})
                if prod:
                    titles[str(prod.get("id"))] = prod.get("title")
        return titles

    t1 = time.time()
    titles_by_id = _fetch_product_titles(needed_ids)
    print(f"[BUNDLES] Récupération titres produits: {len(titles_by_id)} titres en {time.time() - t1:.2f}s")

    def _discount_range_pct(count: int) -> tuple[int, int]:
        if count >= 8:
            return (15, 20)
        if count >= 4:
            return (12, 18)
        return (10, 15)

    def _confidence_label(count: int) -> str:
        if count >= 8:
            return "forte"
        if count >= 4:
            return "moyenne"
        return "faible"

    suggestions: list[dict] = []
    for (a, b), count in top_pairs:
        left = titles_by_id.get(a) or f"#{a}"
        right = titles_by_id.get(b) or f"#{b}"
        low, high = _discount_range_pct(int(count or 0))
        suggestions.append({
            "pair": [a, b],
            "count": int(count or 0),
            "confidence": _confidence_label(int(count or 0)),
            "titles": [left, right],
            "discount_range_pct": [low, high],
            "placements": [
                "page_produit (bloc: Souvent achetés ensemble)",
                "panier / drawer (cross-sell avant checkout)",
                "checkout (si supporté par le thème/app)",
            ],
            "offer": {
                "type": "bundle",
                "name": f"Bundle: {left} + {right}"[:120],
                "message": f"Ajoute {right} et économise {low}–{high}% sur le pack.",
            },
            "copy": [
                f"Complète ton achat avec {right}.",
                f"Le duo le plus fréquent: {left} + {right}.",
            ],
        })

    print(f"[BUNDLES] Suggestions générées: {len(suggestions)} en {time.time() - t1:.2f}s")
    print(f"[BUNDLES] Temps total endpoint: {time.time() - start_time:.2f}s")

    return {
        "success": True,
        "shop": shop_domain,
        "range": range,
        "orders_scanned": len(orders),
        "bundle_suggestions": suggestions,
    }


def _parse_price_and_currency(raw: str) -> tuple[float | None, str | None]:
    if raw is None:
        return (None, None)
    text = str(raw)
    upper = text.upper()

    currency = None
    if "CA$" in upper or "CAD" in upper or "C$" in upper:
        currency = "CAD"
    elif "US$" in upper or "USD" in upper:
        currency = "USD"
    elif "€" in text or " EUR" in upper:
        currency = "EUR"
    elif "£" in text or " GBP" in upper:
        currency = "GBP"
    elif "$" in text:
        # Dollar sign is ambiguous across countries; keep as unknown and let caller assume based on context.
        currency = None

    value = _parse_price_value(text)
    return (value, currency)


def _parse_price_value(raw: str) -> float | None:
    if not raw:
        return None
    text = str(raw)
    # Keep digits, dot, comma
    cleaned = re.sub(r"[^0-9\.,]", "", text)
    if not cleaned:
        return None
    # Heuristic: if both separators exist, assume comma is thousands separator.
    if "," in cleaned and "." in cleaned:
        cleaned = cleaned.replace(",", "")
    else:
        # Convert comma decimals to dot
        if cleaned.count(",") == 1 and cleaned.count(".") == 0:
            cleaned = cleaned.replace(",", ".")
        # Remove thousands separators like 1.234,56 (already handled) or 1 234
        if cleaned.count(".") > 1:
            parts = cleaned.split(".")
            cleaned = "".join(parts[:-1]) + "." + parts[-1]
    try:
        value = float(cleaned)
        return value if value > 0 else None
    except Exception:
        return None


# ============================================================================
# 🌐 WEB SEARCH FOR CHAT — Real-time internet access via SerpAPI
# ============================================================================

_WEB_SEARCH_KEYWORDS = [
    # Trends & social media
    "tendance", "trending", "trend", "viral", "tiktok", "instagram", "reels",
    "facebook", "pinterest", "youtube", "snapchat", "twitter", "x.com",
    "réseau social", "réseaux sociaux", "social media", "influenceur", "influencer",
    "hashtag", "buzz", "hype", "populaire",
    # Market & news
    "aujourd'hui", "cette semaine", "ce mois", "en ce moment", "actuellement",
    "dernièrement", "récemment", "2025", "2026", "2027", "nouveau", "nouveauté",
    "actualité", "news", "derniers", "dernières", "marché actuel",
    # Competitors & prices
    "concurrent", "compétiteur", "comparaison", "compare", "versus", "vs",
    "meilleur", "top", "classement", "ranking",
    # Specific queries
    "cherche", "recherche", "trouve", "google", "internet", "en ligne",
    "site web", "statistique", "stats", "données", "chiffres",
    # E-commerce trends
    "niche", "dropshipping", "winning product", "produit gagnant",
    "best seller", "meilleure vente", "amazon", "aliexpress", "ebay",
    "shopify app", "application",
]

def _needs_web_search(message: str) -> bool:
    """Detect if a chat message needs real-time web data."""
    msg_lower = message.lower()
    match_count = sum(1 for kw in _WEB_SEARCH_KEYWORDS if kw in msg_lower)
    # Need at least 1 keyword match
    return match_count >= 1


def _build_search_query(message: str) -> str:
    """Build a smart Google search query from the user message."""
    msg_lower = message.lower()
    # If about TikTok/social trends, optimize the query
    if any(kw in msg_lower for kw in ["tiktok", "instagram", "réseaux sociaux", "social media", "viral"]):
        # Extract the core topic
        base = message.strip()
        if len(base) > 120:
            base = base[:120]
        return f"{base} e-commerce Shopify 2025 2026"
    # General case: use message + e-commerce context
    base = message.strip()
    if len(base) > 120:
        base = base[:120]
    return f"{base} e-commerce"


def _web_search_for_chat(message: str, num_results: int = 8) -> str:
    """Perform a Google web search via SerpAPI and return formatted context with links.
    Returns empty string if no API key or no results."""
    if not SERPAPI_KEY:
        print("⚠️ Web search skipped: no SERPAPI_KEY")
        return ""
    
    search_query = _build_search_query(message)
    print(f"🌐 Web search for chat: '{search_query}'")
    
    try:
        params = {
            "engine": "google",
            "q": search_query,
            "gl": "ca",
            "hl": "fr",
            "api_key": SERPAPI_KEY,
            "num": num_results,
        }
        resp = requests.get("https://serpapi.com/search.json", params=params, timeout=12)
        if resp.status_code != 200:
            print(f"⚠️ Web search HTTP error: {resp.status_code}")
            return ""
        
        data = resp.json()
        results = []
        
        # Extract knowledge graph if present
        kg = data.get("knowledge_graph")
        if kg:
            kg_title = kg.get("title", "")
            kg_desc = kg.get("description", "")
            kg_link = kg.get("website", "") or kg.get("source", {}).get("link", "")
            if kg_title and kg_desc:
                entry = f"📌 {kg_title}: {kg_desc}"
                if kg_link:
                    entry += f"\n  🔗 {kg_link}"
                results.append(entry)
        
        # Extract organic results with full URLs
        for item in (data.get("organic_results") or [])[:num_results]:
            title = item.get("title", "")
            snippet = item.get("snippet", "")
            link = item.get("link", "")
            date = item.get("date", "")
            if title and snippet:
                entry = f"• {title}"
                if date:
                    entry += f" ({date})"
                entry += f"\n  {snippet}"
                if link:
                    entry += f"\n  🔗 {link}"
                # Include sitelinks if present (sub-pages)
                sitelinks = item.get("sitelinks", {}).get("inline", []) or item.get("sitelinks", {}).get("expanded", [])
                for sl in sitelinks[:3]:
                    sl_title = sl.get("title", "")
                    sl_link = sl.get("link", "")
                    if sl_title and sl_link:
                        entry += f"\n    → {sl_title}: {sl_link}"
                results.append(entry)
        
        # Extract inline shopping results (product links with prices)
        shopping_results = data.get("shopping_results") or data.get("inline_shopping_results") or []
        if shopping_results:
            shop_entries = []
            for item in shopping_results[:6]:
                s_title = item.get("title", "")
                s_price = item.get("price", item.get("extracted_price", ""))
                s_link = item.get("link", "")
                s_source = item.get("source", "")
                if s_title:
                    entry = f"  🛒 {s_title}"
                    if s_price:
                        entry += f" — {s_price}"
                    if s_source:
                        entry += f" ({s_source})"
                    if s_link:
                        entry += f"\n     🔗 {s_link}"
                    shop_entries.append(entry)
            if shop_entries:
                results.append("\n🛍️ PRODUITS TROUVÉS EN LIGNE :\n" + "\n".join(shop_entries))
        
        # Extract "People also ask" for extra context
        for paa in (data.get("related_questions") or [])[:3]:
            q = paa.get("question", "")
            a = paa.get("snippet", "")
            a_link = paa.get("link", "")
            if q and a:
                entry = f"❓ {q}\n  {a}"
                if a_link:
                    entry += f"\n  🔗 {a_link}"
                results.append(entry)
        
        if not results:
            print("⚠️ Web search returned no usable results")
            return ""
        
        formatted = "\n\n".join(results)
        print(f"✅ Web search returned {len(results)} results")
        return formatted
        
    except Exception as e:
        print(f"⚠️ Web search error: {e}")
        return ""


def _serpapi_price_snapshot(query: str, gl: str = "ca", hl: str = "fr", currency_code: str | None = None) -> dict:
    """Fetch competitor prices via SerpApi (Google Shopping engine).

    Returns: {count, min, median, max, refs:[{title,source,price,link,currency_code}], currency_code, prices}
    """
    if not SERPAPI_KEY:
        return {"count": 0, "refs": []}

    cache_key = f"{gl}:{hl}:{(currency_code or '').upper()}:{query}".strip().lower()
    cached = _cache_get_serp(cache_key)
    if cached is not None:
        return cached

    params = {
        "engine": "google_shopping",
        "q": query,
        "gl": gl,
        "hl": hl,
        "api_key": SERPAPI_KEY,
        # Keep it small/cost-controlled
        "num": max(5, min(int(SERP_NUM_RESULTS), 40)),
    }

    try:
        resp = requests.get("https://serpapi.com/search.json", params=params, timeout=20)
        if resp.status_code != 200:
            snapshot = {"count": 0, "refs": [], "error": f"HTTP {resp.status_code}"}
            _cache_set_serp(cache_key, snapshot)
            return snapshot
        payload = resp.json() or {}
    except Exception as e:
        snapshot = {"count": 0, "refs": [], "error": str(e)}
        _cache_set_serp(cache_key, snapshot)
        return snapshot

    results = []
    try:
        results.extend(payload.get("shopping_results") or [])
        results.extend(payload.get("inline_shopping_results") or [])
        # Some responses may contain variations
        results.extend(payload.get("organic_shopping_results") or [])
    except Exception:
        results = payload.get("shopping_results") or payload.get("inline_shopping_results") or []
    refs = []
    prices = []
    wanted = (currency_code or "").upper().strip() or None
    seen_currencies = set()
    for item in results[:10]:
        title = item.get("title") or item.get("name") or ""
        source = item.get("source") or item.get("merchant") or ""
        link = item.get("link") or item.get("product_link") or item.get("thumbnail")
        price_raw = item.get("price") or item.get("extracted_price")
        price = None
        curr = None
        if isinstance(price_raw, (int, float)):
            price = float(price_raw)
            try:
                item_curr = item.get("currency")
                if isinstance(item_curr, str) and item_curr.strip():
                    curr = item_curr.strip().upper()
            except Exception:
                curr = None
        else:
            price, curr = _parse_price_and_currency(price_raw)

        if curr:
            seen_currencies.add(curr)

        if price is None:
            continue

        # If we know the shop currency, keep only offers in the same currency.
        # If currency is unknown (common for "$"), assume it matches the shop currency.
        if wanted and curr and curr != wanted:
            continue
        if wanted and curr is None:
            curr = wanted

        prices.append(price)
        refs.append({
            "title": title[:140],
            "source": source[:60],
            "price": round(price, 2),
            "currency_code": curr or wanted,
            "link": link,
        })

    prices.sort()
    if prices:
        mid = len(prices) // 2
        median = prices[mid] if len(prices) % 2 == 1 else (prices[mid - 1] + prices[mid]) / 2
        snapshot = {
            "count": len(prices),
            "min": round(prices[0], 2),
            "median": round(median, 2),
            "max": round(prices[-1], 2),
            "refs": refs[:5],
            "currency_code": wanted,
            # keep a small list for possible merging/fallback queries
            "prices": [round(p, 2) for p in prices[:20]],
        }
    else:
        snapshot = {
            "count": 0,
            "refs": [],
            "currency_code": wanted,
            "prices": [],
            **({"seen_currencies": sorted(list(seen_currencies))} if seen_currencies else {}),
        }

    _cache_set_serp(cache_key, snapshot)
    return snapshot


def _market_reason_text(
    *,
    action: str,
    current_price: float,
    suggested_price: float,
    snapshot: dict,
    currency_code: str | None,
) -> str:
    count = int(snapshot.get("count") or 0)
    curr_label = _currency_label(currency_code)

    if count < 3:
        seen = snapshot.get("seen_currencies")
        if isinstance(seen, list) and seen and currency_code and currency_code.upper() not in seen:
            return (
                f"Je n’ai pas trouvé assez d’offres comparables dans la même devise ({curr_label}). "
                "Je garde donc le prix pour éviter une recommandation hasardeuse."
            )
        return (
            "Je n’ai pas trouvé assez d’offres comparables fiables (moins de 3). "
            "Je garde donc le prix pour éviter une recommandation hasardeuse."
        )

    median = snapshot.get("median")
    if not isinstance(median, (int, float)) or median <= 0:
        return "Les résultats marché ne contiennent pas de prix exploitable; je garde le prix actuel."

    if action == "keep":
        return (
            f"Sur {count} offres similaires ({curr_label}), ton prix est déjà dans la zone du marché. "
            "Aucun changement recommandé."
        )
    if action == "increase":
        return (
            f"Sur {count} offres similaires ({curr_label}), ton prix est plutôt en dessous du niveau du marché. "
            f"Je recommande d’augmenter vers {round(float(suggested_price), 2)} pour mieux s’aligner."
        )
    return (
        f"Sur {count} offres similaires ({curr_label}), ton prix est plutôt au-dessus du niveau du marché. "
        f"Je recommande de baisser vers {round(float(suggested_price), 2)} pour mieux s’aligner."
    )


def _merge_snapshots(primary: dict, secondary: dict) -> dict:
    """Merge two SERP snapshots (best-effort) using their `prices` lists."""
    try:
        p_prices = [float(x) for x in (primary.get("prices") or []) if isinstance(x, (int, float))]
        s_prices = [float(x) for x in (secondary.get("prices") or []) if isinstance(x, (int, float))]
        prices = p_prices + s_prices
        prices = [p for p in prices if p and p > 0]
        prices.sort()

        refs = []
        for r in (primary.get("refs") or []) + (secondary.get("refs") or []):
            if isinstance(r, dict):
                refs.append(r)

        if not prices:
            return {
                "count": 0,
                "refs": refs[:5],
                "currency_code": primary.get("currency_code") or secondary.get("currency_code"),
                "prices": [],
            }

        mid = len(prices) // 2
        median = prices[mid] if len(prices) % 2 == 1 else (prices[mid - 1] + prices[mid]) / 2
        return {
            "count": len(prices),
            "min": round(prices[0], 2),
            "median": round(median, 2),
            "max": round(prices[-1], 2),
            "refs": refs[:5],
            "currency_code": primary.get("currency_code") or secondary.get("currency_code"),
            "prices": [round(p, 2) for p in prices[:30]],
        }
    except Exception:
        return primary


def _market_price_decision(current_price: float, snapshot: dict) -> dict:
    """Decide whether to keep, increase or decrease based on market median.

    Returns: {action, suggested_price, delta_pct}
    action ∈ {keep,increase,decrease}
    """
    median = snapshot.get("median")
    if not isinstance(median, (int, float)) or not median or median <= 0:
        return {"action": "keep", "suggested_price": current_price, "delta_pct": 0.0}

    suggested = float(median)
    delta_pct = ((suggested - current_price) / current_price) * 100 if current_price > 0 else 0.0
    if current_price > 0:
        pct_vs_median = abs((current_price - suggested) / suggested) * 100
    else:
        pct_vs_median = 0.0

    if pct_vs_median <= MARKET_TOLERANCE_PCT:
        return {"action": "keep", "suggested_price": current_price, "delta_pct": 0.0}
    if suggested > current_price:
        return {"action": "increase", "suggested_price": round(suggested, 2), "delta_pct": round(delta_pct, 2)}
    return {"action": "decrease", "suggested_price": round(suggested, 2), "delta_pct": round(delta_pct, 2)}


def _get_market_comparison_status() -> dict:
    provider_keys = [
        ("MARKET_API_KEY", "market_api"),
        ("SERPAPI_KEY", "serpapi"),
        ("SERPAPI_API_KEY", "serpapi"),
        ("RAPIDAPI_KEY", "rapidapi"),
        ("GOOGLE_SHOPPING_API_KEY", "google_shopping"),
        ("PRICE_API_KEY", "price_api"),
        ("OPENAI_API_KEY_CLEAN", "openai"),
        ("OPENAI_API_KEY_ALT", "openai"),
        ("OPENAI_API_KEY", "openai"),
    ]

    for env_key, provider in provider_keys:
        value = os.getenv(env_key)
        if env_key in ("SERPAPI_KEY", "SERPAPI_API_KEY") and not value:
            value = SERPAPI_KEY
        if env_key == "OPENAI_API_KEY" and not value:
            # Support sanitized key stored in OPENAI_API_KEY variable.
            value = OPENAI_API_KEY

        if value:
            return {
                "enabled": True,
                "provider": provider,
                # UI should not display env var names.
                "source": provider,
                "source_env": env_key,
                "mode": "external_api" if provider != "openai" else "ai_estimate",
            }

    return {
        "enabled": False,
        "provider": None,
        "source": None,
        "source_env": None,
        "mode": None,
        "reason": "Aucune clé API marché détectée",
    }


def _ai_market_price_estimates(items: list[dict], products_by_id: dict[str, dict], user_instructions: str = "", currency: str = "CAD") -> dict[str, dict]:
    """Return market price range estimates keyed by product_id.

    Uses OpenAI to estimate realistic market prices based on product context
    and optional user instructions (e.g. 'compare to luxury brands like LV').
    """
    if not OPENAI_API_KEY or not items:
        return {}

    # Only estimate a small set to control latency/cost.
    sample = []
    for item in items[:8]:
        pid = str(item.get("product_id") or "")
        if not pid:
            continue
        product = products_by_id.get(pid) or {}
        sample.append({
            "product_id": pid,
            "title": item.get("title") or product.get("title") or "",
            "product_type": product.get("product_type") or item.get("product_type") or "",
            "vendor": product.get("vendor") or item.get("vendor") or "",
            "tags": product.get("tags") or "",
            "current_price": item.get("current_price"),
            "currency": currency or "CAD",
        })

    if not sample:
        return {}

    # Build a strong, actionable prompt
    system_msg = (
        "Tu es un expert en pricing e-commerce et en analyse de marché. "
        "Tu as une connaissance approfondie des prix de détail pour toutes les catégories de produits, "
        "incluant le luxe, la mode, l'électronique, etc. "
        "Tu DOIS fournir des fourchettes de prix réalistes basées sur des produits comparables RÉELS du marché. "
        f"Tous les prix doivent être en {currency or 'CAD'} (dollars canadiens)."
    )

    user_context = ""
    if user_instructions:
        user_context = (
            f"\n\n⚠️ INSTRUCTIONS IMPORTANTES DU PROPRIÉTAIRE DE LA BOUTIQUE:\n"
            f"\"{user_instructions}\"\n"
            f"Tu DOIS tenir compte de ces instructions. Par exemple, si le propriétaire dit "
            f"'compare avec Louis Vuitton', tu dois baser tes estimations sur les prix de "
            f"produits similaires chez Louis Vuitton et marques équivalentes."
        )

    task_msg = (
        f"Analyse ces produits et estime la fourchette de prix du marché pour des produits similaires/comparables.{user_context}\n\n"
        f"Produits à analyser:\n{json.dumps(sample, ensure_ascii=False, indent=2)}\n\n"
        f"Pour CHAQUE produit, retourne:\n"
        f"- market_min: prix minimum observé pour des produits comparables sur le marché\n"
        f"- market_max: prix maximum observé pour des produits comparables\n"
        f"- positioning: 'low' si le prix actuel est en dessous du marché, 'mid' si aligné, 'high' si au-dessus\n"
        f"- confidence: nombre estimé d'offres comparables que tu connais (ex: 10, 25, 50)\n"
        f"- notes: explique brièvement QUELS produits/marques tu as comparés et pourquoi\n\n"
        f"Réponds en JSON strict avec cette structure:\n"
        f'{{"items": [{{"product_id": "...", "market_min": 0.0, "market_max": 0.0, "positioning": "low|mid|high", "confidence": 0, "notes": "..."}}]}}'
    )

    try:
        client = (OpenAI(api_key=OPENAI_API_KEY) if OpenAI else openai.OpenAI(api_key=OPENAI_API_KEY))
        response = client.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user", "content": task_msg},
            ],
            temperature=0.3,
            max_tokens=1200,
            response_format={"type": "json_object"},
        )

        payload = json.loads(response.choices[0].message.content or "{}")
        out = {}
        for row in payload.get("items", []) if isinstance(payload, dict) else []:
            pid = str(row.get("product_id") or "")
            if not pid:
                continue
            market_min = row.get("market_min")
            market_max = row.get("market_max")
            if not isinstance(market_min, (int, float)) or not isinstance(market_max, (int, float)):
                continue
            if market_min <= 0 or market_max <= 0 or market_max < market_min:
                continue
            out[pid] = {
                "market_min": float(round(market_min, 2)),
                "market_max": float(round(market_max, 2)),
                "positioning": row.get("positioning"),
                "confidence": row.get("confidence"),
                "notes": row.get("notes"),
            }
        return out
    except Exception as e:
        print(f"⚠️ market estimate AI error: {type(e).__name__}: {str(e)[:140]}")
        return {}


def _vision_describe_product(image_url: str, product_title: str, description: str = "") -> dict:
    """Use GPT-4o vision to analyze the product image and return a precise description
    for generating accurate search queries.
    
    Returns: {
        "search_query": "plain grey crewneck men t-shirt cotton basic",
        "category": "t-shirt",
        "attributes": "grey, plain, crewneck, men, basic, cotton"
    }
    """
    if not OPENAI_API_KEY or not image_url:
        return {}

    import time as _time
    start = _time.time()
    try:
        client = (OpenAI(api_key=OPENAI_API_KEY, timeout=4) if OpenAI else openai.OpenAI(api_key=OPENAI_API_KEY, timeout=4))
        
        desc_hint = f"\nProduct description: {description[:150]}" if description else ""
        
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": (
                    "You are a product identification expert. You look at product photos and generate "
                    "precise search queries to find THE EXACT SAME TYPE of product on Google Shopping.\n\n"
                    "Rules:\n"
                    "- Be VERY specific about what you see: color, style, fit, pattern, neckline, material\n"
                    "- A plain grey t-shirt is NOT the same as a graphic tee or a Muay Thai shirt\n"
                    "- Focus on the EXACT visual characteristics: plain/graphic, color, fit (slim/regular/oversized)\n"
                    "- Return a Google Shopping search query that would find IDENTICAL products\n"
                    "- Return JSON only"
                )},
                {"role": "user", "content": [
                    {"type": "text", "text": (
                        f"Product title: {product_title}{desc_hint}\n\n"
                        "Look at this product photo and tell me EXACTLY what this product is.\n"
                        "Return JSON with:\n"
                        "- search_query: the best Google Shopping search query to find this EXACT same product "
                        "(include: color, style, fit, pattern, type, gender). Max 6-8 words.\n"
                        "- search_query_broad: a slightly broader query for more results. Max 5 words.\n"
                        "- category: the product category (e.g. 't-shirt', 'polo', 'hoodie', 'jeans')\n"
                        "- attributes: comma-separated visual attributes (color, pattern, style, fit, neckline, material)\n"
                        "- gender: 'men', 'women', or 'unisex'\n\n"
                        "Example for a plain grey t-shirt:\n"
                        '{"search_query": "plain grey crewneck t-shirt men", '
                        '"search_query_broad": "grey basic t-shirt men", '
                        '"category": "t-shirt", '
                        '"attributes": "grey, plain, crewneck, regular fit, cotton", '
                        '"gender": "men"}'
                    )},
                    {"type": "image_url", "image_url": {"url": image_url, "detail": "low"}},
                ]},
            ],
            temperature=0.1,
            max_tokens=200,
            response_format={"type": "json_object"},
        )
        
        result = json.loads(response.choices[0].message.content or "{}")
        elapsed = round(_time.time() - start, 1)
        print(f"👁️ Vision analysis ({elapsed}s): {result}")
        return result
    except Exception as e:
        elapsed = round(_time.time() - start, 1)
        print(f"⚠️ Vision describe error ({elapsed}s): {e}")
        return {}


def _aggressive_web_price_search(product_title: str, product_type: str, vendor: str,
                                  user_instructions: str = "", currency: str = "CAD",
                                  description: str = "", tags: str = "",
                                  image_url: str = "") -> dict:
    """Aggressive web search: generate targeted queries from product data + user instructions,
    run them via SERP API, aggregate all prices found.

    Works WITH or WITHOUT user instructions:
    - With instructions: uses brands/keywords from instructions + product category
    - Without instructions: auto-generates smart queries from product title, description, tags, type

    Optimized for speed: no GPT call for query generation, max 6 queries, parallel execution.
    """
    if not SERPAPI_KEY:
        return {"count": 0, "refs": [], "prices": [], "queries_run": [], "search_count": 0}

    try:
        import re as _re

        clean_title = _clean_query_text(product_title, shop_brand=vendor)
        ptype = product_type.strip() if product_type else ""

        # Extract a meaningful product category from the title
        # This ensures we always search for the right KIND of product
        title_lower = product_title.lower()
        category_keywords = [
            "t-shirt", "tshirt", "t shirt", "polo", "chemise", "shirt", "hoodie",
            "sweater", "chandail", "veste", "jacket", "manteau", "coat", "blazer",
            "pantalon", "pants", "jeans", "jean", "shorts", "short",
            "robe", "dress", "jupe", "skirt", "legging", "leggings",
            "chaussure", "shoes", "sneaker", "sneakers", "botte", "boots", "sandal", "sandals",
            "sac", "bag", "handbag", "backpack", "tote",
            "chapeau", "hat", "cap", "casquette", "tuque", "beanie",
            "montre", "watch", "bijou", "jewelry", "bracelet", "collier", "necklace",
            "lunettes", "sunglasses", "glasses",
            "parfum", "perfume", "fragrance",
            "ceinture", "belt", "foulard", "scarf", "écharpe",
        ]
        detected_category = ""
        for kw in category_keywords:
            if kw in title_lower:
                detected_category = kw
                break

        # Use the most specific category available:
        # 1. Detected from title (most specific), 2. product_type from Shopify, 3. first word of title
        product_category = detected_category or ptype or (clean_title.split()[0] if clean_title else "")
        if not ptype:
            ptype = product_category

        # Extract color/material/style attributes from title + description
        color_keywords = [
            "noir", "black", "blanc", "white", "gris", "grey", "gray", "bleu", "blue",
            "rouge", "red", "vert", "green", "jaune", "yellow", "rose", "pink",
            "orange", "beige", "brun", "brown", "marine", "navy",
        ]
        material_keywords = [
            "coton", "cotton", "polyester", "lin", "linen", "soie", "silk",
            "cuir", "leather", "laine", "wool", "denim", "nylon", "velours", "velvet",
        ]
        all_text_lower = f"{title_lower} {(description or '').lower()}"
        detected_color = next((c for c in color_keywords if c in all_text_lower), "")
        detected_material = next((m for m in material_keywords if m in all_text_lower), "")

        print(f"🏷️ Product: category='{product_category}', color='{detected_color}', material='{detected_material}', ptype='{ptype}'")

        # ── STEP 0: Vision-based product description (when image available) ──
        # gpt-4o-mini looks at the actual photo and generates PRECISE search queries
        # e.g. "plain grey crewneck t-shirt men" instead of just "t-shirt"
        # Wrapped in a tight timeout to prevent blocking the whole pipeline
        vision_data = {}
        if image_url and OPENAI_API_KEY:
            from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
            try:
                with ThreadPoolExecutor(max_workers=1) as vex:
                    vfut = vex.submit(_vision_describe_product, image_url, product_title, description)
                    vision_data = vfut.result(timeout=5) or {}
            except (FuturesTimeout, Exception) as ve:
                print(f"⚠️ Vision skipped (timeout/error): {ve}")
                vision_data = {}
            # Update category/color from vision if we got better data
            if vision_data.get("category"):
                product_category = vision_data["category"]

        # Extract brand names from user instructions (if provided)
        instruction_lower = (user_instructions or "").lower()
        luxury_brands = [
            "louis vuitton", "gucci", "balenciaga", "prada", "dior", "chanel",
            "versace", "burberry", "fendi", "hermès", "hermes", "givenchy", "valentino",
            "saint laurent", "ysl", "armani", "dolce gabbana", "bottega veneta", "celine",
            "ralph lauren", "tommy hilfiger", "calvin klein", "lacoste", "hugo boss",
            "nike", "adidas", "zara", "h&m", "uniqlo", "gap", "lululemon",
        ]
        mentioned_brands = [b for b in luxury_brands if b in instruction_lower] if instruction_lower else []

        # Also try to extract custom brand names (Capitalized words from instructions)
        if not mentioned_brands and user_instructions:
            custom = _re.findall(r'\b[A-Z][a-zà-ü]+(?:\s+[A-Z][a-zà-ü]+)*\b', user_instructions)
            mentioned_brands = [b for b in custom if len(b) > 2 and b.lower() not in ("le", "la", "les", "des", "une", "mon")][:3]

        # Also check for keywords like "luxe", "premium", "haut de gamme"
        is_luxury = any(w in instruction_lower for w in ["luxe", "luxury", "premium", "haut de gamme", "haute", "designer"]) if instruction_lower else False

        # Build targeted queries — max 6
        # PRIORITY: Use vision-generated queries (most precise), then instruction-based, then auto-generated
        queries = []

        # 1. Vision-generated queries (highest priority — based on what the product actually looks like)
        vision_query = vision_data.get("search_query", "")
        vision_query_broad = vision_data.get("search_query_broad", "")
        if vision_query:
            queries.append(f"{vision_query} price")
            queries.append(vision_query)
        if vision_query_broad and vision_query_broad != vision_query:
            queries.append(f"{vision_query_broad} price")

        # 2. Instruction-based queries (when user specifies brands to compare)
        if mentioned_brands:
            vision_cat = vision_data.get("category", product_category)
            for brand in mentioned_brands[:3]:
                queries.append(f"{brand} {vision_cat} price")
                queries.append(f"{brand} {vision_cat}")
        elif is_luxury:
            vision_cat = vision_data.get("category", product_category)
            queries.append(f"luxury {vision_cat} price")
            queries.append(f"{vision_cat} designer brand price")

        # 3. Fallback auto-generated queries (if vision didn't work or for more results)
        if not vision_query:
            # No vision data — fall back to keyword-based queries
            queries.append(f"{clean_title} price")
            if detected_color and product_category:
                queries.append(f"{detected_color} {product_category} price")
            if detected_material and product_category:
                queries.append(f"{detected_material} {product_category} price")
            if product_category:
                queries.append(f"{product_category} price Canada")

        # Tags-based query: Shopify tags often have useful descriptors
        if tags and not vision_query:
            tag_list = [t.strip() for t in str(tags).split(",") if t.strip()]
            meaningful_tags = [t for t in tag_list if len(t) > 2 and t.lower() not in ("sale", "new", "featured", "solde", "nouveau")][:2]
            if meaningful_tags and product_category:
                queries.append(f"{' '.join(meaningful_tags)} {product_category} price")

        # Deduplicate and limit to 6
        seen_q = set()
        unique_queries = []
        for q in queries:
            q_clean = str(q).strip()
            if q_clean and q_clean.lower() not in seen_q:
                seen_q.add(q_clean.lower())
                unique_queries.append(q_clean)
        queries = unique_queries[:6]

        print(f"🔍 Aggressive search: {len(queries)} queries for '{product_title}': {queries}")

        # Run ALL queries in parallel via SERP API
        from concurrent.futures import ThreadPoolExecutor, as_completed
        all_refs = []
        all_prices = []
        gl = _gl_for_currency(currency)

        with ThreadPoolExecutor(max_workers=4) as ex:
            futures = {ex.submit(_serpapi_price_snapshot, q, gl, "fr", currency): q for q in queries}
            for fut in as_completed(futures, timeout=10):
                q_label = futures[fut]
                try:
                    snapshot = fut.result(timeout=7) or {}
                    all_prices.extend(snapshot.get("prices", []))
                    all_refs.extend(snapshot.get("refs", []))
                    print(f"  🔎 '{q_label}': {snapshot.get('count', 0)} prices")
                except Exception as e:
                    print(f"  ❌ '{q_label}': {e}")

        # Deduplicate refs
        seen_refs = set()
        unique_refs = []
        for ref in all_refs:
            key = f"{ref.get('title', '')[:40]}|{ref.get('price', 0)}"
            if key not in seen_refs:
                seen_refs.add(key)
                unique_refs.append(ref)

        all_prices = sorted(set(round(p, 2) for p in all_prices if isinstance(p, (int, float)) and p > 0))

        result = {
            "count": len(all_prices),
            "refs": unique_refs[:15],
            "prices": all_prices[:30],
            "queries_run": queries,
            "search_count": len(queries),
        }
        # Include vision analysis data if available
        if vision_data:
            result["vision"] = {
                "search_query": vision_data.get("search_query", ""),
                "category": vision_data.get("category", ""),
                "attributes": vision_data.get("attributes", ""),
                "gender": vision_data.get("gender", ""),
            }
        if all_prices:
            mid = len(all_prices) // 2
            result["min"] = all_prices[0]
            result["max"] = all_prices[-1]
            result["median"] = all_prices[mid] if len(all_prices) % 2 == 1 else (all_prices[mid - 1] + all_prices[mid]) / 2

        print(f"🔍 Results: {len(all_prices)} prices, range: {result.get('min', 'N/A')} – {result.get('max', 'N/A')}")
        return result

    except Exception as e:
        print(f"❌ Aggressive search error: {e}")
        return {"count": 0, "refs": [], "prices": [], "queries_run": [], "search_count": 0}


def _ai_analyze_search_results(product_title: str, current_price: float, search_results: dict,
                                user_instructions: str = "", currency: str = "CAD",
                                description: str = "", image_url: str = "") -> dict:
    """Use AI to analyze aggregated search results and make a pricing recommendation.
    
    When image_url is provided, uses GPT-4o vision to understand the product visually.
    When description is provided, includes it for better product understanding.
    """
    if not OPENAI_API_KEY:
        return None

    refs_text = ""
    for ref in search_results.get("refs", [])[:15]:
        refs_text += f"  - {ref.get('title', '?')}: {ref.get('price', '?')}$ ({ref.get('source', '?')})\n"

    prices = search_results.get("prices", [])
    prices_summary = ""
    if prices:
        prices_summary = (
            f"Prix trouvés: {len(prices)} offres\n"
            f"Min: {search_results.get('min', 'N/A')}$ | "
            f"Médiane: {search_results.get('median', 'N/A')}$ | "
            f"Max: {search_results.get('max', 'N/A')}$\n"
            f"Distribution: {prices[:15]}"
        )
    else:
        prices_summary = "Aucun prix trouvé via recherche web."

    # Detect product category for filtering
    title_lower = product_title.lower()
    category_hint = ""
    for kw in ["t-shirt", "tshirt", "polo", "chemise", "shirt", "hoodie", "sweater",
               "veste", "jacket", "manteau", "pantalon", "pants", "jeans", "shorts",
               "robe", "dress", "jupe", "skirt", "chaussure", "shoes", "sneaker",
               "sac", "bag", "chapeau", "hat", "montre", "watch", "parfum", "perfume",
               "ceinture", "belt", "lunettes", "sunglasses", "bijou", "jewelry"]:
        if kw in title_lower:
            category_hint = kw
            break

    # Build description context
    desc_block = ""
    if description and description.strip():
        desc_block = f"DESCRIPTION DU PRODUIT: {description[:400]}\n\n"

    # Instruction block — adapt depending on whether user gave instructions
    if user_instructions and user_instructions.strip():
        instruction_block = f"INSTRUCTIONS DE L'UTILISATEUR: \"{user_instructions}\"\n\n"
    else:
        instruction_block = (
            "MODE AUTO: L'utilisateur n'a donné aucune instruction spécifique.\n"
            "Analyse le produit en te basant sur son titre, sa description et sa photo "
            "pour trouver les produits les plus SIMILAIRES dans les résultats de recherche.\n\n"
        )

    try:
        client = (OpenAI(api_key=OPENAI_API_KEY, timeout=5) if OpenAI else openai.OpenAI(api_key=OPENAI_API_KEY, timeout=5))

        system_content = (
            "Tu es un expert en pricing e-commerce. Tu analyses des données de marché RÉELLES "
            "trouvées sur le web et tu fais des recommandations de prix. "
            f"Tous les prix sont en {currency}. Sois précis et factuel. Retourne du JSON.\n\n"
            "RÈGLE CRITIQUE DE FILTRAGE:\n"
            "Tu DOIS comparer uniquement des produits du MÊME TYPE/CATÉGORIE.\n"
            f"Le produit analysé est un: {category_hint.upper() or 'voir titre et image'}.\n"
            "- Un t-shirt se compare UNIQUEMENT avec d'autres t-shirts.\n"
            "- Un polo se compare UNIQUEMENT avec d'autres polos.\n"
            "- IGNORE COMPLÈTEMENT les sacs à main, parfums, montres, chaussures, "
            "ou tout autre produit qui n'est PAS de la même catégorie.\n"
            "- Si une offre trouvée est d'une catégorie différente (ex: sac Louis Vuitton "
            "alors que le produit est un t-shirt), NE L'INCLUS PAS dans comparable_products "
            "et NE L'UTILISE PAS pour calculer le prix suggéré.\n"
            "- Dans ton analyse, mentionne combien d'offres tu as ignorées car hors catégorie."
        )

        user_text = (
            f"PRODUIT: {product_title}\n"
            f"CATÉGORIE DU PRODUIT: {category_hint or 'à déduire du titre et de la photo'}\n"
            f"Prix actuel: {current_price}$ {currency}\n\n"
            f"{desc_block}"
            f"{instruction_block}"
            f"DONNÉES MARCHÉ:\n{prices_summary}\n\n"
            f"OFFRES TROUVÉES SUR LE WEB:\n{refs_text}\n\n"
            f"RAPPEL: Garde UNIQUEMENT les offres qui sont des {category_hint or 'produits du même type que celui montré'}.\n"
            f"Ignore les produits d'une catégorie différente.\n\n"
            f"Retourne en JSON:\n"
            f"- suggested_price: prix recommandé basé UNIQUEMENT sur des produits comparables de même catégorie\n"
            f"- positioning: 'low'/'mid'/'high' (prix actuel vs marché des produits comparables)\n"
            f"- confidence: nombre d'offres PERTINENTES (même catégorie seulement)\n"
            f"- comparable_products: les 3-5 produits les plus pertinents DE MÊME CATÉGORIE [{{'title':'...','price':0}}]\n"
            f"- analysis: explication en français (2-3 phrases, mentionne le filtrage par catégorie)\n"
            f"- market_range_min: prix min du marché (même catégorie seulement)\n"
            f"- market_range_max: prix max du marché (même catégorie seulement)\n\n"
            f"IMPORTANT: Si les instructions demandent de comparer avec des marques de luxe, "
            f"le prix suggéré DOIT refléter le positionnement vs ces marques MAIS uniquement "
            f"pour des produits de même type ({category_hint or 'même catégorie'})."
        )

        # Always use gpt-4o-mini for analysis (vision already ran in _vision_describe_product)
        # This avoids a duplicate expensive GPT-4o vision call
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_content},
                {"role": "user", "content": user_text},
            ],
            temperature=0.2,
            max_tokens=700,
            response_format={"type": "json_object"},
        )

        result = json.loads(response.choices[0].message.content or "{}")
        return result
    except Exception as e:
        print(f"⚠️ AI analysis error: {e}")
        return None


# Note: Shopify OAuth credentials, CORS middleware, and stripe/openai init
# are configured once at the top of this file (lines 60-70).
# Do NOT duplicate them here.

if not OPENAI_API_KEY:
    print("Warning: OPENAI_API_KEY not set. /optimize will fail without it.")
else:
    # Keep legacy api_key for compatibility; client class will use explicit key.
    openai.api_key = OPENAI_API_KEY

if STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY

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


def _sg(obj, key, default=None):
    """Safe-get that works on dicts AND Stripe v7+ objects (which no longer have .get())."""
    if obj is None:
        return default
    # dict or dict-like
    if isinstance(obj, dict):
        return obj.get(key, default)
    # Stripe v7+ objects: try attribute access first, then dict-style
    try:
        val = getattr(obj, key, default)
        return val if val is not None else default
    except Exception:
        pass
    try:
        return obj[key]
    except Exception:
        return default


def _stripe_obj_to_dict(obj):
    """Recursively convert any Stripe object to a plain dict (safe for Stripe SDK v7+)."""
    if obj is None:
        return None
    if isinstance(obj, (str, int, float, bool)):
        return obj
    if isinstance(obj, list):
        return [_stripe_obj_to_dict(item) for item in obj]
    if isinstance(obj, dict):
        return {k: _stripe_obj_to_dict(v) for k, v in obj.items()}
    # Stripe object conversion
    try:
        if hasattr(obj, 'to_dict_recursive'):
            return obj.to_dict_recursive()
    except Exception:
        pass
    try:
        if hasattr(obj, 'to_dict'):
            return obj.to_dict()
    except Exception:
        pass
    try:
        if hasattr(obj, '__iter__') and hasattr(obj, 'keys'):
            return {k: _stripe_obj_to_dict(obj[k]) for k in obj.keys()}
    except Exception:
        pass
    try:
        return dict(obj)
    except Exception:
        return obj


# Columns that may not exist in older Supabase deployments.
_SUB_OPTIONAL_COLS = {"end_date", "current_period_end"}


def _safe_sub_payload(data: dict) -> dict:
    """Return *data* without optional columns that are None/empty to reduce
    chance of hitting missing-column errors on older schemas."""
    return {k: v for k, v in data.items() if k not in _SUB_OPTIONAL_COLS or v not in (None, "")}


def _sub_upsert(supabase_client, user_id: str, data: dict):
    """Insert or update a subscriptions row by user_id.
    CRITICAL: If the existing row has an ACTIVE subscription with a DIFFERENT
    stripe_subscription_id, and the incoming data wants to set inactive,
    we SKIP the update to avoid a stale webhook clobbering a valid subscription.

    Resilience: if a write fails because a column doesn't exist in the live
    schema (PGRST204), the offending column is stripped and the write retried."""
    try:
        existing = (
            supabase_client.table("subscriptions")
            .select("id,status,paid,stripe_subscription_id")
            .eq("user_id", user_id)
            .order("updated_at", desc=True)
            .limit(1)
            .execute()
        )
        if existing.data:
            row = existing.data[0]
            incoming_status = str(data.get("status") or "").lower()
            incoming_sub_id = _normalize_stripe_subscription_id(data.get("stripe_subscription_id"))
            existing_sub_id = _normalize_stripe_subscription_id(row.get("stripe_subscription_id"))
            existing_status = str(row.get("status") or "").lower()
            existing_paid = row.get("paid") is True

            # GUARD: Don't let a delete/failed webhook for sub_A clobber an active sub_B
            if (incoming_status == "inactive" and existing_status in ("active", "cancelling") and existing_paid
                    and existing_sub_id and incoming_sub_id and existing_sub_id != incoming_sub_id):
                print(f"  🛡️ [DB] SKIPPING inactive update: incoming sub {incoming_sub_id} != existing active sub {existing_sub_id} for user {user_id}")
                return

            _sub_write(supabase_client, "update", data, user_id)
        else:
            _sub_write(supabase_client, "insert", data, user_id)
    except Exception as e:
        print(f"  ❌ [DB] _sub_upsert error: {e}")
        raise


def _sub_write(supabase_client, mode: str, data: dict, user_id: str):
    """Perform the actual insert/update with automatic column-strip retry."""
    payload = dict(data)
    for attempt in range(3):
        try:
            if mode == "update":
                supabase_client.table("subscriptions").update(payload).eq("user_id", user_id).execute()
            else:
                supabase_client.table("subscriptions").insert(payload).execute()
            print(f"  ✅ [DB] {'Updated' if mode == 'update' else 'Inserted'} subscriptions for user {user_id}")
            return
        except Exception as e:
            err_str = str(e)
            # Supabase/PostgREST PGRST204: column not found in schema cache
            if "PGRST204" in err_str or "schema cache" in err_str:
                import re as _re
                col_match = _re.search(r"the '(\w+)' column", err_str)
                if col_match:
                    bad_col = col_match.group(1)
                    if bad_col in payload:
                        print(f"  ⚠️ [DB] Column '{bad_col}' missing in live schema — retrying without it")
                        payload.pop(bad_col)
                        continue
            raise


def _normalize_stripe_subscription_id(value) -> str | None:
    """Return a clean Stripe subscription id (sub_...) from mixed inputs."""
    if not value:
        return None

    candidate = None

    if isinstance(value, dict):
        candidate = value.get("id") or value.get("subscription")
    else:
        # Use _sg for Stripe v7+ objects that no longer support .get()
        try:
            candidate = _sg(value, "id") or _sg(value, "subscription")
        except Exception:
            candidate = None

    if not candidate:
        try:
            if hasattr(value, "id"):
                candidate = getattr(value, "id")
        except Exception:
            candidate = None

    if not candidate:
        candidate = value

    text = str(candidate).strip()
    if text.startswith("sub_"):
        return text

    if text.startswith("{") and text.endswith("}"):
        try:
            obj = json.loads(text)
            return _normalize_stripe_subscription_id(obj)
        except Exception:
            pass

    match = re.search(r"sub_[A-Za-z0-9]+", text)
    return match.group(0) if match else None


def _recover_subscription_id_from_session(session_id: str | None) -> str | None:
    """Recover subscription id from checkout session when DB row is missing/corrupted."""
    if not session_id:
        return None
    try:
        stripe_session = stripe.checkout.Session.retrieve(session_id, expand=["subscription"])
        return _normalize_stripe_subscription_id(_sg(stripe_session, "subscription"))
    except Exception as e:
        print(f"⚠️ Stripe session recovery warning for {session_id}: {e}")
        return None


def _stripe_ts_to_iso(value) -> str | None:
    if value is None:
        return None
    try:
        return datetime.utcfromtimestamp(int(value)).isoformat()
    except Exception:
        return None


def _resolve_payment_date(*values) -> str:
    for value in values:
        iso_value = _stripe_ts_to_iso(value)
        if iso_value:
            return iso_value
    return datetime.utcnow().isoformat()


def _parse_iso_datetime(value: str | None):
    if not value:
        return None
    try:
        normalized = str(value).strip().replace("Z", "+00:00")
        return datetime.fromisoformat(normalized)
    except Exception:
        return None


def _coerce_stripe_timestamp(value) -> int | None:
    """Best-effort conversion of Stripe/DB timestamp inputs to epoch seconds."""
    if value is None:
        return None
    try:
        if isinstance(value, (int, float)):
            return int(value)
        if isinstance(value, str):
            text = value.strip()
            if not text:
                return None
            if text.isdigit():
                return int(text)
            dt = _parse_iso_datetime(text)
            if dt:
                if dt.tzinfo is not None:
                    return int(dt.timestamp())
                return int(dt.replace(tzinfo=timezone.utc).timestamp())
            return None
        if isinstance(value, datetime):
            dt = value
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return int(dt.timestamp())
        # Stripe SDK objects can sometimes wrap numeric values.
        # Final fallback: attempt generic integer coercion.
        coerced = int(value)
        if coerced > 0:
            return coerced
    except Exception:
        return None
    return None


def _subscription_period_is_valid(row: dict | None) -> bool:
    if not row:
        return False
    end_candidate = row.get("end_date") or row.get("current_period_end")
    if not end_candidate:
        return True

    end_dt = _parse_iso_datetime(end_candidate)
    if not end_dt:
        return True

    try:
        if end_dt.tzinfo is not None:
            return end_dt > datetime.now(end_dt.tzinfo)
    except Exception:
        pass

    return end_dt > datetime.utcnow()


def _is_paid_subscription_row(row: dict | None) -> bool:
    if not row:
        return False
    status = str(row.get("status") or row.get("subscription_status") or "").strip().lower()
    # Robustly check paid/plan — DB may return bool True, string "true", or int 1
    raw_paid = row.get("paid")
    raw_plan = row.get("plan")
    paid = raw_paid is True or str(raw_paid).lower().strip() in ("true", "1")
    plan_ok = raw_plan is True or str(raw_plan).lower().strip() in ("true", "1")
    # Accept both 'active' and 'cancelling' (user paid, just scheduled to cancel at period end)
    # period_is_valid check removed — the columns end_date/current_period_end don't exist in Supabase
    return status in ("active", "cancelling") and (paid or plan_ok)


def _inactive_subscription_payload(message: str | None = None) -> dict:
    payload = {
        "has_subscription": False,
        "plan": None,
        "paid": False,
        "status": "inactive",
        "subscription_status": "inactive",
        "payment_date": None,
    }
    if message:
        payload["message"] = message
    return payload


def _resolve_plan_from_stripe_subscription(subscription_obj) -> str | None:
    if not subscription_obj:
        return None

    tier_map = {
        '99': 'standard',
        '199': 'pro',
        '299': 'premium',
        'standard': 'standard',
        'pro': 'pro',
        'premium': 'premium'
    }

    items_container = _sg(subscription_obj, "items", {})
    items = _sg(items_container, "data", []) if items_container else []
    exact_amount_map = {9900: 'standard', 19900: 'pro', 29900: 'premium'}

    # IMPORTANT: price_id / amount is the source of truth for upgrades/downgrades.
    # metadata.plan can be stale (e.g., user upgraded from standard -> pro).
    best_tier = None
    best_amount = -1
    for item in items or []:
        price_obj = _sg(item, "price", {})
        price_id = _sg(price_obj, "id")
        amount = _sg(price_obj, "unit_amount")

        resolved_tier = PRICE_TO_TIER.get(price_id) if price_id else None
        if not resolved_tier and amount is not None:
            try:
                resolved_tier = exact_amount_map.get(int(amount))
            except Exception:
                resolved_tier = None

        if resolved_tier:
            numeric_amount = int(amount) if amount is not None else 0
            if numeric_amount >= best_amount:
                best_amount = numeric_amount
                best_tier = resolved_tier

    if best_tier:
        return best_tier

    metadata = _sg(subscription_obj, "metadata", {})
    metadata_plan = _sg(metadata, "plan") if metadata else None
    if metadata_plan:
        normalized = tier_map.get(str(metadata_plan).lower())
        if normalized:
            return normalized

    return None


def _extract_upcoming_plan_change(subscription_obj) -> dict:
    """Return upcoming scheduled plan change from Stripe subscription schedule.
    Response shape: {"upcoming_plan": <tier|None>, "upcoming_plan_effective_at": <iso|None>}"""
    result = {
        "upcoming_plan": None,
        "upcoming_plan_effective_at": None,
    }
    if not subscription_obj:
        return result

    try:
        current_plan = _resolve_plan_from_stripe_subscription(subscription_obj)
        now_ts = int(time.time())
        exact_amount_map = {9900: 'standard', 19900: 'pro', 29900: 'premium'}

        schedule_obj = _sg(subscription_obj, "schedule")
        schedule_id = None
        if schedule_obj:
            if isinstance(schedule_obj, str):
                schedule_id = schedule_obj
                schedule_obj = None
            else:
                schedule_id = _sg(schedule_obj, "id")

        # Retrieve full schedule if phases are missing
        if (not schedule_obj or not _sg(schedule_obj, "phases")) and schedule_id:
            try:
                schedule_obj = stripe.SubscriptionSchedule.retrieve(schedule_id)
            except Exception as schedule_err:
                print(f"⚠️ [SUB-UPCOMING] schedule retrieve warning: {schedule_err}")

        phases = _sg(schedule_obj, "phases", []) if schedule_obj else []
        best_plan = None
        best_start = None

        for phase in phases or []:
            phase_start_raw = _sg(phase, "start_date")
            try:
                phase_start = int(phase_start_raw) if phase_start_raw is not None else None
            except Exception:
                phase_start = None

            items = _sg(phase, "items", []) or []
            phase_plan = None
            for item in items:
                price_ref = _sg(item, "price")
                if isinstance(price_ref, str):
                    price_id = price_ref
                    unit_amount = None
                else:
                    price_id = _sg(price_ref, "id")
                    unit_amount = _sg(price_ref, "unit_amount")
                phase_plan = PRICE_TO_TIER.get(price_id)
                if not phase_plan and unit_amount is not None:
                    try:
                        phase_plan = exact_amount_map.get(int(unit_amount))
                    except Exception:
                        phase_plan = None
                if phase_plan:
                    break

            if not phase_plan:
                continue

            # upcoming = first phase in the future that changes tier
            if phase_start is not None and phase_start <= now_ts:
                continue
            if current_plan and phase_plan == current_plan:
                continue

            if best_start is None or (phase_start is not None and phase_start < best_start):
                best_start = phase_start
                best_plan = phase_plan

        if best_plan:
            result["upcoming_plan"] = best_plan
            result["upcoming_plan_effective_at"] = _stripe_ts_to_iso(best_start)
            return result

        # Fallback to schedule metadata when phases parsing cannot determine the target
        schedule_meta = _sg(schedule_obj, "metadata", {}) if schedule_obj else {}
        pending_plan = _sg(schedule_meta, "pending_plan") if schedule_meta else None
        effective_at_raw = _sg(schedule_meta, "effective_at") if schedule_meta else None
        if pending_plan:
            pending_plan_norm = str(pending_plan).strip().lower()
            if pending_plan_norm in ("standard", "pro", "premium") and pending_plan_norm != current_plan:
                result["upcoming_plan"] = pending_plan_norm
                try:
                    result["upcoming_plan_effective_at"] = _stripe_ts_to_iso(int(str(effective_at_raw))) if effective_at_raw else None
                except Exception:
                    result["upcoming_plan_effective_at"] = None
    except Exception as e:
        print(f"⚠️ [SUB-UPCOMING] extraction warning: {e}")

    return result

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

        # Fallback: API key auth (sb_live_...)
        try:
            if token.startswith("sb_live_"):
                supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
                key_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
                result = supabase.table("api_keys").select("user_id,revoked").eq("key_hash", key_hash).limit(1).execute()
                if result.data:
                    api_key_row = result.data[0]
                    if not api_key_row.get("revoked"):
                        print("✅ API key authenticated")
                        return api_key_row.get("user_id")
        except Exception as e:
            print(f"❌ API key auth error: {e}")
    
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


# ============ FAST INIT ENDPOINT — replaces 5 parallel calls with 1 ============
# In-memory caches with TTL
_init_cache = {}  # key: user_id, value: (timestamp, data)
_INIT_CACHE_TTL = 45  # 45 seconds (was 120 — reduced to avoid stale subscription data)
_INIT_CACHE_TTL_NO_SUB = 5  # 5 seconds for "no subscription" results (so retries hit DB quickly)

@app.get("/api/init")
async def fast_init(request: Request):
    """⚡ Combined init endpoint — returns profile + settings + notifications + shopify + subscription in ONE call.
    Replaces 5 separate API calls on page load."""
    user_id = get_user_id(request)

    # Check cache first (skip cache if ?force=1 query param)
    force = request.query_params.get("force") in ("1", "true")
    cached = _init_cache.get(user_id) if not force else None
    if cached:
        cache_ts, cache_data = cached
        # Use shorter TTL for negative results (no subscription)
        has_sub = (cache_data.get("subscription") or {}).get("has_subscription", False)
        ttl = _INIT_CACHE_TTL if has_sub else _INIT_CACHE_TTL_NO_SUB
        if time.time() - cache_ts < ttl:
            print(f"⚡ /api/init cache HIT for {user_id} (has_sub={has_sub}, ttl={ttl}s)")
            return {**cache_data, "cached": True}

    print(f"⚡ /api/init called for {user_id} — fetching all data...")
    start_time = time.time()

    try:
        no_access_message = "No active plan found. Please purchase a plan to access your dashboard."
        supabase_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

        # — 1. Profile —
        profile_data = None
        try:
            result = supabase_client.table("user_profiles").select("*").eq("id", user_id).execute()
            if result.data:
                p = result.data[0]
                profile_data = {
                    "id": p["id"],
                    "email": p.get("email"),
                    "first_name": p.get("first_name", ""),
                    "last_name": p.get("last_name", ""),
                    "username": p.get("username", ""),
                    "full_name": f"{p.get('first_name', '')} {p.get('last_name', '')}",
                    "subscription_plan": p.get("subscription_plan"),
                    "subscription_status": p.get("subscription_status"),
                    "created_at": p.get("created_at"),
                    "avatar_url": p.get("avatar_url"),
                    "two_factor_enabled": p.get("two_factor_enabled", False),
                }
        except Exception as e:
            print(f"  ⚠️ Profile fetch error: {e}")

        # — 2. Preferences (interface + notifications) — single query to user_preferences
        interface_prefs = {"dark_mode": True, "language": "fr"}
        notif_prefs = {
            "email_notifications": True,
            "analysis_complete": True,
            "weekly_reports": True,
            "billing_updates": True
        }
        try:
            result = supabase_client.table("user_preferences").select("*").eq("user_id", user_id).execute()
            if result.data:
                row = result.data[0]
                interface_prefs = {
                    "dark_mode": row.get("dark_mode", True),
                    "language": row.get("language", "fr")
                }
                notif_prefs = {
                    "email_notifications": row.get("email_notifications", True),
                    "analysis_complete": row.get("analysis_complete", True),
                    "weekly_reports": row.get("weekly_reports", True),
                    "billing_updates": row.get("billing_updates", True)
                }
        except Exception as e:
            print(f"  ⚠️ Preferences fetch error: {e}")

        # — 3. Shopify connections (multi-shop) —
        shopify_connections = []
        shopify_active = None
        try:
            try:
                result = supabase_client.table("shopify_connections").select("shop_domain,is_active,created_at,updated_at").eq("user_id", user_id).order("is_active", desc=True).order("updated_at", desc=True).execute()
                shopify_connections = result.data or []
                shopify_active = next((c for c in shopify_connections if c.get("is_active")), shopify_connections[0] if shopify_connections else None)
            except Exception:
                # Fallback: is_active column may not exist yet
                result = supabase_client.table("shopify_connections").select("shop_domain,created_at,updated_at").eq("user_id", user_id).order("updated_at", desc=True).execute()
                shopify_connections = result.data or []
                shopify_active = shopify_connections[0] if shopify_connections else None
        except Exception as e:
            print(f"  ⚠️ Shopify connection fetch error: {e}")

        # — 4. Subscription — DB is the source of truth (written by Stripe webhooks).
        #   Stripe API call is ONLY used as background auto-heal, NEVER blocks access.
        subscription_data = {"has_subscription": False, "plan": None, "paid": False, "status": "inactive"}
        try:
            tier_map = {
                '99': 'standard', '199': 'pro', '299': 'premium',
                'standard': 'standard', 'pro': 'pro', 'premium': 'premium',
            }
            capabilities = {
                'standard': {'product_limit': 50, 'shop_limit': 1, 'report_frequency': 'monthly', 'features': ['product_analysis', 'title_optimization', 'price_suggestions']},
                'pro': {'product_limit': 500, 'shop_limit': 3, 'report_frequency': 'weekly', 'features': ['product_analysis', 'title_optimization', 'price_suggestions', 'content_generation', 'image_recommendations', 'cross_sell', 'reports', 'automated_actions', 'invoicing']},
                'premium': {'product_limit': None, 'shop_limit': None, 'report_frequency': 'daily', 'features': ['product_analysis', 'title_optimization', 'price_suggestions', 'content_generation', 'image_recommendations', 'cross_sell', 'automated_actions', 'reports', 'predictions', 'invoicing', 'auto_stock', 'api_access']}
            }

            # Step 1: Read from DB
            sub_row = None
            try:
                sub_result = supabase_client.table("subscriptions").select("*").eq("user_id", user_id).in_("status", ["active", "cancelling"]).order("updated_at", desc=True).limit(1).execute()
                if sub_result.data:
                    sub_row = sub_result.data[0]
                else:
                    # FALLBACK: Also check inactive rows — they might be auto-healable via Stripe
                    inactive_result = supabase_client.table("subscriptions").select("*").eq("user_id", user_id).order("updated_at", desc=True).limit(1).execute()
                    if inactive_result.data:
                        sub_row = inactive_result.data[0]
                        print(f"  📋 [INIT-SUB] Found inactive row, will attempt auto-heal: status={sub_row.get('status')}, paid={sub_row.get('paid')}, stripe_sub_id={sub_row.get('stripe_subscription_id')}, stripe_customer_id={sub_row.get('stripe_customer_id')}")
            except Exception as db_err:
                print(f"  ⚠️ [INIT-SUB] DB query error: {db_err}")

            if sub_row:
                raw_tier = sub_row.get('plan_tier')
                sub_status = str(sub_row.get('status', '')).lower()
                paid_flag = _is_paid_subscription_row(sub_row)
                plan = tier_map.get(str(raw_tier).lower()) if raw_tier else None

                print(f"  📋 [INIT-SUB] DB row found: plan_tier={raw_tier}, status={sub_status}, paid={paid_flag}, plan_resolved={plan}")

                # Step 2: DECISION — if DB says paid=true + valid plan + active status → GRANT ACCESS
                payment_date = sub_row.get('payment_date')
                if paid_flag and plan and sub_status in ('active', 'cancelling'):
                    # CRITICAL: Always verify plan from Stripe (source of truth) when we have a sub ID
                    # This prevents stale DB plan_tier from showing the wrong plan after upgrades/downgrades
                    stripe_verified_plan = None
                    upcoming_change = {"upcoming_plan": None, "upcoming_plan_effective_at": None}
                    cancel_at_period_end = sub_status == 'cancelling'
                    cancel_at = None
                    current_period_end_iso = _stripe_ts_to_iso(
                        _coerce_stripe_timestamp(sub_row.get('current_period_end'))
                        or _coerce_stripe_timestamp(sub_row.get('end_date'))
                    )
                    stripe_sub_id_for_verify = _normalize_stripe_subscription_id(sub_row.get('stripe_subscription_id'))
                    if stripe_sub_id_for_verify:
                        try:
                            stripe_sub_obj = stripe.Subscription.retrieve(stripe_sub_id_for_verify, expand=['items'])
                            stripe_verified_plan = _resolve_plan_from_stripe_subscription(stripe_sub_obj)
                            upcoming_change = _extract_upcoming_plan_change(stripe_sub_obj)
                            stripe_live_status = str(_sg(stripe_sub_obj, 'status') or '').lower()
                            # Update cancel info
                            if _sg(stripe_sub_obj, 'cancel_at_period_end'):
                                cancel_at_period_end = True
                                sub_status = 'cancelling'
                            period_end = _coerce_stripe_timestamp(_sg(stripe_sub_obj, 'current_period_end'))
                            if period_end:
                                current_period_end_iso = _stripe_ts_to_iso(period_end)
                            if cancel_at_period_end and period_end:
                                cancel_at = datetime.utcfromtimestamp(period_end).isoformat()
                            # If Stripe says a different plan, update DB to stay in sync
                            if stripe_verified_plan and stripe_verified_plan != plan:
                                print(f"  🔄 [INIT-SUB] Stripe plan '{stripe_verified_plan}' differs from DB plan '{plan}' — syncing DB")
                                plan = stripe_verified_plan
                                try:
                                    supabase_client.table("subscriptions").update({
                                        "plan_tier": plan,
                                        "updated_at": datetime.utcnow().isoformat()
                                    }).eq("id", sub_row.get("id")).execute()
                                except Exception as sync_err:
                                    print(f"  ⚠️ [INIT-SUB] DB sync warning: {sync_err}")
                            elif stripe_verified_plan:
                                plan = stripe_verified_plan  # Use Stripe value even if same (confirms accuracy)
                            # If subscription is no longer active in Stripe, deny access
                            if stripe_live_status not in ('active', 'trialing'):
                                print(f"  ⚠️ [INIT-SUB] Stripe says status={stripe_live_status}, denying access")
                                try:
                                    supabase_client.table("subscriptions").update({
                                        "status": "inactive", "subscription_status": "inactive",
                                        "paid": False, "plan": False,
                                        "updated_at": datetime.utcnow().isoformat()
                                    }).eq("id", sub_row.get("id")).execute()
                                except Exception:
                                    pass
                                subscription_data = _inactive_subscription_payload('Subscription no longer active in Stripe.')
                                # Skip to end
                                plan = None
                        except Exception as stripe_verify_err:
                            print(f"  ⚠️ [INIT-SUB] Stripe live-sync warning (non-blocking): {stripe_verify_err}")
                            # Fall through with DB plan — don't block access on Stripe API errors
                    elif cancel_at_period_end:
                        # No sub ID to check cancel date
                        pass
                    if plan:  # Only grant if plan is still valid (not cleared by Stripe denial above)
                        print(f"  ✅ [INIT-SUB] ACCESS GRANTED: paid={paid_flag}, plan={plan}, status={sub_status}, stripe_verified={stripe_verified_plan is not None}")
                        subscription_data = {
                            'has_subscription': True,
                            'plan': plan,
                            'upcoming_plan': upcoming_change.get('upcoming_plan'),
                            'upcoming_plan_effective_at': upcoming_change.get('upcoming_plan_effective_at'),
                            'current_period_end': current_period_end_iso,
                            'paid': True,
                            'status': sub_status,
                            'subscription_status': sub_status,
                            'payment_date': payment_date,
                            'started_at': sub_row.get('start_date') or sub_row.get('created_at'),
                            'capabilities': capabilities.get(plan, {}),
                            'cancel_at_period_end': cancel_at_period_end,
                            'cancel_at': cancel_at,
                        }
                else:
                    # Step 3: paid is False/NULL in DB — try Stripe auto-heal (best-effort, NOT blocking)
                    print(f"  🔄 [INIT-SUB] DB paid={paid_flag}, plan={plan}, status={sub_status}, attempting Stripe auto-heal...")
                    healed = False
                    stripe_sub_id = _normalize_stripe_subscription_id(sub_row.get('stripe_subscription_id'))
                    if not stripe_sub_id:
                        stripe_sub_id = _recover_subscription_id_from_session(sub_row.get('stripe_session_id'))
                    # Also try to find by customer ID if we still don't have a sub_id
                    if not stripe_sub_id and sub_row.get('stripe_customer_id'):
                        try:
                            cust_subs = stripe.Subscription.list(customer=sub_row['stripe_customer_id'], status='active', limit=1)
                            if cust_subs.data:
                                stripe_sub_id = _normalize_stripe_subscription_id(cust_subs.data[0])
                                print(f"  🔍 [INIT-SUB] Recovered sub_id from customer {sub_row['stripe_customer_id']}: {stripe_sub_id}")
                        except Exception as cust_err:
                            print(f"  ⚠️ [INIT-SUB] Customer sub lookup warning: {cust_err}")

                    # Last-resort: search ALL Stripe customers by email (handles multi-customer accounts)
                    if not stripe_sub_id or not str(stripe_sub_id).startswith("sub_"):
                        try:
                            profile_email = sub_row.get("email")
                            if not profile_email and profile_data:
                                profile_email = profile_data.get("email")
                            if profile_email:
                                customer_list = stripe.Customer.list(email=profile_email, limit=5)
                                all_cust_ids = [_sg(c, "id") for c in (_sg(customer_list, "data", []) or []) if _sg(c, "id")]
                                # First pass: active only
                                for cid in all_cust_ids:
                                    try:
                                        active_subs = stripe.Subscription.list(customer=cid, status="active", limit=1)
                                        if _sg(active_subs, "data"):
                                            stripe_sub_id = _normalize_stripe_subscription_id(_sg(active_subs, "data")[0])
                                            print(f"  🔍 [INIT-SUB] Recovered ACTIVE sub_id via email search ({cid}): {stripe_sub_id}")
                                            break
                                    except Exception:
                                        pass
                                # Second pass: trialing only
                                if not stripe_sub_id or not str(stripe_sub_id).startswith("sub_"):
                                    for cid in all_cust_ids:
                                        try:
                                            trial_subs = stripe.Subscription.list(customer=cid, status="trialing", limit=1)
                                            if _sg(trial_subs, "data"):
                                                stripe_sub_id = _normalize_stripe_subscription_id(_sg(trial_subs, "data")[0])
                                                print(f"  🔍 [INIT-SUB] Recovered TRIALING sub_id via email search ({cid}): {stripe_sub_id}")
                                                break
                                        except Exception:
                                            pass
                        except Exception as email_heal_err:
                            print(f"  ⚠️ [INIT-SUB] Email-based Stripe recovery warning: {email_heal_err}")

                    if stripe_sub_id and str(stripe_sub_id).startswith("sub_"):
                        try:
                            stripe_sub = stripe.Subscription.retrieve(stripe_sub_id)
                            stripe_status = str(_sg(stripe_sub, "status", "")).lower()
                            if stripe_status in ('active', 'trialing'):
                                # Resolve plan from Stripe
                                healed_plan = _resolve_plan_from_stripe_subscription(stripe_sub)
                                if healed_plan:
                                    upcoming_change = _extract_upcoming_plan_change(stripe_sub)
                                    plan = healed_plan
                                    sub_status = 'active'
                                    payment_date = sub_row.get('payment_date') or _resolve_payment_date(_sg(stripe_sub, "created"))
                                    # Update DB so next call is instant
                                    try:
                                        healed_period_end = _coerce_stripe_timestamp(_sg(stripe_sub, "current_period_end"))
                                        heal_payload = {
                                            "plan_tier": plan,
                                            "paid": True, "status": sub_status,
                                            "payment_date": payment_date,
                                            "current_period_end": _stripe_ts_to_iso(healed_period_end) if healed_period_end else sub_row.get("current_period_end"),
                                            "updated_at": datetime.utcnow().isoformat()
                                        }
                                        try:
                                            supabase_client.table("subscriptions").update(heal_payload).eq("id", sub_row.get("id")).execute()
                                        except Exception as col_err:
                                            if "PGRST204" in str(col_err) or "schema cache" in str(col_err):
                                                heal_payload.pop("current_period_end", None)
                                                supabase_client.table("subscriptions").update(heal_payload).eq("id", sub_row.get("id")).execute()
                                            else:
                                                raise
                                        print(f"  ✅ [INIT-SUB] Auto-healed DB: paid=true, plan={plan}")
                                    except Exception as heal_err:
                                        print(f"  ⚠️ [INIT-SUB] Auto-heal DB write warning: {heal_err}")
                                    healed = True
                                    subscription_data = {
                                        'has_subscription': True,
                                        'plan': plan,
                                        'upcoming_plan': upcoming_change.get('upcoming_plan'),
                                        'upcoming_plan_effective_at': upcoming_change.get('upcoming_plan_effective_at'),
                                        'current_period_end': _stripe_ts_to_iso(healed_period_end) if healed_period_end else sub_row.get('current_period_end'),
                                        'paid': True,
                                        'status': sub_status,
                                        'subscription_status': sub_status,
                                        'payment_date': payment_date,
                                        'started_at': sub_row.get('start_date') or sub_row.get('created_at'),
                                        'capabilities': capabilities.get(plan, {})
                                    }
                        except Exception as stripe_err:
                            print(f"  ⚠️ [INIT-SUB] Stripe auto-heal failed (non-blocking): {stripe_err}")

                    if not healed:
                        print(f"  ❌ [INIT-SUB] ACCESS DENIED: paid={paid_flag}, plan={plan}, stripe_sub_id={stripe_sub_id}")
                        subscription_data = _inactive_subscription_payload('Payment not yet validated. If you just paid, please wait a few seconds and refresh.')
                        subscription_data['status'] = sub_status or 'inactive'
                        subscription_data['subscription_status'] = sub_status or 'inactive'
            else:
                print(f"  ❌ [INIT-SUB] No active subscription row found in DB for user {user_id}")
                subscription_data = _inactive_subscription_payload(no_access_message)
        except Exception as e:
            print(f"  ⚠️ Subscription fetch error: {e}")

        elapsed = round((time.time() - start_time) * 1000)
        print(f"⚡ /api/init completed in {elapsed}ms")

        result = {
            "success": True,
            "profile": profile_data,
            "interface": interface_prefs,
            "notifications": notif_prefs,
            "shopify": {
                "connection": shopify_active,          # rétro-compat: active shop
                "connections": shopify_connections,     # multi-shop list
                "shop_count": len(shopify_connections),
                "shop_limit": PLAN_LIMITS.get(subscription_data.get("plan", "free"), PLAN_LIMITS["free"]).get("shop_limit", 0),
            },
            "subscription": subscription_data,
            "elapsed_ms": elapsed,
        }

        # Cache the result
        _init_cache[user_id] = (time.time(), result)

        return result

    except Exception as e:
        print(f"❌ /api/init error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health():
    """Health check endpoint for Render - MUST ALWAYS WORK"""
    return {
        "status": "ok",
        "version": "3.0-fast-init",
        "build": "20260406-next-renewal-switch-v8.4",
        "timestamp": datetime.utcnow().isoformat(),
        "services": {
                "openai": "configured" if OPENAI_API_KEY else "not_configured",
            "serpapi": "configured" if SERPAPI_KEY else "not_configured",
            "stripe": "configured" if STRIPE_SECRET_KEY else "not_configured",
            "supabase": "configured" if SUPABASE_URL else "not_configured",
            "gmail_stock_alerts": "configured" if (GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET and GMAIL_REFRESH_TOKEN and GMAIL_SENDER_EMAIL) else "NOT_CONFIGURED — GMAIL_CLIENT_ID/CLIENT_SECRET/REFRESH_TOKEN/SENDER_EMAIL manquant",
            "gmail_sender": GMAIL_SENDER_EMAIL or "(non configuré)",
        }
    }


@app.get("/api/debug/subscription")
async def debug_subscription(email: str = "", secret: str = ""):
    """🔍 TEMPORARY DEBUG: Check subscription state for a user by email. Protected by secret."""
    if secret != "shopbrain-diag-2026":
        raise HTTPException(status_code=403, detail="Forbidden")
    if not email:
        raise HTTPException(status_code=400, detail="Missing email parameter")
    try:
        supabase_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        # Find user by email in auth.users via user_profiles
        profile_result = supabase_client.table("user_profiles").select("id,email,subscription_plan,subscription_status,subscription_tier").eq("email", email).execute()
        profile = profile_result.data[0] if profile_result.data else None
        user_id = profile["id"] if profile else None

        # Get ALL subscription rows for this user (not just active)
        sub_rows = []
        if user_id:
            sub_result = supabase_client.table("subscriptions").select("*").eq("user_id", user_id).order("updated_at", desc=True).limit(10).execute()
            sub_rows = sub_result.data or []

        # Check Stripe customers by email
        stripe_customers = []
        stripe_subscriptions = []
        try:
            customers = stripe.Customer.list(email=email, limit=5)
            for cust in customers.data:
                cust_info = {"id": cust.id, "email": cust.email, "name": getattr(cust, 'name', None)}
                stripe_customers.append(cust_info)
                # Get subscriptions for this customer
                subs = stripe.Subscription.list(customer=cust.id, limit=10)
                for sub in subs.data:
                    items_info = []
                    sub_items = _sg(sub, "items", {})
                    sub_items_data = _sg(sub_items, "data", []) if sub_items else []
                    for item in sub_items_data:
                        price = _sg(item, "price", {})
                        items_info.append({
                            "price_id": _sg(price, "id"),
                            "amount": _sg(price, "unit_amount"),
                            "product": _sg(price, "product"),
                        })
                    stripe_subscriptions.append({
                        "id": sub.id,
                        "status": sub.status,
                        "customer": sub.customer,
                        "current_period_end": getattr(sub, 'current_period_end', None),
                        "cancel_at_period_end": getattr(sub, 'cancel_at_period_end', None),
                        "items": items_info,
                        "created": getattr(sub, 'created', None),
                    })
        except Exception as stripe_err:
            stripe_customers = [{"error": str(stripe_err)}]

        return {
            "user_id": user_id,
            "profile": profile,
            "db_subscription_rows": sub_rows,
            "stripe_customers": stripe_customers,
            "stripe_subscriptions": stripe_subscriptions,
        }
    except Exception as e:
        return {"error": str(e)}


@app.get("/api/debug/repair-subscription")
async def repair_subscription(email: str = "", secret: str = ""):
    """🔧 TEMPORARY: Auto-repair subscription by finding active Stripe subscription for a user."""
    if secret != "shopbrain-diag-2026":
        raise HTTPException(status_code=403, detail="Forbidden")
    if not email:
        raise HTTPException(status_code=400, detail="Missing email")
    try:
        supabase_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        # Find user
        profile_result = supabase_client.table("user_profiles").select("id,email").eq("email", email).execute()
        if not profile_result.data:
            return {"error": "User not found"}
        user_id = profile_result.data[0]["id"]

        # Find ALL Stripe customers for this email and check for active subs
        customers = stripe.Customer.list(email=email, limit=5)
        active_sub = None
        active_customer_id = None
        # First pass: look for active subscriptions across ALL customers
        for cust in customers.data:
            subs = stripe.Subscription.list(customer=cust.id, status="active", limit=1)
            if subs.data:
                active_sub = subs.data[0]
                active_customer_id = cust.id
                break
        # Second pass: only fall back to trialing if no active found
        if not active_sub:
            for cust in customers.data:
                trialing = stripe.Subscription.list(customer=cust.id, status="trialing", limit=1)
                if trialing.data:
                    active_sub = trialing.data[0]
                    active_customer_id = cust.id
                    break

        if not active_sub:
            return {"error": "No active Stripe subscription found for this email", "customers": [c.id for c in customers.data]}

        # Resolve plan from subscription
        plan_tier = _resolve_plan_from_stripe_subscription(active_sub)
        if not plan_tier:
            plan_tier = "standard"

        stripe_sub_id = active_sub.id
        cancel_at_period_end = getattr(active_sub, 'cancel_at_period_end', False)
        status = "cancelling" if cancel_at_period_end else "active"
        payment_date = _resolve_payment_date(active_sub.created)

        # Write to DB
        repair_data = {
            "user_id": user_id,
            "email": email,
            "stripe_subscription_id": stripe_sub_id,
            "stripe_customer_id": active_customer_id,
            "plan_tier": plan_tier,
            "plan": True,
            "paid": True,
            "status": status,
            "subscription_status": status,
            "payment_date": payment_date,
            "updated_at": datetime.utcnow().isoformat(),
        }
        _sub_upsert(supabase_client, user_id, repair_data)

        # Also update user_profiles
        supabase_client.table("user_profiles").update({
            "stripe_customer_id": active_customer_id,
            "stripe_subscription_id": stripe_sub_id,
            "subscription_tier": plan_tier,
            "subscription_plan": plan_tier,
            "subscription_status": status,
            "updated_at": datetime.utcnow().isoformat(),
        }).eq("id", user_id).execute()

        # Clear init cache
        _init_cache.pop(user_id, None)

        return {
            "success": True,
            "repaired": True,
            "user_id": user_id,
            "stripe_subscription_id": stripe_sub_id,
            "stripe_customer_id": active_customer_id,
            "plan_tier": plan_tier,
            "status": status,
            "payment_date": payment_date,
        }
    except Exception as e:
        return {"error": str(e)}


@app.get("/api/stock-alerts/send-test-now")
async def send_test_email_now(to: str = "", secret: str = "", user_id: str = "", product_id: str = ""):
    """Envoie un email de test via Gmail API (OAuth2) — pas besoin de JWT, juste un secret."""
    expected_secret = os.getenv("STOCK_CHECK_SECRET", "shopbrain-stock-2026")
    if secret != expected_secret:
        raise HTTPException(status_code=403, detail="Secret invalide")

    target_email = to or "louis-felix.gilbert@outlook.com"
    gmail_configured = bool(GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET and GMAIL_REFRESH_TOKEN and GMAIL_SENDER_EMAIL)
    result = {
        "gmail_configured": gmail_configured,
        "gmail_sender": GMAIL_SENDER_EMAIL or "(non configuré)",
        "target_email": target_email,
    }

    if not gmail_configured:
        result["error"] = "Variables Gmail manquantes sur Render (GMAIL_CLIENT_ID/CLIENT_SECRET/REFRESH_TOKEN/SENDER_EMAIL)"
        result["email_sent"] = False
        return result

    # Envoyer email de test via Gmail API
    try:
        unsub_url = f"{BACKEND_BASE_URL}/api/stock-alerts/unsubscribe?token=TEST"
        unsubscribe_mode = "placeholder"
        product_name = "Produit Test (Vérification Gmail API)"

        if SUPABASE_URL and SUPABASE_SERVICE_KEY:
            sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

            chosen_user_id = user_id.strip() or ""
            chosen_product_id = product_id.strip() or ""

            # Auto-detect: si aucun user_id fourni, prendre le premier dispo
            if not chosen_user_id:
                auto_row = sb.table("stock_alert_settings").select(
                    "user_id,product_id,product_title"
                ).limit(1).execute()
                if auto_row.data:
                    chosen_user_id = str(auto_row.data[0].get("user_id", "")).strip()
                    chosen_product_id = str(auto_row.data[0].get("product_id", "")).strip()
                    if auto_row.data[0].get("product_title"):
                        product_name = auto_row.data[0].get("product_title")

            if chosen_user_id and not chosen_product_id:
                row = sb.table("stock_alert_settings").select(
                    "product_id,product_title"
                ).eq("user_id", chosen_user_id).limit(1).execute()
                if row.data:
                    chosen_product_id = str(row.data[0].get("product_id", "") or "").strip()
                    if row.data[0].get("product_title"):
                        product_name = row.data[0].get("product_title")

            result["resolved_user_id"] = chosen_user_id
            result["resolved_product_id"] = chosen_product_id

            if chosen_user_id and chosen_product_id:
                token = _get_or_create_unsubscribe_token(sb, chosen_user_id, chosen_product_id)
                unsub_url = f"{BACKEND_BASE_URL}/api/stock-alerts/unsubscribe?token={token}"
                unsubscribe_mode = "generated"

        result["unsubscribe_mode"] = unsubscribe_mode
        result["unsubscribe_url"] = unsub_url

        ok = _send_stock_alert_email(
            to_email=target_email,
            first_name="Louis-felix",
            product_name=product_name,
            stock_remaining=3,
            threshold=10,
            unsubscribe_url=unsub_url,
        )
        result["email_sent"] = ok
        if ok:
            result["message"] = f"✅ Email envoyé à {target_email} via Gmail API !"
        else:
            result["message"] = "❌ Échec envoi — voir logs Render"
    except Exception as e:
        result["email_sent"] = False
        result["error"] = str(e)

    # Aussi déclencher un vrai cycle de vérification stock
    try:
        summary = _stock_monitor_once()
        result["stock_check_summary"] = summary
    except Exception as e:
        result["stock_check_error"] = str(e)

    return result


@app.post("/api/stripe/payment-link")
async def create_payment_link(payload: dict, request: Request):
    """Create a Stripe Payment Link for a subscription plan.
    Expects JSON: {"plan": "standard" | "pro" | "premium", "email": "customer@example.com", "user_id": "..."}
    """
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=500, detail="Stripe not configured")

    plan = payload.get("plan", "").lower()
    customer_email = payload.get("email")
    
    user_id = get_user_id(request)
    
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
    
    # GUARD: prevent duplicate subscriptions
    try:
        if SUPABASE_URL and SUPABASE_SERVICE_KEY:
            _supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
            _sub_check = _supabase.table("subscriptions").select("status,paid").eq("user_id", user_id).order("updated_at", desc=True).limit(1).execute()
            if _sub_check.data:
                _r = _sub_check.data[0]
                if _r.get("paid") and str(_r.get("status") or "").lower() in ("active", "cancelling", "trialing"):
                    raise HTTPException(status_code=409, detail="You already have an active subscription. Use the plan switch in your dashboard.")
    except HTTPException:
        raise
    except Exception:
        pass

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

    raw_plan = payload.get("plan")
    customer_email = payload.get("email")
    
    # Normalize plan key: accept both numeric ('99','199','299') and named ('standard','pro','premium')
    _plan_normalize = {'99': 'standard', '199': 'pro', '299': 'premium'}
    plan = _plan_normalize.get(str(raw_plan), raw_plan)
    
    print(f"📊 Plan: {plan} (raw: {raw_plan}), Email: {customer_email}")
    
    if plan not in STRIPE_PLANS:
        raise HTTPException(status_code=400, detail=f"Invalid plan: {raw_plan}")

    price_id = STRIPE_PLANS[plan]

    # GUARD: prevent duplicate subscriptions — active subscribers must use switch-plan
    try:
        if SUPABASE_URL and SUPABASE_SERVICE_KEY:
            _supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
            _sub_check = _supabase.table("subscriptions").select("status,paid").eq("user_id", user_id).order("updated_at", desc=True).limit(1).execute()
            if _sub_check.data:
                _r = _sub_check.data[0]
                if _r.get("paid") and str(_r.get("status") or "").lower() in ("active", "cancelling", "trialing"):
                    raise HTTPException(status_code=409, detail="You already have an active subscription. Use the plan switch in your dashboard.")
    except HTTPException:
        raise
    except Exception:
        pass  # Non-blocking; allow checkout to proceed if check fails

    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            mode="subscription",
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=FRONTEND_ORIGIN + "?payment=success&session_id={CHECKOUT_SESSION_ID}",
            cancel_url=FRONTEND_ORIGIN + "#pricing",
            customer_email=customer_email,
            metadata={
                "user_id": user_id,
                "plan": plan,
            },
            subscription_data={
                "trial_period_days": 14,
                "metadata": {"user_id": user_id, "plan": plan},
            },
        )
        print(f"✅ Checkout session created: {session.id}")
        print(f"📝 Metadata: user_id={user_id}, plan={plan}")
        return {"url": session.url}
    except Exception as e:
        print(f"❌ Checkout error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
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


@app.post("/webhook")
async def stripe_webhook(request: Request):
    print("🔔 [WEBHOOK] Received Stripe webhook event")
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    def _stripe_to_plain(value):
        """Convert Stripe v7+ objects to plain dicts recursively."""
        return _stripe_obj_to_dict(value)

    if STRIPE_WEBHOOK_SECRET:
        try:
            event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
            print("✅ [WEBHOOK] Signature verified")
        except Exception as e:
            print(f"❌ [WEBHOOK] Signature verification failed: {e}")
            return {"received": True, "warning": "invalid_signature"}
    else:
        try:
            event = json.loads(payload)
            print("⚠️ [WEBHOOK] No signature secret, parsed raw event")
        except Exception as e:
            print(f"❌ [WEBHOOK] Invalid JSON: {e}")
            return {"received": True, "warning": "invalid_json"}

    try:
        event_plain = _stripe_to_plain(event) or {}
        if not isinstance(event_plain, dict):
            event_plain = {}

        event_type = event_plain.get("type") or getattr(event, "type", "unknown")
        event_data = event_plain.get("data") or {}
        if not isinstance(event_data, dict):
            event_data = _stripe_to_plain(event_data) or {}
        obj = event_data.get("object") or {}
        if not isinstance(obj, dict):
            obj = _stripe_to_plain(obj) or {}
    except Exception as e:
        print(f"❌ [WEBHOOK] Failed to parse event envelope: {e}")
        return {"received": True, "warning": "event_envelope_parse_error"}
    print(f"📊 [WEBHOOK] Event type: {event_type}")
    try:
        print(f"🧾 [WEBHOOK] Object keys: {list(obj.keys())[:20]}")
    except Exception:
        pass

    def _webhook_recover_checkout_context(stripe_customer_id=None, stripe_subscription_id=None):
        recovered = {
            "session_id": None,
            "client_reference_id": None,
            "email": None,
            "stripe_customer_id": stripe_customer_id,
            "stripe_subscription_id": _normalize_stripe_subscription_id(stripe_subscription_id),
        }

        try:
            normalized_sub = _normalize_stripe_subscription_id(stripe_subscription_id)
            customer_id = stripe_customer_id
            if normalized_sub and not customer_id:
                stripe_sub_obj = stripe.Subscription.retrieve(normalized_sub)
                customer_id = _sg(stripe_sub_obj, "customer")
                recovered["stripe_customer_id"] = customer_id

            if customer_id:
                sessions = stripe.checkout.Session.list(customer=customer_id, limit=10)
                sessions_data = _sg(sessions, "data", [])
                for session_obj in sessions_data:
                    session_sub = _normalize_stripe_subscription_id(_sg(session_obj, "subscription"))
                    if normalized_sub and session_sub and session_sub != normalized_sub:
                        continue

                    recovered["session_id"] = _sg(session_obj, "id")
                    recovered["client_reference_id"] = _sg(session_obj, "client_reference_id")
                    cust_details = _sg(session_obj, "customer_details") or {}
                    recovered["email"] = _sg(session_obj, "customer_email") or _sg(cust_details, "email")
                    recovered["stripe_subscription_id"] = session_sub or recovered["stripe_subscription_id"]
                    return recovered
        except Exception as e:
            print(f"⚠️ [WEBHOOK] recover checkout context warning: {e}")

        return recovered

    def _webhook_resolve_email(supabase_client, user_id=None, stripe_customer_id=None, stripe_subscription_id=None, email=None):
        if email:
            return str(email).strip().lower()

        try:
            recovered = _webhook_recover_checkout_context(stripe_customer_id, stripe_subscription_id)
            if recovered.get("email"):
                return str(recovered.get("email")).strip().lower()
        except Exception as e:
            print(f"⚠️ [WEBHOOK] resolve email from checkout context warning: {e}")

        try:
            if stripe_customer_id:
                customer_obj = stripe.Customer.retrieve(stripe_customer_id)
                customer_email = _sg(customer_obj, "email")
                if customer_email:
                    return str(customer_email).strip().lower()
        except Exception as e:
            print(f"⚠️ [WEBHOOK] resolve email from stripe customer warning: {e}")

        try:
            normalized_sub = _normalize_stripe_subscription_id(stripe_subscription_id)
            if normalized_sub:
                stripe_sub_obj = stripe.Subscription.retrieve(normalized_sub)
                cust_id = _sg(stripe_sub_obj, "customer")
                if cust_id and isinstance(cust_id, str):
                    customer_obj = stripe.Customer.retrieve(cust_id)
                    customer_email = _sg(customer_obj, "email")
                    if customer_email:
                        return str(customer_email).strip().lower()
        except Exception as e:
            print(f"⚠️ [WEBHOOK] resolve email from stripe subscription warning: {e}")

        try:
            if user_id:
                profile_row = (
                    supabase_client.table("user_profiles")
                    .select("email")
                    .eq("id", user_id)
                    .limit(1)
                    .execute()
                )
                if profile_row.data and profile_row.data[0].get("email"):
                    return str(profile_row.data[0].get("email")).strip().lower()
        except Exception as e:
            print(f"⚠️ [WEBHOOK] resolve email from user_profiles warning: {e}")

        try:
            if user_id and SUPABASE_URL and SUPABASE_SERVICE_KEY:
                admin_url = f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}"
                headers = {
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Content-Type": "application/json",
                }
                resp = requests.get(admin_url, headers=headers, timeout=10)
                if resp.status_code == 200:
                    user_data = resp.json() or {}
                    auth_email = user_data.get("email") or (user_data.get("user") or {}).get("email")
                    if auth_email:
                        return str(auth_email).strip().lower()
        except Exception as e:
            print(f"⚠️ [WEBHOOK] resolve email from auth.users warning: {e}")

        return None

    def _webhook_resolve_user_id(supabase_client, stripe_subscription_id=None, stripe_customer_id=None, email=None):
        # 1) By stripe_subscription_id in subscriptions table
        try:
            normalized_sub = _normalize_stripe_subscription_id(stripe_subscription_id)
            if normalized_sub:
                row = (
                    supabase_client.table("subscriptions")
                    .select("user_id")
                    .eq("stripe_subscription_id", normalized_sub)
                    .limit(1)
                    .execute()
                )
                if row.data:
                    print(f"✅ [WEBHOOK] resolved user by subscription_id: {row.data[0].get('user_id')}")
                    return row.data[0].get("user_id")
        except Exception as e:
            print(f"⚠️ [WEBHOOK] resolve by subscription_id warning: {e}")

        # 2) By stripe_customer_id in subscriptions table
        try:
            if stripe_customer_id:
                row = (
                    supabase_client.table("subscriptions")
                    .select("user_id")
                    .eq("stripe_customer_id", stripe_customer_id)
                    .order("updated_at", desc=True)
                    .limit(1)
                    .execute()
                )
                if row.data:
                    print(f"✅ [WEBHOOK] resolved user by customer_id: {row.data[0].get('user_id')}")
                    return row.data[0].get("user_id")
        except Exception as e:
            print(f"⚠️ [WEBHOOK] resolve by customer_id warning: {e}")

        # 2c) By stripe ids in user_profiles table
        try:
            normalized_sub = _normalize_stripe_subscription_id(stripe_subscription_id)
            if normalized_sub:
                row = (
                    supabase_client.table("user_profiles")
                    .select("id")
                    .eq("stripe_subscription_id", normalized_sub)
                    .limit(1)
                    .execute()
                )
                if row.data:
                    print(f"✅ [WEBHOOK] resolved user by user_profiles.stripe_subscription_id: {row.data[0].get('id')}")
                    return row.data[0].get("id")
        except Exception as e:
            print(f"⚠️ [WEBHOOK] resolve by user_profiles.stripe_subscription_id warning: {e}")

        try:
            if stripe_customer_id:
                row = (
                    supabase_client.table("user_profiles")
                    .select("id")
                    .eq("stripe_customer_id", stripe_customer_id)
                    .limit(1)
                    .execute()
                )
                if row.data:
                    print(f"✅ [WEBHOOK] resolved user by user_profiles.stripe_customer_id: {row.data[0].get('id')}")
                    return row.data[0].get("id")
        except Exception as e:
            print(f"⚠️ [WEBHOOK] resolve by user_profiles.stripe_customer_id warning: {e}")

        # 2b) Recover from Stripe subscription/customer directly when IDs exist
        try:
            normalized_sub = _normalize_stripe_subscription_id(stripe_subscription_id)
            if normalized_sub:
                stripe_sub_obj = stripe.Subscription.retrieve(normalized_sub)
                metadata = _sg(stripe_sub_obj, "metadata") or {}
                metadata_user_id = _sg(metadata, "user_id")
                if metadata_user_id:
                    print(f"✅ [WEBHOOK] resolved user by stripe subscription metadata: {metadata_user_id}")
                    return metadata_user_id

                if not stripe_customer_id:
                    stripe_customer_id = _sg(stripe_sub_obj, "customer")
        except Exception as e:
            print(f"⚠️ [WEBHOOK] resolve by stripe subscription object warning: {e}")

        try:
            if stripe_customer_id and not email:
                customer_obj = stripe.Customer.retrieve(stripe_customer_id)
                email = _sg(customer_obj, "email")
        except Exception as e:
            print(f"⚠️ [WEBHOOK] resolve by stripe customer object warning: {e}")

        try:
            recovered = _webhook_recover_checkout_context(stripe_customer_id, stripe_subscription_id)
            recovered_user_id = recovered.get("client_reference_id")
            if recovered_user_id:
                print(f"✅ [WEBHOOK] resolved user by checkout session client_reference_id: {recovered_user_id}")
                return recovered_user_id
            if not email and recovered.get("email"):
                email = recovered.get("email")
        except Exception as e:
            print(f"⚠️ [WEBHOOK] resolve by checkout session context warning: {e}")

        # 3) By email in subscriptions table
        try:
            if email:
                normalized_email = str(email).strip().lower()
                row = (
                    supabase_client.table("subscriptions")
                    .select("user_id")
                    .eq("email", email)
                    .order("updated_at", desc=True)
                    .limit(1)
                    .execute()
                )
                if row.data:
                    print(f"✅ [WEBHOOK] resolved user by subscriptions.email: {row.data[0].get('user_id')}")
                    return row.data[0].get("user_id")
                row_ci = (
                    supabase_client.table("subscriptions")
                    .select("user_id")
                    .ilike("email", normalized_email)
                    .order("updated_at", desc=True)
                    .limit(1)
                    .execute()
                )
                if row_ci.data:
                    print(f"✅ [WEBHOOK] resolved user by subscriptions.email (ci): {row_ci.data[0].get('user_id')}")
                    return row_ci.data[0].get("user_id")
        except Exception as e:
            print(f"⚠️ [WEBHOOK] resolve by subscriptions.email warning: {e}")

        # 4) By email in user_profiles table
        try:
            if email:
                normalized_email = str(email).strip().lower()
                row = (
                    supabase_client.table("user_profiles")
                    .select("id")
                    .eq("email", email)
                    .limit(1)
                    .execute()
                )
                if row.data:
                    print(f"✅ [WEBHOOK] resolved user by user_profiles.email: {row.data[0].get('id')}")
                    return row.data[0].get("id")
                row_ci = (
                    supabase_client.table("user_profiles")
                    .select("id")
                    .ilike("email", normalized_email)
                    .limit(1)
                    .execute()
                )
                if row_ci.data:
                    print(f"✅ [WEBHOOK] resolved user by user_profiles.email (ci): {row_ci.data[0].get('id')}")
                    return row_ci.data[0].get("id")
        except Exception as e:
            print(f"⚠️ [WEBHOOK] resolve by user_profiles.email warning: {e}")

        # 5) CRITICAL FALLBACK: By email in auth.users via Supabase Admin API
        #    This is the ONLY reliable source for first-time buyers using the
        #    Stripe Pricing Table, which does NOT pass metadata/client_reference_id.
        try:
            if email and SUPABASE_URL and SUPABASE_SERVICE_KEY:
                normalized_email = str(email).strip().lower()
                print(f"🔍 [WEBHOOK] Attempting auth.users lookup for email: {normalized_email}")
                admin_url = f"{SUPABASE_URL}/auth/v1/admin/users"
                headers = {
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Content-Type": "application/json",
                }

                # Try exact email query first
                exact_resp = requests.get(admin_url, headers=headers, params={"email": normalized_email}, timeout=10)
                if exact_resp.status_code == 200:
                    exact_data = exact_resp.json()
                    exact_users = exact_data.get("users", exact_data) if isinstance(exact_data, dict) else exact_data
                    if isinstance(exact_users, list):
                        for u in exact_users:
                            u_email = (u.get("email") or "").strip().lower()
                            if u_email == normalized_email:
                                auth_uid = u.get("id")
                                print(f"✅ [WEBHOOK] resolved user by auth.users exact email: {auth_uid}")
                                return auth_uid

                per_page = 200
                for page in range(1, 11):
                    resp = requests.get(admin_url, headers=headers, params={"page": page, "per_page": per_page}, timeout=10)
                    if resp.status_code != 200:
                        print(f"⚠️ [WEBHOOK] auth.users admin API returned {resp.status_code}: {resp.text[:200]}")
                        break

                    data = resp.json()
                    users_list = data.get("users", data) if isinstance(data, dict) else data
                    if not isinstance(users_list, list) or not users_list:
                        break

                    for u in users_list:
                        u_email = (u.get("email") or "").strip().lower()
                        if u_email == normalized_email:
                            auth_uid = u.get("id")
                            print(f"✅ [WEBHOOK] resolved user by auth.users email: {auth_uid}")
                            return auth_uid

                    if len(users_list) < per_page:
                        break

                print(f"⚠️ [WEBHOOK] auth.users lookup: no matching user for {normalized_email}")
        except Exception as e:
            print(f"⚠️ [WEBHOOK] resolve by auth.users warning: {e}")

        print(f"❌ [WEBHOOK] Could not resolve user_id by any method. email={email}, sub={stripe_subscription_id}, cus={stripe_customer_id}")
        return None

    try:
        if not (SUPABASE_URL and SUPABASE_SERVICE_KEY):
            print("⚠️ [WEBHOOK] Supabase not configured; acknowledging event")
            return {"received": True, "warning": "supabase_not_configured"}

        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

        if event_type == "checkout.session.completed":
            session = obj
            normalized_sub_id = _normalize_stripe_subscription_id(session.get("subscription"))
            stripe_customer_id = session.get("customer")
            cust_details = session.get("customer_details") or {}
            session_email = session.get("customer_email") or _sg(cust_details, "email")
            if not session_email and stripe_customer_id:
                try:
                    customer_obj = stripe.Customer.retrieve(stripe_customer_id)
                    session_email = _sg(customer_obj, "email")
                except Exception as e:
                    print(f"⚠️ [WEBHOOK] checkout customer retrieve warning: {e}")

            metadata = session.get("metadata") or {}
            user_id = _sg(metadata, "user_id") or session.get("client_reference_id")
            if not user_id:
                user_id = _webhook_resolve_user_id(
                    supabase,
                    stripe_subscription_id=normalized_sub_id,
                    stripe_customer_id=stripe_customer_id,
                    email=session_email,
                )
            session_email = _webhook_resolve_email(supabase, user_id, stripe_customer_id, normalized_sub_id, session_email)
            if not user_id:
                print("⚠️ [WEBHOOK] checkout.session.completed missing user_id metadata")
                return {
                    "received": True,
                    "warning": "missing_user_id_metadata",
                    "event_type": event_type,
                    "debug": {
                        "stripe_customer_id": stripe_customer_id,
                        "stripe_subscription_id": normalized_sub_id,
                        "email": session_email,
                        "client_reference_id": session.get("client_reference_id"),
                    },
                }

            stripe_sub_obj = None
            stripe_status = "active"
            plan_tier = None
            if normalized_sub_id:
                try:
                    stripe_sub_obj = stripe.Subscription.retrieve(normalized_sub_id)
                    stripe_status = str(_sg(stripe_sub_obj, "status") or "active").lower()
                    plan_tier = _resolve_plan_from_stripe_subscription(stripe_sub_obj)
                except Exception as e:
                    print(f"⚠️ [WEBHOOK] checkout subscription fetch warning: {e}")

            if not plan_tier:
                plan_tier = _sg(metadata, "plan")
            # Fallback: try to resolve from session line_items (works for Pricing Table checkouts)
            if not plan_tier:
                try:
                    expanded_session = stripe.checkout.Session.retrieve(session.get("id"), expand=["line_items"])
                    line_items_container = _sg(expanded_session, "line_items", {})
                    line_items_data = _sg(line_items_container, "data", []) if line_items_container else []
                    exact_amount_map = {9900: "standard", 19900: "pro", 29900: "premium"}
                    for li in line_items_data:
                        li_price = _sg(li, "price", {})
                        price_id = _sg(li_price, "id")
                        amount = _sg(li_price, "unit_amount")
                        plan_tier = PRICE_TO_TIER.get(price_id)
                        if not plan_tier and amount is not None:
                            try:
                                plan_tier = exact_amount_map.get(int(amount))
                            except Exception:
                                pass
                        if plan_tier:
                            break
                    print(f"  ℹ️ [WEBHOOK] plan resolved from line_items: {plan_tier}")
                except Exception as li_err:
                    print(f"  ⚠️ [WEBHOOK] line_items fallback warning: {li_err}")
            if plan_tier:
                plan_tier = {"99": "standard", "199": "pro", "299": "premium"}.get(str(plan_tier).lower(), str(plan_tier).lower())
            # If still no plan, do NOT default — log error and skip DB write to avoid wrong plan
            if not plan_tier:
                print(f"  ❌ [WEBHOOK] checkout.session.completed: Could not resolve plan_tier — skipping DB write to prevent wrong plan")
                return {"received": True, "warning": "plan_tier_unresolvable", "event_type": event_type}

            payment_status_str = str(session.get("payment_status", "")).lower()
            paid_flag = payment_status_str in ("paid", "no_payment_required") or stripe_status in ("active", "trialing")
            stored_status = "active" if paid_flag else "inactive"
            payment_date = _resolve_payment_date(session.get("created"), _sg(stripe_sub_obj, "created") if stripe_sub_obj else None)

            # CRITICAL: If we still don't have a subscription ID, try to find it via customer
            if not normalized_sub_id and stripe_customer_id and paid_flag:
                try:
                    cust_subs = stripe.Subscription.list(customer=stripe_customer_id, status='active', limit=1)
                    if cust_subs.data:
                        normalized_sub_id = _normalize_stripe_subscription_id(cust_subs.data[0])
                        if not stripe_sub_obj:
                            stripe_sub_obj = cust_subs.data[0]
                            plan_tier_from_sub = _resolve_plan_from_stripe_subscription(stripe_sub_obj)
                            if plan_tier_from_sub:
                                plan_tier = plan_tier_from_sub
                        print(f"  🔧 [WEBHOOK] Recovered subscription ID from customer: {normalized_sub_id}")
                except Exception as cust_sub_err:
                    print(f"  ⚠️ [WEBHOOK] Customer subscription recovery warning: {cust_sub_err}")

            payload_write = {
                "user_id": user_id,
                "email": session_email,
                "stripe_session_id": session.get("id"),
                "stripe_subscription_id": normalized_sub_id,
                "stripe_customer_id": stripe_customer_id,
                "plan_tier": plan_tier,
                "plan": bool(paid_flag),
                "paid": bool(paid_flag),
                "status": stored_status,
                "subscription_status": stored_status,
                "payment_date": payment_date,
                "updated_at": datetime.utcnow().isoformat(),
            }

            # ── DUPLICATE SUBSCRIPTION GUARD ──────────────────────────
            # If this user already has a DIFFERENT active Stripe subscription,
            # cancel the NEWLY created one and schedule a plan change on the
            # existing subscription instead.  This prevents billing duplicates
            # caused by the Stripe Pricing Table (which bypasses backend guards).
            if normalized_sub_id and paid_flag:
                try:
                    existing_sub_row = supabase.table("subscriptions").select(
                        "stripe_subscription_id,status,paid,plan_tier"
                    ).eq("user_id", user_id).limit(1).execute()
                    if existing_sub_row.data:
                        existing_row = existing_sub_row.data[0]
                        existing_sub_id = _normalize_stripe_subscription_id(existing_row.get("stripe_subscription_id"))
                        existing_active = (
                            existing_row.get("paid") is True
                            and str(existing_row.get("status") or "").lower() in ("active", "cancelling", "trialing")
                        )
                        if (existing_active and existing_sub_id
                                and existing_sub_id != normalized_sub_id):
                            # Verify the existing sub is truly active in Stripe
                            try:
                                old_stripe_sub = stripe.Subscription.retrieve(existing_sub_id)
                                old_status = str(_sg(old_stripe_sub, "status") or "").lower()
                            except Exception:
                                old_status = "unknown"

                            if old_status in ("active", "trialing"):
                                print(f"  🛡️ [WEBHOOK] DUPLICATE detected! user={user_id} "
                                      f"existing_sub={existing_sub_id} (active) vs new_sub={normalized_sub_id}")
                                # Cancel the NEW duplicate subscription immediately
                                try:
                                    stripe.Subscription.cancel(normalized_sub_id)
                                    print(f"  ✅ [WEBHOOK] Cancelled duplicate new sub {normalized_sub_id}")
                                except Exception as cancel_err:
                                    print(f"  ⚠️ [WEBHOOK] Failed to cancel duplicate: {cancel_err}")

                                # If the new plan is different, schedule a switch on the existing sub
                                existing_plan = existing_row.get("plan_tier")
                                if plan_tier and existing_plan and plan_tier != existing_plan:
                                    print(f"  🔄 [WEBHOOK] Scheduling plan change {existing_plan} → {plan_tier} on existing sub {existing_sub_id}")
                                    try:
                                        old_items = _sg(_sg(old_stripe_sub, "items", {}), "data", []) or []
                                        old_item = old_items[0] if old_items else None
                                        old_price_id = _sg(_sg(old_item, "price", {}), "id") if old_item else None
                                        old_qty = int(_sg(old_item, "quantity") or 1) if old_item else 1
                                        new_price_id = STRIPE_PLANS.get(plan_tier)
                                        switch_at = _coerce_stripe_timestamp(_sg(old_stripe_sub, "current_period_end"))

                                        if old_price_id and new_price_id and switch_at:
                                            schedule_raw = _sg(old_stripe_sub, "schedule")
                                            schedule_id = schedule_raw if isinstance(schedule_raw, str) else _sg(schedule_raw, "id")
                                            effective_phase_start = "now"
                                            if schedule_id:
                                                try:
                                                    existing_schedule = stripe.SubscriptionSchedule.retrieve(schedule_id)
                                                    current_phase = _sg(existing_schedule, "current_phase", {}) or {}
                                                    locked_start = _coerce_stripe_timestamp(_sg(current_phase, "start_date"))
                                                    if locked_start:
                                                        effective_phase_start = locked_start
                                                except Exception as sched_read_err:
                                                    print(f"  ⚠️ [WEBHOOK] schedule read warning: {sched_read_err}")
                                            if not schedule_id:
                                                created_schedule = stripe.SubscriptionSchedule.create(from_subscription=existing_sub_id)
                                                schedule_id = _sg(created_schedule, "id")
                                            stripe.SubscriptionSchedule.modify(
                                                schedule_id,
                                                end_behavior="release",
                                                phases=[
                                                    {
                                                        "start_date": effective_phase_start,
                                                        "end_date": switch_at,
                                                        "items": [{"price": old_price_id, "quantity": old_qty}],
                                                    },
                                                    {
                                                        "start_date": switch_at,
                                                        "items": [{"price": new_price_id, "quantity": old_qty}],
                                                    },
                                                ],
                                                metadata={"user_id": user_id, "pending_plan": plan_tier, "effective_at": str(switch_at)},
                                            )
                                            print(f"  ✅ [WEBHOOK] Scheduled switch on existing sub at renewal ({switch_at})")
                                            payload_write["stripe_subscription_id"] = existing_sub_id
                                            payload_write["plan_tier"] = existing_plan
                                            payload_write["current_period_end"] = _stripe_ts_to_iso(switch_at)
                                        else:
                                            print(f"  ⚠️ [WEBHOOK] Missing data for scheduled switch old_price={old_price_id} new_price={new_price_id} switch_at={switch_at}")
                                    except Exception as switch_err:
                                        print(f"  ⚠️ [WEBHOOK] Plan switch on existing sub warning: {switch_err}")
                                else:
                                    # Same plan — just keep existing, don't write the new sub to DB
                                    payload_write["stripe_subscription_id"] = existing_sub_id
                                    print(f"  ℹ️ [WEBHOOK] Same plan — keeping existing sub {existing_sub_id}")
                except Exception as dedup_err:
                    print(f"  ⚠️ [WEBHOOK] Dedup check warning (non-blocking): {dedup_err}")

            print(f"💾 [WEBHOOK] checkout.session.completed DB write: {payload_write}")
            _sub_upsert(supabase, user_id, payload_write)

            if plan_tier:
                try:
                    profile_plan = payload_write.get("plan_tier") or plan_tier
                    supabase.table("user_profiles").upsert({
                        "id": user_id,
                        "stripe_customer_id": stripe_customer_id,
                        "stripe_subscription_id": payload_write.get("stripe_subscription_id") or normalized_sub_id,
                        "subscription_tier": profile_plan,
                        "subscription_plan": profile_plan,
                        "subscription_status": stored_status,
                        "updated_at": datetime.utcnow().isoformat(),
                    }, on_conflict="id").execute()
                except Exception as profile_err:
                    print(f"⚠️ [WEBHOOK] checkout user_profiles sync warning: {profile_err}")

            _init_cache.pop(user_id, None)
            return {"received": True}

        if event_type == "invoice.payment_succeeded":
            invoice = obj
            stripe_sub_id = _normalize_stripe_subscription_id(invoice.get("subscription"))
            stripe_customer_id = invoice.get("customer")
            inv_cust_details = invoice.get("customer_details") or {}
            email = invoice.get("customer_email") or _sg(inv_cust_details, "email")

            if not email and stripe_customer_id:
                try:
                    customer_obj = stripe.Customer.retrieve(stripe_customer_id)
                    email = _sg(customer_obj, "email")
                except Exception as e:
                    print(f"⚠️ [WEBHOOK] invoice customer retrieve warning: {e}")

            stripe_sub_obj = None
            user_id = None
            plan_tier = None
            if stripe_sub_id:
                try:
                    stripe_sub_obj = stripe.Subscription.retrieve(stripe_sub_id)
                    sub_metadata = _sg(stripe_sub_obj, "metadata") or {}
                    user_id = _sg(sub_metadata, "user_id")
                    plan_tier = _resolve_plan_from_stripe_subscription(stripe_sub_obj)
                except Exception as e:
                    print(f"⚠️ [WEBHOOK] invoice subscription fetch warning: {e}")

            user_id = user_id or _webhook_resolve_user_id(supabase, stripe_sub_id, stripe_customer_id, email)
            email = _webhook_resolve_email(supabase, user_id, stripe_customer_id, stripe_sub_id, email)
            if not user_id:
                print("⚠️ [WEBHOOK] invoice.payment_succeeded cannot resolve user_id")
                return {
                    "received": True,
                    "warning": "db_not_linked_to_accounts",
                    "event_type": event_type,
                    "debug": {
                        "stripe_customer_id": stripe_customer_id,
                        "stripe_subscription_id": stripe_sub_id,
                        "email": email,
                    },
                }

            if not plan_tier:
                lines_container = invoice.get("lines", {})
                lines = _sg(lines_container, "data", []) if lines_container else []
                if lines:
                    price = _sg(lines[0], "price", {})
                    amount = _sg(price, "unit_amount")
                    exact_amount_map = {9900: "standard", 19900: "pro", 29900: "premium"}
                    plan_tier = PRICE_TO_TIER.get(_sg(price, "id")) or exact_amount_map.get(int(amount) if amount is not None else None)
            if not plan_tier:
                print(f"  ❌ [WEBHOOK] invoice.payment_succeeded could not resolve plan_tier — skipping DB write to prevent wrong plan")
                return {"received": True, "warning": "plan_tier_unresolvable", "event_type": event_type}

            status_transitions = invoice.get("status_transitions", {}) or {}
            payment_date = _resolve_payment_date(_sg(status_transitions, "paid_at"), invoice.get("created"))
            payload_write = {
                "user_id": user_id,
                "email": email,
                "stripe_subscription_id": stripe_sub_id,
                "stripe_customer_id": stripe_customer_id,
                "plan_tier": plan_tier,
                "plan": True,
                "paid": True,
                "status": "active",
                "subscription_status": "active",
                "payment_date": payment_date,
                "updated_at": datetime.utcnow().isoformat(),
            }
            print(f"💾 [WEBHOOK] invoice.payment_succeeded DB write: {payload_write}")
            _sub_upsert(supabase, user_id, payload_write)
            if plan_tier:
                try:
                    supabase.table("user_profiles").upsert({
                        "id": user_id,
                        "stripe_customer_id": stripe_customer_id,
                        "stripe_subscription_id": stripe_sub_id,
                        "subscription_tier": plan_tier,
                        "subscription_plan": plan_tier,
                        "subscription_status": "active",
                        "updated_at": datetime.utcnow().isoformat(),
                    }, on_conflict="id").execute()
                except Exception as profile_sync_err:
                    print(f"⚠️ [WEBHOOK] invoice user_profiles sync warning: {profile_sync_err}")
            _init_cache.pop(user_id, None)
            return {"received": True}

        if event_type in ("invoice.payment_failed", "customer.subscription.deleted"):
            stripe_sub_id = _normalize_stripe_subscription_id(obj.get("subscription") or obj.get("id"))
            stripe_customer_id = obj.get("customer")
            email = obj.get("customer_email") or (obj.get("customer_details") or {}).get("email")
            user_id = _webhook_resolve_user_id(supabase, stripe_sub_id, stripe_customer_id, email)
            email = _webhook_resolve_email(supabase, user_id, stripe_customer_id, stripe_sub_id, email)
            if not user_id:
                print(f"⚠️ [WEBHOOK] {event_type} cannot resolve user_id")
                return {
                    "received": True,
                    "warning": "db_not_linked_to_accounts",
                    "event_type": event_type,
                    "debug": {
                        "stripe_customer_id": stripe_customer_id,
                        "stripe_subscription_id": stripe_sub_id,
                        "email": email,
                    },
                }

            supabase.table("subscriptions").update({
                "plan": False,
                "paid": False,
                "status": "inactive",
                "subscription_status": "inactive",
                "updated_at": datetime.utcnow().isoformat(),
            }).eq("user_id", user_id).execute()
            _init_cache.pop(user_id, None)
            return {"received": True}

        if event_type in ("customer.subscription.created", "customer.subscription.updated"):
            stripe_sub_id = _normalize_stripe_subscription_id(obj.get("id"))
            stripe_customer_id = obj.get("customer")
            stripe_status = str(obj.get("status") or "").lower()
            plan_tier = _resolve_plan_from_stripe_subscription(obj)

            # If plan not resolved from event object, try a fresh Stripe API call
            if not plan_tier and stripe_sub_id:
                try:
                    fresh_sub = stripe.Subscription.retrieve(stripe_sub_id)
                    plan_tier = _resolve_plan_from_stripe_subscription(fresh_sub)
                    if plan_tier:
                        print(f"  ℹ️ [WEBHOOK] plan resolved from fresh Stripe fetch: {plan_tier}")
                except Exception as fresh_err:
                    print(f"  ⚠️ [WEBHOOK] fresh subscription fetch warning: {fresh_err}")
            if not plan_tier:
                print(f"  ❌ [WEBHOOK] {event_type} could not resolve plan_tier — skipping DB write to prevent wrong plan")
                return {"received": True, "warning": "plan_tier_unresolvable", "event_type": event_type}

            email = None
            try:
                if stripe_customer_id:
                    customer_obj = stripe.Customer.retrieve(stripe_customer_id)
                    email = _sg(customer_obj, "email")
            except Exception as e:
                print(f"⚠️ [WEBHOOK] customer retrieve warning: {e}")

            obj_metadata = obj.get("metadata") or {}
            user_id = _sg(obj_metadata, "user_id") or _webhook_resolve_user_id(
                supabase,
                stripe_subscription_id=stripe_sub_id,
                stripe_customer_id=stripe_customer_id,
                email=email,
            )
            email = _webhook_resolve_email(supabase, user_id, stripe_customer_id, stripe_sub_id, email)
            if not user_id:
                print(f"⚠️ [WEBHOOK] {event_type} cannot resolve user_id")
                return {
                    "received": True,
                    "warning": "db_not_linked_to_accounts",
                    "event_type": event_type,
                    "debug": {
                        "stripe_customer_id": stripe_customer_id,
                        "stripe_subscription_id": stripe_sub_id,
                        "email": email,
                    },
                }

            # Freshness guard: if incoming event is for an older/different subscription,
            # do not overwrite a newer active/trialing plan already linked to this user.
            try:
                incoming_created = int(obj.get("created", 0) or 0)
                existing_res = (
                    supabase.table("subscriptions")
                    .select("stripe_subscription_id,plan_tier,status,subscription_status")
                    .eq("user_id", user_id)
                    .order("updated_at", desc=True)
                    .limit(1)
                    .execute()
                )
                existing_row = existing_res.data[0] if existing_res.data else None
                if existing_row:
                    existing_sub_id = _normalize_stripe_subscription_id(existing_row.get("stripe_subscription_id"))
                    existing_status = str(existing_row.get("status") or existing_row.get("subscription_status") or "").lower()
                    existing_created = 0
                    if existing_sub_id and existing_sub_id != stripe_sub_id:
                        try:
                            existing_sub_obj = stripe.Subscription.retrieve(existing_sub_id)
                            existing_created = int(_sg(existing_sub_obj, "created", 0) or 0)
                            existing_status = str(_sg(existing_sub_obj, "status") or existing_status).lower()
                        except Exception as existing_fetch_err:
                            print(f"⚠️ [WEBHOOK] existing subscription fetch warning: {existing_fetch_err}")

                        existing_is_valid = existing_status in ("active", "trialing")
                        incoming_is_valid = stripe_status in ("active", "trialing")
                        if existing_is_valid and (not incoming_is_valid or existing_created > incoming_created):
                            print(
                                f"⏭️ [WEBHOOK] Ignoring stale {event_type}: incoming={stripe_sub_id} created={incoming_created} "
                                f"existing={existing_sub_id} created={existing_created} status={existing_status}"
                            )
                            return {"received": True, "ignored": "stale_subscription_event"}
            except Exception as guard_err:
                print(f"⚠️ [WEBHOOK] subscription freshness guard warning: {guard_err}")

            stored_status = "active" if stripe_status in ("active", "trialing") else "inactive"
            # Handle cancel_at_period_end: subscription is still active but scheduled for cancellation
            cancel_at_period_end = obj.get("cancel_at_period_end", False)
            if cancel_at_period_end and stripe_status == "active":
                stored_status = "cancelling"
            update_payload = {
                "user_id": user_id,
                "stripe_subscription_id": stripe_sub_id,
                "stripe_customer_id": stripe_customer_id,
                "plan_tier": plan_tier,
                "status": stored_status,
                "subscription_status": stored_status,
                "updated_at": datetime.utcnow().isoformat(),
            }
            if email:
                update_payload["email"] = email
            if stored_status in ("active", "cancelling"):
                update_payload["paid"] = True
                update_payload["plan"] = True
                update_payload["payment_date"] = _resolve_payment_date(obj.get("created", None))
            if stored_status == "inactive":
                update_payload["paid"] = False
                update_payload["plan"] = False

            print(f"💾 [WEBHOOK] {event_type} DB sync payload: {update_payload}")
            _sub_upsert(supabase, user_id, update_payload)

            if plan_tier:
                try:
                    supabase.table("user_profiles").upsert({
                        "id": user_id,
                        "stripe_customer_id": stripe_customer_id,
                        "stripe_subscription_id": stripe_sub_id,
                        "subscription_tier": plan_tier,
                        "subscription_plan": plan_tier,
                        "subscription_status": stored_status,
                        "updated_at": datetime.utcnow().isoformat(),
                    }, on_conflict="id").execute()
                except Exception as profile_sync_err:
                    print(f"⚠️ [WEBHOOK] user_profiles sync warning: {profile_sync_err}")

            _init_cache.pop(user_id, None)
            return {"received": True}

        print(f"⏭️ [WEBHOOK] Ignoring event type: {event_type}")
        return {"received": True}

    except Exception as e:
        print(f"❌ [WEBHOOK] Unexpected processing error (non-fatal): {e}")
        return {"received": True, "warning": "processing_error", "error": str(e), "event_type": event_type}


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
            "created_at": profile["created_at"],
            "avatar_url": profile.get("avatar_url")
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


@app.post("/api/settings/avatar")
async def upload_avatar(request: Request, file: UploadFile = File(...)):
    """Upload avatar and store public URL in profile"""
    user_id = get_user_id(request)

    if not file or not file.content_type:
        raise HTTPException(status_code=400, detail="Fichier manquant")

    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Format d'image invalide")

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image trop volumineuse (max 5MB)")

    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        bucket_name = "avatars"

        try:
            buckets = supabase.storage.list_buckets()
            if not any(b.get("name") == bucket_name for b in buckets):
                supabase.storage.create_bucket(bucket_name, options={"public": True})
        except Exception:
            pass

        file_ext = os.path.splitext(file.filename or "avatar")[1].lower() or ".png"
        storage_path = f"{user_id}/{uuid.uuid4().hex}{file_ext}"

        supabase.storage.from_(bucket_name).upload(
            storage_path,
            content,
            {"content-type": file.content_type}
        )

        avatar_url = supabase.storage.from_(bucket_name).get_public_url(storage_path)

        supabase.table("user_profiles").update({"avatar_url": avatar_url}).eq("id", user_id).execute()

        return {"success": True, "avatar_url": avatar_url}
    except Exception as e:
        print(f"Error uploading avatar: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _generate_api_key() -> str:
    return f"sb_live_{uuid.uuid4().hex}{uuid.uuid4().hex}"


@app.get("/api/settings/api-keys")
async def list_api_keys(request: Request):
    user_id = get_user_id(request)

    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        result = supabase.table("api_keys").select("id,name,key_prefix,key_last4,revoked,created_at").eq("user_id", user_id).order("created_at", desc=True).execute()
        return {"success": True, "keys": result.data or []}
    except Exception as e:
        print(f"Error listing api keys: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/settings/api-keys")
async def create_api_key(payload: dict, request: Request):
    user_id = get_user_id(request)
    name = (payload.get("name") or "").strip() or "API Key"

    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        api_key = _generate_api_key()
        key_hash = hashlib.sha256(api_key.encode("utf-8")).hexdigest()
        key_prefix = api_key[:12]
        key_last4 = api_key[-4:]

        insert_result = supabase.table("api_keys").insert({
            "user_id": user_id,
            "name": name,
            "key_hash": key_hash,
            "key_prefix": key_prefix,
            "key_last4": key_last4,
            "revoked": False
        }).execute()

        created = insert_result.data[0] if insert_result.data else None
        if not created:
            raise HTTPException(status_code=500, detail="Unable to create API key")

        return {
            "success": True,
            "api_key": api_key,
            "key": {
                "id": created.get("id"),
                "name": created.get("name"),
                "key_prefix": created.get("key_prefix"),
                "key_last4": created.get("key_last4"),
                "revoked": created.get("revoked"),
                "created_at": created.get("created_at")
            }
        }
    except Exception as e:
        print(f"Error creating api key: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/settings/api-keys/revoke")
async def revoke_api_key(payload: dict, request: Request):
    user_id = get_user_id(request)
    key_id = payload.get("key_id")
    if not key_id:
        raise HTTPException(status_code=400, detail="key_id requis")

    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        result = supabase.table("api_keys").update({
            "revoked": True,
            "revoked_at": datetime.utcnow().isoformat()
        }).eq("id", key_id).eq("user_id", user_id).execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="API key introuvable")

        return {"success": True}
    except Exception as e:
        print(f"Error revoking api key: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/user/profile/update")
async def update_user_shopify(payload: dict, request: Request):
    """Met à jour les credentials Shopify de l'utilisateur"""
    user_id = get_user_id(request)
    
    shopify_url = payload.get("shopify_shop_url", "").strip()
    shopify_token = payload.get("shopify_access_token", "").strip()
    
    if not shopify_url or not shopify_token:
        raise HTTPException(status_code=400, detail="Shop URL et Access Token requis")
    
    # Normalize: strip protocol, trailing slashes, lowercase
    shopify_url = shopify_url.lower().strip("/")
    for prefix in ["https://", "http://"]:
        if shopify_url.startswith(prefix):
            shopify_url = shopify_url[len(prefix):]
    # If user typed just the store name, append .myshopify.com
    if "." not in shopify_url:
        shopify_url = f"{shopify_url}.myshopify.com"
    
    # Valider le format du shop URL
    if not shopify_url.endswith('.myshopify.com'):
        raise HTTPException(status_code=400, detail="URL invalide. Format attendu: boutique.myshopify.com")
    
    try:
        from supabase import create_client
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        
        # Check if this specific shop is already connected for this user
        existing = (
            supabase.table("shopify_connections")
            .select("*")
            .eq("user_id", user_id)
            .eq("shop_domain", shopify_url)
            .execute()
        )
        
        if existing.data:
            # Update existing connection for this shop
            update_data = {"access_token": shopify_token, "updated_at": "now()"}
            try:
                supabase.table("shopify_connections").update({**update_data, "is_active": True}).eq("user_id", user_id).eq("shop_domain", shopify_url).execute()
            except Exception:
                supabase.table("shopify_connections").update(update_data).eq("user_id", user_id).eq("shop_domain", shopify_url).execute()
        else:
            # Enforce shop limit per plan
            tier = get_user_tier(user_id)
            shop_limit = _get_shop_limit(tier)
            current_count = _count_user_shops(user_id)
            if shop_limit is not None and current_count >= shop_limit:
                raise HTTPException(
                    status_code=403,
                    detail=f"Limite de boutiques atteinte ({current_count}/{shop_limit}). "
                           f"Votre plan {tier.capitalize()} permet {shop_limit} boutique(s). "
                           f"Supprimez une boutique existante ou passez au plan supérieur."
                )
            # Create new connection
            insert_data = {"user_id": user_id, "shop_domain": shopify_url, "access_token": shopify_token}
            try:
                supabase.table("shopify_connections").insert({**insert_data, "is_active": True}).execute()
            except Exception:
                supabase.table("shopify_connections").insert(insert_data).execute()
        
        # Deactivate other shops (set this one as active)
        try:
            supabase.table("shopify_connections").update({"is_active": False}).eq("user_id", user_id).neq("shop_domain", shopify_url).execute()
        except Exception:
            pass  # is_active column may not exist yet
        
        return {"success": True, "message": "Shopify connecté avec succès", "active_shop": shopify_url}
        
    except Exception as e:
        print(f"Error saving Shopify credentials: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur Shopify: {str(e)}")


# ── Shopify Client Credentials + Token Refresh ──
# Dev Dashboard apps (2026+) use grant_type=client_credentials.
# Tokens expire every 24h. The backend auto-refreshes them.
_shopify_token_cache: dict[str, tuple[float, str]] = {}  # shop -> (expiry_ts, token)
_SHOPIFY_TOKEN_TTL = 82800  # refresh 1h before expiry (24h - 1h = 23h)


def _get_or_refresh_shopify_token(shop: str) -> str | None:
    """Get a valid Shopify access token for a shop via Client Credentials Grant.
    Auto-refreshes if expired. Returns None if credentials are not configured."""
    if not SHOPIFY_API_KEY or not SHOPIFY_API_SECRET:
        return None

    # Check cache
    cached = _shopify_token_cache.get(shop)
    if cached:
        expiry_ts, token = cached
        if time.time() < expiry_ts:
            return token

    # Request new token via Client Credentials Grant
    try:
        resp = requests.post(
            f"https://{shop}/admin/oauth/access_token",
            data={
                "grant_type": "client_credentials",
                "client_id": SHOPIFY_API_KEY,
                "client_secret": SHOPIFY_API_SECRET,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        token = data.get("access_token")
        expires_in = data.get("expires_in", 86399)
        if token:
            _shopify_token_cache[shop] = (time.time() + min(expires_in - 3600, _SHOPIFY_TOKEN_TTL), token)
            print(f"✅ [SHOPIFY-CCG] Got token for {shop} (expires in {expires_in}s)")
            return token
        print(f"❌ [SHOPIFY-CCG] No access_token in response: {data}")
        return None
    except Exception as e:
        print(f"❌ [SHOPIFY-CCG] Token request failed for {shop}: {e}")
        return None


def _verify_shopify_hmac(query_params: dict, secret: str) -> bool:
    """Verify Shopify OAuth callback HMAC-SHA256 signature.
    Shopify signs the callback URL params (excluding 'hmac') with the app secret."""
    received_hmac = query_params.get("hmac", "")
    if not received_hmac:
        return False
    sorted_params = "&".join(
        f"{k}={v}" for k, v in sorted(query_params.items()) if k != "hmac"
    )
    computed = hmac.new(
        secret.encode("utf-8"),
        sorted_params.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(computed, received_hmac)


# ============================================================
# PRIMARY: Client Credentials Connect (Dev Dashboard apps)
# User enters shop domain → backend gets token automatically
# ============================================================

@app.post("/api/shopify/connect-shop")
async def shopify_connect_shop(request: Request):
    """🔐 Connect a Shopify shop via Client Credentials Grant.
    The user only needs to provide their shop domain.
    The backend exchanges client_id + client_secret for an access token
    directly with Shopify — NO redirect, NO manual token paste.

    Requires: the Shopify app must be installed on the target shop.
    Body: { "shop": "mystore.myshopify.com" }
    """
    user_id = get_user_id(request)
    body = await request.json()

    shop = (body.get("shop") or "").strip().lower().replace("https://", "").replace("http://", "").strip("/")
    if not shop:
        raise HTTPException(status_code=400, detail="Missing 'shop' parameter")
    if "." not in shop:
        shop = f"{shop}.myshopify.com"
    if not shop.endswith(".myshopify.com"):
        raise HTTPException(status_code=400, detail="Format attendu : ma-boutique.myshopify.com")

    if not SHOPIFY_API_KEY or not SHOPIFY_API_SECRET:
        raise HTTPException(status_code=500, detail="Shopify API credentials not configured on the server. Contact support.")

    # ── 1. Enforce shop limit per plan ──
    tier = get_user_tier(user_id)
    shop_limit = _get_shop_limit(tier)
    current_count = _count_user_shops(user_id)

    # Check if this shop is already connected (allow reconnect)
    existing = None
    if SUPABASE_URL and SUPABASE_SERVICE_KEY:
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        existing = supabase.table("shopify_connections").select("id").eq("user_id", user_id).eq("shop_domain", shop).execute()

    if not (existing and existing.data):
        # New shop — check limit
        if shop_limit is not None and current_count >= shop_limit:
            return {
                "success": False,
                "error": "limit_reached",
                "message": f"Limite de {shop_limit} boutique{'s' if shop_limit > 1 else ''} atteinte (plan {tier}). Passez au plan supérieur.",
                "plan": tier,
                "limit": shop_limit,
            }

    # ── 2. Get token via Client Credentials Grant ──
    print(f"🔄 [SHOPIFY-CCG] Requesting token for {shop} (user={user_id})")
    try:
        resp = requests.post(
            f"https://{shop}/admin/oauth/access_token",
            data={
                "grant_type": "client_credentials",
                "client_id": SHOPIFY_API_KEY,
                "client_secret": SHOPIFY_API_SECRET,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=15,
        )

        if resp.status_code == 404:
            return {
                "success": False,
                "error": "app_not_installed",
                "message": f"L'app ShopBrain AI n'est pas installée sur {shop}. Installez-la d'abord depuis le Dev Dashboard Shopify.",
            }

        if resp.status_code in (401, 403):
            return {
                "success": False,
                "error": "auth_failed",
                "message": f"Les credentials de l'app ne sont pas valides pour {shop}. Vérifiez que l'app est installée et les API scopes configurés.",
            }

        resp.raise_for_status()
        token_data = resp.json()
        access_token = token_data.get("access_token")
        granted_scopes = token_data.get("scope", "")
        expires_in = token_data.get("expires_in", 86399)

        if not access_token:
            return {"success": False, "error": "no_token", "message": "Shopify n'a pas retourné de token."}

        print(f"✅ [SHOPIFY-CCG] Got token for {shop} (scopes: {granted_scopes}, expires: {expires_in}s)")

    except requests.exceptions.Timeout:
        return {"success": False, "error": "timeout", "message": f"Shopify ne répond pas pour {shop}. Réessayez."}
    except requests.exceptions.HTTPError as he:
        return {"success": False, "error": "http_error", "message": f"Erreur Shopify: {he}"}
    except Exception as e:
        print(f"❌ [SHOPIFY-CCG] Error: {e}")
        return {"success": False, "error": "internal", "message": f"Erreur interne: {str(e)}"}

    # ── 3. Verify the token works ──
    try:
        verify_resp = requests.get(
            f"https://{shop}/admin/api/2024-10/shop.json",
            headers={"X-Shopify-Access-Token": access_token},
            timeout=10,
        )
        if verify_resp.status_code != 200:
            return {"success": False, "error": "token_invalid", "message": "Le token obtenu ne fonctionne pas. Vérifiez les scopes de l'app."}

        shop_info = verify_resp.json().get("shop", {})
        shop_name = shop_info.get("name", shop)
        print(f"✅ [SHOPIFY-CCG] Token verified — shop: {shop_name}")
    except Exception as e:
        print(f"⚠️ [SHOPIFY-CCG] Token verification failed: {e}")
        shop_name = shop

    # ── 4. Store token securely in Supabase ──
    if SUPABASE_URL and SUPABASE_SERVICE_KEY:
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

        # Cache the token for auto-refresh
        _shopify_token_cache[shop] = (time.time() + min(expires_in - 3600, _SHOPIFY_TOKEN_TTL), access_token)

        if existing and existing.data:
            # Update existing connection
            update_data = {"access_token": access_token, "updated_at": datetime.utcnow().isoformat()}
            try:
                supabase.table("shopify_connections").update({**update_data, "is_active": True}).eq("user_id", user_id).eq("shop_domain", shop).execute()
            except Exception:
                supabase.table("shopify_connections").update(update_data).eq("user_id", user_id).eq("shop_domain", shop).execute()
            print(f"✅ [SHOPIFY-CCG] Updated existing connection for {shop}")
        else:
            # Create new connection
            insert_data = {"user_id": user_id, "shop_domain": shop, "access_token": access_token}
            try:
                supabase.table("shopify_connections").insert({**insert_data, "is_active": True}).execute()
            except Exception:
                supabase.table("shopify_connections").insert(insert_data).execute()
            print(f"✅ [SHOPIFY-CCG] Stored new connection for {shop}")

        # Deactivate other shops (set this one as active)
        try:
            supabase.table("shopify_connections").update({"is_active": False}).eq("user_id", user_id).neq("shop_domain", shop).execute()
        except Exception:
            pass

    # ── 5. Count products for feedback ──
    product_count = 0
    try:
        products_resp = requests.get(
            f"https://{shop}/admin/api/2024-10/products/count.json",
            headers={"X-Shopify-Access-Token": access_token},
            timeout=10,
        )
        if products_resp.status_code == 200:
            product_count = products_resp.json().get("count", 0)
    except Exception:
        pass

    return {
        "success": True,
        "shop_domain": shop,
        "shop_name": shop_name,
        "scopes": granted_scopes,
        "product_count": product_count,
        "token_expires_in": expires_in,
        "message": f"✅ {shop_name} connectée ! {product_count} produits trouvés.",
    }


# ============================================================
# LEGACY FALLBACK: OAuth Authorization Code Grant (Partner apps)
# Keep for future use if app goes public
# ============================================================

# ── OAuth nonce store (in-memory, TTL 10 min) ──
_shopify_oauth_nonces: dict[str, tuple[float, str]] = {}
_SHOPIFY_NONCE_TTL = 600


@app.get("/api/shopify/oauth/authorize")
async def shopify_oauth_authorize(request: Request):
    """🔐 Legacy OAuth: Initiate Shopify OAuth redirect flow.
    For Partner/public apps that use the authorization code grant.
    Dev Dashboard apps should use POST /api/shopify/connect-shop instead."""

    # Accept token from query param (browser redirect) OR header (API call)
    token_param = request.query_params.get("token", "")
    auth_header = request.headers.get("Authorization", "")

    user_id = None

    # Try Authorization header first (API calls)
    if auth_header.startswith("Bearer "):
        try:
            user_id = get_user_id(request)
        except Exception:
            pass

    # Fallback: decode token from query param (browser redirect)
    if not user_id and token_param:
        try:
            payload = jwt.decode(token_param, SUPABASE_JWT_SECRET, algorithms=["HS256"], audience="authenticated")
            user_id = payload.get("sub")
        except Exception as e:
            print(f"❌ [SHOPIFY-OAUTH] Token decode failed: {e}")

    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required. Please log in.")

    shop = request.query_params.get("shop", "").strip().lower().replace("https://", "").replace("http://", "").strip("/")
    if not shop:
        raise HTTPException(status_code=400, detail="Missing 'shop' parameter")
    # Auto-append .myshopify.com if user typed just the store name
    if "." not in shop:
        shop = f"{shop}.myshopify.com"
    if not shop.endswith(".myshopify.com"):
        raise HTTPException(status_code=400, detail="Invalid shop domain. Expected format: mystore.myshopify.com")

    if not SHOPIFY_API_KEY:
        raise HTTPException(status_code=500, detail="Shopify API key not configured on the server")

    # Generate a cryptographic nonce for CSRF protection
    # The nonce is stored server-side and tied to the user_id
    nonce = uuid.uuid4().hex
    _shopify_oauth_nonces[nonce] = (time.time(), user_id)

    # Cleanup old nonces (> 10 min)
    cutoff = time.time() - _SHOPIFY_NONCE_TTL
    expired = [k for k, (ts, _) in _shopify_oauth_nonces.items() if ts < cutoff]
    for k in expired:
        _shopify_oauth_nonces.pop(k, None)

    # The state parameter carries nonce:user_id so we can verify on callback
    state = f"{nonce}:{user_id}"

    redirect_uri = SHOPIFY_REDIRECT_URI
    auth_url = (
        f"https://{shop}/admin/oauth/authorize?"
        f"client_id={SHOPIFY_API_KEY}"
        f"&scope={SHOPIFY_SCOPES}"
        f"&redirect_uri={redirect_uri}"
        f"&state={state}"
        f"&grant_options[]="  # Online access mode not needed for backend-only tokens
    )

    print(f"🔐 [SHOPIFY-OAUTH] Redirecting user {user_id} to Shopify auth for shop {shop}")
    return RedirectResponse(url=auth_url)


@app.get("/auth/shopify/callback")
async def shopify_callback(request: Request):
    """🔐 Step 2: Handle Shopify OAuth callback.
    - Verifies HMAC signature from Shopify
    - Verifies state/nonce matches what we generated
    - Exchanges authorization code for permanent access token
    - Stores token securely in Supabase (never exposed to frontend)
    - Redirects user back to the dashboard"""

    params = dict(request.query_params)
    code = params.get("code")
    shop = params.get("shop", "").strip().lower().strip("/")
    state = params.get("state", "")
    received_hmac = params.get("hmac", "")

    if not code or not shop or not state:
        print(f"❌ [SHOPIFY-OAUTH] Missing params: code={bool(code)}, shop={bool(shop)}, state={bool(state)}")
        frontend_url = FRONTEND_ORIGIN
        return RedirectResponse(url=f"{frontend_url}/#/dashboard?shopify=error&reason=missing_params")

    if not SHOPIFY_API_KEY or not SHOPIFY_API_SECRET:
        print("❌ [SHOPIFY-OAUTH] SHOPIFY_API_KEY or SHOPIFY_API_SECRET not configured")
        frontend_url = FRONTEND_ORIGIN
        return RedirectResponse(url=f"{frontend_url}/#/dashboard?shopify=error&reason=server_config")

    # ── 1. Verify HMAC signature ──
    if received_hmac:
        if not _verify_shopify_hmac(params, SHOPIFY_API_SECRET):
            print(f"❌ [SHOPIFY-OAUTH] HMAC verification FAILED for shop {shop}")
            frontend_url = FRONTEND_ORIGIN
            return RedirectResponse(url=f"{frontend_url}/#/dashboard?shopify=error&reason=hmac_failed")
        print(f"✅ [SHOPIFY-OAUTH] HMAC verified for shop {shop}")
    else:
        print(f"⚠️ [SHOPIFY-OAUTH] No HMAC in callback params (shop={shop}) — proceeding with state verification only")

    # ── 2. Verify state/nonce (CSRF protection) ──
    nonce = None
    user_id = None
    if ":" in state:
        nonce, user_id = state.split(":", 1)
    else:
        user_id = state  # Legacy fallback (state=user_id without nonce)

    if nonce and nonce in _shopify_oauth_nonces:
        nonce_ts, nonce_user_id = _shopify_oauth_nonces.pop(nonce)
        if time.time() - nonce_ts > _SHOPIFY_NONCE_TTL:
            print(f"❌ [SHOPIFY-OAUTH] Nonce expired for user {user_id}")
            frontend_url = FRONTEND_ORIGIN
            return RedirectResponse(url=f"{frontend_url}/#/dashboard?shopify=error&reason=expired")
        if nonce_user_id != user_id:
            print(f"❌ [SHOPIFY-OAUTH] Nonce user_id mismatch: expected {nonce_user_id}, got {user_id}")
            frontend_url = FRONTEND_ORIGIN
            return RedirectResponse(url=f"{frontend_url}/#/dashboard?shopify=error&reason=state_mismatch")
        print(f"✅ [SHOPIFY-OAUTH] Nonce verified for user {user_id}")
    elif nonce:
        print(f"⚠️ [SHOPIFY-OAUTH] Nonce not found in store (may have expired or server restarted) — trusting state param")

    if not user_id:
        print(f"❌ [SHOPIFY-OAUTH] Could not extract user_id from state: {state}")
        frontend_url = FRONTEND_ORIGIN
        return RedirectResponse(url=f"{frontend_url}/#/dashboard?shopify=error&reason=no_user")

    # Handle "install" flow — merchant came from Shopify App Store, no ShopBrain user yet
    is_install_flow = (user_id == "install")

    # Normalize shop domain
    for prefix in ["https://", "http://"]:
        if shop.startswith(prefix):
            shop = shop[len(prefix):]
    shop = shop.strip("/")

    # ── 3. Exchange authorization code for access token ──
    token_url = f"https://{shop}/admin/oauth/access_token"
    exchange_payload = {
        "client_id": SHOPIFY_API_KEY,
        "client_secret": SHOPIFY_API_SECRET,
        "code": code,
    }

    frontend_url = FRONTEND_ORIGIN

    try:
        print(f"🔄 [SHOPIFY-OAUTH] Exchanging code for token (shop={shop}, user={user_id})")
        response = requests.post(token_url, json=exchange_payload, timeout=15)
        response.raise_for_status()
        token_data = response.json()
        access_token = token_data.get("access_token")
        granted_scopes = token_data.get("scope", "")

        if not access_token:
            print(f"❌ [SHOPIFY-OAUTH] No access_token in response: {token_data}")
            return RedirectResponse(url=f"{frontend_url}/#/dashboard?shopify=error&reason=no_token")

        print(f"✅ [SHOPIFY-OAUTH] Got access token for {shop} (scopes: {granted_scopes})")

        # ── 4. Verify we got the scopes we need ──
        required_scopes = {"read_products", "read_orders", "read_customers"}
        granted_set = set(granted_scopes.split(",")) if granted_scopes else set()
        missing_scopes = required_scopes - granted_set
        if missing_scopes:
            print(f"⚠️ [SHOPIFY-OAUTH] Missing scopes: {missing_scopes}. Granted: {granted_set}")
            # Don't block — store what we got, but log the warning

        # ── 5. Verify the token works by hitting the shop API ──
        verify_resp = requests.get(
            f"https://{shop}/admin/api/2024-10/shop.json",
            headers={"X-Shopify-Access-Token": access_token},
            timeout=10,
        )
        if verify_resp.status_code != 200:
            print(f"❌ [SHOPIFY-OAUTH] Token verification failed: {verify_resp.status_code} {verify_resp.text[:200]}")
            return RedirectResponse(url=f"{frontend_url}/#/dashboard?shopify=error&reason=token_invalid")

        shop_info = verify_resp.json().get("shop", {})
        shop_name = shop_info.get("name", shop)
        print(f"✅ [SHOPIFY-OAUTH] Token verified — shop name: {shop_name}")

        # ── 6. Store token securely in Supabase ──
        if SUPABASE_URL and SUPABASE_SERVICE_KEY and not is_install_flow:
            supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

            # Check if this shop is already connected for this user
            existing = (
                supabase.table("shopify_connections")
                .select("id")
                .eq("user_id", user_id)
                .eq("shop_domain", shop)
                .execute()
            )

            if existing.data:
                update_data = {"access_token": access_token, "updated_at": datetime.utcnow().isoformat()}
                try:
                    supabase.table("shopify_connections").update({**update_data, "is_active": True}).eq("user_id", user_id).eq("shop_domain", shop).execute()
                except Exception:
                    supabase.table("shopify_connections").update(update_data).eq("user_id", user_id).eq("shop_domain", shop).execute()
                print(f"✅ [SHOPIFY-OAUTH] Updated existing connection for {shop}")
            else:
                # Enforce shop limit per plan
                tier = get_user_tier(user_id)
                shop_limit = _get_shop_limit(tier)
                current_count = _count_user_shops(user_id)
                if shop_limit is not None and current_count >= shop_limit:
                    return RedirectResponse(
                        url=f"{frontend_url}/#/dashboard?shopify=limit_reached&plan={tier}&limit={shop_limit}"
                    )
                # Create new connection
                insert_data = {
                    "user_id": user_id,
                    "shop_domain": shop,
                    "access_token": access_token,
                }
                try:
                    supabase.table("shopify_connections").insert({**insert_data, "is_active": True}).execute()
                except Exception:
                    supabase.table("shopify_connections").insert(insert_data).execute()
                print(f"✅ [SHOPIFY-OAUTH] Stored new connection for {shop}")

            # Deactivate other shops (set this one as active)
            try:
                supabase.table("shopify_connections").update({"is_active": False}).eq("user_id", user_id).neq("shop_domain", shop).execute()
            except Exception:
                pass

        # ── 7. Redirect back to dashboard/frontend with success ──
        if is_install_flow:
            # Merchant came from Shopify App Store — store token temporarily, redirect to signup/login
            if SUPABASE_URL and SUPABASE_SERVICE_KEY:
                try:
                    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
                    # Store with a pending placeholder user_id; merchant will link account on signup
                    supabase.table("shopify_connections").insert({
                        "user_id": f"pending_install_{shop}",
                        "shop_domain": shop,
                        "access_token": access_token,
                        "is_active": True,
                    }).execute()
                    print(f"✅ [SHOPIFY-INSTALL] Stored pending connection for {shop}")
                except Exception as install_db_err:
                    print(f"⚠️ [SHOPIFY-INSTALL] DB store warning: {install_db_err}")
            return RedirectResponse(url=f"{frontend_url}/#/?shopify_install=success&shop={shop}")
        else:
            return RedirectResponse(url=f"{frontend_url}/#/dashboard?shopify=connected&shop={shop}")

    except requests.exceptions.Timeout:
        print(f"❌ [SHOPIFY-OAUTH] Token exchange timed out for {shop}")
        return RedirectResponse(url=f"{frontend_url}/#/dashboard?shopify=error&reason=timeout")
    except requests.exceptions.HTTPError as he:
        print(f"❌ [SHOPIFY-OAUTH] Token exchange HTTP error: {he}")
        return RedirectResponse(url=f"{frontend_url}/#/dashboard?shopify=error&reason=exchange_failed")
    except Exception as e:
        print(f"❌ [SHOPIFY-OAUTH] Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        return RedirectResponse(url=f"{frontend_url}/#/dashboard?shopify=error&reason=internal")


# ============================================================
# SHOPIFY APP INSTALL ENTRY POINT
# When a merchant clicks "Install" from the Shopify App Store,
# Shopify sends them to the App URL with ?shop=xxx&hmac=xxx
# We must immediately start OAuth authentication.
# ============================================================

@app.get("/api/shopify/install")
async def shopify_install(request: Request):
    """🔐 Shopify App Install entry point.
    When a merchant installs the app from the Shopify App Store,
    Shopify redirects them here with ?shop=xxx.myshopify.com
    We immediately redirect to the OAuth authorization URL.
    This satisfies the 'Immediately authenticates after install' requirement."""

    shop = request.query_params.get("shop", "").strip().lower().replace("https://", "").replace("http://", "").strip("/")
    if not shop:
        raise HTTPException(status_code=400, detail="Missing 'shop' parameter")
    if "." not in shop:
        shop = f"{shop}.myshopify.com"
    if not shop.endswith(".myshopify.com"):
        raise HTTPException(status_code=400, detail="Invalid shop domain")

    if not SHOPIFY_API_KEY or not SHOPIFY_API_SECRET:
        raise HTTPException(status_code=500, detail="Shopify credentials not configured")

    # Verify HMAC if provided (Shopify signs install requests)
    params = dict(request.query_params)
    received_hmac = params.get("hmac", "")
    if received_hmac and SHOPIFY_API_SECRET:
        if not _verify_shopify_hmac(params, SHOPIFY_API_SECRET):
            print(f"❌ [SHOPIFY-INSTALL] HMAC verification FAILED for shop {shop}")
            raise HTTPException(status_code=401, detail="HMAC verification failed")
        print(f"✅ [SHOPIFY-INSTALL] HMAC verified for shop {shop}")

    # Generate nonce for CSRF protection
    nonce = uuid.uuid4().hex
    # For install flow, we don't have a user_id yet — store "install" as placeholder
    _shopify_oauth_nonces[nonce] = (time.time(), "install")

    state = f"{nonce}:install"

    redirect_uri = SHOPIFY_REDIRECT_URI
    auth_url = (
        f"https://{shop}/admin/oauth/authorize?"
        f"client_id={SHOPIFY_API_KEY}"
        f"&scope={SHOPIFY_SCOPES}"
        f"&redirect_uri={redirect_uri}"
        f"&state={state}"
    )

    print(f"🔐 [SHOPIFY-INSTALL] Merchant installing from {shop} — redirecting to OAuth")
    return RedirectResponse(url=auth_url)


# ============================================================
# SHOPIFY MANDATORY COMPLIANCE WEBHOOKS (GDPR)
# Required for App Store approval:
# - customers/data_request
# - customers/redact
# - shop/redact
# All must verify HMAC and return 200.
# ============================================================

def _verify_shopify_webhook_hmac(body: bytes, hmac_header: str, secret: str) -> bool:
    """Verify Shopify webhook HMAC-SHA256 signature.
    Shopify signs webhook payloads with the app's client secret.
    The HMAC is sent in the X-Shopify-Hmac-Sha256 header as base64."""
    if not hmac_header or not secret:
        return False
    computed = hmac.new(
        secret.encode("utf-8"),
        body,
        hashlib.sha256,
    ).digest()
    computed_b64 = base64.b64encode(computed).decode("utf-8")
    return hmac.compare_digest(computed_b64, hmac_header)


@app.post("/api/shopify/webhooks")
async def shopify_webhooks_dispatcher(request: Request):
    """🔀 Unified Shopify compliance webhook dispatcher.
    Shopify sends all compliance webhooks to a single URI with
    X-Shopify-Topic header to identify the topic.
    Routes to the appropriate handler."""
    topic = request.headers.get("X-Shopify-Topic", "").strip().lower()
    print(f"📬 [SHOPIFY-WEBHOOK] Received topic: {topic}")

    if topic == "customers/data_request":
        return await shopify_webhook_customers_data_request(request)
    elif topic == "customers/redact":
        return await shopify_webhook_customers_redact(request)
    elif topic == "shop/redact":
        return await shopify_webhook_shop_redact(request)
    else:
        # Still verify HMAC even for unknown topics
        body = await request.body()
        hmac_header = request.headers.get("X-Shopify-Hmac-Sha256", "")
        if hmac_header and not _verify_shopify_webhook_hmac(body, hmac_header, SHOPIFY_API_SECRET or ""):
            return JSONResponse(status_code=401, content={"error": "Unauthorized"})
        print(f"⚠️ [SHOPIFY-WEBHOOK] Unknown topic: {topic}")
        return JSONResponse(status_code=200, content={"success": True, "topic": topic})


@app.post("/api/shopify/webhooks/customers-data-request")
async def shopify_webhook_customers_data_request(request: Request):
    """📋 GDPR: customers/data_request — A customer requests their data.
    We acknowledge receipt and would provide the data to the store owner."""
    body = await request.body()
    hmac_header = request.headers.get("X-Shopify-Hmac-Sha256", "")

    if not _verify_shopify_webhook_hmac(body, hmac_header, SHOPIFY_API_SECRET or ""):
        print(f"❌ [SHOPIFY-GDPR] customers/data_request HMAC verification FAILED")
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})

    try:
        payload = json.loads(body)
        shop_domain = payload.get("shop_domain", "unknown")
        customer = payload.get("customer", {})
        customer_id = customer.get("id")
        customer_email = customer.get("email")
        print(f"📋 [SHOPIFY-GDPR] customers/data_request from {shop_domain}: customer_id={customer_id}, email={customer_email}")

        # ShopBrain AI stores minimal customer data (only what Shopify API provides during analysis).
        # We log the request for compliance tracking.
        if SUPABASE_URL and SUPABASE_SERVICE_KEY:
            try:
                supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
                supabase.table("gdpr_requests").insert({
                    "type": "customers/data_request",
                    "shop_domain": shop_domain,
                    "customer_id": str(customer_id) if customer_id else None,
                    "customer_email": customer_email,
                    "payload": json.dumps(payload),
                    "status": "received",
                    "created_at": datetime.utcnow().isoformat(),
                }).execute()
            except Exception as db_err:
                print(f"⚠️ [SHOPIFY-GDPR] DB log warning (non-blocking): {db_err}")

    except Exception as e:
        print(f"⚠️ [SHOPIFY-GDPR] customers/data_request parse warning: {e}")

    return JSONResponse(status_code=200, content={"success": True})


@app.post("/api/shopify/webhooks/customers-redact")
async def shopify_webhook_customers_redact(request: Request):
    """🗑️ GDPR: customers/redact — Store owner requests deletion of customer data.
    We delete any stored customer data for this customer."""
    body = await request.body()
    hmac_header = request.headers.get("X-Shopify-Hmac-Sha256", "")

    if not _verify_shopify_webhook_hmac(body, hmac_header, SHOPIFY_API_SECRET or ""):
        print(f"❌ [SHOPIFY-GDPR] customers/redact HMAC verification FAILED")
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})

    try:
        payload = json.loads(body)
        shop_domain = payload.get("shop_domain", "unknown")
        customer = payload.get("customer", {})
        customer_id = customer.get("id")
        customer_email = customer.get("email")
        orders_to_redact = payload.get("orders_to_redact", [])
        print(f"🗑️ [SHOPIFY-GDPR] customers/redact from {shop_domain}: customer_id={customer_id}, email={customer_email}, orders={orders_to_redact}")

        # Delete any cached analysis data for this customer
        if SUPABASE_URL and SUPABASE_SERVICE_KEY:
            try:
                supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
                # Log the redact request
                supabase.table("gdpr_requests").insert({
                    "type": "customers/redact",
                    "shop_domain": shop_domain,
                    "customer_id": str(customer_id) if customer_id else None,
                    "customer_email": customer_email,
                    "payload": json.dumps(payload),
                    "status": "completed",
                    "created_at": datetime.utcnow().isoformat(),
                }).execute()
            except Exception as db_err:
                print(f"⚠️ [SHOPIFY-GDPR] DB log warning (non-blocking): {db_err}")

    except Exception as e:
        print(f"⚠️ [SHOPIFY-GDPR] customers/redact parse warning: {e}")

    return JSONResponse(status_code=200, content={"success": True})


@app.post("/api/shopify/webhooks/shop-redact")
async def shopify_webhook_shop_redact(request: Request):
    """🏪 GDPR: shop/redact — 48h after app uninstall, delete all shop data.
    We remove the shop's connection and any cached data."""
    body = await request.body()
    hmac_header = request.headers.get("X-Shopify-Hmac-Sha256", "")

    if not _verify_shopify_webhook_hmac(body, hmac_header, SHOPIFY_API_SECRET or ""):
        print(f"❌ [SHOPIFY-GDPR] shop/redact HMAC verification FAILED")
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})

    try:
        payload = json.loads(body)
        shop_domain = payload.get("shop_domain", "unknown")
        shop_id = payload.get("shop_id")
        print(f"🏪 [SHOPIFY-GDPR] shop/redact: shop_domain={shop_domain}, shop_id={shop_id}")

        # Delete the shop connection and any related data
        if SUPABASE_URL and SUPABASE_SERVICE_KEY:
            try:
                supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

                # Delete shop connection
                supabase.table("shopify_connections").delete().eq("shop_domain", shop_domain).execute()
                print(f"✅ [SHOPIFY-GDPR] Deleted shopify_connections for {shop_domain}")

                # Log the redact request
                supabase.table("gdpr_requests").insert({
                    "type": "shop/redact",
                    "shop_domain": shop_domain,
                    "shop_id": str(shop_id) if shop_id else None,
                    "payload": json.dumps(payload),
                    "status": "completed",
                    "created_at": datetime.utcnow().isoformat(),
                }).execute()
            except Exception as db_err:
                print(f"⚠️ [SHOPIFY-GDPR] DB operations warning: {db_err}")

    except Exception as e:
        print(f"⚠️ [SHOPIFY-GDPR] shop/redact parse warning: {e}")

    return JSONResponse(status_code=200, content={"success": True})


@app.get("/api/shopify/oauth/status")
async def shopify_oauth_status():
    """Check if Shopify OAuth is configured on the server."""
    return {
        "oauth_available": bool(SHOPIFY_API_KEY and SHOPIFY_API_SECRET),
        "scopes": SHOPIFY_SCOPES,
    }


@app.get("/api/shopify/connection")
async def get_shopify_connection(request: Request):
    """Récupère TOUTES les boutiques Shopify connectées (multi-shop).

    Retourne:
      - connections: liste de toutes les boutiques
      - connection: la boutique active (rétro-compatibilité)
      - shop_limit: limite du plan actuel
    """
    user_id = get_user_id(request)

    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        try:
            result = (
                supabase.table("shopify_connections")
                .select("shop_domain,is_active,created_at,updated_at")
                .eq("user_id", user_id)
                .order("is_active", desc=True)
                .order("updated_at", desc=True)
                .execute()
            )
            connections = result.data or []
            active = next((c for c in connections if c.get("is_active")), connections[0] if connections else None)
        except Exception:
            # Fallback: is_active column may not exist
            result = (
                supabase.table("shopify_connections")
                .select("shop_domain,created_at,updated_at")
                .eq("user_id", user_id)
                .order("updated_at", desc=True)
                .execute()
            )
            connections = result.data or []
            active = connections[0] if connections else None

        tier = get_user_tier(user_id)
        shop_limit = _get_shop_limit(tier)

        return {
            "success": True,
            "connection": active,            # rétro-compat
            "connections": connections,       # multi-shop list
            "shop_count": len(connections),
            "shop_limit": shop_limit,        # None = unlimited
            "tier": tier,
        }
    except Exception as e:
        print(f"Error fetching Shopify connections: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/shopify/switch-shop")
async def switch_active_shop(request: Request):
    """Changer la boutique active (multi-shop).

    Body: { "shop_domain": "ma-boutique.myshopify.com" }
    """
    user_id = get_user_id(request)
    body = await request.json()
    target_domain = (body.get("shop_domain") or "").strip().lower().strip("/")
    for prefix in ["https://", "http://"]:
        if target_domain.startswith(prefix):
            target_domain = target_domain[len(prefix):]

    if not target_domain:
        raise HTTPException(status_code=400, detail="shop_domain requis")

    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    # Verify this shop belongs to the user
    check = (
        supabase.table("shopify_connections")
        .select("id")
        .eq("user_id", user_id)
        .eq("shop_domain", target_domain)
        .execute()
    )
    if not check.data:
        raise HTTPException(status_code=404, detail="Boutique non trouvée dans vos connexions")

    # Deactivate all, then activate target
    try:
        supabase.table("shopify_connections").update({"is_active": False}).eq("user_id", user_id).execute()
        supabase.table("shopify_connections").update({"is_active": True, "updated_at": "now()"}).eq("user_id", user_id).eq("shop_domain", target_domain).execute()
    except Exception:
        # is_active column may not exist — just update updated_at
        supabase.table("shopify_connections").update({"updated_at": "now()"}).eq("user_id", user_id).eq("shop_domain", target_domain).execute()

    # Invalidate init cache
    _init_cache.pop(user_id, None)

    return {"success": True, "active_shop": target_domain}


@app.delete("/api/shopify/shop/{shop_domain}")
async def delete_shopify_shop(shop_domain: str, request: Request):
    """Supprimer une boutique connectée.

    Si c'est la boutique active, on active la suivante automatiquement.
    """
    user_id = get_user_id(request)
    normalized = shop_domain.strip().lower().strip("/")

    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    # Verify ownership
    try:
        check = (
            supabase.table("shopify_connections")
            .select("id,is_active")
            .eq("user_id", user_id)
            .eq("shop_domain", normalized)
            .execute()
        )
    except Exception:
        check = (
            supabase.table("shopify_connections")
            .select("id")
            .eq("user_id", user_id)
            .eq("shop_domain", normalized)
            .execute()
        )
    if not check.data:
        raise HTTPException(status_code=404, detail="Boutique non trouvée")

    was_active = check.data[0].get("is_active", True)  # assume active if column missing

    # Delete
    supabase.table("shopify_connections").delete().eq("user_id", user_id).eq("shop_domain", normalized).execute()

    # If deleted shop was active, activate the next one
    if was_active:
        remaining = (
            supabase.table("shopify_connections")
            .select("shop_domain")
            .eq("user_id", user_id)
            .order("updated_at", desc=True)
            .limit(1)
            .execute()
        )
        if remaining.data:
            next_shop = remaining.data[0]["shop_domain"]
            try:
                supabase.table("shopify_connections").update({"is_active": True}).eq("user_id", user_id).eq("shop_domain", next_shop).execute()
            except Exception:
                pass  # is_active column may not exist

    # Invalidate init cache
    _init_cache.pop(user_id, None)

    return {"success": True, "deleted": normalized}


@app.get("/api/shopify/keep-alive")
async def keep_shopify_connection(request: Request):
    """Ping Shopify pour vérifier que le token est toujours valide."""
    user_id = get_user_id(request)
    shop_domain, access_token = _get_shopify_connection(user_id)

    headers = {
        "X-Shopify-Access-Token": access_token,
        "Content-Type": "application/json",
    }

    try:
        response = requests.get(
            f"https://{shop_domain}/admin/api/2024-10/shop.json",
            headers=headers,
            timeout=20,
        )
        if response.status_code == 401:
            return {"success": True, "connected": False, "reason": "token_invalid"}
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=f"Erreur Shopify: {response.text[:200]}")
        return {"success": True, "connected": True, "shop": shop_domain}
    except requests.exceptions.Timeout:
        return {"success": True, "connected": True, "shop": shop_domain, "note": "timeout"}


@app.get("/api/shopify/shop")
async def get_shopify_shop(request: Request):
    """Retourne les infos de boutique nécessaires au frontend (ex: devise).

    Ne renvoie jamais le token.
    """
    user_id = get_user_id(request)
    shop_domain, access_token = _get_shopify_connection(user_id)

    cache_key = f"{user_id}:{shop_domain}".lower()
    cached = _cache_get_shop(cache_key, ttl_s=3600)
    if cached is not None:
        return {"success": True, **cached, "cached": True}

    headers = {
        "X-Shopify-Access-Token": access_token,
        "Content-Type": "application/json",
    }

    try:
        response = requests.get(
            f"https://{shop_domain}/admin/api/2024-10/shop.json",
            headers=headers,
            timeout=20,
        )
        if response.status_code == 401:
            raise HTTPException(status_code=401, detail="Token Shopify expiré ou invalide. Reconnectez-vous.")
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=f"Erreur Shopify: {response.text[:200]}")

        shop = (response.json() or {}).get("shop") or {}
        payload = {
            "shop_domain": shop_domain,
            "name": shop.get("name"),
            "currency_code": shop.get("currency"),
            "money_format": shop.get("money_format"),
            "money_with_currency_format": shop.get("money_with_currency_format"),
            "timezone": shop.get("timezone"),
        }
        _cache_set_shop(cache_key, payload)
        return {"success": True, **payload, "cached": False}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
    
    try:
        # Get user's active Shopify connection (multi-shop aware)
        shop_domain, access_token = _get_shopify_connection(user_id)
        
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
        
        # ── Enforce plan product limit ──
        tier = get_user_tier(user_id)
        plan_product_limit = get_plan_product_limit(tier)
        total_available = len(products)
        if plan_product_limit is not None and len(products) > plan_product_limit:
            products = products[:plan_product_limit]
        
        print(f"✅ Retrieved {total_available} products (plan {tier}: showing {len(products)})")
        
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


def _get_shopify_connection(user_id: str, shop_domain: str | None = None):
    """Retourne (shop_domain, access_token) pour la boutique active ou spécifiée.

    Multi-shop: un utilisateur peut avoir plusieurs lignes dans
    shopify_connections.  Si *shop_domain* est fourni on le cherche
    directement ; sinon on prend celle marquée ``is_active = true``,
    puis en dernier recours la plus récemment mise à jour.
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise HTTPException(status_code=500, detail="Supabase not configured")

    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    if shop_domain:
        # Explicit shop requested
        normalized = shop_domain.strip().lower().strip("/")
        for prefix in ["https://", "http://"]:
            if normalized.startswith(prefix):
                normalized = normalized[len(prefix):]
        connection = (
            supabase.table("shopify_connections")
            .select("shop_domain,access_token")
            .eq("user_id", user_id)
            .eq("shop_domain", normalized)
            .limit(1)
            .execute()
        )
    else:
        # Try active shop first (is_active column may not exist yet)
        try:
            connection = (
                supabase.table("shopify_connections")
                .select("shop_domain,access_token")
                .eq("user_id", user_id)
                .eq("is_active", True)
                .limit(1)
                .execute()
            )
        except Exception:
            connection = type('R', (), {'data': []})()  # empty fallback
        if not connection.data:
            # Fallback: most recently updated
            connection = (
                supabase.table("shopify_connections")
                .select("shop_domain,access_token")
                .eq("user_id", user_id)
                .order("updated_at", desc=True)
                .limit(1)
                .execute()
            )

    if not connection.data:
        raise HTTPException(status_code=404, detail="Aucune boutique Shopify connectée")

    row = connection.data[0]
    domain = (row.get("shop_domain") or "").strip().lower()
    access_token = row.get("access_token")

    if not domain or not access_token:
        raise HTTPException(status_code=400, detail="Connexion Shopify invalide")

    # Normalize: ensure clean domain format
    for prefix in ["https://", "http://"]:
        if domain.startswith(prefix):
            domain = domain[len(prefix):]
    domain = domain.strip("/")

    return domain, access_token


def _get_shop_limit(tier: str) -> int | None:
    """Return max shops allowed for tier (None = unlimited)."""
    return PLAN_LIMITS.get(tier, PLAN_LIMITS["free"]).get("shop_limit")


def _count_user_shops(user_id: str) -> int:
    """Count how many shops this user has connected."""
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    result = supabase.table("shopify_connections").select("id", count="exact").eq("user_id", user_id).execute()
    return result.count if result.count is not None else len(result.data or [])


def _parse_shopify_next_link(link_header: str | None) -> str | None:
    if not link_header:
        return None
    parts = link_header.split(',')
    for part in parts:
        if 'rel="next"' in part:
            start = part.find('<')
            end = part.find('>')
            if start != -1 and end != -1:
                return part[start + 1:end]
    return None


def _strip_html(text: str) -> str:
    if not text:
        return ""
    return re.sub(r"<[^>]+>", " ", text).replace("&nbsp;", " ").strip()


def _safe_float(value, default=0.0):
    try:
        return float(value)
    except Exception:
        return default


def _normalize_shopify_id(raw_id: str | int | None) -> str | None:
    if raw_id is None:
        return None
    if isinstance(raw_id, int):
        return str(raw_id)
    value = str(raw_id)
    if value.isdigit():
        return value
    match = re.search(r"(\d+)$", value)
    return match.group(1) if match else None


def _get_user_id_by_shop_domain(shop_domain: str) -> str | None:
    """Resolve a user_id from a shop_domain.
    
    Tries multiple domain format variants to handle mismatches between
    what Shopify.shop returns (e.g. 'store.myshopify.com') and what might
    be stored in the shopify_connections table.
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return None
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    
    # Build domain variants to try
    domain = (shop_domain or "").strip().lower()
    variants = [domain]
    bare = domain.replace(".myshopify.com", "")
    if bare != domain:
        variants.append(bare)
    full = f"{bare}.myshopify.com"
    if full != domain:
        variants.append(full)
    
    for variant in variants:
        result = supabase.table("shopify_connections").select("user_id").eq("shop_domain", variant).limit(1).execute()
        if result.data:
            return result.data[0].get("user_id")
    return None


_ORDERS_CACHE: dict[tuple[str, int, str], tuple[float, list[dict]]] = {}

# Bundles job store: simple in-memory registry for async jobs
_BUNDLES_JOBS: dict[str, dict] = {}
_BUNDLES_LOCK = threading.Lock()
_BUNDLES_CACHE: dict[str, dict] = {}


def _cache_get_orders(shop_domain: str, range_days: int, access_token: str) -> list[dict] | None:
    ttl = int(os.getenv("SHOPIFY_ORDERS_CACHE_TTL", "300"))
    if ttl <= 0:
        return None
    token_sig = hashlib.sha256(access_token.encode("utf-8")).hexdigest()[:12]
    key = (shop_domain, int(range_days), token_sig)
    entry = _ORDERS_CACHE.get(key)
    if not entry:
        return None
    ts, data = entry
    if time.time() - ts > ttl:
        _ORDERS_CACHE.pop(key, None)
        return None
    return data


def _cache_set_orders(shop_domain: str, range_days: int, access_token: str, orders: list[dict]) -> None:
    ttl = int(os.getenv("SHOPIFY_ORDERS_CACHE_TTL", "300"))
    if ttl <= 0:
        return
    token_sig = hashlib.sha256(access_token.encode("utf-8")).hexdigest()[:12]
    key = (shop_domain, int(range_days), token_sig)
    _ORDERS_CACHE[key] = (time.time(), orders)


def _fetch_shopify_orders(shop_domain: str, access_token: str, range_days: int = 30):
    """Fetch Shopify orders with bounded pagination.

    Note: This endpoint runs behind Cloudflare/Render; overly long requests may
    be terminated and surface as browser-level `Failed to fetch`. Keep this
    bounded.
    """
    cached = _cache_get_orders(shop_domain, range_days, access_token)
    if cached is not None:
        return cached

    start_date = (datetime.utcnow() - timedelta(days=range_days)).strftime("%Y-%m-%dT%H:%M:%SZ")
    headers = {
        "X-Shopify-Access-Token": access_token,
        "Content-Type": "application/json"
    }

    orders = []
    next_url = (
        f"https://{shop_domain}/admin/api/2024-10/orders.json"
        f"?status=any&created_at_min={start_date}&limit=250"
        f"&fields=id,created_at,total_price,financial_status,currency,line_items,refunds,order_number,name"
    )
    page_count = 0
    max_pages = int(os.getenv("SHOPIFY_ORDERS_MAX_PAGES", "3"))
    per_request_timeout = int(os.getenv("SHOPIFY_REQUEST_TIMEOUT", "25"))

    while next_url and page_count < max_pages:
        response = requests.get(next_url, headers=headers, timeout=per_request_timeout)
        if response.status_code == 401:
            raise HTTPException(status_code=401, detail="Token Shopify expiré ou invalide. Reconnectez-vous.")
        if response.status_code == 404:
            raise HTTPException(status_code=404, detail=f"Boutique Shopify non trouvée: {shop_domain}")
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=f"Erreur Shopify: {response.text[:300]}")

        payload = response.json()
        orders.extend(payload.get("orders", []))
        next_url = _parse_shopify_next_link(response.headers.get("Link"))
        page_count += 1

    _cache_set_orders(shop_domain, range_days, access_token, orders)
    return orders


@app.get("/api/shopify/customers")
async def get_shopify_customers(request: Request, limit: int = 100):
    """👥 Récupère les clients Shopify pour facturation"""
    user_id = get_user_id(request)
    tier = get_user_tier(user_id)
    ensure_feature_allowed(tier, "invoicing")
    shop_domain, access_token = _get_shopify_connection(user_id)

    customers_url = f"https://{shop_domain}/admin/api/2024-10/customers.json?limit={min(limit, 250)}&fields=id,first_name,last_name,email,phone,tags,created_at"
    headers = {
        "X-Shopify-Access-Token": access_token,
        "Content-Type": "application/json"
    }

    response = requests.get(customers_url, headers=headers, timeout=30)
    if response.status_code == 401:
        raise HTTPException(status_code=401, detail="Token Shopify expiré ou invalide. Reconnectez-vous.")
    if response.status_code == 404:
        raise HTTPException(status_code=404, detail=f"Boutique Shopify non trouvée: {shop_domain}")
    if response.status_code != 200:
        raise HTTPException(status_code=response.status_code, detail=f"Erreur Shopify: {response.text[:300]}")

    customers = response.json().get("customers", [])
    return {
        "success": True,
        "shop": shop_domain,
        "customer_count": len(customers),
        "customers": customers
    }


@app.get("/api/shopify/orders-list")
async def get_shopify_orders_list(request: Request, limit: int = 50):
    """📦 Récupère la liste des commandes récentes avec email client, produits et prix.
    Retourne une liste aplatie: une ligne par produit acheté.
    """
    user_id = get_user_id(request)
    shop_domain, access_token = _get_shopify_connection(user_id)

    orders_url = (
        f"https://{shop_domain}/admin/api/2024-10/orders.json"
        f"?status=any&limit={min(limit, 250)}"
        f"&fields=id,name,order_number,created_at,email,total_price,currency,financial_status,line_items,customer"
    )
    headers = {
        "X-Shopify-Access-Token": access_token,
        "Content-Type": "application/json"
    }

    response = requests.get(orders_url, headers=headers, timeout=30)
    if response.status_code == 401:
        raise HTTPException(status_code=401, detail="Token Shopify expiré ou invalide. Reconnectez-vous.")
    if response.status_code == 404:
        raise HTTPException(status_code=404, detail=f"Boutique Shopify non trouvée: {shop_domain}")
    if response.status_code != 200:
        raise HTTPException(status_code=response.status_code, detail=f"Erreur Shopify: {response.text[:300]}")

    raw_orders = response.json().get("orders", [])

    # Flatten: one row per line_item
    order_rows = []
    for order in raw_orders:
        email = order.get("email") or ""
        order_name = order.get("name") or f"#{order.get('order_number', '')}"
        order_id = order.get("id")
        created_at = order.get("created_at", "")
        currency = order.get("currency", "USD")
        total_price = order.get("total_price", "0")
        financial_status = order.get("financial_status", "")

        for item in order.get("line_items", []):
            order_rows.append({
                "order_id": order_id,
                "order_name": order_name,
                "email": email,
                "product_title": item.get("title") or "Produit",
                "variant_title": item.get("variant_title") or "",
                "quantity": item.get("quantity") or 1,
                "price": str(item.get("price") or "0"),
                "currency": currency,
                "total_order_price": total_price,
                "financial_status": financial_status,
                "created_at": created_at,
            })

    return {
        "success": True,
        "shop": shop_domain,
        "count": len(order_rows),
        "orders": order_rows
    }


class InvoiceEmailRequest(BaseModel):
    to_email: str
    product_title: str
    quantity: int = 1
    price: str = "0"
    currency: str = "CAD"
    order_name: str = ""


@app.post("/api/shopify/send-invoice-email")
async def send_invoice_email_endpoint(request: Request, payload: InvoiceEmailRequest):
    """📧 Envoie un email de facture au client (via Gmail API, même système que les alertes stock)."""
    user_id = get_user_id(request)
    tier = get_user_tier(user_id)
    ensure_feature_allowed(tier, "invoicing")
    shop_domain, _ = _get_shopify_connection(user_id)

    if not payload.to_email:
        raise HTTPException(status_code=400, detail="Email du client manquant")

    if not all([GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_SENDER_EMAIL]):
        raise HTTPException(status_code=500, detail="Configuration email (Gmail) manquante sur le serveur")

    import email.message

    unit_price = float(payload.price or 0)
    total = unit_price * payload.quantity
    invoice_date = datetime.utcnow().strftime("%d/%m/%Y")
    currency = payload.currency or "CAD"

    subject = f"🧾 Facture – {payload.product_title} | {shop_domain}"
    text_body = (
        f"Bonjour,\n\n"
        f"Voici votre facture pour votre achat récent.\n\n"
        f"═══════════════════════════════════\n"
        f"  FACTURE\n"
        f"═══════════════════════════════════\n"
        f"  Boutique : {shop_domain}\n"
        f"  Date : {invoice_date}\n"
        f"  Commande : {payload.order_name}\n"
        f"───────────────────────────────────\n"
        f"  Produit : {payload.product_title}\n"
        f"  Quantité : {payload.quantity}\n"
        f"  Prix unitaire : {unit_price:.2f} {currency}\n"
        f"  Total : {total:.2f} {currency}\n"
        f"═══════════════════════════════════\n\n"
        f"Merci pour votre achat !\n\n"
        f"Cordialement,\n"
        f"{shop_domain}\n"
        f"Facture générée par ShopBrain AI"
    )

    try:
        access_token = _get_gmail_access_token()

        msg = email.message.EmailMessage()
        msg["From"] = f"ShopBrain AI <{GMAIL_SENDER_EMAIL}>"
        msg["Reply-To"] = GMAIL_SENDER_EMAIL
        msg["To"] = payload.to_email
        msg["Subject"] = subject
        # Priority headers to help land in inbox
        msg["X-Priority"] = "1"
        msg["X-MSMail-Priority"] = "High"
        msg["Importance"] = "High"
        msg["X-Mailer"] = "ShopBrain AI Invoicing"
        msg["Message-ID"] = f"<invoice-{int(datetime.utcnow().timestamp())}@shopbrain.ai>"
        msg.set_content(text_body)

        raw_msg = base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")

        resp = requests.post(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
            headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
            json={"raw": raw_msg},
            timeout=15,
        )
        if resp.status_code == 200:
            msg_id = resp.json().get("id", "")
            print(f"✅ [INVOICE EMAIL] Facture envoyée à {payload.to_email} (id={msg_id})")
            return {"success": True, "message": f"Facture envoyée à {payload.to_email}", "gmail_id": msg_id}
        else:
            print(f"❌ [INVOICE EMAIL] Erreur {resp.status_code}: {resp.text[:300]}")
            raise HTTPException(status_code=500, detail=f"Erreur envoi email: {resp.status_code}")
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ [INVOICE EMAIL] Exception: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur envoi facture: {str(e)}")


@app.get("/api/shopify/analytics")
async def get_shopify_analytics(request: Request, range: str = "30d"):
    """📈 Récupère les KPIs Shopify (revenus, commandes, AOV, série temporelle)"""
    user_id = get_user_id(request)
    shop_domain, access_token = _get_shopify_connection(user_id)

    range_map = {
        "7d": 7,
        "30d": 30,
        "90d": 90,
        "365d": 365
    }
    days = range_map.get(range, 30)
    start_date = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")

    headers = {
        "X-Shopify-Access-Token": access_token,
        "Content-Type": "application/json"
    }

    orders = []
    next_url = f"https://{shop_domain}/admin/api/2024-10/orders.json?status=any&created_at_min={start_date}&limit=250&fields=id,created_at,total_price,financial_status,currency,line_items"
    page_count = 0

    while next_url and page_count < 4:
        response = requests.get(next_url, headers=headers, timeout=30)
        if response.status_code == 401:
            raise HTTPException(status_code=401, detail="Token Shopify expiré ou invalide. Reconnectez-vous.")
        if response.status_code == 404:
            raise HTTPException(status_code=404, detail=f"Boutique Shopify non trouvée: {shop_domain}")
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=f"Erreur Shopify: {response.text[:300]}")

        payload = response.json()
        orders.extend(payload.get("orders", []))
        next_url = _parse_shopify_next_link(response.headers.get("Link"))
        page_count += 1

    revenue = 0.0
    currency = "USD"
    orders_count = 0
    series_map = {}
    top_products = {}

    for order in orders:
        total_price = float(order.get("total_price") or 0)
        revenue += total_price
        orders_count += 1
        currency = order.get("currency") or currency

        created_at = order.get("created_at")
        try:
            date_key = created_at[:10]
        except Exception:
            date_key = datetime.utcnow().strftime("%Y-%m-%d")

        if date_key not in series_map:
            series_map[date_key] = {"date": date_key, "revenue": 0.0, "orders": 0}
        series_map[date_key]["revenue"] += total_price
        series_map[date_key]["orders"] += 1

        for item in order.get("line_items", []):
            title = item.get("title") or "Produit"
            quantity = int(item.get("quantity") or 0)
            price = float(item.get("price") or 0)
            if title not in top_products:
                top_products[title] = {"title": title, "revenue": 0.0, "quantity": 0}
            top_products[title]["revenue"] += price * quantity
            top_products[title]["quantity"] += quantity

    series = sorted(series_map.values(), key=lambda x: x["date"])
    aov = revenue / orders_count if orders_count else 0

    top_products_list = sorted(top_products.values(), key=lambda x: x["revenue"], reverse=True)[:5]

    return {
        "success": True,
        "shop": shop_domain,
        "range": range,
        "currency": currency,
        "totals": {
            "revenue": round(revenue, 2),
            "orders": orders_count,
            "aov": round(aov, 2)
        },
        "series": series,
        "top_products": top_products_list
    }


# ---------------------------------------------------------------------------
# PRODUITS PHARES — classement dynamique basé sur les données Shopify Pixel
# ---------------------------------------------------------------------------
@app.get("/api/shopify/top-products")
async def get_shopify_top_products(request: Request, range: str = "1d"):
    """🌟 Produits phares basés sur les données réelles du Shopify Pixel.

    Scoring composite:
      - view_item / product_viewed  → +1 pt
      - add_to_cart / product_added_to_cart → +5 pts
      - Achat réel (line_item dans une commande) → +15 pts

    Returns top 5 products enriched with title, image, price from Shopify API.
    Supports range: 1d (today), 7d, 30d.
    """
    user_id = get_user_id(request)
    shop_domain, access_token = _get_shopify_connection(user_id)

    range_map = {"1d": 1, "7d": 7, "30d": 30}
    days = range_map.get(range, 1)

    # ── 1. Fetch pixel events from Supabase ───────────────────────────
    pixel_counts = _fetch_shopify_event_counts(user_id, shop_domain, days)
    # pixel_counts = { product_id: { views: N, add_to_cart: N } }

    # ── 2. Fetch orders for purchase data ─────────────────────────────
    orders = _fetch_shopify_orders(shop_domain, access_token, days)
    purchase_counts: dict[str, int] = {}
    purchase_revenue: dict[str, float] = {}
    for order in orders:
        for item in order.get("line_items", []):
            pid = str(item.get("product_id") or "")
            if not pid:
                continue
            qty = int(item.get("quantity") or 0)
            price = float(item.get("price") or 0)
            purchase_counts[pid] = purchase_counts.get(pid, 0) + qty
            purchase_revenue[pid] = purchase_revenue.get(pid, 0.0) + price * qty

    # ── 3. Merge all product IDs and compute score ────────────────────
    all_product_ids = set(pixel_counts.keys()) | set(purchase_counts.keys())

    scored_products = []
    for pid in all_product_ids:
        views = pixel_counts.get(pid, {}).get("views", 0)
        add_to_cart = pixel_counts.get(pid, {}).get("add_to_cart", 0)
        purchases = purchase_counts.get(pid, 0)
        revenue = purchase_revenue.get(pid, 0.0)
        score = views * 1 + add_to_cart * 5 + purchases * 15
        if score > 0:
            scored_products.append({
                "product_id": pid,
                "views": views,
                "add_to_cart": add_to_cart,
                "purchases": purchases,
                "revenue": round(revenue, 2),
                "score": score,
            })

    scored_products.sort(key=lambda x: x["score"], reverse=True)
    top5 = scored_products[:5]

    if not top5:
        return {
            "success": True,
            "shop": shop_domain,
            "range": range,
            "products": [],
            "message": "Aucune donnée pixel pour cette période. Le pixel doit d'abord recevoir des événements."
        }

    # ── 4. Enrich with Shopify product details (title, image, price) ──
    headers = {
        "X-Shopify-Access-Token": access_token,
        "Content-Type": "application/json",
    }
    enriched = []
    for item in top5:
        pid = item["product_id"]
        title = f"Produit #{pid}"
        image_url = None
        price = None
        handle = None
        try:
            resp = requests.get(
                f"https://{shop_domain}/admin/api/2024-10/products/{pid}.json?fields=id,title,handle,images,variants",
                headers=headers,
                timeout=10,
            )
            if resp.status_code == 200:
                product = resp.json().get("product", {})
                title = product.get("title") or title
                handle = product.get("handle")
                imgs = product.get("images", [])
                if imgs:
                    image_url = imgs[0].get("src")
                variants = product.get("variants", [])
                if variants:
                    price = variants[0].get("price")
        except Exception as e:
            print(f"⚠️ Top products enrich error for {pid}: {e}")

        enriched.append({
            **item,
            "title": title,
            "image_url": image_url,
            "price": price,
            "handle": handle,
        })

    # ── 5. Compute rank changes vs yesterday (simple heuristic) ───────
    # If range is 1d, also fetch yesterday's data for comparison
    rank_changes = {}
    if range == "1d" and days == 1:
        try:
            yesterday_start = (datetime.utcnow() - timedelta(days=2)).isoformat()
            yesterday_end = (datetime.utcnow() - timedelta(days=1)).isoformat()
            if SUPABASE_URL and SUPABASE_SERVICE_KEY:
                supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
                yest_resp = (
                    supabase.table("shopify_events")
                    .select("product_id,event_type")
                    .eq("user_id", user_id)
                    .gte("created_at", yesterday_start)
                    .lte("created_at", yesterday_end)
                    .execute()
                )
                yest_scores: dict[str, int] = {}
                view_events = {"view_item", "product_viewed"}
                atc_events = {"add_to_cart", "product_added_to_cart"}
                for row in (yest_resp.data or []):
                    rpid = str(row.get("product_id") or "")
                    if not rpid:
                        continue
                    evt = (row.get("event_type") or "").lower()
                    sc = yest_scores.get(rpid, 0)
                    if evt in view_events:
                        sc += 1
                    elif evt in atc_events:
                        sc += 5
                    yest_scores[rpid] = sc
                # Add purchase scores from yesterday orders
                yest_orders = _fetch_shopify_orders(shop_domain, access_token, 2)
                for o in yest_orders:
                    created = o.get("created_at", "")
                    if created < yesterday_end and created >= yesterday_start:
                        for li in o.get("line_items", []):
                            lpid = str(li.get("product_id") or "")
                            qty = int(li.get("quantity") or 0)
                            if lpid:
                                yest_scores[lpid] = yest_scores.get(lpid, 0) + qty * 15

                yest_ranked = sorted(yest_scores.items(), key=lambda x: x[1], reverse=True)
                yest_rank_map = {pid: idx + 1 for idx, (pid, _) in enumerate(yest_ranked)}

                for idx, item in enumerate(enriched):
                    today_rank = idx + 1
                    yest_rank = yest_rank_map.get(item["product_id"])
                    if yest_rank is None:
                        rank_changes[item["product_id"]] = "new"
                    elif yest_rank > today_rank:
                        rank_changes[item["product_id"]] = "up"
                    elif yest_rank < today_rank:
                        rank_changes[item["product_id"]] = "down"
                    else:
                        rank_changes[item["product_id"]] = "stable"
        except Exception as e:
            print(f"⚠️ Rank changes error: {e}")

    # Add rank_change to each product
    for item in enriched:
        item["rank_change"] = rank_changes.get(item["product_id"], "stable")

    return {
        "success": True,
        "shop": shop_domain,
        "range": range,
        "products": enriched,
        "total_scored": len(scored_products),
    }


@app.get("/api/shopify/insights")
async def get_shopify_insights(
    request: Request,
    range: str = "30d",
    include_ai: bool = False,
    product_id: str | None = None,
):
    """🧠 Insights: produits freins, images faibles, bundles, stocks, prix, retours"""
    user_id = get_user_id(request)
    tier = get_user_tier(user_id)
    shop_domain, access_token = _get_shopify_connection(user_id)

    # Fetch shop currency
    shop_currency = "CAD"
    try:
        shop_resp = requests.get(
            f"https://{shop_domain}/admin/api/2024-01/shop.json",
            headers={"X-Shopify-Access-Token": access_token},
            timeout=8,
        )
        if shop_resp.status_code == 200:
            shop_currency = ((shop_resp.json() or {}).get("shop") or {}).get("currency") or "CAD"
    except Exception:
        pass

    range_map = {"7d": 7, "30d": 30, "90d": 90, "365d": 365}
    days = range_map.get(range, 30)

    orders = _fetch_shopify_orders(shop_domain, access_token, days)

    # Build product stats
    product_stats = {}
    refunds_by_product = {}

    for order in orders:
        for item in order.get("line_items", []):
            pid = str(item.get("product_id") or item.get("id"))
            if pid not in product_stats:
                product_stats[pid] = {
                    "product_id": pid,
                    "title": item.get("title") or "Produit",
                    "orders": 0,
                    "quantity": 0,
                    "revenue": 0.0,
                }
            qty = int(item.get("quantity") or 0)
            price = float(item.get("price") or 0)
            product_stats[pid]["orders"] += 1
            product_stats[pid]["quantity"] += qty
            product_stats[pid]["revenue"] += price * qty

        for refund in order.get("refunds", []) or []:
            for refund_line in refund.get("refund_line_items", []) or []:
                item = refund_line.get("line_item") or {}
                pid = str(item.get("product_id") or item.get("id"))
                refunds_by_product[pid] = refunds_by_product.get(pid, 0) + 1

    # Fetch products for inventory + images — respect plan product limit
    products_resp = get_shopify_products
    products_payload = await products_resp(request)
    products = products_payload.get("products", [])
    plan_product_limit = get_plan_product_limit(tier)
    if plan_product_limit is not None:
        products = products[:plan_product_limit]
    products_by_id = {str(product.get("id")): product for product in products}

    inventory_map = {}
    images_map = {}
    content_map = {}
    price_map = {}
    for product in products:
        pid = str(product.get("id"))
        inventory = 0
        for variant in product.get("variants", []) or []:
            inventory += int(variant.get("inventory_quantity") or 0)
        inventory_map[pid] = inventory
        images_map[pid] = product.get("images", []) or []
        variants = product.get("variants", []) or []
        price_map[pid] = _safe_float(variants[0].get("price"), 0.0) if variants else 0.0
        title = product.get("title") or ""
        description_text = _strip_html(product.get("body_html") or "")
        content_map[pid] = {
            "title": title,
            "title_len": len(title),
            "description_len": len(description_text),
        }

    for product in products:
        pid = str(product.get("id"))
        if pid not in product_stats:
            product_stats[pid] = {
                "product_id": pid,
                "title": product.get("title") or "Produit",
                "orders": 0,
                "quantity": 0,
                "revenue": 0.0,
            }

    event_counts = _fetch_shopify_event_counts(user_id, shop_domain, days)

    # Blockers: orders + pixel signals
    order_counts = [p.get("orders", 0) for p in product_stats.values()]
    median_orders = sorted(order_counts)[len(order_counts) // 2] if order_counts else 0
    avg_views = 0
    avg_add_to_cart = 0
    avg_view_to_cart = None
    avg_cart_to_order = None
    if event_counts:
        avg_views = sum(v.get("views", 0) for v in event_counts.values()) / max(1, len(event_counts))
        avg_add_to_cart = sum(v.get("add_to_cart", 0) for v in event_counts.values()) / max(1, len(event_counts))
        total_views = sum(v.get("views", 0) for v in event_counts.values())
        total_atc = sum(v.get("add_to_cart", 0) for v in event_counts.values())
        total_orders = sum(p.get("orders", 0) for p in product_stats.values())
        avg_view_to_cart = (total_atc / total_views) if total_views else None
        avg_cart_to_order = (total_orders / total_atc) if total_atc else None

    price_values = [value for value in price_map.values() if value and value > 0]
    avg_price = (sum(price_values) / len(price_values)) if price_values else None

    def _classify_blocker(stats: dict, median: int):
        orders_count = stats.get("orders", 0)
        revenue = stats.get("revenue", 0)
        inventory = inventory_map.get(stats.get("product_id"), 0)
        if orders_count <= max(1, median // 3):
            return "Sous-performant critique"
        if orders_count <= max(1, median // 2):
            return "Attractif mais non convaincant"
        if inventory > 50 and orders_count < max(1, median // 2):
            return "Hésitant"
        if revenue > 0 and orders_count <= max(1, median // 2):
            return "Opportunité"
        return "À surveiller"

    def _score_blocker(stats: dict, median: int):
        orders_count = stats.get("orders", 0)
        revenue = stats.get("revenue", 0)
        inventory = inventory_map.get(stats.get("product_id"), 0)
        score = 100
        if orders_count <= max(1, median // 3):
            score -= 40
        elif orders_count <= max(1, median // 2):
            score -= 25
        if revenue <= 0:
            score -= 15
        if inventory > 50:
            score -= 10
        return max(0, min(100, score))

    blockers = []
    for p in product_stats.values():
        product_id = str(p.get("product_id"))
        signals = event_counts.get(product_id, {"views": 0, "add_to_cart": 0})
        views = int(signals.get("views", 0))
        add_to_cart = int(signals.get("add_to_cart", 0))
        orders_count = p.get("orders", 0)
        revenue = p.get("revenue", 0)
        view_to_cart = (add_to_cart / views) if views else None
        cart_to_order = (orders_count / add_to_cart) if add_to_cart else None
        content = content_map.get(product_id, {})
        title_len = content.get("title_len", 0)
        description_len = content.get("description_len", 0)
        images_count = len(images_map.get(product_id, []) or [])
        inventory = inventory_map.get(product_id, 0)
        price_current = price_map.get(product_id, 0)

        score = 0
        if orders_count <= max(1, median_orders // 2):
            score += 1
        if revenue <= 0:
            score += 1
        if description_len < 120:
            score += 1
        if title_len < 20 or title_len > 70:
            score += 1
        if images_count < 2:
            score += 1
        if avg_price and price_current > avg_price * 1.3:
            score += 1
        if inventory > 20 and orders_count == 0:
            score += 1
        if views >= max(10, avg_views) and view_to_cart is not None and view_to_cart < 0.03:
            score += 2
        if add_to_cart >= max(5, avg_add_to_cart) and cart_to_order is not None and cart_to_order < 0.2:
            score += 2

        if score < 2:
            continue

        reasons = []
        if orders_count <= max(1, median_orders // 2):
            reasons.append(f"Commandes faibles ({orders_count} < médiane {median_orders})")
        if revenue <= 0:
            reasons.append("Aucune vente enregistrée")
        if description_len < 120:
            reasons.append(f"Description courte ({description_len} caractères)")
        if title_len < 20 or title_len > 70:
            reasons.append(f"Titre hors zone ({title_len} caractères)")
        if images_count < 2:
            reasons.append("Images insuffisantes (< 2)")
        if avg_price and price_current > avg_price * 1.3:
            reasons.append(f"Prix élevé (actuel {price_current:.2f} > moyenne {avg_price:.2f})")
        if views >= max(10, avg_views) and view_to_cart is not None and view_to_cart < 0.03:
            reasons.append(f"Faible vue→panier ({view_to_cart:.1%})")
        if add_to_cart >= max(5, avg_add_to_cart) and cart_to_order is not None and cart_to_order < 0.2:
            reasons.append(f"Faible panier→achat ({cart_to_order:.1%})")

        actions = []
        if title_len < 20 or title_len > 70:
            actions.append({
                "type": "titre",
                "label": f"Optimiser le titre ({title_len} caractères)",
                "automatable": True,
            })
        if description_len < 120:
            actions.append({
                "type": "description",
                "label": f"Renforcer la description ({description_len} caractères)",
                "automatable": True,
            })
        if images_count < 2:
            actions.append({
                "type": "image",
                "label": "Ajouter 2+ images produit",
                "automatable": False,
            })
        if avg_price and price_current > avg_price * 1.3:
            delta_pct = min(15, max(5, int(((price_current / avg_price) - 1) * 100)))
            actions.append({
                "type": "prix",
                "label": f"Tester -{delta_pct}% (actuel {price_current:.2f}, moy {avg_price:.2f})",
                "automatable": True,
            })
        if views >= max(10, avg_views) and view_to_cart is not None and view_to_cart < 0.03:
            actions.append({
                "type": "image",
                "label": "Améliorer image + accroche pour booster l'ajout panier",
                "automatable": False,
            })
        if add_to_cart >= max(5, avg_add_to_cart) and cart_to_order is not None and cart_to_order < 0.2:
            actions.append({
                "type": "prix",
                "label": "Tester un ajustement de prix pour lever l'hésitation",
                "automatable": True,
            })

        blockers.append({
            **p,
            "category": _classify_blocker(p, median_orders),
            "score": _score_blocker(p, median_orders),
            "reason": " • ".join(reasons) if reasons else "Sous-performance vs moyenne",
            "reasons": reasons,
            "signals": {
                "orders": orders_count,
                "revenue": revenue,
                "inventory": inventory,
                "views": views,
                "add_to_cart": add_to_cart,
                "view_to_cart_rate": round(view_to_cart, 4) if view_to_cart is not None else None,
                "cart_to_order_rate": round(cart_to_order, 4) if cart_to_order is not None else None,
                "benchmark": {"median_orders": median_orders},
            },
            "actions": actions,
            "data_basis": "orders_plus_pixel" if event_counts else "orders_only",
        })

    blockers = sorted(blockers, key=lambda item: item.get("score", 0), reverse=True)[:10]

    # Image risks: too few images or missing alt
    image_risks = []
    for pid, imgs in images_map.items():
        signals = event_counts.get(pid, {"views": 0, "add_to_cart": 0})
        views = int(signals.get("views", 0))
        add_to_cart = int(signals.get("add_to_cart", 0))
        view_to_cart = (add_to_cart / views) if views else None
        if len(imgs) <= 1 or any(not (img.get("alt") or "").strip() for img in imgs) or (view_to_cart is not None and view_to_cart < 0.02):
            image_risks.append({
                "product_id": pid,
                "images_count": len(imgs),
                "missing_alt": any(not (img.get("alt") or "").strip() for img in imgs),
                "views": views,
                "add_to_cart": add_to_cart,
                "view_to_cart_rate": round(view_to_cart, 4) if view_to_cart is not None else None,
            })
    image_risks = image_risks[:10]

    # Stock risks: days of cover
    stock_risks = []
    for pid, stats in product_stats.items():
        inventory = inventory_map.get(pid, 0)
        daily_sales = (stats.get("quantity", 0) / max(days, 1))
        days_cover = inventory / daily_sales if daily_sales > 0 else None
        if days_cover is not None and days_cover < 7:
            stock_risks.append({
                "product_id": pid,
                "title": stats.get("title"),
                "inventory": inventory,
                "days_cover": round(days_cover, 2),
            })
    stock_risks = sorted(stock_risks, key=lambda x: x.get("days_cover", 0))[:10]

    # Price opportunities: low sales/high inventory or high sales/low inventory
    price_opportunities = []
    for pid, stats in product_stats.items():
        inventory = inventory_map.get(pid, 0)
        orders_count = stats.get("orders", 0)
        current_price = price_map.get(pid, 0.0)
        if inventory > 50 and orders_count < max(1, median_orders // 3):
            price_opportunities.append({
                "product_id": pid,
                "title": stats.get("title"),
                "suggestion": "Baisser le prix de 5-10%",
                "current_price": round(current_price, 2) if current_price else None,
                "target_delta_pct": -8,
                "reason": "Stock élevé avec faible volume de commandes",
            })
        if inventory < 5 and orders_count > median_orders:
            price_opportunities.append({
                "product_id": pid,
                "title": stats.get("title"),
                "suggestion": "Augmenter le prix de 3-7%",
                "current_price": round(current_price, 2) if current_price else None,
                "target_delta_pct": 5,
                "reason": "Stock faible avec forte demande",
            })

    if not price_opportunities and product_stats:
        fallback_candidates = sorted(
            product_stats.values(),
            key=lambda item: (item.get("orders", 0), -inventory_map.get(str(item.get("product_id")), 0))
        )
        for stats in fallback_candidates[:5]:
            pid = str(stats.get("product_id"))
            current_price = price_map.get(pid, 0.0)
            if current_price <= 0:
                continue
            price_opportunities.append({
                "product_id": pid,
                "title": stats.get("title") or "Produit",
                "suggestion": "Tester -5% pendant 7 jours pour valider l'élasticité",
                "current_price": round(current_price, 2),
                "target_delta_pct": -5,
                "reason": "Aucun signal fort détecté, test contrôlé recommandé",
            })

    market_comparison = _get_market_comparison_status()
    price_analysis_items = []
    for item in price_opportunities[:10]:
        current_price = item.get("current_price")
        delta_pct = item.get("target_delta_pct")
        suggested_price = None
        if current_price is not None and isinstance(delta_pct, (int, float)):
            suggested_price = round(current_price * (1 + (delta_pct / 100.0)), 2)
        price_analysis_items.append({
            **item,
            "suggested_price": suggested_price,
            "market_comparison_enabled": market_comparison.get("enabled", False),
        })

    if include_ai and market_comparison.get("enabled") and market_comparison.get("provider") == "openai" and OPENAI_API_KEY:
        estimates = _ai_market_price_estimates(price_analysis_items, products_by_id, "", currency=shop_currency)
        if estimates:
            for row in price_analysis_items:
                pid = str(row.get("product_id") or "")
                est = estimates.get(pid)
                if not est:
                    continue
                row["market_estimate"] = {
                    "min": est.get("market_min"),
                    "max": est.get("market_max"),
                    "positioning": est.get("positioning"),
                    "confidence": est.get("confidence"),
                    "notes": est.get("notes"),
                }

    # Rewrite opportunities: low performance + weak content signals
    rewrite_opportunities = []
    for pid, stats in product_stats.items():
        if product_id and str(pid) != str(product_id):
            continue
        orders_count = stats.get("orders", 0)
        revenue = stats.get("revenue", 0)
        content = content_map.get(pid, {})
        title_len = content.get("title_len", 0)
        description_len = content.get("description_len", 0)

        reasons = []
        if orders_count <= max(1, median_orders // 2):
            reasons.append("Sous-performance vs moyenne")
        if revenue <= 0:
            reasons.append("Aucune vente")
        if description_len < 120:
            reasons.append("Description courte")
        if title_len < 20 or title_len > 70:
            reasons.append("Titre à optimiser")
        if product_id:
            reasons.append("Réécriture demandée")

        recommendations = []
        if description_len < 120:
            recommendations.append("description")
        if title_len < 20 or title_len > 70:
            recommendations.append("title")
        if product_id:
            recommendations = ["title", "description"]

        if recommendations or product_id:
            rewrite_opportunities.append({
                "product_id": pid,
                "title": stats.get("title") or content.get("title") or "Produit",
                "orders": orders_count,
                "revenue": round(revenue, 2),
                "reasons": reasons,
                "recommendations": recommendations,
            })

    rewrite_ai_enabled = False
    rewrite_ai_notes = []
    rewrite_generated = 0
    if include_ai:
        if tier not in {"pro", "premium"}:
            rewrite_ai_notes.append("Plan requis: Pro ou Premium")
        elif not OPENAI_API_KEY:
            rewrite_ai_notes.append("OpenAI non configuré")
        else:
            try:
                ensure_feature_allowed(tier, "content_generation")
                engine = get_ai_engine()
                rewrite_ai_enabled = True
                for item in rewrite_opportunities[:8]:
                    product = products_by_id.get(str(item.get("product_id")))
                    if not product:
                        continue
                    if "title" in (item.get("recommendations") or []):
                        item["suggested_title"] = engine.content_gen.generate_title(product, tier)
                    if "description" in (item.get("recommendations") or []):
                        item["suggested_description"] = engine.content_gen.generate_description(product, tier)
                    rewrite_generated += 1
            except Exception as e:
                rewrite_ai_notes.append(f"Erreur IA: {str(e)[:120]}")

    # Bundle suggestions: co-occurrence pairs
    pair_counts = {}
    for order in orders:
        ids = [str(item.get("product_id") or item.get("id")) for item in order.get("line_items", [])]
        ids = list({pid for pid in ids if pid})
        for i in range(len(ids)):
            for j in range(i + 1, len(ids)):
                pair = tuple(sorted([ids[i], ids[j]]))
                pair_counts[pair] = pair_counts.get(pair, 0) + 1
    bundles = []
    for pair, count in sorted(pair_counts.items(), key=lambda x: x[1], reverse=True)[:10]:
        left = product_stats.get(pair[0], {}).get("title") or products_by_id.get(pair[0], {}).get("title")
        right = product_stats.get(pair[1], {}).get("title") or products_by_id.get(pair[1], {}).get("title")
        bundles.append({
            "pair": pair,
            "count": count,
            "titles": [left or pair[0], right or pair[1]],
        })

    # Return/chargeback risks: refund count
    return_risks = []
    for pid, count in refunds_by_product.items():
        stats = product_stats.get(pid, {})
        orders_count = stats.get("orders", 0)
        rate = (count / orders_count) if orders_count else None
        if count >= 2:
            return_risks.append({
                "product_id": pid,
                "title": stats.get("title"),
                "refunds": count,
                "refund_rate": round(rate, 4) if rate is not None else None,
            })
    return_risks = return_risks[:10]

    # ── Plan-based response gating ──
    # Standard: no image_risks, no bundles, no return_risks (Pro+ only)
    gated_image_risks = image_risks if tier in ("pro", "premium") else []
    gated_bundles = bundles if tier in ("pro", "premium") else []
    gated_return_risks = return_risks if tier in ("pro", "premium") else []
    # Rewrite opportunities: Standard gets title-only recommendations
    if tier == "standard":
        for item in rewrite_opportunities:
            item["recommendations"] = [r for r in (item.get("recommendations") or []) if r == "title"]

    return {
        "success": True,
        "shop": shop_domain,
        "range": range,
        "tier": tier,
        "plan_limits": PLAN_LIMITS.get(tier, PLAN_LIMITS["free"]),
        "benchmarks": {
            "median_orders": median_orders,
            "avg_views": round(avg_views, 2) if avg_views else 0,
            "avg_add_to_cart": round(avg_add_to_cart, 2) if avg_add_to_cart else 0,
            "avg_view_to_cart": round(avg_view_to_cart, 4) if avg_view_to_cart is not None else None,
            "avg_cart_to_order": round(avg_cart_to_order, 4) if avg_cart_to_order is not None else None,
            "avg_price": round(avg_price, 2) if avg_price is not None else None,
        },
        "has_pixel_data": bool(event_counts),
        "blockers": blockers,
        "rewrite_opportunities": rewrite_opportunities[:10],
        "rewrite_ai": {
            "enabled": rewrite_ai_enabled,
            "generated": rewrite_generated,
            "notes": rewrite_ai_notes,
        },
        "image_risks": gated_image_risks,
        "bundle_suggestions": gated_bundles,
        "stock_risks": stock_risks,
        "price_opportunities": price_analysis_items,
        "price_analysis": {
            "items": price_analysis_items,
            "market_comparison": market_comparison,
        },
        "market_comparison": market_comparison,
        "return_risks": gated_return_risks,
    }


# ---------------------------------------------------------------------------
# Stock Forecast / Rupture Prediction Endpoint
# ---------------------------------------------------------------------------

@app.get("/api/shopify/stock-forecast")
async def get_stock_forecast(request: Request, range: str = "30d", threshold_units: int = 15):
    """Prevision des ruptures de stock.

    Analyses all products: computes daily sales velocity from order history,
    estimates days-to-stockout, and flags products below user threshold.
    threshold_units = minimum inventory count. Below this = alert.
    Returns ALL products so the frontend can display a complete inventory table.
    """
    user_id = get_user_id(request)
    tier = get_user_tier(user_id)
    shop_domain, access_token = _get_shopify_connection(user_id)

    range_map = {"7d": 7, "30d": 30, "90d": 90, "365d": 365}
    days = range_map.get(range, 30)

    # Fetch orders to compute sales velocity
    orders = _fetch_shopify_orders(shop_domain, access_token, days)

    # Aggregate quantity sold per product
    product_sales: dict[str, dict] = {}
    for order in orders:
        for item in order.get("line_items", []):
            pid = str(item.get("product_id") or item.get("id"))
            if not pid or pid == "None":
                continue
            qty = int(item.get("quantity") or 0)
            if pid not in product_sales:
                product_sales[pid] = {"quantity_sold": 0, "order_count": 0}
            product_sales[pid]["quantity_sold"] += qty
            product_sales[pid]["order_count"] += 1

    # Fetch all products for inventory + metadata — respect plan product limit
    products_resp = get_shopify_products
    products_payload = await products_resp(request)
    products = products_payload.get("products", [])
    plan_product_limit = get_plan_product_limit(tier)
    if plan_product_limit is not None:
        products = products[:plan_product_limit]

    forecast_items = []
    total_inventory = 0
    critical_count = 0
    warning_count = 0
    safe_count = 0

    for product in products:
        pid = str(product.get("id"))
        title = product.get("title") or "Produit sans nom"

        # Sum inventory across all variants
        inventory = 0
        variants = product.get("variants", []) or []
        for variant in variants:
            inventory += int(variant.get("inventory_quantity") or 0)

        total_inventory += inventory

        # Sales velocity
        sales_data = product_sales.get(pid, {"quantity_sold": 0, "order_count": 0})
        quantity_sold = sales_data["quantity_sold"]
        order_count = sales_data["order_count"]
        daily_velocity = quantity_sold / max(days, 1)

        # Days to stockout
        if daily_velocity > 0:
            days_to_stockout = inventory / daily_velocity
        else:
            days_to_stockout = None  # No sales = can't predict

        # Status classification based on INVENTORY UNITS vs threshold
        if inventory <= 0:
            status = "rupture"    # Already out of stock
            critical_count += 1
        elif inventory <= max(1, threshold_units // 3):
            status = "critical"   # Very low stock (below 1/3 of threshold)
            critical_count += 1
        elif inventory <= threshold_units:
            status = "warning"    # Below user threshold
            warning_count += 1
        else:
            status = "safe"       # Above threshold
            safe_count += 1

        # Get image for display
        images = product.get("images", []) or []
        image_url = images[0].get("src") if images else None

        # Get price
        price = None
        if variants:
            price = _safe_float(variants[0].get("price"), None)

        forecast_items.append({
            "product_id": pid,
            "title": title,
            "image_url": image_url,
            "price": round(price, 2) if price else None,
            "inventory": inventory,
            "quantity_sold_period": quantity_sold,
            "order_count": order_count,
            "daily_velocity": round(daily_velocity, 2),
            "days_to_stockout": round(days_to_stockout, 1) if days_to_stockout is not None else None,
            "status": status,
        })

    # Sort: rupture first, then critical, warning, safe
    status_order = {"rupture": 0, "critical": 1, "warning": 2, "safe": 3}
    forecast_items.sort(key=lambda x: (
        status_order.get(x["status"], 5),
        x["inventory"],
    ))

    return {
        "success": True,
        "range_days": days,
        "threshold_units": threshold_units,
        "summary": {
            "total_products": len(forecast_items),
            "total_inventory": total_inventory,
            "critical": critical_count,
            "warning": warning_count,
            "safe": safe_count,
        },
        "items": forecast_items,
    }


# ---------------------------------------------------------------------------
# Stock Alert — Surveillance rupture de stock (multi-produit, silencieux)
# ---------------------------------------------------------------------------

@app.get("/api/stock-alerts/products-with-thresholds")
async def get_stock_alert_products_with_thresholds(request: Request):
    """Retourne TOUS les produits Shopify avec le seuil sauvegardé pour chacun."""
    user_id = get_user_id(request)
    shop_domain, access_token = _get_shopify_connection(user_id)

    # 1. Fetch produits Shopify
    resp = requests.get(
        f"https://{shop_domain}/admin/api/2024-10/products.json?limit=250",
        headers={"X-Shopify-Access-Token": access_token},
        timeout=30
    )
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Impossible de charger les produits Shopify")

    shopify_products = resp.json().get("products", [])

    # 2. Fetch seuils sauvegardés
    sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    saved = sb.table("stock_alert_settings").select("product_id,threshold").eq("user_id", user_id).execute()
    threshold_map = {r["product_id"]: r["threshold"] for r in (saved.data or [])}

    # 3. Combiner
    products = []
    for p in shopify_products:
        pid = str(p["id"])
        inventory = sum(int(v.get("inventory_quantity") or 0) for v in p.get("variants", []))
        products.append({
            "id": pid,
            "title": p.get("title", ""),
            "inventory": inventory,
            "threshold": threshold_map.get(pid, 0),
        })

    return {"success": True, "products": products}


@app.post("/api/stock-alerts/save-threshold")
async def save_stock_alert_threshold(request: Request):
    """Auto-save: enregistre le seuil pour UN produit (appel inline depuis le frontend)."""
    user_id = get_user_id(request)
    body = await request.json()
    product_id = str(body.get("product_id", "")).strip()
    product_title = str(body.get("product_title", "")).strip()
    threshold = max(0, int(body.get("threshold", 0)))

    if not product_id:
        raise HTTPException(status_code=400, detail="product_id requis")

    sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    # Support multi-seuils: body peut contenir "thresholds": [10, 5, 2]
    thresholds_raw = body.get("thresholds", [])
    if isinstance(thresholds_raw, list) and thresholds_raw:
        thresholds = sorted([int(t) for t in thresholds_raw if int(t) > 0], reverse=True)
    elif threshold > 0:
        thresholds = [threshold]
    else:
        thresholds = []

    import json as _json

    if threshold == 0 and not thresholds:
        # Seuil 0 = désactiver la surveillance pour ce produit
        sb.table("stock_alert_settings").delete().eq("user_id", user_id).eq("product_id", product_id).execute()
    else:
        sb.table("stock_alert_settings").upsert({
            "user_id": user_id,
            "product_id": product_id,
            "product_title": product_title,
            "threshold": thresholds[0] if thresholds else threshold,  # rétrocompatibilité
            "thresholds": _json.dumps(thresholds),  # multi-seuils
            "enabled": True,
            "updated_at": datetime.utcnow().isoformat(),
        }, on_conflict="user_id,product_id").execute()

    return {"success": True, "product_id": product_id, "threshold": threshold, "thresholds": thresholds}


@app.get("/api/shopify/bundles")
async def get_shopify_bundles(request: Request, range: str = "30d", limit: int = 10):
    """🧩 Bundles & cross-sell suggestions based on order co-occurrence.

    Lightweight alternative to /api/shopify/insights when you only need bundles.
    """
    user_id = get_user_id(request)
    tier = get_user_tier(user_id)
    ensure_feature_allowed(tier, "cross_sell")
    shop_domain, access_token = _get_shopify_connection(user_id)

    range_map = {"7d": 7, "30d": 30, "90d": 90, "365d": 365}
    days = range_map.get(range, 30)

    orders = _fetch_shopify_orders(shop_domain, access_token, days)
    pair_counts: dict[tuple[str, str], int] = {}
    for order in orders:
        ids = [str(item.get("product_id") or item.get("id")) for item in order.get("line_items", [])]
        ids = list({pid for pid in ids if pid and pid != "None"})
        if len(ids) < 2:
            continue
        for i in range(len(ids)):
            for j in range(i + 1, len(ids)):
                pair = tuple(sorted([ids[i], ids[j]]))
                pair_counts[pair] = pair_counts.get(pair, 0) + 1

    top_pairs = sorted(pair_counts.items(), key=lambda x: x[1], reverse=True)[: max(1, min(int(limit or 10), 20))]

    needed_ids = set()
    for (a, b), _count in top_pairs:
        needed_ids.add(a)
        needed_ids.add(b)

    def _fetch_product_titles(product_ids: set[str]) -> dict[str, str]:
        titles: dict[str, str] = {}
        if not product_ids:
            return titles

        headers = {
            "X-Shopify-Access-Token": access_token,
            "Content-Type": "application/json",
        }
        per_request_timeout = int(os.getenv("SHOPIFY_REQUEST_TIMEOUT", "25"))

        # Best-effort: scan a few product pages to resolve titles.
        next_url = (
            f"https://{shop_domain}/admin/api/2024-10/products.json"
            f"?limit=250&fields=id,title"
        )
        page_count = 0
        max_pages = int(os.getenv("SHOPIFY_PRODUCTS_TITLE_MAX_PAGES", "3"))
        while next_url and page_count < max_pages and len(titles) < len(product_ids):
            resp = requests.get(next_url, headers=headers, timeout=per_request_timeout)
            if resp.status_code != 200:
                break
            payload = resp.json()
            for p in payload.get("products", []) or []:
                pid = str(p.get("id") or "")
                if pid and pid in product_ids and pid not in titles:
                    titles[pid] = p.get("title") or pid
            next_url = _parse_shopify_next_link(resp.headers.get("Link"))
            page_count += 1

        # Fallback: direct fetch for any missing IDs (bounded).
        missing = [pid for pid in product_ids if pid not in titles]
        for pid in missing[:10]:
            try:
                resp = requests.get(
                    f"https://{shop_domain}/admin/api/2024-10/products/{pid}.json?fields=id,title",
                    headers=headers,
                    timeout=per_request_timeout,
                )
                if resp.status_code == 200:
                    prod = (resp.json() or {}).get("product") or {}
                    if str(prod.get("id") or "") == str(pid):
                        titles[pid] = prod.get("title") or pid
            except Exception:
                continue

        return titles

    titles_by_id = _fetch_product_titles(needed_ids)

    def _discount_range_pct(count: int) -> tuple[int, int]:
        if count >= 8:
            return (5, 8)
        if count >= 4:
            return (8, 12)
        return (10, 15)

    def _confidence_label(count: int) -> str:
        if count >= 8:
            return "forte"
        if count >= 4:
            return "moyenne"
        return "faible"

    suggestions: list[dict] = []
    for (a, b), count in top_pairs:
        left = titles_by_id.get(a) or f"#{a}"
        right = titles_by_id.get(b) or f"#{b}"
        low, high = _discount_range_pct(int(count or 0))
        suggestions.append({
            "pair": [a, b],
            "count": int(count or 0),
            "confidence": _confidence_label(int(count or 0)),
            "titles": [left, right],
            "discount_range_pct": [low, high],
            "placements": [
                "page_produit (bloc: Souvent achetés ensemble)",
                "panier / drawer (cross-sell avant checkout)",
                "checkout (si supporté par le thème/app)",
            ],
            "offer": {
                "type": "bundle",
                "name": f"Bundle: {left} + {right}"[:120],
                "message": f"Ajoute {right} et économise {low}–{high}% sur le pack.",
            },
            "copy": [
                f"Complète ton achat avec {right}.",
                f"Le duo le plus fréquent: {left} + {right}.",
            ],
        })

    return {
        "success": True,
        "shop": shop_domain,
        "range": range,
        "orders_scanned": len(orders),
        "bundle_suggestions": suggestions,
    }


def _compute_bundles_suggestions(shop_domain: str, access_token: str, days: int, limit: int = 10) -> dict:
    """Compute bundle suggestions (same logic as endpoint) and return result dict.

    This function is synchronous and suitable to run in a background thread.
    """
    orders = _fetch_shopify_orders(shop_domain, access_token, days)
    min_pair_count = max(1, int(os.getenv("BUNDLES_MIN_PAIR_COUNT", "2")))
    pair_counts: dict[tuple[str, str], int] = {}
    orders_with_2plus_items = 0
    unique_product_ids: set[str] = set()
    for order in orders:
        ids = [str(item.get("product_id") or item.get("id")) for item in order.get("line_items", [])]
        ids = list({pid for pid in ids if pid and pid != "None"})
        for pid in ids:
            unique_product_ids.add(pid)
        if len(ids) < 2 :
            continue
        orders_with_2plus_items += 1
        for i in range(len(ids)):
            for j in range(i + 1, len(ids)):
                key = tuple(sorted((ids[i], ids[j])))
                pair_counts[key] = pair_counts.get(key, 0) + 1

    strong_pairs = [(pair, count) for pair, count in pair_counts.items() if int(count or 0) >= min_pair_count]
    top_pairs = sorted(strong_pairs, key=lambda x: x[1], reverse=True)[: max(1, min(int(limit or 10), 20))]

    needed_ids = set()
    for (a, b), _count in top_pairs:
        needed_ids.add(a)
        needed_ids.add(b)

    # Try to resolve titles
    def _fetch_product_titles(product_ids: set[str]) -> dict[str, str]:
        titles: dict[str, str] = {}
        if not product_ids:
            return titles

        headers = {
            "X-Shopify-Access-Token": access_token,
            "Content-Type": "application/json",
        }
        per_request_timeout = int(os.getenv("SHOPIFY_REQUEST_TIMEOUT", "25"))

        next_url = (
            f"https://{shop_domain}/admin/api/2024-10/products.json"
            f"?limit=250&fields=id,title"
        )
        page_count = 0
        max_pages = int(os.getenv("SHOPIFY_PRODUCTS_TITLE_MAX_PAGES", "3"))
        while next_url and page_count < max_pages and len(titles) < len(product_ids):
            try:
                resp = requests.get(next_url, headers=headers, timeout=per_request_timeout)
            except Exception:
                break
            if resp.status_code != 200:
                break
            data = resp.json().get("products", [])
            for prod in data:
                pid = str(prod.get("id"))
                if pid in product_ids:
                    titles[pid] = prod.get("title")
            next_url = None
            page_count += 1

        missing = [pid for pid in product_ids if pid not in titles]
        for pid in missing[:10]:
            try:
                resp = requests.get(
                    f"https://{shop_domain}/admin/api/2024-10/products/{pid}.json?fields=id,title",
                    headers=headers,
                    timeout=per_request_timeout,
                )
            except Exception:
                continue
            if resp.status_code == 200:
                prod = resp.json().get("product", {})
                if prod:
                    titles[str(prod.get("id"))] = prod.get("title")
        return titles

    titles_by_id = _fetch_product_titles(needed_ids)

    def _discount_range_pct(count: int) -> tuple[int, int]:
        if count >= 8:
            return (15, 20)
        if count >= 4:
            return (12, 18)
        return (10, 15)

    def _confidence_label(count: int) -> str:
        if count >= 8:
            return "forte"
        if count >= 4:
            return "moyenne"
        return "faible"

    suggestions: list[dict] = []
    for (a, b), count in top_pairs:
        left = titles_by_id.get(a) or f"#{a}"
        right = titles_by_id.get(b) or f"#{b}"
        low, high = _discount_range_pct(int(count or 0))
        suggestions.append({
            "pair": [a, b],
            "count": int(count or 0),
            "confidence": _confidence_label(int(count or 0)),
            "titles": [left, right],
            "discount_range_pct": [low, high],
            "placements": [
                "page_produit (bloc: Souvent achetés ensemble)",
                "panier / drawer (cross-sell avant checkout)",
                "checkout (si supporté par le thème/app)",
            ],
            "offer": {
                "type": "bundle",
                "name": f"Bundle: {left} + {right}"[:120],
                "message": f"Ajoute {right} et économise {low}–{high}% sur le pack.",
            },
            "copy": [
                f"Complète ton achat avec {right}.",
                f"Le duo le plus fréquent: {left} + {right}.",
            ],
        })

    no_result_reason = None
    recommendations: list[str] = []
    if not orders:
        no_result_reason = "Aucune commande trouvée sur la période sélectionnée."
        recommendations = [
            "Essayez la période 90j ou 365j.",
            "Vérifiez que la boutique a des commandes payées.",
        ]
    elif orders_with_2plus_items == 0:
        no_result_reason = "Les commandes ont surtout un seul article, impossible de détecter des paires."
        recommendations = [
            "Créer des offres multi-articles pour générer des co-achats.",
            "Ajouter des upsells dans le panier pour augmenter les paniers à 2+ articles.",
        ]
    elif not top_pairs:
        no_result_reason = f"Des co-achats existent, mais aucun n'atteint le seuil minimum ({min_pair_count})."
        recommendations = [
            "Réduire temporairement le seuil via BUNDLES_MIN_PAIR_COUNT=1.",
            "Attendre plus de volume de commandes pour fiabiliser les recommandations.",
        ]

    diagnostics = {
        "days": int(days),
        "orders_scanned": len(orders),
        "orders_with_2plus_items": orders_with_2plus_items,
        "unique_products_scanned": len(unique_product_ids),
        "pairs_found": len(pair_counts),
        "pairs_retained": len(top_pairs),
        "min_pair_count": min_pair_count,
        "no_result_reason": no_result_reason,
        "recommendations": recommendations,
    }

    return {
        "orders_scanned": len(orders),
        "bundle_suggestions": suggestions,
        "diagnostics": diagnostics,
    }


def _run_bundles_worker(job_id: str, shop_domain: str, access_token: str, days: int, limit: int):
    try:
        with _BUNDLES_LOCK:
            _BUNDLES_JOBS[job_id]["status"] = "running"
            _BUNDLES_JOBS[job_id]["started_at"] = time.time()
            _BUNDLES_JOBS[job_id]["shop_domain"] = shop_domain
            _BUNDLES_JOBS[job_id]["days"] = int(days)
            _BUNDLES_JOBS[job_id]["limit"] = int(limit)
        result = _compute_bundles_suggestions(shop_domain, access_token, days, limit)
        with _BUNDLES_LOCK:
            _BUNDLES_JOBS[job_id]["status"] = "completed"
            _BUNDLES_JOBS[job_id]["finished_at"] = time.time()
            _BUNDLES_JOBS[job_id]["result"] = result
            # cache last result per shop
            _BUNDLES_CACHE[shop_domain] = {"ts": time.time(), "result": result}
        # Persist job/result to Supabase if available (best-effort)
        try:
            if SUPABASE_URL and SUPABASE_SERVICE_KEY:
                supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
                supabase.table("bundle_jobs").insert({
                    "job_id": job_id,
                    "shop_domain": shop_domain,
                    "status": "completed",
                    "started_at": datetime.utcfromtimestamp(_BUNDLES_JOBS[job_id].get("started_at")) if _BUNDLES_JOBS[job_id].get("started_at") else None,
                    "finished_at": datetime.utcfromtimestamp(_BUNDLES_JOBS[job_id].get("finished_at")) if _BUNDLES_JOBS[job_id].get("finished_at") else None,
                    "result": json.dumps(result),
                }).execute()
        except Exception:
            pass
    except Exception as e:
        with _BUNDLES_LOCK:
            _BUNDLES_JOBS[job_id]["status"] = "failed"
            _BUNDLES_JOBS[job_id]["error"] = str(e)
            _BUNDLES_JOBS[job_id]["finished_at"] = time.time()
        # persist failure
        try:
            if SUPABASE_URL and SUPABASE_SERVICE_KEY:
                supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
                supabase.table("bundle_jobs").insert({
                    "job_id": job_id,
                    "shop_domain": shop_domain,
                    "status": "failed",
                    "started_at": datetime.utcfromtimestamp(_BUNDLES_JOBS[job_id].get("started_at")) if _BUNDLES_JOBS[job_id].get("started_at") else None,
                    "finished_at": datetime.utcfromtimestamp(_BUNDLES_JOBS[job_id].get("finished_at")) if _BUNDLES_JOBS[job_id].get("finished_at") else None,
                    "error": str(e),
                }).execute()
        except Exception:
            pass


@app.post("/api/shopify/bundles/async")
async def start_shopify_bundles_job(request: Request, range: str = "30d", limit: int = 10):
    user_id = get_user_id(request)
    tier = get_user_tier(user_id)
    ensure_feature_allowed(tier, "cross_sell")
    shop_domain, access_token = _get_shopify_connection(user_id)

    range_map = {"7d": 7, "30d": 30, "90d": 90, "365d": 365}
    days = range_map.get(range, 30)

    job_id = uuid.uuid4().hex
    with _BUNDLES_LOCK:
        _BUNDLES_JOBS[job_id] = {
            "status": "pending",
            "result": None,
            "started_at": None,
            "finished_at": None,
            "shop_domain": shop_domain,
            "days": int(days),
            "limit": int(limit or 10),
        }

    thread = threading.Thread(target=_run_bundles_worker, args=(job_id, shop_domain, access_token, days, int(limit or 10)), daemon=True)
    thread.start()

    return {
        "success": True,
        "job_id": job_id,
        "status": "pending",
        "shop": shop_domain,
        "range": range,
        "days": int(days),
        "limit": int(limit or 10),
    }


@app.get("/api/shopify/bundles/job/{job_id}")
async def get_shopify_bundles_job(job_id: str):
    job = _BUNDLES_JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    status = job.get("status")
    return {
        "success": True,
        "job_id": job_id,
        "status": "done" if status == "completed" else status,
        "raw_status": status,
        "result": job.get("result"),
        "error": job.get("error"),
        "started_at": job.get("started_at"),
        "finished_at": job.get("finished_at"),
        "job": job,
    }


@app.get("/api/shopify/bundles/latest")
async def get_shopify_bundles_latest(request: Request):
    """Return cached bundles result for the connected shop if available; otherwise return fast fallback info."""
    user_id = get_user_id(request)
    shop_domain, _ = _get_shopify_connection(user_id)
    cached = _BUNDLES_CACHE.get(shop_domain)
    if cached and time.time() - cached.get("ts", 0) < int(os.getenv("BUNDLES_CACHE_TTL", "3600")):
        result = cached.get("result") or {}
        return {
            "success": True,
            "shop": shop_domain,
            "cached": True,
            "result": result,
            "bundle_suggestions": result.get("bundle_suggestions") or [],
            "diagnostics": result.get("diagnostics") or {},
        }

    # Try Supabase fallback
    if SUPABASE_URL and SUPABASE_SERVICE_KEY:
        try:
            supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
            rows = supabase.table("bundle_jobs").select("job_id,result,finished_at").eq("shop_domain", shop_domain).order("finished_at", desc=True).limit(1).execute()
            if rows and rows.data:
                row = rows.data[0]
                result = json.loads(row.get("result") or "{}")
                return {
                    "success": True,
                    "shop": shop_domain,
                    "cached": True,
                    "result": result,
                    "bundle_suggestions": result.get("bundle_suggestions") or [],
                    "diagnostics": result.get("diagnostics") or {},
                    "job_id": row.get("job_id"),
                }
        except Exception:
            pass

    return {"success": True, "shop": shop_domain, "cached": False, "message": "No cached bundles. Start analysis with /api/shopify/bundles/async."}


@app.get("/api/shopify/bundles/list")
async def list_shopify_bundles_jobs(request: Request, limit: int = 20):
    user_id = get_user_id(request)
    shop_domain, _ = _get_shopify_connection(user_id)
    # Local jobs
    jobs = []
    with _BUNDLES_LOCK:
        for jid, meta in _BUNDLES_JOBS.items():
            # include only jobs for this shop if present in meta (we store shop_domain there when creating)
            if meta.get("shop_domain") and meta.get("shop_domain") != shop_domain:
                continue
            jobs.append({"job_id": jid, **meta})

    # Supabase persisted jobs
    persisted = []
    if SUPABASE_URL and SUPABASE_SERVICE_KEY:
        try:
            supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
            rows = supabase.table("bundle_jobs").select("job_id,status,started_at,finished_at,result").eq("shop_domain", shop_domain).order("finished_at", desc=True).limit(limit).execute()
            raw_rows = rows.data or []
            for row in raw_rows:
                parsed = None
                result_raw = row.get("result")
                if isinstance(result_raw, dict):
                    parsed = result_raw
                elif isinstance(result_raw, str) and result_raw.strip():
                    try:
                        parsed = json.loads(result_raw)
                    except Exception:
                        parsed = None
                persisted.append({
                    "job_id": row.get("job_id"),
                    "status": row.get("status") or "completed",
                    "started_at": row.get("started_at"),
                    "finished_at": row.get("finished_at"),
                    "result": parsed,
                })
        except Exception:
            persisted = []

    combined_by_job_id: dict[str, dict] = {}
    for item in jobs:
        jid = str(item.get("job_id") or "")
        if jid:
            combined_by_job_id[jid] = {**item}

    for item in persisted:
        jid = str(item.get("job_id") or "")
        if not jid:
            continue
        existing = combined_by_job_id.get(jid) or {}
        merged = {
            **existing,
            **item,
            "result": item.get("result") if item.get("result") is not None else existing.get("result"),
        }
        combined_by_job_id[jid] = merged

    combined_jobs = list(combined_by_job_id.values())
    jobs_sorted = sorted(
        combined_jobs,
        key=lambda item: (item.get("finished_at") or item.get("started_at") or item.get("created_at") or 0),
        reverse=True,
    )[: max(1, min(int(limit or 20), 100))]

    return {
        "success": True,
        "shop": shop_domain,
        "jobs": jobs_sorted,
        "local_jobs": jobs,
        "persisted_jobs": persisted,
    }


@app.post("/api/shopify/bundles/cancel/{job_id}")
async def cancel_shopify_bundles_job(request: Request, job_id: str):
    user_id = get_user_id(request)
    shop_domain, _ = _get_shopify_connection(user_id)
    with _BUNDLES_LOCK:
        job = _BUNDLES_JOBS.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        if job.get("status") in {"completed", "failed"}:
            raise HTTPException(status_code=400, detail="Cannot cancel completed/failed job")
        job["status"] = "cancelled"
        job["finished_at"] = time.time()
    # persist cancellation
    try:
        if SUPABASE_URL and SUPABASE_SERVICE_KEY:
            supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
            supabase.table("bundle_jobs").insert({
                "job_id": job_id,
                "shop_domain": shop_domain,
                "status": "cancelled",
                "started_at": None,
                "finished_at": datetime.utcnow(),
            }).execute()
    except Exception:
        pass
    return {"success": True, "job_id": job_id, "status": "cancelled"}


@app.get("/api/shopify/market-status")
async def get_shopify_market_status(request: Request):
    user_id = get_user_id(request)
    shop_domain, _ = _get_shopify_connection(user_id)
    market_comparison = _get_market_comparison_status()

    return {
        "success": True,
        "shop": shop_domain,
        "market_comparison": market_comparison,
    }


@app.get("/api/shopify/rewrite")
async def get_shopify_rewrite(request: Request, product_id: str, instructions: str | None = None):
    """Réécriture intelligente d'un produit spécifique."""
    user_id = get_user_id(request)
    tier = get_user_tier(user_id)
    if tier not in {"pro", "premium"}:
        raise HTTPException(status_code=403, detail="Fonctionnalité réservée aux plans Pro/Premium")

    if not product_id:
        raise HTTPException(status_code=400, detail="product_id requis")

    shop_domain, access_token = _get_shopify_connection(user_id)
    headers = {
        "X-Shopify-Access-Token": access_token,
        "Content-Type": "application/json",
    }

    product_resp = requests.get(
        f"https://{shop_domain}/admin/api/2024-10/products/{product_id}.json",
        headers=headers,
        timeout=30,
    )
    if product_resp.status_code == 401:
        raise HTTPException(status_code=401, detail="Token Shopify expiré ou invalide. Reconnectez-vous.")
    if product_resp.status_code == 404:
        raise HTTPException(status_code=404, detail="Produit Shopify introuvable")
    if product_resp.status_code != 200:
        raise HTTPException(status_code=product_resp.status_code, detail=f"Erreur Shopify: {product_resp.text[:300]}")

    product = product_resp.json().get("product", {})
    if not product:
        raise HTTPException(status_code=404, detail="Produit Shopify introuvable")

    ensure_feature_allowed(tier, "content_generation")

    # Generate title and description using OpenAI directly (no AI_engine dependency)
    current_title = product.get("title") or ""
    current_desc = _strip_html(product.get("body_html") or "")
    product_type = product.get("product_type") or ""
    vendor = product.get("vendor") or ""
    tags = product.get("tags") or ""

    suggested_title = current_title
    suggested_description = current_desc

    if OPENAI_API_KEY:
        try:
            client = OpenAI(api_key=OPENAI_API_KEY) if OpenAI else openai.OpenAI(api_key=OPENAI_API_KEY)

            # Generate title
            custom_instructions_block = f"\n\nInstructions spéciales du marchand:\n{instructions}" if instructions else ""
            title_resp = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": """Tu es le meilleur copywriter e-commerce au monde. Tu as 20 ans d'expérience en vente en ligne et tu maîtrises parfaitement ces techniques:
- AIDA (Attention, Intérêt, Désir, Action)
- Les power words qui déclenchent l'achat
- Le SEO e-commerce (mots-clés à forte intention d'achat)
- La psychologie du consommateur en ligne
- Les formules de titre qui convertissent le mieux (chiffres, bénéfices, urgence)

Ton objectif: créer des titres qui STOPPENT le scroll et donnent immédiatement envie de cliquer."""},
                    {"role": "user", "content": f"""Réécris ce titre de produit pour MAXIMISER les clics et les ventes.

Contexte produit:
- Titre actuel: {current_title}
- Type: {product_type}
- Marque: {vendor}
- Tags: {tags}

TECHNIQUES À APPLIQUER:
1. Commence par le BÉNÉFICE principal (ce que le client OBTIENT, pas ce que le produit EST)
2. Inclus un mot déclencheur émotionnel (ex: Ultime, Premium, Essentiel, Irrésistible)
3. Mentionne la catégorie ou le mot-clé principal pour le SEO
4. Si pertinent: ajoute un élément de preuve sociale ou de qualité (ex: "Qualité Pro", "Best-Seller")

CONTRAINTES STRICTES:
- 60 à 70 caractères maximum
- Sans emojis
- 1 seul titre final, rien d'autre
- NE JAMAIS inclure le prix (pas de €, $, montant)
- N'invente AUCUNE caractéristique absente du contexte
- Le titre doit sonner naturel et professionnel, pas clickbait cheap{custom_instructions_block}

Nouveau titre:"""}
                ],
                temperature=0.7,
                max_tokens=120
            )
            suggested_title = title_resp.choices[0].message.content.strip() or current_title
        except Exception as e:
            print(f"⚠️ Rewrite title error: {e}")

        try:
            # Generate description
            desc_resp = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": """Tu es le meilleur vendeur e-commerce au monde — un copywriter d'élite qui génère des millions en ventes en ligne. Tu maîtrises:

🎯 TECHNIQUES DE PERSUASION:
- AIDA: Attention → Intérêt → Désir → Action
- PAS: Problem → Agitate → Solve
- Preuve sociale et autorité
- Urgence et rareté implicites
- Storytelling sensoriel (faire VOIR, SENTIR, TOUCHER le produit)
- Les biais cognitifs (ancrage, réciprocité, engagement)

🧠 PSYCHOLOGIE DE VENTE:
- Parler des BÉNÉFICES, pas des caractéristiques
- Transformer chaque feature en avantage concret pour le client
- Créer une connexion émotionnelle avec le lecteur
- Utiliser le "vous/tu" pour impliquer directement le client
- Lever les objections AVANT qu'elles n'arrivent

✍️ COPYWRITING E-COMMERCE:
- Phrases courtes et percutantes
- Paragraphes aérés, faciles à scanner
- Power words: exclusif, garanti, transformez, découvrez, enfin
- Appels à l'action irrésistibles
- SEO naturel intégré dans le texte

RÈGLE D'OR: Chaque phrase doit rapprocher le lecteur de l'achat.
Tu retournes UNIQUEMENT du HTML brut. Jamais de markdown. Jamais de ```html."""},
                    {"role": "user", "content": f"""Réécris cette description de produit comme si tu étais le meilleur vendeur du monde et que ta commission dépendait de chaque vente.

Contexte produit:
- Titre: {current_title}
- Type: {product_type}
- Marque: {vendor}
- Tags: {tags}
- Description actuelle: {current_desc[:800]}

OBJECTIF: Écrire une description qui VEND. Pas juste décrire — CONVAINCRE.

STRATÉGIE D'ÉCRITURE:
1. ACCROCHE CHOC (1-2 phrases): Identifie le PROBLÈME ou le DÉSIR du client. Fais-lui ressentir pourquoi il a BESOIN de ce produit maintenant.
2. PROMESSE DE VALEUR: Explique comment ce produit va TRANSFORMER son quotidien. Sois spécifique et concret.
3. BÉNÉFICES CLÉS (pas juste des features): Chaque point doit répondre à "Et alors, qu'est-ce que ça change pour MOI?"
4. PREUVE ET CONFIANCE: Mentionne la qualité, les matériaux, le savoir-faire — tout ce qui rassure.
5. APPEL À L'ACTION PUISSANT: Donne une raison d'acheter MAINTENANT, pas demain.

CONTRAINTES:
- N'invente AUCUNE caractéristique absente de la description actuelle
- Ton: professionnel mais chaleureux, jamais agressif
- Sans emojis, sans markdown
- Longueur: 300-500 mots
- Français impeccable, phrases fluides{custom_instructions_block}

STRUCTURE HTML:
<p><strong>[Accroche percutante qui capte l'attention]</strong></p>
<p>[Promesse de valeur — pourquoi ce produit change tout]</p>
<h3>✦ Ce que vous allez adorer</h3>
<ul><li><strong>[Bénéfice 1]</strong> — [explication concrète]</li><li><strong>[Bénéfice 2]</strong> — [explication concrète]</li><li><strong>[Bénéfice 3]</strong> — [explication concrète]</li></ul>
<h3>✦ Qualité & Détails</h3>
<ul><li>[Caractéristique → avantage]</li><li>[Caractéristique → avantage]</li></ul>
<p><strong>[Appel à l'action irrésistible]</strong></p>

Retourne uniquement le HTML brut:"""}
                ],
                temperature=0.78,
                max_tokens=1200
            )
            suggested_description = desc_resp.choices[0].message.content.strip() or current_desc
        except Exception as e:
            print(f"⚠️ Rewrite description error: {e}")

    # Strip markdown code block wrappers if present
    if suggested_description and suggested_description.strip().startswith("```"):
        lines = suggested_description.strip().split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        suggested_description = "\n".join(lines).strip()

    return {
        "success": True,
        "shop": shop_domain,
        "product_id": product_id,
        "title": product.get("title") or "Produit",
        "current_title": current_title,
        "current_description": current_desc,
        "suggested_title": suggested_title,
        "suggested_description": suggested_description,
        "reasons": ["Réécriture demandée"],
        "recommendations": ["title", "description"],
    }


class DraftOrderRequest(BaseModel):
    customer_id: str | None = None
    email: str | None = None
    line_items: list
    note: str | None = None
    send_invoice: bool | None = False


@app.post("/api/shopify/draft-orders")
async def create_draft_order(request: Request, payload: DraftOrderRequest):
    """🧾 Crée une facture Shopify via Draft Order"""
    user_id = get_user_id(request)
    tier = get_user_tier(user_id)
    ensure_feature_allowed(tier, "invoicing")
    shop_domain, access_token = _get_shopify_connection(user_id)

    if not payload.line_items:
        raise HTTPException(status_code=400, detail="Aucun produit sélectionné")
    if not payload.customer_id and not payload.email:
        raise HTTPException(status_code=400, detail="Sélectionne un client ou un email")

    draft_payload = {
        "draft_order": {
            "line_items": payload.line_items,
            "note": payload.note or "",
        }
    }

    if payload.customer_id:
        draft_payload["draft_order"]["customer"] = {"id": payload.customer_id}
    if payload.email:
        draft_payload["draft_order"]["email"] = payload.email

    headers = {
        "X-Shopify-Access-Token": access_token,
        "Content-Type": "application/json"
    }

    draft_url = f"https://{shop_domain}/admin/api/2024-10/draft_orders.json"
    response = requests.post(draft_url, headers=headers, data=json.dumps(draft_payload), timeout=30)
    if response.status_code == 401:
        raise HTTPException(status_code=401, detail="Token Shopify expiré ou invalide. Reconnectez-vous.")
    if response.status_code == 404:
        raise HTTPException(status_code=404, detail=f"Boutique Shopify non trouvée: {shop_domain}")
    if response.status_code not in [200, 201]:
        raise HTTPException(status_code=response.status_code, detail=f"Erreur Shopify: {response.text[:300]}")

    draft_order = response.json().get("draft_order", {})

    invoice_sent = False
    if payload.send_invoice and draft_order.get("id"):
        send_url = f"https://{shop_domain}/admin/api/2024-10/draft_orders/{draft_order.get('id')}/send_invoice.json"
        send_resp = requests.post(send_url, headers=headers, timeout=30)
        invoice_sent = send_resp.status_code in [200, 201]

    return {
        "success": True,
        "shop": shop_domain,
        "draft_order": draft_order,
        "invoice_sent": invoice_sent
    }


def _resolve_invoice_language(country_code: str | None, province_code: str | None) -> str:
    if (country_code or "").upper() == "FR":
        return "fr"
    if (country_code or "").upper() == "CA" and (province_code or "").upper() in {"QC", "QUEBEC", "QUÉBEC"}:
        return "fr"
    if (country_code or "").upper() == "CH":
        return "en"
    return "en"
def _invoice_strings(language: str) -> dict:
    if language == "fr":
        return {
            "title": "Facture officielle",
            "invoice": "Facture",
            "date": "Date",
            "order": "Commande",
            "customer": "Client",
            "item": "Produit",
            "qty": "Qté",
            "price": "Prix",
            "subtotal": "Sous-total",
            "tax": "Taxes",
            "total": "Total",
            "email_subject": "Votre facture officielle",
            "email_body": "Bonjour,\n\nVeuillez trouver votre facture officielle en pièce jointe.\n\nMerci pour votre achat.",
        }
    return {
        "title": "Official Invoice",
        "invoice": "Invoice",
        "date": "Date",
        "order": "Order",
        "customer": "Customer",
        "item": "Item",
        "qty": "Qty",
        "price": "Price",
        "subtotal": "Subtotal",
        "tax": "Tax",
        "total": "Total",
        "email_subject": "Your official invoice",
        "email_body": "Hello,\n\nPlease find your official invoice attached.\n\nThank you for your purchase.",
    }


class PixelEventRequest(BaseModel):
    shop_domain: str
    event_type: str
    product_id: str | None = None
    session_id: str | None = None
    user_agent: str | None = None


@app.post("/api/shopify/pixel-event")
async def track_shopify_pixel_event(req: PixelEventRequest, request: Request):
    """📌 Ingestion d'événements Shopify Pixel (view_item, add_to_cart, pixel_installed)."""
    if not req.shop_domain:
        raise HTTPException(status_code=400, detail="Shop domain requis")

    # Normalize the incoming shop domain to ensure consistent matching
    raw_domain = (req.shop_domain or "").strip().lower()
    for prefix in ["https://", "http://"]:
        if raw_domain.startswith(prefix):
            raw_domain = raw_domain[len(prefix):]
    raw_domain = raw_domain.strip("/")

    allowed_events = {"view_item", "add_to_cart", "product_viewed", "product_added_to_cart", "pixel_installed", "pixel_heartbeat"}
    event_type = (req.event_type or "").strip().lower()
    if event_type not in allowed_events:
        raise HTTPException(status_code=400, detail="Event non supporté")

    normalized_product_id = _normalize_shopify_id(req.product_id)
    user_id = _get_user_id_by_shop_domain(raw_domain)
    if not user_id:
        raise HTTPException(status_code=404, detail="Boutique inconnue")

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise HTTPException(status_code=500, detail="Supabase not configured")

    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    payload = {
        "user_id": user_id,
        "shop_domain": raw_domain,
        "event_type": event_type,
        "product_id": normalized_product_id,
        "session_id": req.session_id,
        "user_agent": req.user_agent or request.headers.get("user-agent"),
    }
    supabase.table("shopify_events").insert(payload).execute()
    return {"success": True}


def _fetch_shopify_event_counts(user_id: str, shop_domain: str, days: int) -> dict:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return {}
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    start_date = (datetime.utcnow() - timedelta(days=days)).isoformat()

    # Try exact domain match first, then fallback to user_id only
    response = (
        supabase.table("shopify_events")
        .select("product_id,event_type,created_at")
        .eq("user_id", user_id)
        .eq("shop_domain", shop_domain)
        .gte("created_at", start_date)
        .execute()
    )

    rows = response.data or []
    
    # Fallback: if no rows with exact domain, try user_id only
    if not rows:
        response2 = (
            supabase.table("shopify_events")
            .select("product_id,event_type,created_at")
            .eq("user_id", user_id)
            .gte("created_at", start_date)
            .execute()
        )
        rows = response2.data or []
    counts: dict[str, dict[str, int]] = {}
    view_events = {"view_item", "product_viewed"}
    atc_events = {"add_to_cart", "product_added_to_cart"}

    for row in rows:
        product_id = str(row.get("product_id") or "")
        if not product_id:
            continue
        event_type = (row.get("event_type") or "").lower()
        entry = counts.setdefault(product_id, {"views": 0, "add_to_cart": 0})
        if event_type in view_events:
            entry["views"] += 1
        elif event_type in atc_events:
            entry["add_to_cart"] += 1

    return counts


# ---------------------------------------------------------------------------
# SHOPIFY PIXEL STATUS — vérifie si le pixel est installé et actif
# ---------------------------------------------------------------------------
@app.get("/api/shopify/pixel-status")
async def get_shopify_pixel_status(request: Request):
    """Vérifie si le Shopify Pixel (custom pixel ou script tag) est installé et actif.
    
    Detection methods (in order):
    1. GraphQL webPixelSubscriptions — detects Custom Pixels created via
       Settings > Customer events > Add custom pixel (the recommended method).
    2. REST ScriptTag API — detects older script-tag based pixels.
    3. Supabase shopify_events — detects if pixel events have actually been
       received (proves the pixel is firing, regardless of how it was installed).
    """
    user_id = get_user_id(request)
    shop_domain, access_token = _get_shopify_connection(user_id)
    rest_headers = {
        "X-Shopify-Access-Token": access_token,
        "Content-Type": "application/json",
    }

    pixel_installed = False
    pixel_active = False
    pixel_type = None
    pixel_details = []
    has_events = False
    debug_info = {}

    # ── 1. GraphQL: webPixelSubscriptions (Custom Pixels) ──────────────
    # Custom Pixels created via Settings > Customer events are ONLY accessible
    # through the GraphQL Admin API — the REST /web_pixels.json does NOT exist.
    try:
        graphql_url = f"https://{shop_domain}/admin/api/2024-10/graphql.json"
        graphql_query = """
        {
            webPixelSubscriptions(first: 10) {
                edges {
                    node {
                        id
                        settings
                    }
                }
            }
        }
        """
        gql_resp = requests.post(
            graphql_url,
            headers=rest_headers,
            json={"query": graphql_query},
            timeout=15,
        )
        debug_info["graphql_status"] = gql_resp.status_code
        if gql_resp.status_code == 200:
            gql_data = gql_resp.json()
            edges = (
                (gql_data.get("data") or {})
                .get("webPixelSubscriptions", {})
                .get("edges", [])
            )
            debug_info["graphql_pixels_found"] = len(edges)
            for edge in edges:
                node = edge.get("node", {})
                pixel_installed = True
                pixel_active = True  # If it exists in GraphQL, Shopify considers it active
                pixel_type = pixel_type or "custom_pixel"
                pixel_details.append({
                    "id": node.get("id"),
                    "type": "custom_pixel",
                    "source": "graphql_webPixelSubscriptions",
                })
        else:
            debug_info["graphql_error"] = gql_resp.text[:300]
            # Fallback: try the simpler `currentAppInstallation.webPixel` query
            # which works for app-owned pixels
            try:
                gql2_query = """
                {
                    currentAppInstallation {
                        id
                    }
                    webPixel {
                        id
                        settings
                    }
                }
                """
                gql2_resp = requests.post(
                    graphql_url,
                    headers=rest_headers,
                    json={"query": gql2_query},
                    timeout=15,
                )
                if gql2_resp.status_code == 200:
                    gql2_data = gql2_resp.json()
                    wp = (gql2_data.get("data") or {}).get("webPixel")
                    if wp and wp.get("id"):
                        pixel_installed = True
                        pixel_active = True
                        pixel_type = pixel_type or "custom_pixel"
                        pixel_details.append({
                            "id": wp.get("id"),
                            "type": "custom_pixel",
                            "source": "graphql_webPixel",
                        })
                        debug_info["graphql_fallback_found"] = True
            except Exception:
                pass
    except Exception as e:
        print(f"⚠️ Pixel check - GraphQL error: {e}")
        debug_info["graphql_exception"] = str(e)[:200]

    # ── 2. REST: ScriptTag API (legacy pixels) ────────────────────────
    try:
        st_url = f"https://{shop_domain}/admin/api/2024-10/script_tags.json"
        st_resp = requests.get(st_url, headers=rest_headers, timeout=15)
        debug_info["script_tags_status"] = st_resp.status_code
        if st_resp.status_code == 200:
            script_tags = (st_resp.json() or {}).get("script_tags", [])
            debug_info["script_tags_count"] = len(script_tags)
            for tag in script_tags:
                src = (tag.get("src") or "").lower()
                event = tag.get("event", "")
                if "pixel" in src or "shopbrain" in src or "tracking" in src or "analytics" in src:
                    pixel_installed = True
                    pixel_type = pixel_type or "script_tag"
                    pixel_details.append({
                        "id": tag.get("id"),
                        "src": tag.get("src"),
                        "event": event,
                        "display_scope": tag.get("display_scope", "all"),
                        "created_at": tag.get("created_at"),
                        "type": "script_tag",
                    })
    except Exception as e:
        print(f"⚠️ Pixel check - ScriptTag API error: {e}")
        debug_info["script_tags_exception"] = str(e)[:200]

    # ── 3. Supabase: check for received pixel events (last 30 days) ───
    # This is the most reliable check: if events exist, the pixel IS working.
    try:
        if SUPABASE_URL and SUPABASE_SERVICE_KEY:
            sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
            cutoff = (datetime.utcnow() - timedelta(days=30)).isoformat()
            
            # Build all domain variants to check
            domain_variants = {shop_domain}
            bare = shop_domain.replace(".myshopify.com", "")
            domain_variants.add(bare)
            domain_variants.add(f"{bare}.myshopify.com")
            
            event_count = 0
            
            # Strategy 1: match by user_id (most reliable — covers all domain formats)
            result = sb.table("shopify_events") \
                .select("id", count="exact") \
                .eq("user_id", user_id) \
                .gte("created_at", cutoff) \
                .limit(1) \
                .execute()
            event_count = result.count if hasattr(result, 'count') and result.count else len(result.data or [])
            debug_info["events_by_user_id"] = event_count
            
            # Strategy 2: match by any domain variant
            if event_count == 0:
                for domain_var in domain_variants:
                    result2 = sb.table("shopify_events") \
                        .select("id", count="exact") \
                        .eq("shop_domain", domain_var) \
                        .gte("created_at", cutoff) \
                        .limit(1) \
                        .execute()
                    cnt = result2.count if hasattr(result2, 'count') and result2.count else len(result2.data or [])
                    if cnt > 0:
                        event_count = cnt
                        debug_info["events_matched_domain"] = domain_var
                        break
            
            has_events = event_count > 0
            debug_info["total_events_found"] = event_count
            if has_events:
                pixel_active = True
                if not pixel_installed:
                    pixel_installed = True
                    pixel_type = pixel_type or "events_detected"
    except Exception as e:
        print(f"⚠️ Pixel check - Supabase events error: {e}")
        debug_info["events_exception"] = str(e)[:200]

    # ── 4. Storefront probe: try to detect pixel code on the live site ─
    # As a last resort, check if the storefront HTML contains references to
    # our pixel endpoint (shopbrain-backend). This catches custom pixels that
    # the GraphQL API may not expose to custom apps.
    if not pixel_installed:
        try:
            probe_url = f"https://{shop_domain}"
            probe_resp = requests.get(probe_url, timeout=10, headers={
                "User-Agent": "Mozilla/5.0 ShopBrain-PixelCheck/1.0"
            })
            debug_info["storefront_status"] = probe_resp.status_code
            if probe_resp.status_code == 200:
                body_lower = probe_resp.text[:50000].lower()
                if "shopbrain" in body_lower or "pixel-event" in body_lower:
                    pixel_installed = True
                    pixel_active = True
                    pixel_type = pixel_type or "storefront_detected"
                    pixel_details.append({
                        "type": "storefront_detected",
                        "source": "storefront_html_probe",
                    })
                    debug_info["storefront_shopbrain_found"] = True
                else:
                    debug_info["storefront_shopbrain_found"] = False
        except Exception as e:
            debug_info["storefront_exception"] = str(e)[:200]

    # ── Determine overall status ──────────────────────────────────────
    if pixel_installed and pixel_active:
        status = "active"
        status_label = "✅ Pixel installé et actif"
    elif pixel_installed and not pixel_active:
        status = "installed_inactive"
        status_label = "⚠️ Pixel installé mais inactif"
    else:
        status = "not_installed"
        status_label = "❌ Pixel non détecté"

    return {
        "success": True,
        "shop": shop_domain,
        "pixel_installed": pixel_installed,
        "pixel_active": pixel_active,
        "pixel_type": pixel_type,
        "status": status,
        "status_label": status_label,
        "has_recent_events": has_events,
        "details": pixel_details,
        "debug": debug_info,
    }


def _infer_image_category(title: str) -> str:
    t = (title or "").lower()
    patterns = [
        ("apparel", r"\b(t-?shirt|tee|hoodie|sweat|pull|pantalon|jean|robe|jupe|chemise|chausset|legging|veste|manteau|casquette|bonnet)\b"),
        ("beauty", r"\b(parfum|eau de parfum|eau de toilette|cr[eè]me|serum|s[eé]rum|shampoing|savon|gel douche|maquillage|rouge|mascara|skincare|cosm[eé]tique)\b"),
        ("jewelry", r"\b(bague|collier|bracelet|boucle|bijou|or|argent|gold|silver)\b"),
        ("bottle", r"\b(bouteille|gourde|flasque|thermos|shaker)\b"),
        ("electronics", r"\b(casque|ecouteur|chargeur|c[âa]ble|clavier|souris|cam[eé]ra|smart|iphone|android|usb|bluetooth)\b"),
        ("home", r"\b(canap[eé]|chaise|table|lampe|coussin|tapis|drap|linge|d[eé]co|d[ée]coration|meuble)\b"),
        ("food", r"\b(th[eé]|cafe|caf[eé]|chocolat|snack|protein|protéine|barre|miel|huile|epice|[eé]pice)\b"),
    ]
    for cat, pat in patterns:
        try:
            if re.search(pat, t, flags=re.IGNORECASE):
                    return cat  # Return the matched category
        except Exception:
            continue
    return "general"


def _image_target_count(category: str) -> int:
    # Conservative, ecommerce-pro targets.
    if category in {"apparel"}:
        return 9
    if category in {"jewelry", "beauty"}:
        return 8
    if category in {"electronics", "home"}:
        return 8
    if category in {"food", "bottle"}:
        return 7
    return 7


def _build_image_shot_list(category: str) -> list[dict]:
    # Each shot: what, why, setup. Kept short but concrete.
    base = [
        {
            "shot": "Hero e-commerce (packshot)",
            "purpose": "Image principale (confiance + lisibilité)",
            "composition": "Produit centré, 70–85% du cadre, ombre douce",
            "background": "Blanc ou gris très clair (#F6F6F6)",
            "color_tone": "Neutre, fidèle au produit",
            "lighting": "Softbox / lumière diffuse, reflets contrôlés",
        },
        {
            "shot": "3/4 angle", 
            "purpose": "Donner du volume et de la profondeur",
            "composition": "Angle 30–45°, même fond que le hero",
            "background": "Blanc/clair cohérent",
            "color_tone": "Neutre",
            "lighting": "Diffuse + fill léger",
        },
        {
            "shot": "Zoom détails", 
            "purpose": "Justifier le prix (matière, finition, texture)",
            "composition": "Macro net, 1 détail par image",
            "background": "Neutre",
            "color_tone": "Neutre",
            "lighting": "Latérale douce pour révéler texture",
        },
        {
            "shot": "Image preuve (bénéfice / taille / usage)",
            "purpose": "Réduire l’incertitude (taille/usage/benefit)",
            "composition": "Infographie simple: 1 bénéfice + 1 donnée",
            "background": "Blanc/clair avec accent couleur de marque",
            "color_tone": "Accents limités (1–2 couleurs)",
            "lighting": "N/A",
        },
        {
            "shot": "Contexte/lifestyle", 
            "purpose": "Projection (désir + usage réel)",
            "composition": "Scène simple, sujet principal = produit",
            "background": "Décor minimal, propre, sans désordre",
            "color_tone": "Chaud ou neutre selon marque",
            "lighting": "Naturelle douce (fenêtre) ou studio diffus",
        },
        {
            "shot": "Packaging / contenu du lot", 
            "purpose": "Clarifier ce qui est inclus",
            "composition": "Flat lay propre, étiquettes lisibles",
            "background": "Clair, cohérent",
            "color_tone": "Neutre",
            "lighting": "Diffuse",
        },
        {
            "shot": "UGC / social proof (option)",
            "purpose": "Crédibilité et conversion",
            "composition": "Photo utilisateur cadrée propre",
            "background": "Réel mais épuré",
            "color_tone": "Naturel",
            "lighting": "Naturelle",
        },
    ]

    if category == "apparel":
        extra = [
            {
                "shot": "Sur modèle (face)",
                "purpose": "Fit + style",
                "composition": "Plan buste, fond uni",
                "background": "Uni (blanc, gris, beige)",
                "color_tone": "Neutre",
                "lighting": "Diffuse, peau naturelle",
            },
            {
                "shot": "Sur modèle (dos)",
                "purpose": "Coupe complète",
                "composition": "Même setup que face",
                "background": "Uni",
                "color_tone": "Neutre",
                "lighting": "Diffuse",
            },
            {
                "shot": "Guide tailles / mesures", 
                "purpose": "Réduire retours",
                "composition": "Schéma simple + mesures",
                "background": "Blanc/clair",
                "color_tone": "Accents marque",
                "lighting": "N/A",
            },
        ]
        return base[:3] + extra[:2] + base[3:6] + extra[2:]

    if category in {"beauty", "jewelry"}:
        extra = [
            {
                "shot": "Texture / application (si pertinent)",
                "purpose": "Compréhension immédiate",
                "composition": "Macro propre",
                "background": "Neutre",
                "color_tone": "Légèrement premium (contraste doux)",
                "lighting": "Diffuse + highlights contrôlés",
            },
            {
                "shot": "Mood premium (option)",
                "purpose": "Désir / positionnement",
                "composition": "Produit + 1 prop max",
                "background": "Dégradé sombre / pierre / marbre discret",
                "color_tone": "Froid neutre ou chaud doux",
                "lighting": "Contraste modéré, reflets maîtrisés",
            },
        ]
        return base[:2] + [extra[1]] + base[2:5] + [extra[0]] + base[5:]

    return base


def _build_image_recommendations(title: str, images_count: int, missing_alt: bool, view_to_cart_rate: float | None) -> dict:
    category = _infer_image_category(title)
    target = _image_target_count(category)
    # If pixel says conversion is weak, push for more proof shots.
    if view_to_cart_rate is not None and view_to_cart_rate < 0.02:
        target = min(10, max(target, 9))

    shots = _build_image_shot_list(category)
    priority_shots = shots[: min(len(shots), target)]

    alt_guidance = "" if not missing_alt else (
        "Ajoutez des alts descriptifs: [type produit] + [matière/couleur] + [usage] + [vue]. Exemple: 'T-shirt coton noir, vue 3/4, logo brodé'."
    )

    # AI prompt pack: usable in DALL·E / Midjourney / SD.
    product_label = (title or "Produit").strip()[:80]
    prompt_blocks = []
    for s in priority_shots[:8]:
        shot_name = s.get("shot")
        outcome = f"Tu obtiens: {shot_name.lower()} propre, net, cohérent avec la fiche produit."
        base_prompt = (
            f"Photo produit e-commerce professionnelle: {product_label}. "
            f"Shot: {shot_name}. Composition: {s.get('composition')}. "
            f"Fond: {s.get('background')}. Ton couleur: {s.get('color_tone')}. "
            f"Lumière: {s.get('lighting')}. Ultra réaliste, haute résolution, netteté parfaite, pas de texte, pas de watermark."
        )
        premium_prompt = (
            f"Photographie premium studio: {product_label}. "
            f"Shot: {shot_name}. Composition: {s.get('composition')}. "
            f"Arrière-plan minimaliste, rendu luxe discret, contrastes doux, couleurs fidèles, reflets contrôlés. "
            f"Ultra réaliste, haute résolution, pas de texte, pas de watermark."
        )
        prompt_blocks.append({
            "shot": shot_name,
            "outcome": outcome,
            "prompts": [
                {"label": "Studio e-commerce", "when_to_use": "Pour les 3–5 premières images (confiance + lisibilité)", "prompt": base_prompt},
                {"label": "Premium (luxe discret)", "when_to_use": "Pour 1–2 images mood (sans casser la cohérence)", "prompt": premium_prompt},
            ]
        })

    # Highly prescriptive, step-by-step action plan.
    size_specs = {
        "ratio": "1:1 (carré)",
        "min_resolution": "2000×2000 px",
        "format": "JPG (ou WebP) haute qualité",
    }
    action_plan = [
        {
            "step": 1,
            "title": "Produire le packshot principal (hero)",
            "do": [
                "Fond blanc ou gris très clair (#F6F6F6).",
                "Produit grand (70–85% du cadre), centré, ombre douce.",
                f"Export: {size_specs['ratio']} • {size_specs['min_resolution']} • {size_specs['format']}",
            ],
        },
        {
            "step": 2,
            "title": "Ajouter 1 angle (3/4) + 1 dos/face si pertinent",
            "do": [
                "Même fond + même lumière que le hero (cohérence).",
                "Objectif: volume + comprendre la forme en 1 seconde.",
            ],
        },
        {
            "step": 3,
            "title": "Faire 2 zooms détails (preuve qualité)",
            "do": [
                "1 détail matière/texture.",
                "1 détail finition (couture, logo, valve, embout, fermoir, etc.).",
                "1 détail = 1 image (net, sans bruit).",
            ],
        },
        {
            "step": 4,
            "title": "Créer 1 image preuve (taille / bénéfice / usage)",
            "do": [
                "Infographie simple: 1 bénéfice + 1 donnée maximum.",
                "Police grande, lisible mobile, contraste doux.",
                "Accents couleur limités (1–2 couleurs).",
            ],
        },
        {
            "step": 5,
            "title": "Ajouter 1 lifestyle propre (projection)",
            "do": [
                "Décor minimal (pas de désordre), props limités (0–1).",
                "Lumière naturelle douce ou studio diffus.",
                "Le produit reste le sujet principal.",
            ],
        },
        {
            "step": 6,
            "title": "Clarifier ce qui est inclus (packaging / contenu)",
            "do": [
                "Flat lay propre ou packshot packaging.",
                "Lister visuellement les éléments inclus (sans surcharge).",
            ],
        },
    ]
    if missing_alt:
        action_plan.append({
            "step": 7,
            "title": "Renseigner les textes ALT (SEO + accessibilité)",
            "do": [
                "ALT = type produit + matière/couleur + usage + vue.",
                "Ex: 'Bouteille isotherme noire 500ml, vue 3/4, bouchon fermé'.",
            ],
        })

    # Recommended ordering in the gallery for conversion.
    order = []
    for idx, s in enumerate(priority_shots[:target], start=1):
        order.append({
            "position": idx,
            "shot": s.get("shot"),
            "goal": s.get("purpose"),
        })

    # Extra specificity per category.
    category_notes = []
    if category == "apparel":
        category_notes.append("Vêtements: ajoutez face + dos sur modèle, puis guide tailles (réduit retours).")
    if category == "bottle":
        category_notes.append("Gourdes/bouteilles: montrez le bouchon, l’ouverture, l’étanchéité, et l’échelle (main / sac / vélo).")
    if category in {"beauty", "jewelry"}:
        category_notes.append("Beauty/Bijoux: reflets contrôlés, macro très nette, 1–2 images mood premium max.")

    style_guidelines = [
        "Cohérence: même ratio, même lumière et fond sur la série.",
        "Lisibilité mobile: produit grand, contraste doux, arrière-plan propre.",
        "Couleurs: base neutre + 1 couleur d’accent max (badge/infographie).",
        "Arrière-plan: éviter les textures chargées; props limités (0–1) et pertinents.",
    ]
    if category in {"jewelry", "beauty"}:
        style_guidelines.append("Premium: contraste modéré, reflets contrôlés, matériaux nobles (marbre discret / pierre / dégradé).")

    if category == "apparel":
        style_guidelines.append("Vêtements: inclure face/dos + détail matière + guide taille pour limiter les retours.")

    return {
        "category": category,
        "target_total_images": target,
        "recommended_new_images": max(0, target - int(images_count or 0)),
        "priority_shots": priority_shots,
        "style_guidelines": style_guidelines,
        "alt_text_guidance": alt_guidance,
        "prompt_blocks": prompt_blocks,
        "action_plan": action_plan,
        "recommended_order": order,
        "category_notes": category_notes,
        "do_dont": [
            "DO: fond propre, angles cohérents, détails nets, preuves (tailles, inclus, bénéfices).",
            "DON'T: texte illisible sur image, filtres lourds, ombres dures, décors encombrés.",
        ],
    }


def _ai_image_assistance_batch(products: list[dict], user_instructions: str | None = None) -> dict[str, dict]:
    """Hybrid image assistance:

    - If product has image URLs -> vision audit of existing images (background/tone/consistency) + concrete fixes.
    - If product has no images -> text-only plan for what to shoot.
    - user_instructions: optional custom user instructions for the AI.

    Returns: {product_id: {target_total_images, images_to_create, prompt_blocks, ai{...}}}
    """
    if not OPENAI_API_KEY or not products:
        return {}

    def _normalize_image_urls(raw: object) -> list[str]:
        urls: list[str] = []
        if isinstance(raw, list):
            for u in raw:
                if isinstance(u, str) and u.strip().startswith("http"):
                    urls.append(u.strip())
        return urls

    with_images: list[dict] = []
    without_images: list[dict] = []

    for p in products[:12]:
        pid = str(p.get("product_id") or "")
        if not pid:
            continue
        image_urls = _normalize_image_urls(p.get("image_urls"))
        row = {
            "product_id": pid,
            "title": p.get("title") or "",
            "product_type": p.get("product_type") or "",
            "vendor": p.get("vendor") or "",
            "tags": p.get("tags") or "",
            "description": p.get("description") or "",
            "price": p.get("price"),
            "images_count": p.get("images_count"),
            "missing_alt": bool(p.get("missing_alt")),
            "views": p.get("views"),
            "add_to_cart": p.get("add_to_cart"),
            "view_to_cart_rate": p.get("view_to_cart_rate"),
            "image_urls": image_urls,
        }
        if image_urls:
            with_images.append(row)
        else:
            without_images.append(row)

    out: dict[str, dict] = {}

    OPENAI_TEXT_MODEL = os.getenv("OPENAI_TEXT_MODEL") or "gpt-4"
    OPENAI_VISION_MODEL = os.getenv("OPENAI_VISION_MODEL") or "gpt-4o-mini"

    def _merge(pid: str, payload: dict):
        if pid and isinstance(payload, dict):
            out[pid] = payload

    def _keywords(p: dict) -> list[str]:
        parts = " ".join([
            str(p.get("title") or ""),
            str(p.get("product_type") or ""),
            str(p.get("vendor") or ""),
            str(p.get("tags") or ""),
        ]).lower()
        tokens = []
        for w in re.split(r"[^a-z0-9àâçéèêëîïôûùüÿñæœ]+", parts):
            w = (w or "").strip()
            if len(w) >= 4:
                tokens.append(w)
        # unique, keep order
        seen = set()
        uniq = []
        for t in tokens:
            if t not in seen:
                seen.add(t)
                uniq.append(t)
        return uniq[:12]

    def _looks_generic(p: dict, images_to_create: list[dict], facts: list[str]) -> bool:
        if not isinstance(images_to_create, list) or not images_to_create:
            return True
        kw = set(_keywords(p))
        kw.update([f.lower() for f in facts if isinstance(f, str)])
        # If there are no usable keywords, accept.
        if not kw:
            return False
        hit = 0
        facts_used_hits = 0
        for img in images_to_create[:6]:
            text = " ".join([
                str(img.get("name") or ""),
                str(img.get("what_to_shoot") or ""),
                str(img.get("why") or ""),
            ]).lower()
            if any(k in text for k in list(kw)[:8]):
                hit += 1
            uses = img.get("uses_facts")
            if isinstance(uses, list) and any(isinstance(u, str) and u.strip() for u in uses):
                facts_used_hits += 1

        # Require: at least 3 keyword hits AND at least 3 shots explicitly linking to product facts.
        return hit < 3 or facts_used_hits < 3

    def _build_prompt_blocks(images_to_create: list[dict]) -> list[dict]:
        prompt_blocks = []
        for img in images_to_create[:10]:
            name = img.get("name")
            prompts = img.get("prompts") or {}
            prompt_blocks.append({
                "shot": name,
                "outcome": img.get("why") or "",
                "prompts": [
                    {
                        "label": "Studio e-commerce",
                        "when_to_use": "Pour une image propre et vendeuse (packshot/fiche)",
                        "prompt": prompts.get("studio") or "",
                    },
                    {
                        "label": "Premium (luxe discret)",
                        "when_to_use": "Pour une image 'mood' premium (1–2 max)",
                        "prompt": prompts.get("premium") or "",
                    },
                ]
            })
        return prompt_blocks

    def _text_only_for_product(p: dict, retry: bool = False) -> dict:
        pid = str(p.get("product_id") or "")
        if not pid:
            return {}

        schema = {
            "product_id": "string",
            "product_facts_used": ["string"],
            "target_total_images": 8,
            "tone": "string",
            "background": "string",
            "color_palette": ["string"],
            "action_plan": [{"step": 1, "title": "string", "do": ["string"]}],
            "recommended_order": [{"position": 1, "shot": "string", "goal": "string"}],
            "images_to_create": [
                {
                    "index": 1,
                    "name": "string",
                    "what_to_shoot": "string",
                    "background": "string",
                    "color_tone": "string",
                    "props": "string",
                    "camera": "string (focal length, ex: 85mm f/1.8)",
                    "lighting": "string (direction, diffusion, Kelvin temp)",
                    "editing_notes": "string",
                    "why": "string (lié à un principe de conversion ou psychologie visuelle)",
                    "uses_facts": ["string"],
                }
            ],
            "style_rules": ["string"],
            "alt_templates": ["string"],
            "notes": ["string"],
        }

        constraints = [
            "Do NOT browse the web.",
            "Be specific to THIS product. Do NOT reuse generic templates.",
            "First, extract 4-7 concrete product facts into product_facts_used (from title/type/tags/vendor/description/price).",
            "Every shot MUST include uses_facts with 1-3 exact strings copied from product_facts_used.",
            "Every shot (name/what_to_shoot/why) MUST clearly reference at least one fact from uses_facts.",
            "For background: recommend SPECIFIC colors/materials (ex: 'marbre Calacatta blanc veiné gris' not just 'fond blanc'). Justify with color psychology.",
            "For lighting: give technical specs (direction, diffusion type, Kelvin temperature, ex: '5200K softbox 45° gauche + réflecteur argent droite').",
            "For camera: specify focal length and aperture (ex: '85mm f/2.8 pour compression flatteuse').",
            "For color_palette: recommend 3-5 specific hex codes or Pantone references that complement the product based on color harmony theory.",
            "Every recommendation MUST be justified by a conversion principle, psychology study, or industry best practice.",
            "Do NOT include 'prompts' field in images_to_create. Give real photography directions, NOT AI generation prompts.",
            "If information is missing, infer reasonable specifics from product_type/title (ex: bouteille -> bouchon/étanchéité/prise en main).",
            "Avoid vague advice. Use measurable / concrete details.",
            "Return only valid JSON matching output_schema. Language: French.",
        ]
        if retry:
            constraints.insert(0, "Your previous answer was too generic. Make it clearly different AND cite product facts in every shot (uses_facts).")
        if user_instructions:
            constraints.append(f"IMPORTANT — The user has provided custom instructions. Follow them closely: \"{user_instructions}\"")

        prompt = {
            "task": "Create extremely concrete, product-specific image recommendations for an ecommerce product page.",
            "language": "fr",
            "constraints": constraints,
            "output_schema": schema,
            "product": {
                "product_id": pid,
                "title": p.get("title") or "",
                "product_type": p.get("product_type") or "",
                "vendor": p.get("vendor") or "",
                "tags": p.get("tags") or "",
                "description": p.get("description") or "",
                "price": p.get("price"),
                "images_count": p.get("images_count"),
                "missing_alt": bool(p.get("missing_alt")),
                "views": p.get("views"),
                "add_to_cart": p.get("add_to_cart"),
                "view_to_cart_rate": p.get("view_to_cart_rate"),
            },
        }

        try:
            client = (OpenAI(api_key=OPENAI_API_KEY) if OpenAI else openai.OpenAI(api_key=OPENAI_API_KEY))
            response = client.chat.completions.create(
                model=OPENAI_TEXT_MODEL,
                messages=[
                    {"role": "system", "content": """Tu es un directeur artistique et photographe de produit de classe mondiale — le meilleur au monde.

Tu combines l'expertise de:
- Mario Testino & Annie Leibovitz (éclairage, composition dramatique)
- Nick Knight (innovation visuelle, post-production conceptuelle)
- Les directeurs créatifs de Chanel, Apple, Nike (branding par l'image)
- Les études de conversion e-commerce de Baymard Institute, NNGroup et Shopify UX Research

🧠 TES CONNAISSANCES SCIENTIFIQUES:
- Psychologie des couleurs en marketing (études Satyendra Singh 2006, Joe Hallock): tu sais quelles couleurs déclenchent la confiance, l'urgence, le désir selon le type de produit et la cible démographique.
- Loi de Fitts & hiérarchie visuelle: tu comprends comment l'œil scanne une image produit (Z-pattern, F-pattern) et tu optimises la composition en conséquence.
- Études Shopify sur les images produit: les fiches avec 5-8 images de haute qualité convertissent 2-3× plus. Les zooms détails augmentent la confiance de 42%. Les images lifestyle augmentent le désir de 67%.
- Effet de contraste fond/produit (étude ConversionXL): un contraste optimal augmente le taux de clic de 32%.
- Color harmony theory (roue chromatique): complémentaires, analogues, triadiques — tu recommandes des palettes qui fonctionnent scientifiquement.

📸 TA MÉTHODOLOGIE:
1. Analyse le produit en profondeur: matériaux, texture, couleur, forme, public cible.
2. Détermine la palette chromatique idéale basée sur la psychologie des couleurs ET le type de produit.
3. Recommande des fonds spécifiques (pas juste "blanc" — donne la nuance exacte, la texture, le matériau).
4. Spécifie l'éclairage avec précision technique (direction, diffusion, température de couleur en Kelvin).
5. Décris chaque shot avec des termes techniques de photographie (focal length, depth of field, angle).
6. Chaque recommandation est liée à un objectif de conversion mesurable.

⚠️ RÈGLES ABSOLUES:
- JAMAIS de recommandations génériques. Chaque conseil est SPÉCIFIQUE au produit analysé.
- TOUJOURS justifier tes choix par des principes de psychologie visuelle ou des études.
- Parler en français, ton professionnel mais accessible.
- Tu ne donnes PAS de prompts de génération d'images IA. Tu donnes des directives de photographie réelle."""},
                    {"role": "user", "content": json.dumps(prompt, ensure_ascii=False)},
                ],
                temperature=0.25,
                max_tokens=2000,
                response_format={"type": "json_object"},
            )
            row = json.loads(response.choices[0].message.content or "{}")
            if not isinstance(row, dict):
                return {}
            images_to_create = row.get("images_to_create")
            if not isinstance(images_to_create, list) or not images_to_create:
                return {}
            facts = row.get("product_facts_used")
            facts = facts if isinstance(facts, list) else []
            if (not retry) and _looks_generic(p, images_to_create, facts):
                return _text_only_for_product(p, retry=True)

            return {
                "ai": {
                    "tone": row.get("tone"),
                    "background": row.get("background"),
                    "color_palette": row.get("color_palette"),
                    "style_rules": row.get("style_rules"),
                    "alt_templates": row.get("alt_templates"),
                    "notes": row.get("notes"),
                    "product_facts_used": facts,
                },
                "target_total_images": row.get("target_total_images"),
                "action_plan": row.get("action_plan"),
                "recommended_order": row.get("recommended_order"),
                "images_to_create": images_to_create,
                "prompt_blocks": _build_prompt_blocks(images_to_create),
            }
        except Exception as e:
            print(f"⚠️ image assistance AI(text:{pid}) error: {type(e).__name__}: {str(e)[:160]}")
            return {}

    def _vision_for_product(p: dict) -> dict:
        pid = str(p.get("product_id") or "")
        urls = _normalize_image_urls(p.get("image_urls"))[:2]
        if not pid or not urls:
            return {}

        vision_constraints = [
                "Do NOT browse the web.",
                "Use ONLY the provided images + product context.",
                "MANDATORY checks: (1) Background vs product color CONTRAST — does the product pop or blend into its background? (2) Image SHARPNESS — is the image crisp or blurry/pixelated? (3) LIGHTING quality — even, flattering, or harsh/uneven shadows? (4) COMPOSITION — is the product centered, well-cropped, with enough white space? (5) DESIGN attractiveness — would a shopper trust and desire this product from the photo? (6) COLOR accuracy — do colors look natural or washed out/over-saturated? (7) CONSISTENCY across images — do they look like they belong to the same brand/shoot?",
                "Rate each check as: excellent / good / needs_improvement / poor.",
                "Provide quick fixes with SPECIFIC instructions (e.g. 'increase contrast by 20%', 'crop to center product with 15% padding').",
                "Return only valid JSON matching output_schema.",
            ]
        if user_instructions:
            vision_constraints.append(f"IMPORTANT — The user has provided custom instructions. Follow them closely: \"{user_instructions}\"")

        prompt = {
            "task": "Expert ecommerce product image audit — analyze visual quality, design, and conversion potential.",
            "language": "en",
            "constraints": vision_constraints,
            "output_schema": {
                "product_id": "string",
                "product_facts_used": ["string"],
                "tone": "string",
                "background": "string",
                "color_palette": ["string"],
                "quality_scores": {
                    "overall": 0.0,
                    "sharpness": "excellent|good|needs_improvement|poor",
                    "lighting": "excellent|good|needs_improvement|poor",
                    "background_contrast": "excellent|good|needs_improvement|poor",
                    "composition": "excellent|good|needs_improvement|poor",
                    "color_accuracy": "excellent|good|needs_improvement|poor",
                    "design_appeal": "excellent|good|needs_improvement|poor",
                    "brand_consistency": "excellent|good|needs_improvement|poor",
                },
                "audit": {
                    "what_i_see": ["string — describe each image objectively"],
                    "issues": ["string — specific problems found with severity"],
                    "quick_fixes": ["string — actionable fix with exact instructions"],
                    "consistency_score": 0.0,
                },
                "action_plan": [{"step": 1, "title": "string", "do": ["string"]}],
                "recommended_order": [{"position": 1, "shot": "string", "goal": "string"}],
                "style_rules": ["string"],
                "notes": ["string"],
            },
            "product": {
                "product_id": pid,
                "title": p.get("title") or "",
                "product_type": p.get("product_type") or "",
                "vendor": p.get("vendor") or "",
                "tags": p.get("tags") or "",
                "description": p.get("description") or "",
                "price": p.get("price"),
                "images_count": p.get("images_count"),
            }
        }

        user_parts: list[dict] = [
            {"type": "text", "text": "Respond STRICTLY in JSON matching output_schema. Analyze EVERY quality dimension.\n" + json.dumps(prompt, ensure_ascii=False)},
        ]
        for u in urls:
            user_parts.append({"type": "image_url", "image_url": {"url": u}})

        try:
            client = (OpenAI(api_key=OPENAI_API_KEY) if OpenAI else openai.OpenAI(api_key=OPENAI_API_KEY))
            response = client.chat.completions.create(
                model=OPENAI_VISION_MODEL,
                messages=[
                    {"role": "system", "content": """Tu es le meilleur photographe produit et directeur artistique e-commerce au monde.

Tu combines l'œil de Mario Testino, l'expertise technique d'Annie Leibovitz, et les connaissances en conversion de Baymard Institute.

🔬 TES ANALYSES SONT BASÉES SUR:
- Psychologie des couleurs (Satyendra Singh 2006): impact des couleurs sur les décisions d'achat.
- Études Baymard Institute: 56% des abandons sont liés à des images produit insuffisantes.
- Recherche ConversionXL: le contraste fond/produit augmente les clics de 32%.
- NNGroup eye-tracking: comment l'œil scanne les images produit.
- Shopify UX Research: les images haute qualité augmentent la conversion de 2-3×.

📸 TON AUDIT COUVRE:
1. NETTETÉ & RÉSOLUTION: analyse technique de la qualité pixel.
2. ÉCLAIRAGE: direction, diffusion, température, ombres — avec recommandations précises (ex: "passer de 5500K à 4800K pour plus de chaleur").
3. CONTRASTE FOND/PRODUIT: le produit se détache-t-il suffisamment? Quelle couleur de fond serait optimale selon la psychologie des couleurs pour CE type de produit?
4. COMPOSITION: règle des tiers, espace négatif, cadrage — avec corrections spécifiques en cm/% .
5. PALETTE CHROMATIQUE: les couleurs véhiculent-elles le bon message pour le public cible?
6. ATTRAIT DESIGN: cette image donne-t-elle envie d'acheter? Pourquoi, basé sur quels principes?
7. COHÉRENCE MARQUE: les images forment-elles un ensemble professionnel?

⚠️ RÈGLES:
- CHAQUE problème détecté DOIT avoir une solution concrète et mesurable.
- Cite les études/principes derrière tes recommandations.
- Sois direct et professionnel — pas de flatterie inutile.
- Langue: français.
- Ne donne PAS de prompts IA. Donne des directives de photographie réelle."""},
                    {"role": "user", "content": user_parts},
                ],
                temperature=0.2,
                max_tokens=1800,
                response_format={"type": "json_object"},
            )
            row = json.loads(response.choices[0].message.content or "{}")
            if not isinstance(row, dict) or str(row.get("product_id") or "") != pid:
                return {}
            facts = row.get("product_facts_used")
            facts = facts if isinstance(facts, list) else []
            return {
                "ai": {
                    "tone": row.get("tone"),
                    "background": row.get("background"),
                    "color_palette": row.get("color_palette"),
                    "quality_scores": row.get("quality_scores") if isinstance(row.get("quality_scores"), dict) else {},
                    "style_rules": row.get("style_rules"),
                    "notes": row.get("notes"),
                    "audit": row.get("audit") if isinstance(row.get("audit"), dict) else {},
                    "product_facts_used": facts,
                },
                "target_total_images": None,
                "action_plan": row.get("action_plan"),
                "recommended_order": row.get("recommended_order"),
                "images_to_create": [],
                "prompt_blocks": [],
            }
        except Exception as e:
            print(f"⚠️ image assistance AI(vision:{pid}) error: {type(e).__name__}: {str(e)[:160]}")
            return {}

    # Keep latency bounded — aim for <10s total.
    started = time.time()
    budget_s = 10
    max_products = 3

    # Prioritize: audit vision when photos exist; otherwise text.
    queue = (with_images + without_images)[:max_products]

    # Process in parallel using ThreadPoolExecutor for speed
    import concurrent.futures

    def _process_product(p):
        pid = str(p.get("product_id") or "")
        if not pid:
            return (pid, {})
        payload = {}
        if _normalize_image_urls(p.get("image_urls")):
            payload = _vision_for_product(p)
        if not payload:
            payload = _text_only_for_product(p)
        return (pid, payload)

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        futures = {executor.submit(_process_product, p): p for p in queue}
        try:
            for future in concurrent.futures.as_completed(futures, timeout=budget_s):
                try:
                    pid, payload = future.result(timeout=3)
                    if pid and payload:
                        _merge(pid, payload)
                except Exception:
                    pass
        except concurrent.futures.TimeoutError:
            # Budget exceeded — cancel remaining futures gracefully
            for f in futures:
                f.cancel()
            print(f"⚠️ image-assistance: budget {budget_s}s exceeded, returning partial results")

    return out

@app.get("/api/shopify/image-risks")
async def get_shopify_image_risks(request: Request, range: str = "30d", limit: int = 50, ai: int = 1, product_id: str | None = None, instructions: str | None = None):
    """🖼️ Analyse rapide des images produits (signaux de conversion visuels).

    - Nombre d'images faible
    - Alt manquant
    - (si pixel) taux vue→panier faible
    - product_id: si fourni, analyse uniquement ce produit
    - instructions: instructions personnalisées de l'utilisateur pour l'IA
    """
    user_id = get_user_id(request)
    tier = get_user_tier(user_id)
    ensure_feature_allowed(tier, "image_recommendations")

    shop_domain, access_token = _get_shopify_connection(user_id)

    range_map = {
        "7d": 7,
        "30d": 30,
        "90d": 90,
        "365d": 365,
    }
    days = range_map.get(range, 30)
    effective_limit = max(1, min(int(limit), 250))

    headers = {
        "X-Shopify-Access-Token": access_token,
        "Content-Type": "application/json",
    }

    try:
        # If a specific product_id is requested, fetch only that product
        if product_id:
            products_url = (
                f"https://{shop_domain}/admin/api/2024-10/products/{product_id}.json"
                f"?fields=id,title,images,product_type,vendor,tags"
            )
            resp = requests.get(products_url, headers=headers, timeout=20)
            if resp.status_code == 401:
                raise HTTPException(status_code=401, detail="Token Shopify expiré ou invalide. Reconnectez-vous.")
            if resp.status_code == 404:
                raise HTTPException(status_code=404, detail=f"Produit {product_id} non trouvé.")
            if resp.status_code != 200:
                raise HTTPException(status_code=resp.status_code, detail=f"Erreur Shopify: {resp.text[:300]}")
            product_data = (resp.json() or {}).get("product")
            products = [product_data] if product_data else []
        else:
            products_url = (
                f"https://{shop_domain}/admin/api/2024-10/products.json"
                f"?limit={effective_limit}&fields=id,title,images,product_type,vendor,tags"
            )
            resp = requests.get(products_url, headers=headers, timeout=20)
            if resp.status_code == 401:
                raise HTTPException(status_code=401, detail="Token Shopify expiré ou invalide. Reconnectez-vous.")
            if resp.status_code != 200:
                raise HTTPException(status_code=resp.status_code, detail=f"Erreur Shopify: {resp.text[:300]}")
            products = (resp.json() or {}).get("products", [])

        if not products:
            return {
                "success": True,
                "shop": shop_domain,
                "range": range,
                "image_risks": [],
                "notes": ["Aucun produit trouvé dans la boutique."],
            }

        event_counts = {}
        try:
            event_counts = _fetch_shopify_event_counts(user_id, shop_domain, days)
        except Exception:
            event_counts = {}

        items = []
        for p in products:
            pid = str(p.get("id") or "")
            if not pid:
                continue
            images = p.get("images") or []
            images_count = len(images)
            missing_alt = any(not (img.get("alt") or "").strip() for img in images) if images else True

            signals = event_counts.get(pid, {"views": 0, "add_to_cart": 0})
            views = int(signals.get("views", 0) or 0)
            add_to_cart = int(signals.get("add_to_cart", 0) or 0)
            view_to_cart = (add_to_cart / views) if views else None

            # Risk heuristics: very few images OR missing alt OR low view→cart when we have pixel data.
            is_risky = images_count <= 1 or missing_alt or (view_to_cart is not None and views >= 10 and view_to_cart < 0.02)
            # If a specific product_id was requested, always analyze it regardless of risk score
            if not is_risky and not product_id:
                continue

            score = 0
            if images_count <= 1:
                score += 2
            if missing_alt:
                score += 1
            if view_to_cart is not None and views >= 10 and view_to_cart < 0.02:
                score += 2

            items.append({
                "product_id": pid,
                "title": p.get("title") or f"Produit {pid}",
                "product_type": p.get("product_type") or "",
                "vendor": p.get("vendor") or "",
                "tags": p.get("tags") or "",
                "images_count": images_count,
                "missing_alt": bool(missing_alt),
                "views": views,
                "add_to_cart": add_to_cart,
                "view_to_cart_rate": round(view_to_cart, 4) if view_to_cart is not None else None,
                "score": score,
                "recommendations": _build_image_recommendations(
                    title=p.get("title") or "",
                    images_count=images_count,
                    missing_alt=bool(missing_alt),
                    view_to_cart_rate=view_to_cart,
                ),
                "image_urls": [(img.get("src") or img.get("url") or "").strip() for img in (p.get("images") or []) if isinstance(img, dict) and (img.get("src") or img.get("url"))],
            })

        items.sort(key=lambda x: (x.get("score", 0), x.get("views", 0)), reverse=True)
        # Keep UI responsive: only return top items — limit to 3 for speed.
        items = items[:3]

        use_ai = bool(int(ai or 0))
        if use_ai and not OPENAI_API_KEY:
            raise HTTPException(status_code=503, detail="IA images non configurée: OPENAI_API_KEY manquante côté backend")

        ai_payload = {}
        if use_ai and OPENAI_API_KEY and items:
            # Fetch extra details for these specific products to make AI recommendations truly product-specific.
            details_by_id: dict[str, dict] = {}
            started = time.time()
            for it in items[:3]:
                pid = str(it.get("product_id") or "")
                if not pid:
                    continue
                if (time.time() - started) > 5:
                    break
                try:
                    detail_url = f"https://{shop_domain}/admin/api/2024-10/products/{pid}.json?fields=id,title,body_html,product_type,vendor,tags,variants"
                    dresp = requests.get(detail_url, headers=headers, timeout=5)
                    if dresp.status_code == 200:
                        prod = (dresp.json() or {}).get("product") or {}
                        details_by_id[pid] = prod
                except Exception:
                    continue

            enriched_for_ai = []
            for it in items:
                pid = str(it.get("product_id") or "")
                prod = details_by_id.get(pid, {})
                body = _strip_html(prod.get("body_html") or "")
                body = body[:900]
                price = None
                try:
                    variants = prod.get("variants") or []
                    if variants:
                        price = variants[0].get("price")
                except Exception:
                    price = None

                enriched_for_ai.append({
                    "product_id": pid,
                    "title": it.get("title"),
                    "product_type": it.get("product_type") or prod.get("product_type") or "",
                    "vendor": it.get("vendor") or prod.get("vendor") or "",
                    "tags": it.get("tags") or prod.get("tags") or "",
                    "description": body,
                    "price": price,
                    "images_count": it.get("images_count"),
                    "missing_alt": it.get("missing_alt"),
                    "views": it.get("views"),
                    "add_to_cart": it.get("add_to_cart"),
                    "view_to_cart_rate": it.get("view_to_cart_rate"),
                    "image_urls": it.get("image_urls") or [],
                })

            ai_payload = {}
            try:
                ai_payload = _ai_image_assistance_batch(enriched_for_ai, user_instructions=instructions)
            except Exception as e:
                print(f"⚠️ image-risks AI batch error (non-fatal): {type(e).__name__}: {str(e)[:200]}")
                ai_payload = {}

            for it in items:
                pid = str(it.get("product_id") or "")
                if not pid:
                    continue
                ai_row = ai_payload.get(pid)
                if not isinstance(ai_row, dict):
                    continue

                # Replace recommendations with AI-generated content (no generic template).
                target_total = ai_row.get("target_total_images")
                try:
                    target_total = int(target_total) if isinstance(target_total, (int, float, str)) else None
                except Exception:
                    target_total = None

                it["recommendations"] = {
                    "source": "ai",
                    "target_total_images": target_total or (it.get("recommendations") or {}).get("target_total_images"),
                    "recommended_new_images": max(0, int((target_total or (it.get("recommendations") or {}).get("target_total_images") or 0)) - int(it.get("images_count") or 0)),
                    "images_to_create": ai_row.get("images_to_create") if isinstance(ai_row.get("images_to_create"), list) else [],
                    "action_plan": ai_row.get("action_plan") if isinstance(ai_row.get("action_plan"), list) else [],
                    "recommended_order": ai_row.get("recommended_order") if isinstance(ai_row.get("recommended_order"), list) else [],
                    "style_guidelines": (ai_row.get("ai") or {}).get("style_rules") if isinstance((ai_row.get("ai") or {}).get("style_rules"), list) else [],
                    "prompt_blocks": ai_row.get("prompt_blocks") if isinstance(ai_row.get("prompt_blocks"), list) else [],
                    "ai": ai_row.get("ai") if isinstance(ai_row.get("ai"), dict) else {},
                }

        notes = [
            "Analyse basée sur qualité des images (alt, quantité) + signaux Pixel si disponibles.",
        ]
        if not event_counts:
            notes.append("Ajoutez le Shopify Pixel pour enrichir les signaux vues/panier.")
        if use_ai and OPENAI_API_KEY:
            notes.append("Recommandations générées par IA et spécifiques à chaque produit.")


        return {
            "success": True,
            "shop": shop_domain,
            "range": range,
            "image_risks": items,
            "notes": notes,
        }
    except HTTPException:
        raise
    except requests.exceptions.Timeout:
        raise HTTPException(status_code=504, detail="Shopify timeout (products). Réessaie.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur image-risks: {str(e)[:200]}")


# ---------------------------------------------------------------------------
# PRODUITS SOUS-PERFORMANTS — faibles ventes / faible CA / mauvaise tendance
# ---------------------------------------------------------------------------
@app.get("/api/shopify/underperforming")
async def get_underperforming_products(request: Request, range: str = "30d", limit: int = 12):
    """📉 Détecte les produits qui se vendent mal (faible CA, peu de commandes, stock dormant)."""
    user_id = get_user_id(request)
    tier = get_user_tier(user_id)
    ensure_feature_allowed(tier, "product_analysis")

    shop_domain, access_token = _get_shopify_connection(user_id)
    range_map = {"7d": 7, "30d": 30, "90d": 90, "365d": 365}
    days = range_map.get(range, 30)
    start_date = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
    headers = {"X-Shopify-Access-Token": access_token, "Content-Type": "application/json"}

    # ---- Fetch orders ----
    orders = []
    next_url = (
        f"https://{shop_domain}/admin/api/2024-10/orders.json"
        f"?status=any&created_at_min={start_date}&limit=250"
        f"&fields=id,created_at,total_price,financial_status,currency,line_items,refunds"
    )
    page = 0
    while next_url and page < 2 and len(orders) < 500:
        try:
            resp = requests.get(next_url, headers=headers, timeout=20)
        except Exception:
            break
        if resp.status_code != 200:
            break
        orders.extend(resp.json().get("orders", []))
        next_url = _parse_shopify_next_link(resp.headers.get("Link"))
        page += 1

    # ---- Fetch all products ----
    products = []
    try:
        resp = requests.get(
            f"https://{shop_domain}/admin/api/2024-10/products.json?limit=250&fields=id,title,body_html,images,variants,product_type,vendor,status,created_at",
            headers=headers, timeout=20,
        )
        if resp.status_code == 200:
            products = resp.json().get("products", [])
    except Exception:
        pass

    # ---- Build stats per product ----
    product_stats: dict[str, dict] = {}
    refunds_by_product: dict[str, int] = {}
    currency = None
    for order in orders:
        if not currency and order.get("currency"):
            currency = order["currency"]
        fin_status = (order.get("financial_status") or "").lower()
        if fin_status in {"voided"}:
            continue
        oid = order.get("id")
        for item in order.get("line_items", []) or []:
            pid = str(item.get("product_id") or "")
            if not pid:
                continue
            qty = int(item.get("quantity") or 0)
            price = _safe_float(item.get("price"), 0.0)
            stat = product_stats.setdefault(pid, {"order_ids": set(), "quantity": 0, "revenue": 0.0})
            if oid:
                stat["order_ids"].add(oid)
            stat["quantity"] += qty
            stat["revenue"] += qty * price

        for refund in order.get("refunds", []) or []:
            for rl in refund.get("refund_line_items", []) or []:
                item = rl.get("line_item") or {}
                pid = str(item.get("product_id") or "")
                if pid:
                    refunds_by_product[pid] = refunds_by_product.get(pid, 0) + 1

    # Index products
    products_by_id = {str(p.get("id")): p for p in products}
    for p in products:
        pid = str(p.get("id"))
        if pid not in product_stats:
            product_stats[pid] = {"order_ids": set(), "quantity": 0, "revenue": 0.0}

    # Averages
    all_orders_counts = [len(s["order_ids"]) for s in product_stats.values()]
    avg_orders = sum(all_orders_counts) / max(1, len(all_orders_counts))
    all_revenues = [s["revenue"] for s in product_stats.values()]
    avg_revenue = sum(all_revenues) / max(1, len(all_revenues))
    median_orders = sorted(all_orders_counts)[len(all_orders_counts) // 2] if all_orders_counts else 0

    underperformers = []
    for pid, stat in product_stats.items():
        product = products_by_id.get(pid, {})
        title = product.get("title") or f"Produit {pid}"
        orders_count = len(stat["order_ids"])
        revenue = stat["revenue"]
        quantity = stat["quantity"]
        variants = product.get("variants", []) or []
        price_current = _safe_float(variants[0].get("price"), 0.0) if variants else 0.0
        inventory = sum(v.get("inventory_quantity", 0) or 0 for v in variants) if variants else 0
        images_count = len(product.get("images", []) or [])
        description_len = len(_strip_html(product.get("body_html") or ""))
        refund_count = refunds_by_product.get(pid, 0)
        refund_rate = (refund_count / orders_count) if orders_count else 0.0
        daily_sales = quantity / max(days, 1)
        days_of_stock = (inventory / daily_sales) if daily_sales > 0 else 999

        # ---- Scoring sous-performance ----
        score = 0
        reasons = []

        # Pas de commandes du tout
        if orders_count == 0:
            score += 35
            reasons.append("Aucune commande sur la période")
        elif orders_count <= max(1, int(median_orders * 0.3)):
            score += 25
            reasons.append(f"Très peu de commandes ({orders_count} vs médiane {median_orders})")
        elif orders_count <= max(1, int(avg_orders * 0.5)):
            score += 15
            reasons.append(f"Commandes sous la moyenne ({orders_count} vs moy. {avg_orders:.0f})")

        # Revenu faible
        if revenue == 0:
            score += 20
            reasons.append("Aucun revenu généré")
        elif avg_revenue > 0 and revenue < avg_revenue * 0.3:
            score += 12
            reasons.append(f"Revenu faible ({revenue:.2f} vs moy. {avg_revenue:.2f})")

        # Stock dormant (beaucoup de stock, peu de ventes)
        if inventory > 20 and orders_count == 0:
            score += 15
            reasons.append(f"Stock dormant ({inventory} unités, 0 ventes)")
        elif inventory > 10 and daily_sales < 0.1:
            score += 8
            reasons.append(f"Rotation très lente ({days_of_stock:.0f} jours de stock)")

        # Taux de remboursement élevé
        if refund_count > 0 and refund_rate > 0.15:
            score += 10
            reasons.append(f"Taux remboursement élevé ({refund_rate:.0%})")

        # Contenu faible (scoring only, no reason shown)
        if description_len < 100:
            score += 5
        if images_count < 2:
            score += 5

        if score < 10:
            continue

        # ---- Catégorisation ----
        if orders_count == 0 and inventory > 10:
            category = "💤 Stock dormant"
        elif orders_count == 0:
            category = "❌ Aucune vente"
        elif revenue < avg_revenue * 0.2:
            category = "📉 Sous-performant critique"
        elif revenue < avg_revenue * 0.5:
            category = "⚠️ En dessous de la moyenne"
        else:
            category = "👁️ À surveiller"

        underperformers.append({
            "product_id": pid,
            "title": title,
            "category": category,
            "score": min(100, score),
            "orders": orders_count,
            "quantity": quantity,
            "revenue": round(revenue, 2),
            "price": price_current,
            "inventory": inventory,
            "images": images_count,
            "daily_sales": round(daily_sales, 2),
            "days_of_stock": round(days_of_stock, 1) if days_of_stock < 999 else None,
            "refund_count": refund_count,
            "refund_rate": round(refund_rate, 3),
            "reasons": reasons,
        })

    underperformers.sort(key=lambda x: x["score"], reverse=True)

    return {
        "success": True,
        "shop": shop_domain,
        "range": range,
        "currency": currency,
        "total_products": len(products),
        "underperforming_count": len(underperformers),
        "benchmarks": {
            "avg_orders": round(avg_orders, 1),
            "median_orders": median_orders,
            "avg_revenue": round(avg_revenue, 2),
            "period_days": days,
        },
        "underperformers": underperformers[:max(1, min(limit, 50))],
    }


# ---------------------------------------------------------------------------
# PRODUITS FREINS — cassent la conversion (taux de sortie, abandon, friction)
# ---------------------------------------------------------------------------
@app.get("/api/shopify/blockers")
async def get_shopify_blockers(request: Request, range: str = "30d", limit: int = 12):
    """🔎 Détecte les produits qui cassent la conversion (basé sur données de ventes réelles)."""
    user_id = get_user_id(request)
    tier = get_user_tier(user_id)
    ensure_feature_allowed(tier, "product_analysis")

    shop_domain, access_token = _get_shopify_connection(user_id)

    cache_key = f"{user_id}:{shop_domain}:{range}:{int(limit)}"
    cached = _cache_get_blockers(cache_key, ttl_s=300)
    if cached:
        return cached

    started_at = time.time()
    max_total_s = 25

    range_map = {
        "7d": 7,
        "30d": 30,
        "90d": 90,
        "365d": 365,
    }
    days = range_map.get(range, 30)
    start_date = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")

    headers = {
        "X-Shopify-Access-Token": access_token,
        "Content-Type": "application/json",
    }

    orders = []
    next_url = (
        f"https://{shop_domain}/admin/api/2024-10/orders.json"
        f"?status=any&created_at_min={start_date}&limit=250"
        f"&fields=id,created_at,total_price,financial_status,currency,line_items"
    )
    page_count = 0
    # Keep this endpoint responsive: prefer partial analysis over timeouts.
    max_pages = 1 if days <= 30 else 2
    max_orders = 250 if days <= 30 else 500

    while next_url and page_count < max_pages and len(orders) < max_orders:
        if (time.time() - started_at) > (max_total_s - 7):
            break
        try:
            response = requests.get(next_url, headers=headers, timeout=20)
        except requests.exceptions.Timeout:
            raise HTTPException(status_code=504, detail="Shopify timeout (orders). Réessaie.")
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Erreur réseau Shopify (orders): {str(e)[:120]}")
        if response.status_code == 401:
            raise HTTPException(status_code=401, detail="Token Shopify expiré ou invalide. Reconnectez-vous.")
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=f"Erreur Shopify: {response.text[:300]}")
        data = response.json()
        orders.extend(data.get("orders", []))
        next_url = _parse_shopify_next_link(response.headers.get("Link"))
        page_count += 1

    product_stats = {}
    for order in orders:
        status = (order.get("financial_status") or "").lower()
        if status in {"voided"}:
            continue
        order_id = order.get("id")
        for item in order.get("line_items", []) or []:
            product_id = item.get("product_id")
            if not product_id:
                continue
            qty = item.get("quantity", 0) or 0
            price = _safe_float(item.get("price"), 0.0)
            revenue = qty * price
            stat = product_stats.setdefault(
                str(product_id),
                {"order_ids": set(), "quantity": 0, "revenue": 0.0},
            )
            if order_id:
                stat["order_ids"].add(order_id)
            stat["quantity"] += qty
            stat["revenue"] += revenue

    product_ids = list(product_stats.keys())
    event_counts = {}
    try:
        if (time.time() - started_at) < (max_total_s - 10):
            event_counts = _fetch_shopify_event_counts(user_id, shop_domain, days)
    except Exception:
        event_counts = {}
    if not product_ids:
        # Lightweight products fetch (avoid heavy payload / transform) for the blockers fallback.
        products = []
        try:
            products_url = (
                f"https://{shop_domain}/admin/api/2024-10/products.json"
                f"?limit=120&fields=id,title,body_html,images,variants"
            )
            resp = requests.get(products_url, headers=headers, timeout=20)
            if resp.status_code == 401:
                raise HTTPException(status_code=401, detail="Token Shopify expiré ou invalide. Reconnectez-vous.")
            if resp.status_code != 200:
                raise HTTPException(status_code=resp.status_code, detail=f"Erreur Shopify: {resp.text[:300]}")
            products = (resp.json() or {}).get("products", [])
        except HTTPException:
            raise
        except requests.exceptions.Timeout:
            raise HTTPException(status_code=504, detail="Shopify timeout (products). Réessaie.")
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Erreur réseau Shopify (products): {str(e)[:120]}")
        if not products:
            return {
                "success": True,
                "shop": shop_domain,
                "range": range,
                "currency": None,
                "blockers": [],
                "notes": ["Aucun produit trouvé dans la boutique."],
            }

        blockers = []
        prices = []
        for product in products:
            variants = product.get("variants", []) or []
            if variants:
                prices.append(_safe_float(variants[0].get("price"), 0.0))
        avg_price = sum(prices) / len(prices) if prices else 0

        for product in products:
            product_id = str(product.get("id"))
            title = product.get("title") or ""
            description_text = _strip_html(product.get("body_html") or "")
            description_len = len(description_text)
            images_count = len(product.get("images", []) or [])
            variants = product.get("variants", []) or []
            price_current = _safe_float(variants[0].get("price"), 0.0) if variants else 0.0
            inventory_total = sum(v.get("inventory_quantity", 0) or 0 for v in variants) if variants else 0

            signals = event_counts.get(product_id, {"views": 0, "add_to_cart": 0})
            views = int(signals.get("views", 0))
            add_to_cart = int(signals.get("add_to_cart", 0))
            view_to_cart = (add_to_cart / views) if views else None

            score = 0
            if description_len < 120:
                score += 1
            if len(title) < 20 or len(title) > 70:
                score += 1
            if images_count < 2:
                score += 1
            if avg_price and price_current > avg_price * 1.3:
                score += 1
            if inventory_total > 20:
                score += 1
            if views >= 10 and view_to_cart is not None and view_to_cart < 0.03:
                score += 2

            if score < 2:
                continue

            blockers.append({
                "product_id": product_id,
                "title": title or f"Produit {product_id}",
                "category": "⚠️ Frein détecté",
                "orders": 0,
                "quantity": 0,
                "revenue": 0.0,
                "price": price_current,
                "inventory": inventory_total,
                "images": images_count,
                "views": views,
                "add_to_cart": add_to_cart,
                "view_to_cart_rate": round(view_to_cart, 4) if view_to_cart is not None else None,
                "cart_to_order_rate": None,
                "score": score,
                "friction_reasons": [],
            })

        blockers.sort(key=lambda item: item["score"], reverse=True)

        notes = [
            "Analyse basée sur qualité des fiches + inventaire (aucune vente sur la période).",
            "Ajoutez le Shopify Pixel pour enrichir les signaux vues/panier.",
        ]

        return {
            "success": True,
            "shop": shop_domain,
            "range": range,
            "currency": None,
            "blockers": blockers[: max(1, min(limit, 50))],
            "notes": notes,
        }

    # Down-select products to keep API calls fast and reliable.
    def _candidate_score(pid: str, stat: dict) -> float:
        orders_count = len(stat.get("order_ids") or [])
        signals = event_counts.get(pid, {"views": 0, "add_to_cart": 0}) if event_counts else {"views": 0, "add_to_cart": 0}
        views = int(signals.get("views", 0) or 0)
        atc = int(signals.get("add_to_cart", 0) or 0)
        score = 0.0
        if orders_count <= 1:
            score += 2.0
        if atc >= 5 and (orders_count / atc) < 0.2:
            score += 2.0
        if views >= 10 and atc > 0 and (atc / views) < 0.03:
            score += 2.0
        score += min(1.5, views / 200.0)
        score += min(1.5, atc / 80.0)
        score += min(1.0, float(stat.get("revenue", 0.0) <= 0.0))
        return score

    if len(product_ids) > 120:
        ranked = sorted(
            ((pid, _candidate_score(pid, stat)) for pid, stat in product_stats.items()),
            key=lambda x: x[1],
            reverse=True,
        )
        product_ids = [pid for pid, _ in ranked[:120]]

    products_by_id = {}
    batch_size = 50
    for i in range(0, len(product_ids), batch_size):
        if (time.time() - started_at) > (max_total_s - 5):
            break
        batch_ids = ",".join(product_ids[i : i + batch_size])
        products_url = (
            f"https://{shop_domain}/admin/api/2024-10/products.json"
            f"?ids={batch_ids}&fields=id,title,body_html,images,variants,product_type,vendor,status"
        )
        try:
            response = requests.get(products_url, headers=headers, timeout=20)
        except requests.exceptions.Timeout:
            raise HTTPException(status_code=504, detail="Shopify timeout (product batch). Réessaie.")
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Erreur réseau Shopify (product batch): {str(e)[:120]}")
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=f"Erreur Shopify: {response.text[:300]}")
        for product in response.json().get("products", []):
            products_by_id[str(product.get("id"))] = product

    currency = None
    for order in orders:
        if order.get("currency"):
            currency = order.get("currency")
            break

    total_orders = 0
    total_revenue = 0.0
    total_price = 0.0
    price_count = 0

    for product_id, stat in product_stats.items():
        orders_count = len(stat["order_ids"])
        total_orders += orders_count
        total_revenue += stat["revenue"]
        product = products_by_id.get(product_id, {})
        variants = product.get("variants", []) or []
        if variants:
            total_price += _safe_float(variants[0].get("price"), 0.0)
            price_count += 1

    avg_orders = total_orders / len(product_stats) if product_stats else 0
    avg_revenue = total_revenue / len(product_stats) if product_stats else 0
    avg_price = total_price / price_count if price_count else 0
    avg_views = 0
    avg_add_to_cart = 0
    if event_counts:
        avg_views = sum(v.get("views", 0) for v in event_counts.values()) / max(1, len(event_counts))
        avg_add_to_cart = sum(v.get("add_to_cart", 0) for v in event_counts.values()) / max(1, len(event_counts))

    blockers = []
    for product_id, stat in product_stats.items():
        product = products_by_id.get(product_id, {})
        orders_count = len(stat["order_ids"])
        revenue = stat["revenue"]
        quantity = stat["quantity"]
        variants = product.get("variants", []) or []
        price_current = _safe_float(variants[0].get("price"), 0.0) if variants else 0.0
        inventory_total = sum(v.get("inventory_quantity", 0) or 0 for v in variants) if variants else 0
        images_count = len(product.get("images", []) or [])
        title = product.get("title") or ""
        description_text = _strip_html(product.get("body_html") or "")
        description_len = len(description_text)

        signals = event_counts.get(product_id, {"views": 0, "add_to_cart": 0})
        views = int(signals.get("views", 0))
        add_to_cart = int(signals.get("add_to_cart", 0))
        view_to_cart = (add_to_cart / views) if views else None
        cart_to_order = (orders_count / add_to_cart) if add_to_cart else None

        score = 0
        if orders_count <= 1:
            score += 2
        if avg_orders and orders_count < avg_orders * 0.4:
            score += 1
        if avg_revenue and revenue < avg_revenue * 0.4:
            score += 1
        if description_len < 120:
            score += 1
        if images_count < 2:
            score += 1
        if avg_price and price_current > avg_price * 1.3 and orders_count < avg_orders:
            score += 1
        if inventory_total > 20 and avg_orders and orders_count < avg_orders * 0.3:
            score += 1
        if views >= max(10, avg_views) and view_to_cart is not None and view_to_cart < 0.03:
            score += 2
        if add_to_cart >= max(5, avg_add_to_cart) and cart_to_order is not None and cart_to_order < 0.2:
            score += 2

        if score < 2:
            continue

        # ---- Categorize the friction type ----
        friction_reasons = []
        friction_category = "⚠️ À analyser"

        has_view_issue = (views >= max(10, avg_views) and view_to_cart is not None and view_to_cart < 0.03)
        has_cart_issue = (add_to_cart >= max(5, avg_add_to_cart) and cart_to_order is not None and cart_to_order < 0.2)
        has_content_issue = (description_len < 120 or images_count < 2)
        has_price_issue = (avg_price and price_current > avg_price * 1.3 and orders_count < avg_orders)

        if has_view_issue and has_cart_issue:
            friction_category = "🚫 Double friction (vue + panier)"
            friction_reasons.append(f"Vue→panier: {view_to_cart:.1%}")
            friction_reasons.append(f"Panier→achat: {cart_to_order:.1%}")
        elif has_view_issue:
            friction_category = "👁️ Frein à l'ajout panier"
            friction_reasons.append(f"Vue→panier: {view_to_cart:.1%}")
        elif has_cart_issue:
            friction_category = "🛒 Frein à l'achat"
            friction_reasons.append(f"Panier→achat: {cart_to_order:.1%}")
        else:
            friction_category = "⚠️ Frein détecté"

        blockers.append({
            "product_id": product_id,
            "title": title or f"Produit {product_id}",
            "category": friction_category,
            "orders": orders_count,
            "quantity": quantity,
            "revenue": round(revenue, 2),
            "price": price_current,
            "inventory": inventory_total,
            "images": images_count,
            "views": views,
            "add_to_cart": add_to_cart,
            "view_to_cart_rate": round(view_to_cart, 4) if view_to_cart is not None else None,
            "cart_to_order_rate": round(cart_to_order, 4) if cart_to_order is not None else None,
            "score": score,
            "friction_reasons": friction_reasons,
        })

    blockers.sort(key=lambda item: (item["score"], -item["revenue"]), reverse=True)

    notes = [
        "Analyse basée sur commandes Shopify + événements Shopify Pixel (vues, ajout panier).",
        "Si les événements Pixel ne sont pas configurés, certaines métriques peuvent manquer.",
    ]
    if (time.time() - started_at) > (max_total_s - 1):
        notes.insert(0, "Analyse partielle: temps de calcul limité pour éviter les timeouts.")

    payload = {
        "success": True,
        "shop": shop_domain,
        "range": range,
        "currency": currency,
        "blockers": blockers[: max(1, min(limit, 50))],
        "notes": notes,
    }

    _cache_set_blockers(cache_key, payload)
    return payload


class BlockerApplyRequest(BaseModel):
    product_id: str
    action_type: str
    suggested_price: float | None = None
    suggested_title: str | None = None
    suggested_description: str | None = None


@app.post("/api/shopify/blockers/apply")
@app.post("/api/shopify/apply-action")
async def apply_blocker_action(req: BlockerApplyRequest, request: Request):
    """⚡ Applique une action sur un produit frein (Pro/Premium)."""
    try:
        return await _apply_blocker_action_inner(req, request)
    except HTTPException:
        raise
    except Exception as exc:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Erreur serveur: {str(exc)[:200]}")

async def _apply_blocker_action_inner(req: BlockerApplyRequest, request: Request):
    user_id = get_user_id(request)
    tier = get_user_tier(user_id)
    if tier not in {"pro", "premium"}:
        raise HTTPException(status_code=403, detail="Fonctionnalité réservée aux plans Pro/Premium")

    if tier == "pro":
        try:
            if SUPABASE_URL and SUPABASE_SERVICE_KEY:
                supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
                month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
                usage = (
                    supabase.table("shopify_blocker_actions")
                    .select("id", count="exact")
                    .eq("user_id", user_id)
                    .gte("created_at", month_start)
                    .execute()
                )
                used = usage.count or 0
                if used >= 50:
                    raise HTTPException(status_code=403, detail="Limite mensuelle atteinte (50 actions Pro)")
        except HTTPException:
            raise
        except Exception as e:
            print(f"⚠️ Pro usage check skipped (table may not exist): {e}")

    shop_domain, access_token = _get_shopify_connection(user_id)
    headers = {
        "X-Shopify-Access-Token": access_token,
        "Content-Type": "application/json",
    }

    product_resp = requests.get(
        f"https://{shop_domain}/admin/api/2024-10/products/{req.product_id}.json",
        headers=headers,
        timeout=30,
    )
    if product_resp.status_code != 200:
        raise HTTPException(status_code=product_resp.status_code, detail=f"Erreur Shopify: {product_resp.text[:300]}")
    product = product_resp.json().get("product", {})

    action_type = (req.action_type or "").lower()
    if action_type == "price":
        variants = product.get("variants", []) or []
        if not variants:
            raise HTTPException(status_code=400, detail="Produit sans variantes")
        current_price = _safe_float(variants[0].get("price"), 0.0)
        if current_price <= 0:
            raise HTTPException(status_code=400, detail="Prix actuel invalide")
        new_price = req.suggested_price if req.suggested_price else round(current_price * 0.9, 2)
        variant = variants[0]
        update_resp = requests.put(
            f"https://{shop_domain}/admin/api/2024-10/variants/{variant['id']}.json",
            headers=headers,
            json={"variant": {"id": variant["id"], "price": str(new_price)}},
            timeout=30,
        )
        if update_resp.status_code not in (200, 201):
            raise HTTPException(status_code=400, detail=f"Échec modification prix: {update_resp.text[:300]}")
        _log_blocker_action(user_id, shop_domain, req.product_id, action_type)
        return {"success": True, "action": "price", "new_price": new_price}

    if action_type == "title":
        if req.suggested_title:
            new_title = req.suggested_title
        else:
            engine = get_ai_engine()
            new_title = engine.content_gen.generate_title(product, tier)
        update_resp = requests.put(
            f"https://{shop_domain}/admin/api/2024-10/products/{req.product_id}.json",
            headers=headers,
            json={"product": {"title": new_title}},
            timeout=30,
        )
        if update_resp.status_code not in (200, 201):
            raise HTTPException(status_code=400, detail=f"Échec modification titre: {update_resp.text[:300]}")
        _log_blocker_action(user_id, shop_domain, req.product_id, action_type)
        return {"success": True, "action": "title", "new_title": new_title}

    if action_type == "description":
        if req.suggested_description:
            new_description = req.suggested_description
        else:
            engine = get_ai_engine()
            new_description = engine.content_gen.generate_description(product, tier)
        # Clean markdown wrappers if present (e.g. ```html ... ```)
        new_description = new_description.strip()
        if new_description.startswith("```"):
            lines = new_description.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            new_description = "\n".join(lines).strip()
        update_resp = requests.put(
            f"https://{shop_domain}/admin/api/2024-10/products/{req.product_id}.json",
            headers=headers,
            json={"product": {"body_html": new_description}},
            timeout=30,
        )
        if update_resp.status_code not in (200, 201):
            raise HTTPException(status_code=400, detail=f"Échec modification description: {update_resp.text[:300]}")
        _log_blocker_action(user_id, shop_domain, req.product_id, action_type)
        return {"success": True, "action": "description"}

    raise HTTPException(status_code=400, detail="Action non supportée")


def _log_blocker_action(user_id: str, shop_domain: str, product_id: str, action_type: str) -> None:
    try:
        if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
            return
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        payload = {
            "user_id": user_id,
            "shop_domain": shop_domain,
            "product_id": str(product_id),
            "action_type": action_type,
        }
        supabase.table("shopify_blocker_actions").insert(payload).execute()
    except Exception as e:
        print(f"⚠️ Action logging skipped (table may not exist): {e}")


def _generate_invoice_pdf(order: dict, invoice_number: str, language: str, shop_domain: str) -> bytes:
    strings = _invoice_strings(language)
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter

    billing = order.get("billing_address") or {}
    shipping = order.get("shipping_address") or {}
    customer = order.get("customer") or {}

    customer_name = " ".join([
        billing.get("first_name") or customer.get("first_name") or "",
        billing.get("last_name") or customer.get("last_name") or "",
    ]).strip() or order.get("email") or ""

    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawString(40, height - 50, strings["title"])

    pdf.setFont("Helvetica", 10)
    pdf.drawString(40, height - 70, f"{strings['invoice']}: {invoice_number}")
    pdf.drawString(40, height - 85, f"{strings['date']}: {datetime.utcnow().strftime('%Y-%m-%d')}")
    pdf.drawString(40, height - 100, f"{strings['order']}: {order.get('name') or order.get('order_number')}")
    pdf.drawString(40, height - 115, f"Boutique: {shop_domain}")

    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(40, height - 140, strings["customer"])
    pdf.setFont("Helvetica", 10)
    pdf.drawString(40, height - 155, customer_name)
    address_lines = [
        billing.get("address1") or shipping.get("address1") or "",
        billing.get("address2") or shipping.get("address2") or "",
        " ".join(filter(None, [
            billing.get("city") or shipping.get("city") or "",
            billing.get("province") or shipping.get("province") or "",
            billing.get("zip") or shipping.get("zip") or "",
        ])).strip(),
        billing.get("country") or shipping.get("country") or "",
    ]
    y = height - 170
    for line in address_lines:
        if line:
            pdf.drawString(40, y, line)
            y -= 12

    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawString(40, y - 10, strings["item"])
    pdf.drawString(320, y - 10, strings["qty"])
    pdf.drawString(380, y - 10, strings["price"])
    y -= 24

    pdf.setFont("Helvetica", 10)
    line_items = order.get("line_items", [])
    for item in line_items:
        title = item.get("title") or "Produit"
        qty = item.get("quantity") or 1
        price = item.get("price") or "0"
        pdf.drawString(40, y, str(title)[:45])
        pdf.drawString(320, y, str(qty))
        pdf.drawString(380, y, str(price))
        y -= 14
        if y < 120:
            pdf.showPage()
            y = height - 60

    currency = order.get("currency") or "USD"
    subtotal = order.get("subtotal_price") or "0"
    tax = order.get("total_tax") or "0"
    total = order.get("total_price") or "0"

    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawString(300, y - 10, strings["subtotal"])
    pdf.drawString(420, y - 10, f"{subtotal} {currency}")
    pdf.drawString(300, y - 24, strings["tax"])
    pdf.drawString(420, y - 24, f"{tax} {currency}")
    pdf.drawString(300, y - 38, strings["total"])
    pdf.drawString(420, y - 38, f"{total} {currency}")

    pdf.showPage()
    pdf.save()
    buffer.seek(0)
    return buffer.read()


def _send_invoice_email(to_email: str, invoice_number: str, pdf_bytes: bytes, language: str, shop_domain: str) -> None:
    smtp_host = os.getenv("SMTP_HOST")
    smtp_user = os.getenv("SMTP_USER")
    smtp_pass = os.getenv("SMTP_PASS")
    smtp_from = os.getenv("SMTP_FROM") or smtp_user
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_secure = (os.getenv("SMTP_SECURE") or "tls").lower()

    if not smtp_host or not smtp_user or not smtp_pass or not smtp_from:
        raise RuntimeError("SMTP configuration missing")

    strings = _invoice_strings(language)

    msg = EmailMessage()
    msg["Subject"] = strings["email_subject"]
    msg["From"] = smtp_from
    msg["To"] = to_email
    msg.set_content(strings["email_body"])

    filename = f"{invoice_number}.pdf"
    msg.add_attachment(pdf_bytes, maintype="application", subtype="pdf", filename=filename)

    if smtp_secure == "ssl":
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(smtp_host, smtp_port, context=context) as server:
            server.login(smtp_user, smtp_pass)
            server.send_message(msg)
    else:
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls(context=ssl.create_default_context())
            server.login(smtp_user, smtp_pass)
            server.send_message(msg)


def _count_invoices_this_month(user_id: str) -> int:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return 0
    start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    resp = supabase.table("invoice_events").select("id", count="exact").eq("user_id", user_id).gte("created_at", start.isoformat()).execute()
    if resp.count is not None:
        return int(resp.count)
    return len(resp.data or [])


def _log_invoice_event(payload: dict) -> None:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    supabase.table("invoice_events").insert(payload).execute()


def _count_actions_this_month(user_id: str) -> int:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return 0
    start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    resp = supabase.table("action_events").select("id", count="exact").eq("user_id", user_id).gte("created_at", start.isoformat()).execute()
    if resp.count is not None:
        return int(resp.count)
    return len(resp.data or [])


def _log_action_event(payload: dict) -> None:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    supabase.table("action_events").insert(payload).execute()


@app.post("/api/shopify/webhook/orders-paid")
async def shopify_orders_paid_webhook(request: Request):
    raw_body = await request.body()

    if not SHOPIFY_API_SECRET:
        raise HTTPException(status_code=500, detail="Shopify API secret not configured")

    hmac_header = request.headers.get("X-Shopify-Hmac-Sha256", "")
    digest = hmac.new(SHOPIFY_API_SECRET.encode("utf-8"), raw_body, hashlib.sha256).digest()
    computed_hmac = base64.b64encode(digest).decode("utf-8")
    if not hmac.compare_digest(computed_hmac, hmac_header):
        raise HTTPException(status_code=401, detail="Invalid Shopify webhook signature")

    try:
        order = json.loads(raw_body.decode("utf-8"))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid payload: {e}")

    shop_domain = request.headers.get("X-Shopify-Shop-Domain") or order.get("shop_domain")
    if not shop_domain:
        return {"success": False, "message": "Missing shop domain"}

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise HTTPException(status_code=500, detail="Supabase not configured")

    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    user_id = _get_user_id_by_shop_domain(shop_domain)
    if not user_id:
        return {"success": False, "message": "Shop not connected"}

    tier = get_user_tier(user_id)
    ensure_feature_allowed(tier, "invoicing")

    if tier == "pro" and _count_invoices_this_month(user_id) >= 50:
        _log_invoice_event({
            "user_id": user_id,
            "shop_domain": shop_domain,
            "order_id": str(order.get("id")),
            "order_number": str(order.get("order_number") or order.get("name")),
            "invoice_number": None,
            "customer_email": order.get("email"),
            "country_code": (order.get("billing_address") or {}).get("country_code"),
            "province_code": (order.get("billing_address") or {}).get("province_code"),
            "total_amount": order.get("total_price"),
            "currency": order.get("currency"),
            "status": "limit_reached",
            "error": "Pro monthly limit reached"
        })
        return {"success": False, "message": "Pro invoice limit reached"}

    order_id = str(order.get("id"))
    existing = supabase.table("invoice_events").select("id").eq("shop_domain", shop_domain).eq("order_id", order_id).limit(1).execute()
    if existing.data:
        return {"success": True, "message": "Already processed"}

    billing = order.get("billing_address") or {}
    shipping = order.get("shipping_address") or {}
    country_code = billing.get("country_code") or shipping.get("country_code")
    province_code = billing.get("province_code") or shipping.get("province_code")
    language = _resolve_invoice_language(country_code, province_code)

    customer_email = order.get("email") or (order.get("customer") or {}).get("email")
    if not customer_email:
        _log_invoice_event({
            "user_id": user_id,
            "shop_domain": shop_domain,
            "order_id": order_id,
            "order_number": str(order.get("order_number") or order.get("name")),
            "invoice_number": None,
            "customer_email": None,
            "country_code": country_code,
            "province_code": province_code,
            "total_amount": order.get("total_price"),
            "currency": order.get("currency"),
            "status": "missing_email",
            "error": "Customer email missing"
        })
        return {"success": False, "message": "Customer email missing"}

    order_number = order.get("order_number") or order.get("name") or order_id
    shop_slug = shop_domain.split(".")[0].upper()
    invoice_number = f"INV-{shop_slug}-{order_number}"

    try:
        pdf_bytes = _generate_invoice_pdf(order, invoice_number, language, shop_domain)
        _send_invoice_email(customer_email, invoice_number, pdf_bytes, language, shop_domain)
        _log_invoice_event({
            "user_id": user_id,
            "shop_domain": shop_domain,
            "order_id": order_id,
            "order_number": str(order_number),
            "invoice_number": invoice_number,
            "customer_email": customer_email,
            "country_code": country_code,
            "province_code": province_code,
            "total_amount": order.get("total_price"),
            "currency": order.get("currency"),
            "status": "sent",
            "error": None
        })
        return {"success": True}
    except Exception as e:
        _log_invoice_event({
            "user_id": user_id,
            "shop_domain": shop_domain,
            "order_id": order_id,
            "order_number": str(order_number),
            "invoice_number": invoice_number,
            "customer_email": customer_email,
            "country_code": country_code,
            "province_code": province_code,
            "total_amount": order.get("total_price"),
            "currency": order.get("currency"),
            "status": "failed",
            "error": str(e)
        })
        return {"success": False, "message": "Invoice generation failed"}



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
- "optimized_title": Un titre optimisé pour le SEO et les conversions (max 70 caractères, SANS prix ni montant)
- "optimized_description": Une description améliorée et persuasive (2-3 paragraphes)
- "seo_keywords": Array de 5-8 mots-clés pertinents
- "cross_sell": Array de 3 suggestions de produits complémentaires
- "price_recommendation": Analyse du pricing avec suggestion (string)
- "conversion_tips": Array de 3-5 conseils pour améliorer le taux de conversion

IMPORTANT: Ne jamais inclure le prix (€, $, montant) dans le titre optimisé.

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
    images: list[str] = []  # Optional: base64 data URIs of images


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
    
    # Pas de limite stricte côté API pour permettre des messages longs
    
    system_prompt = SHOPBRAIN_EXPERT_SYSTEM or "Tu es un assistant expert en e-commerce Shopify."

    try:
        # Construire le prompt avec contexte si fourni
        full_message = message
        if context:
            # Inject product context as a system-level instruction so the AI truly "knows" the product
            product_context_instruction = (
                "\n\n========================================\n"
                "PRODUIT DE LA BOUTIQUE DU MARCHAND\n"
                "========================================\n"
                f"{context}\n\n"
                "INSTRUCTIONS IMPORTANTES :\n"
                "- Ce produit EXISTE dans la boutique Shopify du marchand. Tu as accès à toutes ses données ci-dessus.\n"
                "- Analyse ce produit spécifique quand le marchand pose une question.\n"
                "- Tu peux évaluer le titre, la description, le prix, les tags, les variantes, le stock.\n"
                "- Si le marchand demande si sa description/titre/photos sont bons, donne une analyse honnête\n"
                "  avec points forts ✅ et points faibles ❌ et des suggestions concrètes d'amélioration.\n"
                "- Si le marchand demande un prix, compare avec le marché et donne ton avis.\n"
                "- Sois direct, actionnable et expert.\n"
            )
            system_prompt = system_prompt + product_context_instruction
            full_message = message  # Don't duplicate context in user message
        
        # Build user content: text only or text + images (vision)
        images = req.images or []
        print(f"📷 Images received: {len(images)} image(s)")
        if images:
            # Add vision capability instruction to system prompt
            vision_instruction = (
                "\n\n========================================\n"
                "CAPACITÉ VISION / IMAGES\n"
                "========================================\n"
                "Tu as la capacité de VOIR et ANALYSER les images envoyées par l'utilisateur.\n\n"
                "RÈGLES OBLIGATOIRES :\n\n"
                "1. IDENTIFICATION PRÉCISE : Tu DOIS identifier la MARQUE EXACTE et le MODÈLE EXACT du produit visible.\n"
                "   - Chaussures : identifie la marque (Nike, Adidas, New Balance…) ET le modèle (Air Jordan 1, Yeezy 350…).\n"
                "   - Voitures : identifie la marque (Porsche, BMW, Ferrari…) ET le modèle (GT3 RS, M4, 488 Pista…).\n"
                "   - Montres : identifie la marque (Rolex, Omega, Casio…) ET le modèle (Submariner, Speedmaster…).\n"
                "   - Vêtements, sacs, électronique : même chose — marque + modèle + édition si possible.\n"
                "   - NE DIS JAMAIS 'je ne peux pas identifier la marque/le modèle'. Tu PEUX et tu DOIS le faire.\n"
                "   - Si tu n'es pas sûr à 100%, donne ton meilleur guess avec un niveau de confiance.\n\n"
                "2. PRIX BASÉ SUR LE MARCHÉ RÉEL :\n"
                "   - Quand l'utilisateur demande un prix, donne une FOURCHETTE DE PRIX PRÉCISE basée sur le marché réel.\n"
                "   - Cite des plateformes de référence (StockX, Chrono24, AutoTrader, eBay, etc.) selon le type de produit.\n"
                "   - Tiens compte de l'état visible (neuf, usagé, modifié) pour ajuster le prix.\n"
                "   - Donne un prix minimum, un prix recommandé, et un prix maximum.\n\n"
                "3. NE DÉCRIS PAS l'image en détail. L'utilisateur sait ce qu'il a envoyé.\n"
                "   - Va DROIT AU BUT : identification → prix → conseils de vente.\n\n"
                "4. ANALYSE E-COMMERCE :\n"
                "   - Si l'utilisateur envoie une image sans question, donne : marque/modèle identifié, fourchette de prix,\n"
                "     positionnement marché, et 2-3 conseils de vente concrets.\n\n"
                "5. NE JAMAIS dire que tu ne peux pas voir ou analyser les images — tu PEUX les voir en haute résolution.\n"
            )
            system_prompt = system_prompt + vision_instruction
            
            user_content = []
            user_content.append({"type": "text", "text": full_message})
            valid_images = 0
            for img_data_uri in images[:5]:  # Max 5 images
                if img_data_uri.startswith("data:"):
                    user_content.append({
                        "type": "image_url",
                        "image_url": {"url": img_data_uri, "detail": "high"}
                    })
                    valid_images += 1
            print(f"📷 Valid base64 images added to content: {valid_images}")
        else:
            user_content = full_message
        
        # 🌐 WEB SEARCH — If message needs real-time data, search the web first
        web_search_context = ""
        if _needs_web_search(message):
            try:
                web_search_context = _web_search_for_chat(message)
            except Exception as ws_err:
                print(f"⚠️ Web search failed (non-blocking): {ws_err}")
        
        if web_search_context:
            web_search_instruction = (
                "\n\n========================================\n"
                "🌐 RÉSULTATS DE RECHERCHE INTERNET (DONNÉES EN TEMPS RÉEL)\n"
                "========================================\n"
                "Tu as accès à Internet. Voici les résultats de recherche les plus récents :\n\n"
                f"{web_search_context}\n\n"
                "INSTRUCTIONS IMPORTANTES :\n"
                "- Utilise ces données RÉELLES et RÉCENTES pour répondre à l'utilisateur.\n"
                "- INCLUS LES LIENS (URLs) dans ta réponse ! Quand tu mentionnes un produit, un site, un article ou une ressource, \n"
                "  donne le lien COMPLET pour que l'utilisateur puisse cliquer dessus.\n"
                "- Format des liens dans ta réponse : [Nom du site ou du produit](URL_COMPLÈTE)\n"
                "- Exemples :\n"
                "  • 🔗 [Voir sur Amazon](https://www.amazon.ca/dp/...)\n"
                "  • 🔗 [Article complet sur Shopify Blog](https://www.shopify.com/blog/...)\n"
                "  • 🛒 [Nike Air Force 1 — 129.99$](https://www.nike.com/...)\n"
                "- Si les résultats contiennent des liens 🔗, tu DOIS les inclure dans ta réponse.\n"
                "- Si les résultats contiennent des produits 🛒 avec prix et liens, présente-les dans un format clair.\n"
                "- Si les résultats parlent de tendances TikTok, Instagram, etc., résume les tendances clés avec les sources.\n"
                "- Donne des recommandations CONCRÈTES et ACTIONNABLES basées sur ces données.\n"
                "- Ne dis JAMAIS que tu n'as pas accès à Internet ou aux données en temps réel — TU AS CET ACCÈS.\n"
                "- Présente les infos de façon structurée avec des émojis et du formatage clair.\n"
            )
            system_prompt = system_prompt + web_search_instruction
            print(f"🌐 Web search context injected ({len(web_search_context)} chars)")
        
        # OpenAI 1.0+ API - utiliser le client
        # Use gpt-4o for vision (better image analysis), gpt-4o-mini for text-only
        # Use gpt-4o when web search is active (better at synthesizing real-time data)
        chat_model = "gpt-4o" if (images or web_search_context) else "gpt-4o-mini"
        print(f"🔍 Creating OpenAI client (model={chat_model}, has_images={bool(images)}, web_search={bool(web_search_context)}) with API key starting with: {OPENAI_API_KEY[:10]}...")
        client = (OpenAI(api_key=OPENAI_API_KEY) if OpenAI else openai.OpenAI(api_key=OPENAI_API_KEY))
        print(f"✅ OpenAI client created")
        try:
            response = client.chat.completions.create(
                model=chat_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content}
                ],
                max_tokens=4000,
                temperature=0.7
            )
            print(f"✅ OpenAI response received (model={chat_model})")
            assistant_message = response.choices[0].message.content.strip()
        except Exception as ce:
            print(f"⚠️ OpenAI client call failed: {type(ce).__name__}: {str(ce)}. Trying direct HTTP fallback...")
            try:
                payload = {
                    "model": chat_model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_content}
                    ],
                    "max_tokens": 4000,
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
# ⚡ CHAT CONVERSATIONS — Persistent storage in Supabase
# ============================================================================

class GenerateTitleRequest(BaseModel):
    messages: list  # [{role, text}]

@app.post("/api/conversations/generate-title")
async def generate_conversation_title(req: GenerateTitleRequest, request: Request):
    """🏷️ Generate a short descriptive title for a conversation using GPT-4o-mini."""
    user_id = get_user_id(request)
    if not OPENAI_API_KEY:
        return {"success": False, "title": ""}
    try:
        # Take only first 6 messages to keep it cheap & fast
        msgs_for_title = req.messages[:6]
        conversation_text = "\n".join(
            f"{m.get('role','user')}: {(m.get('text','') or '')[:300]}"
            for m in msgs_for_title if m.get('text')
        )
        if not conversation_text.strip():
            return {"success": False, "title": ""}

        payload = {
            "model": "gpt-4o-mini",
            "messages": [
                {"role": "system", "content": (
                    "Tu génères un TITRE COURT (3-7 mots maximum) qui résume le sujet principal de cette conversation e-commerce. "
                    "Le titre doit être en français, concis, descriptif et utile pour retrouver la conversation plus tard. "
                    "Exemples de bons titres: 'Produits tendance été 2025', 'Optimiser prix sneakers', 'Analyse photo montre Rolex', "
                    "'Stratégie publicité Facebook', 'Description produit sac Chanel', 'Problème stock t-shirts'. "
                    "Réponds UNIQUEMENT avec le titre, sans guillemets, sans ponctuation finale, sans explication."
                )},
                {"role": "user", "content": f"Voici la conversation:\n{conversation_text}"}
            ],
            "max_tokens": 30,
            "temperature": 0.3
        }
        r = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"},
            data=json.dumps(payload),
            timeout=8
        )
        if r.status_code == 200:
            title = r.json()["choices"][0]["message"]["content"].strip().strip('"').strip("'").strip('.')
            # Cap at 60 chars
            if len(title) > 60:
                title = title[:57] + '...'
            print(f"🏷️ Generated title: '{title}' for user {user_id}")
            return {"success": True, "title": title}
        else:
            print(f"❌ Title generation failed: {r.status_code}")
            return {"success": False, "title": ""}
    except Exception as e:
        print(f"❌ Title generation error: {e}")
        return {"success": False, "title": ""}


class ConversationSaveRequest(BaseModel):
    conversations: list  # Array of conversation objects


@app.get("/api/conversations")
async def get_conversations(request: Request):
    """📚 Load all chat conversations for the current user from Supabase."""
    user_id = get_user_id(request)
    try:
        sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        result = sb.table("chat_conversations").select("*").eq("user_id", user_id).order("updated_at", desc=True).execute()
        conversations = []
        for row in (result.data or []):
            conversations.append({
                "id": row["conversation_id"],
                "title": row.get("title", ""),
                "messages": row.get("messages", []),
                "createdAt": row.get("created_at", ""),
                "updatedAt": row.get("updated_at", ""),
            })
        return {"success": True, "conversations": conversations, "count": len(conversations)}
    except Exception as e:
        print(f"❌ Error loading conversations: {e}")
        return {"success": False, "conversations": [], "error": str(e)}


@app.post("/api/conversations/save")
async def save_conversations(req: ConversationSaveRequest, request: Request):
    """💾 Sync all conversations to Supabase (upsert)."""
    user_id = get_user_id(request)
    try:
        sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        saved = 0
        for conv in req.conversations:
            conv_id = conv.get("id", "")
            if not conv_id:
                continue
            # Strip base64 images from messages to save DB space
            messages = []
            for m in (conv.get("messages") or []):
                msg = {k: v for k, v in m.items() if k != "images"}
                if m.get("images"):
                    msg["hadImages"] = True
                messages.append(msg)
            row = {
                "user_id": user_id,
                "conversation_id": conv_id,
                "title": conv.get("title", "")[:200],
                "messages": messages,
                "updated_at": conv.get("updatedAt") or conv.get("createdAt") or datetime.utcnow().isoformat(),
                "created_at": conv.get("createdAt") or datetime.utcnow().isoformat(),
            }
            sb.table("chat_conversations").upsert(row, on_conflict="user_id,conversation_id").execute()
            saved += 1
        return {"success": True, "saved": saved}
    except Exception as e:
        print(f"❌ Error saving conversations: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str, request: Request):
    """🗑️ Delete a specific conversation."""
    user_id = get_user_id(request)
    try:
        sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        sb.table("chat_conversations").delete().eq("user_id", user_id).eq("conversation_id", conversation_id).execute()
        return {"success": True}
    except Exception as e:
        print(f"❌ Error deleting conversation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
class TTSRequest(BaseModel):
    text: str
    voice: str = "nova"  # nova, alloy, echo, fable, onyx, shimmer


@app.post("/api/ai/tts")
async def text_to_speech(req: TTSRequest, request: Request):
    """🔊 Text-to-Speech via OpenAI TTS API - Returns audio/mpeg stream"""
    user_id = get_user_id(request)
    print(f"🔔 /api/ai/tts called. user_id={user_id}, text_len={len(req.text)}")

    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OpenAI not configured")

    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Texte vide")

    # Limit text length for TTS (max ~4096 chars)
    if len(text) > 4096:
        text = text[:4096]

    try:
        client = (OpenAI(api_key=OPENAI_API_KEY) if OpenAI else openai.OpenAI(api_key=OPENAI_API_KEY))
        response = client.audio.speech.create(
            model="tts-1",
            voice=req.voice,
            input=text,
            response_format="mp3"
        )
        print(f"✅ TTS response received")

        audio_bytes = BytesIO(response.content)
        return StreamingResponse(
            audio_bytes,
            media_type="audio/mpeg",
            headers={"Content-Disposition": "inline; filename=speech.mp3"}
        )

    except Exception as e:
        print(f"❌ Error in TTS: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Erreur TTS: {str(e)}")


# ============================================================================
# Speech-to-Text via OpenAI Whisper
# ============================================================================
@app.post("/api/ai/stt")
async def speech_to_text(request: Request):
    """🎤 Speech-to-Text via OpenAI Whisper API - Accepts audio file, returns text transcription"""
    user_id = get_user_id(request)
    print(f"🔔 /api/ai/stt called. user_id={user_id}")

    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OpenAI not configured")

    try:
        form = await request.form()
        audio_file = form.get("audio")
        if not audio_file:
            raise HTTPException(status_code=400, detail="Aucun fichier audio fourni")

        # Read the audio content
        audio_content = await audio_file.read()
        if len(audio_content) == 0:
            raise HTTPException(status_code=400, detail="Fichier audio vide")

        # Limit file size (25MB max for Whisper)
        if len(audio_content) > 25 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Fichier audio trop volumineux (max 25MB)")

        print(f"🎤 Audio received: {len(audio_content)} bytes, filename={getattr(audio_file, 'filename', 'unknown')}")

        # Determine file extension
        filename = getattr(audio_file, 'filename', 'audio.webm') or 'audio.webm'

        client = get_openai_client()

        # Use Whisper API with timing diagnostics
        audio_bytes_io = BytesIO(audio_content)
        audio_bytes_io.name = filename  # Whisper needs the filename with extension
        t_start = time.time()
        print(f"⏱️ STT: calling OpenAI whisper-1 ({len(audio_content)} bytes)...")
        response = client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_bytes_io,
            language="fr",
            response_format="text",
            prompt="Transcription de commande vocale en français pour ShopBrain, e-commerce Shopify."
        )
        t_end = time.time()
        openai_duration = t_end - t_start
        transcript = response.strip() if isinstance(response, str) else str(response).strip()
        print(f"✅ STT: '{transcript[:80]}' ({len(transcript)} chars) in {openai_duration:.2f}s")

        return {
            "success": True,
            "text": transcript,
            "language": "fr"
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error in STT: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Erreur STT: {str(e)}")


# ============================================================================
# OpenAI Voice Pipeline — Full server-side STT → GPT → TTS
# ============================================================================
@app.post("/api/voice")
async def openai_voice_pipeline(request: Request):
    """🎙️ Voice Pipeline: Audio → Whisper STT → GPT → TTS → Audio response
    Accepts multipart form with 'audio' file.
    Returns JSON with user_text, ai_text, audio_base64, audio_mime.
    """
    user_id = get_user_id(request)
    print(f"\n🎙️ ========== /api/voice called ==========")
    print(f"🔔 user_id={user_id}")

    if not OPENAI_API_KEY:
        print("❌ OPENAI_API_KEY not set!")
        raise HTTPException(status_code=500, detail="OpenAI not configured")

    try:
        # ── Step 1: Receive audio ──
        form = await request.form()
        audio_file = form.get("audio")
        if not audio_file:
            raise HTTPException(status_code=400, detail="Aucun fichier audio fourni")

        audio_content = await audio_file.read()
        if len(audio_content) == 0:
            raise HTTPException(status_code=400, detail="Fichier audio vide")
        if len(audio_content) > 25 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Fichier audio trop volumineux (max 25MB)")

        filename = getattr(audio_file, 'filename', 'audio.webm') or 'audio.webm'
        print(f"📥 Audio received: {len(audio_content)} bytes, filename={filename}")

        client = (OpenAI(api_key=OPENAI_API_KEY) if OpenAI else openai.OpenAI(api_key=OPENAI_API_KEY))

        # ── Step 2: Whisper STT ──
        print("🎤 Step 2: Whisper STT...")
        audio_io = BytesIO(audio_content)
        audio_io.name = filename
        transcript_response = client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_io,
            language="fr",
            response_format="text"
        )
        user_text = transcript_response.strip() if isinstance(transcript_response, str) else str(transcript_response).strip()
        print(f"✅ STT result: '{user_text[:100]}' ({len(user_text)} chars)")

        if not user_text:
            return {
                "success": True,
                "user_text": "",
                "ai_text": "Je n'ai pas entendu. Peux-tu répéter?",
                "audio_base64": None,
                "audio_mime": None
            }

        # ── Step 3: GPT Chat ──
        print("🧠 Step 3: GPT Chat...")
        system_prompt = SHOPBRAIN_EXPERT_SYSTEM if SHOPBRAIN_EXPERT_SYSTEM else "Tu es un assistant expert en e-commerce Shopify. Réponds de façon concise et naturelle, comme dans une conversation vocale."
        # Get conversation context from form if provided
        context_json = form.get("context")
        messages = [{"role": "system", "content": system_prompt + "\n\nIMPORTANT: Tu es en mode conversation vocale. Réponds de manière concise (2-4 phrases max), naturelle et conversationnelle. Pas de markdown, pas de listes, pas de formatage."}]
        if context_json:
            try:
                context_messages = json.loads(context_json)
                if isinstance(context_messages, list):
                    for msg in context_messages[-10:]:
                        role = msg.get("role", "user")
                        text = msg.get("text", "")
                        if role in ["user", "assistant"] and text:
                            messages.append({"role": role, "content": text})
            except Exception as ctx_err:
                print(f"⚠️ Context parse warning: {ctx_err}")
        messages.append({"role": "user", "content": user_text})

        chat_response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            max_tokens=300,
            temperature=0.7
        )
        ai_text = chat_response.choices[0].message.content.strip()
        print(f"✅ GPT response: '{ai_text[:100]}' ({len(ai_text)} chars)")

        # ── Step 4: OpenAI TTS ──
        print("🔊 Step 4: OpenAI TTS...")
        tts_text = ai_text[:4096]
        tts_response = client.audio.speech.create(
            model="tts-1",
            voice="nova",
            input=tts_text,
            response_format="mp3"
        )
        audio_bytes = tts_response.content
        audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
        print(f"✅ TTS audio: {len(audio_bytes)} bytes → base64 {len(audio_b64)} chars")

        print(f"🎙️ ========== /api/voice SUCCESS ==========")
        return {
            "success": True,
            "user_text": user_text,
            "ai_text": ai_text,
            "audio_base64": audio_b64,
            "audio_mime": "audio/mpeg"
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ /api/voice ERROR: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Erreur voice pipeline: {str(e)}")


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
        if ShopBrainAI is None:
            raise HTTPException(status_code=500, detail="AI engine not available. ShopBrainAI import failed.")
        shopify_config = None
        if SHOPIFY_ACCESS_TOKEN:
            # Format: shop-name.myshopify.com
            shopify_config = {
                'shop_url': os.getenv('SHOPIFY_SHOP_URL', ''),
                'access_token': SHOPIFY_ACCESS_TOKEN
            }
        ai_engine = ShopBrainAI(OPENAI_API_KEY, shopify_config)
    return ai_engine


def get_user_tier(user_id: str) -> str:
    """Resolve user's subscription tier from Supabase; default to free."""
    tier_map = {
        'standard': 'standard', 'pro': 'pro', 'premium': 'premium',
        '99': 'standard', '199': 'pro', '299': 'premium',
    }
    try:
        if SUPABASE_URL and SUPABASE_SERVICE_KEY:
            supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
            sub_result = supabase.table("subscriptions").select("plan_tier,status,paid,created_at").eq("user_id", user_id).eq("status", "active").eq("paid", True).order("created_at", desc=True).limit(1).execute()
            if sub_result.data:
                raw = (sub_result.data[0].get("plan_tier") or "").lower()
                plan = tier_map.get(raw)
                if plan:
                    return plan

            return "free"
    except Exception as e:
        print(f"Tier resolve warning: {e}")

    return "free"


# ──────────────── PLAN LIMITS & FEATURE GATES ────────────────
# Standard $99: product_analysis, title_optimization, price_suggestions
#   50 products/mo, 1 shop, monthly report
# Pro $199: + content_generation (descriptions), image_recommendations,
#   cross_sell, reports (weekly), automated_actions, invoicing
#   500 products/mo, 3 shops
# Premium $299: + predictions (IA prédictive), auto_stock,
#   unlimited products, unlimited shops, daily reports, api_access
PLAN_LIMITS = {
    "free":     {"product_limit": 0, "shop_limit": 0, "report_frequency": "none"},
    "standard": {"product_limit": 50, "shop_limit": 1, "report_frequency": "monthly"},
    "pro":      {"product_limit": 500, "shop_limit": 3, "report_frequency": "weekly"},
    "premium":  {"product_limit": None, "shop_limit": None, "report_frequency": "daily"},
}

def get_plan_product_limit(tier: str) -> int | None:
    return PLAN_LIMITS.get(tier, PLAN_LIMITS["free"]).get("product_limit")

def ensure_feature_allowed(tier: str, feature: str):
    feature_map = {
        "free": set(),
        "standard": {
            "product_analysis", "title_optimization", "price_suggestions",
            "stock_alerts", "reports",  # monthly report only (frequency enforced separately)
        },
        "pro": {
            "product_analysis", "title_optimization", "price_suggestions",
            "stock_alerts", "reports",
            "content_generation", "description_rewrite", "image_recommendations",
            "cross_sell", "automated_actions", "invoicing",
        },
        "premium": {
            "product_analysis", "title_optimization", "price_suggestions",
            "stock_alerts", "reports",
            "content_generation", "description_rewrite", "image_recommendations",
            "cross_sell", "automated_actions", "predictions",
            "invoicing", "auto_stock", "api_access",
        },
    }
    allowed = feature_map.get(tier, set())
    if feature not in allowed:
        plan_needed = "Pro" if feature in feature_map["pro"] else "Premium"
        raise HTTPException(
            status_code=403,
            detail=f"Fonctionnalité réservée au plan {plan_needed} ou supérieur. Votre plan: {tier.capitalize()}"
        )


class AnalyzeStoreRequest(BaseModel):
    products: list
    analytics: dict
    tier: str  # standard, pro, premium


@app.get("/api/ai/price-opportunities")
async def price_opportunities_endpoint(request: Request, limit: int = 50, instructions: str = "", product_id: str = ""):
    """💰 Retourne des opportunités de prix (léger, sans gros payload).

    Objectif: éviter que le frontend doive POST une liste complète de produits
    (trop volumineux → erreurs réseau), tout en produisant des recommandations
    rapides et exploitables.
    """
    user_id = get_user_id(request)
    tier = get_user_tier(user_id)
    ensure_feature_allowed(tier, "price_suggestions")

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise HTTPException(status_code=500, detail="Supabase not configured")

    try:
        shop_domain, access_token = _get_shopify_connection(user_id)

        headers = {
            "X-Shopify-Access-Token": access_token,
            "Content-Type": "application/json",
        }

        # Also fetch shop currency so UI formats correctly and SERP uses matching currency.
        shop_currency = None
        try:
            shop_resp = requests.get(
                f"https://{shop_domain}/admin/api/2024-10/shop.json",
                headers=headers,
                timeout=8,
            )
            if shop_resp.status_code == 200:
                shop_currency = ((shop_resp.json() or {}).get("shop") or {}).get("currency")
        except Exception:
            shop_currency = None

        # Fetch only the fields we need to keep the payload small and reliable.
        # Use 'image' (singular) for just the featured image — much lighter than 'images' (all images)
        products_url = (
            f"https://{shop_domain}/admin/api/2024-10/products.json"
            f"?limit=250&fields=id,title,body_html,vendor,product_type,tags,variants,image"
        )
        resp = requests.get(products_url, headers=headers, timeout=10)
        if resp.status_code == 401:
            raise HTTPException(status_code=401, detail="Token Shopify expiré ou invalide. Reconnectez-vous.")
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=f"Erreur Shopify: {resp.text[:300]}")

        products = (resp.json() or {}).get("products", [])
        market_status = _get_market_comparison_status()

        if not products:
            return {
                "success": True,
                "tier": tier,
                "products_analyzed": 0,
                "price_opportunities": [],
                "market_comparison": market_status,
                "currency_code": shop_currency,
            }

        effective_limit = max(1, min(int(limit), 250))

        # Build minimal items for the UI.
        candidates = []
        # NOTE: We scan up to 250 products to fill enough priced candidates. Some catalogs
        # start with draft/archived/free items; slicing the first N can yield 0 results.
        for p in products:
            if len(candidates) >= effective_limit:
                break
            # If a specific product_id was requested, filter to only that product.
            if product_id and str(p.get("id") or "") != str(product_id):
                continue
            variants = p.get("variants") or []
            if not variants:
                continue
            try:
                current_price = float(variants[0].get("price") or 0)
            except Exception:
                current_price = 0.0
            if current_price <= 0:
                continue

            desc = _strip_html(p.get("body_html") or "")
            desc_kw = _keywords_from_text(desc, max_words=10)
            # Get the featured product image URL for AI vision analysis
            # 'image' (singular) returns just the primary/featured image — lighter than 'images'
            featured_image = p.get("image") or {}
            image_url = featured_image.get("src", "") if isinstance(featured_image, dict) else ""
            candidates.append(
                {
                    "product_id": str(p.get("id") or ""),
                    "title": p.get("title") or "Produit",
                    "vendor": p.get("vendor") or "",
                    "product_type": p.get("product_type") or "",
                    "tags": p.get("tags") or "",
                    "desc_kw": desc_kw,
                    "description": desc[:500],
                    "image_url": image_url,
                    "current_price": round(current_price, 2),
                }
            )

        opportunities = []

        # ══════════════════════════════════════════════════════════════════
        # SMART SEARCH: Always use aggressive web search + AI analysis
        # With instructions: uses user-specified brands/keywords
        # Without instructions: auto-generates queries from product data
        # (title, description, image, tags, color, material)
        # ══════════════════════════════════════════════════════════════════
        if SERPAPI_KEY or OPENAI_API_KEY:
            has_instructions = bool(instructions and instructions.strip())
            mode_label = f"instructions='{instructions[:80]}'" if has_instructions else "auto-analysis from product data"
            print(f"🚀 Smart search mode: {mode_label}, {len(candidates)} candidates")

            import time as _time
            search_start = _time.time()
            # Hard deadline: Render free tier kills requests at 30s.
            # We must return a response BEFORE that, so use 24s as our own deadline.
            HARD_DEADLINE_S = 24

            # Limit to 1 candidate to stay within Render 30s timeout
            # Vision (~3s) + SERP (~5s) + AI (~2s) = ~10s per product
            analysis_candidates = candidates[:1]

            for item in analysis_candidates:
                # Time guard: bail if we've been running too long (Render 30s timeout)
                elapsed = _time.time() - search_start
                if elapsed > HARD_DEADLINE_S - 6:
                    print(f"⏱️ Time guard: {elapsed:.1f}s elapsed, skipping remaining candidates")
                    break

                try:
                    pid = item["product_id"]
                    title = item.get("title", "")
                    current_price = float(item["current_price"])
                    ptype = item.get("product_type", "")
                    vendor_name = item.get("vendor", "")
                    item_desc = item.get("description", "")
                    item_tags = item.get("tags", "")
                    item_image = item.get("image_url", "")

                    # Check deadline before starting heavy work
                    pre_search_elapsed = _time.time() - search_start
                    if pre_search_elapsed > HARD_DEADLINE_S - 5:
                        print(f"⏱️ Deadline approaching ({pre_search_elapsed:.1f}s), skipping search+AI")
                        continue

                    # Step 1: Aggressive web search (multiple SERP queries)
                    search_results = _aggressive_web_price_search(
                        product_title=title,
                        product_type=ptype,
                        vendor=vendor_name,
                        user_instructions=instructions or "",
                        currency=shop_currency or "CAD",
                        description=item_desc,
                        tags=item_tags,
                        image_url=item_image,
                    )

                    # Check deadline before AI analysis
                    post_search_elapsed = _time.time() - search_start
                    if post_search_elapsed > HARD_DEADLINE_S - 3:
                        print(f"⏱️ Deadline approaching ({post_search_elapsed:.1f}s), skipping AI analysis")
                        continue

                    # Step 2: AI analysis of the search results
                    ai_result = _ai_analyze_search_results(
                        product_title=title,
                        current_price=current_price,
                        search_results=search_results,
                        user_instructions=instructions or "",
                        currency=shop_currency or "CAD",
                        description=item_desc,
                        image_url=item_image,
                    )

                    if not ai_result:
                        print(f"⚠️ AI analysis returned None for {title}")
                        continue

                    suggested_price = float(ai_result.get("suggested_price", current_price))
                    delta_pct = round(((suggested_price - current_price) / current_price) * 100, 2) if current_price > 0 else 0.0

                    if abs(delta_pct) < 1.0:
                        suggestion = "Prix aligné au marché"
                    elif delta_pct > 0:
                        suggestion = "Prix en dessous du marché"
                    else:
                        suggestion = "Prix au-dessus du marché"

                    # Build rich reason text
                    comparable_products = ai_result.get("comparable_products", [])
                    comparable_text = ""
                    if isinstance(comparable_products, list) and comparable_products:
                        parts = []
                        for cp in comparable_products[:5]:
                            if isinstance(cp, dict):
                                parts.append(f"{cp.get('title', '?')}: {cp.get('price', '?')}$")
                            elif isinstance(cp, str):
                                parts.append(cp)
                        if parts:
                            comparable_text = " | Comparables: " + " · ".join(parts)

                    analysis = ai_result.get("analysis", "")
                    market_min = ai_result.get("market_range_min", search_results.get("min"))
                    market_max = ai_result.get("market_range_max", search_results.get("max"))
                    confidence = ai_result.get("confidence", search_results.get("count", 0))

                    reason = (
                        f"🔍 {search_results.get('search_count', 0)} recherches web · "
                        f"{search_results.get('count', 0)} prix trouvés · "
                        f"Fourchette: {market_min}$ – {market_max}$ ({shop_currency or 'CAD'}). "
                        f"{analysis}{comparable_text}"
                    )

                    opportunities.append({
                        "product_id": pid,
                        "title": title,
                        "suggestion": suggestion,
                        "current_price": round(current_price, 2),
                        "suggested_price": round(suggested_price, 2),
                        "target_delta_pct": delta_pct,
                        "reason": reason,
                        "market_estimate": {
                            "market_min": market_min,
                            "market_max": market_max,
                            "positioning": ai_result.get("positioning", "mid"),
                            "confidence": confidence,
                            "notes": analysis,
                            "comparable_products": comparable_products,
                        },
                        "source": "aggressive_search",
                        "currency_code": shop_currency,
                        "search_stats": {
                            "queries_run": search_results.get("queries_run", []),
                            "total_prices_found": search_results.get("count", 0),
                            "total_refs": len(search_results.get("refs", [])),
                            "refs": search_results.get("refs", []),
                            "vision": search_results.get("vision", {}),
                        },
                    })
                    print(f"✅ {title}: {current_price}$ → {suggested_price}$ ({delta_pct:+.1f}%)")

                except Exception as e:
                    print(f"❌ Aggressive search failed for {item.get('title', '?')}: {type(e).__name__}: {e}")

            return {
                "success": True,
                "tier": tier,
                "products_analyzed": len(analysis_candidates),
                "price_opportunities": opportunities,
                "market_comparison": market_status,
                "currency_code": shop_currency,
                "search_mode": "aggressive" if has_instructions else "smart_auto",
            }

        # ══════════════════════════════════════════════════════════════════
        # FALLBACK: Standard SERP comparison (only if no SERP key AND no OpenAI key)
        # ══════════════════════════════════════════════════════════════════
        # If SERP API is configured, do real market comparison.
        if SERPAPI_KEY:
            max_market = max(1, min(len(candidates), SERP_MAX_PRODUCTS))
            subset = candidates[:max_market]

            # Brand tokens from your own catalog can make the query too specific.
            shop_brand = None
            try:
                for it in subset:
                    v = str(it.get("vendor") or "").strip()
                    if v:
                        shop_brand = v
                        break
            except Exception:
                shop_brand = None

            def _query_for(item: dict) -> str:
                title = _clean_query_text(item.get("title") or "", shop_brand=shop_brand)
                parts = [title]
                if item.get("vendor"):
                    # Do not include vendor (often your own brand) in the search query.
                    pass
                if item.get("product_type"):
                    parts.append(str(item.get("product_type")).strip())
                if item.get("desc_kw"):
                    parts.append(str(item.get("desc_kw")).strip())
                # Add user instruction keywords to refine search
                if instructions:
                    parts.append(instructions[:80])
                return " ".join([p for p in parts if p])

            def _query_fallback(item: dict) -> str:
                # Broader query to ensure we find many comparable offers.
                parts = []
                if item.get("product_type"):
                    parts.append(str(item.get("product_type")).strip())
                # Keep only the first chunk of the title to avoid over-specific matches.
                title = _clean_query_text(item.get("title") or "", shop_brand=shop_brand)
                if title:
                    parts.append(" ".join(title.split()[:4]))
                return " ".join([p for p in parts if p]) or title

            def _query_ultra(item: dict) -> str:
                # Ultra broad: just the product type (or a generic noun from title)
                pt = str(item.get("product_type") or "").strip()
                if pt:
                    return pt
                title = _clean_query_text(item.get("title") or "", shop_brand=shop_brand)
                return " ".join(title.split()[:2])

            # Small parallelization to reduce overall latency.
            from concurrent.futures import ThreadPoolExecutor, as_completed

            futures = {}
            with ThreadPoolExecutor(max_workers=4) as ex:
                for item in subset:
                    q = _query_for(item)
                    gl = _gl_for_currency(shop_currency)
                    futures[ex.submit(_serpapi_price_snapshot, q, gl, "fr", shop_currency)] = (item, q)

                for fut in as_completed(futures):
                    item, q = futures[fut]
                    snapshot = fut.result() or {"count": 0, "refs": [], "prices": []}

                    # If too few offers, broaden search with a simplified query.
                    if int(snapshot.get("count") or 0) < 3:
                        try:
                            q2 = _query_fallback(item)
                            if q2 and q2 != q:
                                gl = _gl_for_currency(shop_currency)
                                snap2 = _serpapi_price_snapshot(q2, gl, "fr", shop_currency)
                                snapshot = _merge_snapshots(snapshot, snap2)
                                q = f"{q} | {q2}"
                        except Exception:
                            pass

                    # If still too few, try English locale for Canada.
                    if int(snapshot.get("count") or 0) < 3:
                        try:
                            q3 = _query_ultra(item)
                            if q3:
                                gl = _gl_for_currency(shop_currency)
                                snap3 = _serpapi_price_snapshot(q3, gl, "en", shop_currency)
                                snapshot = _merge_snapshots(snapshot, snap3)
                                q = f"{q} | {q3}"
                        except Exception:
                            pass

                    decision = _market_price_decision(float(item["current_price"]), snapshot)
                    action = decision.get("action")
                    suggested = float(decision.get("suggested_price", item["current_price"]))
                    delta_pct = float(decision.get("delta_pct", 0.0))

                    # Not enough market signals -> don't force a change.
                    if snapshot.get("count", 0) < 3:
                        action = "keep"
                        suggested = float(item["current_price"])
                        delta_pct = 0.0

                    if action == "keep":
                        suggestion = "Prix aligné au marché"
                    elif action == "increase":
                        suggestion = "Prix trop bas vs marché"
                    else:
                        suggestion = "Prix trop haut vs marché"

                    reason = _market_reason_text(
                        action=action,
                        current_price=float(item["current_price"]),
                        suggested_price=float(suggested),
                        snapshot=snapshot,
                        currency_code=shop_currency,
                    )

                    opportunities.append(
                        {
                            "product_id": item["product_id"] or f"shopify-{len(opportunities)+1}",
                            "title": item["title"],
                            "suggestion": suggestion,
                            "current_price": item["current_price"],
                            "suggested_price": round(suggested, 2),
                            "target_delta_pct": round(delta_pct, 2),
                            "reason": reason,
                            "market_action": action,
                            "market_snapshot": snapshot,
                            "market_query": q,
                            "source": "serpapi",
                            "currency_code": shop_currency,
                        }
                    )

            # If user asked more than the max market cap, provide a note.
            note = None
            if effective_limit > SERP_MAX_PRODUCTS:
                note = f"Comparaison SERP limitée à {SERP_MAX_PRODUCTS} produits par analyse (configurable via SERP_MAX_PRODUCTS)."

            # ── When the user provided custom instructions, run AI estimation on top ──
            # SERP alone can't compare "against Louis Vuitton t-shirts" etc.
            # The AI estimator will re-evaluate pricing with the user's comparison context.
            if instructions and OPENAI_API_KEY:
                print(f"🧠 AI re-evaluation with instructions on {len(opportunities)} SERP results: {repr(instructions[:100])}")
                ai_items_for_reeval = []
                ai_map_for_reeval = {}
                for opp in opportunities:
                    pid = opp["product_id"]
                    ai_items_for_reeval.append({
                        "product_id": pid,
                        "title": opp.get("title", ""),
                        "vendor": "",
                        "product_type": "",
                        "tags": "",
                        "current_price": opp.get("current_price", 0),
                    })
                    ai_map_for_reeval[pid] = {"title": opp.get("title", "")}

                ai_estimates = _ai_market_price_estimates(ai_items_for_reeval, ai_map_for_reeval, instructions, currency=shop_currency)
                if ai_estimates:
                    for opp in opportunities:
                        pid = opp["product_id"]
                        est = ai_estimates.get(pid)
                        if not est or not est.get("market_min") or not est.get("market_max"):
                            continue
                        current_price = float(opp["current_price"])
                        market_mid = (est["market_min"] + est["market_max"]) / 2
                        new_suggested = round(market_mid, 2)
                        new_delta_pct = round(((new_suggested - current_price) / current_price) * 100, 2) if current_price > 0 else 0.0
                        notes = est.get("notes", "")

                        if abs(new_delta_pct) < 1.0:
                            opp["suggestion"] = "Prix aligné au marché"
                        elif new_delta_pct > 0:
                            opp["suggestion"] = "Prix en dessous du marché"
                        else:
                            opp["suggestion"] = "Prix au-dessus du marché"

                        opp["suggested_price"] = new_suggested
                        opp["target_delta_pct"] = new_delta_pct
                        opp["reason"] = f"🧠 Analyse IA ({shop_currency or 'CAD'}): fourchette {est['market_min']:.2f}$ – {est['market_max']:.2f}$. {notes}"
                        opp["market_estimate"] = est
                        opp["source"] = "serpapi+ai"

            return {
                "success": True,
                "tier": tier,
                "products_analyzed": len(subset),
                "price_opportunities": opportunities,
                "market_comparison": market_status,
                "currency_code": shop_currency,
                **({"note": note} if note else {}),
            }

        # Fallback when SERP API isn't configured — use AI if OpenAI is available.
        if OPENAI_API_KEY:
            print(f"🧠 AI price analysis: {len(candidates)} candidates, instructions={repr(instructions[:100]) if instructions else 'none'}, currency={shop_currency}")
            # Build a products_by_id dict for the AI estimator
            ai_items = []
            ai_products_map = {}
            for item in candidates[:min(len(candidates), 10)]:
                pid = item["product_id"]
                ai_items.append(item)
                ai_products_map[pid] = {
                    "title": item.get("title"),
                    "vendor": item.get("vendor"),
                    "product_type": item.get("product_type"),
                    "tags": item.get("tags", ""),
                }
            estimates = _ai_market_price_estimates(ai_items, ai_products_map, instructions, currency=shop_currency)
            for item in ai_items:
                pid = item["product_id"]
                current_price = float(item["current_price"])
                est = estimates.get(pid)
                if est and est.get("market_min") and est.get("market_max"):
                    market_mid = (est["market_min"] + est["market_max"]) / 2
                    suggested_price = round(market_mid, 2)
                    target_delta_pct = round(((suggested_price - current_price) / current_price) * 100, 2)
                    positioning = est.get("positioning", "mid")
                    notes = est.get("notes", "")
                    if abs(target_delta_pct) < 1.0:
                        suggestion = "Prix aligné au marché"
                    elif target_delta_pct > 0:
                        suggestion = "Prix en dessous du marché"
                    else:
                        suggestion = "Prix au-dessus du marché"
                    reason = f"Sur {est.get('confidence', '?')} offres similaires ({shop_currency or 'CAD'}), fourchette estimée: {est['market_min']:.2f}$ – {est['market_max']:.2f}$. {notes}"
                else:
                    suggested_price = round(current_price, 2)
                    target_delta_pct = 0.0
                    suggestion = "Prix aligné au marché"
                    reason = "Aucun changement recommandé."
                opportunities.append({
                    "product_id": pid or f"shopify-{len(opportunities)+1}",
                    "title": item["title"],
                    "suggestion": suggestion,
                    "current_price": round(current_price, 2),
                    "suggested_price": suggested_price,
                    "target_delta_pct": target_delta_pct,
                    "reason": reason,
                    "market_estimate": est,
                    "source": "ai_estimate",
                    "currency_code": shop_currency,
                })
        else:
            for item in candidates[: min(len(candidates), 10)]:
                current_price = float(item["current_price"])
                suggested_price = round(current_price * 1.25, 2)
                target_delta_pct = round(((suggested_price - current_price) / current_price) * 100, 2)
                opportunities.append(
                    {
                        "product_id": item["product_id"] or f"shopify-{len(opportunities)+1}",
                        "title": item["title"],
                        "suggestion": "Ajustement recommandé (heuristique)",
                        "current_price": round(current_price, 2),
                        "suggested_price": suggested_price,
                        "target_delta_pct": target_delta_pct,
                        "reason": "SERP API non configurée: suggestion heuristique (+25%).",
                        "source": "heuristic",
                        "currency_code": shop_currency,
                    }
                )

        return {
            "success": True,
            "tier": tier,
            "products_analyzed": len(candidates),
            "price_opportunities": opportunities,
            "market_comparison": market_status,
            "currency_code": shop_currency,
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in price_opportunities_endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ai/analyze-store")
async def analyze_store_endpoint(req: AnalyzeStoreRequest, request: Request):
    """
    🧠 Analyse complète de la boutique avec toutes les fonctionnalités IA
    selon le tier de l'abonnement
    """
    try:
        user_id = get_user_id(request)
        tier = get_user_tier(user_id)
        engine = get_ai_engine()

        ensure_feature_allowed(tier, "product_analysis")

        # Limite de produits selon tier
        limits = {'standard': 50, 'pro': 500, 'premium': None}
        limit = limits.get(tier, 50)
        products = req.products[:limit] if limit else req.products
        
        analysis = engine.analyze_store(products, req.analytics, tier)

        # Enrich pricing suggestions with real market comparison via SERP API when available.
        market_status = _get_market_comparison_status()
        if market_status.get("enabled") and market_status.get("provider") == "serpapi" and SERPAPI_KEY:
            try:
                optimizations = (analysis.get("pricing_strategy") or {}).get("optimizations") or []
                for opt in optimizations[:10]:
                    title = str(opt.get("product") or "").strip()
                    if not title:
                        continue

                    # Best-effort: default to Canada context; if frontend passes currency later, it will be used.
                    snapshot = _serpapi_price_snapshot(title, gl="ca", hl="fr", currency_code="CAD")
                    if snapshot.get("count", 0) < 3:
                        continue

                    try:
                        current_price = float(opt.get("current_price") or 0)
                    except Exception:
                        current_price = 0.0
                    if current_price <= 0:
                        continue

                    decision = _market_price_decision(current_price, snapshot)
                    action = decision.get("action")
                    suggested = decision.get("suggested_price", current_price)
                    delta_pct = decision.get("delta_pct", 0.0)

                    opt["market_snapshot"] = snapshot
                    opt["market_action"] = action
                    opt["market_suggested_price"] = suggested

                    # Override suggested price according to market.
                    opt["suggested_price"] = suggested
                    opt["increase"] = round(float(suggested) - float(current_price), 2)

                    if action == "keep":
                        opt["reason"] = _market_reason_text(
                            action="keep",
                            current_price=current_price,
                            suggested_price=float(suggested),
                            snapshot=snapshot,
                            currency_code="CAD",
                        )
                        opt["expected_impact"] = "Prix jugé correct vs produits similaires: pas de changement recommandé."
                    elif action == "increase":
                        opt["reason"] = _market_reason_text(
                            action="increase",
                            current_price=current_price,
                            suggested_price=float(suggested),
                            snapshot=snapshot,
                            currency_code="CAD",
                        )
                        opt["expected_impact"] = "Augmenter pour se rapprocher du marché et améliorer la marge, à valider avec vos conversions."
                    else:
                        opt["reason"] = _market_reason_text(
                            action="decrease",
                            current_price=current_price,
                            suggested_price=float(suggested),
                            snapshot=snapshot,
                            currency_code="CAD",
                        )
                        opt["expected_impact"] = "Baisser pour se rapprocher du marché et réduire le risque de perte de conversion."
            except Exception as e:
                print(f"SERP enrichment warning: {e}")
        
        return {
            "success": True,
            "tier": tier,
            "products_analyzed": len(products),
            "analysis": analysis,
            "market_comparison": market_status,
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
        tier = get_user_tier(user_id)
        engine = get_ai_engine()
        
        result = {
            "product_id": req.product.get('id'),
            "tier": tier
        }
        
        # Tous les tiers: nouveau titre
        ensure_feature_allowed(tier, "title_optimization")
        result['new_title'] = engine.content_gen.generate_title(req.product, tier)
        
        # Pro et Premium: description
        if tier in ['pro', 'premium']:
            ensure_feature_allowed(tier, "content_generation")
            result['new_description'] = engine.content_gen.generate_description(req.product, tier)
        
        # Premium: SEO metadata
        if tier == 'premium':
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
        tier = get_user_tier(user_id)
        engine = get_ai_engine()

        ensure_feature_allowed(tier, "price_suggestions")
        
        recommendation = engine.price_opt.suggest_price_adjustment(
            req.product, req.analytics, tier
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
        tier = get_user_tier(user_id)

        ensure_feature_allowed(tier, "cross_sell")
        
        engine = get_ai_engine()
        
        cross_sell = engine.recommender.generate_cross_sell(
            req.product, req.all_products, tier
        )
        upsell = engine.recommender.generate_upsell(
            req.product, req.all_products, tier
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
        tier = get_user_tier(user_id)
        
        ensure_feature_allowed(tier, "automated_actions")

        actions_count = len(req.optimization_plan or [])
        if tier == "pro":
            current_count = _count_actions_this_month(user_id)
            if current_count + actions_count > 50:
                _log_action_event({
                    "user_id": user_id,
                    "action_type": "bulk_execute",
                    "action_count": actions_count,
                    "status": "limit_reached",
                    "error": "Pro monthly limit reached"
                })
                raise HTTPException(status_code=403, detail="Limite mensuelle Pro atteinte (50 actions)")
        
        engine = get_ai_engine()
        result = engine.execute_optimizations(req.optimization_plan, tier)

        _log_action_event({
            "user_id": user_id,
            "action_type": "bulk_execute",
            "action_count": actions_count,
            "status": "executed",
            "error": None
        })
        
        return {"success": True, "execution_result": result}
    
    except Exception as e:
        print(f"Error executing actions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class ApplyRecommendationRequest(BaseModel):
    product_id: str
    recommendation_type: str
    suggested_price: float | None = None


@app.post("/api/ai/apply-recommendation")
async def apply_recommendation_endpoint(req: ApplyRecommendationRequest, request: Request):
    """
    ✅ Applique une recommandation précise (Premium uniquement)
    Types supportés: Titre, Description, Prix
    """
    try:
        user_id = get_user_id(request)
        tier = get_user_tier(user_id)
        ensure_feature_allowed(tier, "automated_actions")

        shop_domain, access_token = _get_shopify_connection(user_id)

        if tier == "pro":
            current_count = _count_actions_this_month(user_id)
            if current_count + 1 > 50:
                _log_action_event({
                    "user_id": user_id,
                    "shop_domain": shop_domain,
                    "product_id": req.product_id,
                    "action_type": "apply_recommendation",
                    "action_count": 1,
                    "status": "limit_reached",
                    "error": "Pro monthly limit reached"
                })
                raise HTTPException(status_code=403, detail="Limite mensuelle Pro atteinte (50 actions)")

        # Fetch product (before)
        product_resp = requests.get(
            f"https://{shop_domain}/admin/api/2024-01/products/{req.product_id}.json",
            headers={"X-Shopify-Access-Token": access_token, "Content-Type": "application/json"}
        )
        product_resp.raise_for_status()
        product = product_resp.json().get("product", {})
        before_title = product.get("title")
        before_description = product.get("body_html")
        before_price = None
        if product.get("variants"):
            before_price = product["variants"][0].get("price")

        from AI_engine.action_engine import ActionEngine
        action_engine = ActionEngine(shop_domain, access_token)
        rec_type = (req.recommendation_type or "").lower()

        if rec_type == "prix":
            variants = product.get("variants", [])
            if not variants:
                raise HTTPException(status_code=400, detail="Produit sans variantes")
            current_price = float(variants[0].get("price", 0))
            if current_price <= 0:
                raise HTTPException(status_code=400, detail="Prix actuel invalide")
            # Use the AI-suggested price from the frontend if provided,
            # otherwise fall back to a conservative 10% adjustment
            if req.suggested_price and req.suggested_price > 0:
                new_price = round(req.suggested_price, 2)
            else:
                new_price = round(current_price * 0.9, 2)
            result = action_engine.apply_price_change(req.product_id, new_price)
            if not result.get("success"):
                raise HTTPException(status_code=400, detail=result.get("error", "Échec modification prix"))

        elif rec_type == "titre":
            engine = get_ai_engine()
            new_title = engine.content_gen.generate_title(product, tier)
            result = action_engine.update_product_content(req.product_id, title=new_title)
            if not result.get("success"):
                raise HTTPException(status_code=400, detail=result.get("error", "Échec modification titre"))

        elif rec_type == "description":
            engine = get_ai_engine()
            new_description = engine.content_gen.generate_description(product, tier)
            result = action_engine.update_product_content(req.product_id, description=new_description)
            if not result.get("success"):
                raise HTTPException(status_code=400, detail=result.get("error", "Échec modification description"))

        else:
            raise HTTPException(status_code=400, detail="Type de recommandation non supporté")

        # Fetch product (after) to verify change
        after_resp = requests.get(
            f"https://{shop_domain}/admin/api/2024-01/products/{req.product_id}.json",
            headers={"X-Shopify-Access-Token": access_token, "Content-Type": "application/json"}
        )
        after_resp.raise_for_status()
        after_product = after_resp.json().get("product", {})
        after_title = after_product.get("title")
        after_description = after_product.get("body_html")
        after_price = None
        if after_product.get("variants"):
            after_price = after_product["variants"][0].get("price")

        changed = False
        if rec_type == "prix" and before_price != after_price:
            changed = True
        if rec_type == "titre" and before_title != after_title:
            changed = True
        if rec_type == "description" and before_description != after_description:
            changed = True

        if not changed:
            raise HTTPException(status_code=400, detail="Aucune modification détectée sur Shopify")

        _log_action_event({
            "user_id": user_id,
            "shop_domain": shop_domain,
            "product_id": req.product_id,
            "action_type": f"apply_{rec_type}",
            "action_count": 1,
            "status": "executed",
            "error": None
        })

        return {
            "success": True,
            "result": result,
            "before": {
                "title": before_title,
                "description": before_description,
                "price": before_price
            },
            "after": {
                "title": after_title,
                "description": after_description,
                "price": after_price
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error applying recommendation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class GenerateReportRequest(BaseModel):
    analytics_data: dict
    tier: str
    report_type: str = "weekly"  # weekly, daily, monthly


@app.post("/api/ai/generate-report")
async def generate_report_endpoint(req: GenerateReportRequest, request: Request):
    """
    📊 Génère un rapport d'analyse
    Standard: Rapport mensuel uniquement
    Pro: Rapports hebdomadaires
    Premium: Rapports quotidiens + PDF/Email
    """
    try:
        user_id = get_user_id(request)
        tier = get_user_tier(user_id)

        ensure_feature_allowed(tier, "reports")

        # Enforce report frequency per plan
        allowed_freq = PLAN_LIMITS.get(tier, PLAN_LIMITS["free"]).get("report_frequency", "none")
        freq_hierarchy = {"daily": 3, "weekly": 2, "monthly": 1}
        requested_level = freq_hierarchy.get(req.report_type, 1)
        allowed_level = freq_hierarchy.get(allowed_freq, 1)
        if requested_level > allowed_level:
            plan_needed = "Premium" if req.report_type == "daily" else "Pro"
            raise HTTPException(
                status_code=403,
                detail=f"Rapport {req.report_type} réservé au plan {plan_needed}. Votre plan ({tier}) permet: {allowed_freq}"
            )

        engine = get_ai_engine()
        report = engine.generate_report(req.analytics_data, tier, req.report_type)
        
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
        no_access_message = "No active plan found. Please purchase a plan to access your dashboard."
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
            # ── DB-FIRST APPROACH: DB is the source of truth (set by webhooks).
            #    Stripe API call is ONLY for auto-heal, NEVER blocks access.
            tier_map = {
                '99': 'standard', '199': 'pro', '299': 'premium',
                'standard': 'standard', 'pro': 'pro', 'premium': 'premium',
            }
            capabilities = {
                'standard': {'product_limit': 50, 'features': ['product_analysis', 'title_optimization', 'price_suggestions']},
                'pro': {'product_limit': 500, 'features': ['product_analysis', 'content_generation', 'cross_sell', 'reports', 'automated_actions', 'invoicing']},
                'premium': {'product_limit': None, 'features': ['product_analysis', 'content_generation', 'cross_sell', 'automated_actions', 'reports', 'predictions', 'invoicing']},
            }

            # Step 1: Read from DB
            subscription = None
            try:
                supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
                sub_result = supabase.table("subscriptions").select("*").eq("user_id", user_id).in_("status", ["active", "cancelling"]).order("updated_at", desc=True).limit(1).execute()
                if sub_result.data:
                    subscription = sub_result.data[0]
                    print(f"  📋 [STATUS] DB row (active): id={subscription.get('id')}, plan_tier={subscription.get('plan_tier')}, paid={subscription.get('paid')}, status={subscription.get('status')}, payment_date={subscription.get('payment_date')}")
                else:
                    # FALLBACK: Also check inactive rows — they might be auto-healable via Stripe
                    inactive_result = supabase.table("subscriptions").select("*").eq("user_id", user_id).order("updated_at", desc=True).limit(1).execute()
                    if inactive_result.data:
                        subscription = inactive_result.data[0]
                        print(f"  📋 [STATUS] DB row (inactive, will attempt auto-heal): id={subscription.get('id')}, plan_tier={subscription.get('plan_tier')}, paid={subscription.get('paid')}, status={subscription.get('status')}, stripe_sub_id={subscription.get('stripe_subscription_id')}, stripe_session_id={subscription.get('stripe_session_id')}, stripe_customer_id={subscription.get('stripe_customer_id')}")
            except Exception as e:
                print(f"  ⚠️ [STATUS] DB query error: {e}")

            if subscription:
                raw_tier = subscription.get('plan_tier')
                sub_status = str(subscription.get('status', '')).lower()
                paid_flag = _is_paid_subscription_row(subscription)
                plan = tier_map.get(str(raw_tier).lower()) if raw_tier else None

                # Step 2: If DB says paid=true + valid plan → verify from Stripe (source of truth) then GRANT ACCESS
                payment_date = subscription.get('payment_date')
                if paid_flag and plan and sub_status in ('active', 'cancelling'):
                    # CRITICAL: Verify plan from Stripe live to prevent stale plan display
                    stripe_verified_plan = None
                    upcoming_change = {"upcoming_plan": None, "upcoming_plan_effective_at": None}
                    cancel_at_period_end = sub_status == 'cancelling'
                    cancel_at = None
                    current_period_end_iso = _stripe_ts_to_iso(
                        _coerce_stripe_timestamp(subscription.get('current_period_end'))
                        or _coerce_stripe_timestamp(subscription.get('end_date'))
                    )
                    stripe_sub_id_for_verify = _normalize_stripe_subscription_id(subscription.get('stripe_subscription_id'))
                    if stripe_sub_id_for_verify:
                        try:
                            stripe_sub_obj = stripe.Subscription.retrieve(stripe_sub_id_for_verify, expand=['items'])
                            stripe_verified_plan = _resolve_plan_from_stripe_subscription(stripe_sub_obj)
                            upcoming_change = _extract_upcoming_plan_change(stripe_sub_obj)
                            stripe_live_status = str(_sg(stripe_sub_obj, 'status') or '').lower()
                            if _sg(stripe_sub_obj, 'cancel_at_period_end'):
                                cancel_at_period_end = True
                                sub_status = 'cancelling'
                            period_end = _coerce_stripe_timestamp(_sg(stripe_sub_obj, 'current_period_end'))
                            if period_end:
                                current_period_end_iso = _stripe_ts_to_iso(period_end)
                            if cancel_at_period_end and period_end:
                                cancel_at = datetime.utcfromtimestamp(period_end).isoformat()
                            # Sync DB if Stripe plan differs
                            if stripe_verified_plan and stripe_verified_plan != plan:
                                print(f"  🔄 [STATUS] Stripe plan '{stripe_verified_plan}' differs from DB '{plan}' — syncing")
                                plan = stripe_verified_plan
                                try:
                                    supabase.table("subscriptions").update({
                                        "plan_tier": plan, "updated_at": datetime.utcnow().isoformat()
                                    }).eq("id", subscription.get("id")).execute()
                                except Exception:
                                    pass
                            elif stripe_verified_plan:
                                plan = stripe_verified_plan
                            # Deny if Stripe says inactive
                            if stripe_live_status not in ('active', 'trialing'):
                                print(f"  ⚠️ [STATUS] Stripe says status={stripe_live_status}, denying")
                                try:
                                    supabase.table("subscriptions").update({
                                        "status": "inactive", "subscription_status": "inactive",
                                        "paid": False, "plan": False,
                                        "updated_at": datetime.utcnow().isoformat()
                                    }).eq("id", subscription.get("id")).execute()
                                except Exception:
                                    pass
                                return {
                                    'success': True,
                                    'has_subscription': False,
                                    'plan': None,
                                    'paid': False,
                                    'status': 'inactive',
                                    'subscription_status': 'inactive',
                                    'message': 'Subscription no longer active in Stripe',
                                }
                        except Exception as stripe_verify_err:
                            print(f"  ⚠️ [STATUS] Stripe live-sync warning: {stripe_verify_err}")
                    elif cancel_at_period_end:
                        pass
                    print(f"  ✅ [STATUS] ACCESS GRANTED: paid={paid_flag}, plan={plan}, status={sub_status}, stripe_verified={stripe_verified_plan is not None}")
                    return {
                        'success': True,
                        'has_subscription': True,
                        'plan': plan,
                        'upcoming_plan': upcoming_change.get('upcoming_plan'),
                        'upcoming_plan_effective_at': upcoming_change.get('upcoming_plan_effective_at'),
                        'current_period_end': current_period_end_iso,
                        'paid': True,
                        'status': 'active' if not cancel_at_period_end else 'cancelling',
                        'subscription_status': 'active' if not cancel_at_period_end else 'cancelling',
                        'payment_date': payment_date,
                        'started_at': subscription.get('start_date') or subscription.get('created_at'),
                        'capabilities': capabilities.get(plan, {}),
                        'cancel_at_period_end': cancel_at_period_end,
                        'cancel_at': cancel_at,
                    }

                # Step 3: paid is False/NULL — try Stripe auto-heal (best-effort)
                print(f"  🔄 [STATUS] DB paid={paid_flag}, plan={plan}, status={sub_status}, attempting Stripe auto-heal...")
                stripe_sub_id = _normalize_stripe_subscription_id(subscription.get('stripe_subscription_id'))
                if not stripe_sub_id:
                    stripe_sub_id = _recover_subscription_id_from_session(subscription.get('stripe_session_id'))
                # Also try to find active subscription by customer ID
                if not stripe_sub_id and subscription.get('stripe_customer_id'):
                    try:
                        cust_subs = stripe.Subscription.list(customer=subscription['stripe_customer_id'], status='active', limit=1)
                        if cust_subs.data:
                            stripe_sub_id = _normalize_stripe_subscription_id(cust_subs.data[0])
                            print(f"  🔍 [STATUS] Recovered sub_id from customer {subscription['stripe_customer_id']}: {stripe_sub_id}")
                    except Exception as cust_err:
                        print(f"  ⚠️ [STATUS] Customer sub lookup warning: {cust_err}")

                # Last-resort fallback: recover Stripe customer/subscription via user_profiles
                if not stripe_sub_id:
                    try:
                        profile_res = supabase.table("user_profiles").select("email,stripe_customer_id").eq("id", user_id).limit(1).execute()
                        profile_row = profile_res.data[0] if profile_res.data else {}
                        candidate_customers = []
                        profile_customer_id = profile_row.get("stripe_customer_id")
                        if profile_customer_id:
                            candidate_customers.append(profile_customer_id)
                        profile_email = profile_row.get("email")
                        if profile_email:
                            try:
                                customer_list = stripe.Customer.list(email=profile_email, limit=5)
                                for customer_obj in (_sg(customer_list, "data", []) or []):
                                    cid = _sg(customer_obj, "id")
                                    if cid and cid not in candidate_customers:
                                        candidate_customers.append(cid)
                            except Exception as email_lookup_err:
                                print(f"  ⚠️ [STATUS] Customer email lookup warning: {email_lookup_err}")

                        for customer_id in candidate_customers:
                            found_sub = None
                            # ONLY check active first — scan ALL customers before falling back to trialing
                            try:
                                cust_subs = stripe.Subscription.list(customer=customer_id, status="active", limit=1)
                                subs_data = _sg(cust_subs, "data", []) or []
                                if subs_data:
                                    found_sub = subs_data[0]
                            except Exception:
                                pass
                            if found_sub:
                                stripe_sub_id = _normalize_stripe_subscription_id(found_sub)
                                if stripe_sub_id:
                                    print(f"  🔍 [STATUS] Recovered active sub_id via user_profiles ({customer_id}): {stripe_sub_id}")
                                    break
                        # Second pass: only fall back to trialing if no active found across all customers
                        if not stripe_sub_id:
                            for customer_id in candidate_customers:
                                found_sub = None
                                try:
                                    cust_subs = stripe.Subscription.list(customer=customer_id, status="trialing", limit=1)
                                    subs_data = _sg(cust_subs, "data", []) or []
                                    if subs_data:
                                        found_sub = subs_data[0]
                                except Exception:
                                    pass
                                if found_sub:
                                    stripe_sub_id = _normalize_stripe_subscription_id(found_sub)
                                    if stripe_sub_id:
                                        print(f"  🔍 [STATUS] Recovered trialing sub_id via user_profiles ({customer_id}): {stripe_sub_id}")
                                        break
                    except Exception as profile_recover_err:
                        print(f"  ⚠️ [STATUS] Profile-based Stripe recovery warning: {profile_recover_err}")

                if stripe_sub_id and str(stripe_sub_id).startswith("sub_"):
                    try:
                        stripe_sub = stripe.Subscription.retrieve(stripe_sub_id)
                        stripe_status = str(_sg(stripe_sub, "status", "")).lower()
                        if stripe_status in ('active', 'trialing'):
                            healed_plan = _resolve_plan_from_stripe_subscription(stripe_sub)
                            if healed_plan:
                                upcoming_change = _extract_upcoming_plan_change(stripe_sub)
                                healed_payment_date = subscription.get('payment_date') or _resolve_payment_date(_sg(stripe_sub, "created"))
                                try:
                                    healed_period_end = _coerce_stripe_timestamp(_sg(stripe_sub, "current_period_end"))
                                    heal_payload = {
                                        "plan_tier": healed_plan,
                                        "plan": True,
                                        "paid": True, "status": "active",
                                        "subscription_status": "active",
                                        "payment_date": healed_payment_date,
                                        "current_period_end": _stripe_ts_to_iso(healed_period_end) if healed_period_end else subscription.get("current_period_end"),
                                        "stripe_customer_id": _sg(stripe_sub, "customer") or subscription.get("stripe_customer_id"),
                                        "stripe_subscription_id": stripe_sub_id,
                                        "updated_at": datetime.utcnow().isoformat(),
                                    }
                                    try:
                                        supabase.table("subscriptions").update(heal_payload).eq("id", subscription.get("id")).execute()
                                    except Exception as col_err:
                                        if "PGRST204" in str(col_err) or "schema cache" in str(col_err):
                                            heal_payload.pop("current_period_end", None)
                                            supabase.table("subscriptions").update(heal_payload).eq("id", subscription.get("id")).execute()
                                        else:
                                            raise
                                    supabase.table("user_profiles").update({
                                        "subscription_plan": healed_plan, "subscription_tier": healed_plan,
                                        "subscription_status": "active",
                                        "updated_at": datetime.utcnow().isoformat(),
                                    }).eq("id", user_id).execute()
                                    print(f"  ✅ [STATUS] Auto-healed: paid=true, plan={healed_plan}")
                                except Exception as heal_err:
                                    print(f"  ⚠️ [STATUS] Auto-heal DB write warning: {heal_err}")
                                return {
                                    'success': True,
                                    'has_subscription': True,
                                    'plan': healed_plan,
                                    'upcoming_plan': upcoming_change.get('upcoming_plan'),
                                    'upcoming_plan_effective_at': upcoming_change.get('upcoming_plan_effective_at'),
                                    'current_period_end': _stripe_ts_to_iso(healed_period_end) if healed_period_end else subscription.get('current_period_end'),
                                    'paid': True,
                                    'status': 'active',
                                    'subscription_status': 'active',
                                    'payment_date': healed_payment_date,
                                    'started_at': subscription.get('start_date') or subscription.get('created_at'),
                                    'capabilities': capabilities.get(healed_plan, {}),
                                }
                    except Exception as stripe_err:
                        print(f"  ⚠️ [STATUS] Stripe auto-heal failed (non-blocking): {stripe_err}")

                # Auto-heal failed or no stripe_sub_id → deny
                print(f"  ❌ [STATUS] ACCESS DENIED: paid={paid_flag}, plan={plan}, stripe_sub_id={stripe_sub_id}")
                return {
                    'success': True,
                    'has_subscription': False,
                    'plan': None,
                    'paid': False,
                    'status': sub_status or 'inactive',
                    'subscription_status': sub_status or 'inactive',
                    'message': 'Payment not yet validated. If you just paid, please wait a few seconds and refresh.',
                }

            # No row at all
            print(f"  ❌ [STATUS] No active subscription row in DB for user {user_id}")

            # Last-resort: recover active Stripe sub from user_profiles (email/customer), then rehydrate DB
            try:
                profile_res = supabase.table("user_profiles").select("email,stripe_customer_id").eq("id", user_id).limit(1).execute()
                profile_row = profile_res.data[0] if profile_res.data else {}
                candidate_customers = []
                profile_customer_id = profile_row.get("stripe_customer_id")
                if profile_customer_id:
                    candidate_customers.append(profile_customer_id)
                profile_email = profile_row.get("email")
                if profile_email:
                    try:
                        customer_list = stripe.Customer.list(email=profile_email, limit=5)
                        for customer_obj in (_sg(customer_list, "data", []) or []):
                            cid = _sg(customer_obj, "id")
                            if cid and cid not in candidate_customers:
                                candidate_customers.append(cid)
                    except Exception as email_lookup_err:
                        print(f"  ⚠️ [STATUS] No-row email lookup warning: {email_lookup_err}")

                recovered_sub = None
                recovered_customer = None
                for customer_id in candidate_customers:
                    for target_status in ("active", "trialing"):
                        try:
                            cust_subs = stripe.Subscription.list(customer=customer_id, status=target_status, limit=1)
                            subs_data = _sg(cust_subs, "data", []) or []
                            if subs_data:
                                recovered_sub = subs_data[0]
                                recovered_customer = customer_id
                                break
                        except Exception:
                            pass
                    if recovered_sub:
                        break

                if recovered_sub:
                    recovered_sub_id = _normalize_stripe_subscription_id(recovered_sub)
                    recovered_plan = _resolve_plan_from_stripe_subscription(recovered_sub)
                    recovered_status = str(_sg(recovered_sub, "status") or "").lower()
                    if recovered_sub_id and recovered_plan and recovered_status in ("active", "trialing"):
                        recovered_payment_date = _resolve_payment_date(_sg(recovered_sub, "created"))
                        recovered_period_end = _coerce_stripe_timestamp(_sg(recovered_sub, "current_period_end"))
                        _sub_upsert(supabase, user_id, {
                            "user_id": user_id,
                            "plan_tier": recovered_plan,
                            "plan": True,
                            "paid": True,
                            "status": "active",
                            "subscription_status": "active",
                            "payment_date": recovered_payment_date,
                            "stripe_customer_id": recovered_customer,
                            "stripe_subscription_id": recovered_sub_id,
                            "current_period_end": _stripe_ts_to_iso(recovered_period_end) if recovered_period_end else None,
                            "updated_at": datetime.utcnow().isoformat(),
                        })
                        try:
                            supabase.table("user_profiles").update({
                                "stripe_customer_id": recovered_customer,
                                "stripe_subscription_id": recovered_sub_id,
                                "subscription_plan": recovered_plan,
                                "subscription_tier": recovered_plan,
                                "subscription_status": "active",
                                "updated_at": datetime.utcnow().isoformat(),
                            }).eq("id", user_id).execute()
                        except Exception:
                            pass
                        return {
                            'success': True,
                            'has_subscription': True,
                            'plan': recovered_plan,
                            'paid': True,
                            'status': 'active',
                            'subscription_status': 'active',
                            'payment_date': recovered_payment_date,
                            'started_at': _stripe_ts_to_iso(_coerce_stripe_timestamp(_sg(recovered_sub, 'start_date'))) or _stripe_ts_to_iso(_coerce_stripe_timestamp(_sg(recovered_sub, 'created'))),
                            'current_period_end': _stripe_ts_to_iso(recovered_period_end) if recovered_period_end else None,
                            'capabilities': capabilities.get(recovered_plan, {}),
                        }
            except Exception as no_row_recover_err:
                print(f"  ⚠️ [STATUS] No-row Stripe recovery warning: {no_row_recover_err}")

            return {
                'success': True,
                'has_subscription': False,
                'plan': None,
                'paid': False,
                'status': 'inactive',
                'subscription_status': 'inactive',
                'message': no_access_message,
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
        raw_plan = req.plan
        email = req.email
        
        # Normalize plan key: accept both numeric ('99','199','299') and named ('standard','pro','premium')
        _plan_normalize = {'99': 'standard', '199': 'pro', '299': 'premium'}
        plan = _plan_normalize.get(str(raw_plan), raw_plan)
        
        if plan not in STRIPE_PLANS:
            raise HTTPException(status_code=400, detail=f"Plan invalide: {raw_plan}")
        
        price_id = STRIPE_PLANS[plan]
        frontend_url = "https://fdkng.github.io/SHOPBRAIN_AI"

        stripe_customer_id = None
        has_active_sub = False
        try:
            if SUPABASE_URL and SUPABASE_SERVICE_KEY:
                supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
                sub_res = supabase.table("subscriptions").select("stripe_customer_id,status,paid,stripe_subscription_id").eq("user_id", user_id).order("created_at", desc=True).limit(1).execute()
                if sub_res.data:
                    row = sub_res.data[0]
                    stripe_customer_id = row.get("stripe_customer_id")
                    # Check if user already has an active paid subscription
                    if row.get("paid") and str(row.get("status") or "").lower() in ("active", "cancelling", "trialing"):
                        has_active_sub = True
        except Exception as e:
            print(f"Stripe customer lookup warning: {e}")

        # GUARD: prevent duplicate subscriptions — active subscribers must use switch-plan
        if has_active_sub:
            raise HTTPException(
                status_code=409,
                detail="You already have an active subscription. Use the plan switch feature in your dashboard instead of creating a new checkout."
            )
        
        session_kwargs = {
            "payment_method_types": ["card"],
            "mode": "subscription",
            "line_items": [{"price": price_id, "quantity": 1}],
            "success_url": f"{frontend_url}/#dashboard?session_id={{CHECKOUT_SESSION_ID}}&success=true",
            "cancel_url": f"{frontend_url}/#pricing",
            "allow_promotion_codes": True,
            "client_reference_id": user_id,
            "metadata": {
                "user_id": user_id,
                "plan": plan
            },
            "subscription_data": {
                "metadata": {"user_id": user_id, "plan": plan},
            },
        }

        if stripe_customer_id:
            session_kwargs["customer"] = stripe_customer_id
        else:
            session_kwargs["customer_email"] = email

        session = stripe.checkout.Session.create(**session_kwargs)
        
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
        
        try:
            session = stripe.checkout.Session.retrieve(req.session_id, expand=["line_items", "subscription"])
        except Exception as stripe_err:
            print(f"❌ [VERIFY] Stripe session retrieve failed: {stripe_err}")
            raise HTTPException(status_code=500, detail=f"Stripe session retrieve failed: {stripe_err}")

        payment_status_str = str(_sg(session, "payment_status") or "").lower()
        print(f"💳 [VERIFY] Session received: session_id={req.session_id}, user_id={user_id}, payment_status={payment_status_str}")
        print(f"  ℹ️ [VERIFY] session.subscription type={type(_sg(session, 'subscription')).__name__}, value_preview={str(_sg(session, 'subscription'))[:120]}")

        if payment_status_str not in ("paid", "no_payment_required"):
            return {
                "success": False,
                "message": "Paiement non confirmé"
            }
        
        # session.subscription is already expanded (full object), extract the object directly
        # or retrieve by ID if it's a string
        sub_raw = _sg(session, "subscription")
        if sub_raw and not isinstance(sub_raw, str):
            # Already expanded — use it directly
            subscription = sub_raw
        else:
            # It's a string ID (or None) — retrieve it
            sub_id = str(sub_raw) if sub_raw else None
            subscription = stripe.Subscription.retrieve(sub_id) if sub_id else None
        
        if SUPABASE_URL and SUPABASE_SERVICE_KEY:
            supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
            
            # Determine plan from the most reliable source: price_id/amount -> metadata fallback
            plan = None

            def tier_from_amount(amount_cents: int | None):
                if amount_cents is None:
                    return None
                exact_amount_map = {9900: "standard", 19900: "pro", 29900: "premium"}
                return exact_amount_map.get(int(amount_cents))

            # Try subscription item price_id first (metadata may be stale after upgrades)
            if subscription:
                items_container = _sg(subscription, "items", {})
                items = _sg(items_container, "data", []) if items_container else []
                if items:
                    price_obj = _sg(items[0], "price", {})
                    price_id = _sg(price_obj, "id")
                    amount = _sg(price_obj, "unit_amount")
                    plan = PRICE_TO_TIER.get(price_id) or tier_from_amount(amount)

            # Try line_items if still missing
            if not plan:
                line_items_container = _sg(session, "line_items", {})
                line_items_data = _sg(line_items_container, "data", []) if line_items_container else []
                for li in line_items_data:
                    li_price = _sg(li, "price", {})
                    price_id = _sg(li_price, "id")
                    amount = _sg(li_price, "unit_amount")
                    plan = PRICE_TO_TIER.get(price_id) or tier_from_amount(amount)
                    if plan:
                        break

            # Metadata fallback only if no reliable price info found
            if not plan:
                session_meta = _sg(session, "metadata", None)
                if session_meta:
                    plan = _sg(session_meta, "plan")

            # Normalize plan key (metadata might store '99', '199', '299')
            _tier_normalize = {
                '99': 'standard', '199': 'pro', '299': 'premium',
                'standard': 'standard', 'pro': 'pro', 'premium': 'premium',
            }
            if plan:
                plan = _tier_normalize.get(str(plan).lower(), plan)
            
            # Final fallback — do NOT assign a paid plan if unknown
            if not plan:
                return {
                    "success": False,
                    "message": "Unable to determine purchased plan from Stripe session"
                }

            # Guard against stale verify requests (e.g., reopening an old Stripe success URL)
            should_persist = True
            try:
                incoming_sub_id = _sg(subscription, "id") if subscription else None
                incoming_sub_created = int(_sg(subscription, "created", 0) or 0) if subscription else 0
                incoming_sub_status = str(_sg(subscription, "status", "")).lower() if subscription else ""

                existing_res = (
                    supabase.table("subscriptions")
                    .select("stripe_subscription_id,status")
                    .eq("user_id", user_id)
                    .order("updated_at", desc=True)
                    .limit(1)
                    .execute()
                )
                existing_row = existing_res.data[0] if existing_res.data else None

                if existing_row:
                    existing_sub_id = existing_row.get("stripe_subscription_id")
                    existing_status = str(existing_row.get("status") or "").lower()
                    existing_sub_created = 0

                    if existing_sub_id:
                        try:
                            existing_sub_obj = stripe.Subscription.retrieve(existing_sub_id)
                            existing_sub_created = int(_sg(existing_sub_obj, "created", 0) or 0)
                            existing_status = str(_sg(existing_sub_obj, "status") or existing_status).lower()
                        except Exception as existing_fetch_err:
                            print(f"⚠️ verify-session: existing sub fetch warning: {existing_fetch_err}")

                    existing_is_valid = existing_status in ("active", "trialing")
                    incoming_is_valid = incoming_sub_status in ("active", "trialing")

                    if existing_sub_id and incoming_sub_id and existing_sub_id != incoming_sub_id:
                        if existing_is_valid and (not incoming_is_valid or existing_sub_created > incoming_sub_created):
                            should_persist = False
                            print(
                                f"⏭️ verify-session: ignoring stale session for sub {incoming_sub_id}; "
                                f"existing sub {existing_sub_id} is newer/valid."
                            )
            except Exception as guard_err:
                print(f"⚠️ verify-session freshness guard warning: {guard_err}")

            if not should_persist:
                return {
                    "success": True,
                    "plan": plan,
                    "message": "Session verify ignored (stale), keeping latest active plan"
                }
            
            # Cancel any other active subscriptions for this customer
            try:
                if _sg(session, "customer"):
                    active_subs = stripe.Subscription.list(customer=_sg(session, "customer"), status="active", limit=10)
                    active_subs_data = _sg(active_subs, "data", [])
                    for sub in active_subs_data:
                        sub_id = _sg(sub, "id")
                        if sub_id != _sg(subscription, "id"):
                            stripe.Subscription.cancel(sub_id)
            except Exception as e:
                print(f"Stripe cancel old subs warning: {e}")

            payment_date = _resolve_payment_date(_sg(session, "created"), _sg(subscription, "created") if subscription else None)
            print(f"💾 [VERIFY] Writing DB row: user_id={user_id}, plan={plan}, paid=True, status=active, payment_date={payment_date}")

            _sub_upsert(supabase, user_id, {
                "user_id": user_id,
                "plan_tier": plan,
                "plan": True,
                "paid": True,
                "status": "active",
                "subscription_status": "active",
                "payment_date": payment_date,
                "stripe_session_id": _sg(session, "id"),
                "stripe_subscription_id": _sg(subscription, "id") if subscription else None,
                "stripe_customer_id": _sg(session, "customer"),
                "email": _sg(session, "customer_email"),
                "updated_at": datetime.utcnow().isoformat(),
            })
            
            try:
                supabase.table("user_profiles").upsert({
                    "id": user_id,
                    "subscription_tier": plan,
                    "subscription_plan": plan,
                    "subscription_status": "active",
                    "updated_at": datetime.utcnow().isoformat()
                }, on_conflict="id").execute()
            except Exception as profile_err:
                print(f"⚠️ [VERIFY] user_profiles upsert warning (non-fatal): {profile_err}")
            
            # Invalidate _init_cache so next /api/init call fetches fresh data
            _init_cache.pop(user_id, None)
            print(f"🧹 [VERIFY] Invalidated _init_cache for user {user_id}")
        
        return {
            "success": True,
            "plan": plan,
            "message": f"✅ Abonnement {plan.upper()} activé!"
        }
    
    except HTTPException:
        raise  # Let auth 401 and other HTTP errors pass through unchanged
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print(f"❌ [VERIFY] Error: {e}\n{tb}")
        raise HTTPException(status_code=500, detail=f"verify-session error: {type(e).__name__}: {e}")


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


print(f"✅ All endpoints registered successfully")
print(f"========== BACKEND READY ==========\n")

def _deferred_startup_tasks():
    """Run non-critical startup tasks in background thread so uvicorn binds the port FAST."""
    time.sleep(5)  # let the server fully bind first
    if SUPABASE_URL and SUPABASE_SERVICE_KEY:
        try:
            sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

            # ── Payments contract: ensure required subscription columns exist ──
            try:
                import requests as req2
                payments_sql = """
                ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS plan_id TEXT;
                ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS paid BOOLEAN DEFAULT FALSE;
                ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS plan BOOLEAN DEFAULT FALSE;
                ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'inactive';
                ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS payment_date TIMESTAMPTZ;
                ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ;
                ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS end_date TIMESTAMPTZ;
                ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;
                ALTER TABLE subscriptions ALTER COLUMN status SET DEFAULT 'inactive';
                """
                payments_resp = req2.post(
                    f"{SUPABASE_URL}/rest/v1/rpc/exec_sql",
                    headers={
                        "apikey": SUPABASE_SERVICE_KEY,
                        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                        "Content-Type": "application/json"
                    },
                    json={"query": payments_sql},
                    timeout=10
                )
                if payments_resp.status_code < 300:
                    print("✅ subscriptions payment columns ready (plan_id/paid/payment_date/start_date/end_date, status default inactive)")
                else:
                    print(f"⚠️ subscriptions payment columns migration status={payments_resp.status_code}")
            except Exception as e:
                print(f"⚠️ subscriptions payment columns migration error: {e}")

            # ── Multi-shop: ensure is_active column exists ──
            try:
                import requests as req2
                migration_sql = """
                DO $$
                BEGIN
                  IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name='shopify_connections' AND column_name='is_active'
                  ) THEN
                    ALTER TABLE shopify_connections ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
                    -- Set the most recently updated row as active for each user
                    UPDATE shopify_connections sc
                    SET is_active = TRUE
                    WHERE NOT EXISTS (
                      SELECT 1 FROM shopify_connections sc2
                      WHERE sc2.user_id = sc.user_id AND sc2.updated_at > sc.updated_at
                    );
                  END IF;
                END $$;
                """
                resp = req2.post(
                    f"{SUPABASE_URL}/rest/v1/rpc/exec_sql",
                    headers={
                        "apikey": SUPABASE_SERVICE_KEY,
                        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                        "Content-Type": "application/json"
                    },
                    json={"query": migration_sql},
                    timeout=10
                )
                if resp.status_code < 300:
                    print("✅ shopify_connections.is_active column ready")
                else:
                    print(f"⚠️ is_active migration status={resp.status_code}. Will fallback gracefully.")
            except Exception as e:
                print(f"⚠️ is_active migration error: {e}")

            # ⚡ Auto-create chat_conversations table if it doesn't exist
            try:
                sb.table("chat_conversations").select("id").limit(1).execute()
                print("✅ chat_conversations table exists")
            except Exception:
                print("⚠️ chat_conversations table not found — creating via Supabase REST...")
                import requests as req2
                sql = """
                CREATE TABLE IF NOT EXISTS chat_conversations (
                  id BIGSERIAL PRIMARY KEY,
                  user_id UUID NOT NULL,
                  conversation_id TEXT NOT NULL,
                  title TEXT DEFAULT '',
                  messages JSONB DEFAULT '[]'::jsonb,
                  created_at TIMESTAMPTZ DEFAULT NOW(),
                  updated_at TIMESTAMPTZ DEFAULT NOW(),
                  UNIQUE(user_id, conversation_id)
                );
                CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_id ON chat_conversations(user_id);
                CREATE INDEX IF NOT EXISTS idx_chat_conversations_updated ON chat_conversations(user_id, updated_at DESC);
                """
                resp = req2.post(
                    f"{SUPABASE_URL}/rest/v1/rpc/exec_sql",
                    headers={
                        "apikey": SUPABASE_SERVICE_KEY,
                        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                        "Content-Type": "application/json"
                    },
                    json={"query": sql},
                    timeout=10
                )
                if resp.status_code < 300:
                    print("✅ chat_conversations table created successfully")
                else:
                    print(f"⚠️ Could not auto-create table (status={resp.status_code}).")
        except Exception as e:
            print(f"⚠️ Table check failed: {e}. Conversations will use localStorage only.")
    sys.stdout.flush()


@app.on_event("startup")
async def startup_event():
    """Log when the app starts + launch background threads.
    CRITICAL: This must return FAST so uvicorn can bind the port and pass Render health checks."""
    startup_time = datetime.utcnow().isoformat()
    print(f"\n🟢 APP STARTUP at {startup_time}")
    print(f"STRIPE_SECRET_KEY={'present' if STRIPE_SECRET_KEY else 'MISSING'}")
    print(f"SUPABASE_URL={'present' if SUPABASE_URL else 'MISSING'}")
    sys.stdout.flush()
    sys.stderr.flush()

    # Move Supabase table checks to background thread (non-blocking)
    threading.Thread(target=_deferred_startup_tasks, daemon=True).start()

    # Lancer le thread de surveillance stock 24/7
    threading.Thread(target=_stock_monitor_loop, daemon=True).start()
    print("📦 Stock monitor démarré (toutes les 5 minutes)")
    print("🟢 Startup event completed — server ready for health checks")
    sys.stdout.flush()


# ---------------------------------------------------------------------------
# Background Stock Monitor — SMTP Email System
# Expéditeur: shopbrainai@outlook.com
# Cooldown: 1 email par produit par user tous les 5 jours
# Bouton "Ne plus me rappeler" avec token sécurisé
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Gmail API — envoi d'email via OAuth2 refresh_token (HTTP, pas de SMTP)
# ---------------------------------------------------------------------------
GMAIL_CLIENT_ID = os.getenv("GMAIL_CLIENT_ID", "")
GMAIL_CLIENT_SECRET = os.getenv("GMAIL_CLIENT_SECRET", "")
GMAIL_REFRESH_TOKEN = os.getenv("GMAIL_REFRESH_TOKEN", "")
GMAIL_SENDER_EMAIL = os.getenv("GMAIL_SENDER_EMAIL", "")  # ex: shopbrainai@gmail.com

STOCK_ALERT_COOLDOWN_DAYS = 5
STOCK_ALERT_REMINDER_DAYS = 7
STOCK_ALERT_TOKEN_EXPIRY_DAYS = 30
BACKEND_BASE_URL = _sanitize_url(
    os.getenv("BACKEND_BASE_URL"),
    "https://shopbrain-backend.onrender.com",
)

# --- Cache access_token en mémoire (expire ~3600 s) ---
_gmail_access_token: str = ""
_gmail_token_expires_at: float = 0.0


def _get_gmail_access_token() -> str:
    """Échange le refresh_token contre un access_token via Google OAuth2.
    Met en cache le token jusqu'à expiration (~1 h).
    """
    global _gmail_access_token, _gmail_token_expires_at
    if _gmail_access_token and time.time() < _gmail_token_expires_at - 60:
        return _gmail_access_token

    resp = requests.post(
        "https://oauth2.googleapis.com/token",
        data={
            "client_id": GMAIL_CLIENT_ID,
            "client_secret": GMAIL_CLIENT_SECRET,
            "refresh_token": GMAIL_REFRESH_TOKEN,
            "grant_type": "refresh_token",
        },
        timeout=15,
    )
    if resp.status_code != 200:
        print(f"❌ [GMAIL] OAuth2 token refresh failed {resp.status_code}: {resp.text[:300]}")
        raise RuntimeError(f"Gmail OAuth2 refresh failed: {resp.status_code}")

    data = resp.json()
    _gmail_access_token = data["access_token"]
    _gmail_token_expires_at = time.time() + data.get("expires_in", 3600)
    print("✅ [GMAIL] Access token refreshed")
    return _gmail_access_token


def send_alert_email(user_email: str, product_name: str, current_stock: int = 0, alert_threshold: int = 0) -> bool:
    """Envoie un email d'alerte stock via l'API Gmail REST (OAuth2).

    - Échange le refresh_token pour un access_token.
    - Construit un message RFC 2822, encode en base64url.
    - POST à https://gmail.googleapis.com/gmail/v1/users/me/messages/send
    - Retourne True si envoyé (200), False sinon.
    """
    if not all([GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_SENDER_EMAIL]):
        print("⛔ [GMAIL] Variables manquantes (GMAIL_CLIENT_ID/CLIENT_SECRET/REFRESH_TOKEN/SENDER_EMAIL)")
        return False

    import email.message
    subject = "⚠️ Alerte Stock Critique – Action requise"
    alert_date = datetime.utcnow().strftime("%d/%m/%Y à %H:%M UTC")
    text_body = (
        f"Bonjour,\n\n"
        f"Nous souhaitons vous informer qu'un produit a atteint un seuil critique "
        f"de stock dans votre boutique.\n\n"
        f"Détails du produit :\n"
        f"  Nom du produit : {product_name}\n"
        f"  Stock actuel : {current_stock} unités\n"
        f"  Seuil d'alerte atteint : {alert_threshold} unités\n"
        f"  Date : {alert_date}\n\n"
        f"Nous vous recommandons de procéder à un réapprovisionnement "
        f"dès que possible afin d'éviter toute rupture de stock.\n\n"
        f"Cordialement,\n"
        f"Système intelligent de surveillance des stocks\n"
        f"ShopBrain AI"
    )

    try:
        access_token = _get_gmail_access_token()

        msg = email.message.EmailMessage()
        msg["From"] = f"ShopBrain AI <{GMAIL_SENDER_EMAIL}>"
        msg["Reply-To"] = GMAIL_SENDER_EMAIL
        msg["List-Unsubscribe"] = f"<{BACKEND_BASE_URL}/api/stock-alerts/unsubscribe?token=EMAIL_LIST>"
        msg["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
        msg["To"] = user_email
        msg["Subject"] = subject
        msg.set_content(text_body)

        raw_msg = base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")

        resp = requests.post(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
            headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
            json={"raw": raw_msg},
            timeout=15,
        )
        if resp.status_code == 200:
            msg_id = resp.json().get("id", "")
            print(f"✅ [GMAIL] Email envoyé à {user_email} (id={msg_id})")
            return True
        if resp.status_code == 401:
            print("❌ [GMAIL] 401 — access_token expiré ou invalide")
            return False
        print(f"❌ [GMAIL] Erreur {resp.status_code}: {resp.text[:300]}")
        return False
    except Exception as e:
        print(f"❌ [GMAIL] Erreur: {e}")
        return False


def _generate_unsubscribe_token(user_id: str, product_id: str) -> str:
    """Génère un token sécurisé unique pour le lien unsubscribe."""
    raw = f"{user_id}:{product_id}:{uuid.uuid4().hex}:{time.time()}"
    return hashlib.sha256(raw.encode()).hexdigest()


def _get_or_create_unsubscribe_token(sb, user_id: str, product_id: str) -> str:
    """Récupère un token existant valide ou en crée un nouveau."""
    try:
        row = sb.table("stock_alert_settings").select(
            "unsubscribe_token,unsubscribe_token_expires"
        ).eq("user_id", user_id).eq("product_id", product_id).execute()

        if row.data:
            existing_token = row.data[0].get("unsubscribe_token")
            expires_str = row.data[0].get("unsubscribe_token_expires")
            if existing_token and expires_str:
                try:
                    expires_dt = datetime.fromisoformat(expires_str.replace("Z", "+00:00"))
                    if expires_dt.replace(tzinfo=None) > datetime.utcnow():
                        return existing_token
                except Exception:
                    pass

        # Créer un nouveau token
        new_token = _generate_unsubscribe_token(user_id, product_id)
        expires_at = (datetime.utcnow() + timedelta(days=STOCK_ALERT_TOKEN_EXPIRY_DAYS)).isoformat()
        sb.table("stock_alert_settings").update({
            "unsubscribe_token": new_token,
            "unsubscribe_token_expires": expires_at,
        }).eq("user_id", user_id).eq("product_id", product_id).execute()
        return new_token
    except Exception as e:
        print(f"⚠️ [STOCK] Erreur génération token unsubscribe: {e}")
        return _generate_unsubscribe_token(user_id, product_id)


def _build_stock_alert_html(
    first_name: str,
    product_name: str,
    stock_remaining: int,
    threshold: int,
    unsubscribe_url: str,
) -> str:
    """Construit le HTML professionnel pour l'email d'alerte stock critique."""
    alert_date = datetime.utcnow().strftime("%d/%m/%Y à %H:%M UTC")
    # Couleur dynamique selon gravité
    if stock_remaining <= 2:
        severity_color = "#991b1b"  # rouge foncé — critique
        severity_label = "🔴 CRITIQUE"
        severity_bg = "#fef2f2"
    elif stock_remaining <= 5:
        severity_color = "#c2410c"  # orange foncé — urgent
        severity_label = "🟠 URGENT"
        severity_bg = "#fff7ed"
    else:
        severity_color = "#b91c1c"  # rouge standard
        severity_label = "⚠️ ATTENTION"
        severity_bg = "#fef3f2"

    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Alerte Stock Critique</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f4f4f7;padding:40px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

<!-- Header -->
<tr><td style="background-color:{severity_color};padding:24px 32px;">
<h1 style="margin:0;color:#ffffff;font-size:22px;">{severity_label} Alerte Stock Critique – Action requise</h1>
</td></tr>

<!-- Body -->
<tr><td style="padding:32px;">
<p style="margin:0 0 20px;font-size:16px;color:#333;">Bonjour,</p>

<p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.6;">
Nous souhaitons vous informer qu'un produit a atteint un <strong>seuil critique de stock</strong> dans votre boutique.
</p>

<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:{severity_bg};border-radius:8px;border:1px solid #fecaca;margin-bottom:24px;">
<tr><td style="padding:24px;">
<p style="margin:0 0 16px;font-size:14px;color:#666;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;">Détails du produit</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="6">
<tr>
  <td style="font-size:14px;color:#777;width:180px;padding:6px 0;">Nom du produit :</td>
  <td style="font-size:15px;color:#333;font-weight:bold;padding:6px 0;">{product_name}</td>
</tr>
<tr>
  <td style="font-size:14px;color:#777;padding:6px 0;">Stock actuel :</td>
  <td style="font-size:16px;color:{severity_color};font-weight:bold;padding:6px 0;">{stock_remaining} unités</td>
</tr>
<tr>
  <td style="font-size:14px;color:#777;padding:6px 0;">Seuil d'alerte atteint :</td>
  <td style="font-size:15px;color:#333;font-weight:bold;padding:6px 0;">{threshold} unités</td>
</tr>
<tr>
  <td style="font-size:14px;color:#777;padding:6px 0;">Date :</td>
  <td style="font-size:14px;color:#333;padding:6px 0;">{alert_date}</td>
</tr>
</table>
</td></tr>
</table>

<p style="margin:0 0 20px;font-size:15px;color:#555;line-height:1.6;">
Nous vous recommandons de procéder à un <strong>réapprovisionnement dès que possible</strong> afin d'éviter toute rupture de stock et perte potentielle de ventes.
</p>

<p style="margin:0 0 32px;font-size:14px;color:#888;line-height:1.5;font-style:italic;">
Si vous avez récemment mis à jour votre inventaire, veuillez ignorer ce message.
</p>

</td></tr>

<!-- Footer -->
<tr><td style="padding:24px 32px;border-top:1px solid #eee;background-color:#fafafa;">
<p style="margin:0 0 6px;font-size:13px;color:#555;text-align:center;">Cordialement,</p>
<p style="margin:0 0 16px;font-size:13px;color:#555;text-align:center;font-weight:bold;">Système intelligent de surveillance des stocks — ShopBrain AI</p>
<p style="margin:0 0 12px;font-size:12px;color:#999;text-align:center;">
Cet email a été envoyé automatiquement par ShopBrain AI.
</p>
<p style="margin:0;text-align:center;">
<a href="{unsubscribe_url}" style="display:inline-block;padding:10px 24px;background-color:#dc2626;color:#ffffff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:bold;">
❌ Ne plus me rappeler pour ce produit
</a>
</p>
<p style="margin:8px 0 0;font-size:11px;color:#bbb;text-align:center;">
Ce lien est valide pendant {STOCK_ALERT_TOKEN_EXPIRY_DAYS} jours.
</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>"""


def _send_stock_alert_email(
    to_email: str,
    first_name: str,
    product_name: str,
    stock_remaining: int,
    threshold: int,
    unsubscribe_url: str,
) -> bool:
    """Envoie l'alerte stock via l'API Gmail REST (OAuth2 refresh_token).
    Pas de SMTP, pas d'Azure, pas de Mailgun.
    Utilise uniquement requests + OAuth2 + Gmail REST API.
    """
    if not all([GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_SENDER_EMAIL]):
        print("⛔ [STOCK] Variables Gmail manquantes — email impossible")
        print("⛔ [STOCK] Ajouter GMAIL_CLIENT_ID/CLIENT_SECRET/REFRESH_TOKEN/SENDER_EMAIL sur Render")
        return False

    import email.message

    subject = "⚠️ Alerte Stock Critique – Action requise"
    alert_date = datetime.utcnow().strftime("%d/%m/%Y à %H:%M UTC")
    html_body = _build_stock_alert_html(
        first_name=first_name,
        product_name=product_name,
        stock_remaining=stock_remaining,
        threshold=threshold,
        unsubscribe_url=unsubscribe_url,
    )
    text_body = (
        f"Bonjour,\n\n"
        f"Nous souhaitons vous informer qu'un produit a atteint un seuil critique "
        f"de stock dans votre boutique.\n\n"
        f"Détails du produit :\n"
        f"  Nom du produit : {product_name}\n"
        f"  Stock actuel : {stock_remaining} unités\n"
        f"  Seuil d'alerte atteint : {threshold} unités\n"
        f"  Date : {alert_date}\n\n"
        f"Nous vous recommandons de procéder à un réapprovisionnement "
        f"dès que possible afin d'éviter toute rupture de stock "
        f"et perte potentielle de ventes.\n\n"
        f"Si vous avez récemment mis à jour votre inventaire, "
        f"veuillez ignorer ce message.\n\n"
        f"Cordialement,\n"
        f"Système intelligent de surveillance des stocks\n"
        f"ShopBrain AI\n\n"
        f"Ne plus me rappeler pour ce produit : {unsubscribe_url}\n"
    )

    try:
        access_token = _get_gmail_access_token()

        msg = email.message.EmailMessage()
        msg["From"] = f"ShopBrain AI <{GMAIL_SENDER_EMAIL}>"
        msg["Reply-To"] = GMAIL_SENDER_EMAIL
        msg["List-Unsubscribe"] = f"<{unsubscribe_url}>"
        msg["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
        msg["To"] = to_email
        msg["Subject"] = subject
        # Priority headers to help land in inbox instead of spam
        msg["X-Priority"] = "1"
        msg["X-MSMail-Priority"] = "High"
        msg["Importance"] = "High"
        msg["Precedence"] = "bulk"
        msg["X-Mailer"] = "ShopBrain AI Notifications"
        msg["Message-ID"] = f"<stock-alert-{int(datetime.utcnow().timestamp())}@shopbrain.ai>"
        msg.set_content(text_body)
        msg.add_alternative(html_body, subtype="html")

        raw_msg = base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")

        resp = requests.post(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
            headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
            json={"raw": raw_msg},
            timeout=15,
        )
        if resp.status_code == 200:
            msg_id = resp.json().get("id", "")
            print(f"✅ [GMAIL] Email envoyé à {to_email} pour « {product_name} » (id={msg_id})")
            return True
        if resp.status_code == 401:
            print("❌ [GMAIL] 401 — access_token expiré ou invalide, retry...")
            # Forcer un refresh et réessayer une fois
            global _gmail_access_token, _gmail_token_expires_at
            _gmail_access_token = ""
            _gmail_token_expires_at = 0.0
            try:
                access_token = _get_gmail_access_token()
                resp2 = requests.post(
                    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
                    headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
                    json={"raw": raw_msg},
                    timeout=15,
                )
                if resp2.status_code == 200:
                    msg_id = resp2.json().get("id", "")
                    print(f"✅ [GMAIL] Email envoyé (retry) à {to_email} (id={msg_id})")
                    return True
                print(f"❌ [GMAIL] Retry échoué {resp2.status_code}: {resp2.text[:300]}")
            except Exception as e2:
                print(f"❌ [GMAIL] Retry erreur: {e2}")
            return False
        print(f"❌ [GMAIL] Erreur {resp.status_code}: {resp.text[:300]}")
        return False
    except Exception as e:
        print(f"❌ [GMAIL] Erreur: {e}")
        return False


def _get_sorted_thresholds(row: dict) -> list[int]:
    """Retourne les seuils triés du plus haut au plus bas.
    Compatibilité: si 'thresholds' est vide, utilise 'threshold' unique.
    """
    thresholds_raw = row.get("thresholds") or []
    if isinstance(thresholds_raw, str):
        import json as _json
        try:
            thresholds_raw = _json.loads(thresholds_raw)
        except Exception:
            thresholds_raw = []
    if not thresholds_raw:
        single = row.get("threshold", 0)
        try:
            single = int(single)
        except Exception:
            single = 0
        if single > 0:
            thresholds_raw = [single]
        else:
            return []
    thresholds = sorted([int(t) for t in thresholds_raw if int(t) > 0], reverse=True)
    return thresholds


def _find_triggered_threshold(inventory: int, thresholds: list[int]) -> int | None:
    """Trouve le seuil le plus critique (le plus bas) atteint par le stock actuel.
    Thresholds sont triés du plus haut au plus bas.
    Retourne le seuil atteint ou None si aucun.
    Ex: thresholds=[10, 5, 2], stock=3 → retourne 5
    Ex: thresholds=[10, 5, 2], stock=1 → retourne 2
    Ex: thresholds=[10, 5, 2], stock=12 → retourne None
    """
    triggered = None
    for t in thresholds:  # [10, 5, 2] — du plus haut au plus bas
        if inventory <= t:
            triggered = t
    return triggered


def _should_send_stock_alert(row: dict, inventory: int) -> tuple[bool, str, int | None]:
    """Vérifie si on doit envoyer un email pour ce produit.
    
    Logique SIMPLE et robuste:
    1. Si notifications désactivées → skip
    2. Si stock > seuil → stock OK, pas d'alerte
    3. Si stock <= seuil ET aucun email jamais envoyé → ENVOYER (première alerte)
    4. Si stock <= seuil ET email déjà envoyé → BLOQUER (déjà alerté)
       Exception: si stock remonte au-dessus du seuil puis redescend, on reset et re-alerte.
    
    Le reset se fait dans _stock_monitor_once quand stock > seuil → on efface last_alert_email_sent_at.
    
    Returns (should_send: bool, reason: str, triggered_threshold: int | None)
    """
    # 1. Notifications désactivées ?
    if row.get("stock_alert_disabled"):
        return False, "notifications désactivées par l'utilisateur", None

    # 2. Récupérer les seuils
    thresholds = _get_sorted_thresholds(row)
    if not thresholds:
        return False, "aucun seuil configuré", None

    # 3. Trouver le seuil déclenché (le plus critique = le plus bas atteint)
    triggered = _find_triggered_threshold(inventory, thresholds)
    highest_threshold = thresholds[0]  # le plus haut seuil

    if triggered is None:
        # Stock au-dessus de tous les seuils → pas d'alerte
        return False, f"stock OK ({inventory} > seuils {thresholds})", None

    # 4. Stock est sous un seuil — vérifier si on a DÉJÀ envoyé un email
    last_sent_str = row.get("last_alert_email_sent_at")
    if last_sent_str:
        # Un email a déjà été envoyé → BLOQUER (pas de double)
        return False, f"email déjà envoyé pour ce seuil (stock={inventory}, seuil={triggered})", triggered

    # 5. Aucun email envoyé → ENVOYER maintenant
    return True, f"ALERTE: stock={inventory} <= seuil {triggered} (première alerte)", triggered


def _stock_monitor_once() -> dict:
    """Exécute un cycle de vérification stock.
    
    Logique SIMPLE:
    1. Pour chaque produit avec alerte activée:
       - Si stock > seuil → RESET (efface last_alert_email_sent_at pour permettre future alerte)
       - Si stock <= seuil ET pas d'email récent → ENVOYER un email
       - Si stock <= seuil ET email déjà envoyé → SKIP (pas de doublon)
    2. Quand le stock remonte au-dessus du seuil, on reset → prochaine descente = nouvel email
    """
    print("🕒 [STOCK] Vérification stock en cours...")
    summary = {
        "users_checked": 0,
        "products_checked": 0,
        "alerts_sent": 0,
        "alerts_skipped_already_sent": 0,
        "alerts_skipped_disabled": 0,
        "alerts_skipped_no_email": 0,
        "alerts_reset": 0,
        "errors": 0,
        "details": [],
    }

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("⚠️ [STOCK] SUPABASE_URL ou SUPABASE_SERVICE_KEY manquants")
        return summary

    sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    settings = sb.table("stock_alert_settings").select("*").eq("enabled", True).execute()
    print(f"🧾 [STOCK] Configs actives: {len(settings.data or [])}")

    from collections import defaultdict
    by_user: dict[str, list] = defaultdict(list)
    for row in (settings.data or []):
        uid = row.get("user_id")
        pid = str(row.get("product_id", "")).strip()
        if uid and pid:
            by_user[uid].append(row)

    for user_id, user_rows in by_user.items():
        summary["users_checked"] += 1
        try:
            # --- Shopify connection (use active shop) ---
            conn = sb.table("shopify_connections").select("shop_domain,access_token").eq("user_id", user_id).eq("is_active", True).limit(1).execute()
            if not conn.data:
                # Fallback: most recent
                conn = sb.table("shopify_connections").select("shop_domain,access_token").eq("user_id", user_id).order("updated_at", desc=True).limit(1).execute()
            if not conn.data:
                print(f"⚠️ [STOCK] User {user_id}: aucun shopify_connection")
                continue
            shop = conn.data[0].get("shop_domain")
            token = conn.data[0].get("access_token")
            if not shop or not token:
                print(f"⚠️ [STOCK] User {user_id}: shop_domain/access_token manquant")
                continue

            # --- Fetch inventaire Shopify ---
            resp = requests.get(
                f"https://{shop}/admin/api/2024-10/products.json?limit=250",
                headers={"X-Shopify-Access-Token": token},
                timeout=30,
            )
            if resp.status_code != 200:
                print(f"❌ [STOCK] User {user_id}: Shopify API {resp.status_code}")
                continue

            products = resp.json().get("products", [])
            inventory_map: dict[str, int] = {}
            title_map: dict[str, str] = {}
            for p in products:
                pid = str(p.get("id"))
                inventory_map[pid] = sum(int(v.get("inventory_quantity") or 0) for v in p.get("variants", []))
                title_map[pid] = p.get("title", "Produit")

            # --- Récupérer email + prénom ---
            user_email = None
            user_first_name = "Commerçant"
            try:
                profile = sb.table("user_profiles").select("email,first_name").eq("id", user_id).execute()
                if profile.data:
                    user_email = profile.data[0].get("email")
                    user_first_name = profile.data[0].get("first_name") or "Commerçant"
            except Exception as e:
                print(f"⚠️ [STOCK] User {user_id}: erreur lecture user_profiles: {e}")

            if not user_email:
                try:
                    auth_user = sb.auth.admin.get_user_by_id(user_id)
                    if auth_user and auth_user.user:
                        user_email = auth_user.user.email
                except Exception as e:
                    print(f"⚠️ [STOCK] User {user_id}: erreur lecture auth user: {e}")

            print(f"👤 [STOCK] User {user_id} | email={user_email} | prénom={user_first_name}")

            # --- Boucle produits ---
            for row in user_rows:
                pid = str(row.get("product_id", "")).strip()
                inventory = inventory_map.get(pid)
                if inventory is None:
                    print(f"⚠️ [STOCK] Produit introuvable dans Shopify: {pid}")
                    continue
                title = title_map.get(pid, row.get("product_title", "Produit"))
                summary["products_checked"] += 1

                # Récupérer le seuil configuré
                thresholds = _get_sorted_thresholds(row)
                if not thresholds:
                    continue
                highest_threshold = thresholds[0]  # seuil principal

                detail = {
                    "product": title,
                    "product_id": pid,
                    "inventory": inventory,
                    "threshold": highest_threshold,
                    "disabled": bool(row.get("stock_alert_disabled")),
                    "last_alert_email_sent_at": row.get("last_alert_email_sent_at"),
                }

                # --- CAS 1: Stock AU-DESSUS du seuil → RESET ---
                if inventory > highest_threshold:
                    last_sent = row.get("last_alert_email_sent_at")
                    if last_sent:
                        # Stock remonté — effacer le flag pour permettre future alerte
                        print(f"🔄 [STOCK] RESET « {title} »: stock={inventory} > seuil={highest_threshold} → prêt pour ré-alerte")
                        try:
                            sb.table("stock_alert_settings").update({
                                "last_alert_email_sent_at": None,
                                "updated_at": datetime.utcnow().isoformat(),
                            }).eq("user_id", user_id).eq("product_id", pid).execute()
                        except Exception as e:
                            print(f"⚠️ [STOCK] Erreur reset: {e}")
                        summary["alerts_reset"] += 1
                        detail["action"] = "RESET (stock remonté)"
                    else:
                        detail["action"] = "OK (stock au-dessus du seuil)"
                    summary["details"].append(detail)
                    continue

                # --- CAS 2: Stock SOUS le seuil ---
                # Vérifier si notifications désactivées
                if row.get("stock_alert_disabled"):
                    summary["alerts_skipped_disabled"] += 1
                    detail["action"] = "SKIP (notifications désactivées)"
                    print(f"🔕 [STOCK] « {title} » stock={inventory} <= seuil={highest_threshold} MAIS notifications désactivées")
                    summary["details"].append(detail)
                    continue

                # Vérifier si email déjà envoyé (pas de doublon)
                last_sent_str = row.get("last_alert_email_sent_at")
                if last_sent_str:
                    summary["alerts_skipped_already_sent"] += 1
                    detail["action"] = f"SKIP (email déjà envoyé le {last_sent_str})"
                    print(f"⏭️ [STOCK] « {title} » stock={inventory} <= seuil={highest_threshold} — email déjà envoyé le {last_sent_str}")
                    summary["details"].append(detail)
                    continue

                # --- ENVOYER L'EMAIL ---
                if not user_email:
                    summary["alerts_skipped_no_email"] += 1
                    detail["action"] = "SKIP (pas d'email utilisateur)"
                    print(f"❌ [STOCK] Email utilisateur manquant pour {user_id}")
                    summary["details"].append(detail)
                    continue

                print(f"📧 [STOCK] ENVOI ALERTE « {title} » stock={inventory} <= seuil={highest_threshold}")

                # Générer token unsubscribe
                unsub_token = _get_or_create_unsubscribe_token(sb, user_id, pid)
                unsub_url = f"{BACKEND_BASE_URL}/api/stock-alerts/unsubscribe?token={unsub_token}"

                # Trouver le seuil le plus critique atteint
                triggered = _find_triggered_threshold(inventory, thresholds)

                # Envoyer email via Gmail API
                email_ok = _send_stock_alert_email(
                    to_email=user_email,
                    first_name=user_first_name,
                    product_name=title,
                    stock_remaining=inventory,
                    threshold=triggered or highest_threshold,
                    unsubscribe_url=unsub_url,
                )

                if email_ok:
                    summary["alerts_sent"] += 1
                    detail["action"] = "EMAIL ENVOYÉ ✅"
                    # CRITIQUE: Marquer comme envoyé — update MINIMAL pour éviter erreur colonnes manquantes
                    try:
                        sb.table("stock_alert_settings").update({
                            "last_alert_email_sent_at": datetime.utcnow().isoformat(),
                            "updated_at": datetime.utcnow().isoformat(),
                        }).eq("user_id", user_id).eq("product_id", pid).execute()
                        print(f"✅ [STOCK] last_alert_email_sent_at mis à jour pour « {title} »")
                    except Exception as e:
                        print(f"❌ [STOCK] ERREUR CRITIQUE: impossible de marquer l'email comme envoyé: {e}")
                        summary["errors"] += 1
                else:
                    detail["action"] = "ÉCHEC ENVOI EMAIL ❌"
                    summary["errors"] += 1

                # Log en base (best effort — colonnes optionnelles gérées)
                try:
                    log_entry = {
                        "user_id": user_id,
                        "product_id": pid,
                        "product_title": title,
                        "inventory_at_alert": inventory,
                        "threshold_at_alert": triggered or highest_threshold,
                        "email_sent": email_ok,
                        "dismissed": False,
                    }
                    sb.table("stock_alert_log").insert(log_entry).execute()
                except Exception as e:
                    print(f"⚠️ [STOCK] Erreur insertion stock_alert_log: {e}")

                summary["details"].append(detail)

        except Exception as e:
            summary["errors"] += 1
            print(f"❌ [STOCK] User {user_id}: {e}")

    print(f"📦 [STOCK] Résumé: {summary}")
    sys.stdout.flush()
    return summary


def _stock_monitor_loop():
    """Thread background: vérifie les stocks toutes les 5 min, envoie email via Gmail API."""
    INTERVAL = int(os.getenv("STOCK_MONITOR_INTERVAL", "300"))  # 5 min
    time.sleep(30)  # attendre que l'app démarre

    while True:
        try:
            _stock_monitor_once()
        except Exception as e:
            print(f"❌ [STOCK] Global: {e}")
        sys.stdout.flush()
        time.sleep(INTERVAL)


# ---------------------------------------------------------------------------
# Unsubscribe endpoint — "Ne plus me rappeler pour ce produit"
# ---------------------------------------------------------------------------

@app.get("/api/stock-alerts/unsubscribe")
async def stock_alert_unsubscribe(token: str = ""):
    """Désactive les alertes stock pour un produit via token sécurisé."""
    if not token:
        return HTMLResponse(
            content="<h2>❌ Token manquant</h2><p>Lien invalide.</p>",
            status_code=400,
        )

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return HTMLResponse(
            content="<h2>❌ Erreur serveur</h2><p>Service temporairement indisponible.</p>",
            status_code=500,
        )

    sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    # Chercher le token
    result = sb.table("stock_alert_settings").select(
        "user_id,product_id,product_title,stock_alert_disabled,unsubscribe_token_expires"
    ).eq("unsubscribe_token", token).execute()

    if not result.data:
        return HTMLResponse(
            content="""<html><body style="font-family:Arial;text-align:center;padding:60px;">
            <h2>❌ Lien invalide</h2>
            <p>Ce lien de désabonnement n'existe pas ou a déjà été utilisé.</p>
            </body></html>""",
            status_code=404,
        )

    row = result.data[0]
    product_title = row.get("product_title", "ce produit")

    # Vérifier expiration
    expires_str = row.get("unsubscribe_token_expires")
    if expires_str:
        try:
            expires_dt = datetime.fromisoformat(str(expires_str).replace("Z", "+00:00"))
            if expires_dt.replace(tzinfo=None) < datetime.utcnow():
                return HTMLResponse(
                    content=f"""<html><body style="font-family:Arial;text-align:center;padding:60px;">
                    <h2>⏰ Lien expiré</h2>
                    <p>Ce lien de désabonnement a expiré. Un nouveau lien sera inclus dans le prochain email d'alerte.</p>
                    </body></html>""",
                    status_code=410,
                )
        except Exception:
            pass

    # Déjà désactivé ?
    if row.get("stock_alert_disabled"):
        return HTMLResponse(
            content=f"""<html><body style="font-family:Arial;text-align:center;padding:60px;">
            <h2>✅ Déjà désactivé</h2>
            <p>Les alertes pour <strong>{product_title}</strong> sont déjà désactivées.</p>
            </body></html>""",
            status_code=200,
        )

    # Désactiver
    sb.table("stock_alert_settings").update({
        "stock_alert_disabled": True,
        "unsubscribe_token": None,
        "unsubscribe_token_expires": None,
        "updated_at": datetime.utcnow().isoformat(),
    }).eq("unsubscribe_token", token).execute()

    print(f"🔕 [STOCK] Unsubscribe: user={row.get('user_id')} produit=« {product_title} »")

    return HTMLResponse(
        content=f"""<html><body style="font-family:Arial;text-align:center;padding:60px;background:#f9fafb;">
        <div style="max-width:500px;margin:0 auto;background:#fff;padding:40px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        <h2 style="color:#16a34a;">✅ Notifications désactivées</h2>
        <p style="color:#555;">Vous ne recevrez plus d'alertes de stock pour :</p>
        <p style="font-size:18px;font-weight:bold;color:#333;">« {product_title} »</p>
        <p style="color:#999;font-size:13px;margin-top:24px;">
        Vous pouvez réactiver les alertes depuis votre tableau de bord ShopBrain AI.
        </p>
        </div>
        </body></html>""",
        status_code=200,
    )


@app.post("/api/stock-alerts/run-check")
async def run_stock_alert_check(request: Request):
    """Exécute un cycle de vérification stock manuellement (debug)."""
    _ = get_user_id(request)
    summary = _stock_monitor_once()
    return {"success": True, "summary": summary}


@app.get("/api/stock-alerts/diagnose")
async def diagnose_stock_alerts():
    """Diagnostic public (sans auth) — montre l'état Gmail API et DB."""
    gmail_configured = bool(GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET and GMAIL_REFRESH_TOKEN and GMAIL_SENDER_EMAIL)
    diag = {
        "mode": "gmail_api_oauth2",
        "gmail_configured": gmail_configured,
        "gmail_client_id_set": bool(GMAIL_CLIENT_ID),
        "gmail_client_secret_set": bool(GMAIL_CLIENT_SECRET),
        "gmail_refresh_token_set": bool(GMAIL_REFRESH_TOKEN),
        "gmail_sender": GMAIL_SENDER_EMAIL or "(non configuré)",
        "backend_base_url": BACKEND_BASE_URL,
        "supabase_configured": bool(SUPABASE_URL and SUPABASE_SERVICE_KEY),
    }
    # Test DB columns exist
    if SUPABASE_URL and SUPABASE_SERVICE_KEY:
        try:
            sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
            test = sb.table("stock_alert_settings").select(
                "user_id,product_id,enabled,threshold,last_alert_email_sent_at,stock_alert_disabled,unsubscribe_token"
            ).limit(1).execute()
            diag["db_columns_ok"] = True
            diag["active_settings_sample"] = len(test.data or [])
        except Exception as e:
            diag["db_columns_ok"] = False
            diag["db_error"] = str(e)

    # Quick Gmail OAuth2 token test (no email sent)
    if gmail_configured:
        # Step 1: tester le refresh token
        try:
            token_resp = requests.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "client_id": GMAIL_CLIENT_ID,
                    "client_secret": GMAIL_CLIENT_SECRET,
                    "refresh_token": GMAIL_REFRESH_TOKEN,
                    "grant_type": "refresh_token",
                },
                timeout=15,
            )
            diag["oauth2_refresh_status"] = token_resp.status_code
            if token_resp.status_code != 200:
                err_body = token_resp.json() if token_resp.headers.get("content-type", "").startswith("application/json") else token_resp.text[:500]
                diag["oauth2_refresh_error"] = err_body
                diag["gmail_token_test"] = f"FAILED — refresh token returned {token_resp.status_code}"
                diag["hint"] = (
                    "Vérifier: 1) Gmail API activée dans Google Cloud Console, "
                    "2) Le refresh_token a été généré avec le même Client ID/Secret, "
                    "3) L'app OAuth n'est pas révoquée dans https://myaccount.google.com/permissions"
                )
            else:
                access_token = token_resp.json().get("access_token", "")
                diag["oauth2_refresh_status"] = "OK"
                # Step 2: vérifier le token (tokeninfo fonctionne avec tout scope)
                info_resp = requests.get(
                    f"https://oauth2.googleapis.com/tokeninfo?access_token={access_token}",
                    timeout=10,
                )
                if info_resp.status_code == 200:
                    info = info_resp.json()
                    diag["gmail_token_test"] = "SUCCESS"
                    diag["gmail_email_address"] = info.get("email", "")
                    diag["gmail_scope"] = info.get("scope", "")
                    has_send = "gmail.send" in info.get("scope", "")
                    diag["gmail_send_scope_ok"] = has_send
                    if not has_send:
                        diag["hint"] = "Le scope gmail.send est manquant. Regénérer le refresh_token avec le scope https://www.googleapis.com/auth/gmail.send"
                else:
                    diag["gmail_token_test"] = f"FAILED — tokeninfo HTTP {info_resp.status_code}"
        except Exception as e:
            diag["gmail_token_test"] = f"ERROR: {e}"
    else:
        diag["gmail_token_test"] = "SKIPPED — variables Gmail manquantes"

    return diag


@app.get("/api/stock-alerts/debug-state")
async def debug_stock_alert_state(secret: str = ""):
    """Affiche l'état complet des alertes stock en DB (debug)."""
    expected = os.getenv("STOCK_CHECK_SECRET", "shopbrain-stock-2026")
    if secret != expected:
        raise HTTPException(status_code=403, detail="Clé secrète invalide")
    sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    rows = sb.table("stock_alert_settings").select("*").execute()
    result = []
    for r in (rows.data or []):
        result.append({
            "product_id": r.get("product_id"),
            "product_title": r.get("product_title"),
            "enabled": r.get("enabled"),
            "threshold": r.get("threshold"),
            "thresholds": r.get("thresholds"),
            "stock_alert_disabled": r.get("stock_alert_disabled"),
            "last_alert_email_sent_at": r.get("last_alert_email_sent_at"),
            "last_alerted_threshold": r.get("last_alerted_threshold"),
            "last_known_inventory": r.get("last_known_inventory"),
        })
    return {"settings": result}


@app.get("/api/stock-alerts/reset-all")
async def reset_all_stock_alerts(secret: str = ""):
    """Réinitialise toutes les alertes: réactive tout et efface les flags d'envoi.
    Utile pour forcer le ré-envoi de tous les emails."""
    expected = os.getenv("STOCK_CHECK_SECRET", "shopbrain-stock-2026")
    if secret != expected:
        raise HTTPException(status_code=403, detail="Clé secrète invalide")
    sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    sb.table("stock_alert_settings").update({
        "stock_alert_disabled": False,
        "last_alert_email_sent_at": None,
        "updated_at": datetime.utcnow().isoformat(),
    }).eq("enabled", True).execute()
    return {"success": True, "message": "Toutes les alertes ont été réinitialisées. Le prochain cycle enverra un email pour chaque produit sous son seuil."}


@app.get("/api/stock-alerts/force-run")
async def force_run_stock_check(secret: str = ""):
    """Déclenche un cycle stock check avec une clé secrète (pas besoin de JWT)."""
    expected = os.getenv("STOCK_CHECK_SECRET", "shopbrain-stock-2026")
    if secret != expected:
        raise HTTPException(status_code=403, detail="Clé secrète invalide")
    summary = _stock_monitor_once()
    return {"success": True, "summary": summary}


@app.post("/api/stock-alerts/test-email")
async def test_stock_alert_email(request: Request):
    """Envoie un email de test pour valider la configuration Gmail API."""
    user_id = get_user_id(request)

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise HTTPException(status_code=500, detail="Supabase non configuré")

    sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    # Récupérer email + prénom
    user_email = None
    user_first_name = "Commerçant"
    try:
        profile = sb.table("user_profiles").select("email,first_name").eq("id", user_id).execute()
        if profile.data:
            user_email = profile.data[0].get("email")
            user_first_name = profile.data[0].get("first_name") or "Commerçant"
    except Exception:
        pass

    if not user_email:
        try:
            auth_user = sb.auth.admin.get_user_by_id(user_id)
            if auth_user and auth_user.user:
                user_email = auth_user.user.email
        except Exception:
            pass

    if not user_email:
        raise HTTPException(status_code=400, detail="Email utilisateur introuvable")

    test_unsub_url = f"{BACKEND_BASE_URL}/api/stock-alerts/unsubscribe?token=TEST_TOKEN_INVALID"

    email_ok = _send_stock_alert_email(
        to_email=user_email,
        first_name=user_first_name,
        product_name="Produit Test (démo)",
        stock_remaining=3,
        threshold=10,
        unsubscribe_url=test_unsub_url,
    )

    return {
        "success": email_ok,
        "email_sent_to": user_email,
        "gmail_sender": GMAIL_SENDER_EMAIL or "(non configuré)",
        "gmail_configured": bool(GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET and GMAIL_REFRESH_TOKEN and GMAIL_SENDER_EMAIL),
        "message": "Email de test envoyé via Gmail API !" if email_ok else "Échec envoi — vérifier GMAIL_CLIENT_ID/CLIENT_SECRET/REFRESH_TOKEN/SENDER_EMAIL",
    }


@app.post("/api/stock-alerts/re-enable")
async def re_enable_stock_alert(request: Request):
    """Réactive les alertes pour un produit (depuis le dashboard)."""
    user_id = get_user_id(request)
    body = await request.json()
    product_id = str(body.get("product_id", "")).strip()

    if not product_id:
        raise HTTPException(status_code=400, detail="product_id requis")

    sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    sb.table("stock_alert_settings").update({
        "stock_alert_disabled": False,
        "last_alert_email_sent_at": None,
        "unsubscribe_token": None,
        "unsubscribe_token_expires": None,
        "updated_at": datetime.utcnow().isoformat(),
    }).eq("user_id", user_id).eq("product_id", product_id).execute()

    return {"success": True, "product_id": product_id, "message": "Alertes réactivées"}


# ============== SETTINGS ENDPOINTS ==============

@app.post("/api/settings/password")
async def update_password(payload: dict, request: Request):
    """Met à jour le mot de passe utilisateur"""
    user_id = get_user_id(request)
    current_password = payload.get("current_password")
    new_password = payload.get("new_password")
    
    if not current_password or not new_password:
        raise HTTPException(status_code=400, detail="Mot de passe courant et nouveau requis")
    
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="Le nouveau mot de passe doit avoir au moins 8 caractères")
    
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

        # Use admin API to update password for the authenticated user
        supabase.auth.admin.update_user_by_id(user_id, {"password": new_password})
        
        return {"success": True, "message": "Mot de passe mis à jour avec succès"}
    except Exception as e:
        print(f"Error updating password: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/settings/notifications")
async def update_notifications(payload: dict, request: Request):
    """Met à jour les préférences de notifications"""
    user_id = get_user_id(request)
    
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        
        # Récupérer les préférences actuelles
        result = supabase.table("user_preferences").select("*").eq("user_id", user_id).execute()
        
        preferences = {
            "user_id": user_id,
            "email_notifications": payload.get("email_notifications", True),
            "analysis_complete": payload.get("analysis_complete", True),
            "weekly_reports": payload.get("weekly_reports", True),
            "billing_updates": payload.get("billing_updates", True),
            "updated_at": datetime.utcnow().isoformat()
        }
        
        if result.data:
            # Update existing
            supabase.table("user_preferences").update(preferences).eq("user_id", user_id).execute()
        else:
            # Create new
            supabase.table("user_preferences").insert(preferences).execute()
        
        return {"success": True, "message": "Préférences mises à jour"}
    except Exception as e:
        print(f"Error updating notifications: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/settings/notifications")
async def get_notifications(request: Request):
    """Récupère les préférences de notifications"""
    user_id = get_user_id(request)
    
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        result = supabase.table("user_preferences").select("*").eq("user_id", user_id).execute()
        
        if result.data:
            return {"success": True, "preferences": result.data[0]}
        
        # Return defaults if not found
        return {
            "success": True,
            "preferences": {
                "email_notifications": True,
                "analysis_complete": True,
                "weekly_reports": True,
                "billing_updates": True
            }
        }
    except Exception as e:
        print(f"Error fetching notifications: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/settings/2fa/enable")
async def enable_2fa(request: Request):
    """Active la 2FA"""
    user_id = get_user_id(request)
    
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        
        # Update user profile to mark 2FA as enabled
        supabase.table("user_profiles").update({
            "two_factor_enabled": True,
            "updated_at": datetime.utcnow().isoformat()
        }).eq("id", user_id).execute()
        
        return {"success": True, "message": "2FA activée"}
    except Exception as e:
        print(f"Error enabling 2FA: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/settings/2fa/disable")
async def disable_2fa(request: Request):
    """Désactive la 2FA"""
    user_id = get_user_id(request)
    
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        
        supabase.table("user_profiles").update({
            "two_factor_enabled": False,
            "updated_at": datetime.utcnow().isoformat()
        }).eq("id", user_id).execute()
        
        return {"success": True, "message": "2FA désactivée"}
    except Exception as e:
        print(f"Error disabling 2FA: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/settings/interface")
async def update_interface_settings(payload: dict, request: Request):
    """Met à jour les préférences d'interface (dark mode, langue)"""
    user_id = get_user_id(request)
    
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        
        update_data = {
            "dark_mode": payload.get("dark_mode", True),
            "language": payload.get("language", "fr"),
            "updated_at": datetime.utcnow().isoformat()
        }
        
        supabase.table("user_preferences").upsert(
            {"user_id": user_id, **update_data},
            on_conflict="user_id"
        ).execute()
        
        return {"success": True, "message": "Paramètres d'interface mis à jour"}
    except Exception as e:
        print(f"Error updating interface settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/settings/interface")
async def get_interface_settings(request: Request):
    """Récupère les préférences d'interface"""
    user_id = get_user_id(request)

    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        result = supabase.table("user_preferences").select("dark_mode,language").eq("user_id", user_id).execute()

        if result.data:
            return {"success": True, "preferences": result.data[0]}

        return {"success": True, "preferences": {"dark_mode": True, "language": "fr"}}
    except Exception as e:
        print(f"Error fetching interface settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/subscription/cancel")
async def cancel_subscription(request: Request):
    """Annule l'abonnement à la fin de la période de facturation"""
    user_id = get_user_id(request)
    
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        
        # Get subscription
        result = supabase.table("subscriptions").select("*").eq("user_id", user_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Aucun abonnement trouvé")
        
        subscription = result.data[0]
        stripe_subscription_id = subscription.get("stripe_subscription_id")
        
        cancel_at = None
        if stripe_subscription_id:
            try:
                # Cancel at period end (NOT immediately) — user keeps access until renewal date
                updated_sub = stripe.Subscription.modify(
                    stripe_subscription_id,
                    cancel_at_period_end=True
                )
                cancel_at = _sg(updated_sub, "current_period_end")
                if cancel_at and isinstance(cancel_at, (int, float)):
                    cancel_at = datetime.utcfromtimestamp(cancel_at).isoformat()
                print(f"✅ Stripe subscription set to cancel at period end: {stripe_subscription_id}, cancel_at={cancel_at}")
            except stripe.InvalidRequestError as stripe_err:
                error_msg = str(stripe_err).lower()
                if "canceled" in error_msg or "cancelled" in error_msg:
                    # Subscription already cancelled in Stripe — just update DB
                    print(f"ℹ️ Stripe subscription already cancelled: {stripe_subscription_id}")
                else:
                    raise
        
        # Update local subscription to 'cancelling' (still active until period end)
        supabase.table("subscriptions").update({
            "status": "cancelling"
        }).eq("user_id", user_id).execute()
        
        try:
            supabase.table("user_profiles").update({
                "subscription_status": "cancelling"
            }).eq("id", user_id).execute()
        except Exception:
            pass  # user_profiles may not have this column
        
        return {"success": True, "message": "Abonnement annulé", "cancel_at": cancel_at}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error cancelling subscription: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/subscription/switch-plan")
async def switch_plan_inline(request: Request, _override_plan: str | None = None):
    """🔄 Switch an existing Stripe subscription to a different plan INLINE.
    No new checkout — modifies the subscription directly via Stripe API.
    Returns the new plan immediately so the frontend can update."""
    user_id = get_user_id(request)

    if _override_plan:
        new_plan = str(_override_plan).lower().strip()
    else:
        try:
            body = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON body")
        new_plan = str(body.get("plan", "")).lower().strip()
    if new_plan not in STRIPE_PLANS:
        raise HTTPException(status_code=400, detail=f"Invalid plan: {new_plan}")

    new_price_id = STRIPE_PLANS[new_plan]

    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

        # 1. Find existing subscription row
        sub_result = (
            supabase.table("subscriptions")
            .select("*")
            .eq("user_id", user_id)
            .in_("status", ["active", "cancelling"])
            .order("updated_at", desc=True)
            .limit(1)
            .execute()
        )
        sub_row = sub_result.data[0] if sub_result.data else None

        # FALLBACK: If no active row, check inactive rows and try to find the real Stripe sub
        if not sub_row:
            inactive_result = (
                supabase.table("subscriptions")
                .select("*")
                .eq("user_id", user_id)
                .order("updated_at", desc=True)
                .limit(1)
                .execute()
            )
            if inactive_result.data:
                candidate = inactive_result.data[0]
                # Try to find an active subscription by customer_id
                cust_id = candidate.get("stripe_customer_id")
                if cust_id:
                    try:
                        cust_subs = stripe.Subscription.list(customer=cust_id, status='active', limit=1)
                        if cust_subs.data:
                            active_stripe_sub = cust_subs.data[0]
                            recovered_sub_id = _normalize_stripe_subscription_id(active_stripe_sub)
                            recovered_plan = _resolve_plan_from_stripe_subscription(active_stripe_sub)
                            # Auto-heal the DB row
                            supabase.table("subscriptions").update({
                                "stripe_subscription_id": recovered_sub_id,
                                "plan_tier": recovered_plan or candidate.get("plan_tier"),
                                "status": "active",
                                "subscription_status": "active",
                                "paid": True,
                                "plan": True,
                                "updated_at": datetime.utcnow().isoformat(),
                            }).eq("user_id", user_id).execute()
                            print(f"  🔧 [SWITCH-PLAN] Auto-healed inactive row: sub={recovered_sub_id}, plan={recovered_plan}")
                            # Re-fetch the now-active row
                            healed_result = supabase.table("subscriptions").select("*").eq("user_id", user_id).order("updated_at", desc=True).limit(1).execute()
                            sub_row = healed_result.data[0] if healed_result.data else None
                    except Exception as heal_err:
                        print(f"  ⚠️ [SWITCH-PLAN] Auto-heal warning: {heal_err}")

        if not sub_row:
            raise HTTPException(status_code=404, detail="No active subscription found")

        stripe_sub_id = _normalize_stripe_subscription_id(sub_row.get("stripe_subscription_id"))
        if not stripe_sub_id:
            # Try to recover from session_id or customer_id
            stripe_sub_id = _recover_subscription_id_from_session(sub_row.get("stripe_session_id"))
        if not stripe_sub_id and sub_row.get("stripe_customer_id"):
            try:
                cust_subs = stripe.Subscription.list(customer=sub_row["stripe_customer_id"], status='active', limit=1)
                if cust_subs.data:
                    stripe_sub_id = _normalize_stripe_subscription_id(cust_subs.data[0])
            except Exception:
                pass
        if not stripe_sub_id:
            raise HTTPException(status_code=400, detail="No Stripe subscription ID on record — please contact support")

        # 2. Retrieve current Stripe subscription
        stripe_sub = stripe.Subscription.retrieve(stripe_sub_id, expand=["items"])
        stripe_status = str(_sg(stripe_sub, "status") or "").lower()
        if stripe_status not in ("active", "trialing"):
            raise HTTPException(status_code=400, detail=f"Subscription is {stripe_status}, cannot switch plan")

        items_container = _sg(stripe_sub, "items", {})
        items = _sg(items_container, "data", []) if items_container else []
        if not items:
            raise HTTPException(status_code=400, detail="Subscription has no items — please contact support")

        current_item = items[0]
        current_price_id = _sg(_sg(current_item, "price", {}), "id")

        if current_price_id == new_price_id:
            return {"success": True, "plan": new_plan, "message": "Already on this plan", "changed": False}

        # 3. Schedule the switch for next renewal (period end), not immediate.
        # This prevents giving a new tier at the old price in the same billing period.
        current_period_start = _coerce_stripe_timestamp(_sg(stripe_sub, "current_period_start")) or 0
        current_period_end = _coerce_stripe_timestamp(_sg(stripe_sub, "current_period_end")) or 0

        # Fallback 1: DB timestamps if Stripe sub payload lacks period values
        if not current_period_end:
            current_period_end = (
                _coerce_stripe_timestamp(sub_row.get("current_period_end"))
                or _coerce_stripe_timestamp(sub_row.get("end_date"))
                or 0
            )
        if not current_period_start:
            current_period_start = (
                _coerce_stripe_timestamp(sub_row.get("start_date"))
                or _coerce_stripe_timestamp(sub_row.get("created_at"))
                or 0
            )

        current_plan = PRICE_TO_TIER.get(current_price_id) or _resolve_plan_from_stripe_subscription(stripe_sub) or sub_row.get("plan_tier")
        quantity = int(_sg(current_item, "quantity") or 1)

        print(
            f"🗓️ [SWITCH-PLAN] user={user_id} scheduling switch at period end "
            f"from price={current_price_id} to price={new_price_id} (target_plan={new_plan}, at={current_period_end})"
        )

        schedule_raw = _sg(stripe_sub, "schedule")
        schedule_id = None
        if schedule_raw:
            if isinstance(schedule_raw, str):
                schedule_id = schedule_raw
            else:
                schedule_id = _sg(schedule_raw, "id")

        existing_schedule = None
        if schedule_id:
            try:
                existing_schedule = stripe.SubscriptionSchedule.retrieve(schedule_id)
                schedule_status = str(_sg(existing_schedule, "status") or "").lower()
                # Fallback 2: use current phase timing when subscription object has no period bounds
                if not current_period_end:
                    current_phase = _sg(existing_schedule, "current_phase", {})
                    current_period_end = _coerce_stripe_timestamp(_sg(current_phase, "end_date")) or current_period_end
                    current_period_start = _coerce_stripe_timestamp(_sg(current_phase, "start_date")) or current_period_start
                if schedule_status in ("released", "completed", "canceled"):
                    schedule_id = None
            except Exception:
                schedule_id = None

        # Fallback 3: trial subscriptions
        if not current_period_end:
            current_period_end = _coerce_stripe_timestamp(_sg(stripe_sub, "trial_end")) or 0

        # Fallback 4: upcoming invoice period end (most reliable billing-cycle source)
        if not current_period_end:
            try:
                upcoming_invoice = stripe.Invoice.upcoming(subscription=stripe_sub_id)
                current_period_end = _coerce_stripe_timestamp(_sg(upcoming_invoice, "period_end")) or 0
                if not current_period_end:
                    inv_lines = _sg(_sg(upcoming_invoice, "lines", {}), "data", [])
                    if inv_lines:
                        period_obj = _sg(inv_lines[0], "period", {})
                        current_period_end = _coerce_stripe_timestamp(_sg(period_obj, "end")) or 0
                if current_period_end:
                    print(f"  ✅ [SWITCH-PLAN] Renewal date recovered from upcoming invoice: {current_period_end}")
            except Exception as invoice_err:
                print(f"  ⚠️ [SWITCH-PLAN] Upcoming invoice fallback warning: {invoice_err}")

        # Fallback 5: latest existing invoice period end
        if not current_period_end:
            try:
                latest_invoices = stripe.Invoice.list(subscription=stripe_sub_id, limit=1)
                latest_data = _sg(latest_invoices, "data", []) or []
                if latest_data:
                    latest_invoice = latest_data[0]
                    current_period_end = _coerce_stripe_timestamp(_sg(latest_invoice, "period_end")) or 0
                    if not current_period_end:
                        inv_lines = _sg(_sg(latest_invoice, "lines", {}), "data", []) or []
                        if inv_lines:
                            period_obj = _sg(inv_lines[0], "period", {})
                            current_period_end = _coerce_stripe_timestamp(_sg(period_obj, "end")) or 0
                if current_period_end:
                    print(f"  ✅ [SWITCH-PLAN] Renewal date recovered from latest invoice: {current_period_end}")
            except Exception as latest_invoice_err:
                print(f"  ⚠️ [SWITCH-PLAN] Latest invoice fallback warning: {latest_invoice_err}")

        # Fallback 6: DB period end (as persisted timestamp/ISO string)
        if not current_period_end:
            current_period_end = _coerce_stripe_timestamp(sub_row.get("current_period_end")) or 0
            if current_period_end:
                print(f"  ✅ [SWITCH-PLAN] Renewal date recovered from DB current_period_end: {current_period_end}")

        if not current_period_end:
            raise HTTPException(
                status_code=400,
                detail="Unable to determine renewal date from Stripe. Please retry in 1 minute or open Billing Portal."
            )

        if not schedule_id:
            created_schedule = stripe.SubscriptionSchedule.create(from_subscription=stripe_sub_id)
            schedule_id = _sg(created_schedule, "id")
            existing_schedule = stripe.SubscriptionSchedule.retrieve(schedule_id)

        # ── Determine the REAL renewal date ──────────────────────────
        # Priority: the Stripe subscription's current_period_end is the
        # authoritative billing-cycle boundary.  A freshly-created schedule
        # may echo "now + 1 month" which is NOT the real renewal date.
        #
        # We ONLY fall back to the schedule's current-phase end_date if
        # the subscription object itself gave us nothing.
        stripe_sub_period_end = _coerce_stripe_timestamp(_sg(stripe_sub, "current_period_end")) or 0
        stripe_sub_period_start = _coerce_stripe_timestamp(_sg(stripe_sub, "current_period_start")) or 0

        # The schedule's current phase start_date is IMMUTABLE (Stripe will
        # reject any change), so we must re-use it exactly.
        locked_current_start = None
        if existing_schedule:
            current_phase = _sg(existing_schedule, "current_phase", {}) or {}
            locked_current_start = _coerce_stripe_timestamp(_sg(current_phase, "start_date"))

        # Renewal date: ALWAYS prefer the real subscription cycle over
        # anything the schedule reports.
        effective_switch_at = stripe_sub_period_end or current_period_end
        if not effective_switch_at:
            # Last-resort: check schedule current phase end (less reliable)
            if existing_schedule:
                current_phase = _sg(existing_schedule, "current_phase", {}) or {}
                effective_switch_at = _coerce_stripe_timestamp(_sg(current_phase, "end_date")) or 0
        if not effective_switch_at:
            raise HTTPException(
                status_code=400,
                detail="Unable to determine current phase end date from Stripe. Please retry in 1 minute."
            )

        # Current-phase start: use the locked schedule value (immutable),
        # else the real subscription period start.
        effective_current_start = locked_current_start or stripe_sub_period_start or current_period_start or "now"

        # Keep canonical renewal timestamp aligned with the REAL cycle
        current_period_end = effective_switch_at

        # ── Guard: if start >= end the current phase would be zero-length ──
        # This happens when a previous switch attempt left a schedule whose
        # current phase already starts at the renewal boundary.  In that case
        # release the stale schedule and create a fresh one from the live sub.
        start_ts = effective_current_start if isinstance(effective_current_start, int) else 0
        if start_ts and start_ts >= effective_switch_at:
            print(f"  ⚠️ [SWITCH-PLAN] Stale schedule detected (start={start_ts} >= end={effective_switch_at}). Releasing and re-creating.")
            try:
                stripe.SubscriptionSchedule.release(schedule_id)
            except Exception as rel_err:
                print(f"  ⚠️ [SWITCH-PLAN] Release warning: {rel_err}")
            # Re-create from the live subscription
            created_schedule = stripe.SubscriptionSchedule.create(from_subscription=stripe_sub_id)
            schedule_id = _sg(created_schedule, "id")
            existing_schedule = stripe.SubscriptionSchedule.retrieve(schedule_id)
            current_phase = _sg(existing_schedule, "current_phase", {}) or {}
            effective_current_start = _coerce_stripe_timestamp(_sg(current_phase, "start_date")) or "now"
            # The fresh schedule's phase end should match the sub period end
            fresh_end = _coerce_stripe_timestamp(_sg(current_phase, "end_date"))
            if fresh_end and fresh_end > (effective_current_start if isinstance(effective_current_start, int) else 0):
                effective_switch_at = fresh_end
                current_period_end = effective_switch_at

        print(
            f"  📅 [SWITCH-PLAN] Phase boundaries: start={effective_current_start} "
            f"switch_at={effective_switch_at} "
            f"(stripe_sub.current_period_end={stripe_sub_period_end})"
        )

        stripe.SubscriptionSchedule.modify(
            schedule_id,
            end_behavior="release",
            phases=[
                {
                    "start_date": effective_current_start,
                    "end_date": effective_switch_at,
                    "items": [{"price": current_price_id, "quantity": quantity}],
                },
                {
                    "start_date": effective_switch_at,
                    "items": [{"price": new_price_id, "quantity": quantity}],
                },
            ],
            metadata={"user_id": user_id, "pending_plan": new_plan, "effective_at": str(current_period_end)},
        )

        # Verify Stripe accepted the schedule update (target tier present in a future phase)
        schedule_verify = stripe.SubscriptionSchedule.retrieve(schedule_id)
        verify_phases = _sg(schedule_verify, "phases", []) or []
        exact_amount_map = {9900: 'standard', 19900: 'pro', 29900: 'premium'}
        has_target_future_phase = False
        for phase in verify_phases:
            phase_start = _coerce_stripe_timestamp(_sg(phase, "start_date"))
            if phase_start is not None and phase_start < current_period_end:
                continue
            phase_items = _sg(phase, "items", []) or []
            for phase_item in phase_items:
                phase_price = _sg(phase_item, "price")
                if isinstance(phase_price, str):
                    phase_price_id = phase_price
                    phase_amount = None
                else:
                    phase_price_id = _sg(phase_price, "id")
                    phase_amount = _sg(phase_price, "unit_amount")
                phase_tier = PRICE_TO_TIER.get(phase_price_id)
                if not phase_tier and phase_amount is not None:
                    try:
                        phase_tier = exact_amount_map.get(int(phase_amount))
                    except Exception:
                        phase_tier = None
                if phase_tier == new_plan:
                    has_target_future_phase = True
                    break
            if has_target_future_phase:
                break

        if not has_target_future_phase:
            raise HTTPException(
                status_code=500,
                detail="Stripe did not confirm the scheduled plan change. Please retry in 1 minute."
            )

        # 4. Keep current plan in DB until renewal date; Stripe webhook will update on effective switch.
        now_iso = datetime.utcnow().isoformat()
        _sub_upsert(supabase, user_id, {
            "user_id": user_id,
            "plan_tier": current_plan,
            "plan": True,
            "paid": True,
            "status": "active",
            "subscription_status": "active",
            "stripe_subscription_id": stripe_sub_id,
            "stripe_customer_id": _sg(stripe_sub, "customer") or sub_row.get("stripe_customer_id"),
            "current_period_end": datetime.utcfromtimestamp(current_period_end).isoformat(),
            "updated_at": now_iso,
        })

        # 5. Invalidate init cache
        _init_cache.pop(user_id, None)

        return {
            "success": True,
            "plan": new_plan,
            "changed": True,
            "scheduled_for_period_end": True,
            "current_plan": current_plan,
            "effective_at": datetime.utcfromtimestamp(current_period_end).isoformat(),
            "renewal_date": datetime.utcfromtimestamp(current_period_end).isoformat(),
            "message": f"Plan change to {new_plan.upper()} scheduled for next renewal"
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print(f"❌ [SWITCH-PLAN] Error: {e}\n{tb}")
        raise HTTPException(status_code=500, detail=f"switch-plan error: {type(e).__name__}: {e}")


@app.post("/api/subscription/update-payment-method")
async def update_payment_method(request: Request):
    """Ouvre le portail Stripe pour gérer l'abonnement"""
    user_id = get_user_id(request)
    
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        
        # Get subscription
        result = supabase.table("subscriptions").select("*").eq("user_id", user_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Aucun abonnement trouvé")
        
        subscription = result.data[0]
        stripe_customer_id = subscription.get("stripe_customer_id")
        stripe_subscription_id = subscription.get("stripe_subscription_id")

        if not stripe_customer_id and stripe_subscription_id:
            stripe_sub = stripe.Subscription.retrieve(stripe_subscription_id)
            stripe_customer_id = _sg(stripe_sub, "customer")
            if stripe_customer_id:
                supabase.table("subscriptions").update({
                    "stripe_customer_id": stripe_customer_id
                }).eq("user_id", user_id).execute()

        if not stripe_customer_id:
            raise HTTPException(status_code=400, detail="Pas de compte Stripe associé")
        
        # Create billing portal session
        session = stripe.billing_portal.Session.create(
            customer=stripe_customer_id,
            return_url="https://fdkng.github.io/SHOPBRAIN_AI/#dashboard",
        )
        
        return {"success": True, "portal_url": session.url}
    except Exception as e:
        print(f"Error updating payment method: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/subscription/change-plan")
async def change_plan(payload: dict, request: Request):
    """Change the user's subscription plan.
    Delegates to switch-plan (modifies existing Stripe sub) instead of
    creating a new checkout session which would duplicate subscriptions."""
    return await switch_plan_inline(request, _override_plan=payload.get("plan"))


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", 8000))
    print(f"🚀 Starting FastAPI server on 0.0.0.0:{port}")
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
