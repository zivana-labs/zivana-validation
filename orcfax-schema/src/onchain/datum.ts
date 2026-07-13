import { Data } from "@lucid-evolution/lucid";

// Mirrors onchain/lib/zivana/types.ak field-for-field and in declaration
// order (Aiken records serialize as a Constr with fields in source order).

export const RevenueBodySchema = Data.Object({
  amount_minor_units: Data.Integer(),
  currency: Data.Bytes(),
  period_start: Data.Integer(),
  period_end: Data.Integer(),
  participant: Data.Bytes(),
  claim_hash: Data.Bytes(),
});
export type RevenueBody = Data.Static<typeof RevenueBodySchema>;

export const StatementSchema = Data.Object({
  feed_id: Data.Bytes(),
  created_at: Data.Integer(),
  body: RevenueBodySchema,
});
export type Statement = Data.Static<typeof StatementSchema>;

export const ContextSchema = Data.Object({
  collector: Data.Bytes(),
});
export type Context = Data.Static<typeof ContextSchema>;

export const RevenueFactDatumSchema = Data.Object({
  statement: StatementSchema,
  context: ContextSchema,
});
export type RevenueFactDatum = Data.Static<typeof RevenueFactDatumSchema>;

// Matches `pub type FsRedeemer { Publish; Revoke }` — constructor index
// follows declaration order (Publish = 0, Revoke = 1).
export const FsRedeemerSchema = Data.Enum([
  Data.Literal("Publish"),
  Data.Literal("Revoke"),
]);
export type FsRedeemer = Data.Static<typeof FsRedeemerSchema>;
