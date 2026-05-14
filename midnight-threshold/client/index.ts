import { Midnight, Compact, Network } from "@midnight-ntwrk/sdk";
import * as fs from "fs";

async function main() {
  // Connect to Midnight devnet
  const midnight = new Midnight({
    network: Network.Devnet,
    // API key if needed
  });

  // Compile and deploy contract
  const contractSource = fs.readFileSync("../contract/threshold.compact", "utf8");
  const compiled = await Compact.compile(contractSource);
  const contract = await midnight.deployContract(compiled, { threshold: 500 });

  // Generate proof with secret = 800 (above threshold)
  const proof = await contract.generateProof({ secret: 800 });
  const isValid = await contract.verifyProof(proof);
  console.log("Proof valid:", isValid); // true

  // Test with secret = 300 (below threshold) – should fail
  try {
    const proofFail = await contract.generateProof({ secret: 300 });
    console.log("Should have thrown");
  } catch (e) {
    console.log("Correctly rejected:", e.message);
  }
}

main();
