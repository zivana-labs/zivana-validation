import { Lucid, Blockfrost } from "lucid-cardano";

async function queryFact() {
  const lucid = await Lucid.new(
    new Blockfrost("https://cardano-preprod.blockfrost.io/api/v0", "your_key"),
    "Preprod"
  );

  // Query for the fact statement using the Orcfax reference input
  // (implementation depends on how Orcfax exposes data on-chain)
  const utxos = await lucid.utxosAt("addr_test1..."); // Orcfax fact statement address
  console.log(utxos);
}

queryFact();
