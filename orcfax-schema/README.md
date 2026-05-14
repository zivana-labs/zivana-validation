# VAL-004: Orcfax Revenue Event Fact Statement

Define and publish an SME revenue event fact statement on Orcfax testnet, then query it from Cardano.

## Prerequisites
- Node.js 18+, npm
- Blockfrost API key (preprod)
- Orcfax testnet access (apply at orcfax.io)

## Setup
1. `npm install`
2. Replace `your_key` in `scripts/query-fact.ts`.
3. Adjust Orcfax endpoint in `publish-fact.ts` per their docs.

## Testing
1. Run `npm run publish` to send the JSON-LD fact statement.
2. Run `npm run query` to fetch and display the on-chain reference.

## Extension
Extend the schema to include multiple revenue periods and add validation logic.
