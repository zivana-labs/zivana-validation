# VAL-006: Celo MiniPay Stablecoin Payment Simulation

Deploy a simple payment splitter on Celo Alfajores testnet, deposit, and distribute to simulate stablecoin payouts.

## Prerequisites
- Node.js 18+, npm
- A Celo Alfajores wallet with test CELO (faucet: https://celo.org/developers/faucet)
- Private key exported

## Setup
1. `npm install`
2. Replace `0xYOUR_PRIVATE_KEY` in `hardhat.config.ts` with your test wallet key.
3. Ensure you have test CELO.

## Testing
1. `npm run compile`
2. `npm run simulate` — deploys contract, deposits, and distributes.

## Extension
Modify the contract to accept cUSD (ERC-20) instead of native CELO, and integrate the MiniPay SDK for phone-number-based transfers.
