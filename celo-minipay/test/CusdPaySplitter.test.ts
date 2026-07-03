import { expect } from "chai";
import { ethers } from "hardhat";

// Offline verification of the stablecoin flow — no testnet, faucet, or funded wallet required.
// Runs on the in-process Hardhat network using MockERC20 as a stand-in for USDC/USDm/cUSD.
describe("CusdPaySplitter", () => {
  async function deployFixture() {
    const [owner, r1, r2, stranger] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("MockERC20");
    const token = await Token.deploy();
    await token.waitForDeployment();

    const Splitter = await ethers.getContractFactory("CusdPaySplitter");
    const splitter = await Splitter.deploy(await token.getAddress());
    await splitter.waitForDeployment();

    // Fund the owner with 100 tokens (18 decimals).
    const amount = ethers.parseUnits("100", 18);
    await token.mint(owner.address, amount);

    return { token, splitter, owner, r1, r2, stranger, amount };
  }

  it("reverts if constructed with the zero address", async () => {
    const Splitter = await ethers.getContractFactory("CusdPaySplitter");
    await expect(Splitter.deploy(ethers.ZeroAddress)).to.be.revertedWith("token is zero");
  });

  it("deposit pulls tokens via transferFrom and emits Deposited", async () => {
    const { token, splitter, owner, amount } = await deployFixture();
    await token.approve(await splitter.getAddress(), amount);

    await expect(splitter.deposit(amount))
      .to.emit(splitter, "Deposited")
      .withArgs(owner.address, amount);

    expect(await splitter.contractBalance()).to.equal(amount);
    expect(await splitter.deposited(owner.address)).to.equal(amount);
  });

  it("deposit reverts without prior approval", async () => {
    const { splitter, amount } = await deployFixture();
    await expect(splitter.deposit(amount)).to.be.reverted; // allowance missing
  });

  it("distributes 40/60 to recipients and emits Distributed", async () => {
    const { token, splitter, owner, r1, r2, amount } = await deployFixture();
    await token.approve(await splitter.getAddress(), amount);
    await splitter.deposit(amount);

    const a1 = ethers.parseUnits("40", 18);
    const a2 = ethers.parseUnits("60", 18);

    await expect(splitter.connect(owner).distribute([r1.address, r2.address], [a1, a2]))
      .to.emit(splitter, "Distributed")
      .withArgs(r1.address, a1)
      .and.to.emit(splitter, "Distributed")
      .withArgs(r2.address, a2);

    expect(await token.balanceOf(r1.address)).to.equal(a1);
    expect(await token.balanceOf(r2.address)).to.equal(a2);
    expect(await splitter.contractBalance()).to.equal(0n);
  });

  it("only owner can distribute", async () => {
    const { token, splitter, owner, r1, stranger, amount } = await deployFixture();
    await token.approve(await splitter.getAddress(), amount);
    await splitter.deposit(amount);

    await expect(
      splitter.connect(stranger).distribute([r1.address], [ethers.parseUnits("1", 18)]),
    ).to.be.revertedWith("only owner");
  });

  it("reverts on recipients/amounts length mismatch", async () => {
    const { token, splitter, r1, r2, amount } = await deployFixture();
    await token.approve(await splitter.getAddress(), amount);
    await splitter.deposit(amount);

    await expect(
      splitter.distribute([r1.address, r2.address], [ethers.parseUnits("1", 18)]),
    ).to.be.revertedWith("length mismatch");
  });

  it("reverts when distributing more than the held balance", async () => {
    const { token, splitter, r1, amount } = await deployFixture();
    await token.approve(await splitter.getAddress(), amount);
    await splitter.deposit(amount);

    await expect(
      splitter.distribute([r1.address], [ethers.parseUnits("101", 18)]),
    ).to.be.revertedWith("insufficient balance");
  });
});
