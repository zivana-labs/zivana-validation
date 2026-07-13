//// Self-hosted fact-statement validator for a Zivana revenue event.
////
//// This intentionally does NOT reproduce Orcfax's real `fs.ak` /
//// `fsp.ak` / `c.ak` federated multi-notary logic (Ed25519 signature
//// checks per collector, script-hash rotation via a separate pointer
//// script) — that logic isn't published, and Orcfax's live network is
//// only writable by licensed ITN validators. Instead this is a
//// single-signer analogue: whoever holds `publisher` may mint the one
//// `fs` token (CIP-67-style empty asset name, matching Orcfax's real
//// convention) and lock a `RevenueFactDatum` with it, or burn/revoke it
//// later. The datum shape itself (`FsDat`/`Statement`/`Context`) is
//// verified against Orcfax's real on-chain types.

use aiken/collection/dict
use aiken/collection/list
use aiken/crypto.{VerificationKeyHash}
use aiken/interval
use aiken/primitive/bytearray
use cardano/address.{Address, Script, VerificationKey}
use cardano/assets.{PolicyId}
use cardano/transaction.{
  InlineDatum, Input, NoDatum, Output, OutputReference, Transaction, placeholder,
}
use zivana/types.{
  Context, FsDat, FsRedeemer, Publish, RevenueBody, RevenueFactDatum, Revoke,
  Statement,
}

fn is_upper_ascii(byte: Int) -> Bool {
  byte >= 65 && byte <= 90
}

/// ISO 4217 codes are exactly three uppercase ASCII letters.
fn is_iso4217_currency(currency: ByteArray) -> Bool {
  bytearray.length(currency) == 3 && is_upper_ascii(bytearray.at(currency, 0)) && is_upper_ascii(
    bytearray.at(currency, 1),
  ) && is_upper_ascii(bytearray.at(currency, 2))
}

/// Content sanity for a `RevenueBody`: cheap on-chain guards so a
/// nonsensical body cannot validate merely because it carries the
/// publisher's signature. The on-chain datum is constructible directly
/// (bypassing the off-chain JSON-LD/ajv layer entirely), so these checks
/// — not the off-chain schema — are what's actually authoritative.
fn is_valid_body(body: RevenueBody) -> Bool {
  and {
    body.period_start >= 0,
    body.period_start < body.period_end,
    body.amount_minor_units > 0,
    is_iso4217_currency(body.currency),
    bytearray.length(body.claim_hash) == 32,
  }
}

validator revenue_fact(publisher: VerificationKeyHash) {
  mint(redeemer: FsRedeemer, policy_id: PolicyId, self: Transaction) {
    let signed_by_publisher = list.has(self.extra_signatories, publisher)
    let minted = assets.tokens(self.mint, policy_id)

    when redeemer is {
      Publish -> {
        let mints_exactly_one_fs_token = dict.size(minted) == 1 && dict.get(
          minted,
          "",
        ) == Some(1)

        let script_outputs = list.filter(
          self.outputs,
          fn(output) { output.address.payment_credential == Script(policy_id) },
        )

        expect [locked_output] = script_outputs

        expect InlineDatum(raw_datum) = locked_output.datum
        expect fact_datum: RevenueFactDatum = raw_datum
        let statement = fact_datum.statement

        let datum_names_publisher = fact_datum.context.collector == publisher
        let output_holds_fs_token = assets.quantity_of(
          locked_output.value,
          policy_id,
          "",
        ) == 1

        let created_at_is_valid = statement.created_at_ms >= 0 && interval.contains(
          self.validity_range,
          statement.created_at_ms,
        )

        and {
          signed_by_publisher,
          mints_exactly_one_fs_token,
          datum_names_publisher,
          output_holds_fs_token,
          created_at_is_valid,
          is_valid_body(statement.body),
        }
      }
      Revoke -> {
        let burns_exactly_one_fs_token = dict.size(minted) == 1 && dict.get(
          minted,
          "",
        ) == Some(-1)
        and {
          signed_by_publisher,
          burns_exactly_one_fs_token,
        }
      }
    }
  }

  // Revoke-only: spending this UTxO is only ever allowed as part of a
  // transaction that (a) burns this script's fs token and (b) leaves no
  // fs token in any output. (b) matters when more than one fact UTxO
  // exists at this address at once (nothing prevents Publish running more
  // than once without an intervening Revoke): without it, a transaction
  // could spend two fact UTxOs, burn only one token, and pay the
  // surviving token to an ordinary wallet output — each spend only checks
  // that *a* burn happened somewhere in the transaction, not that *this
  // input's* token was the one destroyed. That token could then be paid
  // back to the script address later with an arbitrary hand-crafted
  // datum, since a plain output doesn't invoke mint's Publish content
  // checks at all. Requiring zero fs tokens across all outputs makes that
  // extraction transaction unbalanceable: mint(Revoke) caps the burn at
  // exactly -1, so spending two script inputs at once has nowhere for the
  // second token to go.
  spend(
    _datum: Option<RevenueFactDatum>,
    _redeemer: FsRedeemer,
    utxo: OutputReference,
    self: Transaction,
  ) {
    expect Some(spent_input) = list.find(
      self.inputs,
      fn(input: Input) { input.output_reference == utxo },
    )
    expect Script(this_script_hash) = spent_input.output.address.payment_credential

    let signed_by_publisher = list.has(self.extra_signatories, publisher)
    let burns_the_fs_token = assets.quantity_of(self.mint, this_script_hash, "") == -1

    let fs_tokens_in_outputs = list.foldl(
      self.outputs,
      0,
      fn(output, acc) {
        acc + assets.quantity_of(output.value, this_script_hash, "")
      },
    )

    and {
      signed_by_publisher,
      burns_the_fs_token,
      fs_tokens_in_outputs == 0,
    }
  }

  else(_ctx) {
    fail
  }
}

// ---------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------

const test_publisher: VerificationKeyHash =
  #"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

const test_attacker: VerificationKeyHash =
  #"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

const test_policy: PolicyId =
  #"cccccccccccccccccccccccccccccccccccccccccccccccccccccccc"

const test_claim_hash: ByteArray =
  #"deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"

fn test_txid() -> ByteArray {
  #"0000000000000000000000000000000000000000000000000000000000000000"
}

fn test_txid_b() -> ByteArray {
  #"1111111111111111111111111111111111111111111111111111111111111111"
}

fn valid_body() -> RevenueBody {
  RevenueBody {
    amount_minor_units: 50000000,
    currency: "NGN",
    period_start: 1_735_000_000,
    period_end: 1_736_000_000,
    participant: "did:prism:test-participant",
    claim_hash: test_claim_hash,
  }
}

fn valid_datum(
  collector: VerificationKeyHash,
  body: RevenueBody,
) -> RevenueFactDatum {
  FsDat {
    statement: Statement {
      feed_id: "ZIV-REV/test/1",
      created_at_ms: 1_735_000_000_000,
      body,
    },
    context: Context { collector },
  }
}

fn locked_output(datum: RevenueFactDatum, token_qty: Int) -> Output {
  Output {
    address: Address {
      payment_credential: Script(test_policy),
      stake_credential: None,
    },
    value: assets.from_asset(test_policy, "", token_qty),
    datum: InlineDatum(datum),
    reference_script: None,
  }
}

fn publish_tx(
  signer: VerificationKeyHash,
  minted_qty: Int,
  out: Output,
) -> Transaction {
  Transaction {
    ..placeholder,
    extra_signatories: [signer],
    mint: assets.from_asset(test_policy, "", minted_qty),
    outputs: [out],
  }
}

test publish_succeeds_with_valid_signature_and_datum() {
  let datum = valid_datum(test_publisher, valid_body())
  let out = locked_output(datum, 1)
  let tx = publish_tx(test_publisher, 1, out)
  revenue_fact.mint(test_publisher, Publish, test_policy, tx)
}

test publish_fails_without_publisher_signature() {
  let datum = valid_datum(test_publisher, valid_body())
  let out = locked_output(datum, 1)
  // Signed by someone else entirely, not the publisher.
  let tx = publish_tx(test_attacker, 1, out)
  !revenue_fact.mint(test_publisher, Publish, test_policy, tx)
}

test publish_fails_with_wrong_collector_in_datum() {
  // Signed by the real publisher, but the datum names a different
  // collector — must fail so a datum can't misattribute authorship.
  let datum = valid_datum(test_attacker, valid_body())
  let out = locked_output(datum, 1)
  let tx = publish_tx(test_publisher, 1, out)
  !revenue_fact.mint(test_publisher, Publish, test_policy, tx)
}

test publish_fails_with_inverted_period() {
  let body = RevenueBody {
    ..valid_body(),
    period_start: 5000,
    period_end: 1000,
  }
  let datum = valid_datum(test_publisher, body)
  let out = locked_output(datum, 1)
  let tx = publish_tx(test_publisher, 1, out)
  !revenue_fact.mint(test_publisher, Publish, test_policy, tx)
}

test publish_fails_with_zero_length_period() {
  let body = RevenueBody {
    ..valid_body(),
    period_start: 1000,
    period_end: 1000,
  }
  let datum = valid_datum(test_publisher, body)
  let out = locked_output(datum, 1)
  let tx = publish_tx(test_publisher, 1, out)
  !revenue_fact.mint(test_publisher, Publish, test_policy, tx)
}

test publish_fails_with_negative_period_start() {
  let body = RevenueBody { ..valid_body(), period_start: -1 }
  let datum = valid_datum(test_publisher, body)
  let out = locked_output(datum, 1)
  let tx = publish_tx(test_publisher, 1, out)
  !revenue_fact.mint(test_publisher, Publish, test_policy, tx)
}

test publish_fails_with_negative_amount() {
  let body = RevenueBody { ..valid_body(), amount_minor_units: -1 }
  let datum = valid_datum(test_publisher, body)
  let out = locked_output(datum, 1)
  let tx = publish_tx(test_publisher, 1, out)
  !revenue_fact.mint(test_publisher, Publish, test_policy, tx)
}

test publish_fails_with_zero_amount() {
  let body = RevenueBody { ..valid_body(), amount_minor_units: 0 }
  let datum = valid_datum(test_publisher, body)
  let out = locked_output(datum, 1)
  let tx = publish_tx(test_publisher, 1, out)
  !revenue_fact.mint(test_publisher, Publish, test_policy, tx)
}

test publish_fails_with_bad_currency_length() {
  let body = RevenueBody { ..valid_body(), currency: "USDX" }
  let datum = valid_datum(test_publisher, body)
  let out = locked_output(datum, 1)
  let tx = publish_tx(test_publisher, 1, out)
  !revenue_fact.mint(test_publisher, Publish, test_policy, tx)
}

test publish_fails_with_lowercase_currency() {
  // Right length, wrong charset — "ngn" is not a valid ISO 4217 code.
  let body = RevenueBody { ..valid_body(), currency: "ngn" }
  let datum = valid_datum(test_publisher, body)
  let out = locked_output(datum, 1)
  let tx = publish_tx(test_publisher, 1, out)
  !revenue_fact.mint(test_publisher, Publish, test_policy, tx)
}

test publish_fails_with_wrong_claim_hash_length() {
  let body = RevenueBody { ..valid_body(), claim_hash: "short" }
  let datum = valid_datum(test_publisher, body)
  let out = locked_output(datum, 1)
  let tx = publish_tx(test_publisher, 1, out)
  !revenue_fact.mint(test_publisher, Publish, test_policy, tx)
}

test publish_fails_with_negative_created_at() {
  let datum = FsDat {
    ..valid_datum(test_publisher, valid_body()),
    statement: Statement {
      ..valid_datum(test_publisher, valid_body()).statement,
      created_at_ms: -1,
    },
  }
  let out = locked_output(datum, 1)
  let tx = publish_tx(test_publisher, 1, out)
  !revenue_fact.mint(test_publisher, Publish, test_policy, tx)
}

test publish_fails_when_created_at_outside_validity_range() {
  let datum = valid_datum(test_publisher, valid_body())
  let out = locked_output(datum, 1)
  let tx = Transaction {
    ..publish_tx(test_publisher, 1, out),
    validity_range: interval.between(2_000_000_000_000, 2_100_000_000_000),
  }
  // created_at_ms (1_735_000_000_000) falls well before this window.
  !revenue_fact.mint(test_publisher, Publish, test_policy, tx)
}

test publish_succeeds_when_created_at_inside_validity_range() {
  let datum = valid_datum(test_publisher, valid_body())
  let out = locked_output(datum, 1)
  let tx = Transaction {
    ..publish_tx(test_publisher, 1, out),
    validity_range: interval.between(1_700_000_000_000, 1_800_000_000_000),
  }
  revenue_fact.mint(test_publisher, Publish, test_policy, tx)
}

test publish_fails_when_minting_wrong_quantity() {
  let datum = valid_datum(test_publisher, valid_body())
  let out = locked_output(datum, 1)
  // Mint 2 tokens instead of exactly 1.
  let tx = publish_tx(test_publisher, 2, out)
  !revenue_fact.mint(test_publisher, Publish, test_policy, tx)
}

test publish_fails_when_no_output_locked() fail {
  // No outputs at all: the `expect [locked_output] = ...` inside the
  // Publish branch has nothing to match, which aborts rather than
  // returning False — still a rejection, just via a different mechanism.
  let tx = Transaction {
    ..placeholder,
    extra_signatories: [test_publisher],
    mint: assets.from_asset(test_policy, "", 1),
    outputs: [],
  }
  revenue_fact.mint(test_publisher, Publish, test_policy, tx)
}

test publish_fails_when_two_outputs_locked_at_script_address() fail {
  // Two outputs at the script address in the same Publish transaction:
  // `expect [locked_output] = script_outputs` only matches a single-item
  // list, so this aborts rather than silently content-checking only the
  // first and leaving the second's stranded ADA unexamined.
  let datum = valid_datum(test_publisher, valid_body())
  let out1 = locked_output(datum, 1)
  let out2 = Output {
    ..locked_output(datum, 0),
    value: assets.from_lovelace(2_000_000),
  }
  let tx = Transaction {
    ..placeholder,
    extra_signatories: [test_publisher],
    mint: assets.from_asset(test_policy, "", 1),
    outputs: [out1, out2],
  }
  revenue_fact.mint(test_publisher, Publish, test_policy, tx)
}

test revoke_succeeds_with_valid_signature_and_burn() {
  let tx = Transaction {
    ..placeholder,
    extra_signatories: [test_publisher],
    mint: assets.from_asset(test_policy, "", -1),
  }
  revenue_fact.mint(test_publisher, Revoke, test_policy, tx)
}

test revoke_fails_without_signature() {
  let tx = Transaction {
    ..placeholder,
    extra_signatories: [test_attacker],
    mint: assets.from_asset(test_policy, "", -1),
  }
  !revenue_fact.mint(test_publisher, Revoke, test_policy, tx)
}

test revoke_fails_when_burning_wrong_quantity() {
  let tx = Transaction {
    ..placeholder,
    extra_signatories: [test_publisher],
    mint: assets.from_asset(test_policy, "", -2),
  }
  !revenue_fact.mint(test_publisher, Revoke, test_policy, tx)
}

fn test_utxo_ref() -> OutputReference {
  OutputReference { transaction_id: test_txid(), output_index: 0 }
}

fn test_utxo_ref_b() -> OutputReference {
  OutputReference { transaction_id: test_txid_b(), output_index: 0 }
}

fn script_held_input(utxo_ref: OutputReference) -> Input {
  Input {
    output_reference: utxo_ref,
    output: Output {
      address: Address {
        payment_credential: Script(test_policy),
        stake_credential: None,
      },
      value: assets.from_asset(test_policy, "", 1),
      datum: NoDatum,
      reference_script: None,
    },
  }
}

fn spend_input() -> Input {
  script_held_input(test_utxo_ref())
}

fn spend_tx(signer: VerificationKeyHash, mint_delta: Int) -> Transaction {
  Transaction {
    ..placeholder,
    inputs: [spend_input()],
    extra_signatories: [signer],
    mint: assets.from_asset(test_policy, "", mint_delta),
  }
}

test spend_succeeds_when_signed_and_burning() {
  let tx = spend_tx(test_publisher, -1)
  revenue_fact.spend(test_publisher, None, Revoke, test_utxo_ref(), tx)
}

test spend_fails_without_burn_even_when_signed() {
  // The regression test for the immutability fix: signed by the real
  // publisher, but nothing is burned (a "silent rewrite" attempt) — must
  // fail, whereas before the fix this alone was sufficient to authorize
  // spending the UTxO.
  let tx = spend_tx(test_publisher, 0)
  !revenue_fact.spend(test_publisher, None, Revoke, test_utxo_ref(), tx)
}

test spend_fails_without_signature_even_when_burning() {
  let tx = spend_tx(test_attacker, -1)
  !revenue_fact.spend(test_publisher, None, Revoke, test_utxo_ref(), tx)
}

test spend_fails_when_extracting_second_token_to_a_wallet() {
  // The regression test for the multi-UTxO extraction bypass: two fact
  // UTxOs (A, B) are spent together, only one token is burned, and the
  // surviving token is paid out to an ordinary wallet output instead of
  // being burned or re-locked at the script address. Before the
  // `fs_tokens_in_outputs == 0` fix, spend(A) and spend(B) each only
  // checked "was *a* -1 burn present in this transaction" — both would
  // have passed independently even though only one of the two tokens
  // actually left circulation.
  let wallet_credential = Address {
    payment_credential: VerificationKey(test_publisher),
    stake_credential: None,
  }
  let extraction_output = Output {
    address: wallet_credential,
    value: assets.from_asset(test_policy, "", 1),
    datum: NoDatum,
    reference_script: None,
  }
  let tx = Transaction {
    ..placeholder,
    inputs: [
      script_held_input(test_utxo_ref()),
      script_held_input(test_utxo_ref_b()),
    ],
    extra_signatories: [test_publisher],
    mint: assets.from_asset(test_policy, "", -1),
    outputs: [extraction_output],
  }

  and {
    !revenue_fact.spend(test_publisher, None, Revoke, test_utxo_ref(), tx),
    !revenue_fact.spend(test_publisher, None, Revoke, test_utxo_ref_b(), tx),
  }
}

test revoke_of_two_utxos_in_one_tx_is_rejected_entirely() {
  // Batch-revoking two fact UTxOs in a single transaction (mint -2, both
  // burned, nothing extracted) is rejected at every layer by design, not
  // just the extraction path above: `burns_the_fs_token` in spend checks
  // for exactly -1, so a -2 burn satisfies neither spend call, and
  // `mint(Revoke)` independently requires exactly one token burned too.
  // Revocation is intentionally one fact UTxO per transaction.
  let tx = Transaction {
    ..placeholder,
    inputs: [
      script_held_input(test_utxo_ref()),
      script_held_input(test_utxo_ref_b()),
    ],
    extra_signatories: [test_publisher],
    mint: assets.from_asset(test_policy, "", -2),
    outputs: [],
  }

  and {
    !revenue_fact.spend(test_publisher, None, Revoke, test_utxo_ref(), tx),
    !revenue_fact.spend(test_publisher, None, Revoke, test_utxo_ref_b(), tx),
    !revenue_fact.mint(test_publisher, Revoke, test_policy, tx),
  }
}
