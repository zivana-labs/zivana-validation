import { ethers, network } from "hardhat";

// End-to-end stablecoin (ERC-20) flow — the VAL-006 deliverable:
//   deploy (or reuse) CusdPaySplitter -> approve -> deposit -> distribute -> report balances.
//
// Env:
//   STABLE_TOKEN_ADDRESS  stablecoin ERC-20 (defaults to USDC on celoSepolia)
//   SPLITTER_ADDRESS      reuse an already-deployed splitter (optional; else a fresh one is deployed)
//   RECIPIENTS            comma-separated payout addresses (optional; else two random addresses)
//   DEPOSIT_AMOUNT        human units of stablecoin to deposit (default "1.0")

const TX = (name: string) => `https://celo-sepolia.blockscout.com/tx/${name}`;

const DEFAULT_TOKENS: Record<string, string> = {
  celoSepolia: "0x01C5C0122039549AD1493B8220cABEdD739BC44E", // USDC
};

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

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
  const tokenAddr = process.env.STABLE_TOKEN_ADDRESS || DEFAULT_TOKENS[network.name];
  if (!tokenAddr) throw new Error("Set STABLE_TOKEN_ADDRESS.");

  const token = new ethers.Contract(tokenAddr, ERC20_ABI, deployer);
  const decimals: bigint = BigInt(await token.decimals());
  const symbol: string = await token.symbol();
  console.log(`Network: ${network.name}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Stablecoin: ${symbol} @ ${tokenAddr} (${decimals} decimals)`);

  // Deploy or reuse the splitter.
  let splitter;
  if (process.env.SPLITTER_ADDRESS) {
    splitter = await ethers.getContractAt("CusdPaySplitter", process.env.SPLITTER_ADDRESS);
    console.log(`Reusing CusdPaySplitter: ${process.env.SPLITTER_ADDRESS}`);
  } else {
    const factory = await ethers.getContractFactory("CusdPaySplitter");
    splitter = await factory.deploy(tokenAddr);
    await splitter.waitForDeployment();
    console.log(`Deployed CusdPaySplitter: ${await splitter.getAddress()}`);
  }
  const splitterAddr = await splitter.getAddress();

  const parse = (v: string) => ethers.parseUnits(v, Number(decimals));
  const depositAmount = parse(process.env.DEPOSIT_AMOUNT || "1.0");

  const bal: bigint = await token.balanceOf(deployer.address);
  if (bal < depositAmount) {
    throw new Error(
      `Deployer holds ${ethers.formatUnits(bal, Number(decimals))} ${symbol} but needs ` +
        `${ethers.formatUnits(depositAmount, Number(decimals))}. Fund via faucet first.`,
    );
  }

  // Step 1: approve (the ERC-20 two-step — friction point documented in REPORT.md).
  const approveTx = await token.approve(splitterAddr, depositAmount);
  await approveTx.wait();
  console.log(`\n1) approve ${ethers.formatUnits(depositAmount, Number(decimals))} ${symbol}: ${TX(approveTx.hash)}`);

  // Step 2: deposit (pulls via transferFrom).
  const depositTx = await splitter.deposit(depositAmount);
  await depositTx.wait();
  console.log(`2) deposit: ${TX(depositTx.hash)}`);

  // Step 3: distribute 40% / 60% to two recipients.
  const [r1, r2] = resolveRecipients();
  const a1 = (depositAmount * 40n) / 100n;
  const a2 = depositAmount - a1;
  const distTx = await splitter.distribute([r1, r2], [a1, a2]);
  await distTx.wait();
  console.log(`3) distribute: ${TX(distTx.hash)}`);

  // Report.
  const [b1, b2, bc] = await Promise.all([
    token.balanceOf(r1),
    token.balanceOf(r2),
    token.balanceOf(splitterAddr),
  ]);
  console.log(`\nRecipient 1 ${r1}: ${ethers.formatUnits(b1, Number(decimals))} ${symbol}`);
  console.log(`Recipient 2 ${r2}: ${ethers.formatUnits(b2, Number(decimals))} ${symbol}`);
  console.log(`Splitter residual: ${ethers.formatUnits(bc, Number(decimals))} ${symbol}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
