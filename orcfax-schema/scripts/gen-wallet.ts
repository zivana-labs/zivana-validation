import { generateSeedPhrase, walletFromSeed } from "@lucid-evolution/lucid";

// One-off utility: generates a fresh testnet-only wallet seed phrase and
// its Preprod address. Never reuse a mainnet-linked seed for this.
const seed = generateSeedPhrase();
const wallet = walletFromSeed(seed, {
  network: "Preprod",
  addressType: "Enterprise",
});

console.log("SEED=" + seed);
console.log("ADDRESS=" + wallet.address);
