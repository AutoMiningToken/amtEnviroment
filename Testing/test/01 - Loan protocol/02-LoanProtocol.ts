import { ethers, network } from "hardhat";
import chai from "chai";
import {
  ERC20,
  LiquidityAmt,
  LoanProtocol,
  Master,
  PancakeFactory,
  PancakeRouter,
  PriceFeeder,
  TestERC20,
  TestLiqPoolAndRouter,
  WBNB,
} from "../../typechain-types";
import { Amt } from "../../typechain-types";
import { BurnVault } from "../../typechain-types";
import { BigNumber } from "ethers";
import { BigNumber as nativeBigNumber } from "bignumber.js";
import fs from "fs";
import { Oracle } from "../../typechain-types";
const { expect } = chai;
const deployPancake = require("../../scripts/deployPancakeSwapV2");
const deployExternalToken = require("../../scripts/deployExternalTokens");
const mainDeploy = require("../../scripts/deployMainAmtContracts");
const setInitialState = require("../../scripts/setInitialState");
const deployOracles = require("../../scripts/deployOracles");
describe("Test of loan protocol", function () {
  let priceFeeder: PriceFeeder;
  let factory: PancakeFactory;
  let router: PancakeRouter;
  let usdt: TestERC20;
  let btcb: TestERC20;
  let wbnb: WBNB;
  let amt: Amt;
  let liqAmt: LiquidityAmt;
  let burnVault: BurnVault;
  let master: Master;
  let oracleAMTBTCB: Oracle;
  let oracleUSDTBTCB: Oracle;
  let loanProtocol: LoanProtocol;
  const BSC_URL = "https://bsc.publicnode.com";
  this.beforeEach(async function () {
    const bscProvider = new ethers.providers.JsonRpcProvider(BSC_URL);
    const latestBlock = (await bscProvider.getBlockNumber()) - 100;

    await network.provider.send("hardhat_reset", [
      {
        forking: {
          jsonRpcUrl: BSC_URL,
          blockNumber: latestBlock,
        },
      },
    ]);
    ({ usdt, btcb } = await deployExternalToken());
    ({ factory, router, wbnb } = await deployPancake(usdt, btcb));

    ({ amt, liqAmt, burnVault, master } = await mainDeploy(btcb, router));
    const configPath = "./scripts/configurations/config.basicTest.json";
    const rawData = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(rawData);
    await setInitialState(
      config,
      usdt,
      btcb,
      amt,
      liqAmt,
      burnVault,
      master,
      router,
      factory
    );
    ({ oracleAMTBTCB, priceFeeder, loanProtocol } = await deployOracles(
      factory,
      usdt,
      btcb,
      amt,
      master
    ));

    await advanceTime(3600);
    await oracleAMTBTCB.update();
  });

  async function advanceTime(time: number) {
    await network.provider.send("evm_increaseTime", [time]);
    await network.provider.send("evm_mine");
  }
  function calculateAmtToSell(
    amtReserves: BigNumber,
    btcbReserves: BigNumber,
    priceOfBTCBinUSDT: BigNumber,
    targetPriceUSDT: BigNumber,
    increase: Boolean
  ) {
    // BigNumber representation of 1 for scaling purposes
    const oneEth = ethers.BigNumber.from("1000000000000000000"); // Equivalent to 1 ether to scale up decimals

    const k = amtReserves.mul(btcbReserves);

    const wantedPriceOfAmtInBtcb = targetPriceUSDT.div(priceOfBTCBinUSDT);

    const prevDeltaX = k.mul(oneEth).div(wantedPriceOfAmtInBtcb);
    const deltaX = new nativeBigNumber(prevDeltaX.toString()).sqrt();
    const amtToTrade = amtReserves
      .sub(BigNumber.from(deltaX.toFixed(0)))
      .mul(10020) //Add a little bit extra to pass fee structure
      .div(10000);

    return amtToTrade;
  }

  async function movePriceToTarget(
    targetPriceInUSDT: string // The target price of AMT in USDT
  ) {
    const wallets = await ethers.getSigners();
    const owner = wallets[0];
    // Fetch the current reserves from the pool
    const priceOfBTCBinUSDT = await priceFeeder.getLatestBTCBPrice();
    const pairAMTBTCB = await factory.getPair(amt.address, btcb.address);
    let reserveAMT = await amt.balanceOf(pairAMTBTCB);
    let reserveBTCB = await btcb.balanceOf(pairAMTBTCB);

    const amtToTrade = calculateAmtToSell(
      reserveAMT,
      reserveBTCB,
      priceOfBTCBinUSDT,
      ethers.utils.parseEther(targetPriceInUSDT),
      false
    );
    if (amtToTrade.lt(0)) {
      const tradeAmount = amtToTrade.abs();
      await amt.approve(router.address, tradeAmount);

      await router.swapExactTokensForTokens(
        tradeAmount,
        0,
        [amt.address, btcb.address],
        owner.address,
        (await ethers.provider.getBlock("latest")).timestamp + 19000000
      );
    } else {
      //Implement buy logic to increase the price
    }
  }

  it("CHECK ENVIROMENT: Testing pancake contracts: Excepting good behaviour of router, factory and tokens", async function () {
    const wallets = await ethers.getSigners();
    const owner = wallets[0];
    const usdt_btcb_pair = await factory.getPair(btcb.address, usdt.address);
    const amt_btcb_pair = await factory.getPair(amt.address, btcb.address);

    console.log("STARTING TEST WITH INITIAL STATE....");
    console.log("BTCB Price: ");
    const btcbPrice = await priceFeeder.getLatestBTCBPrice();
    console.log(btcbPrice);
    console.log("-----------------------------");
    console.log("AMT Price on USDT: ");
    const amtPrice = (
      await router.getAmountOut(
        ethers.utils.parseEther("1"),
        await amt.balanceOf(amt_btcb_pair),
        await btcb.balanceOf(amt_btcb_pair)
      )
    ).mul(btcbPrice);
    console.log(ethers.utils.formatEther(amtPrice));
  });

  it("UNIT: Owner must be able to set a new price feeder", async function () {
    const wallets = await ethers.getSigners();
    const owner = wallets[0];
    const NewPriceFeeder = await ethers.getContractFactory("PriceFeeder");
    const newPriceFeeder = (await NewPriceFeeder.deploy(
      oracleAMTBTCB.address,
      amt.address,
      btcb.address,
      oracleAMTBTCB.address,
      factory.getPair(amt.address, btcb.address)
    )) as PriceFeeder;
    await loanProtocol.setPriceFeeder(newPriceFeeder.address);
    expect(await loanProtocol.getPriceFeederAddress()).to.be.equal(
      newPriceFeeder.address
    );
  });

  it("UNIT: Owner must be able to set a new loan ratio", async function () {
    const wallets = await ethers.getSigners();
    const owner = wallets[0];
    await loanProtocol.setLoanRatio(5, 10);
    expect(await loanProtocol.loanRatioMax()).to.be.equal(10);
    expect(await loanProtocol.loanRatioMin()).to.be.equal(5);
  });
  /*
  it("UNIT: Users must be able to create loans", async function () {
    const wallets = await ethers.getSigners();
    const [owner, user] = wallets;
    await amt.transfer(user.address, ethers.utils.parseEther("1"));

    //Send USDT to the loan protocol
    await usdt.transfer(
      loanProtocol.address,
      ethers.utils.parseEther("150000")
    );

    const priceFromPriceFeeder = await priceFeeder.getPrice(
      ethers.utils.parseEther("1")
    );

    const rate = await loanProtocol.loanRatio();

    await amt
      .connect(user)
      .approve(loanProtocol.address, ethers.utils.parseEther("1"));

    await expect(
      loanProtocol.connect(user).createLoan(ethers.utils.parseEther("1"))
    ).to.changeTokenBalances(
      usdt,
      [user.address, loanProtocol.address],
      [
        priceFromPriceFeeder.div(rate),
        BigNumber.from(0).sub(priceFromPriceFeeder.div(rate)),
      ]
    );
    await amt
      .connect(user)
      .approve(loanProtocol.address, ethers.utils.parseEther("1"));
    await expect(
      loanProtocol.connect(user).createLoan(ethers.utils.parseEther("1"))
    ).to.changeTokenBalances(
      amt,
      [user.address, loanProtocol.address],
      [
        BigNumber.from(0).sub(ethers.utils.parseEther("1")),
        ethers.utils.parseEther("1"),
      ]
    );
  });

  it("UNIT: Users must not create loans with borrowed ammount equal to zero", async function () {
    const wallets = await ethers.getSigners();
    const [owner, user] = wallets;
    await amt.transfer(user.address, ethers.utils.parseEther("1"));

    //Send USDT to the loan protocol
    await usdt.transfer(
      loanProtocol.address,
      ethers.utils.parseEther("150000")
    );

    const priceFromPriceFeeder = await priceFeeder.getPrice(
      ethers.utils.parseEther("1")
    );

    const rate = await loanProtocol.loanRatio();

    await amt
      .connect(user)
      .approve(loanProtocol.address, ethers.utils.parseEther("1"));

    await expect(loanProtocol.connect(user).createLoan(10000)).to.revertedWith(
      "Loan ammount too small"
    );
  });

  it("UNIT: Users must not create loans if the protocol has not enougth USDT", async function () {
    const wallets = await ethers.getSigners();
    const [owner, user] = wallets;
    await amt.transfer(user.address, ethers.utils.parseEther("1"));

    const priceFromPriceFeeder = await priceFeeder.getPrice(
      ethers.utils.parseEther("1")
    );

    const rate = await loanProtocol.loanRatio();

    //Send USDT to the loan protocol 1 less unit than needed to execute
    await usdt.transfer(
      loanProtocol.address,
      priceFromPriceFeeder.div(rate).sub(1)
    );

    await amt
      .connect(user)
      .approve(loanProtocol.address, ethers.utils.parseEther("1"));

    await expect(
      loanProtocol.connect(user).createLoan(ethers.utils.parseEther("1"))
    ).to.revertedWith("Loan protocol has not enought balance");
  });

  it("BORDER CASE: Users must be able to create loans if the protocol has exactly the USDT to borrow", async function () {
    const wallets = await ethers.getSigners();
    const [owner, user] = wallets;
    await amt.transfer(user.address, ethers.utils.parseEther("1"));

    const priceFromPriceFeeder = await priceFeeder.getPrice(
      ethers.utils.parseEther("1")
    );

    const rate = await loanProtocol.loanRatio();

    //Send USDT to the loan protocol 1 less unit than needed to execute
    await usdt.transfer(loanProtocol.address, priceFromPriceFeeder.div(rate));

    await amt
      .connect(user)
      .approve(loanProtocol.address, ethers.utils.parseEther("1"));

    await expect(
      loanProtocol.connect(user).createLoan(ethers.utils.parseEther("1"))
    ).to.changeTokenBalances(
      amt,
      [user.address, loanProtocol.address],
      [
        BigNumber.from(0).sub(ethers.utils.parseEther("1")),
        ethers.utils.parseEther("1"),
      ]
    );
  });

  it("UNIT: Loans may be correctly fetched from the contract", async function () {
    const wallets = await ethers.getSigners();
    const [owner, user] = wallets;
    await amt.transfer(user.address, ethers.utils.parseEther("2000"));
    await amt
      .connect(user)
      .approve(loanProtocol.address, ethers.utils.parseEther("2000"));

    const loansToCreate = ["100", "30", "900"];
    const expectedLoans = [];

    //Send USDT to the loan protocol
    await usdt.transfer(
      loanProtocol.address,
      ethers.utils.parseEther("1500000")
    );
    for (let amtAmount of loansToCreate) {
      const priceFromPriceFeeder = await priceFeeder.getPrice(
        ethers.utils.parseEther(amtAmount)
      );
      const rate = await loanProtocol.loanRatio();
      const expectedLoan = {
        amountBorrowed: priceFromPriceFeeder.div(rate),
        collateralLocked: ethers.utils.parseEther(amtAmount),
        loanPrice: await priceFeeder.getPrice(
          ethers.utils.parseEther(amtAmount)
        ),
        loanRatio: await loanProtocol.loanRatio(),
      };
      await loanProtocol
        .connect(user)
        .createLoan(ethers.utils.parseEther(amtAmount));
      expectedLoans.push(expectedLoan);
    }

    const userLoans = await loanProtocol.getUserLoans(user.address);

    for (let i = 0; i < userLoans.length; i++) {
      expect(userLoans[i].amountBorrowed).to.equal(
        expectedLoans[i].amountBorrowed
      );
      expect(userLoans[i].collateralLocked).to.equal(
        expectedLoans[i].collateralLocked
      );
      expect(userLoans[i].loanPrice).to.equal(expectedLoans[i].loanPrice);
      expect(userLoans[i].loanRatio).to.equal(expectedLoans[i].loanRatio);
    }
  });

  it("UNIT: User must be able to close a loan returning the borrowed ammount", async function () {
    const wallets = await ethers.getSigners();
    const [owner, user] = wallets;
    await amt.transfer(user.address, ethers.utils.parseEther("200"));
    await amt
      .connect(user)
      .approve(loanProtocol.address, ethers.utils.parseEther("200"));

    const priceFromPriceFeeder = await priceFeeder.getPrice(
      ethers.utils.parseEther("100")
    );
    const rate = await loanProtocol.loanRatio();
    //Send USDT to the loan protocol
    await usdt.transfer(loanProtocol.address, ethers.utils.parseEther("40"));
    await expect(
      loanProtocol.connect(user).createLoan(ethers.utils.parseEther("100"))
    ).to.changeTokenBalances(
      usdt,
      [user.address, loanProtocol.address],
      [
        priceFromPriceFeeder.div(rate),
        BigNumber.from(0).sub(priceFromPriceFeeder.div(rate)),
      ]
    );

    await usdt
      .connect(user)
      .approve(loanProtocol.address, priceFromPriceFeeder.div(2));

    await expect(
      loanProtocol.connect(user).closeLoan(0, priceFromPriceFeeder.div(rate))
    ).to.changeTokenBalances(
      amt,
      [loanProtocol.address, user.address],
      [
        BigNumber.from(0).sub(ethers.utils.parseEther("100")),
        ethers.utils.parseEther("100"),
      ]
    );

    await expect(
      loanProtocol.connect(user).createLoan(ethers.utils.parseEther("100"))
    ).to.changeTokenBalances(
      usdt,
      [user.address, loanProtocol.address],
      [
        priceFromPriceFeeder.div(rate),
        BigNumber.from(0).sub(priceFromPriceFeeder.div(rate)),
      ]
    );
    await usdt
      .connect(user)
      .approve(loanProtocol.address, priceFromPriceFeeder.div(2));
    await expect(
      loanProtocol.connect(user).closeLoan(0, priceFromPriceFeeder.div(2))
    ).to.changeTokenBalances(
      usdt,
      [loanProtocol.address, user.address],
      [
        priceFromPriceFeeder.div(2),
        BigNumber.from(0).sub(priceFromPriceFeeder.div(2)),
      ]
    );
  });

  it("UNIT: User must not be able to repay loan with not enougth USDT", async function () {
    const wallets = await ethers.getSigners();
    const [owner, user] = wallets;
    await amt.transfer(user.address, ethers.utils.parseEther("200"));
    await amt
      .connect(user)
      .approve(loanProtocol.address, ethers.utils.parseEther("200"));

    const priceFromPriceFeeder = await priceFeeder.getPrice(
      ethers.utils.parseEther("100")
    );
    const rate = await loanProtocol.loanRatio();
    //Send USDT to the loan protocol
    await usdt.transfer(loanProtocol.address, ethers.utils.parseEther("40"));
    await expect(
      loanProtocol.connect(user).createLoan(ethers.utils.parseEther("100"))
    ).to.changeTokenBalances(
      usdt,
      [user.address, loanProtocol.address],
      [
        priceFromPriceFeeder.div(2),
        BigNumber.from(0).sub(priceFromPriceFeeder.div(2)),
      ]
    );

    await usdt
      .connect(user)
      .approve(loanProtocol.address, priceFromPriceFeeder.div(2));
    await usdt
      .connect(user)
      .transfer(owner.address, usdt.balanceOf(user.address));
    await expect(
      loanProtocol.connect(user).closeLoan(0, priceFromPriceFeeder.div(2))
    ).to.revertedWith("Insufficient USDT to repay loan");
  });

  it("UNIT: User must not be able to repay loan with an invalid loan index", async function () {
    const wallets = await ethers.getSigners();
    const [owner, user] = wallets;
    await amt.transfer(user.address, ethers.utils.parseEther("200"));

    //Send USDT to the loan protocol
    await usdt.transfer(loanProtocol.address, ethers.utils.parseEther("40"));

    await amt
      .connect(user)
      .approve(loanProtocol.address, ethers.utils.parseEther("200"));

    const priceFromPriceFeeder = await priceFeeder.getPrice(
      ethers.utils.parseEther("100")
    );
    const rate = await loanProtocol.loanRatio();

    await expect(
      loanProtocol.connect(user).createLoan(ethers.utils.parseEther("100"))
    ).to.changeTokenBalances(
      usdt,
      [user.address, loanProtocol.address],
      [
        priceFromPriceFeeder.div(rate),
        BigNumber.from(0).sub(priceFromPriceFeeder.div(rate)),
      ]
    );

    await usdt
      .connect(user)
      .approve(loanProtocol.address, ethers.utils.parseEther("100"));

    await expect(
      loanProtocol.connect(user).closeLoan(5, priceFromPriceFeeder.div(rate))
    ).to.revertedWith("Invalid loan index");
  });

  it("UNIT: User must be able create loan and close in any order", async function () {
    const wallets = await ethers.getSigners();
    const [owner, user] = wallets;
    await amt.transfer(user.address, ethers.utils.parseEther("2000"));
    await amt
      .connect(user)
      .approve(loanProtocol.address, ethers.utils.parseEther("2000"));

    const loansToCreate = ["100", "30", "900", "70", "500", "400"];
    const expectedLoans = [];

    //Send USDT to the loan protocol
    await usdt.transfer(loanProtocol.address, ethers.utils.parseEther("1000"));

    for (let amtAmount of loansToCreate) {
      const priceFromPriceFeeder = await priceFeeder.getPrice(
        ethers.utils.parseEther(amtAmount)
      );
      const rate = await loanProtocol.loanRatio();

      const expectedLoan = {
        amountBorrowed: priceFromPriceFeeder.div(rate),
        collateralLocked: ethers.utils.parseEther(amtAmount),
        loanPrice: await priceFeeder.getPrice(
          ethers.utils.parseEther(amtAmount)
        ),
        loanRatio: await loanProtocol.loanRatio(),
      };
      await loanProtocol
        .connect(user)
        .createLoan(ethers.utils.parseEther(amtAmount));
      expectedLoans.push(expectedLoan);
    }

    await usdt
      .connect(user)
      .approve(loanProtocol.address, ethers.utils.parseEther("1000"));

    await expect(
      loanProtocol.connect(user).closeLoan(3, expectedLoans[3].amountBorrowed)
    ).to.changeTokenBalances(
      usdt,
      [loanProtocol.address, user.address],
      [
        expectedLoans[3].amountBorrowed,
        BigNumber.from(0).sub(expectedLoans[3].amountBorrowed),
      ]
    );

    await expect(
      loanProtocol.connect(user).closeLoan(3, expectedLoans[5].amountBorrowed)
    ).to.changeTokenBalances(
      usdt,
      [loanProtocol.address, user.address],
      [
        expectedLoans[5].amountBorrowed,
        BigNumber.from(0).sub(expectedLoans[5].amountBorrowed),
      ]
    );

    await expect(
      loanProtocol.connect(user).closeLoan(1, expectedLoans[1].amountBorrowed)
    ).to.changeTokenBalances(
      usdt,
      [loanProtocol.address, user.address],
      [
        expectedLoans[1].amountBorrowed,
        BigNumber.from(0).sub(expectedLoans[1].amountBorrowed),
      ]
    );

    await expect(
      loanProtocol.connect(user).closeLoan(2, expectedLoans[2].amountBorrowed)
    ).to.changeTokenBalances(
      usdt,
      [loanProtocol.address, user.address],
      [
        expectedLoans[2].amountBorrowed,
        BigNumber.from(0).sub(expectedLoans[2].amountBorrowed),
      ]
    );

    await expect(
      loanProtocol.connect(user).closeLoan(0, expectedLoans[0].amountBorrowed)
    ).to.changeTokenBalances(
      usdt,
      [loanProtocol.address, user.address],
      [
        expectedLoans[0].amountBorrowed,
        BigNumber.from(0).sub(expectedLoans[0].amountBorrowed),
      ]
    );

    await expect(
      loanProtocol.connect(user).closeLoan(0, expectedLoans[4].amountBorrowed)
    ).to.changeTokenBalances(
      usdt,
      [loanProtocol.address, user.address],
      [
        expectedLoans[4].amountBorrowed,
        BigNumber.from(0).sub(expectedLoans[4].amountBorrowed),
      ]
    );
  });

  it("UNIT: isLoanLiquidable must return the right values", async function () {
    const wallets = await ethers.getSigners();
    const [owner, user] = wallets;
    await amt
      .connect(user)
      .approve(loanProtocol.address, ethers.utils.parseEther("1"));

    //Send USDT to the loan protocol
    await usdt.transfer(
      loanProtocol.address,
      ethers.utils.parseEther("1500000")
    );
    const priceFromPriceFeeder = await priceFeeder.getPrice(
      ethers.utils.parseEther("1")
    );

    const rate = await loanProtocol.loanRatio();
    await amt
      .connect(user)
      .approve(loanProtocol.address, ethers.utils.parseEther("1"));
    await expect(
      loanProtocol.connect(user).createLoan(ethers.utils.parseEther("1"))
    ).to.changeTokenBalances(
      usdt,
      [user.address, loanProtocol.address],
      [
        priceFromPriceFeeder.div(rate),
        BigNumber.from(0).sub(priceFromPriceFeeder.div(rate)),
      ]
    );

    const userLoans = await loanProtocol.getUserLoans(user.address);

    expect(await loanProtocol.isLoanLiquidable(0, user.address)).to.be.equal(
      false
    );

    await movePriceToTarget(
      ethers.utils.formatEther(
        userLoans[0].loanPrice.div(userLoans[0].loanRatio).sub(100000000)
      )
    );
    await advanceTime(3600);
    await oracleAMTBTCB.update();
    await advanceTime(3600);
    await oracleAMTBTCB.update();
    await advanceTime(3600);
    await oracleAMTBTCB.update();

    expect(await loanProtocol.isLoanLiquidable(0, user.address)).to.be.equal(
      true
    );
  });

  it("UNIT: isLoanLiquidable must revert with invalid parameters", async function () {
    const wallets = await ethers.getSigners();
    const [owner, user] = wallets;
    await amt
      .connect(user)
      .approve(loanProtocol.address, ethers.utils.parseEther("1"));

    //Send USDT to the loan protocol
    await usdt.transfer(
      loanProtocol.address,
      ethers.utils.parseEther("1500000")
    );
    const priceFromPriceFeeder = await priceFeeder.getPrice(
      ethers.utils.parseEther("1")
    );

    const rate = await loanProtocol.loanRatio();
    await amt
      .connect(user)
      .approve(loanProtocol.address, ethers.utils.parseEther("1"));
    await expect(
      loanProtocol.connect(user).createLoan(ethers.utils.parseEther("1"))
    ).to.changeTokenBalances(
      usdt,
      [user.address, loanProtocol.address],
      [
        priceFromPriceFeeder.div(rate),
        BigNumber.from(0).sub(priceFromPriceFeeder.div(rate)),
      ]
    );
    await expect(
      loanProtocol.isLoanLiquidable(1, user.address)
    ).to.revertedWith("Invalid loan index");
  });

  it("UNIT: Owner must be able to liquidate loans in liquidation condition", async function () {
    const wallets = await ethers.getSigners();
    const [owner, user] = wallets;
    await amt
      .connect(user)
      .approve(loanProtocol.address, ethers.utils.parseEther("1"));

    //Send USDT to the loan protocol
    await usdt.transfer(
      loanProtocol.address,
      ethers.utils.parseEther("1500000")
    );
    const priceFromPriceFeeder = await priceFeeder.getPrice(
      ethers.utils.parseEther("1")
    );

    const rate = await loanProtocol.loanRatio();
    await amt
      .connect(user)
      .approve(loanProtocol.address, ethers.utils.parseEther("1"));
    await expect(
      loanProtocol.connect(user).createLoan(ethers.utils.parseEther("1"))
    ).to.changeTokenBalances(
      usdt,
      [user.address, loanProtocol.address],
      [
        priceFromPriceFeeder.div(rate),
        BigNumber.from(0).sub(priceFromPriceFeeder.div(rate)),
      ]
    );

    const userLoans = await loanProtocol.getUserLoans(user.address);

    expect(await loanProtocol.isLoanLiquidable(0, user.address)).to.be.equal(
      false
    );
    await movePriceToTarget(
      ethers.utils.formatEther(
        userLoans[0].loanPrice.div(userLoans[0].loanRatio).sub(1000000)
      )
    );
    await advanceTime(3600);
    await oracleAMTBTCB.update();
    await advanceTime(3600);
    await oracleAMTBTCB.update();
    await advanceTime(3600);
    await oracleAMTBTCB.update();
    await expect(
      loanProtocol.liquidateLoan(0, user.address)
    ).to.changeTokenBalances(
      amt,
      [owner.address, loanProtocol.address],
      [
        userLoans[0].collateralLocked,
        BigNumber.from(0).sub(userLoans[0].collateralLocked),
      ]
    );
    const userLoansPostClosing = await loanProtocol.getUserLoans(user.address);

    expect(userLoansPostClosing.length).to.be.equal(0);
  });

  it("UNIT: Owner must be able to liquidate the specific loan in liquidation condition when user has multiple loans and not liquidate the others", async function () {
    const wallets = await ethers.getSigners();
    const [owner, user] = wallets;
    await amt.transfer(user.address, ethers.utils.parseEther("2000"));
    const realAMT = await ethers.getContractAt(
      "Amt",
      "0x6Ae0A238a6f51Df8eEe084B1756A54dD8a8E85d3"
    );

    await amt
      .connect(user)
      .approve(loanProtocol.address, ethers.utils.parseEther("2000"));

    const loansToCreate = ["100", "30", "900", "70", "500", "400"];
    const expectedLoans = [];

    //Send USDT to the loan protocol
    await usdt.transfer(
      loanProtocol.address,
      ethers.utils.parseEther("100000")
    );

    //We will create two loans at the current price
    for (let i = 0; i < 2; i++) {
      const amtAmount = loansToCreate[i];
      const priceFromPriceFeeder = await priceFeeder.getPrice(
        ethers.utils.parseEther(amtAmount)
      );
      const rate = await loanProtocol.loanRatio();
      const expectedLoan = {
        amountBorrowed: priceFromPriceFeeder.div(rate),
        collateralLocked: ethers.utils.parseEther(amtAmount),
        loanPrice: await priceFeeder.getPrice(
          ethers.utils.parseEther(amtAmount)
        ),
        loanRatio: await loanProtocol.loanRatio(),
      };
      await loanProtocol
        .connect(user)
        .createLoan(ethers.utils.parseEther(amtAmount));
      expectedLoans.push(expectedLoan);
    }

    const liquidationPrice = expectedLoans[0].amountBorrowed
      .mul("1000000000000000000")
      .div(expectedLoans[0].collateralLocked);
    //We will change the price to the liquidation zone of the first two loans
    await movePriceToTarget(ethers.utils.formatEther(liquidationPrice));

    //Let's update the oracle to update the price feeder
    await advanceTime(3600);
    await oracleAMTBTCB.update();
    await advanceTime(3600);
    await oracleAMTBTCB.update();

    //We will create the rest of the loans at the new price
    for (let i = 2; i < loansToCreate.length; i++) {
      const amtAmount = loansToCreate[i];
      const priceFromPriceFeeder = await priceFeeder.getPrice(
        ethers.utils.parseEther(amtAmount)
      );
      const rate = await loanProtocol.loanRatio();

      const expectedLoan = {
        amountBorrowed: priceFromPriceFeeder.div(rate),
        collateralLocked: ethers.utils.parseEther(amtAmount),
        loanPrice: await priceFeeder.getPrice(
          ethers.utils.parseEther(amtAmount)
        ),
        loanRatio: await loanProtocol.loanRatio(),
      };
      await loanProtocol
        .connect(user)
        .createLoan(ethers.utils.parseEther(amtAmount));
      expectedLoans.push(expectedLoan);
    }

    //We will confirm the data with the contract data to ensure we are working the correct values
    const userLoans = await loanProtocol.getUserLoans(user.address);

    for (let i = 0; i < userLoans.length; i++) {
      expect(userLoans[i].amountBorrowed).to.equal(
        expectedLoans[i].amountBorrowed
      );
      expect(userLoans[i].collateralLocked).to.equal(
        expectedLoans[i].collateralLocked
      );
      expect(userLoans[i].loanPrice).to.equal(expectedLoans[i].loanPrice);
      expect(userLoans[i].loanRatio).to.equal(expectedLoans[i].loanRatio);
    }

    //We will try to liquidate the first two loans in reverse order
    await expect(
      loanProtocol.liquidateLoan(1, user.address)
    ).changeTokenBalances(
      amt,
      [owner.address, loanProtocol.address],
      [
        expectedLoans[1].collateralLocked,
        BigNumber.from(0).sub(expectedLoans[1].collateralLocked),
      ]
    );

    await expect(
      loanProtocol.liquidateLoan(0, user.address)
    ).changeTokenBalances(
      amt,
      [owner.address, loanProtocol.address],
      [
        expectedLoans[0].collateralLocked,
        BigNumber.from(0).sub(expectedLoans[0].collateralLocked),
      ]
    );

    //We will try to liquidate all the rest of the loans and we must not be able to
    const userLoansAfterLiquidations = await loanProtocol.getUserLoans(
      user.address
    );

    //We will re check the data

    //Define this function for clear visualization of the indexes of expectedLoans and the new loans created
    // From real index of loans in the contract to index in the expected loan
    function parseIndex(i: number) {
      if (i == 0) {
        return expectedLoans.length - 2;
      }
      if (i == 1) {
        return expectedLoans.length - 1;
      } else {
        return i;
      }
    }
    for (let i = 0; i < userLoansAfterLiquidations.length; i++) {
      //expectedLoanIndex defined by parse function as we change the array removing the first two loans
      const expectedLoanIndex = parseIndex(i);

      expect(userLoansAfterLiquidations[i].amountBorrowed).to.equal(
        expectedLoans[expectedLoanIndex].amountBorrowed
      );
      expect(userLoansAfterLiquidations[i].collateralLocked).to.equal(
        expectedLoans[expectedLoanIndex].collateralLocked
      );
      expect(userLoansAfterLiquidations[i].loanPrice).to.equal(
        expectedLoans[expectedLoanIndex].loanPrice
      );
      expect(userLoansAfterLiquidations[i].loanRatio).to.equal(
        expectedLoans[expectedLoanIndex].loanRatio
      );

      //And we try to close it
      await expect(loanProtocol.liquidateLoan(0, user.address)).to.revertedWith(
        "Loan not liquidable"
      );
      //As last check, we verify the correct close of the loan by the user.
      //Remove from last to first to mantain arrays order
      await usdt
        .connect(user)
        .approve(
          loanProtocol.address,
          userLoansAfterLiquidations[userLoansAfterLiquidations.length - i - 1]
            .amountBorrowed
        );
      await expect(
        loanProtocol
          .connect(user)
          .closeLoan(
            userLoansAfterLiquidations.length - i - 1,
            userLoansAfterLiquidations[
              userLoansAfterLiquidations.length - i - 1
            ].amountBorrowed
          )
      ).to.changeTokenBalances(
        amt,
        [user.address, loanProtocol.address],
        [
          userLoansAfterLiquidations[userLoansAfterLiquidations.length - i - 1]
            .collateralLocked,
          BigNumber.from(0).sub(
            userLoansAfterLiquidations[
              userLoansAfterLiquidations.length - i - 1
            ].collateralLocked
          ),
        ]
      );
    }

    //After all we check the invalid loan index require of the contract
    await expect(loanProtocol.liquidateLoan(5, user.address)).to.revertedWith(
      "Invalid loan index"
    );
  });

  it("UNIT: User must be able to partial close a loan returning the part of the borrowed ammount and recive the proportional collateral amount", async function () {
    const wallets = await ethers.getSigners();
    const [owner, user] = wallets;
    await amt.transfer(user.address, ethers.utils.parseEther("200"));
    await amt
      .connect(user)
      .approve(loanProtocol.address, ethers.utils.parseEther("200"));

    const priceFromPriceFeeder = await priceFeeder.getPrice(
      ethers.utils.parseEther("100")
    );
    const rate = await loanProtocol.loanRatio();
    //Send USDT to the loan protocol
    await usdt.transfer(loanProtocol.address, ethers.utils.parseEther("40"));
    await expect(
      loanProtocol.connect(user).createLoan(ethers.utils.parseEther("100"))
    ).to.changeTokenBalances(
      usdt,
      [user.address, loanProtocol.address],
      [
        priceFromPriceFeeder.div(rate),
        BigNumber.from(0).sub(priceFromPriceFeeder.div(rate)),
      ]
    );

    await usdt
      .connect(user)
      .approve(loanProtocol.address, priceFromPriceFeeder.div(2));

    const usdtToReturn = priceFromPriceFeeder
      .div(rate)
      .sub(ethers.utils.parseEther("10"));
    await expect(
      loanProtocol.connect(user).closeLoan(0, usdtToReturn)
    ).to.changeTokenBalances(
      amt,
      [loanProtocol.address, user.address],
      [
        BigNumber.from(0).sub(
          ethers.utils
            .parseEther("100")
            .mul(usdtToReturn)
            .div(priceFromPriceFeeder.div(rate))
        ),
        ethers.utils
          .parseEther("100")
          .mul(usdtToReturn)
          .div(priceFromPriceFeeder.div(rate)),
      ]
    );
  });

  it("UNIT: User must be able to partial close a loan and then close the complete loan", async function () {
    const wallets = await ethers.getSigners();
    const [owner, user] = wallets;
    await amt.transfer(user.address, ethers.utils.parseEther("200"));
    await amt
      .connect(user)
      .approve(loanProtocol.address, ethers.utils.parseEther("200"));

    const priceFromPriceFeeder = await priceFeeder.getPrice(
      ethers.utils.parseEther("100")
    );
    const rate = await loanProtocol.loanRatio();
    //Send USDT to the loan protocol
    await usdt.transfer(loanProtocol.address, ethers.utils.parseEther("40"));
    await expect(
      loanProtocol.connect(user).createLoan(ethers.utils.parseEther("100"))
    ).to.changeTokenBalances(
      usdt,
      [user.address, loanProtocol.address],
      [
        priceFromPriceFeeder.div(rate),
        BigNumber.from(0).sub(priceFromPriceFeeder.div(rate)),
      ]
    );

    await usdt
      .connect(user)
      .approve(loanProtocol.address, priceFromPriceFeeder.div(2));

    const usdtToReturn = priceFromPriceFeeder
      .div(rate)
      .sub(ethers.utils.parseEther("10"));
    await expect(
      loanProtocol.connect(user).closeLoan(0, usdtToReturn)
    ).to.changeTokenBalances(
      amt,
      [loanProtocol.address, user.address],
      [
        BigNumber.from(0).sub(
          ethers.utils
            .parseEther("100")
            .mul(usdtToReturn)
            .div(priceFromPriceFeeder.div(rate))
        ),
        ethers.utils
          .parseEther("100")
          .mul(usdtToReturn)
          .div(priceFromPriceFeeder.div(rate)),
      ]
    );

    const amtToBeReturnedInTotalClose = ethers.utils
      .parseEther("100")
      .sub(
        ethers.utils
          .parseEther("100")
          .mul(usdtToReturn)
          .div(priceFromPriceFeeder.div(rate))
      );
    await expect(
      loanProtocol
        .connect(user)
        .closeLoan(0, priceFromPriceFeeder.div(rate).sub(usdtToReturn))
    ).to.changeTokenBalances(
      amt,
      [loanProtocol.address, user.address],
      [
        BigNumber.from(0).sub(amtToBeReturnedInTotalClose),
        amtToBeReturnedInTotalClose,
      ]
    );
  });

  it("UNIT: Close loan transaction must revert if amount exceds amount borrowed", async function () {
    const wallets = await ethers.getSigners();
    const [owner, user] = wallets;
    await amt.transfer(user.address, ethers.utils.parseEther("200"));
    await amt
      .connect(user)
      .approve(loanProtocol.address, ethers.utils.parseEther("200"));

    const priceFromPriceFeeder = await priceFeeder.getPrice(
      ethers.utils.parseEther("100")
    );
    const rate = await loanProtocol.loanRatio();
    //Send USDT to the loan protocol
    await usdt.transfer(loanProtocol.address, ethers.utils.parseEther("40"));
    await expect(
      loanProtocol.connect(user).createLoan(ethers.utils.parseEther("100"))
    ).to.changeTokenBalances(
      usdt,
      [user.address, loanProtocol.address],
      [
        priceFromPriceFeeder.div(rate),
        BigNumber.from(0).sub(priceFromPriceFeeder.div(rate)),
      ]
    );

    await usdt
      .connect(user)
      .approve(loanProtocol.address, priceFromPriceFeeder.div(2).add(1));

    await expect(
      loanProtocol
        .connect(user)
        .closeLoan(0, priceFromPriceFeeder.div(2).add(1))
    ).to.revertedWith("Amount exceds borrowed amount");
  });

  it("EVENTs CHECK: Loan creation must emmit event with correct params", async function () {
    const wallets = await ethers.getSigners();
    const [owner, user] = wallets;
    await amt.transfer(user.address, ethers.utils.parseEther("200"));

    //Send USDT to the loan protocol
    await usdt.transfer(
      loanProtocol.address,
      ethers.utils.parseEther("150000")
    );

    const priceFromPriceFeeder = await priceFeeder.getPrice(
      ethers.utils.parseEther("200")
    );
    const rate = await loanProtocol.loanRatio();

    await amt
      .connect(user)
      .approve(loanProtocol.address, ethers.utils.parseEther("200"));

    await expect(
      loanProtocol.connect(user).createLoan(ethers.utils.parseEther("200"))
    )
      .to.emit(loanProtocol, "LoanCreated")
      .withArgs(
        user.address,
        priceFromPriceFeeder.div(rate),
        ethers.utils.parseEther("200")
      );
  });

  it("EVENTs CHECK: Events of close and partial close must be emmited correctly", async function () {
    const wallets = await ethers.getSigners();
    const [owner, user] = wallets;
    await amt.transfer(user.address, ethers.utils.parseEther("200"));
    await amt
      .connect(user)
      .approve(loanProtocol.address, ethers.utils.parseEther("200"));

    const priceFromPriceFeeder = await priceFeeder.getPrice(
      ethers.utils.parseEther("100")
    );
    const rate = await loanProtocol.loanRatio();
    //Send USDT to the loan protocol
    await usdt.transfer(loanProtocol.address, ethers.utils.parseEther("40"));
    await expect(
      loanProtocol.connect(user).createLoan(ethers.utils.parseEther("100"))
    ).to.changeTokenBalances(
      usdt,
      [user.address, loanProtocol.address],
      [
        priceFromPriceFeeder.div(rate),
        BigNumber.from(0).sub(priceFromPriceFeeder.div(rate)),
      ]
    );

    await usdt
      .connect(user)
      .approve(loanProtocol.address, priceFromPriceFeeder.div(2));

    const usdtToReturn = priceFromPriceFeeder
      .div(rate)
      .sub(ethers.utils.parseEther("10"));
    await expect(loanProtocol.connect(user).closeLoan(0, usdtToReturn))
      .to.emit(loanProtocol, "LoanPartialClosed")
      .withArgs(
        user.address,
        usdtToReturn,
        ethers.utils
          .parseEther("100")
          .mul(usdtToReturn)
          .div(priceFromPriceFeeder.div(rate))
      );

    const amtToBeReturnedInTotalClose = ethers.utils
      .parseEther("100")
      .sub(
        ethers.utils
          .parseEther("100")
          .mul(usdtToReturn)
          .div(priceFromPriceFeeder.div(rate))
      );
    await expect(
      loanProtocol
        .connect(user)
        .closeLoan(0, priceFromPriceFeeder.div(rate).sub(usdtToReturn))
    )
      .to.emit(loanProtocol, "LoanClosed")
      .withArgs(
        user.address,
        priceFromPriceFeeder.div(rate).sub(usdtToReturn),
        amtToBeReturnedInTotalClose
      );
  });

  it("UNIT: pauseAdmin must be able to pause loan protocol", async function () {
    const wallets = await ethers.getSigners();
    const [owner, user] = wallets;

    await loanProtocol.emergencyStop();
    await expect(loanProtocol.connect(user).createLoan(1)).to.revertedWith(
      "Pausable: paused"
    );
  });

  it("UNIT: owner must  able to set a new pause admin", async function () {
    const wallets = await ethers.getSigners();
    const [owner, user, newPauseAdmin] = wallets;

    await loanProtocol.setPauseAdmin(newPauseAdmin.address);
    await loanProtocol.connect(newPauseAdmin).emergencyStop();
    await expect(loanProtocol.connect(user).createLoan(1)).to.revertedWith(
      "Pausable: paused"
    );
  });

  it("UNIT: pause admin must be able to resume operations", async function () {
    const wallets = await ethers.getSigners();
    const [owner, user, newPauseAdmin] = wallets;

    await loanProtocol.setPauseAdmin(newPauseAdmin.address);
    await loanProtocol.connect(newPauseAdmin).emergencyStop();
    await expect(loanProtocol.connect(user).createLoan(1)).to.revertedWith(
      "Pausable: paused"
    );
    loanProtocol.connect(newPauseAdmin).resumeOperations();
    usdt.transfer(loanProtocol.address, ethers.utils.parseEther("1000"));
    await amt
      .connect(user)
      .approve(loanProtocol.address, ethers.utils.parseEther("1"));
    await expect(
      loanProtocol.connect(user).createLoan(ethers.utils.parseEther("1"))
    ).to.changeTokenBalance(
      amt,
      user.address,
      BigNumber.from(0).sub(ethers.utils.parseEther("1"))
    );
  });

  it("UNIT: Not pause admin must not be able to execute pause admin restricted operations", async function () {
    const wallets = await ethers.getSigners();
    const [owner, user, newPauseAdmin, notPauseAdmin] = wallets;

    await loanProtocol.setPauseAdmin(newPauseAdmin.address);
    await expect(
      loanProtocol.connect(notPauseAdmin).emergencyStop()
    ).revertedWith("Caller is not the pause admin");

    await expect(
      loanProtocol.connect(notPauseAdmin).resumeOperations()
    ).revertedWith("Caller is not the pause admin");
  });

  it("UNIT: pause admin must not be setted as the zero address", async function () {
    const wallets = await ethers.getSigners();
    const [owner, user, newPauseAdmin, notPauseAdmin] = wallets;
    const zeroAddress = "0x0000000000000000000000000000000000000000";
    await expect(loanProtocol.setPauseAdmin(zeroAddress)).to.revertedWith(
      "New pause admin is the zero address"
    );
  });

  it("UNIT: admin must be able to execute charge function and get the BTCB generated by the AMT holded by loan protocol contract", async function () {
    const wallets = await ethers.getSigners();
    const [owner, user1, user2, user3] = wallets;

    //Send AMT to users to create loans
    await amt.transfer(user1.address, ethers.utils.parseEther("2000"));
    await amt.transfer(user2.address, ethers.utils.parseEther("2000"));
    await amt.transfer(user3.address, ethers.utils.parseEther("2000"));

    //Approvals for to the Loan protocol
    await amt
      .connect(user1)
      .approve(loanProtocol.address, ethers.utils.parseEther("2000"));

    await amt
      .connect(user2)
      .approve(loanProtocol.address, ethers.utils.parseEther("2000"));

    await amt
      .connect(user3)
      .approve(loanProtocol.address, ethers.utils.parseEther("2000"));

    const priceFromPriceFeeder = await priceFeeder.getPrice(
      ethers.utils.parseEther("2000")
    );
    const rate = await loanProtocol.loanRatio();

    //Send USDT to the loan protocol
    await usdt.transfer(loanProtocol.address, ethers.utils.parseEther("6000"));

    //Create loans to give the loan protocol a total ammount of 6000 AMT
    await expect(
      loanProtocol.connect(user1).createLoan(ethers.utils.parseEther("2000"))
    ).to.changeTokenBalances(
      usdt,
      [user1.address, loanProtocol.address],
      [
        priceFromPriceFeeder.div(rate),
        BigNumber.from(0).sub(priceFromPriceFeeder.div(rate)),
      ]
    );

    await expect(
      loanProtocol.connect(user2).createLoan(ethers.utils.parseEther("2000"))
    ).to.changeTokenBalances(
      usdt,
      [user2.address, loanProtocol.address],
      [
        priceFromPriceFeeder.div(rate),
        BigNumber.from(0).sub(priceFromPriceFeeder.div(rate)),
      ]
    );

    await expect(
      loanProtocol.connect(user3).createLoan(ethers.utils.parseEther("2000"))
    ).to.changeTokenBalances(
      usdt,
      [user3.address, loanProtocol.address],
      [
        priceFromPriceFeeder.div(rate),
        BigNumber.from(0).sub(priceFromPriceFeeder.div(rate)),
      ]
    );

    //Payment to master contract
    await btcb.approve(master.address, ethers.utils.parseEther("100"));
    await master.payRent(ethers.utils.parseEther("100"), 1);

    const rentToHolders = ethers.utils.parseEther("100").mul(99).div(100);
    const rentToLoanProtocol = rentToHolders
      .mul(await amt.balanceOfAt(loanProtocol.address, 1))
      .div(await amt.totalSupplyAt(1));
    await expect(loanProtocol.charge(1)).to.changeTokenBalances(
      btcb,
      [master.address, owner.address],
      [BigNumber.from(0).sub(rentToLoanProtocol), rentToLoanProtocol]
    );
  });

  it("UNIT: owner must be able to withdraw USDT from the loan protocol", async function () {
    const wallets = await ethers.getSigners();
    const [owner] = wallets;

    //Send USDT to the loan protocol
    await usdt.transfer(loanProtocol.address, ethers.utils.parseEther("6000"));

    await expect(
      loanProtocol.withdrawlUsdt(ethers.utils.parseEther("1000"))
    ).to.changeTokenBalances(
      usdt,
      [loanProtocol.address, owner.address],
      [
        BigNumber.from(0).sub(ethers.utils.parseEther("1000")),
        ethers.utils.parseEther("1000"),
      ]
    );

    await expect(
      loanProtocol.withdrawlUsdt(ethers.utils.parseEther("5000"))
    ).to.changeTokenBalances(
      usdt,
      [loanProtocol.address, owner.address],
      [
        BigNumber.from(0).sub(ethers.utils.parseEther("5000")),
        ethers.utils.parseEther("5000"),
      ]
    );
  });

  it("UNIT: owner must not be able to withdraw USDT if the protocol has not enought usdt", async function () {
    const wallets = await ethers.getSigners();
    const [owner] = wallets;

    //Send USDT to the loan protocol
    await usdt.transfer(loanProtocol.address, ethers.utils.parseEther("6000"));

    await expect(
      loanProtocol.withdrawlUsdt(ethers.utils.parseEther("1000"))
    ).to.changeTokenBalances(
      usdt,
      [loanProtocol.address, owner.address],
      [
        BigNumber.from(0).sub(ethers.utils.parseEther("1000")),
        ethers.utils.parseEther("1000"),
      ]
    );

    await expect(
      loanProtocol.withdrawlUsdt(ethers.utils.parseEther("5000"))
    ).to.changeTokenBalances(
      usdt,
      [loanProtocol.address, owner.address],
      [
        BigNumber.from(0).sub(ethers.utils.parseEther("5000")),
        ethers.utils.parseEther("5000"),
      ]
    );

    await expect(loanProtocol.withdrawlUsdt(1)).to.revertedWith(
      "Not enought USDT"
    );
  });

  it("UNIT: Constructor requires", async function () {
    const wallets = await ethers.getSigners();
    const [owner] = wallets;
    const addressZero = "0x0000000000000000000000000000000000000000";
    //BTCB zero address
    let LoanProtocol = await ethers.getContractFactory("LoanProtocol");
    await expect(
      LoanProtocol.deploy(
        addressZero,
        usdt.address,
        amt.address,
        master.address,
        priceFeeder.address,
        2
      )
    ).to.revertedWith("Btcb address must not be the zero address");

    //USDT zero address
    LoanProtocol = await ethers.getContractFactory("LoanProtocol");
    await expect(
      LoanProtocol.deploy(
        btcb.address,
        addressZero,
        amt.address,
        master.address,
        priceFeeder.address,
        2
      )
    ).to.revertedWith("Usdt address must not be the zero address");

    //AMT zero address
    LoanProtocol = await ethers.getContractFactory("LoanProtocol");
    await expect(
      LoanProtocol.deploy(
        btcb.address,
        usdt.address,
        addressZero,
        master.address,
        priceFeeder.address,
        2
      )
    ).to.revertedWith("Amt address must not be the zero address");

    //Master zero address
    LoanProtocol = await ethers.getContractFactory("LoanProtocol");
    await expect(
      LoanProtocol.deploy(
        btcb.address,
        usdt.address,
        amt.address,
        addressZero,
        priceFeeder.address,
        2
      )
    ).to.revertedWith("Master address must not be the zero address");

    //Price feeder zero address
    LoanProtocol = await ethers.getContractFactory("LoanProtocol");
    await expect(
      LoanProtocol.deploy(
        btcb.address,
        usdt.address,
        amt.address,
        master.address,
        addressZero,
        2
      )
    ).to.revertedWith("Price feeder address must not be the zero address");

    //Loan ratio as zero
    LoanProtocol = await ethers.getContractFactory("LoanProtocol");
    await expect(
      LoanProtocol.deploy(
        btcb.address,
        usdt.address,
        amt.address,
        master.address,
        priceFeeder.address,
        0
      )
    ).to.revertedWith("Loan ratio must not be zero");
  });
  it("UNIT: Users must not be able to create loans with amount 0", async function () {
    const wallets = await ethers.getSigners();
    const [owner, user] = wallets;
    await amt.transfer(user.address, ethers.utils.parseEther("1"));

    //Send USDT to the loan protocol
    await usdt.transfer(
      loanProtocol.address,
      ethers.utils.parseEther("150000")
    );
    await amt
      .connect(user)
      .approve(loanProtocol.address, ethers.utils.parseEther("1"));

    await expect(loanProtocol.connect(user).createLoan(0)).to.revertedWith(
      "amtAmount must be greatter than zero"
    );
  });

  it("UNIT: Users must not be able to create loans with not enought AMT", async function () {
    const wallets = await ethers.getSigners();
    const [owner, user] = wallets;

    amt
      .connect(user)
      .transfer(owner.address, await amt.balanceOf(user.address));
    //Send USDT to the loan protocol
    await usdt.transfer(
      loanProtocol.address,
      ethers.utils.parseEther("150000")
    );
    await amt
      .connect(user)
      .approve(loanProtocol.address, ethers.utils.parseEther("1"));

    await expect(
      loanProtocol.connect(user).createLoan(ethers.utils.parseEther("1"))
    ).to.revertedWith("Not enought AMT balance");
  });

  it("UNIT: User must not be able to partial close a loan returning 0 amt", async function () {
    const wallets = await ethers.getSigners();
    const [owner, user] = wallets;
    await amt.transfer(user.address, ethers.utils.parseEther("200"));
    await amt
      .connect(user)
      .approve(loanProtocol.address, ethers.utils.parseEther("200"));

    const priceFromPriceFeeder = await priceFeeder.getPrice(
      ethers.utils.parseEther("100")
    );
    const rate = await loanProtocol.loanRatio();
    //Send USDT to the loan protocol
    await usdt.transfer(loanProtocol.address, ethers.utils.parseEther("40"));
    await expect(
      loanProtocol.connect(user).createLoan(ethers.utils.parseEther("100"))
    ).to.changeTokenBalances(
      usdt,
      [user.address, loanProtocol.address],
      [
        priceFromPriceFeeder.div(rate),
        BigNumber.from(0).sub(priceFromPriceFeeder.div(rate)),
      ]
    );

    await usdt
      .connect(user)
      .approve(loanProtocol.address, priceFromPriceFeeder.div(2));

    await expect(loanProtocol.connect(user).closeLoan(0, 0)).to.revertedWith(
      "Amount must not be zero"
    );
  });

  it("UNIT: Owner must not be able to set a new price feeder with zero address", async function () {
    const wallets = await ethers.getSigners();
    const owner = wallets[0];
    const addressZero = "0x0000000000000000000000000000000000000000";

    await expect(loanProtocol.setPriceFeeder(addressZero)).to.revertedWith(
      "Price feeder address must not be the zero address"
    );
  });

  it("UNIT: Owner must not be able to set a new loan ratio as zero", async function () {
    const wallets = await ethers.getSigners();
    const owner = wallets[0];
    await expect(loanProtocol.setLoanRatio(0)).to.revertedWith(
      "Loan ratio must be greatter than zero"
    );
  });
  */
});
