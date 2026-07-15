import { writeFileSync } from "fs";
import { join } from "path";
import { generateSeedPhrase, walletFromSeed } from "@lucid-evolution/lucid";

// One-off utility: generates a fresh testnet-only wallet seed phrase and
// its Preprod address. Never reuse a mainnet-linked seed for this.
//
// The seed is written to a gitignored file with owner-only permissions
// (0o600) rather than printed to stdout, so it doesn't linger in terminal
// scrollback, shell history, or any log aggregation a terminal session
// might be piped through.
const OUTPUT_PATH = join(__dirname, "../.env.wallet");

const seed = generateSeedPhrase();
const wallet = walletFromSeed(seed, {
  network: "Preprod",
  addressType: "Enterprise",
});

writeFileSync(
  OUTPUT_PATH,
  `WALLET_SEED=${seed}\nWALLET_ADDRESS=${wallet.address}\n`,
  { mode: 0o600 }
);

console.log(`Wallet generated. Seed written to ${OUTPUT_PATH} (mode 0600).`);
console.log("ADDRESS=" + wallet.address);
console.log(
  "Copy WALLET_SEED and WALLET_ADDRESS from that file into .env, then delete it."
);
