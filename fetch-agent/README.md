# VAL-005: Fetch.ai uAgent + ASI Cloud

Deploy a Zivana Market Intelligence uAgent on Fetch.ai Agentverse and connect it to ASI Cloud for dummy computation.

## Prerequisites
- Python 3.9+, pip
- Fetch.ai Agentverse account (agentverse.ai)
- uAgents library (`pip install uagents`)

## Setup
1. Install dependencies: `pip install -r requirements.txt`
2. Run the agent locally: `python agent/agent.py`
3. Test by sending a message using another agent or the Agentverse interface.

## Extension
Modify the agent to call an actual ASI Cloud endpoint (replace the hardcoded value). Ensure the response matches the Orcfax COOP JSON format.
