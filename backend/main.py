from dotenv import load_dotenv

"""
ShopBrain AI – Écosystème Bundles & cross-sell
Endpoints, logique asynchrone, cache, persistance Supabase, gestion d’erreurs, threading, doc.
"""

import os
import sys
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
from datetime import datetime, timedelta
from fastapi import FastAPI, HTTPException, Request, Depends, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, StreamingResponse, HTMLResponse
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

try:
    from AI_engine.shopbrain_ai import ShopBrainAI
except Exception:
    ShopBrainAI = None

print("\n🚀 ========== BACKEND STARTUP ==========")
print(f"✅ FastAPI initializing...")
app = FastAPI()

# Shopify OAuth credentials
SHOPIFY_API_KEY = os.getenv("SHOPIFY_API_KEY")
SHOPIFY_API_SECRET = os.getenv("SHOPIFY_API_SECRET")
SHOPIFY_ACCESS_TOKEN = os.getenv("SHOPIFY_ACCESS_TOKEN")
SHOPIFY_SCOPES = "read_products,write_products,read_orders,read_customers,read_analytics"
SHOPIFY_REDIRECT_URI = os.getenv("SHOPIFY_REDIRECT_URI", "https://shopbrain-backend.onrender.com/auth/shopify/callback")

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
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "https://fdkng.github.io/SHOPBRAIN_AI")
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
async def get_shopify_bundles(request: Request, range: str = "30d", limit: int = 10):
    """🧩 Bundles & cross-sell suggestions based on order co-occurrence.

    Lightweight alternative to /api/shopify/insights when you only need bundles.
    """
    start_time = time.time()
    user_id = get_user_id(request)
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
    if code == "CAD":
        return "dollars canadiens (CAD)"
    if code == "USD":
        return "dollars US (USD)"
    if code == "EUR":
        return "euros (EUR)"
    return f"{code or 'devise inconnue'}"


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


def _ai_market_price_estimates(items: list[dict], products_by_id: dict[str, dict]) -> dict[str, dict]:
    """Return market price range estimates keyed by product_id.

    Note: This is an AI estimation (no live web). It is used as a lightweight
    'market comparison' signal when OpenAI is configured.
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
            "product_type": product.get("product_type") or "",
            "vendor": product.get("vendor") or "",
            "tags": product.get("tags") or "",
            "current_price": item.get("current_price"),
            "suggested_price": item.get("suggested_price"),
            "currency": "EUR",
        })

    if not sample:
        return {}

    prompt = {
        "task": "Estimate plausible market price ranges for similar products.",
        "constraints": [
            "Do NOT browse the web.",
            "Base estimates on general market knowledge and the provided product context.",
            "Return numeric prices in the provided currency.",
        ],
        "output": {
            "items": [
                {
                    "product_id": "string",
                    "market_min": 0.0,
                    "market_max": 0.0,
                    "positioning": "low|mid|high",
                    "confidence": 0,
                    "notes": "string"
                }
            ]
        },
        "products": sample,
    }

    try:
        client = (OpenAI(api_key=OPENAI_API_KEY) if OpenAI else openai.OpenAI(api_key=OPENAI_API_KEY))
        response = client.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "Tu es un analyste pricing e-commerce. Tu fournis des estimations prudentes et chiffrées."},
                {"role": "user", "content": json.dumps(prompt, ensure_ascii=False)},
            ],
            temperature=0.2,
            max_tokens=650,
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

print("\n🚀 ========== BACKEND STARTUP ==========")
print(f"✅ FastAPI initializing...")
# Do not re-create app here: keep the original instance so previously declared routes stay registered.

# Allow CORS from configured frontend and local development
allowed_origins = [
    "https://fdkng.github.io",
    "https://fdkng.github.io/SHOPBRAIN_AI",
    "http://localhost:5173",
    "http://localhost:3000",
]

frontend_origin = os.getenv("FRONTEND_ORIGIN")
if frontend_origin:
    allowed_origins.append(frontend_origin)

extra_origins = [
    origin.strip()
    for origin in os.getenv("FRONTEND_ORIGINS", "").split(",")
    if origin.strip()
]
allowed_origins.extend(extra_origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"^https://.*$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
print(f"✅ CORS middleware configured")

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


@app.get("/health")
async def health():
    """Health check endpoint for Render - MUST ALWAYS WORK"""
    return {
        "status": "ok",
        "version": "2.0-clean-tabs",
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
    print(f"🔔 [WEBHOOK] Received Stripe webhook event")
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    event = None

    if STRIPE_WEBHOOK_SECRET:
        try:
            event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
            print(f"✅ [WEBHOOK] Signature verified")
        except Exception as e:
            print(f"❌ [WEBHOOK] Signature verification failed: {e}")
            raise HTTPException(status_code=400, detail=f"Webhook signature verification failed: {e}")
    else:
        # If no webhook secret, try to parse raw
        import json
        try:
            event = json.loads(payload)
            print(f"⚠️  [WEBHOOK] No signature secret, parsed raw event")
        except Exception as e:
            print(f"❌ [WEBHOOK] Failed to parse event: {e}")
            raise HTTPException(status_code=400, detail=f"Invalid JSON: {e}")

    event_type = event.get("type", "unknown")
    print(f"📊 [WEBHOOK] Event type: {event_type}")

    # Handle the checkout.session.completed event
    if event_type == "checkout.session.completed":
        session = event["data"]["object"]
        print(f"🔍 [WEBHOOK] Session ID: {session.get('id')}")
        print(f"🔍 [WEBHOOK] Metadata: {session.get('metadata', {})}")
        
        # Ensure we have line_items and subscription expanded
        try:
            if not session.get("line_items") or not session.get("subscription"):
                print(f"⏳ [WEBHOOK] Retrieving full session with expansions...")
                session = stripe.checkout.Session.retrieve(
                    session["id"],
                    expand=["line_items", "subscription"]
                )
                print(f"✅ [WEBHOOK] Session expanded")
        except Exception as e:
            print(f"⚠️  [WEBHOOK] Could not expand session: {e}")

        user_id = session.get("metadata", {}).get("user_id")
        print(f"👤 [WEBHOOK] User ID: {user_id}")
        
        if not user_id:
            print(f"❌ [WEBHOOK] No user_id in metadata! Session details: {session.get('metadata', {})}")
            return {"received": True, "error": "No user_id found"}
        
        # Persist subscription to Supabase if configured (best-effort)
        if SUPABASE_URL and SUPABASE_SERVICE_KEY:
            try:
                from supabase import create_client

                supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
                
                # Extract plan from subscription - try different sources
                plan_tier = None
                subscription_status = "active"
                
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
                    print(f"📋 [WEBHOOK] Plan from metadata: {plan_tier}")
                
                # 2. Try to get subscription and check price_id
                if not plan_tier and session.get("subscription"):
                    try:
                        subscription = stripe.Subscription.retrieve(session["subscription"])
                        subscription_status = subscription.get("status", "active")
                        if subscription and subscription.get("items", {}).get("data"):
                            price_id = subscription["items"]["data"][0].get("price", {}).get("id")
                            plan_tier = PRICE_TO_TIER.get(price_id)
                            amount = subscription["items"]["data"][0].get("price", {}).get("unit_amount")
                            if not plan_tier:
                                plan_tier = tier_from_amount(amount)
                            print(f"💰 [WEBHOOK] Plan from subscription price_id {price_id}, amount {amount}: {plan_tier}")
                    except Exception as e:
                        print(f"⚠️  [WEBHOOK] Could not retrieve subscription: {e}")
                
                # 3. Try from line items
                if not plan_tier:
                    for li in session.get("line_items", {}).get("data", []):
                        price_id = li.get("price", {}).get("id")
                        amount = li.get("price", {}).get("unit_amount")
                        if price_id in PRICE_TO_TIER:
                            plan_tier = PRICE_TO_TIER[price_id]
                            print(f"🛒 [WEBHOOK] Plan from line items price_id {price_id}: {plan_tier}")
                            break
                        if not plan_tier:
                            plan_tier = tier_from_amount(amount)
                            if plan_tier:
                                print(f"🛒 [WEBHOOK] Plan inferred from amount {amount}: {plan_tier}")
                                break
                
                # Default to standard if still no plan found
                if not plan_tier:
                    plan_tier = "standard"
                    print(f"⚠️  [WEBHOOK] Using default plan: {plan_tier}")
                
                # Insert to subscriptions table
                print(f"📝 [WEBHOOK] Upserting to subscriptions table...")
                supabase.table("subscriptions").upsert({
                    "user_id": user_id,
                    "email": session.get("customer_email"),
                    "stripe_session_id": session.get("id"),
                    "stripe_subscription_id": session.get("subscription"),
                    "stripe_customer_id": session.get("customer"),
                    "plan_tier": plan_tier,
                    "status": subscription_status,
                }, on_conflict="user_id").execute()
                print(f"✅ [WEBHOOK] Subscriptions table updated")

                # Keep user profile in sync so the dashboard always sees the latest tier
                print(f"📝 [WEBHOOK] Upserting to user_profiles table...")
                supabase.table("user_profiles").upsert({
                    "id": user_id,
                    "subscription_tier": plan_tier,
                    "subscription_plan": plan_tier,
                    "subscription_status": subscription_status,
                    "updated_at": datetime.utcnow().isoformat()
                }, on_conflict="id").execute()
                print(f"✅ [WEBHOOK] User profile updated with plan: {plan_tier}")
                
                print(f"🎉 [WEBHOOK] SUCCESS: Subscription saved: user_id={user_id}, plan={plan_tier}")
            except Exception as e:
                print(f"❌ [WEBHOOK] Failed to persist subscription: {e}")
                import traceback
                traceback.print_exc()
        else:
            print(f"❌ [WEBHOOK] Supabase not configured")
    else:
        print(f"⏭️  [WEBHOOK] Ignoring event type: {event_type}")

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


@app.get("/api/shopify/connection")
async def get_shopify_connection(request: Request):
    """Récupère la boutique Shopify connectée (sans exposer le token)"""
    user_id = get_user_id(request)

    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        result = supabase.table("shopify_connections").select("shop_domain,created_at,updated_at").eq("user_id", user_id).execute()

        if result.data:
            return {"success": True, "connection": result.data[0]}

        return {"success": True, "connection": None}
    except Exception as e:
        print(f"Error fetching Shopify connection: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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


def _get_shopify_connection(user_id: str):
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise HTTPException(status_code=500, detail="Supabase not configured")

    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    connection = supabase.table("shopify_connections").select("shop_domain,access_token").eq("user_id", user_id).execute()

    if not connection.data:
        raise HTTPException(status_code=404, detail="Aucune boutique Shopify connectée")

    shop_domain = connection.data[0].get("shop_domain")
    access_token = connection.data[0].get("access_token")

    if not shop_domain or not access_token:
        raise HTTPException(status_code=400, detail="Connexion Shopify invalide")

    return shop_domain, access_token


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
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return None
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    result = supabase.table("shopify_connections").select("user_id").eq("shop_domain", shop_domain).limit(1).execute()
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

    # Fetch products for inventory + images
    products_resp = get_shopify_products
    products_payload = await products_resp(request)
    products = products_payload.get("products", [])
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
        estimates = _ai_market_price_estimates(price_analysis_items, products_by_id)
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

    return {
        "success": True,
        "shop": shop_domain,
        "range": range,
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
        "image_risks": image_risks,
        "bundle_suggestions": bundles,
        "stock_risks": stock_risks,
        "price_opportunities": price_analysis_items,
        "price_analysis": {
            "items": price_analysis_items,
            "market_comparison": market_comparison,
        },
        "market_comparison": market_comparison,
        "return_risks": return_risks,
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

    # Fetch all products for inventory + metadata
    products_resp = get_shopify_products
    products_payload = await products_resp(request)
    products = products_payload.get("products", [])

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
async def get_shopify_rewrite(request: Request, product_id: str):
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
    engine = get_ai_engine()
    suggested_title = engine.content_gen.generate_title(product, tier)
    suggested_description = engine.content_gen.generate_description(product, tier)

    return {
        "success": True,
        "shop": shop_domain,
        "product_id": product_id,
        "title": product.get("title") or "Produit",
        "current_title": product.get("title") or "",
        "current_description": _strip_html(product.get("body_html") or ""),
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
    """📌 Ingestion d'événements Shopify Pixel (view_item, add_to_cart)."""
    if not req.shop_domain:
        raise HTTPException(status_code=400, detail="Shop domain requis")

    allowed_events = {"view_item", "add_to_cart", "product_viewed", "product_added_to_cart"}
    event_type = (req.event_type or "").strip().lower()
    if event_type not in allowed_events:
        raise HTTPException(status_code=400, detail="Event non supporté")

    normalized_product_id = _normalize_shopify_id(req.product_id)
    user_id = _get_user_id_by_shop_domain(req.shop_domain)
    if not user_id:
        raise HTTPException(status_code=404, detail="Boutique inconnue")

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise HTTPException(status_code=500, detail="Supabase not configured")

    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    payload = {
        "user_id": user_id,
        "shop_domain": req.shop_domain,
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

    response = (
        supabase.table("shopify_events")
        .select("product_id,event_type,created_at")
        .eq("user_id", user_id)
        .eq("shop_domain", shop_domain)
        .gte("created_at", start_date)
        .execute()
    )

    rows = response.data or []
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
    """Vérifie si le Shopify Pixel (custom pixel ou script tag) est installé et actif."""
    user_id = _require_user_id(request)
    shop_domain, access_token = _get_shopify_connection(user_id)
    headers = {
        "X-Shopify-Access-Token": access_token,
        "Content-Type": "application/json",
    }

    pixel_installed = False
    pixel_active = False
    pixel_type = None
    pixel_details = []
    has_events = False

    # 1. Check ScriptTag API for any pixel scripts
    try:
        st_url = f"https://{shop_domain}/admin/api/2024-10/script_tags.json"
        st_resp = requests.get(st_url, headers=headers, timeout=15)
        if st_resp.status_code == 200:
            script_tags = (st_resp.json() or {}).get("script_tags", [])
            for tag in script_tags:
                src = (tag.get("src") or "").lower()
                event = tag.get("event", "")
                if "pixel" in src or "shopbrain" in src or "tracking" in src or "analytics" in src:
                    pixel_installed = True
                    pixel_type = "script_tag"
                    pixel_details.append({
                        "id": tag.get("id"),
                        "src": tag.get("src"),
                        "event": event,
                        "display_scope": tag.get("display_scope", "all"),
                        "created_at": tag.get("created_at"),
                    })
    except Exception as e:
        logger.warning(f"Pixel check - ScriptTag API error: {e}")

    # 2. Check Web Pixel API (Shopify custom pixels - newer method)
    try:
        wp_url = f"https://{shop_domain}/admin/api/2024-10/web_pixels.json"
        wp_resp = requests.get(wp_url, headers=headers, timeout=15)
        if wp_resp.status_code == 200:
            web_pixels = (wp_resp.json() or {}).get("web_pixels", [])
            for wp in web_pixels:
                pixel_installed = True
                pixel_type = pixel_type or "web_pixel"
                pixel_details.append({
                    "id": wp.get("id"),
                    "name": wp.get("name"),
                    "status": wp.get("status"),
                })
                if wp.get("status") == "active":
                    pixel_active = True
        elif wp_resp.status_code == 404:
            # Web Pixel API not available on this plan/version — not an error
            pass
    except Exception as e:
        logger.warning(f"Pixel check - Web Pixel API error: {e}")

    # 3. Check if we have received any pixel events in Supabase (last 30 days)
    try:
        if SUPABASE_URL and SUPABASE_SERVICE_KEY:
            sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
            cutoff = (datetime.utcnow() - timedelta(days=30)).isoformat()
            result = sb.table("shopify_events") \
                .select("id", count="exact") \
                .eq("user_id", user_id) \
                .eq("shop_domain", shop_domain) \
                .gte("created_at", cutoff) \
                .limit(1) \
                .execute()
            event_count = result.count if hasattr(result, 'count') and result.count else len(result.data or [])
            has_events = event_count > 0
            if has_events:
                pixel_active = True
                if not pixel_installed:
                    pixel_installed = True
                    pixel_type = pixel_type or "events_detected"
    except Exception as e:
        logger.warning(f"Pixel check - Supabase events error: {e}")

    # Determine overall status
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


def _ai_image_assistance_batch(products: list[dict]) -> dict[str, dict]:
    """Hybrid image assistance:

    - If product has image URLs -> vision audit of existing images (background/tone/consistency) + concrete fixes.
    - If product has no images -> text-only plan for what to shoot.

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
                    "camera": "string",
                    "lighting": "string",
                    "editing_notes": "string",
                    "why": "string",
                    "uses_facts": ["string"],
                    "prompts": {"studio": "string", "premium": "string"},
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
            "Avoid overly prescriptive or dubious technical instructions. Prefer practical guidance tied to the product (what to show, why it matters, what detail proves quality).",
            "If information is missing, infer reasonable specifics from product_type/title (ex: bouteille -> bouchon/étanchéité/prise en main).",
            "Avoid vague advice. Use measurable / concrete details.",
            "Return only valid JSON matching output_schema.",
        ]
        if retry:
            constraints.insert(0, "Your previous answer was too generic. Make it clearly different AND cite product facts in every shot (uses_facts).")

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
                    {"role": "system", "content": "Tu es un directeur artistique e-commerce senior. Tu produis des plans d’images ultra concrets, spécifiques au produit."},
                    {"role": "user", "content": json.dumps(prompt, ensure_ascii=False)},
                ],
                temperature=0.25,
                max_tokens=1500,
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

        prompt = {
            "task": "Audit existing ecommerce product images and give product-specific improvements.",
            "language": "fr",
            "constraints": [
                "Do NOT browse the web.",
                "Use ONLY the provided images + product context.",
                "Be specific: describe background, lighting, crop, reflections, color cast, consistency.",
                "Provide quick fixes + a concrete re-shoot plan linked to the product.",
                "Return only valid JSON matching output_schema.",
            ],
            "output_schema": {
                "product_id": "string",
                "product_facts_used": ["string"],
                "tone": "string",
                "background": "string",
                "color_palette": ["string"],
                "audit": {
                    "what_i_see": ["string"],
                    "issues": ["string"],
                    "quick_fixes": ["string"],
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
            {"type": "text", "text": "Réponds STRICTEMENT en JSON (output_schema).\n" + json.dumps(prompt, ensure_ascii=False)},
        ]
        for u in urls:
            user_parts.append({"type": "image_url", "image_url": {"url": u}})

        try:
            client = (OpenAI(api_key=OPENAI_API_KEY) if OpenAI else openai.OpenAI(api_key=OPENAI_API_KEY))
            response = client.chat.completions.create(
                model=OPENAI_VISION_MODEL,
                messages=[
                    {"role": "system", "content": "Tu es un directeur artistique e-commerce senior. Tu audites des images produits et proposes des corrections concrètes, spécifiques au produit."},
                    {"role": "user", "content": user_parts},
                ],
                temperature=0.2,
                max_tokens=1200,
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

    # Keep latency bounded.
    started = time.time()
    budget_s = 22
    max_products = 6

    # Prioritize: audit vision when photos exist; otherwise text.
    queue = (with_images + without_images)[:max_products]
    for p in queue:
        if (time.time() - started) > budget_s:
            break
        pid = str(p.get("product_id") or "")
        if not pid or pid in out:
            continue
        payload = {}
        if _normalize_image_urls(p.get("image_urls")):
            payload = _vision_for_product(p)
        if not payload:
            payload = _text_only_for_product(p)
        if payload:
            _merge(pid, payload)

    return out

@app.get("/api/shopify/image-risks")
async def get_shopify_image_risks(request: Request, range: str = "30d", limit: int = 50, ai: int = 1):
    """🖼️ Analyse rapide des images produits (signaux de conversion visuels).

    - Nombre d'images faible
    - Alt manquant
    - (si pixel) taux vue→panier faible
    """
    user_id = get_user_id(request)
    tier = get_user_tier(user_id)
    ensure_feature_allowed(tier, "product_analysis")

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
            if not is_risky:
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
        # Keep UI responsive: only return top items that the dashboard shows.
        items = items[:8]

        use_ai = bool(int(ai or 0))
        if use_ai and not OPENAI_API_KEY:
            raise HTTPException(status_code=503, detail="IA images non configurée: OPENAI_API_KEY manquante côté backend")

        ai_payload = {}
        if use_ai and OPENAI_API_KEY and items:
            # Fetch extra details for these specific products to make AI recommendations truly product-specific.
            details_by_id: dict[str, dict] = {}
            started = time.time()
            for it in items:
                pid = str(it.get("product_id") or "")
                if not pid:
                    continue
                if (time.time() - started) > 15:
                    break
                try:
                    detail_url = f"https://{shop_domain}/admin/api/2024-10/products/{pid}.json?fields=id,title,body_html,product_type,vendor,tags,variants"
                    dresp = requests.get(detail_url, headers=headers, timeout=10)
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

            ai_payload = _ai_image_assistance_batch(enriched_for_ai)

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
async def apply_blocker_action(req: BlockerApplyRequest, request: Request):
    """⚡ Applique une action sur un produit frein (Pro/Premium)."""
    user_id = get_user_id(request)
    tier = get_user_tier(user_id)
    if tier not in {"pro", "premium"}:
        raise HTTPException(status_code=403, detail="Fonctionnalité réservée aux plans Pro/Premium")

    if tier == "pro":
        if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
            raise HTTPException(status_code=500, detail="Supabase not configured")
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

    shop_domain, access_token = _get_shopify_connection(user_id)
    headers = {
        "X-Shopify-Access-Token": access_token,
        "Content-Type": "application/json",
    }

    product_resp = requests.get(
        f"https://{shop_domain}/admin/api/2024-01/products/{req.product_id}.json",
        headers=headers,
        timeout=30,
    )
    if product_resp.status_code != 200:
        raise HTTPException(status_code=product_resp.status_code, detail=f"Erreur Shopify: {product_resp.text[:300]}")
    product = product_resp.json().get("product", {})

    from AI_engine.action_engine import ActionEngine
    action_engine = ActionEngine(shop_domain, access_token)

    action_type = (req.action_type or "").lower()
    if action_type == "price":
        variants = product.get("variants", []) or []
        if not variants:
            raise HTTPException(status_code=400, detail="Produit sans variantes")
        current_price = _safe_float(variants[0].get("price"), 0.0)
        if current_price <= 0:
            raise HTTPException(status_code=400, detail="Prix actuel invalide")
        new_price = req.suggested_price if req.suggested_price else round(current_price * 0.9, 2)
        result = action_engine.apply_price_change(req.product_id, new_price)
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error", "Échec modification prix"))
        _log_blocker_action(user_id, shop_domain, req.product_id, action_type)
        return {"success": True, "action": "price", "new_price": new_price}

    if action_type == "title":
        if req.suggested_title:
            new_title = req.suggested_title
        else:
            engine = get_ai_engine()
            new_title = engine.content_gen.generate_title(product, tier)
        result = action_engine.update_product_content(req.product_id, title=new_title)
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error", "Échec modification titre"))
        _log_blocker_action(user_id, shop_domain, req.product_id, action_type)
        return {"success": True, "action": "title", "new_title": new_title}

    if action_type == "description":
        if req.suggested_description:
            new_description = req.suggested_description
        else:
            engine = get_ai_engine()
            new_description = engine.content_gen.generate_description(product, tier)
        result = action_engine.update_product_content(req.product_id, description=new_description)
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error", "Échec modification description"))
        _log_blocker_action(user_id, shop_domain, req.product_id, action_type)
        return {"success": True, "action": "description"}

    raise HTTPException(status_code=400, detail="Action non supportée")


def _log_blocker_action(user_id: str, shop_domain: str, product_id: str, action_type: str) -> None:
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
    conn = supabase.table("shopify_connections").select("user_id").eq("shop_domain", shop_domain).limit(1).execute()
    if not conn.data:
        return {"success": False, "message": "Shop not connected"}

    user_id = conn.data[0].get("user_id")
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
    
    # Pas de limite stricte côté API pour permettre des messages longs
    
    system_prompt = SHOPBRAIN_EXPERT_SYSTEM or "Tu es un assistant expert en e-commerce Shopify."

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
                max_tokens=4000,
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

        client = (OpenAI(api_key=OPENAI_API_KEY) if OpenAI else openai.OpenAI(api_key=OPENAI_API_KEY))
        
        # Use Whisper API
        audio_bytes_io = BytesIO(audio_content)
        audio_bytes_io.name = filename  # Whisper needs the filename with extension
        
        response = client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_bytes_io,
            language="fr",
            response_format="text"
        )

        transcript = response.strip() if isinstance(response, str) else str(response).strip()
        print(f"✅ STT transcription: '{transcript[:100]}...' ({len(transcript)} chars)")

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
    """Resolve user's subscription tier from Supabase; default to standard."""
    try:
        if SUPABASE_URL and SUPABASE_SERVICE_KEY:
            supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
            sub_result = supabase.table("subscriptions").select("plan_tier,status,created_at").eq("user_id", user_id).in_("status", ["active", "trialing", "past_due", "incomplete"]).order("created_at", desc=True).limit(1).execute()
            if sub_result.data:
                plan = (sub_result.data[0].get("plan_tier") or "standard").lower()
                if plan in ["standard", "pro", "premium"]:
                    return plan

            profile_result = supabase.table("user_profiles").select("subscription_plan,subscription_tier").eq("id", user_id).limit(1).execute()
            if profile_result.data:
                plan = (profile_result.data[0].get("subscription_plan") or profile_result.data[0].get("subscription_tier") or "standard").lower()
                if plan in ["standard", "pro", "premium"]:
                    return plan
    except Exception as e:
        print(f"Tier resolve warning: {e}")

    return "standard"


def ensure_feature_allowed(tier: str, feature: str):
    feature_map = {
        "standard": {"product_analysis", "title_optimization", "price_suggestions"},
        "pro": {"product_analysis", "title_optimization", "price_suggestions", "content_generation", "cross_sell", "reports", "automated_actions", "invoicing"},
        "premium": {"product_analysis", "title_optimization", "price_suggestions", "content_generation", "cross_sell", "reports", "automated_actions", "predictions", "invoicing"},
    }
    allowed = feature_map.get(tier, feature_map["standard"])
    if feature not in allowed:
        raise HTTPException(status_code=403, detail="Fonctionnalité non disponible pour votre plan")


class AnalyzeStoreRequest(BaseModel):
    products: list
    analytics: dict
    tier: str  # standard, pro, premium


@app.get("/api/ai/price-opportunities")
async def price_opportunities_endpoint(request: Request, limit: int = 50):
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
        from supabase import create_client
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        connection = supabase.table("shopify_connections").select("*").eq("user_id", user_id).execute()
        if not connection.data:
            raise HTTPException(status_code=404, detail="Aucune boutique Shopify connectée. Veuillez vous connecter d'abord.")

        shop_domain = connection.data[0]["shop_domain"]
        access_token = connection.data[0]["access_token"]

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
                timeout=20,
            )
            if shop_resp.status_code == 200:
                shop_currency = ((shop_resp.json() or {}).get("shop") or {}).get("currency")
        except Exception:
            shop_currency = None

        # Fetch only the fields we need to keep the payload small and reliable.
        products_url = (
            f"https://{shop_domain}/admin/api/2024-10/products.json"
            f"?limit=250&fields=id,title,body_html,vendor,product_type,variants"
        )
        resp = requests.get(products_url, headers=headers, timeout=25)
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
            candidates.append(
                {
                    "product_id": str(p.get("id") or ""),
                    "title": p.get("title") or "Produit",
                    "vendor": p.get("vendor") or "",
                    "product_type": p.get("product_type") or "",
                    "desc_kw": desc_kw,
                    "current_price": round(current_price, 2),
                }
            )

        opportunities = []

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

            return {
                "success": True,
                "tier": tier,
                "products_analyzed": len(subset),
                "price_opportunities": opportunities,
                "market_comparison": market_status,
                "currency_code": shop_currency,
                **({"note": note} if note else {}),
            }

        # Fallback when SERP API isn't configured.
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

        if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
            raise HTTPException(status_code=500, detail="Supabase not configured")

        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        connection = supabase.table("shopify_connections").select("shop_domain,access_token").eq("user_id", user_id).execute()
        if not connection.data:
            raise HTTPException(status_code=404, detail="Aucune boutique Shopify connectée")

        shop_domain = connection.data[0].get("shop_domain")
        access_token = connection.data[0].get("access_token")
        if not shop_domain or not access_token:
            raise HTTPException(status_code=400, detail="Connexion Shopify invalide")

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
            new_price = round(current_price * 1.2, 2)
            result = action_engine.apply_price_change(req.product_id, new_price)
            if not result.get("success"):
                raise HTTPException(status_code=400, detail=result.get("error", "Échec modification prix"))
            rec_type = "prix"

        if rec_type == "titre":
            engine = get_ai_engine()
            new_title = engine.content_gen.generate_title(product, tier)
            result = action_engine.update_product_content(req.product_id, title=new_title)
            if not result.get("success"):
                raise HTTPException(status_code=400, detail=result.get("error", "Échec modification titre"))
            rec_type = "titre"

        if rec_type == "description":
            engine = get_ai_engine()
            new_description = engine.content_gen.generate_description(product, tier)
            result = action_engine.update_product_content(req.product_id, description=new_description)
            if not result.get("success"):
                raise HTTPException(status_code=400, detail=result.get("error", "Échec modification description"))
            rec_type = "description"

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

        raise HTTPException(status_code=400, detail="Type de recommandation non supporté")

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
    Pro: Rapports hebdomadaires
    Premium: Rapports quotidiens + PDF/Email
    """
    try:
        user_id = get_user_id(request)
        tier = get_user_tier(user_id)

        ensure_feature_allowed(tier, "reports")

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
                raw_tier = subscription.get('plan_tier') or 'standard'
                stripe_customer_id = subscription.get('stripe_customer_id')
                stripe_subscription_id = subscription.get('stripe_subscription_id')

                # Normalize invalid Stripe subscription IDs
                if stripe_subscription_id and not str(stripe_subscription_id).startswith("sub_"):
                    stripe_subscription_id = None

                # Try to resolve Stripe customer/subscription by email if IDs are missing
                try:
                    if not stripe_customer_id or not stripe_subscription_id:
                        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
                        profile_result = supabase.table("user_profiles").select("email").eq("id", user_id).execute()
                        email = profile_result.data[0].get("email") if profile_result.data else None

                        if email:
                            customers = stripe.Customer.list(email=email, limit=1)
                            if customers.data:
                                stripe_customer_id = customers.data[0].get("id")
                                subs = stripe.Subscription.list(customer=stripe_customer_id, status="all", limit=5)
                                latest_sub = None
                                for sub in subs.get("data", []):
                                    if sub.get("status") in ["active", "trialing", "past_due", "incomplete"]:
                                        if not latest_sub or sub.get("created", 0) > latest_sub.get("created", 0):
                                            latest_sub = sub
                                if latest_sub:
                                    stripe_subscription_id = latest_sub.get("id")
                                    items = latest_sub.get("items", {}).get("data", [])
                                    if items:
                                        price_id = items[0].get("price", {}).get("id")
                                        amount = items[0].get("price", {}).get("unit_amount")

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

                                        stripe_plan = PRICE_TO_TIER.get(price_id) or tier_from_amount(amount)
                                        if stripe_plan:
                                            raw_tier = stripe_plan
                                    supabase.table("subscriptions").update({
                                        "stripe_customer_id": stripe_customer_id,
                                        "stripe_subscription_id": stripe_subscription_id,
                                        "plan_tier": raw_tier,
                                        "updated_at": datetime.utcnow().isoformat()
                                    }).eq("id", subscription.get("id")).execute()
                                    supabase.table("user_profiles").update({
                                        "subscription_plan": raw_tier,
                                        "subscription_tier": raw_tier,
                                        "updated_at": datetime.utcnow().isoformat()
                                    }).eq("id", user_id).execute()
                except Exception as e:
                    print(f"Stripe email sync warning: {e}")

                # Always try to sync latest plan from Stripe customer if available
                try:
                    if stripe_customer_id:
                        subs = stripe.Subscription.list(customer=stripe_customer_id, status="all", limit=5)
                        latest_sub = None
                        for sub in subs.get("data", []):
                            if sub.get("status") in ["active", "trialing", "past_due", "incomplete"]:
                                if not latest_sub or sub.get("created", 0) > latest_sub.get("created", 0):
                                    latest_sub = sub

                        if latest_sub:
                            items = latest_sub.get("items", {}).get("data", [])
                            price_id = items[0].get("price", {}).get("id") if items else None
                            amount = items[0].get("price", {}).get("unit_amount") if items else None

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

                            stripe_plan = PRICE_TO_TIER.get(price_id) or tier_from_amount(amount)
                            if stripe_plan:
                                raw_tier = stripe_plan
                                stripe_subscription_id = latest_sub.get("id")
                                supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
                                supabase.table("subscriptions").update({
                                    "stripe_subscription_id": stripe_subscription_id,
                                    "plan_tier": raw_tier,
                                    "updated_at": datetime.utcnow().isoformat()
                                }).eq("id", subscription.get("id")).execute()
                                supabase.table("user_profiles").update({
                                    "subscription_plan": raw_tier,
                                    "subscription_tier": raw_tier,
                                    "updated_at": datetime.utcnow().isoformat()
                                }).eq("id", user_id).execute()
                except Exception as e:
                    print(f"Stripe customer sync warning: {e}")

                # If still missing or suspicious, try email-based lookup across customers
                try:
                    if SUPABASE_URL and SUPABASE_SERVICE_KEY:
                        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
                        profile_result = supabase.table("user_profiles").select("email").eq("id", user_id).execute()
                        email = profile_result.data[0].get("email") if profile_result.data else None

                        if email:
                            customers = stripe.Customer.list(email=email, limit=10)
                            newest_sub = None
                            newest_customer_id = None

                            for customer in customers.data:
                                subs = stripe.Subscription.list(customer=customer.get("id"), status="all", limit=5)
                                for sub in subs.get("data", []):
                                    if sub.get("status") in ["active", "trialing", "past_due", "incomplete"]:
                                        if not newest_sub or sub.get("created", 0) > newest_sub.get("created", 0):
                                            newest_sub = sub
                                            newest_customer_id = customer.get("id")

                            if newest_sub:
                                items = newest_sub.get("items", {}).get("data", [])
                                price_id = items[0].get("price", {}).get("id") if items else None
                                amount = items[0].get("price", {}).get("unit_amount") if items else None

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

                                stripe_plan = PRICE_TO_TIER.get(price_id) or tier_from_amount(amount)
                                if stripe_plan:
                                    raw_tier = stripe_plan
                                    supabase.table("subscriptions").update({
                                        "stripe_customer_id": newest_customer_id,
                                        "stripe_subscription_id": newest_sub.get("id"),
                                        "plan_tier": raw_tier,
                                        "updated_at": datetime.utcnow().isoformat()
                                    }).eq("id", subscription.get("id")).execute()
                                    supabase.table("user_profiles").update({
                                        "subscription_plan": raw_tier,
                                        "subscription_tier": raw_tier,
                                        "updated_at": datetime.utcnow().isoformat()
                                    }).eq("id", user_id).execute()
                except Exception as e:
                    print(f"Stripe email customer sync warning: {e}")

                # Sync plan from Stripe if subscription id is available
                try:
                    stripe_sub_id = stripe_subscription_id or subscription.get('stripe_subscription_id')
                    if stripe_sub_id:
                        stripe_sub = stripe.Subscription.retrieve(stripe_sub_id)
                        items = stripe_sub.get("items", {}).get("data", [])
                        if items:
                            price_id = items[0].get("price", {}).get("id")
                            amount = items[0].get("price", {}).get("unit_amount")

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

                            stripe_plan = PRICE_TO_TIER.get(price_id) or tier_from_amount(amount)
                            if stripe_plan and stripe_plan != raw_tier:
                                raw_tier = stripe_plan
                                supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
                                supabase.table("subscriptions").update({
                                    "plan_tier": stripe_plan,
                                    "updated_at": datetime.utcnow().isoformat()
                                }).eq("id", subscription.get("id")).execute()
                                supabase.table("user_profiles").update({
                                    "subscription_plan": stripe_plan,
                                    "subscription_tier": stripe_plan,
                                    "updated_at": datetime.utcnow().isoformat()
                                }).eq("id", user_id).execute()
                except Exception as e:
                    print(f"Stripe sync warning: {e}")
                
                # Map numeric tiers to named plans
                tier_map = {
                    '99': 'standard',
                    '199': 'pro',
                    '299': 'premium',
                    'standard': 'standard',
                    'pro': 'pro',
                    'premium': 'premium'
                }
                plan = tier_map.get(str(raw_tier).lower(), 'standard')
                
                capabilities = {
                    'standard': {
                        'product_limit': 50,
                        'features': ['product_analysis', 'title_optimization', 'price_suggestions']
                    },
                    'pro': {
                        'product_limit': 500,
                        'features': ['product_analysis', 'content_generation', 'cross_sell', 'reports', 'automated_actions', 'invoicing']
                    },
                    'premium': {
                        'product_limit': None,
                        'features': ['product_analysis', 'content_generation', 'cross_sell', 'automated_actions', 'reports', 'predictions', 'invoicing']
                    }
                }
                
                started_at = subscription.get('created_at')

                # Prefer Stripe subscription start date when available
                try:
                    stripe_sub_id = subscription.get('stripe_subscription_id')
                    if stripe_sub_id:
                        stripe_sub = stripe.Subscription.retrieve(stripe_sub_id)
                        stripe_start = stripe_sub.get('current_period_start') or stripe_sub.get('start_date')
                        if stripe_start:
                            started_at = datetime.utcfromtimestamp(stripe_start).isoformat()
                except Exception as e:
                    print(f"Stripe started_at sync warning: {e}")

                return {
                    'success': True,
                    'has_subscription': True,
                    'plan': plan,
                    'status': subscription.get('status', 'active'),
                    'started_at': started_at,
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
                        started_at = profile.get('subscription_started_at') or profile.get('created_at')
                        return {
                            'success': True,
                            'has_subscription': plan is not None,
                            'plan': plan,
                            'status': profile.get('subscription_status', 'active'),
                            'started_at': started_at,
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

        stripe_customer_id = None
        try:
            if SUPABASE_URL and SUPABASE_SERVICE_KEY:
                supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
                sub_res = supabase.table("subscriptions").select("stripe_customer_id").eq("user_id", user_id).order("created_at", desc=True).limit(1).execute()
                if sub_res.data:
                    stripe_customer_id = sub_res.data[0].get("stripe_customer_id")
        except Exception as e:
            print(f"Stripe customer lookup warning: {e}")
        
        session_kwargs = {
            "payment_method_types": ["card"],
            "mode": "subscription",
            "line_items": [{"price": price_id, "quantity": 1}],
            "success_url": f"{frontend_url}/#dashboard?session_id={{CHECKOUT_SESSION_ID}}&success=true",
            "cancel_url": f"{frontend_url}/#pricing",
            "allow_promotion_codes": True,
            "metadata": {
                "user_id": user_id,
                "plan": plan
            }
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
            
            # Cancel any other active subscriptions for this customer
            try:
                if session.customer:
                    active_subs = stripe.Subscription.list(customer=session.customer, status="active", limit=10)
                    for sub in active_subs.get("data", []):
                        if sub.get("id") != subscription.get("id"):
                            stripe.Subscription.cancel(sub.get("id"))
            except Exception as e:
                print(f"Stripe cancel old subs warning: {e}")

            supabase.table("subscriptions").upsert({
                "user_id": user_id,
                "plan_tier": plan,
                "status": subscription.status if subscription else "active",
                "stripe_session_id": session.id,
                "stripe_subscription_id": subscription.id if subscription else None,
                "stripe_customer_id": session.customer,
                "email": session.customer_email
            }, on_conflict="user_id").execute()
            
            supabase.table("user_profiles").upsert({
                "id": user_id,
                "subscription_tier": plan,
                "subscription_plan": plan,
                "subscription_status": subscription.status if subscription else "active",
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


print(f"✅ All endpoints registered successfully")
print(f"========== BACKEND READY ==========\n")

@app.on_event("startup")
async def startup_event():
    """Log when the app starts + launch background stock monitor."""
    startup_time = datetime.utcnow().isoformat()
    print(f"\n🟢 APP STARTUP at {startup_time}")
    print(f"STRIPE_SECRET_KEY={'present' if STRIPE_SECRET_KEY else 'MISSING'}")
    print(f"SUPABASE_URL={'present' if SUPABASE_URL else 'MISSING'}")
    sys.stdout.flush()
    sys.stderr.flush()
    # Lancer le thread de surveillance stock 24/7
    threading.Thread(target=_stock_monitor_loop, daemon=True).start()
    print("📦 Stock monitor démarré (toutes les 5 minutes)")


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
BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "https://shopbrain-backend.onrender.com")

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
            # --- Shopify connection ---
            conn = sb.table("shopify_connections").select("shop_domain,access_token").eq("user_id", user_id).execute()
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
    """Annule l'abonnement actuel"""
    user_id = get_user_id(request)
    
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        
        # Get subscription
        result = supabase.table("subscriptions").select("*").eq("user_id", user_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Aucun abonnement trouvé")
        
        subscription = result.data[0]
        stripe_subscription_id = subscription.get("stripe_subscription_id")
        
        if stripe_subscription_id:
            # Cancel Stripe subscription
            stripe.Subscription.cancel(stripe_subscription_id)
            print(f"✅ Stripe subscription cancelled: {stripe_subscription_id}")
        
        # Update local subscription
        supabase.table("subscriptions").update({
            "status": "cancelled",
            "cancelled_at": datetime.utcnow().isoformat()
        }).eq("user_id", user_id).execute()
        
        supabase.table("user_profiles").update({
            "subscription_status": "cancelled"
        }).eq("id", user_id).execute()
        
        return {"success": True, "message": "Abonnement annulé"}
    except Exception as e:
        print(f"Error cancelling subscription: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/subscription/update-payment-method")
async def update_payment_method(payload: dict, request: Request):
    """Met à jour la méthode de paiement"""
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
            stripe_customer_id = stripe_sub.get("customer")
            if stripe_customer_id:
                supabase.table("subscriptions").update({
                    "stripe_customer_id": stripe_customer_id
                }).eq("user_id", user_id).execute()

        if not stripe_customer_id:
            raise HTTPException(status_code=400, detail="Pas de compte Stripe associé")
        
        # Create billing portal session
        session = stripe.billing_portal.Session.create(
            customer=stripe_customer_id,
            return_url="https://shopbrain-ai.onrender.com/#dashboard",
        )
        
        return {"success": True, "portal_url": session.url}
    except Exception as e:
        print(f"Error updating payment method: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/subscription/change-plan")
async def change_plan(payload: dict, request: Request):
    """Change the user's subscription plan"""
    user_id = get_user_id(request)
    new_plan = payload.get("plan")
    
    if new_plan not in ["standard", "pro", "premium"]:
        raise HTTPException(status_code=400, detail="Plan invalide")
    
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        
        # Get current subscription
        result = supabase.table("subscriptions").select("*").eq("user_id", user_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Aucun abonnement trouvé")
        
        subscription = result.data[0]
        current_plan = subscription.get("plan_tier")
        stripe_customer_id = subscription.get("stripe_customer_id")
        
        # If downgrading or switching, create a new checkout session
        if new_plan != current_plan:
            # Get user email for checkout
            user_result = supabase.table("user_profiles").select("email").eq("id", user_id).execute()
            email = user_result.data[0]["email"] if user_result.data else ""
            
            # Redirect to checkout for the new plan
            session_kwargs = {
                "mode": "subscription",
                "line_items": [
                    {
                        "price": STRIPE_PLANS.get(new_plan, STRIPE_PLANS["standard"]),
                        "quantity": 1,
                    }
                ],
                "metadata": {"user_id": user_id, "plan": new_plan},
                "success_url": f"https://shopbrain-ai.onrender.com/#dashboard?success=true&session_id={{CHECKOUT_SESSION_ID}}",
                "cancel_url": f"https://shopbrain-ai.onrender.com/#dashboard",
            }

            if stripe_customer_id:
                session_kwargs["customer"] = stripe_customer_id
            else:
                session_kwargs["customer_email"] = email

            session = stripe.checkout.Session.create(**session_kwargs)
            
            return {"success": True, "url": session.url}
        else:
            return {"success": True, "message": "Vous êtes déjà sur ce plan"}
    except Exception as e:
        print(f"Error changing plan: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", 8000))
    print(f"🚀 Starting FastAPI server on 0.0.0.0:{port}")
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
