# VAL-005: Fetch.ai uAgent + ASI Cloud

Zivana Market Intelligence uAgent — deploys on [Agentverse](https://agentverse.ai), calls [ASI Cloud](https://asicloud.cudos.org/) for market price computation, and returns results as [Orcfax COOP](https://orcfax.io)-compliant fact statements.

## Architecture

```
┌────────────────┐     MarketQuery      ┌───────────────────────┐    HTTPS/REST    ┌──────────────┐
│   Test Client  │ ──────────────────▶  │  Zivana Intelligence  │ ───────────────▶ │  ASI Cloud   │
│  (or any agent)│                      │       uAgent          │                  │  Inference   │
│                │ ◀──────────────────  │                       │ ◀─────────────── │  API         │
└────────────────┘  FactStatementResponse└───────────────────────┘   price JSON     └──────────────┘
                    (Orcfax COOP JSON-LD)       │
                                                │ builds
                                                ▼
                                    ┌─────────────────────┐
                                    │  Orcfax COOP        │
                                    │  Fact Statement     │
                                    │  (JSON-LD)          │
                                    └─────────────────────┘
```

**Flow:** Client sends `MarketQuery` → Agent calls ASI Cloud → Receives price → Builds Orcfax COOP JSON-LD → Returns `FactStatementResponse`.

## Prerequisites

- **Python 3.9+** and pip
- **Fetch.ai Agentverse account** — sign up at [agentverse.ai](https://agentverse.ai)
- **ASI Cloud API key** *(optional)* — get one at [asicloud.cudos.org](https://asicloud.cudos.org/). Without it, the agent runs in mock mode with hardcoded prices.

## File Structure

```
fetch-agent/
├── agent/
│   ├── agent.py              # Main intelligence agent (local deployment)
│   ├── asi_cloud_func.py     # ASI Cloud client (real API + mock fallback)
│   ├── agentverse_agent.py   # Self-contained agent for Agentverse
│   └── test_client.py        # Test client for end-to-end verification
├── .env.example              # Environment variable template
├── requirements.txt          # Python dependencies
└── README.md                 # This file
```

## Local Development

### 1. Install Dependencies

```bash
cd fetch-agent
pip install -r requirements.txt
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env and add your ASI Cloud API key
```

### 3. Run the Agent

```bash
python agent/agent.py
```

You should see:

```
============================================================
Zivana Intelligence Agent is LIVE
  Address : agent1q...
  Name    : zivana-intelligence
  Port    : 8000
  ASI mode: LIVE   (or MOCK if no API key)
============================================================
```

### 4. Run the Test Client

In a **second terminal**:

```bash
python agent/test_client.py
```

> **Note:** Before running the test client, copy the agent address printed by `agent.py` and update `INTELLIGENCE_AGENT_ADDRESS` in `test_client.py`.

The test client will send a query for "cassava flour" in "NG-LA" and print the response:

```
============================================================
RECEIVED ORCFAX COOP FACT STATEMENT
============================================================
Fact Statement (JSON-LD):
  {
    "@context": "https://schema.org",
    "@type": "Claim",
    "identifier": "zivana-market-price-a1b2c3d4e5f6",
    "dateCreated": "2026-06-07T14:00:00Z",
    "text": "Market price estimate for cassava flour in NG-LA ...",
    "about": {
      "@type": "PriceSpecification",
      "price": 1500.0,
      "priceCurrency": "NGN",
      ...
    },
    "claimInterpreter": "zivana-intelligence-agent"
  }
VALIDATION PASSED — all required Orcfax COOP fields present
VALIDATION PASSED — price specification complete
  Price : 1500.00 NGN
```

### 5. Test ASI Cloud Directly

You can test the ASI Cloud client standalone:

```bash
# Mock mode (no API key needed)
python agent/asi_cloud_func.py

# Live mode
ASI_CLOUD_API_KEY=your_key_here python agent/asi_cloud_func.py
```

## Agentverse Deployment

### Step 1: Create an Agentverse Account

1. Go to [agentverse.ai](https://agentverse.ai) and sign up.
2. Complete the onboarding process.

### Step 2: Create a New Hosted Agent

1. Navigate to the **Agents** tab in the sidebar.
2. Click **+ Launch an Agent**.
3. Select **Create an Agent** → choose the **Blank** template.
4. Name it `zivana-intelligence` and add keywords: `market`, `price`, `oracle`, `zivana`.

### Step 3: Upload the Agent Code

1. Click the **Build** tab on your new agent.
2. **Replace all code** in the editor with the contents of `agent/agentverse_agent.py`.
3. Click **Save**.

### Step 4: Add ASI Cloud API Key (Optional)

1. In the agent settings, find **Secrets** or **Environment Variables**.
2. Add a new secret:
   - **Name:** `ASI_CLOUD_API_KEY`
   - **Value:** Your API key from [asicloud.cudos.org](https://asicloud.cudos.org/)
3. Save.

### Step 5: Verify Agent Activity

1. Go to the **Logs** tab — you should see the startup message.
2. The agent's address will appear in the logs.
3. The agent will appear in the Agentverse dashboard as "running".

### Step 6: Send a Test Message

You can send a test message from another agent on Agentverse, or run `test_client.py` locally pointing to the Agentverse agent's address.

To test from Agentverse:
1. Create a second agent using the test client template.
2. Update the `INTELLIGENCE_AGENT_ADDRESS` to your deployed agent's address.
3. Run and check both agents' logs.

## ASI Cloud Setup

1. Visit [asicloud.cudos.org](https://asicloud.cudos.org/).
2. Connect your wallet (Metamask, Keplr, etc.) — no KYC required.
3. Navigate to the API section and generate an **LLM API Key**.
4. Copy the key to your `.env` file or Agentverse secrets.

The agent uses the ASI Cloud inference endpoint (`https://inference.asicloud.cudos.org/v1`) which is OpenAI-compatible. It sends a structured prompt to an LLM asking for a market price estimate and parses the JSON response.

## Orcfax COOP Fact Statement Format

The agent outputs JSON-LD following the [Orcfax COOP schema pattern](https://docs.orcfax.io):

```json
{
  "@context": "https://schema.org",
  "@type": "Claim",
  "identifier": "zivana-market-price-<unique-id>",
  "dateCreated": "2026-06-07T14:00:00Z",
  "text": "Market price estimate for cassava flour in NG-LA for period 2026-05-31/2026-06-07",
  "about": {
    "@type": "PriceSpecification",
    "price": 1500.0,
    "priceCurrency": "NGN",
    "validFrom": "2026-05-31",
    "validThrough": "2026-06-07",
    "name": "cassava flour",
    "description": "Wholesale unit price (per kg) in NG-LA"
  },
  "claimInterpreter": "zivana-intelligence-agent",
  "sdPublisher": {
    "@type": "Organization",
    "name": "Zivana Protocol",
    "url": "https://zivana.network"
  },
  "additionalProperty": [
    { "@type": "PropertyValue", "name": "dataSource", "value": "asi_cloud" },
    { "@type": "PropertyValue", "name": "computationTimestamp", "value": "2026-06-07T14:00:00+00:00" }
  ]
}
```

| Field | Description |
|-------|-------------|
| `@context` | Schema.org vocabulary URI |
| `@type` | `Claim` — aligns with Orcfax fact statement type |
| `identifier` | Unique ID for this fact statement |
| `dateCreated` | UTC timestamp when the statement was created |
| `text` | Human-readable summary of the claim |
| `about.price` | Numeric price value from ASI Cloud |
| `about.priceCurrency` | ISO 4217 currency code |
| `about.validFrom/validThrough` | Price validity window |
| `claimInterpreter` | Agent that produced this fact |
| `sdPublisher` | Zivana Protocol organization |
| `additionalProperty` | Data source and computation timestamp metadata |

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `ASI_CLOUD_API_KEY not set — running in mock mode` | Set the key in `.env` or as an env var. Mock mode still works for testing. |
| `ASI Cloud call failed` | Check your API key, network connectivity, and that the model is available. The agent auto-falls back to mock mode. |
| Agent address mismatch | The address is derived from the seed phrase. Ensure both agent and test client use the correct address. |
| `Connection refused` on port 8000 | Make sure the agent is running before starting the test client. |
| Agentverse code editor error | Ensure you're using `agentverse_agent.py` (self-contained, no local imports). |

## Contributing

See the [CONTRIBUTING.md](../CONTRIBUTING.md) for the full workflow. For this task:

1. Branch from `develop`: `git checkout -b val-005/intelligence-agent`
2. Make your changes in `fetch-agent/`
3. Open a PR against `develop` with:
   - Screenshots of Agentverse dashboard showing agent activity
   - Logs showing ASI Cloud call and JSON output
   - Link to this README

## License

MIT — see [LICENSE](../LICENSE).
