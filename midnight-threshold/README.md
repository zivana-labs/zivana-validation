# VAL-002: Midnight Proof-of-Threshold Circuit

Prove Midnight ZK privacy: deploy a Compact contract that proves a secret score exceeds a public threshold without revealing the secret.

## Prerequisites
- Node.js 18+
- Midnight devnet access (apply at https://midnight.network)
- `@midnight-ntwrk/sdk` installed (`npm install`)

## Setup
1. In `client/`, run `npm install`.
2. Set your Midnight devnet API key (if required) in `index.ts`.
3. Ensure `midnight-cli` is available globally (optional).

## Testing
1. Run `npx ts-node client/index.ts`.
2. Observe proof generation and verification logs.

## Extension
Modify the contract to accept multiple thresholds (e.g., `threshold1` and `threshold2`) and test with different secrets.
