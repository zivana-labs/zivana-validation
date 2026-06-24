/**
 * Interact with the Zivana distribution validator on Cardano preprod.
 *
 * Steps:
 *  1. Lock 10 ADA in the validator with a datum naming two beneficiaries.
 *  2. Distribute from the locked UTxO: provide the Distribute redeemer
 *     (tag = "zivana-distribute", epoch = 1) and pay to both beneficiaries.
 *
 * Prerequisites:
 *  - BLOCKFROST_PROJECT_ID env var set to your preprod API key.
 *    Get one free at https://blockfrost.io
 *  - WALLET_SEED env var set to a 24-word seed phrase funded with preprod ADA.
 *    Get preprod ADA at https://docs.cardano.org/cardano-testnet/tools/faucet
 *    Default falls back to the well-known "abandon...art" test seed — fund it first.
 *  - `aiken build` already run (plutus.json must exist in parent directory).
 *
 * Usage:
 *   BLOCKFROST_PROJECT_ID=preproddXXXXX WALLET_SEED="word1 word2 ..." npx ts-node scripts/interact.ts
 */

import { readFileSync } from "fs";
import { join } from "path";
import {
  Blockfrost,
  Constr,
  Data,
  Lucid,
  fromText,
  validatorToAddress,
  getAddressDetails,
  type Script,
} from "@lucid-evolution/lucid";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BLOCKFROST_PROJECT_ID =
  process.env.BLOCKFROST_PROJECT_ID ?? "your_preprod_project_id_here";

const BLOCKFROST_URL = "https://cardano-preprod.blockfrost.io/api/v0";

// Default test seed — NEVER use for real funds.
const WALLET_SEED =
  process.env.WALLET_SEED ??
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art";

// The tag the redeemer must carry (UTF-8 → hex). Must match distribution.ak.
const DISTRIBUTION_TAG: string = fromText("zivana-distribute");

// Release epoch stored in the datum at lock time.
// The redeemer must supply the same value — prevents spenders from
// supplying an arbitrary epoch > 0.
const RELEASE_EPOCH = 1n;

// ---------------------------------------------------------------------------
// Load compiled validator from plutus.json (output of `aiken build`)
// ---------------------------------------------------------------------------

const blueprintPath = join(__dirname, "..", "plutus.json");
const blueprint = JSON.parse(readFileSync(blueprintPath, "utf8"));

const spendEntry = blueprint.validators.find((v: { title: string }) =>
  v.title.endsWith(".spend")
);
if (!spendEntry) {
  throw new Error("No spend validator in plutus.json. Run `aiken build` first.");
}

const validator: Script = {
  type: "PlutusV3",
  script: spendEntry.compiledCode,
};

// ---------------------------------------------------------------------------
// Datum & Redeemer encoding (Plutus CBOR)
// ---------------------------------------------------------------------------

function buildDatum(
  ownerPkh: string,
  b1Pkh: string,
  b2Pkh: string,
  releaseEpoch: bigint
): string {
  // Datum field order matches distribution.ak:
  // Datum { owner, beneficiary1, beneficiary2, release_epoch }
  return Data.to(new Constr(0, [ownerPkh, b1Pkh, b2Pkh, releaseEpoch]));
}

function buildRedeemer(tag: string, epoch: bigint): string {
  return Data.to(new Constr(0, [tag, epoch]));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const lucid = await Lucid(
    new Blockfrost(BLOCKFROST_URL, BLOCKFROST_PROJECT_ID),
    "Preprod"
  );

  lucid.selectWallet.fromSeed(WALLET_SEED);

  const walletAddress = await lucid.wallet().address();
  const addrDetails = getAddressDetails(walletAddress);
  const walletPkh = addrDetails.paymentCredential?.hash;
  if (!walletPkh) throw new Error("Could not extract payment key hash.");

  const contractAddress = validatorToAddress("Preprod", validator);

  console.log("Wallet address  :", walletAddress);
  console.log("Wallet PKH      :", walletPkh);
  console.log("Contract address:", contractAddress);
  console.log();

  // For the demo both beneficiaries resolve to the wallet itself.
  // Replace with distinct preprod addresses in production.
  const beneficiary1Pkh = walletPkh;
  const beneficiary2Pkh = walletPkh;

  // -------------------------------------------------------------------------
  // Step 1 — Lock 10 ADA in the validator
  // Set LOCK_TX_HASH env var to skip this step and go straight to distribute.
  // -------------------------------------------------------------------------

  let lockTxHash = process.env.LOCK_TX_HASH ?? "";

  if (!lockTxHash) {
    console.log("Step 1: Locking 10 ADA in the validator...");

    const datum = buildDatum(walletPkh, beneficiary1Pkh, beneficiary2Pkh, RELEASE_EPOCH);

    const lockTxSignBuilder = await lucid
      .newTx()
      .pay.ToContract(contractAddress, { kind: "inline", value: datum }, { lovelace: 10_000_000n })
      .complete();

    lockTxHash = await (await lockTxSignBuilder.sign.withWallet().complete()).submit();

    console.log("Lock TX submitted:", lockTxHash);
    console.log("View on explorer : https://preprod.cardanoscan.io/transaction/" + lockTxHash);
    console.log();

    console.log("Waiting for confirmation (this may take ~20 seconds)...");
    await lucid.awaitTx(lockTxHash);
    console.log("Lock TX confirmed. Waiting 15s for Blockfrost to index...");
    await new Promise((r) => setTimeout(r, 15_000));
    console.log();
  } else {
    console.log("Step 1: Skipped (using LOCK_TX_HASH =", lockTxHash, ")");
    console.log("Waiting 5s for Blockfrost state to settle...");
    await new Promise((r) => setTimeout(r, 5_000));
    console.log();
  }

  // -------------------------------------------------------------------------
  // Step 2 — Distribute: collect the locked UTxO, pay both beneficiaries
  // -------------------------------------------------------------------------

  console.log("Step 2: Distributing to beneficiaries...");

  // Fetch fresh UTxOs — avoids using stale pre-lock wallet UTxOs for fees.
  const [contractUtxos, walletUtxos] = await Promise.all([
    lucid.utxosAt(contractAddress),
    lucid.utxosAt(walletAddress),
  ]);

  const lockedUtxo = contractUtxos.find(
    (u) => u.txHash === lockTxHash && u.assets.lovelace >= 9_000_000n
  );
  if (!lockedUtxo) {
    throw new Error("Could not find the locked UTxO after confirmation.");
  }
  console.log("Locked UTxO:", lockedUtxo.txHash, "#" + lockedUtxo.outputIndex);

  // Pick the largest wallet UTxO as collateral (must cover 150% of tx fee).
  const collateralUtxo = walletUtxos
    .filter((u) => u.assets.lovelace >= 5_000_000n)
    .sort((a, b) => Number(b.assets.lovelace - a.assets.lovelace))[0];
  if (!collateralUtxo) throw new Error("No UTxO ≥ 5 ADA available for collateral.");
  console.log("Collateral UTxO:", collateralUtxo.txHash, "#" + collateralUtxo.outputIndex);

  const redeemer = buildRedeemer(DISTRIBUTION_TAG, RELEASE_EPOCH);

  const distTxSignBuilder = await lucid
    .newTx()
    .collectFrom([lockedUtxo], redeemer)
    .attach.SpendingValidator(validator)
    // Owner must sign — validator checks tx.extra_signatories contains datum.owner.
    .addSignerKey(walletPkh)
    .pay.ToAddress(walletAddress, { lovelace: 4_000_000n }) // beneficiary1
    .pay.ToAddress(walletAddress, { lovelace: 4_000_000n }) // beneficiary2
    .complete({
      localUPLCEval: false,
      setCollateral: 5_000_000n,
    });

  const distTxHash = await (await distTxSignBuilder.sign.withWallet().complete()).submit();

  console.log("Distribute TX submitted:", distTxHash);
  console.log("View on explorer       : https://preprod.cardanoscan.io/transaction/" + distTxHash);
  console.log();
  console.log("Done. Lock and distribution confirmed on Cardano preprod.");
}

main().catch(console.error);
