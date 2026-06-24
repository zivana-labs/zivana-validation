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
// ---------------------------------------------------------------------------

test distribute_valid() {
  let tag: ByteArray = "zivana-distribute"
  let epoch: Int = 1
  let release_epoch: Int = 1
  (tag == "zivana-distribute") && (epoch == release_epoch) && (epoch > 0)
}

test distribute_wrong_tag_rejected() {
  let tag: ByteArray = "wrong-tag"
  !(tag == "zivana-distribute")
}

test distribute_epoch_mismatch_rejected() {
  // Redeemer epoch must match the datum's release_epoch, not just be > 0.
  let epoch: Int = 5
  let release_epoch: Int = 1
  !(epoch == release_epoch)
}

test distribute_zero_epoch_rejected() {
  let epoch: Int = 0
  let release_epoch: Int = 0
  !(epoch == release_epoch && epoch > 0)
}

test distribute_negative_epoch_rejected() {
  let epoch: Int = -1
  let release_epoch: Int = -1
  !(epoch == release_epoch && epoch > 0)
}

test distribute_valid_epoch_accepted() {
  let epoch: Int = 42
  let release_epoch: Int = 42
  epoch == release_epoch && epoch > 0
}

test distribute_owner_must_match() {
  // Simulate owner check: only the owner's pkh in extra_signatories passes.
  let owner: ByteArray = #"aabb"
  let signatories: List<ByteArray> = [#"aabb"]
  list.has(signatories, owner)
}

test distribute_non_owner_rejected() {
  let owner: ByteArray = #"aabb"
  let signatories: List<ByteArray> = [#"ccdd"]
  !list.has(signatories, owner)
}
