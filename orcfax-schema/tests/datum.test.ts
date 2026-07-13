import assert from "node:assert/strict";
import { Data, fromText } from "@lucid-evolution/lucid";
import {
  RevenueFactDatumSchema,
  FsRedeemerSchema,
  type RevenueFactDatum,
} from "../src/onchain/datum";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
  } catch (err) {
    console.log(`  FAIL  ${name}`);
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}

test("RevenueFactDatum round-trips through Data.to/Data.from unchanged", () => {
  const original: RevenueFactDatum = {
    statement: {
      feed_id: fromText("ZIV-REV/test/1"),
      created_at: 1735000000000n,
      body: {
        amount_minor_units: 50000000n,
        currency: fromText("NGN"),
        period_start: 1735000000n,
        period_end: 1736000000n,
        participant: fromText("did:prism:test-participant"),
        claim_hash: "deadbeef",
      },
    },
    context: {
      collector: "aa".repeat(28),
    },
  };

  // Cast: see note in scripts/publish-fact.ts about the flattened
  // Data.Static<T> in the bundled .d.ts.
  const cbor = Data.to(original, RevenueFactDatumSchema as any);
  const decoded = Data.from(cbor, RevenueFactDatumSchema as any) as RevenueFactDatum;

  assert.deepStrictEqual(decoded, original);
});

test("RevenueFactDatum with zero-valued fields round-trips", () => {
  const original: RevenueFactDatum = {
    statement: {
      feed_id: "",
      created_at: 0n,
      body: {
        amount_minor_units: 0n,
        currency: "",
        period_start: 0n,
        period_end: 0n,
        participant: "",
        claim_hash: "",
      },
    },
    context: {
      collector: "00".repeat(28),
    },
  };

  const cbor = Data.to(original, RevenueFactDatumSchema as any);
  const decoded = Data.from(cbor, RevenueFactDatumSchema as any) as RevenueFactDatum;

  assert.deepStrictEqual(decoded, original);
});

test("RevenueFactDatum encodes to the exact CBOR of a real published Preprod transaction", () => {
  // The round-trip tests above only prove Data.to/Data.from are mutually
  // consistent — they'd pass even if the schema's field order silently
  // drifted from onchain/lib/zivana/types.ak, since both sides would still
  // agree with each other. This test anchors to ground truth instead: the
  // exact inline-datum CBOR Blockfrost returned for tx
  // eb21b096895370da12f0b1d8273b523d79d088c5b25843d14762b8409b2e6790 (the
  // real Preprod publish recorded in the README), built from the same
  // known inputs used at the time. A field-order regression here would
  // change the byte sequence and fail this exact-match check.
  const datum: RevenueFactDatum = {
    statement: {
      feed_id: fromText("ZIV-REV/zivana-revenue-001/1"),
      created_at: 1783926644536n,
      body: {
        amount_minor_units: 50000000n,
        currency: fromText("NGN"),
        period_start: 1777593600n,
        period_end: 1778716800n,
        participant: fromText("did:prism:123456789abcdefghi"),
        claim_hash:
          "bde25322044dd46ee5e2243bca15fbb1d0d7321355e90e1d7eda99f656ba988f",
      },
    },
    context: {
      collector: "fc7ba6ddaf68027fad8c2c47265081814dcc10dafa643e1644de7e05",
    },
  };

  const realOnChainCbor =
    "d8799fd8799f581c5a49562d5245562f7a6976616e612d726576656e75652d3030312f311b0000019f5a505f38d8799f1a02faf080434e474e1a69f3ed001a6a051080581c6469643a707269736d3a3132333435363738396162636465666768695820bde25322044dd46ee5e2243bca15fbb1d0d7321355e90e1d7eda99f656ba988fffffd8799f581cfc7ba6ddaf68027fad8c2c47265081814dcc10dafa643e1644de7e05ffff";

  assert.equal(Data.to(datum, RevenueFactDatumSchema as any), realOnChainCbor);
});

test("FsRedeemer Publish/Revoke encode to distinct constructors and round-trip", () => {
  const publishCbor = Data.to("Publish", FsRedeemerSchema as any);
  const revokeCbor = Data.to("Revoke", FsRedeemerSchema as any);

  assert.notEqual(publishCbor, revokeCbor);
  assert.equal(Data.from(publishCbor, FsRedeemerSchema as any), "Publish");
  assert.equal(Data.from(revokeCbor, FsRedeemerSchema as any), "Revoke");
});

if (process.exitCode === 1) {
  console.error("\ndatum round-trip tests FAILED");
} else {
  console.log("\nall datum round-trip tests PASSED");
}
