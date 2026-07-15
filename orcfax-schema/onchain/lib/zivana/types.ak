//// On-chain types for the Zivana revenue-event fact statement.
////
//// The `Statement`/`Context`/`FsDat` shapes mirror the real Orcfax
//// `FsDat<t>` datum (verified against github.com/orcfax/publish,
//// aik/lib/orcfax/types.ak): a feed-tagged, timestamped envelope around a
//// generic `body`. Orcfax's live network only fills `body` with `Rational`
//// (a price ratio) for Current Exchange Rate feeds; `RevenueBody` below is
//// our own extension of `t` for a revenue-event fact, since the live
//// Orcfax protocol has no such feed type and is only writable by licensed
//// ITN validators (see README for the full explanation).

use aiken/crypto.{VerificationKeyHash}

/// A feed-tagged, timestamped statement — same shape as Orcfax's real
/// `Statement<t>`.
pub type Statement<t> {
  feed_id: ByteArray,
  /// Milliseconds since the Unix epoch — the same unit Cardano's own
  /// `ValidityRange` uses, so it can be checked against
  /// `self.validity_range` directly without a unit conversion.
  created_at_ms: Int,
  body: t,
}

/// Same shape as Orcfax's real `Context`: identifies who collected/attested
/// the statement.
pub type Context {
  collector: VerificationKeyHash,
}

/// Same shape as Orcfax's real `FsDat<t>`: a statement plus its context.
pub type FsDat<t> {
  statement: Statement<t>,
  context: Context,
}

/// Our revenue-event body type (the `t` in `FsDat<t>` / `Statement<t>`).
/// Amounts are integer minor units (e.g. kobo) to avoid on-chain floats.
pub type RevenueBody {
  amount_minor_units: Int,
  currency: ByteArray,
  period_start: Int,
  period_end: Int,
  participant: ByteArray,
  claim_hash: ByteArray,
}

pub type RevenueFactDatum =
  FsDat<RevenueBody>

pub type FsRedeemer {
  Publish
  Revoke
}
