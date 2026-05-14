# VAL-003: Identus DID & Credential Issuance

Prove W3C DID issuance and verification on Cardano using Hyperledger Identus.

## Prerequisites
- Docker and Docker Compose
- Node.js 18+, npm
- Blockfrost API key (preprod)

## Setup
1. Export `BLOCKFROST_API_KEY` in your shell.
2. Run `docker-compose up -d`.
3. Wait for agent to be healthy: `curl http://localhost:8080/cloud-agent/_system/health`.
4. Install script dependencies: `npm install axios express`.

## Testing
1. Issue a credential: `npx ts-node scripts/issue-credential.ts`.
2. Observe the DID anchor on Cardano preprod (check transaction hash in agent logs).
3. Start USSD simulator: `npx ts-node scripts/ussd-endpoint.ts` and test with `curl`.

## Extension
Replace the mock USSD response with a real Africa's Talking sandbox integration.
