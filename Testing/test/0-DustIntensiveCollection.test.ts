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
import { BigNumber } from "ethers";
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
  const maxPayment = ethers.utils.parseEther("1"); //Max payment of 1 BTC
  this.beforeEach(async function () {
    const [owner, payerWallet, addr2, addr3, addr4, addr5] =
      await ethers.getSigners();

    const Btcb = await ethers.getContractFactory("TestERC20");
    btcb = (await Btcb.deploy(
      ethers.utils.parseEther("21000000")
    )) as TestERC20;
    await btcb.deployed();

    const Amt = await ethers.getContractFactory("Amt");
    amt = (await Amt.deploy()) as Amt;
    await amt.deployed();

    const LiqAmt = await ethers.getContractFactory("LiquidityAmt");
    liqAmt = (await LiqAmt.deploy()) as LiquidityAmt;
    await liqAmt.deployed();

    const BurnVault = await ethers.getContractFactory("BurnVault");
    burnVault = (await BurnVault.deploy(
      amt.address,
      btcb.address
    )) as BurnVault;

    const TestLiqPoolAndRouter = await ethers.getContractFactory(
      "TestLiqPoolAndRouter"
    );
    testLiqPoolAndRouter = (await TestLiqPoolAndRouter.deploy(
      100
    )) as TestLiqPoolAndRouter;
    const Master = await ethers.getContractFactory("Master");
    master = (await Master.deploy(
      amt.address,
      btcb.address,
      burnVault.address,
      liqAmt.address,
      payerWallet.address,
      testLiqPoolAndRouter.address
    )) as Master;
    await master.deployed();

    await amt.transferOwnership(master.address);
    await liqAmt.transferOwnership(master.address);
    await btcb
      .connect(payerWallet)
      .approve(master.address, ethers.utils.parseEther("9999999999999999"));

    await master.mintMaster(
      owner.address,
      ethers.utils.parseEther("100000000")
    );
  });

  function getRandomBigInt(min: BigNumber, max: BigNumber): BigNumber {
    const randomFloat = Math.random();
    const range = max.sub(min);
    const scalingFactor = min.add(
      range
        .mul(BigNumber.from(Math.floor(randomFloat * 1e6)))
        .div(BigNumber.from(1e6))
    );
    return scalingFactor;
  }
  it("Intensive dust collection", async function () {
    this.timeout(2000000)
    const wallets = await ethers.getSigners();
    const owner = wallets[0];
    const payerWallet = wallets[1];
    for (let i = 0; i < amountOfRepetitions; i++) {
      let toPay = getRandomBigInt(BigNumber.from(0), maxPayment);

      //Distribution for specific payment
      for (let j = 2; j < amountOfWalletsTouse; j++) {
        const amountToTransfer = getRandomBigInt(
          BigNumber.from(0),
          ethers.utils.parseEther("1") // Use small values to try to generate dust
        );
        await amt.transfer(wallets[j].address, amountToTransfer);
      }

      //Execution of payment
      await btcb.transfer(payerWallet.address, toPay);
      await master.connect(payerWallet).payRent(toPay, 0);

      
      //Charge of payment
      await master.charge(i+1)
      for (let j = 2; j < amountOfWalletsTouse; j++) {
        await master.connect(wallets[j]).charge(i+1);

        //Return of amt for new distribution
        await amt.connect(wallets[j]).transfer(owner.address,await amt.balanceOf(wallets[j].address))
      }
      console.log("Potential dust on " + i + " " + await btcb.balanceOf(master.address))
    }

    //After all distribution and payments will begin dust collection
    for(let i = 0; i<amountOfRepetitions;i++){
      try{
        await master.handleDust(i+1)
      }
      catch{
        
      }
    }
    //Final check if all dust were collected
    expect(await btcb.balanceOf(master.address)).to.be.equal(0)
  });
});
