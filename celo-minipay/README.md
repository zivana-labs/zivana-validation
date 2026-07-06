# VAL-006: Celo MiniPay Stablecoin Payment Simulation

Deploy a payment splitter on Celo, fund it with a stablecoin, and distribute payouts to many
recipients in one transaction — the on-chain half of a Zivana covenant distribution settled on Celo
and delivered to participants via Opera MiniPay.

## ⚠️ Read first: Alfajores is deprecated

The task text names **Alfajores**, but Alfajores was **deprecated when Ethereum Holesky sunset
(Sep 30 2025)**. Celo's live developer testnet is now **Celo Sepolia** (chainId `11142220`). This
project therefore targets **Celo Sepolia**. Also note: **classic cUSD is not deployed on Celo
Sepolia** — the equivalent stablecoins are **USDC** and Mento **USDm**. See [REPORT.md](./REPORT.md)
for the full rationale. The contract is token-agnostic, so it works with cUSD on mainnet unchanged.

## What's here

| File | Purpose |
|---|---|
| `contracts/PaySplitter.sol` | Original native-CELO splitter (unchanged, as provided). |
| `contracts/CusdPaySplitter.sol` | **Stablecoin (ERC-20) splitter** — the VAL-006 deliverable. |
| `contracts/MockERC20.sol` | Local-test-only ERC-20 stand-in for USDC/USDm/cUSD. |
| `scripts/deploy.ts` / `deploy-cusd.ts` | Deploy the native / stablecoin splitter. |
| `scripts/simulate.ts` / `simulate-cusd.ts` | Run the native / stablecoin deposit+distribute flow. |
| `test/CusdPaySplitter.test.ts` | Offline test of the stablecoin flow (no testnet needed). |
| `MINIPAY.md` | MiniPay SDK integration + phone-number transfer UX. |
| `REPORT.md` | Friction points + suggestions. |

## ✅ Live deployment & evidence (Celo Sepolia)

| Item | Value |
|---|---|
| Network | Celo Sepolia (chainId `11142220`) |
| Deployer wallet | `0x0625416E9F02694c680f562Ea47A2Ca24c288d3f` |
| Stablecoin | USDC `0x01C5C0122039549AD1493B8220cABEdD739BC44E` (6 decimals) |
| **CusdPaySplitter (verified)** | [`0x37927bE9BC87c4124a2A2ba3FD1fAD6A0e141c8f`](https://celo-sepolia.blockscout.com/address/0x37927bE9BC87c4124a2A2ba3FD1fAD6A0e141c8f#code) |
| approve tx | [`0xcab3e830…36d05c9`](https://celo-sepolia.blockscout.com/tx/0xcab3e8307a5c1b3dffaf930237a03a0af38a98a144b2f0c9fce2e926536d05c9) |
| deposit tx | [`0x30941104…18fd4346`](https://celo-sepolia.blockscout.com/tx/0x30941104fbc1b2783353da29bccf28d8544ad6ac419e825cbdf664f018fd4346) |
| distribute tx | [`0xd045f93a…26a0cf52b3`](https://celo-sepolia.blockscout.com/tx/0xd045f93a23ad82de7102ed73e428a9e4b2f6fdd1b5c7e153a522e326a0cf52b3) |
| Payout result | Recipient 1 `0xdD75…0b25` → 0.4 USDC · Recipient 2 `0x7E9c…9F83` → 0.6 USDC |

Reproduce the steps below with your own wallet.

## Prerequisites

- Node.js 18+ and npm
- A **throwaway** testnet wallet (MetaMask, Valora, or MiniPay) — never use a key holding real funds
- Test CELO (for gas) and a test stablecoin (USDC or USDm)

## 1. Set up a Celo Sepolia wallet

Add Celo Sepolia to MetaMask (or use Valora / MiniPay):

| Field | Value |
|---|---|
| Network name | Celo Sepolia |
| RPC URL | `https://forno.celo-sepolia.celo-testnet.org` (confirm on [Chainlist](https://chainlist.org) → chainId `11142220`) |
| Chain ID | `11142220` |
| Currency symbol | `CELO` |
| Block explorer | `https://celo-sepolia.blockscout.com` (or `https://sepolia.celoscan.io`) |

## 2. Get testnet funds (faucet access)

- **CELO (gas):** [`faucet.celo.org/celo-sepolia`](https://faucet.celo.org/celo-sepolia) — authenticate
  with GitHub for 10× tokens. Alternative: [Google Cloud Web3 faucet](https://cloud.google.com/application/web3/faucet/celo/sepolia).
- **USDC (stablecoin, default):** [`faucet.circle.com`](https://faucet.circle.com) — permissionless,
  20 USDC / 2h per address. Pick "Celo Sepolia". USDC on Celo Sepolia: `0x01C5C0122039549AD1493B8220cABEdD739BC44E` (6 decimals).
- **USDm (Mento Dollar, cUSD lineage; optional):** `0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b` —
  obtain by swapping CELO for Mento tokens via the Celo faucet/Mento; set `STABLE_TOKEN_ADDRESS` to it.

## 3. Install & configure

```bash
npm install
cp .env.example .env
# edit .env: set PRIVATE_KEY (throwaway test key). RPC + USDC address already defaulted.
```

## 4. Compile & test offline (no testnet needed)

```bash
npm run compile
npm run test      # exercises approve -> deposit -> distribute against MockERC20
```

This proves the stablecoin logic with zero on-chain dependency — useful before spending faucet funds.

## 5. Deploy to Celo Sepolia

```bash
npm run deploy:cusd
# prints the CusdPaySplitter address, explorer link, and the exact verify + simulate commands
```

(Native-CELO variant: `npm run deploy` / `npm run simulate`.)

## 6. Verify on the explorer

No API key needed via Blockscout/Sourcify:

```bash
npx hardhat verify --network celoSepolia <SPLITTER_ADDRESS> <STABLE_TOKEN_ADDRESS>
```

- Sourcify is enabled in `hardhat.config.ts` (no key).
- For **Celoscan**, set `ETHERSCAN_API_KEY` in `.env` (unified Etherscan v2 key). Browse the verified
  contract at `https://sepolia.celoscan.io/address/<SPLITTER_ADDRESS>#code`.

## 7. Run the stablecoin simulation

```bash
# reuse the deployed splitter and send a real payout
SPLITTER_ADDRESS=<addr> npm run simulate:cusd
```

Optional env: `RECIPIENTS=0x..,0x..` (else two random addresses), `DEPOSIT_AMOUNT=1.0`,
`STABLE_TOKEN_ADDRESS=` (defaults to USDC). The script logs the **approve → deposit → distribute**
tx hashes and the resulting recipient balances.

## 8. MiniPay / phone-number transfer

See [MINIPAY.md](./MINIPAY.md) for the MiniPay SDK integration and the phone-number transfer UX
(and its testnet limitation).

## Evidence checklist (for the PR)

- [ ] Deployed `CusdPaySplitter` address + explorer link
- [ ] "Verified" (green) on Blockscout/Celoscan
- [ ] approve / deposit / distribute tx hashes
- [ ] Recipient balances shown on explorer
- [ ] MiniPay test interface OR Valora logs screenshot
- [ ] Friction notes ([REPORT.md](./REPORT.md))

## Troubleshooting

- **`insufficient funds` on deploy** — need test CELO for gas (step 2).
- **`transferFrom failed` on deposit** — you skipped `approve`, or approved too little. The script
  approves automatically; if calling manually, approve the splitter first.
- **RPC errors / timeouts** — the default RPC may be stale; get the current Celo Sepolia RPC from
  Chainlist (chainId `11142220`) and set `CELO_SEPOLIA_RPC_URL` in `.env`.
- **`decimals` mismatch** — USDC is 6 decimals, USDm/cUSD are 18. Scripts read decimals from the
  token, so pass human units (e.g. `DEPOSIT_AMOUNT=1.0`), not raw base units.
