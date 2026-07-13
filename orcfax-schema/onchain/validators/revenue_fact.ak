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
use aiken/primitive/bytearray
use cardano/address.{Address, Script}
use cardano/assets.{PolicyId}
use cardano/transaction.{
  Input, InlineDatum, NoDatum, Output, OutputReference, Transaction, placeholder,
}
use zivana/types.{
  Context, FsDat, FsRedeemer, Publish, Revoke, RevenueBody, RevenueFactDatum,
  Statement,
}

validator revenue_fact(publisher: VerificationKeyHash) {
  mint(redeemer: FsRedeemer, policy_id: PolicyId, self: Transaction) {
    let signed_by_publisher = list.has(self.extra_signatories, publisher)
    let minted = assets.tokens(self.mint, policy_id)

    when redeemer is {
      Publish -> {
        let mints_exactly_one_fs_token =
          dict.size(minted) == 1 && dict.get(minted, "") == Some(1)

        expect Some(locked_output) =
          list.find(
            self.outputs,
            fn(output) { output.address.payment_credential == Script(policy_id) },
          )

        expect InlineDatum(raw_datum) = locked_output.datum
        expect fact_datum: RevenueFactDatum = raw_datum
        let body = fact_datum.statement.body

        let datum_names_publisher = fact_datum.context.collector == publisher
        let output_holds_fs_token =
          assets.quantity_of(locked_output.value, policy_id, "") == 1

        // Content sanity: cheap on-chain guards so a nonsensical body
        // (inverted period, negative amount, malformed currency) cannot
        // validate merely because it carries the publisher's signature.
        let period_is_ordered = body.period_start <= body.period_end
        let amount_is_non_negative = body.amount_minor_units >= 0
        let currency_is_iso4217_length = bytearray.length(body.currency) == 3

        and {
          signed_by_publisher,
          mints_exactly_one_fs_token,
          datum_names_publisher,
          output_holds_fs_token,
          period_is_ordered,
          amount_is_non_negative,
          currency_is_iso4217_length,
        }
      }
      Revoke -> {
        let burns_exactly_one_fs_token =
          dict.size(minted) == 1 && dict.get(minted, "") == Some(-1)
        and {
          signed_by_publisher,
          burns_exactly_one_fs_token,
        }
      }
    }
  }

  // Revoke-only: spending this UTxO is only ever allowed as part of a
  // transaction that burns this script's fs token (a genuine Revoke).
  // This forecloses "silent rewrite" transactions that would otherwise
  // move the token to a fresh output with arbitrary new datum content
  // without ever going through mint's Publish content checks.
  spend(
    _datum: Option<RevenueFactDatum>,
    _redeemer: FsRedeemer,
    utxo: OutputReference,
    self: Transaction,
  ) {
    expect Some(spent_input) =
      list.find(self.inputs, fn(input: Input) { input.output_reference == utxo })
    expect Script(this_script_hash) = spent_input.output.address.payment_credential

    let signed_by_publisher = list.has(self.extra_signatories, publisher)
    let burns_the_fs_token =
      assets.quantity_of(self.mint, this_script_hash, "") == -1

    and {
      signed_by_publisher,
      burns_the_fs_token,
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

fn test_txid() -> ByteArray {
  #"0000000000000000000000000000000000000000000000000000000000000000"
}

fn valid_body() -> RevenueBody {
  RevenueBody {
    amount_minor_units: 50000000,
    currency: "NGN",
    period_start: 1_735_000_000,
    period_end: 1_736_000_000,
    participant: "did:prism:test-participant",
    claim_hash: "deadbeefclaimhash",
  }
}

fn valid_datum(collector: VerificationKeyHash, body: RevenueBody) -> RevenueFactDatum {
  FsDat {
    statement: Statement {
      feed_id: "ZIV-REV/test/1",
      created_at: 1_735_000_000_000,
      body: body,
    },
    context: Context { collector: collector },
  }
}

fn locked_output(datum: RevenueFactDatum, token_qty: Int) -> Output {
  Output {
    address: Address { payment_credential: Script(test_policy), stake_credential: None },
    value: assets.from_asset(test_policy, "", token_qty),
    datum: InlineDatum(datum),
    reference_script: None,
  }
}

fn publish_tx(signer: VerificationKeyHash, minted_qty: Int, out: Output) -> Transaction {
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
  let body = RevenueBody { ..valid_body(), period_start: 5000, period_end: 1000 }
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

test publish_fails_with_bad_currency_length() {
  let body = RevenueBody { ..valid_body(), currency: "USDX" }
  let datum = valid_datum(test_publisher, body)
  let out = locked_output(datum, 1)
  let tx = publish_tx(test_publisher, 1, out)
  !revenue_fact.mint(test_publisher, Publish, test_policy, tx)
}

test publish_fails_when_minting_wrong_quantity() {
  let datum = valid_datum(test_publisher, valid_body())
  let out = locked_output(datum, 1)
  // Mint 2 tokens instead of exactly 1.
  let tx = publish_tx(test_publisher, 2, out)
  !revenue_fact.mint(test_publisher, Publish, test_policy, tx)
}

test publish_fails_when_no_output_locked() fail {
  // No outputs at all: the `expect Some(locked_output) = ...` inside the
  // Publish branch has nothing to match, which aborts rather than
  // returning False — still a rejection, just via a different mechanism.
  let tx =
    Transaction {
      ..placeholder,
      extra_signatories: [test_publisher],
      mint: assets.from_asset(test_policy, "", 1),
      outputs: [],
    }
  revenue_fact.mint(test_publisher, Publish, test_policy, tx)
}

test revoke_succeeds_with_valid_signature_and_burn() {
  let tx =
    Transaction {
      ..placeholder,
      extra_signatories: [test_publisher],
      mint: assets.from_asset(test_policy, "", -1),
    }
  revenue_fact.mint(test_publisher, Revoke, test_policy, tx)
}

test revoke_fails_without_signature() {
  let tx =
    Transaction {
      ..placeholder,
      extra_signatories: [test_attacker],
      mint: assets.from_asset(test_policy, "", -1),
    }
  !revenue_fact.mint(test_publisher, Revoke, test_policy, tx)
}

test revoke_fails_when_burning_wrong_quantity() {
  let tx =
    Transaction {
      ..placeholder,
      extra_signatories: [test_publisher],
      mint: assets.from_asset(test_policy, "", -2),
    }
  !revenue_fact.mint(test_publisher, Revoke, test_policy, tx)
}

fn test_utxo_ref() -> OutputReference {
  OutputReference { transaction_id: test_txid(), output_index: 0 }
}

fn spend_input() -> Input {
  Input {
    output_reference: test_utxo_ref(),
    output: Output {
      address: Address { payment_credential: Script(test_policy), stake_credential: None },
      value: assets.from_asset(test_policy, "", 1),
      datum: NoDatum,
      reference_script: None,
    },
  }
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
