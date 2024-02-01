import { ethers } from "hardhat";
import chai from "chai";
import { Amt, LiquidityAmt } from "../../typechain-types";
const { expect } = chai;

describe("LiqAmt", function () {
  let liqAmt: LiquidityAmt;
  this.beforeEach(async function () {
    const LiqAmt = await ethers.getContractFactory("LiquidityAmt");
    liqAmt = (await LiqAmt.deploy()) as Amt;
    await liqAmt.deployed();
  });

  it("UNIT: Owner must be able to mint amt", async function () {
    const [owner, addr1] = await ethers.getSigners();
    await expect(liqAmt.mint(addr1.address, 1000)).to.changeTokenBalance(
      liqAmt,
      addr1.address,
      1000
    );
    expect(await liqAmt.totalSupply()).to.be.equal(1000);
  });

  it("UNIT: Owner must be able to execute snapshot", async function () {
    const [owner, addr1] = await ethers.getSigners();
    await liqAmt.snapshot();
    await liqAmt.snapshot();
    await liqAmt.snapshot();
    await liqAmt.snapshot();
    expect(await liqAmt.getCurrentSnapshotId()).to.be.equal(4);
  });
});
