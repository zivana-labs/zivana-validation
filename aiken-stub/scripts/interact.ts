import { Lucid, Blockfrost, fromText, Data } from "lucid-cardano";

const BLOCKFROST_PROJECT_ID = "your_project_id_here";
const BLOCKFROST_URL = "https://cardano-preprod.blockfrost.io/api/v0";

async function main() {
  const lucid = await Lucid.new(
    new Blockfrost(BLOCKFROST_URL, BLOCKFROST_PROJECT_ID),
    "Preprod"
  );

  // Load a seed phrase (for testing only; never use real funds)
  lucid.selectWalletFromSeed(
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art"
  );

  // Compile the validator
  const validatorScript = `...`; // Replace with output from `aiken build`
  const validatorHash = lucid.utils.validatorToScriptHash(validatorScript);
  const validatorAddress = lucid.utils.scriptHashToAddress(validatorHash);

  // Create a lock transaction
  const tx = await lucid
    .newTx()
    .payToContract(validatorAddress, { inline: Data.void() }, { lovelace: 10000000n })
    .complete();

  const signedTx = await tx.sign().complete();
  const txHash = await signedTx.submit();
  console.log("Lock transaction:", txHash);

  // Distribute transaction (requires metadata label 42)
  const distributeTx = await lucid
    .newTx()
    .collectFrom([/* utxo from lock */], Data.void())
    .payToAddress("addr_test1...", { lovelace: 5000000n })  // beneficiary1
    .payToAddress("addr_test2...", { lovelace: 5000000n })  // beneficiary2
    .attachMetadata(42, fromText("zivana-distribute"))
    .complete();

  const signedDist = await distributeTx.sign().complete();
  const distHash = await signedDist.submit();
  console.log("Distribute transaction:", distHash);
}

main();
