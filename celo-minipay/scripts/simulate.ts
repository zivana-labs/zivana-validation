import { ethers } from "hardhat";

async function main() {
  const [deployer, recipient1, recipient2] = await ethers.getSigners();

  // Deploy contract
  const PaySplitter = await ethers.getContractFactory("PaySplitter");
  const splitter = await PaySplitter.deploy();
  await splitter.deployed();
  console.log("Contract deployed to:", splitter.address);

  // Deposit some cUSD (on Celo testnet, cUSD is a predeployed token)
  // For simplicity, send native CELO (Alfajores) as the payment token.
  const depositTx = await splitter.deposit({ value: ethers.utils.parseEther("10") });
  await depositTx.wait();
  console.log("Deposited 10 CELO");

  // Distribute to recipients
  const recipients = [recipient1.address, recipient2.address];
  const amounts = [
    ethers.utils.parseEther("4"),
    ethers.utils.parseEther("6"),
  ];
  const distTx = await splitter.distribute(recipients, amounts);
  await distTx.wait();
  console.log("Distributed: 4 CELO to", recipient1.address, "6 CELO to", recipient2.address);
}

main();
