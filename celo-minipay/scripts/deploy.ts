import { ethers, network } from "hardhat";

// Deploys the native-CELO PaySplitter (the originally provided contract) and prints the address,
// explorer link, and the exact verification command. This file was referenced by package.json but
// missing from the provided repo.
const EXPLORERS: Record<string, string> = {
  celoSepolia: "https://celo-sepolia.blockscout.com/address/",
};

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Network: ${network.name}`);
  console.log(`Deployer: ${deployer.address}`);

  const PaySplitter = await ethers.getContractFactory("PaySplitter");
  const splitter = await PaySplitter.deploy();
  await splitter.waitForDeployment();
  const address = await splitter.getAddress();

  console.log(`\nPaySplitter deployed to: ${address}`);
  const explorer = EXPLORERS[network.name];
  if (explorer) console.log(`Explorer: ${explorer}${address}`);
  console.log(`\nVerify with:\n  npx hardhat verify --network ${network.name} ${address}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
