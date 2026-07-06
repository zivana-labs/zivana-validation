"""
Zivana Market Intelligence Agent — Agentverse Edition (VAL-005).

Self-contained single-file agent for deployment on Agentverse hosted agents.
Copy this entire file into the Agentverse in-browser editor.

To enable live ASI Cloud calls, add your API key as an Agentverse secret:
    Secret name  : ASI_CLOUD_API_KEY
    Secret value : <your key from https://asicloud.cudos.org/>

Without the secret, the agent runs in mock mode with hardcoded prices.
"""

import json
import uuid
import logging
from datetime import datetime, timezone, timedelta

from uagents import Agent, Context, Model

logger = logging.getLogger("zivana-intelligence")

# ===== Configuration =======================================================

ASI_CLOUD_BASE_URL = "https://inference.asicloud.cudos.org/v1"
ASI_CLOUD_MODEL = "asi1-mini"

# Hardcoded prices for mock mode
MOCK_PRICES = {
    ("cassava flour", "NG-LA"): 1500.0,
    ("cassava flour", "NG-KN"): 1420.0,
    ("palm oil", "NG-LA"): 2800.0,
    ("palm oil", "GH-AA"): 3100.0,
    ("shea butter", "NG-KN"): 4500.0,
}
DEFAULT_PRICE = 1500.0


# ===== Message Models =======================================================

class MarketQuery(Model):
    product: str
    jurisdiction: str


class FactStatementResponse(Model):
    fact_json: str
    success: bool = True
    error: str = ""


# ===== ASI Cloud Client (inline) ============================================

def get_market_price(product: str, jurisdiction: str, api_key: str = "") -> dict:
    """
    Fetch a market price via ASI Cloud or mock fallback.
    Returns dict with: price, currency, source, timestamp
    """
    timestamp = datetime.now(timezone.utc).isoformat()

    if api_key:
        try:
            import requests
            url = f"{ASI_CLOUD_BASE_URL}/chat/completions"
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            }
            prompt = (
                f"You are a market data oracle. Return ONLY a JSON object "
                f"with exactly two keys: \"price\" (a number) and \"currency\" "
                f"(an ISO 4217 code). Estimate the current average wholesale "
                f"unit price (per kg) of {product} in jurisdiction "
                f"{jurisdiction}. Respond with JSON only, no explanation."
            )
            payload = {
                "model": ASI_CLOUD_MODEL,
                "messages": [
                    {"role": "system", "content": "You are a precise market data API."},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.1,
                "max_tokens": 100,
            }
            resp = requests.post(url, headers=headers, json=payload, timeout=30)
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"]
            # Strip markdown code fences if present
            content = content.strip()
            if content.startswith("```"):
                lines = content.split("\n")
                lines = [l for l in lines if not l.strip().startswith("```")]
                content = "\n".join(lines)
            parsed = json.loads(content)
            return {
                "price": float(parsed["price"]),
                "currency": parsed.get("currency", "NGN"),
                "source": "asi_cloud",
                "timestamp": timestamp,
            }
        except Exception as exc:
            logger.error("ASI Cloud failed: %s — using mock", exc)

    # Mock fallback
    key = (product.lower().strip(), jurisdiction.upper().strip())
    price = MOCK_PRICES.get(key, DEFAULT_PRICE)
    return {
        "price": price,
        "currency": "NGN",
        "source": "mock",
        "timestamp": timestamp,
    }


# ===== Orcfax COOP Builder ==================================================

def build_fact_statement(product, jurisdiction, price, currency, source, ts):
    """Build an Orcfax COOP-compliant JSON-LD fact statement."""
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
    return {
        "@context": "https://schema.org",
        "@type": "Claim",
        "identifier": f"zivana-market-price-{uuid.uuid4().hex[:12]}",
        "dateCreated": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "text": (
            f"Market price estimate for {product} in {jurisdiction} "
            f"for period {week_ago.strftime('%Y-%m-%d')}/{now.strftime('%Y-%m-%d')}"
        ),
        "about": {
            "@type": "PriceSpecification",
            "price": price,
            "priceCurrency": currency,
            "validFrom": week_ago.strftime("%Y-%m-%d"),
            "validThrough": now.strftime("%Y-%m-%d"),
            "name": product,
            "description": f"Wholesale unit price (per kg) in {jurisdiction}",
        },
        "claimInterpreter": "zivana-intelligence-agent",
        "sdPublisher": {
            "@type": "Organization",
            "name": "Zivana Protocol",
            "url": "https://zivana.network",
        },
        "additionalProperty": [
            {"@type": "PropertyValue", "name": "dataSource", "value": source},
            {"@type": "PropertyValue", "name": "computationTimestamp", "value": ts},
        ],
    }


# ===== Agent =================================================================

agent = Agent(name="zivana-intelligence", seed="zivana-seed")

# Try to load API key from Agentverse secrets (or env var)
import os
ASI_API_KEY = os.getenv("ASI_CLOUD_API_KEY", "")


@agent.on_event("startup")
async def on_startup(ctx: Context):
    ctx.logger.info("=" * 60)
    ctx.logger.info("Zivana Intelligence Agent — Agentverse Edition")
    ctx.logger.info(f"  Address : {agent.address}")
    ctx.logger.info(f"  ASI mode: {'LIVE' if ASI_API_KEY else 'MOCK'}")
    ctx.logger.info("=" * 60)


@agent.on_message(model=MarketQuery)
async def handle_query(ctx: Context, sender: str, msg: MarketQuery):
    ctx.logger.info(f"Received: product={msg.product}, jurisdiction={msg.jurisdiction}")

    result = get_market_price(msg.product, msg.jurisdiction, api_key=ASI_API_KEY)
    ctx.logger.info(f"Price: {result['price']:.2f} {result['currency']} (source={result['source']})")

    fact = build_fact_statement(
        msg.product, msg.jurisdiction,
        result["price"], result["currency"],
        result["source"], result["timestamp"],
    )
    fact_json = json.dumps(fact, indent=2)
    ctx.logger.info(f"Orcfax COOP fact statement:\n{fact_json}")

    await ctx.send(sender, FactStatementResponse(fact_json=fact_json))
    ctx.logger.info(f"Response sent to {sender}")


if __name__ == "__main__":
    agent.run()
