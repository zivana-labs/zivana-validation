import { ethers, network } from "hardhat";

// Deploys CusdPaySplitter, wired to the stablecoin at STABLE_TOKEN_ADDRESS.
// Celo Sepolia defaults to USDC; set STABLE_TOKEN_ADDRESS to USDm for the Mento/cUSD lineage.
const EXPLORERS: Record<string, string> = {
  celoSepolia: "https://celo-sepolia.blockscout.com/address/",
};

const DEFAULT_TOKENS: Record<string, string> = {
  // USDC on Celo Sepolia (cUSD is not deployed on this testnet — see REPORT.md).
  celoSepolia: "0x01C5C0122039549AD1493B8220cABEdD739BC44E",
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const token = process.env.STABLE_TOKEN_ADDRESS || DEFAULT_TOKENS[network.name];
  if (!token) throw new Error("Set STABLE_TOKEN_ADDRESS (stablecoin ERC-20 address).");
  if (!ethers.isAddress(token)) throw new Error(`STABLE_TOKEN_ADDRESS is not a valid address: ${token}`);

  console.log(`Network: ${network.name}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Stablecoin: ${token}`);

  const CusdPaySplitter = await ethers.getContractFactory("CusdPaySplitter");
  const splitter = await CusdPaySplitter.deploy(token);
  await splitter.waitForDeployment();
  const address = await splitter.getAddress();

  console.log(`\nCusdPaySplitter deployed to: ${address}`);
  const explorer = EXPLORERS[network.name];
  if (explorer) console.log(`Explorer: ${explorer}${address}`);
  console.log(`\nVerify with (constructor arg is the token address):`);
  console.log(`  npx hardhat verify --network ${network.name} ${address} ${token}`);
  console.log(`\nThen run the stablecoin simulation:`);
  console.log(`  SPLITTER_ADDRESS=${address} npm run simulate:cusd`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
