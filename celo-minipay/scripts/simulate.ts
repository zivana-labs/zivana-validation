import { ethers } from "hardhat";

// Native-CELO simulation (the originally provided flow), fixed for ethers v6 which ships with
// @nomicfoundation/hardhat-toolbox@^3. See scripts/simulate-cusd.ts for the stablecoin (ERC-20)
// version required by VAL-006.
//
// Recipients: on a live testnet ethers.getSigners() returns only the funded deployer, so we take
// recipients from the RECIPIENTS env var (comma-separated) or generate two random addresses.
function resolveRecipients(): [string, string] {
  const fromEnv = (process.env.RECIPIENTS || "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
  if (fromEnv.length >= 2) return [fromEnv[0], fromEnv[1]];
  return [ethers.Wallet.createRandom().address, ethers.Wallet.createRandom().address];
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const [r1, r2] = resolveRecipients();
  console.log("Deployer:", deployer.address);

  // Deploy contract
  const PaySplitter = await ethers.getContractFactory("PaySplitter");
  const splitter = await PaySplitter.deploy();
  await splitter.waitForDeployment();
  const address = await splitter.getAddress();
  console.log("PaySplitter deployed to:", address);

  // Deposit native CELO into the splitter (small amount so testnet CELO lasts).
  const depositTx = await splitter.deposit({ value: ethers.parseEther("0.1") });
  await depositTx.wait();
  console.log("Deposited 0.1 CELO (tx:", depositTx.hash + ")");

  // Distribute to two recipients (40% / 60%).
  const amounts = [ethers.parseEther("0.04"), ethers.parseEther("0.06")];
  const distTx = await splitter.distribute([r1, r2], amounts);
  await distTx.wait();
  console.log("Distributed 0.04 CELO ->", r1);
  console.log("Distributed 0.06 CELO ->", r2);
  console.log("Distribute tx:", distTx.hash);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
