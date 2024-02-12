import { ethers } from "hardhat";
import chai from "chai";
import {
  LiquidityAmt,
  Master,
  TestERC20,
  TestLiqPoolAndRouter,
} from "../../typechain-types";
import { Amt } from "../../typechain-types";
import { BurnVault } from "../../typechain-types";
const { expect } = chai;

describe("Master constructor fail requires", function () {
  let amt: Amt;
  let liqAmt: LiquidityAmt;
  let btcb: TestERC20;
  let burnVault: BurnVault;
  let master: Master;
  let testLiqPoolAndRouter: TestLiqPoolAndRouter;
  const zeroAddress = "0x0000000000000000000000000000000000000000";

  this.beforeEach(async function () {
    const [owner, payerWallet, addr2, addr3, addr4, addr5] =
      await ethers.getSigners();

    const Btcb = await ethers.getContractFactory("TestERC20");
    btcb = (await Btcb.deploy(1000000000, "Bitcoin", "BTCB")) as TestERC20;
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
      payerWallet.address,
      testLiqPoolAndRouter.getAddress()
    )) as Master;
    await master.waitForDeployment();
  });

  it("UNIT: all deployment fails as zero address cases", async function () {
    const [owner, payerWallet] = await ethers.getSigners();
    const Master = await ethers.getContractFactory("Master");

    await expect(
      Master.deploy(
        zeroAddress,
        btcb.getAddress(),
        burnVault.getAddress(),
        liqAmt.getAddress(),
        payerWallet.address,
        testLiqPoolAndRouter.getAddress()
      )
    ).to.revertedWith("Amt must not be the zero address");

    await expect(
      Master.deploy(
        amt.getAddress(),
        btcb.getAddress(),
        zeroAddress,
        liqAmt.getAddress(),
        payerWallet.address,
        testLiqPoolAndRouter.getAddress()
      )
    ).to.revertedWith("Vault must not be the zero address");

    await expect(
      Master.deploy(
        amt.getAddress(),
        btcb.getAddress(),
        burnVault.getAddress(),
        zeroAddress,
        payerWallet.address,
        testLiqPoolAndRouter.getAddress()
      )
    ).to.revertedWith("LiqToken must not be the zero address");

    await expect(
      Master.deploy(
        amt.getAddress(),
        btcb.getAddress(),
        burnVault.getAddress(),
        liqAmt.getAddress(),
        zeroAddress,
        testLiqPoolAndRouter.getAddress()
      )
    ).to.revertedWith("PayerWallet must not be the zero address");
  });
});
