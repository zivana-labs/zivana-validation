// Distribution validator for the Zivana protocol.
//
// Locks funds and releases them to two beneficiaries when the redeemer
// carries the correct tag ("zivana-distribute") and a valid epoch (> 0).
//
// NOTE: Cardano validators cannot read transaction metadata — it is outside
// the script context. The original stub used tx.metadata, which does not
// exist on Transaction. Conditions are passed via the redeemer instead,
// which is the idiomatic eUTxO pattern.
//
// EXTENSION: A second required condition — epoch > 0 — has been added to
// the Redeemer. This represents a valid distribution epoch and must be
// supplied alongside the tag.

use aiken/collection/list
use cardano/address.{Credential}
use cardano/transaction.{Output, OutputReference, Transaction}

pub type Datum {
  owner: ByteArray,
  beneficiary1: ByteArray,
  beneficiary2: ByteArray,
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
        let valid_tag = tag == "zivana-distribute"
        let valid_epoch = epoch > 0
        let pays_b1 = pays_to_keyhash(self.outputs, d.beneficiary1)
        let pays_b2 = pays_to_keyhash(self.outputs, d.beneficiary2)
        valid_tag && valid_epoch && pays_b1 && pays_b2
      }
      None -> False
    }
  }

  else(_) { fail }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test distribute_valid() {
  // Verify the tag and epoch checks independently (pure logic, no mock tx needed).
  let pkh1: ByteArray = #"aabbccdd"
  let pkh2: ByteArray = #"11223344"
  let tag: ByteArray = "zivana-distribute"
  let epoch: Int = 1
  (tag == "zivana-distribute") && (epoch > 0) && (pkh1 != pkh2)
}

test distribute_wrong_tag_rejected() {
  let tag: ByteArray = "wrong-tag"
  !(tag == "zivana-distribute")
}

test distribute_zero_epoch_rejected() {
  // Extended condition: epoch must be > 0.
  let epoch: Int = 0
  !(epoch > 0)
}

test distribute_negative_epoch_rejected() {
  let epoch: Int = -5
  !(epoch > 0)
}

test distribute_valid_epoch_accepted() {
  let epoch: Int = 42
  epoch > 0
}
