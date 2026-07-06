# VAL-006 — Friction Report & Suggestions

Findings from deploying the provided `celo-minipay` project and converting it to a stablecoin flow.
Ordered by impact.

## 1. Alfajores is deprecated — the biggest blocker

- **Friction:** The task and the provided repo target **Alfajores**, but Alfajores was deprecated
  when Ethereum **Holesky sunset (Sep 30 2025)**; Baklava went with it. Deploying fresh to Alfajores
  in 2026 is unreliable (RPC/faucet/explorer may be dead), so the acceptance criteria ("deployed +
  verified on Alfajores explorer", "Alfajores tx hashes") cannot be reliably met as written.
- **Action taken:** Retargeted to **Celo Sepolia** (chainId `11142220`), Celo's current Ethereum-L2
  testnet.
- **Suggestion:** Update the task and the `zivana-validation/celo-minipay` repo to Celo Sepolia
  everywhere (RPC, explorer links, faucet). Bounties that name a specific testnet should be revalidated
  against network lifecycles.

## 2. Classic cUSD does not exist on Celo Sepolia

- **Friction:** The scope says "use cUSD (ERC-20)", but cUSD (Celo Dollar) is **not deployed on Celo
  Sepolia**. The fresh L2 testnet exposes Mento **USDm** (`0xdE9e…B00b`) and **USDC**
  (`0x01C5…C44E`) instead.
- **Action taken:** Made `CusdPaySplitter` **token-agnostic** (token address set at construction /
  via `STABLE_TOKEN_ADDRESS`). Default = **USDC** (Circle faucet is permissionless + reliable, and
  MiniPay supports USDC); **USDm** is a one-env-var switch and is the closest cUSD lineage (both are
  Mento stables). On Celo **mainnet**, point it at cUSD unchanged.
- **Suggestion:** Reword the scope to "a Celo stablecoin (cUSD on mainnet; USDC/USDm on Sepolia)".
  A token-agnostic splitter is the right primitive anyway.

## 3. Provided simulation script is broken against its own dependencies

- **Friction:** `scripts/simulate.ts` used the **ethers v5** API (`splitter.deployed()`,
  `splitter.address`, `ethers.utils.parseEther`) while `@nomicfoundation/hardhat-toolbox@^3` ships
  **ethers v6**. It would throw immediately.
- **Action taken:** Rewrote all scripts to ethers v6 (`waitForDeployment()`, `getAddress()`,
  `ethers.parseEther/parseUnits`).
- **Suggestion:** Pin the ethers major in docs, or add a CI `npm ci && npm run compile && npm test`
  so the provided sample can't rot.

## 4. `deploy.ts` referenced but missing

- **Friction:** `package.json` had `"deploy": "hardhat run scripts/deploy.ts …"` but `scripts/deploy.ts`
  didn't exist → `npm run deploy` fails.
- **Action taken:** Added `scripts/deploy.ts` (native) and `scripts/deploy-cusd.ts` (stablecoin), each
  printing the address, explorer link, and the exact verify command.

## 5. Hardcoded private key anti-pattern

- **Friction:** `hardhat.config.ts` had `accounts: ["0xYOUR_PRIVATE_KEY"]` inline — invites committing
  a real key.
- **Action taken:** Moved to `dotenv` + `.env` (gitignored) with `.env.example`; a dummy key keeps
  compile/test working offline.
- **Suggestion:** Ship `.env.example` + `.gitignore` in the template from day one.

## 6. ERC-20 approve→deposit is a two-transaction UX tax

- **Friction:** Unlike native CELO (single payable call), the stablecoin path needs **two txs**:
  `approve` then `deposit` (`transferFrom`). Two signatures, two gas payments, and a common failure
  mode (`transferFrom failed`) when users forget/underfund the approval.
- **Suggestion for production:** support **EIP-2612 `permit`** (Mento stables / USDC support it) to
  collapse approve+deposit into one signed call, or accept a direct `transfer` + push model. For
  MiniPay specifically, the wallet abstracts gas (pays fees in the stablecoin), which softens this.

## 7. MiniPay testnet: transfers fail with a fee-currency gas bug (tested on-device)

MiniPay **does** support Celo Sepolia: Settings → About → tap Version ~7× → Developer Settings →
"Use Testnet". Installed on a real Android device, wallet created, and funded with faucet CELO + 20
test USDC. But sending consistently failed:

- **Friction (tested):** A stablecoin send is rejected by the node:
  `intrinsic gas too low: gas limit 54526 below required 71596 (standard intrinsic + fee-currency
  intrinsic) for fee-currency 0xbf1441Ea57f43f35f713431001f35742c88071c7`.
  MiniPay pays gas in a stablecoin ("fee-currency"), which on Celo costs ~50k extra intrinsic gas, but
  MiniPay sets the gas limit too low (54526 vs 71596 required). The user cannot edit the gas limit in
  the UI, and there is no clear option to switch the fee token to native CELO.
- **Friction:** MiniPay's transfer UI funnels users into an exchange-specific "Withdraw to Binance"
  flow (select USDC → CELO network → paste Binance deposit address), which is meaningless on a testnet.
- **Action taken:** Captured the error as evidence (a genuine "MiniPay test interface" friction
  screenshot). The acceptance criteria accept **Valora logs** as an alternative if a clean send is
  required.
- **Suggestion:** MiniPay's gas estimator should add the fee-currency intrinsic surcharge to the gas
  limit (or expose a "pay fee in CELO" toggle) on Celo Sepolia. Until then, treat Sepolia as the
  contract-validation environment and do the wallet-UX demo on mainnet with a sub-cent amount.

## 8. Verification requires care post-Etherscan-v2

- **Friction:** Celo verification moved to the **unified Etherscan v2 API** (`api.etherscan.io/v2/api`,
  single key). Docs still lag on Alfajores/Sepolia specifics.
- **Action taken:** Enabled **Sourcify** and configured **Blockscout** (both **no key**) as the primary
  path, with Celoscan (Etherscan v2 key) as the alternative.

## Summary

The contract concept is sound; the friction is entirely **environmental drift**: a deprecated testnet,
a stablecoin that isn't there, and sample code pinned to the wrong ethers major. All were resolved by
retargeting to Celo Sepolia, making the splitter token-agnostic, and modernizing the tooling — while
keeping the original native-CELO contract intact for reference.
