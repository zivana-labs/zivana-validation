#!/usr/bin/env node
const crypto = require("crypto");

function fail(message) {
  console.error(`generate-seed: ${message}`);
  process.exit(1);
}

let bip39;
try {
  bip39 = require("bip39");
} catch (err) {
  fail(
    "the 'bip39' package is not installed. Run `npm install bip39 --no-save` " +
      "in this directory first, or use generate-seed.sh for an OpenSSL-only fallback " +
      "that skips the mnemonic step."
  );
}

const entropy = crypto.randomBytes(32); // 256 bits -> 24-word mnemonic
const mnemonic = bip39.entropyToMnemonic(entropy.toString("hex"));

if (!bip39.validateMnemonic(mnemonic)) {
  fail("generated mnemonic failed its own checksum validation, aborting without printing a seed");
}

bip39.mnemonicToSeed(mnemonic).then((seedBuffer) => {
  const seedHex = seedBuffer.toString("hex");
  process.stderr.write(
    "RECOVERY PHRASE (write this down somewhere that is NOT this repository, then close this terminal scrollback):\n\n" +
      `  ${mnemonic}\n\n` +
      "This phrase, not the hex seed on stdout, is what you need to recover the wallet. " +
      "Treat it like the password to your bank account.\n"
  );
  process.stdout.write(seedHex + "\n");
});