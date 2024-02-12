import { ethers } from "hardhat";
import chai from "chai";
import { Amt } from "../../typechain-types";
const { expect } = chai;

describe("Amt", function () {
  let amt: Amt;
  this.beforeEach(async function () {
    const Amt = await ethers.getContractFactory("Amt");
    amt = (await Amt.deploy()) as Amt;
    await amt.waitForDeployment();
  });

  it("UNIT: Owner must be able to mint amt", async function () {
    const [owner, addr1] = await ethers.getSigners();
    await expect(amt.mint(addr1.address, 1000)).to.changeTokenBalance(
      amt,
      addr1.address,
      1000
    );
    expect(await amt.totalSupply()).to.be.equal(1000);
  });

  it("UNIT: Owner must not be able to mint more than 100.000.000 amt", async function () {
    const [owner, addr1] = await ethers.getSigners();
    await expect(
      amt.mint(addr1.address, ethers.parseEther("100000000"))
    ).to.changeTokenBalance(amt, addr1.address, ethers.parseEther("100000000"));
    expect(await amt.totalSupply()).to.be.equal(ethers.parseEther("100000000"));
    await expect(amt.mint(owner.address, 1)).to.revertedWith(
      "Total AMT minted must not exceed 100.000.000 ATM"
    );
  });

  it("UNIT: Owner must be able to execute snapshot", async function () {
    const [owner, addr1] = await ethers.getSigners();
    await amt.snapshot();
    await amt.snapshot();
    await amt.snapshot();
    await amt.snapshot();
    expect(await amt.getCurrentSnapshotId()).to.be.equal(4);
  });
  it("MODIFIERS: Only owner must be able to mint and create snapshot", async function () {
    const [owner, addr1] = await ethers.getSigners();
    await expect(amt.connect(addr1).snapshot()).to.revertedWith(
      "Ownable: caller is not the owner"
    );
    await expect(
      amt.connect(addr1).mint(addr1.address, ethers.parseEther("1"))
    ).to.rejectedWith("Ownable: caller is not the owner");
  });
});
