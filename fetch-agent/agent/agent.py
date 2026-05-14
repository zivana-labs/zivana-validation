from uagents import Agent, Context, Model
import requests

class MarketQuery(Model):
    product: str
    jurisdiction: str

class OrcfaxFact(Model):
    value: float
    currency: str
    period: str

agent = Agent(name="zivana-intelligence", seed="zivana-seed", port=8000, endpoint=["http://localhost:8000/submit"])

@agent.on_message(model=MarketQuery)
async def handle_query(ctx: Context, sender: str, msg: MarketQuery):
    # Call ASI Cloud function to compute a dummy market price
    # In real deployment, this would invoke an ASI Cloud endpoint.
    # For stub, we return a hardcoded value.
    ctx.logger.info(f"Received query for {msg.product} in {msg.jurisdiction}")
    fact = OrcfaxFact(
        value=1500.0,   # example price per unit
        currency="NGN",
        period="2026-05-01/2026-05-07"
    )
    await ctx.send(sender, fact)

if __name__ == "__main__":
    agent.run()
