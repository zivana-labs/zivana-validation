"""
Zivana Market Intelligence uAgent (VAL-005).

Receives MarketQuery messages, calls ASI Cloud for a market price estimate,
and responds with an Orcfax COOP-compliant fact statement in JSON-LD format.

Usage (local):
    python agent/agent.py

The agent registers on the Almanac and listens for MarketQuery messages.
"""

import json
import logging
import uuid
from datetime import datetime, timezone, timedelta

from uagents import Agent, Context

from asi_cloud_func import ASICloudClient
from models import MarketQuery, FactStatementResponse


# ---------------------------------------------------------------------------
# Orcfax COOP Fact Statement Builder
# ---------------------------------------------------------------------------
def build_orcfax_fact_statement(
    product: str,
    jurisdiction: str,
    price: float,
    currency: str,
    source: str,
    computation_ts: str,
) -> dict:
    """
    Construct an Orcfax COOP-compliant fact statement in JSON-LD.

    Follows the schema pattern from orcfax-schema/schemas/revenue-event.jsonld,
    adapted for market-price claims published by the Zivana Intelligence Agent.
    """
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
            {"@type": "PropertyValue", "name": "computationTimestamp", "value": computation_ts},
        ],
    }


# ---------------------------------------------------------------------------
# Agent Setup
# ---------------------------------------------------------------------------
agent = Agent(
    name="zivana-intelligence",
    seed="zivana-seed",
    port=8000,
    endpoint=["http://localhost:8000/submit"],
)

# Instantiate the ASI Cloud client once at module level.
asi_client = ASICloudClient()


# ---------------------------------------------------------------------------
# Handlers
# ---------------------------------------------------------------------------
@agent.on_event("startup")
async def on_startup(ctx: Context):
    """Log the agent address on startup so testers can find it."""
    ctx.logger.info("=" * 60)
    ctx.logger.info("Zivana Intelligence Agent is LIVE")
    ctx.logger.info("  Address : %s", agent.address)
    ctx.logger.info("  Name    : %s", agent.name)
    ctx.logger.info("  Port    : 8000")
    ctx.logger.info("  ASI mode: %s", "MOCK" if asi_client._mock_mode else "LIVE")
    ctx.logger.info("=" * 60)


@agent.on_message(model=MarketQuery)
async def handle_query(ctx: Context, sender: str, msg: MarketQuery):
    """
    Full chain:
    1. Receive MarketQuery
    2. Call ASI Cloud for a price estimate
    3. Build Orcfax COOP fact statement
    4. Return the JSON-LD to the sender
    """
    ctx.logger.info(
        ">> Received MarketQuery: product=%s, jurisdiction=%s (from %s)",
        msg.product, msg.jurisdiction, sender,
    )

    # Step 2 — ASI Cloud computation
    ctx.logger.info("   Calling ASI Cloud for market price...")
    result = asi_client.get_market_price(msg.product, msg.jurisdiction)
    ctx.logger.info(
        "   ASI Cloud returned: price=%.2f %s (source=%s)",
        result["price"], result["currency"], result["source"],
    )

    # Step 3 — Build Orcfax COOP fact statement
    fact_statement = build_orcfax_fact_statement(
        product=msg.product,
        jurisdiction=msg.jurisdiction,
        price=result["price"],
        currency=result["currency"],
        source=result["source"],
        computation_ts=result["timestamp"],
    )
    fact_json = json.dumps(fact_statement, indent=2)
    ctx.logger.info("   Formatted Orcfax COOP fact statement:")
    for line in fact_json.split("\n"):
        ctx.logger.info("   | %s", line)

    # Step 4 — Respond
    await ctx.send(
        sender,
        FactStatementResponse(fact_json=fact_json, success=True),
    )
    ctx.logger.info("   Sent response to %s", sender)


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    agent.run()
