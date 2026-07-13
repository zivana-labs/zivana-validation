import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import { Data, fromText } from "@lucid-evolution/lucid";
import { getLucid } from "../src/services/orcfax";
import { buildPublisherScript } from "../src/onchain/script";
import {
  FsRedeemerSchema,
  RevenueFactDatumSchema,
  type RevenueFactDatum,
} from "../src/onchain/datum";
import { validateClaim } from "../src/schema/validate";
import { toMinorUnits } from "../src/util/money";
import type { RevenueFactStatement } from "../src/types/fact";

const CLAIM_PATH = join(__dirname, "../schemas/revenue-event.jsonld");

function toUnixSeconds(dateStr: string): bigint {
  return BigInt(Math.floor(new Date(dateStr).getTime() / 1000));
}

async function main() {
  const claimJson = readFileSync(CLAIM_PATH, "utf-8");
  const claim: RevenueFactStatement = JSON.parse(claimJson);
  validateClaim(claim);
  const claimHash = createHash("sha256").update(claimJson).digest("hex");

  const { lucid, network } = await getLucid();
  const walletAddress = await lucid.wallet().address();
  const { publisherPkh, mintingPolicy, policyId, scriptAddress } =
    buildPublisherScript(walletAddress, network);

  const [periodStart, periodEnd] = claim.temporalCoverage.split("/");

  const now = Date.now();

  const datum: RevenueFactDatum = {
    statement: {
      feed_id: fromText(`ZIV-REV/${claim.identifier}/1`),
      created_at_ms: BigInt(now),
      body: {
        amount_minor_units: toMinorUnits(claim.about.value.value),
        currency: fromText(claim.about.value.currency),
        period_start: toUnixSeconds(periodStart),
        period_end: toUnixSeconds(periodEnd),
        participant: fromText(claim.about.observationAbout.identifier),
        claim_hash: claimHash,
      },
    },
    context: {
      collector: publisherPkh,
    },
  };

  // Cast: the bundled .d.ts flattens Data.Static<T> to T for this overload,
  // which makes the schema argument's type unrepresentable here — the
  // runtime call itself (value, schema) is the standard Lucid Evolution
  // pattern.
  const datumCbor = Data.to(datum, RevenueFactDatumSchema as any);
  const redeemer = Data.to("Publish", FsRedeemerSchema as any);

  // Bounds self.validity_range on-chain. The validator requires both
  // bounds to be finite (rejecting an unbounded range outright) and caps
  // the width at max_validity_range_width_ms (1 hour, onchain/validators/
  // revenue_fact.ak) — this window must stay comfortably inside that cap.
  const validFrom = now - 2 * 60 * 1000;
  const validTo = now + 20 * 60 * 1000;

  const tx = await lucid
    .newTx()
    .mintAssets({ [policyId]: 1n }, redeemer)
    .attach.MintingPolicy(mintingPolicy)
    .pay.ToContract(
      scriptAddress,
      { kind: "inline", value: datumCbor },
      { [policyId]: 1n }
    )
    .addSigner(walletAddress)
    .validFrom(validFrom)
    .validTo(validTo)
    .complete();

  const signed = await tx.sign.withWallet().complete();
  const txHash = await signed.submit();

  console.log("Fact statement published.");
  console.log("  tx hash:        ", txHash);
  console.log("  policy id:      ", policyId);
  console.log("  script address: ", scriptAddress);
  console.log(
    "  explorer:       ",
    `https://preprod.cardanoscan.io/transaction/${txHash}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
