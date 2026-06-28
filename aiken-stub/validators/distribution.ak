// Distribution validator for the Zivana protocol.
//
// Locks funds and releases them to two beneficiaries when ALL of the
// following conditions hold:
//
//   1. tag == "zivana-distribute"  — semantic marker in the redeemer
//   2. redeemer.epoch == datum.release_epoch  — epoch matches the funder's
//      intent as stored on-chain at lock time; prevents arbitrary epoch values
//   3. tx.extra_signatories contains datum.owner  — the original funder must
//      authorise the spend; prevents anyone from forging a valid redeemer
//   4. Outputs pay to both datum.beneficiary1 and datum.beneficiary2
//
// Design notes:
//   • Cardano validators cannot read transaction metadata (it is outside the
//     script context). The original stub used tx.metadata, which is not part
//     of the Transaction type. Conditions must be validated on-chain.
//   • The redeemer tag alone is not sufficient — any actor can construct a
//     redeemer with the correct tag. Binding the epoch to a datum field and
//     requiring the owner's signature closes the trust gap.
//   • release_epoch is recorded in the datum at lock time, so the intended
//     epoch is committed on-chain and cannot be changed by the spender.

use aiken/collection/list
use cardano/address.{Credential}
use cardano/assets
use cardano/transaction.{Output, OutputReference, Transaction}

pub type Datum {
  owner: ByteArray,
  beneficiary1: ByteArray,
  beneficiary2: ByteArray,
  release_epoch: Int,
}

pub type Redeemer {
  Distribute { tag: ByteArray, epoch: Int }
}

fn pays_to_keyhash(outputs: List<Output>, pkh: ByteArray) -> Bool {
  list.any(
    outputs,
    fn(o) {
      when o.address.payment_credential is {
        Credential.VerificationKey(hash) -> hash == pkh
        _ -> False
      }
    },
  )
}

validator distribution {
  spend(
    datum: Option<Datum>,
    redeemer: Redeemer,
    _utxo: OutputReference,
    self: Transaction,
  ) {
    when datum is {
      Some(d) -> {
        let Distribute { tag, epoch } = redeemer
        // 1. Semantic tag check (human-readable marker, not the sole guard).
        let valid_tag = tag == "zivana-distribute"
        // 2. Epoch must match the value committed on-chain in the datum.
        //    Prevents the spender from supplying an arbitrary epoch > 0.
        let valid_epoch = epoch == d.release_epoch && epoch > 0
        // 3. Owner must sign — closes the trust gap introduced by moving
        //    the condition from metadata to a user-supplied redeemer field.
        let owner_signed = list.has(self.extra_signatories, d.owner)
        // 4. Both beneficiaries receive outputs.
        let pays_b1 = pays_to_keyhash(self.outputs, d.beneficiary1)
        let pays_b2 = pays_to_keyhash(self.outputs, d.beneficiary2)
        valid_tag && valid_epoch && owner_signed && pays_b1 && pays_b2
      }
      None -> False
    }
  }

  else(_) { fail }
}

// ---------------------------------------------------------------------------
// Tests
//
// Every test below constructs a real Datum / Redeemer / Transaction and invokes
// the actual `distribution.spend` handler, then asserts on its return value.
// Replacing the validator body with `True` would make the rejection tests fail,
// so a passing run is genuine evidence the validator enforces each condition.
// ---------------------------------------------------------------------------

const owner_pkh: ByteArray = #"00112233445566778899aabbccddeeff00112233445566778899aabb"

const b1_pkh: ByteArray = #"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

const b2_pkh: ByteArray = #"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

const own_ref: OutputReference =
  OutputReference { transaction_id: #"00", output_index: 0 }

// Datum with a fixed release_epoch the redeemer must match.
fn base_datum(release_epoch: Int) -> Datum {
  Datum {
    owner: owner_pkh,
    beneficiary1: b1_pkh,
    beneficiary2: b2_pkh,
    release_epoch,
  }
}

// An output paying the given key hash.
fn output_to(pkh: ByteArray) -> Output {
  Output {
    address: address.from_verification_key(pkh),
    value: assets.from_lovelace(4_000_000),
    datum: transaction.NoDatum,
    reference_script: None,
  }
}

// Build a Transaction with the given signatories and outputs.
fn tx(signatories: List<ByteArray>, outputs: List<Output>) -> Transaction {
  Transaction {
    ..transaction.placeholder,
    extra_signatories: signatories,
    outputs: outputs,
  }
}

// Happy-path transaction: owner signed, both beneficiaries paid.
fn valid_tx() -> Transaction {
  tx([owner_pkh], [output_to(b1_pkh), output_to(b2_pkh)])
}

// --- All conditions satisfied -> validator returns True ---------------------

test distribute_valid() {
  let datum = base_datum(1)
  let redeemer = Distribute { tag: "zivana-distribute", epoch: 1 }
  distribution.spend(Some(datum), redeemer, own_ref, valid_tx())
}

// --- Condition 1: tag --------------------------------------------------------

test distribute_wrong_tag_rejected() {
  let datum = base_datum(1)
  let redeemer = Distribute { tag: "wrong-tag", epoch: 1 }
  !distribution.spend(Some(datum), redeemer, own_ref, valid_tx())
}

// --- Condition 2: epoch matches datum, and > 0 -------------------------------

test distribute_epoch_mismatch_rejected() {
  let datum = base_datum(1)
  let redeemer = Distribute { tag: "zivana-distribute", epoch: 5 }
  !distribution.spend(Some(datum), redeemer, own_ref, valid_tx())
}

test distribute_zero_epoch_rejected() {
  // Redeemer epoch matches the datum (both 0) but fails the epoch > 0 guard.
  let datum = base_datum(0)
  let redeemer = Distribute { tag: "zivana-distribute", epoch: 0 }
  !distribution.spend(Some(datum), redeemer, own_ref, valid_tx())
}

test distribute_negative_epoch_rejected() {
  let datum = base_datum(-1)
  let redeemer = Distribute { tag: "zivana-distribute", epoch: -1 }
  !distribution.spend(Some(datum), redeemer, own_ref, valid_tx())
}

// --- Condition 3: owner signature -------------------------------------------

test distribute_owner_not_signed_rejected() {
  let datum = base_datum(1)
  let redeemer = Distribute { tag: "zivana-distribute", epoch: 1 }
  // Everything valid except the owner is absent from extra_signatories.
  let no_signer = tx([], [output_to(b1_pkh), output_to(b2_pkh)])
  !distribution.spend(Some(datum), redeemer, own_ref, no_signer)
}

// --- Condition 4: both beneficiaries paid -----------------------------------

test distribute_missing_beneficiary1_rejected() {
  let datum = base_datum(1)
  let redeemer = Distribute { tag: "zivana-distribute", epoch: 1 }
  // Only beneficiary2 is paid.
  let only_b2 = tx([owner_pkh], [output_to(b2_pkh)])
  !distribution.spend(Some(datum), redeemer, own_ref, only_b2)
}

test distribute_missing_beneficiary2_rejected() {
  let datum = base_datum(1)
  let redeemer = Distribute { tag: "zivana-distribute", epoch: 1 }
  // Only beneficiary1 is paid.
  let only_b1 = tx([owner_pkh], [output_to(b1_pkh)])
  !distribution.spend(Some(datum), redeemer, own_ref, only_b1)
}

// --- No datum present -> validator returns False ----------------------------

test distribute_no_datum_rejected() {
  let redeemer = Distribute { tag: "zivana-distribute", epoch: 1 }
  !distribution.spend(None, redeemer, own_ref, valid_tx())
}
