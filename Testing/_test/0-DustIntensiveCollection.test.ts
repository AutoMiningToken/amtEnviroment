import { ethers } from "hardhat";
import chai from "chai";
import {
  LiquidityAmt,
  Master,
  TestERC20,
  TestLiqPoolAndRouter,
} from "../typechain-types";
import { Amt } from "../typechain-types";
import { BurnVault } from "../typechain-types";
const { expect } = chai;

describe("Intensive dust collection", function () {
  let amt: Amt;
  let liqAmt: LiquidityAmt;
  let btcb: TestERC20;
  let burnVault: BurnVault;
  let master: Master;
  let testLiqPoolAndRouter: TestLiqPoolAndRouter;
  const zeroAddress = "0x0000000000000000000000000000000000000000";

  const amountOfRepetitions = 50;
  const amountOfWalletsTouse = 100;
  const maxPayment = ethers.parseEther("1"); //Max payment of 1 BTC
  this.beforeEach(async function () {
    const [owner, payerWallet, addr2, addr3, addr4, addr5] =
      await ethers.getSigners();

    const Btcb = await ethers.getContractFactory("TestERC20");
    btcb = (await Btcb.deploy(
      ethers.parseEther("21000000"),
      "Bitcoin",
      "BTCB"
    )) as TestERC20;
    await btcb.waitForDeployment();

    const Amt = await ethers.getContractFactory("Amt");
    amt = (await Amt.deploy()) as Amt;
    await amt.waitForDeployment();

    const LiqAmt = await ethers.getContractFactory("LiquidityAmt");
    liqAmt = (await LiqAmt.deploy()) as LiquidityAmt;
    await liqAmt.waitForDeployment();

    const BurnVault = await ethers.getContractFactory("BurnVault");
    burnVault = (await BurnVault.deploy(
      amt.getAddress(),
      btcb.getAddress()
    )) as BurnVault;

    const TestLiqPoolAndRouter = await ethers.getContractFactory(
      "TestLiqPoolAndRouter"
    );
    testLiqPoolAndRouter = (await TestLiqPoolAndRouter.deploy(
      100
    )) as TestLiqPoolAndRouter;
    const Master = await ethers.getContractFactory("Master");
    master = (await Master.deploy(
      amt.getAddress(),
      btcb.getAddress(),
      burnVault.getAddress(),
      liqAmt.getAddress(),
      payerWallet.getAddress(),
      testLiqPoolAndRouter.getAddress()
    )) as Master;
    await master.waitForDeployment();

    await amt.transferOwnership(master.getAddress());
    await liqAmt.transferOwnership(master.getAddress());
    await btcb
      .connect(payerWallet)
      .approve(master.getAddress(), ethers.parseEther("9999999999999999"));

    await master.mintMaster(owner.address, ethers.parseEther("100000000"));
  });

  function getRandomBigInt(min: bigint, max: bigint): bigint {
    const randomFloat = Math.random();
    const range = max - min;
    const scalingFactor =
      min + (range * BigInt(Math.floor(randomFloat * 1e6))) / BigInt(1e6);
    return scalingFactor;
  }
  it("Intensive dust collection", async function () {
    this.timeout(2000000);
    const wallets = await ethers.getSigners();
    const owner = wallets[0];
    const payerWallet = wallets[1];
    for (let i = 0; i < amountOfRepetitions; i++) {
      let toPay = getRandomBigInt(0n, maxPayment);

      //Distribution for specific payment
      for (let j = 2; j < amountOfWalletsTouse; j++) {
        const amountToTransfer = getRandomBigInt(
          0n,
          ethers.parseEther("1") // Use small values to try to generate dust
        );
        await amt.transfer(wallets[j].address, amountToTransfer);
      }

      //Execution of payment
      await btcb.transfer(payerWallet.address, toPay);
      await master.connect(payerWallet).payRent(toPay, 0);

      //Charge of payment
      await master.charge(i + 1);
      for (let j = 2; j < amountOfWalletsTouse; j++) {
        await master.connect(wallets[j]).charge(i + 1);

        //Return of amt for new distribution
        await amt
          .connect(wallets[j])
          .transfer(owner.address, await amt.balanceOf(wallets[j].address));
      }
      console.log(
        "Potential dust on " +
          i +
          " " +
          (await btcb.balanceOf(master.getAddress()))
      );
    }

    //After all distribution and payments will begin dust collection
    for (let i = 0; i < amountOfRepetitions; i++) {
      try {
        await master.handleDust(i + 1);
      } catch {}
    }
    //Final check if all dust were collected
    expect(await btcb.balanceOf(master.getAddress())).to.be.equal(0);
  });
});
