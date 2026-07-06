# VAL-002 — Midnight Proof-of-Threshold Circuit

A privacy-preserving proof-of-threshold primitive for Midnight, built on the Compact language and the official `midnight-js`/`testkit-js` TypeScript toolchain.

A participant proves their private trust score is above a public minimum **without revealing the score itself**. This repo contains:

- `contracts/threshold.compact` — the original single-threshold circuit
- `contracts/threshold-multi.compact` — an extension supporting two threshold tiers via one parameterized circuit
- A full TypeScript test harness that deploys both contracts, generates real ZK proofs, and verifies outcomes — runnable against local devnet and Midnight Preprod

## Status against the original task brief

| Acceptance criterion | Status |
|---|---|
| Original proof-of-threshold circuit works on devnet | ✅ Verified on local devnet, real proof generation and verification |
| Extended circuit correctly proves two different thresholds | ✅ Verified on local devnet, 7/7 tests covering all tier × outcome combinations |
| README comprehensive enough for a new contributor | This document |
| PR with code, test results, documentation | See PR |

Note on terminology: the brief's "devnet" maps to what Midnight's current docs call **local devnet** — a Docker Compose stack of node + indexer + proof server running entirely on your machine, with pre-funded wallets and no faucet required. This is distinct from **Preprod**, Midnight's public long-lived testnet. Both are supported by this repo; see below.

---

## Why the original stub didn't work

The task brief linked a provided Compact contract and TypeScript client. On inspection, that code used a package (`@midnight-ntwrk/sdk`) and API surface that don't correspond to any real, published Midnight tooling — it appears to have been a generated placeholder rather than working code. Per direction from the project owner, this was treated as a scaffold to validate, and everything in this repo was rebuilt from scratch against the real, current Midnight toolchain: the official `compact` CLI/compiler, `@midnight-ntwrk/midnight-js-*` packages, and `@midnight-ntwrk/testkit-js`.

---

## Architecture

### `threshold.compact` — single threshold

```compact
export ledger threshold: Uint<64>;   // public bar
export ledger lastResult: Boolean;   // public outcome

witness score(): Uint<64>;           // private, supplied off-chain

export circuit proveThreshold(): [] {
  const s = score();
  lastResult = disclose(s >= threshold);
}
```

**Design decision:** `proveThreshold()` never asserts/aborts. It always succeeds as a transaction and discloses `true` or `false` symmetrically. An assert-based design (abort on failure) would still leak "someone attempted and failed" via a reverted transaction — itself a privacy leak, since it reveals an attempt happened even without revealing the score. A disclosed boolean keeps success and failure transactions shape-identical on-chain; the only thing ever public is the final outcome.

### `threshold-multi.compact` — two tiers

Extends the above with a second public bar and a `Tier` enum, using **one parameterized circuit** rather than two separate ones — this generalizes to more tiers later without adding more circuits:

```compact
export enum Tier { LOW, HIGH }

export ledger thresholdLow: Uint<64>;
export ledger thresholdHigh: Uint<64>;
export ledger lastTier: Tier;

export circuit proveThreshold(tier: Tier): [] {
  const s = score();
  const publicTier = disclose(tier);   // see "Challenges" below
  if (publicTier == Tier.HIGH) {
    lastResult = disclose(s >= thresholdHigh);
  } else {
    lastResult = disclose(s >= thresholdLow);
  }
  lastTier = publicTier;
}
```

### TypeScript harness

- `contracts/index.ts` / `contracts/index-multi.ts` — compiled-contract loaders, wiring witnesses to the generated contract classes
- `contracts/witnesses.ts` — the `score` witness implementation, shared by both contracts
- `src/wallet.ts`, `src/providers.ts`, `src/providers-multi.ts`, `src/config.ts` — provider/wallet setup, adapted from Midnight's official `example-hello-world` template
- `src/test/threshold.test.ts`, `src/test/threshold-multi.test.ts` — deploy + prove + verify test suites

---

## Environment setup

### Prerequisites

- **Windows users: WSL2 Ubuntu is required.** The Compact compiler and Midnight's proof server are Linux binaries. They do not run under native Windows PowerShell/CMD, and Git Bash produces a broken PATH that half-works before failing later. Install the WSL extension in VS Code if you want an editor connected to the same environment your terminal uses.
- Node.js ≥ 22 (tested with v24.14.0)
- Docker (Docker Desktop with WSL2 integration enabled, if on Windows)
- Yarn

Keep the project inside WSL's own filesystem (e.g. `~/dev/midnight-threshold`), not under `/mnt/c/...` — the Windows-mounted path causes slow file access and Docker volume oddities.

### Install the Compact toolchain

```bash
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
compact update
compact --version   # confirms the CLI
compact compile --version   # confirms the compiler (this repo was built against 0.31.0)
```

### Install dependencies

```bash
yarn install
```

### Compile the contracts

```bash
compact compile contracts/threshold.compact contracts/managed/threshold
compact compile contracts/threshold-multi.compact contracts/managed/threshold-multi
```

This downloads ZK trusted-setup parameters on first run and produces proving/verifying keys plus generated TypeScript types under `contracts/managed/`.

---

## Running on local devnet

```bash
yarn env:up                 # starts proof server + node + indexer via Docker Compose
yarn test:local              # runs both test suites against local devnet
```

Local devnet wallets are pre-funded; no faucet step is needed. Expect this to complete in under two minutes.

---

## Running on Preprod (public testnet)

### 1. Get a wallet

Install the **Lace Midnight Preview** browser extension (not the Cardano-only "Lace" extension — they are different products with similar names). Create a wallet, switch its network selector from the default **Preview** to **Preprod**, and set the proof server to **Local** (`http://localhost:6300`) so your private witness data never leaves your machine during proof generation.

### 2. Fund it

In Lace, copy your **Unshielded** address, then request tokens from `https://faucet.preprod.midnight.network/`.

### 3. Provide the seed to this project

Create `.env.preprod` in the project root with **exactly one** of:

```
MIDNIGHT_PREPROD_MNEMONIC=word1 word2 ... word24
```
or
```
MIDNIGHT_PREPROD_SEED=<64-char hex, no 0x prefix>
```

This file is gitignored. Never commit it.

### 4. Run

```bash
yarn env:proof:up   # local proof server only — Preprod node/indexer are public
NODE_OPTIONS='--experimental-vm-modules --max-old-space-size=8192' \
  MIDNIGHT_NETWORK=preprod yarn vitest run src/test/threshold.test.ts --testTimeout=5400000
```

**Expect this to take a long time on a fresh wallet — up to 60–90 minutes.** See "Challenges encountered" below for why, and how to confirm it's progressing rather than stuck.

---

## Challenges encountered

This section is the most useful part of this README for the next contributor. Every item below was diagnosed from real compiler/runtime output or by reading the actual SDK source — not guessed.

### 1. `deployContract`'s constructor-args field is `args`, not `constructorArgs`

Using the wrong field name fails silently at the type level (TypeScript allows excess properties on object literals in some contexts) and only surfaces at runtime as:
```
CompactError: Contract state constructor: expected 2 arguments (as invoked from Typescript), received 1
```
Confirmed by reading `@midnight-ntwrk/midnight-js-contracts`'s `call-constructor.d.ts`: the real field is `args: Contract.InitializeParameters<C>`.

### 2. `privateStateProvider` needs `setContractAddress()` before any other call

```
Error: Contract address not set. Call setContractAddress() before accessing private state.
```
The level-based private state provider scopes all storage by a `contractAddress` field that starts `null`. Call `providers.privateStateProvider.setContractAddress(contractAddress)` once you know the deployed address, before calling `.set()` to update the witness's private state between calls on the same contract instance.

### 3. Circuit parameters are private by default — even ones that feel like "just a selector"

Extending to two tiers initially failed to compile:
```
potential witness-value disclosure must be declared but is not:
  witness value potentially disclosed: the value of parameter tier ...
```
Compact treats *all* circuit parameters as private unless explicitly disclosed — not just values declared via `witness`. Branching on an undisclosed parameter and writing the result of that branch to the ledger is flagged as a potential disclosure path. Fix: `const publicTier = disclose(tier);` before using it. This matters even when the parameter feels like metadata rather than secret data.

### 4. Vite/oxc can fail to parse a multi-line generic call that `tsc` accepts

```ts
CompiledContract.make<
  MultiContract<Witnesses.ThresholdPrivateState>
>(...)
```
threw `[PARSE_ERROR] Unexpected token` under Vitest's oxc-based transform, while structurally near-identical code in the single-contract version parsed fine. Avoid explicit multi-line `<...>` generic argument lists on this call; compute the typed reference as its own statement and pass it positionally so TypeScript infers the generic instead.

### 5. DUST registration must happen before a sync that waits on `dust` can ever resolve

On Preprod, `dust=false` can climb through 1000+ wallet-sync emissions and never resolve — because DUST only becomes available *after* an explicit on-chain registration transaction. If your sync call waits for `shielded && unshielded && dust` all at once, and your registration step runs *after* that wait, you've created a deadlock. Order matters: `wallet.start()` → registration (`waitForFunds`, which drips from the faucet and registers if needed) → *then* the full sync wait.

### 6. Long Preprod syncs can exhaust Node's default heap

```
FATAL ERROR: Ineffective mark-compacts near heap limit - JavaScript heap out of memory
```
surfaced after ~1200+ sync emissions on a fresh wallet. Fix: run with a larger heap —
```
NODE_OPTIONS='--experimental-vm-modules --max-old-space-size=8192'
```

### 7. `testkit-js`'s own `syncWallet` has a hardcoded 90-second timeout, separate from yours

`@midnight-ntwrk/testkit-js` exports its own `syncWallet(wallet, throttleTime=2_000, timeout=90_000)`, entirely independent of any `syncWallet` you write yourself. `waitForFunds()` calls *this* internal version (potentially several times) — and on Preprod's real chain depth, a single sync pass routinely takes minutes, well past 90 seconds. No parameter exists to override this from the outside. **Fix:** call your own (longer-timeout) sync function yourself, immediately after `wallet.start()` and before `waitForFunds()`, so the wallet's local state is already warm by the time `waitForFunds`'s internally-capped calls run.

This is a useful general lesson: a library can expose two same-named, same-purpose functions at different points in your dependency tree, with no way to reconcile their settings from your call site. Confirm — by literal log text, if needed — which implementation is actually executing before debugging "stuck" behavior.

### 8. A flat `shielded=false` can look identical whether sync is stuck or just slow

The most time-consuming investigation in this project: `shielded` stayed `false` for 15+ minutes on Preprod even with a confirmed-healthy indexer (verified by direct GraphQL query — only ~97 seconds behind real time). It turned out this is **expected behavior, not a bug**: a fresh wallet with no sync checkpoint scans shielded transaction history from the chain's genesis. A real QA fixture in `midnightntwrk/midnight-indexer`'s own test suite documents this exact scenario by name ("the brand-new-wallet case"). A healthy, deep chain is precisely what makes a from-scratch shielded scan slow.

**Lesson:** log the underlying numeric progress index (e.g. `appliedIndex`/`highestIndex`), not just the derived boolean, when debugging sync behavior on a long-lived public network. A boolean can't distinguish "stuck" from "99% through a long queue."

---

## Evidence

- Real compiler version used throughout: Compact `0.31.0`
- Local devnet: both contracts deployed and proved, full pass logs available in `docs/checkpoint-1-log.md`
- Cross-validated independently via a hosted compile service (`midnight-mcp`'s `midnight-compile-contract` tool) against the same compiler version, with matching results
- Preprod: deployment in progress / see PR for final run logs

## Known limitations

- `setThreshold`/`setThresholdLow`/`setThresholdHigh` are ungated — any address can call them. A production version should restrict this to an authority key.
- This repo's TypeScript has two pre-existing `tsc`-level type errors (unrelated to test execution, which uses esbuild and doesn't type-check) — see PR for details. Worth fixing for type hygiene but does not block running the tests.
