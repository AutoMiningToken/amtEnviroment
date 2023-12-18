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
import { LiqLocker } from "../../typechain-types";
const { expect } = chai;

describe("Master", function () {
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
  });

  it("UNIT: Owner must be able to extend approve", async function () {
    await master.extendApprove(100);
    expect(
      await amt.allowance(master.address, testLiqPoolAndRouter.address)
    ).to.be.equal(100);
  });

  it("UNIT: Owner must be able to set payer wallet", async function () {
    const [owner, payerWallet, newPayerWallet] = await ethers.getSigners();
    await master.setPayerWallet(newPayerWallet.address);
    expect(await master.payerWallet()).to.be.equal(newPayerWallet.address);
  });

  it("UNIT: Owner must be able to set payer wallet", async function () {
    const [owner, payerWallet, newPayerWallet] = await ethers.getSigners();
    await master.setPayerWallet(newPayerWallet.address);
    expect(await master.payerWallet()).to.be.equal(newPayerWallet.address);
  });

  it("UNIT: Payer wallet must not be set as zero address", async function () {
    await expect(master.setPayerWallet(zeroAddress)).to.revertedWith(
      "Payer wallet must not be the zero address"
    );
  });

  it("UNIT: Payer wallet must be able to execute pay rent", async function () {
    const [owner, payerWallet, notPayerWallet] = await ethers.getSigners();
    await master.mintMaster(owner.address, 10000);
    await btcb.transfer(payerWallet.address, 1000);
    await expect(
      master.connect(payerWallet).payRent(500, 0)
    ).to.changeTokenBalance(btcb, master.address, 500);
  });

  it("UNIT: Payer wallet must not be able to execute pay rent without btcb", async function () {
    const [owner, payerWallet, notPayerWallet] = await ethers.getSigners();
    await master.mintMaster(owner.address, 10000);
    await btcb.transfer(payerWallet.address, 100);
    await expect(master.connect(payerWallet).payRent(500, 0)).to.revertedWith(
      "Insuficient ammount of BTCB"
    );
  });

  it("UNIT: Payer wallet must not be able to execute pay rent for less or equal than 100 btcb", async function () {
    const [owner, payerWallet, notPayerWallet] = await ethers.getSigners();
    await master.mintMaster(owner.address, 10000);
    await btcb.transfer(payerWallet.address, 1000);
    await expect(master.connect(payerWallet).payRent(100, 0)).to.revertedWith(
      "amount too small"
    );
  });
  it("UNIT: Must not be able to mint to zero address", async function () {
    await expect(master.mintMaster(zeroAddress, 10)).to.revertedWith(
      "Can not mint to zero address"
    );
  });

  it("UNIT: Payer wallet must not be able to pay rent with vault participation higher than 100", async function () {
    const [owner, payerWallet, notPayerWallet] = await ethers.getSigners();
    await master.mintMaster(owner.address, 10000);
    await btcb.transfer(payerWallet.address, 1000);
    await expect(master.connect(payerWallet).payRent(500, 101)).to.revertedWith(
      "vaultParticipation cannot be higher than 100"
    );
  });

  it("UNIT: Not Payer wallet must not be able to pay rent", async function () {
    const [owner, payerWallet, notPayerWallet] = await ethers.getSigners();
    await master.mintMaster(owner.address, 10000);
    await btcb.transfer(notPayerWallet.address, 1000);
    await expect(
      master.connect(notPayerWallet).payRent(500, 0)
    ).to.revertedWith("Only PayerWallet can make the payments");
  });

  it("UNIT: Token holderes must be able to charge dividends", async function () {
    const [owner, payerWallet, tokenHolder1, tokenHolder2] =
      await ethers.getSigners();
    await master.mintMaster(tokenHolder1.address, 10000);
    await master.mintMaster(tokenHolder2.address, 20000);
    await btcb.transfer(payerWallet.address, 1000);
    await expect(
      master.connect(payerWallet).payRent(1000, 0)
    ).to.changeTokenBalance(btcb, master.address, 1000);
    await expect(master.connect(tokenHolder1).charge(1)).to.changeTokenBalances(
      btcb,
      [master.address, tokenHolder1.address],
      [-333, 333]
    );
    await expect(master.connect(tokenHolder2).charge(1)).to.changeTokenBalances(
      btcb,
      [master.address, tokenHolder2.address],
      [-666, 666]
    );
  });

  it("UNIT: Token holderes must not be able to charge dividends already charged", async function () {
    const [owner, payerWallet, tokenHolder1, tokenHolder2] =
      await ethers.getSigners();
    await master.mintMaster(tokenHolder1.address, 10000);
    await master.mintMaster(tokenHolder2.address, 20000);
    await btcb.transfer(payerWallet.address, 1000);
    await expect(
      master.connect(payerWallet).payRent(1000, 0)
    ).to.changeTokenBalance(btcb, master.address, 1000);
    await expect(master.connect(tokenHolder1).charge(1)).to.changeTokenBalances(
      btcb,
      [master.address, tokenHolder1.address],
      [-333, 333]
    );
    await expect(master.connect(tokenHolder2).charge(1)).to.changeTokenBalances(
      btcb,
      [master.address, tokenHolder2.address],
      [-666, 666]
    );
    await expect(master.connect(tokenHolder1).charge(1)).to.revertedWith(
      "Already charged"
    );
    await expect(master.connect(tokenHolder2).charge(1)).to.revertedWith(
      "Already charged"
    );
  });

  it("UNIT: Token holderes must not be able to charge if there is nothing to charge", async function () {
    const [owner, payerWallet, tokenHolder1, tokenHolder2, tokenHolder3] =
      await ethers.getSigners();
    await master.mintMaster(tokenHolder1.address, 10000);
    await master.mintMaster(tokenHolder2.address, 20000);
    await btcb.transfer(payerWallet.address, 1000);
    await expect(
      master.connect(payerWallet).payRent(1000, 0)
    ).to.changeTokenBalance(btcb, master.address, 1000);
    await expect(master.connect(tokenHolder1).charge(1)).to.changeTokenBalances(
      btcb,
      [master.address, tokenHolder1.address],
      [-333, 333]
    );
    await expect(master.connect(tokenHolder2).charge(1)).to.changeTokenBalances(
      btcb,
      [master.address, tokenHolder2.address],
      [-666, 666]
    );
    await master.mintMaster(tokenHolder3.address, 20000);
    await expect(master.connect(tokenHolder3).charge(1)).to.revertedWith(
      "Nothing to charge"
    );
  });

  it("UNIT: Token holderes must be able to chargeFromTo diferent snapshots", async function () {
    const [owner, payerWallet, tokenHolder1, tokenHolder2, tokenHolder3] =
      await ethers.getSigners();
    await master.mintMaster(tokenHolder1.address, 10000);
    await master.mintMaster(tokenHolder2.address, 20000);
    await btcb.transfer(payerWallet.address, 10000);
    await expect(
      master.connect(payerWallet).payRent(1000, 0)
    ).to.changeTokenBalance(btcb, master.address, 1000);
    await expect(
      master.connect(payerWallet).payRent(1000, 0)
    ).to.changeTokenBalance(btcb, master.address, 1000);
    await expect(
      master.connect(payerWallet).payRent(1000, 0)
    ).to.changeTokenBalance(btcb, master.address, 1000);
    await expect(
      master.connect(tokenHolder1).chargeFromTo(1, 3)
    ).to.changeTokenBalances(
      btcb,
      [master.address, tokenHolder1.address],
      [-999, 999]
    );
    await expect(
      master.connect(tokenHolder2).chargeFromTo(2, 3)
    ).to.changeTokenBalances(
      btcb,
      [master.address, tokenHolder2.address],
      [-1332, 1332]
    );
    await expect(master.connect(tokenHolder2).charge(1)).to.changeTokenBalances(
      btcb,
      [master.address, tokenHolder2.address],
      [-666, 666]
    );
  });

  it("UNIT: Token holderes must not be able to chargeFromTo diferent snapshots with invalid range", async function () {
    const [owner, payerWallet, tokenHolder1, tokenHolder2, tokenHolder3] =
      await ethers.getSigners();
    await master.mintMaster(tokenHolder1.address, 10000);
    await master.mintMaster(tokenHolder2.address, 20000);
    await btcb.transfer(payerWallet.address, 10000);
    await expect(
      master.connect(payerWallet).payRent(1000, 0)
    ).to.changeTokenBalance(btcb, master.address, 1000);
    await expect(
      master.connect(payerWallet).payRent(1000, 0)
    ).to.changeTokenBalance(btcb, master.address, 1000);
    await expect(
      master.connect(payerWallet).payRent(1000, 0)
    ).to.changeTokenBalance(btcb, master.address, 1000);
    await expect(
      master.connect(tokenHolder1).chargeFromTo(1, 4)
    ).to.revertedWith("Select a valid snapshot range");
    await expect(
      master.connect(tokenHolder2).chargeFromTo(2, 4)
    ).to.revertedWith("Select a valid snapshot range");
    await expect(master.connect(tokenHolder2).charge(1)).to.changeTokenBalances(
      btcb,
      [master.address, tokenHolder2.address],
      [-666, 666]
    );
  });

  it("UNIT: Token holderes must not be able to chargeFromTo diferent snapshots with nothing to charge", async function () {
    const [owner, payerWallet, tokenHolder1, tokenHolder2, tokenHolder3] =
      await ethers.getSigners();
    await master.mintMaster(tokenHolder1.address, 10000);
    await master.mintMaster(tokenHolder2.address, 20000);
    await btcb.transfer(payerWallet.address, 10000);
    await expect(
      master.connect(payerWallet).payRent(1000, 0)
    ).to.changeTokenBalance(btcb, master.address, 1000);
    await expect(
      master.connect(payerWallet).payRent(1000, 0)
    ).to.changeTokenBalance(btcb, master.address, 1000);
    await expect(
      master.connect(payerWallet).payRent(1000, 0)
    ).to.changeTokenBalance(btcb, master.address, 1000);
    await master.mintMaster(tokenHolder3.address, 20000);
    await expect(
      master.connect(tokenHolder3).chargeFromTo(1, 3)
    ).to.revertedWith("There was nothing to transfer");
  });

  it("UNIT: Token holders must me able to add liquidity via master", async function () {
    const [owner, payerWallet, tokenHolder1, tokenHolder2, tokenHolder3] =
      await ethers.getSigners();
    await master.mintMaster(tokenHolder1.address, 10000);
    await master.mintMaster(tokenHolder2.address, 20000);
    await btcb.transfer(tokenHolder1.address, 1000);
    await btcb.transfer(tokenHolder2.address, 1000);

    amt
      .connect(tokenHolder1)
      .approve(master.address, ethers.utils.parseEther("1000000"));
    btcb
      .connect(tokenHolder1)
      .approve(master.address, ethers.utils.parseEther("1000000"));
    amt
      .connect(tokenHolder2)
      .approve(master.address, ethers.utils.parseEther("1000000"));
    btcb
      .connect(tokenHolder2)
      .approve(master.address, ethers.utils.parseEther("1000000"));

    await expect(master.connect(tokenHolder1).addLiquidity(10000, 1000))
      .to.changeTokenBalances(
        amt,
        [tokenHolder1.address, testLiqPoolAndRouter.address],
        [-10000, 10000]
      )
      .and.to.changeTokenBalances(
        btcb,
        [tokenHolder1.address, testLiqPoolAndRouter.address],
        [-1000, 1000]
      )
      .and.to.changeTokenBalance(liqAmt, tokenHolder1.address, 100);

    await expect(master.connect(tokenHolder2).addLiquidity(5000, 500))
      .to.changeTokenBalances(
        amt,
        [tokenHolder2.address, testLiqPoolAndRouter.address],
        [-5000, 5000]
      )
      .and.to.changeTokenBalances(
        btcb,
        [tokenHolder2.address, testLiqPoolAndRouter.address],
        [-500, 500]
      )
      .and.to.changeTokenBalance(liqAmt, tokenHolder2.address, 50);
  });

  it("UNIT: addLiq require Not enough AMT", async function () {
    const [owner, payerWallet, tokenHolder1, tokenHolder2, tokenHolder3] =
      await ethers.getSigners();
    await master.mintMaster(tokenHolder1.address, 10000);
    await master.mintMaster(tokenHolder2.address, 20000);
    await btcb.transfer(tokenHolder1.address, 1000);
    await btcb.transfer(tokenHolder2.address, 1000);

    amt
      .connect(tokenHolder1)
      .approve(master.address, ethers.utils.parseEther("1000000"));
    btcb
      .connect(tokenHolder1)
      .approve(master.address, ethers.utils.parseEther("1000000"));
    amt
      .connect(tokenHolder2)
      .approve(master.address, ethers.utils.parseEther("1000000"));
    btcb
      .connect(tokenHolder2)
      .approve(master.address, ethers.utils.parseEther("1000000"));

    await expect(
      master.connect(tokenHolder1).addLiquidity(10001, 500)
    ).to.revertedWith("Not enough AMT");
  });

  it("UNIT: addLiq require Not enough BBTC", async function () {
    const [owner, payerWallet, tokenHolder1, tokenHolder2, tokenHolder3] =
      await ethers.getSigners();
    await master.mintMaster(tokenHolder1.address, 10000);
    await master.mintMaster(tokenHolder2.address, 20000);
    await btcb.transfer(tokenHolder1.address, 1000);
    await btcb.transfer(tokenHolder2.address, 1000);

    amt
      .connect(tokenHolder1)
      .approve(master.address, ethers.utils.parseEther("1000000"));
    btcb
      .connect(tokenHolder1)
      .approve(master.address, ethers.utils.parseEther("1000000"));
    amt
      .connect(tokenHolder2)
      .approve(master.address, ethers.utils.parseEther("1000000"));
    btcb
      .connect(tokenHolder2)
      .approve(master.address, ethers.utils.parseEther("1000000"));

    await expect(
      master.connect(tokenHolder1).addLiquidity(10000, 5001)
    ).to.revertedWith("Not enough BBTC");
  });

  it("UNIT: addLiq require AMT amount is too small", async function () {
    const [owner, payerWallet, tokenHolder1, tokenHolder2, tokenHolder3] =
      await ethers.getSigners();
    await master.mintMaster(tokenHolder1.address, 10000);
    await master.mintMaster(tokenHolder2.address, 20000);
    await btcb.transfer(tokenHolder1.address, 1000);
    await btcb.transfer(tokenHolder2.address, 1000);

    amt
      .connect(tokenHolder1)
      .approve(master.address, ethers.utils.parseEther("1000000"));
    btcb
      .connect(tokenHolder1)
      .approve(master.address, ethers.utils.parseEther("1000000"));
    amt
      .connect(tokenHolder2)
      .approve(master.address, ethers.utils.parseEther("1000000"));
    btcb
      .connect(tokenHolder2)
      .approve(master.address, ethers.utils.parseEther("1000000"));

    await expect(
      master.connect(tokenHolder1).addLiquidity(0, 50)
    ).to.revertedWith("AMT amount is too small");
  });

  it("UNIT: addLiq require BTCB amount is too small", async function () {
    const [owner, payerWallet, tokenHolder1, tokenHolder2, tokenHolder3] =
      await ethers.getSigners();
    await master.mintMaster(tokenHolder1.address, 10000);
    await master.mintMaster(tokenHolder2.address, 20000);
    await btcb.transfer(tokenHolder1.address, 1000);
    await btcb.transfer(tokenHolder2.address, 1000);

    amt
      .connect(tokenHolder1)
      .approve(master.address, ethers.utils.parseEther("1000000"));
    btcb
      .connect(tokenHolder1)
      .approve(master.address, ethers.utils.parseEther("1000000"));
    amt
      .connect(tokenHolder2)
      .approve(master.address, ethers.utils.parseEther("1000000"));
    btcb
      .connect(tokenHolder2)
      .approve(master.address, ethers.utils.parseEther("1000000"));

    await expect(
      master.connect(tokenHolder1).addLiquidity(1000, 0)
    ).to.revertedWith("BTCB amount is too small");
  });

  it("UNIT: Token holders must me able to remove liquidity via master", async function () {
    const [owner, payerWallet, tokenHolder1, tokenHolder2, tokenHolder3] =
      await ethers.getSigners();
    await master.mintMaster(tokenHolder1.address, 10000);
    await master.mintMaster(tokenHolder2.address, 20000);
    await btcb.transfer(tokenHolder1.address, 1000);
    await btcb.transfer(tokenHolder2.address, 1000);

    amt
      .connect(tokenHolder1)
      .approve(master.address, ethers.utils.parseEther("1000000"));
    btcb
      .connect(tokenHolder1)
      .approve(master.address, ethers.utils.parseEther("1000000"));
    amt
      .connect(tokenHolder2)
      .approve(master.address, ethers.utils.parseEther("1000000"));
    btcb
      .connect(tokenHolder2)
      .approve(master.address, ethers.utils.parseEther("1000000"));

    await expect(master.connect(tokenHolder1).addLiquidity(10000, 1000))
      .to.changeTokenBalances(
        amt,
        [tokenHolder1.address, testLiqPoolAndRouter.address],
        [-10000, 10000]
      )
      .and.to.changeTokenBalances(
        btcb,
        [tokenHolder1.address, testLiqPoolAndRouter.address],
        [-1000, 1000]
      )
      .and.to.changeTokenBalance(liqAmt, tokenHolder1.address, 100);

    await expect(master.connect(tokenHolder2).addLiquidity(5000, 500))
      .to.changeTokenBalances(
        amt,
        [tokenHolder2.address, testLiqPoolAndRouter.address],
        [-5000, 5000]
      )
      .and.to.changeTokenBalances(
        btcb,
        [tokenHolder2.address, testLiqPoolAndRouter.address],
        [-500, 500]
      )
      .and.to.changeTokenBalance(liqAmt, tokenHolder2.address, 50);

    await liqAmt
      .connect(tokenHolder1)
      .approve(master.address, ethers.utils.parseEther("100000"));

    await liqAmt
      .connect(tokenHolder2)
      .approve(master.address, ethers.utils.parseEther("100000"));
    let lastTotalSupplyLiqAmt = await liqAmt.totalSupply();
    await expect(master.connect(tokenHolder1).removeLiquidity(100))
      .to.changeTokenBalances(
        amt,
        [master.address, tokenHolder1.address],
        [-10000, 10000]
      )
      .and.to.changeTokenBalances(
        btcb,
        [master.address, tokenHolder1.address],
        [-1000, 1000]
      )
      .and.to.changeTokenBalance(liqAmt, tokenHolder1.address, -100);
    expect(await liqAmt.totalSupply()).to.be.equal(
      lastTotalSupplyLiqAmt.sub(100)
    );

    lastTotalSupplyLiqAmt = await liqAmt.totalSupply();
    await expect(master.connect(tokenHolder2).removeLiquidity(50))
      .to.changeTokenBalances(
        amt,
        [master.address, tokenHolder2.address],
        [-5000, 5000]
      )
      .and.to.changeTokenBalances(
        btcb,
        [master.address, tokenHolder2.address],
        [-500, 500]
      )
      .and.to.changeTokenBalance(liqAmt, tokenHolder2.address, -50);
    expect(await liqAmt.totalSupply()).to.be.equal(
      lastTotalSupplyLiqAmt.sub(50)
    );
  });

  it("UNIT: Token holders must not be able to remove liquidity via master without enougth liqAmt", async function () {
    const [owner, payerWallet, tokenHolder1, tokenHolder2, tokenHolder3] =
      await ethers.getSigners();
    await master.mintMaster(tokenHolder1.address, 10000);
    await master.mintMaster(tokenHolder2.address, 20000);
    await btcb.transfer(tokenHolder1.address, 1000);
    await btcb.transfer(tokenHolder2.address, 1000);

    amt
      .connect(tokenHolder1)
      .approve(master.address, ethers.utils.parseEther("1000000"));
    btcb
      .connect(tokenHolder1)
      .approve(master.address, ethers.utils.parseEther("1000000"));
    amt
      .connect(tokenHolder2)
      .approve(master.address, ethers.utils.parseEther("1000000"));
    btcb
      .connect(tokenHolder2)
      .approve(master.address, ethers.utils.parseEther("1000000"));

    await expect(master.connect(tokenHolder1).addLiquidity(10000, 1000))
      .to.changeTokenBalances(
        amt,
        [tokenHolder1.address, testLiqPoolAndRouter.address],
        [-10000, 10000]
      )
      .and.to.changeTokenBalances(
        btcb,
        [tokenHolder1.address, testLiqPoolAndRouter.address],
        [-1000, 1000]
      )
      .and.to.changeTokenBalance(liqAmt, tokenHolder1.address, 100);

    await expect(master.connect(tokenHolder2).addLiquidity(5000, 500))
      .to.changeTokenBalances(
        amt,
        [tokenHolder2.address, testLiqPoolAndRouter.address],
        [-5000, 5000]
      )
      .and.to.changeTokenBalances(
        btcb,
        [tokenHolder2.address, testLiqPoolAndRouter.address],
        [-500, 500]
      )
      .and.to.changeTokenBalance(liqAmt, tokenHolder2.address, 50);

    await liqAmt
      .connect(tokenHolder1)
      .approve(master.address, ethers.utils.parseEther("100000"));

    await liqAmt
      .connect(tokenHolder2)
      .approve(master.address, ethers.utils.parseEther("100000"));

    await expect(
      master.connect(tokenHolder1).removeLiquidity(101)
    ).to.revertedWith("Not enough liqAMT");
  });

  it("UNIT: Liq providers must be able to liqCharge dividends", async function () {
    const [owner, payerWallet, tokenHolder1, tokenHolder2, tokenHolder3] =
      await ethers.getSigners();
    await master.mintMaster(tokenHolder1.address, 10000);
    await master.mintMaster(tokenHolder2.address, 20000);
    await btcb.transfer(tokenHolder1.address, 1000);
    await btcb.transfer(tokenHolder2.address, 1000);

    amt
      .connect(tokenHolder1)
      .approve(master.address, ethers.utils.parseEther("1000000"));
    btcb
      .connect(tokenHolder1)
      .approve(master.address, ethers.utils.parseEther("1000000"));
    amt
      .connect(tokenHolder2)
      .approve(master.address, ethers.utils.parseEther("1000000"));
    btcb
      .connect(tokenHolder2)
      .approve(master.address, ethers.utils.parseEther("1000000"));

    await expect(master.connect(tokenHolder1).addLiquidity(10000, 1000))
      .to.changeTokenBalances(
        amt,
        [tokenHolder1.address, testLiqPoolAndRouter.address],
        [-10000, 10000]
      )
      .and.to.changeTokenBalances(
        btcb,
        [tokenHolder1.address, testLiqPoolAndRouter.address],
        [-1000, 1000]
      )
      .and.to.changeTokenBalance(liqAmt, tokenHolder1.address, 100);

    await expect(master.connect(tokenHolder2).addLiquidity(5000, 500))
      .to.changeTokenBalances(
        amt,
        [tokenHolder2.address, testLiqPoolAndRouter.address],
        [-5000, 5000]
      )
      .and.to.changeTokenBalances(
        btcb,
        [tokenHolder2.address, testLiqPoolAndRouter.address],
        [-500, 500]
      )
      .and.to.changeTokenBalance(liqAmt, tokenHolder2.address, 50);

    await btcb.transfer(payerWallet.address, 10000);
    await master.connect(payerWallet).payRent(1000, 0);
    await expect(
      master.connect(tokenHolder1).liqCharge(1)
    ).to.changeTokenBalances(
      btcb,
      [master.address, tokenHolder1.address],
      [-333, 333]
    );
    await expect(
      master.connect(tokenHolder2).liqCharge(1)
    ).to.changeTokenBalances(
      btcb,
      [master.address, tokenHolder2.address],
      [-166, 166]
    );
  });

  it("UNIT: Liq providers must not be able to liqCharge dividends already charged or with nothing to withdraw", async function () {
    const [owner, payerWallet, tokenHolder1, tokenHolder2, tokenHolder3] =
      await ethers.getSigners();
    await master.mintMaster(tokenHolder1.address, 10000);
    await master.mintMaster(tokenHolder2.address, 20000);
    await btcb.transfer(tokenHolder1.address, 1000);
    await btcb.transfer(tokenHolder2.address, 1000);

    amt
      .connect(tokenHolder1)
      .approve(master.address, ethers.utils.parseEther("1000000"));
    btcb
      .connect(tokenHolder1)
      .approve(master.address, ethers.utils.parseEther("1000000"));
    amt
      .connect(tokenHolder2)
      .approve(master.address, ethers.utils.parseEther("1000000"));
    btcb
      .connect(tokenHolder2)
      .approve(master.address, ethers.utils.parseEther("1000000"));

    await expect(master.connect(tokenHolder1).addLiquidity(10000, 1000))
      .to.changeTokenBalances(
        amt,
        [tokenHolder1.address, testLiqPoolAndRouter.address],
        [-10000, 10000]
      )
      .and.to.changeTokenBalances(
        btcb,
        [tokenHolder1.address, testLiqPoolAndRouter.address],
        [-1000, 1000]
      )
      .and.to.changeTokenBalance(liqAmt, tokenHolder1.address, 100);

    await expect(master.connect(tokenHolder2).addLiquidity(5000, 500))
      .to.changeTokenBalances(
        amt,
        [tokenHolder2.address, testLiqPoolAndRouter.address],
        [-5000, 5000]
      )
      .and.to.changeTokenBalances(
        btcb,
        [tokenHolder2.address, testLiqPoolAndRouter.address],
        [-500, 500]
      )
      .and.to.changeTokenBalance(liqAmt, tokenHolder2.address, 50);

    await btcb.transfer(payerWallet.address, 10000);
    await master.connect(payerWallet).payRent(1000, 0);
    await expect(
      master.connect(tokenHolder1).liqCharge(1)
    ).to.changeTokenBalances(
      btcb,
      [master.address, tokenHolder1.address],
      [-333, 333]
    );
    await expect(
      master.connect(tokenHolder2).liqCharge(1)
    ).to.changeTokenBalances(
      btcb,
      [master.address, tokenHolder2.address],
      [-166, 166]
    );
    await expect(master.connect(tokenHolder1).liqCharge(1)).to.revertedWith(
      "Already charged"
    );
    await expect(master.connect(tokenHolder2).liqCharge(1)).to.revertedWith(
      "Already charged"
    );

    await expect(master.connect(tokenHolder3).liqCharge(1)).to.revertedWith(
      "Nothing to charge"
    );
  });

  it("UNIT: Token holderes must be able to liqChargeFromTo diferent snapshots", async function () {
    const [owner, payerWallet, tokenHolder1, tokenHolder2, tokenHolder3] =
      await ethers.getSigners();
    await master.mintMaster(tokenHolder1.address, 10000);
    await master.mintMaster(tokenHolder2.address, 20000);

    await btcb.transfer(tokenHolder1.address, 1000);
    await btcb.transfer(tokenHolder2.address, 2000);

    amt
      .connect(tokenHolder1)
      .approve(master.address, ethers.utils.parseEther("1000000"));
    btcb
      .connect(tokenHolder1)
      .approve(master.address, ethers.utils.parseEther("1000000"));
    amt
      .connect(tokenHolder2)
      .approve(master.address, ethers.utils.parseEther("1000000"));
    btcb
      .connect(tokenHolder2)
      .approve(master.address, ethers.utils.parseEther("1000000"));

    await btcb.transfer(payerWallet.address, 10000);

    await expect(master.connect(tokenHolder1).addLiquidity(10000, 1000))
      .to.changeTokenBalances(
        amt,
        [tokenHolder1.address, testLiqPoolAndRouter.address],
        [-10000, 10000]
      )
      .and.to.changeTokenBalances(
        btcb,
        [tokenHolder1.address, testLiqPoolAndRouter.address],
        [-1000, 1000]
      )
      .and.to.changeTokenBalance(liqAmt, tokenHolder1.address, 100);

    await expect(master.connect(tokenHolder2).addLiquidity(20000, 2000))
      .to.changeTokenBalances(
        amt,
        [tokenHolder2.address, testLiqPoolAndRouter.address],
        [-20000, 20000]
      )
      .and.to.changeTokenBalances(
        btcb,
        [tokenHolder2.address, testLiqPoolAndRouter.address],
        [-2000, 2000]
      )
      .and.to.changeTokenBalance(liqAmt, tokenHolder2.address, 200);

    await expect(
      master.connect(payerWallet).payRent(1000, 0)
    ).to.changeTokenBalance(btcb, master.address, 1000);
    await expect(
      master.connect(payerWallet).payRent(1000, 0)
    ).to.changeTokenBalance(btcb, master.address, 1000);
    await expect(
      master.connect(payerWallet).payRent(1000, 0)
    ).to.changeTokenBalance(btcb, master.address, 1000);

    await expect(
      master.connect(tokenHolder1).liqChargeFromTo(1, 3)
    ).to.changeTokenBalances(
      btcb,
      [master.address, tokenHolder1.address],
      [-999, 999]
    );
    await expect(
      master.connect(tokenHolder2).liqChargeFromTo(2, 3)
    ).to.changeTokenBalances(
      btcb,
      [master.address, tokenHolder2.address],
      [-1332, 1332]
    );
    await expect(
      master.connect(tokenHolder2).liqCharge(1)
    ).to.changeTokenBalances(
      btcb,
      [master.address, tokenHolder2.address],
      [-666, 666]
    );
  });

  it("UNIT: Token holderes must not be able to chargeFromTo diferent snapshots with invalid range", async function () {
    const [owner, payerWallet, tokenHolder1, tokenHolder2, tokenHolder3] =
      await ethers.getSigners();
    await master.mintMaster(tokenHolder1.address, 10000);
    await master.mintMaster(tokenHolder2.address, 20000);

    await btcb.transfer(tokenHolder1.address, 1000);
    await btcb.transfer(tokenHolder2.address, 2000);

    amt
      .connect(tokenHolder1)
      .approve(master.address, ethers.utils.parseEther("1000000"));
    btcb
      .connect(tokenHolder1)
      .approve(master.address, ethers.utils.parseEther("1000000"));
    amt
      .connect(tokenHolder2)
      .approve(master.address, ethers.utils.parseEther("1000000"));
    btcb
      .connect(tokenHolder2)
      .approve(master.address, ethers.utils.parseEther("1000000"));

    await btcb.transfer(payerWallet.address, 10000);

    await expect(master.connect(tokenHolder1).addLiquidity(10000, 1000))
      .to.changeTokenBalances(
        amt,
        [tokenHolder1.address, testLiqPoolAndRouter.address],
        [-10000, 10000]
      )
      .and.to.changeTokenBalances(
        btcb,
        [tokenHolder1.address, testLiqPoolAndRouter.address],
        [-1000, 1000]
      )
      .and.to.changeTokenBalance(liqAmt, tokenHolder1.address, 100);

    await expect(master.connect(tokenHolder2).addLiquidity(20000, 2000))
      .to.changeTokenBalances(
        amt,
        [tokenHolder2.address, testLiqPoolAndRouter.address],
        [-20000, 20000]
      )
      .and.to.changeTokenBalances(
        btcb,
        [tokenHolder2.address, testLiqPoolAndRouter.address],
        [-2000, 2000]
      )
      .and.to.changeTokenBalance(liqAmt, tokenHolder2.address, 200);

    await expect(
      master.connect(payerWallet).payRent(1000, 0)
    ).to.changeTokenBalance(btcb, master.address, 1000);
    await expect(
      master.connect(payerWallet).payRent(1000, 0)
    ).to.changeTokenBalance(btcb, master.address, 1000);
    await expect(
      master.connect(payerWallet).payRent(1000, 0)
    ).to.changeTokenBalance(btcb, master.address, 1000);

    await expect(
      master.connect(tokenHolder1).liqChargeFromTo(1, 4)
    ).to.revertedWith("Select a valid snapshot range");
    await expect(
      master.connect(tokenHolder2).liqChargeFromTo(2, 4)
    ).to.revertedWith("Select a valid snapshot range");
    await expect(
      master.connect(tokenHolder2).liqCharge(1)
    ).to.changeTokenBalances(
      btcb,
      [master.address, tokenHolder2.address],
      [-666, 666]
    );
  });

  it("UNIT: Token holderes must not be able to liqChargeFromTo diferent snapshots with nothing to charge", async function () {
    const [owner, payerWallet, tokenHolder1, tokenHolder2, tokenHolder3] =
      await ethers.getSigners();
    await master.mintMaster(tokenHolder1.address, 10000);
    await master.mintMaster(tokenHolder2.address, 20000);

    await btcb.transfer(tokenHolder1.address, 1000);
    await btcb.transfer(tokenHolder2.address, 2000);

    amt
      .connect(tokenHolder1)
      .approve(master.address, ethers.utils.parseEther("1000000"));
    btcb
      .connect(tokenHolder1)
      .approve(master.address, ethers.utils.parseEther("1000000"));
    amt
      .connect(tokenHolder2)
      .approve(master.address, ethers.utils.parseEther("1000000"));
    btcb
      .connect(tokenHolder2)
      .approve(master.address, ethers.utils.parseEther("1000000"));

    await btcb.transfer(payerWallet.address, 10000);

    await expect(master.connect(tokenHolder1).addLiquidity(10000, 1000))
      .to.changeTokenBalances(
        amt,
        [tokenHolder1.address, testLiqPoolAndRouter.address],
        [-10000, 10000]
      )
      .and.to.changeTokenBalances(
        btcb,
        [tokenHolder1.address, testLiqPoolAndRouter.address],
        [-1000, 1000]
      )
      .and.to.changeTokenBalance(liqAmt, tokenHolder1.address, 100);

    await expect(master.connect(tokenHolder2).addLiquidity(20000, 2000))
      .to.changeTokenBalances(
        amt,
        [tokenHolder2.address, testLiqPoolAndRouter.address],
        [-20000, 20000]
      )
      .and.to.changeTokenBalances(
        btcb,
        [tokenHolder2.address, testLiqPoolAndRouter.address],
        [-2000, 2000]
      )
      .and.to.changeTokenBalance(liqAmt, tokenHolder2.address, 200);

    await expect(
      master.connect(payerWallet).payRent(1000, 0)
    ).to.changeTokenBalance(btcb, master.address, 1000);
    await expect(
      master.connect(payerWallet).payRent(1000, 0)
    ).to.changeTokenBalance(btcb, master.address, 1000);
    await expect(
      master.connect(payerWallet).payRent(1000, 0)
    ).to.changeTokenBalance(btcb, master.address, 1000);

    await master.mintMaster(tokenHolder3.address, 20000);
    await btcb.transfer(tokenHolder3.address, 2000);

    amt
      .connect(tokenHolder3)
      .approve(master.address, ethers.utils.parseEther("1000000"));
    btcb
      .connect(tokenHolder3)
      .approve(master.address, ethers.utils.parseEther("1000000"));

    await expect(master.connect(tokenHolder3).addLiquidity(20000, 2000))
      .to.changeTokenBalances(
        amt,
        [tokenHolder3.address, testLiqPoolAndRouter.address],
        [-20000, 20000]
      )
      .and.to.changeTokenBalances(
        btcb,
        [tokenHolder3.address, testLiqPoolAndRouter.address],
        [-2000, 2000]
      )
      .and.to.changeTokenBalance(liqAmt, tokenHolder3.address, 200);

    await expect(
      master.connect(tokenHolder3).liqChargeFromTo(1, 3)
    ).to.revertedWith("There was nothing to transfer");

    await expect(
      master.connect(tokenHolder1).liqChargeFromTo(1, 3)
    ).to.changeTokenBalances(
      btcb,
      [master.address, tokenHolder1.address],
      [-999, 999]
    );
    await expect(
      master.connect(tokenHolder2).liqChargeFromTo(2, 3)
    ).to.changeTokenBalances(
      btcb,
      [master.address, tokenHolder2.address],
      [-1332, 1332]
    );
    await expect(
      master.connect(tokenHolder2).liqCharge(1)
    ).to.changeTokenBalances(
      btcb,
      [master.address, tokenHolder2.address],
      [-666, 666]
    );
  });

  it("UNIT: Owner must be able to add liquidity locking", async function () {
    const [owner, payerWallet, newPayerWallet] = await ethers.getSigners();
    amt.approve(master.address, 1000);
    btcb.approve(master.address, 1000);
    await master.mintMaster(owner.address, 100);
    await expect(
      master.addLiquidityLocking(100, 10, owner.address, 60, master.address)
    )
      .to.changeTokenBalance(amt, owner.address, -100)
      .and.to.changeTokenBalance(btcb, owner.address, -10)
      .and.to.changeTokenBalance(liqAmt, await master.addrLiqLocker(), 100);
  });

  it("UNIT: Owner must not be able to add liquidity locking twice", async function () {
    const [owner, payerWallet, newPayerWallet] = await ethers.getSigners();
    amt.approve(master.address, 1000);
    btcb.approve(master.address, 1000);
    await master.mintMaster(owner.address, 100);
    await expect(
      master.addLiquidityLocking(100, 10, owner.address, 60, master.address)
    )
      .to.changeTokenBalance(amt, owner.address, -100)
      .and.to.changeTokenBalance(btcb, owner.address, -10);
    await expect(
      master.addLiquidityLocking(100, 10, owner.address, 60, master.address)
    ).to.revertedWith("Liquidity already locked");
  });

  it("UNIT: Owner must not be able to add liquidity without enough amt", async function () {
    const [owner, payerWallet, newPayerWallet] = await ethers.getSigners();
    amt.approve(master.address, 1000);
    btcb.approve(master.address, 1000);
    await amt.transfer(payerWallet.address, amt.balanceOf(owner.address));
    await expect(
      master.addLiquidityLocking(100, 10, owner.address, 60, master.address)
    ).to.revertedWith("Not enough AMT");
  });

  it("UNIT: Owner must not be able to add liquidity without enough btcb", async function () {
    const [owner, payerWallet, newPayerWallet] = await ethers.getSigners();
    amt.approve(master.address, 1000);
    btcb.approve(master.address, 1000);
    await master.mintMaster(owner.address, 100);
    await btcb.transfer(payerWallet.address, btcb.balanceOf(owner.address));
    await expect(
      master.addLiquidityLocking(100, 10, owner.address, 60, master.address)
    ).to.revertedWith("Not enough BBTC");
  });

  it("UNIT: Owner must not be able to add liquidity with an amount of amt lesser than 2", async function () {
    const [owner, payerWallet, newPayerWallet] = await ethers.getSigners();
    amt.approve(master.address, 1000);
    btcb.approve(master.address, 1000);
    await master.mintMaster(owner.address, 100);
    await expect(
      master.addLiquidityLocking(1, 10, owner.address, 60, master.address)
    ).to.revertedWith("AMT amount is too small");
  });

  it("UNIT: Owner must not be able to add liquidity with an amount of btcb lesser than 2", async function () {
    const [owner, payerWallet, newPayerWallet] = await ethers.getSigners();
    amt.approve(master.address, 1000);
    btcb.approve(master.address, 1000);
    await master.mintMaster(owner.address, 100);
    await expect(
      master.addLiquidityLocking(100, 1, owner.address, 60, master.address)
    ).to.revertedWith("BTCB amount is too small");
  });

  it("UNIT: Liq locker must not be seted with zero address as beneficiary", async function () {
    const [owner, payerWallet, newPayerWallet] = await ethers.getSigners();
    amt.approve(master.address, 1000);
    btcb.approve(master.address, 1000);
    await master.mintMaster(owner.address, 100);
    await expect(
      master.addLiquidityLocking(100, 10, zeroAddress, 60, master.address)
    ).to.revertedWith("Beneficiary must not be the zero address");
  });

  it("UNIT: Liq locker must not be seted with zero address as master", async function () {
    const [owner, payerWallet, newPayerWallet] = await ethers.getSigners();
    amt.approve(master.address, 1000);
    btcb.approve(master.address, 1000);
    await master.mintMaster(owner.address, 100);
    await expect(
      master.addLiquidityLocking(100, 10, owner.address, 60, zeroAddress)
    ).to.revertedWith("Master must not be the zero address");
  });

  it("UNIT: Owner must be able to charge from liquidity locked", async function () {
    const [owner, payerWallet, newPayerWallet] = await ethers.getSigners();
    amt.approve(master.address, 1000);
    btcb.approve(master.address, 1000);
    await master.mintMaster(owner.address, 100);
    await expect(
      master.addLiquidityLocking(100, 10, owner.address, 60, master.address)
    )
      .to.changeTokenBalance(amt, owner.address, -100)
      .and.to.changeTokenBalance(btcb, owner.address, -10);

    const liqLockerAddress = await master.addrLiqLocker();
    const LiqLocker = await ethers.getContractFactory("liqLocker");
    var liqLocker = LiqLocker.attach(liqLockerAddress) as LiqLocker;
    await btcb.transfer(payerWallet.address, 1000);
    await expect(
      master.connect(payerWallet).payRent(1000, 0)
    ).to.changeTokenBalance(btcb, master.address, 1000);
    await expect(liqLocker.charge(1)).to.changeTokenBalance(
      btcb,
      owner.address,
      1000
    );
  });

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  it("UNIT: Owner must be able to release tokens after timelapse", async function () {
    const [owner, payerWallet, newPayerWallet] = await ethers.getSigners();
    amt.approve(master.address, 1000);
    btcb.approve(master.address, 1000);
    await master.mintMaster(owner.address, 100);
    await expect(
      master.addLiquidityLocking(100, 10, owner.address, 6, master.address)
    )
      .to.changeTokenBalance(amt, owner.address, -100)
      .and.to.changeTokenBalance(btcb, owner.address, -10);
    const liqLockerAddress = await master.addrLiqLocker();
    const LiqLocker = await ethers.getContractFactory("liqLocker");
    var liqLocker = LiqLocker.attach(liqLockerAddress) as LiqLocker;
    await sleep(6500);
    await expect(liqLocker.release()).to.changeTokenBalance(
      liqAmt,
      owner.address,
      100
    );
  });

  it("UNIT: Owner must not be able to release tokens before timelapse", async function () {
    const [owner, payerWallet, newPayerWallet] = await ethers.getSigners();
    amt.approve(master.address, 1000);
    btcb.approve(master.address, 1000);
    await master.mintMaster(owner.address, 100);
    await expect(
      master.addLiquidityLocking(100, 10, owner.address, 6, master.address)
    )
      .to.changeTokenBalance(amt, owner.address, -100)
      .and.to.changeTokenBalance(btcb, owner.address, -10);
    const liqLockerAddress = await master.addrLiqLocker();
    const LiqLocker = await ethers.getContractFactory("liqLocker");
    var liqLocker = LiqLocker.attach(liqLockerAddress) as LiqLocker;
    await sleep(500);
    await expect(liqLocker.release()).to.revertedWith(
      "TokenTimelock: current time is before release time"
    );
  });

  it("UNIT: Owner must not be able to release tokens before timelapse if there are no tokens to release", async function () {
    const [owner, payerWallet, newPayerWallet] = await ethers.getSigners();
    amt.approve(master.address, 1000);
    btcb.approve(master.address, 1000);
    await master.mintMaster(owner.address, 100);
    await expect(
      master.addLiquidityLocking(100, 10, owner.address, 6, master.address)
    )
      .to.changeTokenBalance(amt, owner.address, -100)
      .and.to.changeTokenBalance(btcb, owner.address, -10);
    const liqLockerAddress = await master.addrLiqLocker();
    const LiqLocker = await ethers.getContractFactory("liqLocker");
    var liqLocker = LiqLocker.attach(liqLockerAddress) as LiqLocker;
    await sleep(6500);
    await expect(liqLocker.release()).to.changeTokenBalance(
      liqAmt,
      owner.address,
      100
    );
    await expect(liqLocker.release()).to.revertedWith(
      "TokenTimelock: no tokens to release"
    );
  });

  it("UNIT: Owner must be able to handle dust after payments charged", async function () {
    const [owner, payerWallet, tokenHolder1, tokenHolder2, tokenHolder3] =
      await ethers.getSigners();
    await master.mintMaster(tokenHolder1.address, 10000);
    await master.mintMaster(tokenHolder2.address, 10000);
    await master.mintMaster(tokenHolder3.address, 10000);
    await btcb.transfer(payerWallet.address, 1000);
    await expect(
      master.connect(payerWallet).payRent(1000, 0)
    ).to.changeTokenBalance(btcb, master.address, 1000);
    await expect(master.connect(tokenHolder1).charge(1)).to.changeTokenBalances(
      btcb,
      [master.address, tokenHolder1.address],
      [-333, 333]
    );
    await expect(master.connect(tokenHolder2).charge(1)).to.changeTokenBalances(
      btcb,
      [master.address, tokenHolder2.address],
      [-333, 333]
    );

    await expect(master.connect(tokenHolder3).charge(1)).to.changeTokenBalances(
      btcb,
      [master.address, tokenHolder3.address],
      [-333, 333]
    );

    await expect(master.handleDust(1)).to.changeTokenBalances(
      btcb,
      [master.address, owner.address],
      [-1, 1]
    );
  });

  it("UNIT: Owner must not be able to handle dust after payments charged if there is no dust generated", async function () {
    const [owner, payerWallet, tokenHolder1, tokenHolder2, tokenHolder3] =
      await ethers.getSigners();
    await master.mintMaster(tokenHolder1.address, 10000);
    await master.mintMaster(tokenHolder2.address, 10000);
    await master.mintMaster(tokenHolder3.address, 10000);
    await btcb.transfer(payerWallet.address, 1000);
    await expect(
      master.connect(payerWallet).payRent(999, 0)
    ).to.changeTokenBalance(btcb, master.address, 999);
    await expect(master.connect(tokenHolder1).charge(1)).to.changeTokenBalances(
      btcb,
      [master.address, tokenHolder1.address],
      [-333, 333]
    );
    await expect(master.connect(tokenHolder2).charge(1)).to.changeTokenBalances(
      btcb,
      [master.address, tokenHolder2.address],
      [-333, 333]
    );

    await expect(master.connect(tokenHolder3).charge(1)).to.changeTokenBalances(
      btcb,
      [master.address, tokenHolder3.address],
      [-333, 333]
    );

    await expect(master.handleDust(1)).to.revertedWith(
      "Nothing to collect from dust"
    );
  });

  it("UNIT: Owner must be able to handle dust for liquidity payments after payments charged", async function () {
    const [owner, payerWallet, tokenHolder1, tokenHolder2, tokenHolder3] =
      await ethers.getSigners();
    await master.mintMaster(tokenHolder1.address, 10000);
    await master.mintMaster(tokenHolder2.address, 10000);
    await master.mintMaster(tokenHolder3.address, 10000);
    await btcb.transfer(payerWallet.address, 1000);
    await btcb.transfer(tokenHolder1.address, 100);
    await btcb.transfer(tokenHolder2.address, 100);
    await btcb.transfer(tokenHolder3.address, 100);

    amt.connect(tokenHolder1).approve(master.address, 10000);
    btcb.connect(tokenHolder1).approve(master.address, 100);

    amt.connect(tokenHolder2).approve(master.address, 10000);
    btcb.connect(tokenHolder2).approve(master.address, 100);

    amt.connect(tokenHolder3).approve(master.address, 10000);
    btcb.connect(tokenHolder3).approve(master.address, 100);

    master.connect(tokenHolder1).addLiquidity(10000, 100);
    master.connect(tokenHolder2).addLiquidity(10000, 100);
    master.connect(tokenHolder3).addLiquidity(10000, 100);
    await expect(
      master.connect(payerWallet).payRent(1000, 0)
    ).to.changeTokenBalance(btcb, master.address, 1000);
    await expect(
      master.connect(tokenHolder1).liqCharge(1)
    ).to.changeTokenBalances(
      btcb,
      [master.address, tokenHolder1.address],
      [-333, 333]
    );
    await expect(
      master.connect(tokenHolder2).liqCharge(1)
    ).to.changeTokenBalances(
      btcb,
      [master.address, tokenHolder2.address],
      [-333, 333]
    );

    await expect(
      master.connect(tokenHolder3).liqCharge(1)
    ).to.changeTokenBalances(
      btcb,
      [master.address, tokenHolder3.address],
      [-333, 333]
    );

    await expect(master.LiqHandleDust(1)).to.changeTokenBalances(
      btcb,
      [master.address, owner.address],
      [-1, 1]
    );
  });

  it("UNIT: Owner must not be able to handle dust for liquidity payments after payments charged if there is no dust generated", async function () {
    const [owner, payerWallet, tokenHolder1, tokenHolder2, tokenHolder3] =
      await ethers.getSigners();
    await master.mintMaster(tokenHolder1.address, 10000);
    await master.mintMaster(tokenHolder2.address, 10000);
    await master.mintMaster(tokenHolder3.address, 10000);
    await btcb.transfer(payerWallet.address, 1000);
    await btcb.transfer(tokenHolder1.address, 100);
    await btcb.transfer(tokenHolder2.address, 100);
    await btcb.transfer(tokenHolder3.address, 100);

    amt.connect(tokenHolder1).approve(master.address, 10000);
    btcb.connect(tokenHolder1).approve(master.address, 100);

    amt.connect(tokenHolder2).approve(master.address, 10000);
    btcb.connect(tokenHolder2).approve(master.address, 100);

    amt.connect(tokenHolder3).approve(master.address, 10000);
    btcb.connect(tokenHolder3).approve(master.address, 100);

    master.connect(tokenHolder1).addLiquidity(10000, 100);
    master.connect(tokenHolder2).addLiquidity(10000, 100);
    master.connect(tokenHolder3).addLiquidity(10000, 100);
    await expect(
      master.connect(payerWallet).payRent(999, 0)
    ).to.changeTokenBalance(btcb, master.address, 999);
    await expect(
      master.connect(tokenHolder1).liqCharge(1)
    ).to.changeTokenBalances(
      btcb,
      [master.address, tokenHolder1.address],
      [-333, 333]
    );
    await expect(
      master.connect(tokenHolder2).liqCharge(1)
    ).to.changeTokenBalances(
      btcb,
      [master.address, tokenHolder2.address],
      [-333, 333]
    );

    await expect(
      master.connect(tokenHolder3).liqCharge(1)
    ).to.changeTokenBalances(
      btcb,
      [master.address, tokenHolder3.address],
      [-333, 333]
    );

    await expect(master.LiqHandleDust(1)).to.revertedWith(
      "Nothing to collect from dust"
    );
  });
});
