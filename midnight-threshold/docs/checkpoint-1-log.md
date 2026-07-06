# Checkpoint 1: Original single-threshold circuit on local devnet

Date: 2026-06-22
Environment: Windows + WSL2 Ubuntu, Docker Desktop with WSL integration
Compact CLI: 0.5.1 (compact tool), compiler 0.31.0
Node: v24.14.0

## Result: PASS (3/3 tests)

Contract deployed at: 648419064ffa23fdbaebc9ec5c7f2f4275a415eb188a7d8ed248976f7017bfde

- Deploy with threshold=500: PASS
- Prove score=800 (above threshold): PASS, lastResult=true
- Prove score=300 (below threshold): PASS, lastResult=false

## Bugs found and fixed via real compiler/runtime feedback (not guessed)

### Bug 1: deployContract constructor args field name
Symptom: `CompactError: Contract state constructor: expected 2 arguments
(as invoked from Typescript), received 1`

Root cause: used `constructorArgs: [...]` in deployContract options, but
the real field (confirmed by reading
node_modules/@midnight-ntwrk/midnight-js-contracts/dist/call-constructor.d.ts)
is `args: Contract.InitializeParameters<C>`. The wrong field name was
silently ignored by the type system (excess property), so the
constructor argument never reached initialState.

Fix: renamed `constructorArgs` to `args` in the deployContract call.

### Bug 2: privateStateProvider.set() requires setContractAddress() first
Symptom: `Error: Contract address not set. Call setContractAddress()
before accessing private state.`

Root cause: confirmed by reading
node_modules/@midnight-ntwrk/midnight-js-level-private-state-provider/src/level-private-state-provider.ts
- the provider keys all scoped storage internally by a contractAddress
field that starts null and must be set explicitly via
setContractAddress(address) before get/set/remove/clear are usable.

Fix: call `providers.privateStateProvider.setContractAddress(contractAddress)`
once the deployed address is known, before any .set() call that updates
the witness's private state between proveThreshold() calls on the same
contract instance.

## Design decision (confirmed with project owner)
proveThreshold() never asserts/aborts. It always succeeds as a
transaction and discloses true or false symmetrically, so that a
failed threshold check is indistinguishable in shape from a passed one
at the transaction level - only the boolean outcome is ever public.

---

# Checkpoint 2: Multi-tier extension on local devnet

Date: 2026-06-22
Same environment as Checkpoint 1.

## Design
Single parameterized circuit `proveThreshold(tier: Tier)` where
`Tier` is `LOW | HIGH`, replacing two ledger fields (`thresholdLow`,
`thresholdHigh`) checked against the same private `score` witness.
Chosen over two separate circuits because it generalizes to more tiers
without adding more circuits, and stays closer to a real production
shape.

## Result: PASS (7/7 tests)

Contract deployed at: fee5ba234601b9614bb727c76869286d444bae32c95040829c2299239a32b435
thresholdLow=500, thresholdHigh=800

| score | tier | lastResult |
|-------|------|------------|
| 900   | LOW  | true       |
| 900   | HIGH | true       |
| 650   | LOW  | true       |
| 650   | HIGH | false      |
| 200   | LOW  | false      |
| 200   | HIGH | false      |

All six tier x outcome combinations behave correctly.

## New compiler error encountered and fixed: undeclared disclosure on a circuit parameter

Symptom (compactc 0.31.0):
```
potential witness-value disclosure must be declared but is not:
  witness value potentially disclosed:
    the value of parameter tier of exported circuit proveThreshold
  nature of the disclosure:
    performing this ledger operation might disclose the boolean value
    of the result of a comparison involving the witness value
```

Root cause: Compact treats ALL circuit parameters as private by
default, not just values explicitly declared via `witness`. Branching
on `tier` (an `if (tier == Tier.HIGH)`) and then writing the *result*
of a comparison made inside that branch to the ledger counts as a
potential disclosure path the compiler cannot statically prove is
safe, because nothing told it tier was meant to be public.

Fix: explicitly `disclose()` the parameter before using it:
```compact
const publicTier = disclose(tier);
if (publicTier == Tier.HIGH) { ... }
```
This is the same disclose-by-default-deny rule documented for ledger
writes (e.g. the hello-world tutorial's `newMessage` parameter), just
applied to a value used only for control flow rather than stored
directly. Lesson for the README: *any* circuit parameter that
influences what gets written to the ledger needs its own explicit
disclose, even when it feels like "just a selector" rather than "real"
private data.

## TypeScript-side issue: multi-line generic call parse failure

Symptom: Vite's oxc-based transform failed to parse
```ts
CompiledContract.make<
  MultiContract<Witnesses.ThresholdPrivateState>
>(
  'MultiThresholdContract',
  MultiContract<Witnesses.ThresholdPrivateState>,
)
```
with `[PARSE_ERROR] Unexpected token` at the closing `>(` line, even
though the equivalent single-contract version in contracts/index.ts
parses fine under vitest. Root cause not fully diagnosed - likely an
oxc-specific ambiguity in resolving a multi-line generic type-argument
list against the `<`/`>` comparison-operator grammar, that ts-node /
tsc tolerate but Vite's fast transformer does not in this exact
shape.

Fix: avoid the explicit `<...>` generic argument list on
`CompiledContract.make` entirely. Compute the typed contract reference
as its own statement first, then pass it as a plain positional
argument so TypeScript infers the generic from the argument's type
instead of from an explicit bracket list:
```ts
const multiContractType = MultiContract<MultiPS>;
export const CompiledMultiThresholdContract = CompiledContract.make(
  'MultiThresholdContract',
  multiContractType,
).pipe(...)
```

---

# Checkpoint 3 (in progress): Preprod deployment

Date: 2026-06-22
Network: Midnight Preprod (public testnet)
Wallet: Lace Midnight Preview extension, network switched from default
Preview to Preprod, funded via official faucet (5000 tNIGHT received).

## Bugs found and fixed via real runtime feedback

### Bug 3: deployContract args field name (carried over from local devnet
checkpoint, same fix applied: constructorArgs -> args).

### Bug 4: syncWallet() call ordering vs DUST registration
Symptom: dust=false climbs past 1000+ wallet sync emissions on Preprod,
never resolves, eventually exhausts heap (see Bug 5) or times out.

Root cause: our own syncWallet() (from wallet.ts, copied from the
official hello-world template) waits for shielded+unshielded+dust to
all reach isStrictlyComplete() before resolving. But on Preprod,
dust can only ever become strictly complete AFTER the wallet has been
explicitly registered for DUST generation via an on-chain transaction
- a real, documented Midnight Network behavior (DUST is generated by
NIGHT over time, but only once registered). Our original test file
called syncWallet() BEFORE the isRemote block that calls
waitForFunds() (which performs the registration), creating a
deadlock: sync waits for dust, dust waits for registration,
registration waits for sync to finish first.

Fix: reordered beforeAll so wallet.start() is followed immediately by
the isRemote/waitForFunds block, with our own syncWallet() call moved
to AFTER that block closes. Applied identically to both
threshold.test.ts and threshold-multi.test.ts.

### Bug 5: heap exhaustion during long Preprod wallet sync
Symptom: FATAL ERROR: Ineffective mark-compacts near heap limit -
JavaScript heap out of memory, after ~1200+ wallet sync emissions.

Fix: NODE_OPTIONS='--experimental-vm-modules --max-old-space-size=8192'
(8GB heap, up from Node's default ~3.4GB observed ceiling).

### Bug 6: testkit-js's internal syncWallet has a hardcoded 90s timeout
Symptom: Error: Wallet sync timeout after 90000ms, thrown from inside
waitForFunds(), even after Bug 4's reordering fix and even after
passing --testTimeout=3600000 to vitest (a DIFFERENT, unrelated
timeout).

Root cause: confirmed by reading
node_modules/@midnight-ntwrk/testkit-js/dist/index.mjs directly.
testkit-js exports its OWN syncWallet(wallet, throttleTime=2_000,
timeout=90_000) function, completely separate from the one we wrote
in wallet.ts. waitForFunds() calls THIS internal syncWallet
(potentially up to 3 times: initial check, after faucet drip, after
DUST registration), each call subject to the hardcoded 90-second
ceiling, with no parameter exposed to override it from the caller.
On Preprod's real chain depth, a single sync pass routinely takes
several minutes, so waitForFunds() was timing out internally before
ever returning, regardless of any timeout we configured on our own
syncWallet() call or on vitest itself.

Fix: import testkit-js's syncWallet separately (aliased as
testkitSyncWallet to avoid confusion with our own), and call it
ourselves with a generous timeout (syncTimeoutMs, up to 1 hour)
immediately after wallet.start() and BEFORE calling waitForFunds().
This warms the wallet's local state cache; by the time waitForFunds's
internal 90-second-capped calls run, the wallet is already close to
synced, so those calls resolve quickly instead of needing the full
slow sync from scratch.

## Lesson for README
A library can expose two same-named (or same-purpose) functions at
different levels of the same dependency tree - one we wrote by copying
the official template, one shipped inside testkit-js itself - with
different defaults and no parameter to reconcile them from the outer
call site. Always check whether a helper function you're calling
(like waitForFunds) has its own internal timeouts before assuming an
external timeout (vitest's --testTimeout, or your own wrapper's
timeout parameter) covers everything underneath it.

## Possible infrastructure factor (unconfirmed)
Midnight's own community forum documents a real, dated (May 2026)
incident where the public Preprod indexer lagged ~23 hours behind the
actual chain tip, causing wallet sync to silently report success
against a stale tip and downstream transactions to fail. We observed
shielded=false persisting for several minutes with growing gaps
between sync emissions during one Preprod run; this is CONSISTENT
WITH but not confirmed to be the same class of issue. Documenting this
as a known external dependency risk for Preprod work: if a sync hangs
for an extended period with no client-side error, the public
indexer's health is worth checking before assuming a code bug.

---

# Tooling note: midnight-mcp cross-validation

Set up midnight-mcp (Olanetsoft, v0.2.21) as a user-scoped MCP server in
Claude Code, to get faster Compact/TypeScript doc search and a second,
independent compile check.

Cross-validated both threshold.compact and threshold-multi.compact via
midnight-compile-contract (a real hosted compiler call, not static
analysis): both compile cleanly against Compact compiler v0.31.0 - the
exact same version installed locally via WSL's `compact` CLI. Two
independent compilation paths agree, which is stronger evidence than
either alone.

Also found a real limitation in the MCP tool itself: its static-analysis
tools (midnight-analyze-contract, midnight-extract-contract-structure)
falsely reported witnessCount: 0 for both contracts despite a clearly
declared and used `witness score()`. Verified false positive against
the real compile result. Lesson: prefer midnight-compile-contract (real
compilation) over the static-analysis tools for anything load-bearing;
treat static-analysis output as a hint to investigate, not a verdict.

---

# Resolution: shielded=false "stuck" was scan depth, not a bug

Investigated via midnight-mcp's TypeScript SDK search + Claude Code
reading testkit-js source directly. Real finding, with citations:

- isStrictlyComplete() for shielded tracks Merkle-tree scan progress
  (highestCheckedZswapEndIndex vs highestZswapEndIndex), unrelated to
  indexer connectivity/health.
- MidnightWalletProvider.build() in our wallet.ts is mechanically
  identical to testkit-js's own WalletFactory.startWalletFacade path -
  same ZswapSecretKeys.fromSeed() call, same WalletSeeds derivation,
  whether built via mnemonic or raw seed. No missing parameter.
- A real QA fixture in midnightntwrk/midnight-indexer documents this
  exact scenario by name ("the brand-new-wallet case") - a fresh
  wallet with no startIndex checkpoint scans shielded history from
  index 0, i.e. the entire chain's Merkle tree. startIndex exists only
  at the raw indexer websocket protocol level, not exposed by
  testkit-js/wallet-sdk-facade's higher-level builders we use.

Conclusion: a healthy, deep Preprod chain is precisely what makes a
from-scratch shielded scan slow - this is expected behavior, not a
bug. Revised expectation: allow up to 60-90 minutes for first-time
shielded sync on Preprod (matching testkit-js's own QA timeout
conventions), and verify forward progress via
highestCheckedZswapEndIndex climbing between polls rather than
inferring stuck-ness from the isStrictlyComplete() boolean alone.

Lesson for README: a flat boolean (shielded=false) can look identical
whether sync is genuinely stuck or just slow-and-progressing. Log the
underlying numeric progress index, not just the derived boolean, when
debugging sync behavior on a long-lived public network.

---

# Final confirmation: shielded scan progress is real and climbing

With delta logging correctly wired into the actual pre-sync call path
(see prior entry - testkitSyncWallet swapped for our own syncWallet),
real numeric evidence obtained:

shielded appliedIndex climbed from ~31023 to ~53766+ over a ~30 second
window, with per-poll deltas ranging from 0 to over 5000 in single
batches. dust appliedIndex climbed steadily by exactly 10 on
alternating polls. This is unambiguous, mechanical forward progress -
not a stalled or stuck sync.

This closes out the investigation: the apparent "stuck shielded=false"
behavior across multiple earlier runs was an observation artifact, not
a real problem. We were either watching testkit-js's own internal
pre-sync (different log format, no granular index visibility) or our
own syncWallet AFTER it had already finished syncing (so the
incomplete-only delta logs never had anything to report). Once
delta logging was correctly attached to the actual long-running sync
phase, the scan's real progress was immediately visible and
unambiguous.

Lesson for README: when a third-party SDK's sync/progress function is
shadowed by an identically-named function from a different package in
the same import surface (testkit-js's syncWallet vs. our own
wallet.ts's syncWallet), confirm via the literal log message text (or
similar fingerprint) which implementation is actually executing before
debugging "stuck" behavior - don't assume your own instrumentation is
in the path just because the code compiles and the function names
match.

---

# Checkpoint 4: Migration to zivana-labs/zivana-validation monorepo

Date: 2026-06-23

## Migration
The project moved from a standalone directory into `midnight-threshold/`
inside the `zivana-labs/zivana-validation` monorepo. This replaced the
repo's original fictional stub content (`client/`, `contract/` - a Celo
MiniPay payment-splitter simulation unrelated to this project) with the
real threshold-proof contracts, providers, wallet code, and tests
documented in Checkpoints 1-3.

## Bug 7: wallet race condition between threshold.test.ts and
threshold-multi.test.ts

Symptom: intermittent `(FiberFailure) SubmissionError: Transaction
submission error` on the deploy step of one of the two spec files,
followed by cascading `TypeError: Input string must have non-zero
length` (from `assertIsContractAddress`) on every subsequent
`proveThreshold` call in that same file, since `contractAddress` was
never set after the failed deploy. Crucially, which file failed was
not consistent run to run.

Root cause: both `threshold.test.ts` and `threshold-multi.test.ts`
hardcode the identical `ALICE_LOCAL_SEED` for the `local` network,
so both spec files derive the exact same wallet, address, and UTXO
set. `vitest.config.ts`'s existing `sequence: { concurrent: false }`
only disables concurrency *within* a single file - Vitest still runs
separate test *files* in parallel worker processes by default. Both
workers' wallets raced to submit deploy transactions against the same
shielded/unshielded balance at the same time; whichever transaction
landed second referenced UTXOs the first had already spent, and the
node rejected it.

Confirmed two ways:
1. Cause-chain walk: added a temporary diagnostic that walked
   `err.cause` recursively on deploy failure. The chain terminated
   after a single level (`[cause chain 0] message=Transaction
   submission error`, no inner cause) - proving the SDK's
   `SubmissionError` is a dead end and the real cause had to be
   inferred from behavior, not the error object.
2. Reproduction: ran the full suite twice. Run 1 failed
   `threshold.test.ts`'s deploy (7/7 passing in
   `threshold-multi.test.ts`). Run 2 flipped - `threshold-multi.test.ts`
   failed all 7 tests while `threshold.test.ts` passed all 3. The
   failing file is whichever one loses the race, not a fixed file,
   which rules out a per-contract logic bug and points squarely at
   shared mutable wallet state under concurrency.

Fix: added `fileParallelism: false` to `vitest.config.ts`, forcing
Vitest to run test files sequentially instead of in parallel worker
processes. Verified: 10/10 tests passing (`threshold-multi.test.ts`
7/7, `threshold.test.ts` 3/3) across the full `npm run test:local`
suite.

## Closing note: this doesn't scale
Per-file hardcoded seeds plus forced sequential execution works for
two spec files but won't scale cleanly as more contract suites are
added - every new file either needs its own unique hardcoded seed
(easy to forget, silently reintroducing the same race) or pays the
full wall-clock cost of sequential execution stacking up across many
files. The better long-term pattern is a single master seed with
HD-derived sub-accounts per test file, which the SDK already supports
via `WalletSeeds.fromMasterSeed().selectAccount(n)` - each file gets
an independent wallet/UTXO set without hardcoding N separate seed
strings, and `fileParallelism: false` could be dropped once that's in
place. Deliberately deferred for now: the suite is only two files and
sequential execution's wall-clock cost doesn't yet justify the
refactor.
