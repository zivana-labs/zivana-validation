"""
ASI Cloud Integration Layer for Zivana Intelligence Agent.

Provides a client that calls the ASI Cloud inference API (OpenAI-compatible)
to compute market price estimates. Falls back to a local mock computation
when no API key is configured or when the remote call fails.
"""

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv

# Load .env from the project root (fetch-agent/)
_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_env_path)

logger = logging.getLogger("asi_cloud")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
ASI_CLOUD_BASE_URL = "https://inference.asicloud.cudos.org/v1"
ASI_CLOUD_MODEL = "asi1-mini"

# Deterministic fallback prices keyed by (product, jurisdiction).
# Used in mock mode or when the API call fails.
_MOCK_PRICES: dict[tuple[str, str], float] = {
    ("cassava flour", "NG-LA"): 1500.0,
    ("cassava flour", "NG-KN"): 1420.0,
    ("palm oil", "NG-LA"): 2800.0,
    ("palm oil", "GH-AA"): 3100.0,
    ("shea butter", "NG-KN"): 4500.0,
}
_DEFAULT_MOCK_PRICE = 1500.0


# ---------------------------------------------------------------------------
# ASI Cloud Client
# ---------------------------------------------------------------------------
class ASICloudClient:
    """Calls ASI Cloud's OpenAI-compatible inference API for price estimates."""

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str = ASI_CLOUD_BASE_URL,
        model: str = ASI_CLOUD_MODEL,
    ):
        self.api_key = api_key or os.getenv("ASI_CLOUD_API_KEY", "")
        self.base_url = base_url.rstrip("/")
        self.model = model
        self._mock_mode = not bool(self.api_key)

        if self._mock_mode:
            logger.warning(
                "ASI_CLOUD_API_KEY not set — running in mock mode "
                "(hardcoded market prices)"
            )

    # ----- public API -------------------------------------------------------

    def get_market_price(
        self, product: str, jurisdiction: str
    ) -> dict:
        """
        Fetch a market price estimate for *product* in *jurisdiction*.

        Returns a dict with keys:
            price      (float)  – estimated unit price
            currency   (str)    – ISO 4217 currency code
            source     (str)    – "asi_cloud" | "mock"
            timestamp  (str)    – ISO 8601 UTC timestamp of the computation
        """
        timestamp = datetime.now(timezone.utc).isoformat()

        if self._mock_mode:
            return self._mock_price(product, jurisdiction, timestamp)

        try:
            return self._call_asi_cloud(product, jurisdiction, timestamp)
        except Exception as exc:
            logger.error("ASI Cloud call failed: %s — falling back to mock", exc)
            result = self._mock_price(product, jurisdiction, timestamp)
            result["source"] = "mock_fallback"
            return result

    # ----- private helpers --------------------------------------------------

    def _call_asi_cloud(
        self, product: str, jurisdiction: str, timestamp: str
    ) -> dict:
        """Make a real call to the ASI Cloud inference API."""
        url = f"{self.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        prompt = (
            f"You are a market data oracle. Return ONLY a JSON object with "
            f"exactly two keys: \"price\" (a number) and \"currency\" "
            f"(an ISO 4217 code). Estimate the current average wholesale "
            f"unit price (per kg) of {product} in jurisdiction {jurisdiction}. "
            f"Respond with JSON only, no explanation."
        )
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": "You are a precise market data API."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.1,
            "max_tokens": 100,
        }

        logger.info("Calling ASI Cloud: POST %s (model=%s)", url, self.model)
        resp = requests.post(url, headers=headers, json=payload, timeout=30)
        resp.raise_for_status()

        data = resp.json()
        content = data["choices"][0]["message"]["content"]
        logger.info("ASI Cloud raw response: %s", content)

        # Parse the JSON from the model response.
        # LLMs often wrap JSON in markdown code fences — strip them.
        content = content.strip()
        if content.startswith("```"):
            # Remove opening ```json or ``` and closing ```
            lines = content.split("\n")
            lines = [l for l in lines if not l.strip().startswith("```")]
            content = "\n".join(lines)
        parsed = json.loads(content)
        price = float(parsed["price"])
        currency = parsed.get("currency", "NGN")

        return {
            "price": price,
            "currency": currency,
            "source": "asi_cloud",
            "timestamp": timestamp,
        }

    @staticmethod
    def _mock_price(
        product: str, jurisdiction: str, timestamp: str
    ) -> dict:
        """Return a deterministic hardcoded price."""
        key = (product.lower().strip(), jurisdiction.upper().strip())
        price = _MOCK_PRICES.get(key, _DEFAULT_MOCK_PRICE)
        logger.info("Mock price for %s in %s: %.2f", product, jurisdiction, price)
        return {
            "price": price,
            "currency": "NGN",
            "source": "mock",
            "timestamp": timestamp,
        }


# ---------------------------------------------------------------------------
# Convenience — direct CLI test
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    client = ASICloudClient()
    result = client.get_market_price("cassava flour", "NG-LA")
    print(json.dumps(result, indent=2))
