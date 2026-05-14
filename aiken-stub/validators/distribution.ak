// A minimal distribution validator.
// Locks funds and distributes them to two predefined addresses
// when the transaction includes a specific metadata label (42)
// containing the value "zivana-distribute".

use aiken/transaction.{ScriptContext, Transaction, find_tx_out, value_sum}.
use aiken/hash.{Blake2b_256, Hash}.
use aiken/bytearray.{ByteArray, concat}.
use aiken/list.{head}.

type Datum {
  owner: ByteArray,   // pkh of the funder
  beneficiary1: ByteArray,
  beneficiary2: ByteArray,
}

type Redeemer {
  Distribute,
}

validator {
  fn distribution_validator(datum: Datum, redeemer: Redeemer, ctx: ScriptContext) -> Bool {
    when redeemer is {
      Distribute -> {
        let tx = ctx.transaction
        // Check that the transaction includes metadata label 42 with "zivana-distribute"
        let meta = tx.metadata
        let must_have = meta.get(42) == Some("zivana-distribute")
        // Check that outputs include payments to both beneficiaries
        let outputs = tx.outputs
        let to_beneficiary1 = outputs |> list.find(fn(out) { out.address == datum.beneficiary1 })
        let to_beneficiary2 = outputs |> list.find(fn(out) { out.address == datum.beneficiary2 })
        must_have && to_beneficiary1 != None && to_beneficiary2 != None
      }
    }
  }
}
