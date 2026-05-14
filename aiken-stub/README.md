# VAL-001: Aiken Distribution Validator Stub

Prove Cardano eUTxO settlement: lock funds in a simple Aiken validator, then distribute to two beneficiaries when a metadata condition is met.

## Prerequisites
- Node.js 18+, npm
- Blockfrost API key (free tier: blockfrost.io)
- Aiken installed (`curl -sSfL https://install.aiken-lang.org | bash`)

## Setup
1. `npm install`
2. Replace `your_project_id_here` in `scripts/interact.ts` with your Blockfrost key.
3. `aiken build` — compiles the validator.

## Testing
1. Ensure you have test ADA on Cardano preprod (faucet: https://docs.cardano.org/cardano-testnet/tools/faucet).
2. Run `npx ts-node scripts/interact.ts`.
3. Observe the lock and distribute transactions in the explorer.

## Extension (contributor task)
Add a second condition (e.g., require a specific metadata key) and write a test that validates it.
