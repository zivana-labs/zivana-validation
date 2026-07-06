"""
Test Client for Zivana Intelligence Agent (VAL-005).

Sends a MarketQuery to the intelligence agent and prints the Orcfax COOP
fact statement response. Used for local end-to-end testing.

Usage:
    1. Start the intelligence agent:  python agent/agent.py
    2. In another terminal:           python agent/test_client.py

The client will send a test query on startup and print the response.
"""

import json
import logging

from uagents import Agent, Context

from models import MarketQuery, FactStatementResponse


# ---------------------------------------------------------------------------
# Test Client Agent
# ---------------------------------------------------------------------------
INTELLIGENCE_AGENT_ADDRESS = (
    "agent1q0cc43lj3ya99udy73mmput2zy0z5l2c5rutpwacq4cxunqsxn3lqe7c3l3"
)

test_client = Agent(
    name="zivana-test-client",
    seed="zivana-test-client-seed",
    port=8001,
    endpoint=["http://localhost:8001/submit"],
)


@test_client.on_event("startup")
async def send_test_query(ctx: Context):
    """Send a MarketQuery to the intelligence agent on startup."""
    ctx.logger.info("=" * 60)
    ctx.logger.info("Test Client starting — sending MarketQuery")
    ctx.logger.info("  Target: %s", INTELLIGENCE_AGENT_ADDRESS)
    ctx.logger.info("=" * 60)

    query = MarketQuery(product="cassava flour", jurisdiction="NG-LA")
    ctx.logger.info("Sending query: product=%s, jurisdiction=%s", query.product, query.jurisdiction)
    await ctx.send(INTELLIGENCE_AGENT_ADDRESS, query)


@test_client.on_message(model=FactStatementResponse)
async def handle_response(ctx: Context, sender: str, msg: FactStatementResponse):
    """Print the received Orcfax COOP fact statement."""
    ctx.logger.info("=" * 60)
    ctx.logger.info("RECEIVED ORCFAX COOP FACT STATEMENT")
    ctx.logger.info("=" * 60)

    if msg.success:
        fact = json.loads(msg.fact_json)
        formatted = json.dumps(fact, indent=2)
        ctx.logger.info("Fact Statement (JSON-LD):")
        for line in formatted.split("\n"):
            ctx.logger.info("  %s", line)

        # Validate key fields
        required_fields = ["@context", "@type", "identifier", "dateCreated", "text", "about", "claimInterpreter"]
        missing = [f for f in required_fields if f not in fact]
        if missing:
            ctx.logger.warning("VALIDATION FAILED — missing fields: %s", missing)
        else:
            ctx.logger.info("VALIDATION PASSED — all required Orcfax COOP fields present")

        # Check about sub-fields
        about = fact.get("about", {})
        about_required = ["@type", "price", "priceCurrency", "validFrom", "validThrough"]
        about_missing = [f for f in about_required if f not in about]
        if about_missing:
            ctx.logger.warning("VALIDATION FAILED — missing about fields: %s", about_missing)
        else:
            ctx.logger.info("VALIDATION PASSED — price specification complete")
            ctx.logger.info("  Price : %.2f %s", about["price"], about["priceCurrency"])
    else:
        ctx.logger.error("Agent returned error: %s", msg.error)


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    test_client.run()
