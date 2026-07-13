import { Data, toText } from "@lucid-evolution/lucid";
import { getLucid } from "../src/services/orcfax";
import { buildPublisherScript } from "../src/onchain/script";
import { RevenueFactDatumSchema, type RevenueFactDatum } from "../src/onchain/datum";

async function main() {
  const { lucid, network } = await getLucid();
  const walletAddress = await lucid.wallet().address();
  const { policyId, scriptAddress } = buildPublisherScript(
    walletAddress,
    network
  );

  const utxos = await lucid.utxosAt(scriptAddress);
  const candidates = utxos.filter(
    (utxo) => (utxo.assets[policyId] ?? 0n) === 1n
  );

  if (candidates.length === 0) {
    throw new Error(
      `No fact-statement UTxO found at ${scriptAddress} for policy ${policyId}. ` +
        "Run `npm run publish` first."
    );
  }

  // Nothing on-chain prevents Publish from being run more than once without
  // an intervening Revoke, which leaves multiple UTxOs each holding one fs
  // token. There's no implicit "latest" — pick the one with the largest
  // created_at explicitly, and say so if there's more than one candidate.
  const decoded = candidates.map((utxo) => {
    if (!utxo.datum) {
      throw new Error(
        `Fact UTxO ${utxo.txHash}#${utxo.outputIndex} has no inline datum`
      );
    }
    // Cast: see note in publish-fact.ts about the flattened Data.Static<T>.
    const datum = Data.from(utxo.datum, RevenueFactDatumSchema as any) as RevenueFactDatum;
    return { utxo, datum };
  });

  if (decoded.length > 1) {
    console.warn(
      `Warning: ${decoded.length} fact-statement UTxOs found at ${scriptAddress}. ` +
        "Selecting the one with the most recent created_at; " +
        "consider revoking stale ones with a Revoke transaction."
    );
  }

  const { utxo: factUtxo, datum } = decoded.reduce((latest, candidate) =>
    candidate.datum.statement.created_at_ms > latest.datum.statement.created_at_ms
      ? candidate
      : latest
  );

  const currency = toText(datum.statement.body.currency);
  const amountMajorUnits = Number(datum.statement.body.amount_minor_units) / 100;
  const participant = toText(datum.statement.body.participant);
  const feedId = toText(datum.statement.feed_id);
  const periodStart = new Date(Number(datum.statement.body.period_start) * 1000);
  const periodEnd = new Date(Number(datum.statement.body.period_end) * 1000);
  const createdAt = new Date(Number(datum.statement.created_at_ms));

  console.log("Fact statement found on-chain.");
  console.log("  tx hash:      ", factUtxo.txHash);
  console.log("  feed id:      ", feedId);
  console.log("  created at:   ", createdAt.toISOString());
  console.log("  participant:  ", participant);
  console.log("  period:       ", periodStart.toISOString(), "->", periodEnd.toISOString());
  console.log("  revenue:      ", amountMajorUnits, currency);
  console.log("  claim hash:   ", datum.statement.body.claim_hash);
  console.log("  collector pkh:", datum.context.collector);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
