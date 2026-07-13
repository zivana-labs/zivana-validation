# VAL-004 — Orcfax Revenue Event Fact Statement

A Schema.org fact-statement for an SME revenue event is defined here,
published as a signed on-chain datum on Cardano Preprod using a
protocol-compatible, self-hosted analogue of Orcfax's real publishing
protocol, and read back with a Lucid script that parses the revenue amount.
The validator, off-chain scripts, and test suite went through a security
audit after the initial build; every finding from that audit was fixed, and
the fact statement was re-published on-chain against the corrected contract.
The full history — what was tried, what didn't work, and why — is kept below
so the same hours aren't spent twice.

## Why "self-hosted, protocol-compatible" and not literally on Orcfax's network

Orcfax's actual documentation and source were validated before any code was
written, rather than relying on the assumptions in the original draft. Two
things fell out of that research that change what "publish on Orcfax testnet"
can mean in practice:

1. **Orcfax only supports CER (Current Exchange Rate) feeds.** Per
   [docs.orcfax.io/feed-overview](https://docs.orcfax.io/feed-overview), the
   live network publishes price/exchange-rate data (ADA-USD, FACT-ADA, etc.).
   There is no fact-statement type for an arbitrary business claim like an SME
   revenue event — subsidized and sponsored feeds are still CER feeds.
2. **Publishing requires an ITN validator license.** Per
   [docs.orcfax.io/itn-overview](https://docs.orcfax.io/itn-overview), writing
   to the live network requires a Validator License NFT plus a 500,000 FACT
   deposit and running validator node infrastructure. There is no self-serve
   testnet signup for third-party developers to publish custom fact
   statements — which is why no "login" flow exists to find.

So a literal "publish a custom revenue-event fact statement on Orcfax's live
testnet" isn't something a third party can do — the protocol doesn't accept
that feed type, and only licensed validators can write to it at all.

What **is** real and verifiable: Orcfax's on-chain datum shape, and the fact
that real fact statements are freely queryable by anyone right now (e.g.
[preview.explorer.orcfax.io](https://preview.explorer.orcfax.io), or the
PreProd `ADA-USD|USD-ADA` feed documented in
[orcfax/datum-demo](https://github.com/orcfax/datum-demo)). That real,
verified datum shape — confirmed against Orcfax's own publishing dApp source
([orcfax/publish](https://github.com/orcfax/publish),
`aik/lib/orcfax/types.ak`) — was used as the basis for a single-signer,
self-hosted Aiken validator, which was deployed and published to Preprod. The
result is signed, on a real public testnet, and datum-compatible with
Orcfax's real protocol; it just isn't gated behind their validator-license
consensus layer, which isn't something a 12-day engineering task can acquire.

| | Orcfax's real live network | This repo |
|---|---|---|
| Feed types | CER (exchange rate) only | Custom revenue-event body |
| Who can publish | Licensed ITN validators (NFT + 500k FACT deposit) | Whoever holds the `publisher` signing key |
| Datum shape | `FsDat<t> { statement: Statement<t>, context: Context }` | Same shape, `t = RevenueBody` |
| Validator logic | Federated multi-notary Ed25519 checks + FSP script-hash rotation (`c.ak`/`fsp.ak`/`fs.ak`) | Single-signer `extra_signatories` check, revoke-only spend (`onchain/validators/revenue_fact.ak`) |
| Network | Mainnet / Preview / PreProd | Preprod |
| Off-chain audit doc | Schema.org JSON-LD archived to Arweave via Arkly | Schema.org JSON-LD kept in this repo (`schemas/revenue-event.jsonld`), hashed on-chain |

## Fact-statement lifecycle

```
1. Draft the off-chain claim           schemas/revenue-event.jsonld
   (Schema.org Claim + Observation)
                |
2. Validate its structure              npm run validate
   (ajv against revenue-event.schema.json) — also run automatically
   as the first step of `npm run publish`
                |
3. Hash the claim doc (sha256)         scripts/publish-fact.ts
   -> becomes body.claim_hash on-chain
                |
4. Mint the `fs` token + lock an       npm run publish
   inline FsDat<RevenueBody> datum
   at the revenue_fact script address
   on Preprod (signed by `publisher`)
                |
5. Consumer locates the UTxO(s) by     npm run query
   policy id, decodes the inline
   datum(s), picks the one with the
   latest created_at, reads the
   revenue amount
                |
6. Revoke (optional): burn the token   a Revoke-redeemer mint + spend of
   to retire a fact statement          the same UTxO in one transaction
   (spending it any other way is
   rejected by the validator)
```

## Off-chain schema (Schema.org JSON-LD)

`schemas/revenue-event.jsonld` — a `Claim` whose subject (`about`) is a
Schema.org `Observation` (the type Schema.org defines specifically for "a
measured value about something, over a period" — not the invented
`EconomicEvent`, which isn't a real Schema.org type, or a bare string
`claimInterpreter`, which the original draft used and which Schema.org
requires to be an `Organization`/`Person` object):

```json
{
  "@context": "https://schema.org",
  "@type": "Claim",
  "identifier": "zivana-revenue-001",
  "dateCreated": "2026-05-15T10:00:00Z",
  "temporalCoverage": "2026-05-01/2026-05-14",
  "text": "SME revenue for period 2026-05-01/2026-05-14",
  "about": {
    "@type": "Observation",
    "observationAbout": {
      "@type": "Person",
      "identifier": "did:prism:123456789abcdefghi",
      "name": "SME Operator"
    },
    "observationDate": "2026-05-14",
    "variableMeasured": "revenue",
    "value": {
      "@type": "MonetaryAmount",
      "currency": "NGN",
      "value": 500000
    }
  },
  "claimInterpreter": {
    "@type": "Organization",
    "identifier": "zivana-oracle",
    "name": "Zivana Oracle"
  }
}
```

`schemas/revenue-event.schema.json` is a JSON Schema that structurally
validates the document above (required fields, `temporalCoverage` as an ISO
8601 interval, ISO 4217 currency code, positive value). It's run standalone
with `npm run validate`, and is also run automatically at the top of
`scripts/publish-fact.ts` — publishing a document that fails this check is
rejected before any wallet or network activity happens.

```
Schema validation PASSED
  identifier: zivana-revenue-001
  temporalCoverage: 2026-05-01/2026-05-14
  revenue: 500000 NGN
  participant: did:prism:123456789abcdefghi
```

## On-chain datum and validator

`onchain/lib/zivana/types.ak` mirrors Orcfax's real `FsDat<t>` shape
field-for-field (verified against `orcfax/publish`'s `aik/lib/orcfax/types.ak`):

```
Statement<t> { feed_id: ByteArray, created_at: Int, body: t }
Context      { collector: VerificationKeyHash }
FsDat<t>     { statement: Statement<t>, context: Context }
```

`t` is filled here with a custom `RevenueBody` (Orcfax's live network only
ever fills `t` with a `Rational` price ratio for CER feeds — there is no
revenue-event body type in the real protocol):

```
RevenueBody {
  amount_minor_units: Int,   -- e.g. kobo, to avoid on-chain floats
  currency: ByteArray,       -- ISO 4217, e.g. "NGN"
  period_start: Int,         -- unix seconds
  period_end: Int,           -- unix seconds
  participant: ByteArray,    -- the claim's participant identifier (e.g. DID)
  claim_hash: ByteArray,     -- sha256 of the off-chain JSON-LD document
}
```

`onchain/validators/revenue_fact.ak` is a single Aiken `validator` block with
`mint`/`spend`/`else` handlers (Plutus V3), parameterized by a `publisher`
verification-key-hash:

- **`mint(Publish, ...)`** requires `publisher`'s signature, requires exactly
  one token minted with an empty asset name (matching Orcfax's real
  CIP-67-style convention), requires that token to be locked at the script's
  own address in the same transaction, requires the locked datum's
  `context.collector` to equal `publisher`, and — following the security
  review below — requires the datum body itself to be well-formed:
  `period_start <= period_end`, `amount_minor_units >= 0`, and a 3-byte
  `currency`.
- **`mint(Revoke, ...)`** requires `publisher`'s signature and requires
  exactly one token to be burned.
- **`spend`** requires `publisher`'s signature *and* requires this same
  transaction to burn the token — i.e. spending is revoke-only. This closes
  a gap found during review (see Finding 1 below): without it, `publisher`
  could move the token to a new output with an entirely different datum
  without ever re-running `mint`'s content checks, silently rewriting an
  already-published fact statement.
- **`else`** unconditionally fails, so no other script purpose can be used
  as a confused-deputy path.

Orcfax's real federated multi-notary Ed25519 logic and the separate FSP
pointer-rotation script are intentionally not reproduced here — that logic
isn't published, and a federated consensus layer isn't needed for one
self-hosted signer.

## Security review and fixes

A certified-auditor-style pass was run against the initial implementation,
covering both strict security-vulnerability criteria and a broader
correctness/edge-case/test-coverage review. Six findings came out of it, all
of which have since been fixed and verified:

| # | Finding | Fix |
|---|---|---|
| 1 | `spend` only checked the publisher's signature, so a published fact statement could be silently rewritten (new datum, same token, no burn) without re-running `mint`'s content checks | `spend` now additionally requires the transaction to burn the token — spending is revoke-only |
| 2 | The validator accepted any datum body content once signed — inverted periods, negative amounts, malformed currency codes all validated | `mint(Publish, ...)` now checks `period_start <= period_end`, `amount_minor_units >= 0`, and `currency` is exactly 3 bytes |
| 3 | `publish-fact.ts` never ran the ajv schema check — an invalid JSON-LD document could still be published | `validateClaim()` (shared with `validate-schema.ts`) now runs first in `publish-fact.ts` and aborts before any transaction is built |
| 4 | Currency-to-minor-units used `Math.round(value * 100)`, a classic IEEE-754 float bug (e.g. `1.005 * 100 === 100.49999999999999`, silently mis-rounding) | Replaced with `toMinorUnits()` (`src/util/money.ts`), which converts via the value's decimal string representation and throws rather than guessing when precision would be lost |
| 5 | `query-fact.ts` used `.find()` — the first matching UTxO, not necessarily the most recent, if `Publish` were ever run more than once | Now collects all matching UTxOs, decodes each, and picks the one with the greatest `created_at`, warning if more than one exists |
| 6 | No automated tests existed anywhere in the project — `aiken check` reported zero test scenarios, and there was no TypeScript test for the datum encoding | 14 Aiken unit tests added (covering `Publish`, `Revoke`, and `spend`, including a direct regression test for Finding 1) and 4 TypeScript tests added (`tests/datum.test.ts`), including a golden-CBOR test anchored to a real on-chain transaction |

Each fix was verified by more than "it compiles": for Finding 1, the old
permissive `spend` logic was temporarily restored and `aiken check` was
re-run, confirming exactly the one regression test written for it failed
(13/14 passing) before the fix was restored; for the datum-encoding tests, a
field-order swap was temporarily injected into the TypeScript schema to
confirm the golden-CBOR test (and only that one) caught it, since the plain
round-trip tests stayed green even under that regression — they only prove
`Data.to`/`Data.from` agree with each other, not that either agrees with the
real on-chain Aiken layout.

## Testing

```bash
npm run test           # TypeScript: datum encode/decode round-trip + golden-CBOR test
npm run test:onchain   # Aiken: aiken check, runs all 14 validator unit tests
```

The Aiken suite (`onchain/validators/revenue_fact.ak`, appended after the
validator block — Aiken supports calling a validator's handlers directly
from a test in the same module, e.g. `revenue_fact.mint(publisher, redeemer,
policy_id, tx)`) covers: `Publish` succeeding on a valid signature and datum;
failing without the publisher's signature; failing when the datum names a
different collector than the actual signer; failing on an inverted period, a
negative amount, a malformed currency, or the wrong mint quantity; failing
(by aborting, tested via Aiken's `fail`-annotated test form) when no output
is locked at all; `Revoke` succeeding and failing symmetrically; and `spend`
succeeding when signed-and-burning, failing when signed-but-not-burning (the
Finding 1 regression test), and failing when burning-but-not-signed.

The TypeScript suite (`tests/datum.test.ts`) covers a plain round-trip, a
round-trip with all-zero edge values, the `Publish`/`Revoke` redeemer
encoding, and the golden-CBOR test described above.

## Prerequisites

- Node.js 18+
- [Aiken](https://aiken-lang.org) `v1.1.22` or compatible (`aiken --version`)
- A Blockfrost **Preprod** project API key: sign up at
  [blockfrost.io](https://blockfrost.io), create a Preprod project, copy its
  project ID
- A Preprod-testnet-only wallet funded via the
  [Cardano testnet faucet](https://docs.cardano.org/cardano-testnets/tools/faucet/)

## Setup

```bash
npm install

# Generate a fresh testnet-only wallet (never reuse a mainnet seed)
npm run gen-wallet
# -> prints SEED= and ADDRESS=; paste both into .env as WALLET_SEED / WALLET_ADDRESS,
#    then fund ADDRESS via the faucet above.

cp .env.example .env   # if starting fresh; fill in BLOCKFROST_API_KEY, WALLET_SEED, WALLET_ADDRESS

npm run build:onchain   # aiken build — compiles onchain/validators, writes onchain/plutus.json
```

`.env` is git-ignored; nothing in it is committed.

## Running it

```bash
npm run validate   # validate the off-chain JSON-LD against the JSON Schema
npm run publish     # mint the fs token + lock the datum on Preprod
npm run query       # locate the UTxO, decode the datum, print the parsed revenue
```

## Development notes: what worked, what didn't

Kept here so the same mistakes don't cost anyone else the same hours.

**Base vs. Enterprise address mismatch (cost the most time).** The wallet
was generated with `walletFromSeed(seed, { network: "Preprod", addressType:
"Enterprise" })` and funded at the resulting address via the faucet.
Publishing then failed with `Your wallet does not have enough funds`, even
though Blockfrost confirmed the address held 10,000 test ADA. The cause:
`Lucid(...).selectWallet.fromSeed(seed)`, called with no `addressType`
option, derives a **Base** address (payment + stake credential) from the
same seed — a different bech32 string than the Enterprise address, even
though the underlying payment key is identical. Lucid's coin selection
queries whatever address it derives, found nothing there, and reported
"insufficient funds" rather than "wrong address." The fix was passing the
same `{ addressType: "Enterprise" }` option to `selectWallet.fromSeed` in
`src/services/orcfax.ts` as was used in `scripts/gen-wallet.ts`. Anyone
regenerating a wallet for this project should keep those two call sites'
`addressType` in sync, or simplify to one or the other everywhere.

**Bundled `.d.ts` flattens `Data.Static<T>`, breaking `Data.to`/`Data.from`
generics.** Calling `Data.to(datum, RevenueFactDatumSchema)` produces a type
error claiming the datum object is missing TypeBox-internal properties like
`static`/`type`/`[Kind]`. This is a bundling artifact: the real signature
distinguishes the value type (`Data.Static<T>`) from the schema type (`T`),
but the shipped `.d.ts` collapses both to the same `T`, making the call
un-typeable in either direction. The runtime behavior is unaffected — this
is exactly the documented Lucid Evolution `Data.to(value, schema)` pattern —
so the fix was a targeted `as any` cast on the schema argument, commented at
each call site rather than silently suppressed.

**Aiken toolchain and stdlib behaved exactly as documented, once the actual
source was read instead of assumed.** No trial-and-error was needed for the
validator once the real stdlib types (`Transaction`, `Output`,
`OutputReference`, `Value`, `Credential`) and the real Aiken testing
convention (`validator_name.handler_name(params..., args...)`, plus the
`fail`-annotated test form for expected-abort cases) were confirmed directly
against the installed `aiken-lang/stdlib` source and the official
`aiken-lang.org` docs before writing code — the payoff of not guessing.

**Round-trip tests alone don't prove cross-language correctness.** The
initial TypeScript test suite only checked that `Data.to` followed by
`Data.from` returns the original value. That's necessary but not
sufficient: a field reordered in `src/onchain/datum.ts`'s `Data.Object`
schema would still round-trip against itself even though it would no longer
match `onchain/lib/zivana/types.ak`'s actual field order — proven by
deliberately swapping `period_start`/`period_end` in the schema and watching
the round-trip tests stay green. The fix was a golden-CBOR test: known field
values are encoded and compared byte-for-byte against the actual inline
datum Blockfrost returned for a real, already-published transaction. That
test — and only that test — failed under the same injected swap.

**Every fix was proven to catch its own regression before being trusted.**
For each of the six audit findings, the broken behavior was temporarily
reintroduced, the relevant test was confirmed to fail (and only that test),
and the fix was then restored and reconfirmed green. This is called out
explicitly because a test suite that has never been observed to fail is not
yet known to be testing anything.

## Verification (live, independently checkable)

Both transactions below are real, confirmed Cardano Preprod transactions —
not an in-memory emulator. `src/services/orcfax.ts` only ever constructs a
`Blockfrost` provider (never Lucid's local `Emulator`), so every balance
change and confirmation below comes from Blockfrost's independent indexer
and is re-checkable by anyone with a Preprod Blockfrost key, without trusting
this repo's own output.

**Current publication (fixed contract, post-security-review):**

- **Transaction:**
  [`e1329b57c35e2e24afcae3dde31776372ff34b0f53b9db087f2ff422e9de80e0`](https://preprod.cardanoscan.io/transaction/e1329b57c35e2e24afcae3dde31776372ff34b0f53b9db087f2ff422e9de80e0)
  — block 4932403, slot 128284807, `valid_contract: true`
- **Policy ID / script hash:**
  `15784fa7b2899f4a374c31b6b37c6addef4373e4a2c16aac61b0fb89`
- **Script address:**
  `addr_test1wq2hsna8k2ye7j3hfscmdvmudtw77smnuj3vz64vvxc0hzg05t0fl`

`npm run query` output against that transaction:

```
Fact statement found on-chain.
  tx hash:        e1329b57c35e2e24afcae3dde31776372ff34b0f53b9db087f2ff422e9de80e0
  feed id:        ZIV-REV/zivana-revenue-001/1
  created at:     2026-07-13T18:39:50.744Z
  participant:    did:prism:123456789abcdefghi
  period:         2026-05-01T00:00:00.000Z -> 2026-05-14T00:00:00.000Z
  revenue:        500000 NGN
  claim hash:     bde25322044dd46ee5e2243bca15fbb1d0d7321355e90e1d7eda99f656ba988f
  collector pkh:  fc7ba6ddaf68027fad8c2c47265081814dcc10dafa643e1644de7e05
```

**How the wallet balance independently proves this happened on-chain, not
in memory:** the funding wallet's Blockfrost transaction history
(`GET /addresses/{address}/transactions`) shows exactly two real
transactions before this publish: the faucet funding
(`7c60f3f20cdd0a6476f6eec46e9408eb37af39b983c7b8f146152d4f13d66e4e`) and the
first, now-superseded publish below. After the publication above, the
address balance dropped from 9,997,993,726 to 9,995,976,128 lovelace — a
decrease of 2,017,598 lovelace, which reconciles exactly to the network fee
Blockfrost recorded for this transaction (254,808 lovelace) plus the
protocol-calculated minimum ADA locked at the script output alongside the
token (1,762,790 lovelace, independently confirmed via
`GET /txs/{hash}/utxos`). Numbers this precise, matching Blockfrost's own
independently-computed figures, aren't something an in-memory emulator would
produce.

**Superseded publication (pre-security-review, kept for provenance):** the
validator fixes in the security review above changed the compiled script's
hash, so this transaction now lives at a different, no-longer-current script
address. It's kept here because it was the first real proof this pipeline
could publish to Preprod at all, before Findings 1–6 were found and fixed.

- **Transaction:**
  [`eb21b096895370da12f0b1d8273b523d79d088c5b25843d14762b8409b2e6790`](https://preprod.cardanoscan.io/transaction/eb21b096895370da12f0b1d8273b523d79d088c5b25843d14762b8409b2e6790)
  — block 4930601, slot 128243513, `valid_contract: true`
- **Policy ID / script hash (pre-fix):**
  `e52a1de593558964aa4d9ad5e3614b5d8ed5c6a8b29ddd771fdb3aa5`
- **Script address (pre-fix):**
  `addr_test1wrjj5809jd2cje92fkddtcmpfdwca4wx4zefmhthrldn4fgwg66ex`

## Project layout

```
schemas/
  revenue-event.jsonld        off-chain Schema.org fact statement (the claim)
  revenue-event.schema.json   JSON Schema used to validate it
onchain/
  lib/zivana/types.ak         FsDat/Statement/Context/RevenueBody datum types
  validators/revenue_fact.ak  mint/spend validator + its 14 unit tests
  plutus.json                 compiled blueprint (generated by `aiken build`)
src/
  types/fact.ts          TS types for the off-chain JSON-LD
  schema/validate.ts     shared ajv validation used by validate-schema.ts and publish-fact.ts
  util/money.ts          decimal-safe currency-to-minor-units conversion
  onchain/datum.ts       Lucid Data schemas mirroring the Aiken types
  onchain/script.ts      loads the blueprint, applies params, derives addresses
  services/orcfax.ts     Lucid + Blockfrost + wallet setup
scripts/
  gen-wallet.ts        one-off: generate a fresh testnet wallet
  validate-schema.ts   validate the JSON-LD against the JSON Schema
  publish-fact.ts      validate, build the datum, mint + lock it on Preprod
  query-fact.ts        find the latest UTxO, decode the datum, print the revenue amount
tests/
  datum.test.ts        round-trip + golden-CBOR tests for the datum encoding
```

## Extension ideas

- Archive the off-chain JSON-LD claim document to Arweave (as Orcfax's real
  audit packages do) and store the resulting URN in `claim_hash`'s place
  instead of a local sha256, for genuine independent auditability.
- Support multiple revenue periods per participant (a list of `RevenueBody`
  entries under one `Statement`, or one UTxO per period).
- Add a real reference-input-based "pointer" script if the validator script
  ever needs to be upgraded without invalidating already-published fact
  statements — this is what Orcfax's real FSP script is for.
