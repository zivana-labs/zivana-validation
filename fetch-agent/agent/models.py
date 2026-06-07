"""
Shared message models for the Zivana Intelligence Agent protocol.

Both the agent and test client must import these SAME model classes
to ensure matching schema digests (required by uAgents v0.25+).
"""

from uagents import Model


class MarketQuery(Model):
    product: str
    jurisdiction: str


class FactStatementResponse(Model):
    fact_json: str
    success: bool = True
    error: str = ""
