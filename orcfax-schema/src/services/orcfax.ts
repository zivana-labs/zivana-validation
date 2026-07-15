import "dotenv/config";
import { Blockfrost, Lucid, type Network } from "@lucid-evolution/lucid";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} in .env`);
  }
  return value;
}

export async function getLucid() {
  const blockfrostUrl = requireEnv("BLOCKFROST_URL");
  const blockfrostApiKey = requireEnv("BLOCKFROST_API_KEY");
  const network = requireEnv("NETWORK") as Network;
  const seed = requireEnv("WALLET_SEED");

  const lucid = await Lucid(
    new Blockfrost(blockfrostUrl, blockfrostApiKey),
    network
  );
  // Must match the addressType used by scripts/gen-wallet.ts, or the
  // funded UTxO (at the Enterprise address) is invisible to coin selection
  // (which queries whatever address this derives, e.g. the Base address).
  lucid.selectWallet.fromSeed(seed, { addressType: "Enterprise" });

  return { lucid, network };
}
