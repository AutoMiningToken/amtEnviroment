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
import { BigNumber as nativeBigNumber } from "bignumber.js";
import fs from "fs";
import { Oracle } from "../../typechain-types";
import { BigNumberish } from "ethers";
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
  const BSC_URLs = ["https://bscrpc.com"];

  const connectToRPC = async (index: number) => {
    try {
      const BSC_URL = BSC_URLs[index];
      const bscProvider = new ethers.JsonRpcProvider(BSC_URL);
      const latestBlock = (await bscProvider.getBlockNumber()) - 1000;
      await network.provider.send("hardhat_reset", [
        {
          forking: {
            jsonRpcUrl: BSC_URL,
            blockNumber: latestBlock,
          },
        },
      ]);
    } catch {
      if (index < BSC_URLs.length - 1) {
        await connectToRPC(index + 1);
      } else {
        throw new Error("Can not connect to any provider");
      }
    }
  };
  const BSC_URL = "https://bscrpc.com";

  this.beforeEach(async function () {
    //const bscProvider = new ethers.JsonRpcProvider(BSC_URL);
    //const latestBlock = (await bscProvider.getBlockNumber()) - 100;
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
      master,
      false
    ));

    await advanceTime(3600);
    await oracleAMTBTCB.update();
  });

  async function advanceTime(time: number) {
    await network.provider.send("evm_increaseTime", [time]);
    await network.provider.send("evm_mine");
  }
  function calculateAmtToSell(
    amtReserves: bigint,
    btcbReserves: bigint,
    priceOfBTCBinUSDT: bigint,
    targetPriceUSDT: bigint,
    increase: Boolean
  ) {
    // BigNumber representation of 1 for scaling purposes
    const oneEth = BigInt("1000000000000000000"); // Equivalent to 1 ether to scale up decimals

    const k = amtReserves * btcbReserves;

    const wantedPriceOfAmtInBtcb = targetPriceUSDT / priceOfBTCBinUSDT;

    const prevDeltaX = (k * oneEth) / wantedPriceOfAmtInBtcb;
    const deltaX = new nativeBigNumber(prevDeltaX.toString()).sqrt();
    const amtToTrade =
      ((amtReserves - BigInt(deltaX.toFixed(0))) * 10020n) / 10000n; //Add a little bit extra to pass fee structure

    return amtToTrade;
  }

  async function movePriceToTarget(
    targetPriceInUSDT: string // The target price of AMT in USDT
  ) {
    const wallets = await ethers.getSigners();
    const owner = wallets[0];
    // Fetch the current reserves from the pool
    const priceOfBTCBinUSDT = await priceFeeder.getLatestBTCBPrice();
    const pairAMTBTCB = await factory.getPair(
      amt.getAddress(),
      btcb.getAddress()
    );
    let reserveAMT = await amt.balanceOf(pairAMTBTCB);
    let reserveBTCB = await btcb.balanceOf(pairAMTBTCB);

    const amtToTrade = calculateAmtToSell(
      reserveAMT,
      reserveBTCB,
      priceOfBTCBinUSDT,
      ethers.parseEther(targetPriceInUSDT),
      false
    );
    if (amtToTrade < 0) {
      const tradeAmount = amtToTrade < 0 ? -amtToTrade : amtToTrade;
      await amt.approve(router.getAddress(), tradeAmount);
      const latestBlock = await ethers.provider.getBlock("latest");
      await router.swapExactTokensForTokens(
        tradeAmount,
        0,
        [amt.getAddress(), btcb.getAddress()],
        owner.address,
        latestBlock ? latestBlock.timestamp + 19000000 : 1
      );
    } else {
      //Implement buy logic to increase the price
    }
  }

  it("CHECK ENVIROMENT: Testing pancake contracts: Excepting good behaviour of router, factory and tokens", async function () {
    const wallets = await ethers.getSigners();
    const owner = wallets[0];
    const usdt_btcb_pair = await factory.getPair(
      btcb.getAddress(),
      usdt.getAddress()
    );
    const amt_btcb_pair = await factory.getPair(
      amt.getAddress(),
      btcb.getAddress()
    );

    console.log("STARTING TEST WITH INITIAL STATE....");
    console.log("BTCB Price: ");
    const btcbPrice = await priceFeeder.getLatestBTCBPrice();
    console.log(btcbPrice);
    console.log("-----------------------------");
    console.log("AMT Price on USDT: ");
    const amtPrice =
      (await router.getAmountOut(
        ethers.parseEther("1"),
        await amt.balanceOf(amt_btcb_pair),
        await btcb.balanceOf(amt_btcb_pair)
      )) * btcbPrice;
    console.log(ethers.formatEther(amtPrice));
  });

  it("UNIT: Owner must be able to set a new price feeder", async function () {
    const wallets = await ethers.getSigners();
    const owner = wallets[0];
    const NewPriceFeeder = await ethers.getContractFactory("PriceFeeder");
    const newPriceFeeder = (await NewPriceFeeder.deploy(
      oracleAMTBTCB.getAddress(),
      amt.getAddress(),
      btcb.getAddress(),
      oracleAMTBTCB.getAddress(),
      factory.getPair(amt.getAddress(), btcb.getAddress())
    )) as PriceFeeder;
    await loanProtocol.setPriceFeeder(newPriceFeeder.getAddress());
    expect(await loanProtocol.getPriceFeederAddress()).to.be.equal(
      await newPriceFeeder.getAddress()
    );
  });

  it("UNIT: Owner must be able to set a new loan ratio", async function () {
    const wallets = await ethers.getSigners();
    const owner = wallets[0];
    await loanProtocol.setLoanRatio(5, 10);
    expect(await loanProtocol.loanRatioMax()).to.be.equal(10);
    expect(await loanProtocol.loanRatioMin()).to.be.equal(5);
  });

  it("UNIT: Users must be able to create loans", async function () {
    const wallets = await ethers.getSigners();
    const [owner, user] = wallets;
    await amt.transfer(user.address, ethers.parseEther("1"));

    //Send USDT to the loan protocol
    await usdt.transfer(loanProtocol.getAddress(), ethers.parseEther("150000"));

    const priceFromPriceFeeder = await priceFeeder.getPrice(
      ethers.parseEther("1")
    );

    const rateMax = await loanProtocol.loanRatioMax();
    const rateMin = await loanProtocol.loanRatioMin();
    const rate = 2n;
    await amt
      .connect(user)
      .approve(loanProtocol.getAddress(), ethers.parseEther("1"));
    await expect(
      loanProtocol.connect(user).createLoan(ethers.parseEther("1"), rate)
    ).to.changeTokenBalances(
      usdt,
      [user.address, await loanProtocol.getAddress()],
      [priceFromPriceFeeder / rate, BigInt(0) - priceFromPriceFeeder / rate]
    );
    await amt
      .connect(user)
      .approve(loanProtocol.getAddress(), ethers.parseEther("1"));
    await expect(
      loanProtocol.connect(user).createLoan(ethers.parseEther("1"), rate)
    ).to.changeTokenBalances(
      amt,
      [user.address, await loanProtocol.getAddress()],
      [BigInt(0) - ethers.parseEther("1"), ethers.parseEther("1")]
    );
  });

  it("UNIT: Users must not create loans with borrowed ammount equal to zero", async function () {
    const wallets = await ethers.getSigners();
    const [owner, user] = wallets;
    await amt.transfer(user.address, ethers.parseEther("1"));

    //Send USDT to the loan protocol
    await usdt.transfer(loanProtocol.getAddress(), ethers.parseEther("150000"));

    const priceFromPriceFeeder = await priceFeeder.getPrice(
      ethers.parseEther("1")
    );

    const rateMax = await loanProtocol.loanRatioMax();
    const rateMin = await loanProtocol.loanRatioMin();
    const rate = 2;

    await amt
      .connect(user)
      .approve(loanProtocol.getAddress(), ethers.parseEther("1"));

    await expect(
      loanProtocol.connect(user).createLoan(10000, rate)
    ).to.revertedWith("Loan ammount too small");
  });

  it("UNIT: Users must not create loans if the protocol has not enougth USDT", async function () {
    const wallets = await ethers.getSigners();
    const [owner, user] = wallets;
    await amt.transfer(user.address, ethers.parseEther("1"));

    const priceFromPriceFeeder = await priceFeeder.getPrice(
      ethers.parseEther("1")
    );

    const rate = 2n;

    //Send USDT to the loan protocol 1 less unit than needed to execute
    await usdt.transfer(
      loanProtocol.getAddress(),
      priceFromPriceFeeder / rate - 1n
    );

    await amt
      .connect(user)
      .approve(loanProtocol.getAddress(), ethers.parseEther("1"));

    await expect(
      loanProtocol.connect(user).createLoan(ethers.parseEther("1"), rate)
    ).to.revertedWith("Loan protocol has not enought balance");
  });

  it("BORDER CASE: Users must be able to create loans if the protocol has exactly the USDT to borrow", async function () {
    const wallets = await ethers.getSigners();
    const [owner, user] = wallets;
    await amt.transfer(user.address, ethers.parseEther("1"));

    const priceFromPriceFeeder = await priceFeeder.getPrice(
      ethers.parseEther("1")
    );

    const rate = 2n;

    //Send USDT to the loan protocol 1 less unit than needed to execute
    await usdt.transfer(loanProtocol.getAddress(), priceFromPriceFeeder / rate);

    await amt
      .connect(user)
      .approve(loanProtocol.getAddress(), ethers.parseEther("1"));

    await expect(
      loanProtocol.connect(user).createLoan(ethers.parseEther("1"), rate)
    ).to.changeTokenBalances(
      amt,
      [user.address, await loanProtocol.getAddress()],
      [BigInt(0) - ethers.parseEther("1"), ethers.parseEther("1")]
    );
  });

  it("UNIT: Loans may be correctly fetched from the contract", async function () {
    const wallets = await ethers.getSigners();
    const [owner, user] = wallets;
    await amt.transfer(user.address, ethers.parseEther("2000"));
    await amt
      .connect(user)
      .approve(loanProtocol.getAddress(), ethers.parseEther("2000"));

    const loansToCreate = ["100", "30", "900"];
    const expectedLoans = [];

    //Send USDT to the loan protocol
    await usdt.transfer(
      loanProtocol.getAddress(),
      ethers.parseEther("1500000")
    );
    for (let amtAmount of loansToCreate) {
      const priceFromPriceFeeder = await priceFeeder.getPrice(
        ethers.parseEther(amtAmount)
      );
      const rate = 2n;
      const expectedLoan = {
        amountBorrowed: priceFromPriceFeeder / rate,
        collateralLocked: ethers.parseEther(amtAmount),
        loanPrice: await priceFeeder.getPrice(ethers.parseEther(amtAmount)),
        loanRatio: rate,
      };
      await loanProtocol
        .connect(user)
        .createLoan(ethers.parseEther(amtAmount), rate);
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
    await amt.transfer(user.address, ethers.parseEther("200"));
    await amt
      .connect(user)
      .approve(loanProtocol.getAddress(), ethers.parseEther("200"));

    const priceFromPriceFeeder = await priceFeeder.getPrice(
      ethers.parseEther("100")
    );
    const rate = 2n;
    //Send USDT to the loan protocol
    await usdt.transfer(loanProtocol.getAddress(), ethers.parseEther("40"));
    await expect(
      loanProtocol.connect(user).createLoan(ethers.parseEther("100"), rate)
    ).to.changeTokenBalances(
      usdt,
      [user.address, await loanProtocol.getAddress()],
      [priceFromPriceFeeder / rate, BigInt(0) - priceFromPriceFeeder / rate]
    );

    await usdt
      .connect(user)
      .approve(loanProtocol.getAddress(), priceFromPriceFeeder / rate);

    await expect(
      loanProtocol.connect(user).closeLoan(0, priceFromPriceFeeder / rate)
    ).to.changeTokenBalances(
      amt,
      [await loanProtocol.getAddress(), user.address],
      [BigInt(0) - ethers.parseEther("100"), ethers.parseEther("100")]
    );

    await expect(
      loanProtocol.connect(user).createLoan(ethers.parseEther("100"), rate)
    ).to.changeTokenBalances(
      usdt,
      [user.address, await loanProtocol.getAddress()],
      [priceFromPriceFeeder / rate, BigInt(0) - priceFromPriceFeeder / rate]
    );
    await usdt
      .connect(user)
      .approve(loanProtocol.getAddress(), priceFromPriceFeeder / rate);
    await expect(
      loanProtocol.connect(user).closeLoan(0, priceFromPriceFeeder / rate)
    ).to.changeTokenBalances(
      usdt,
      [await loanProtocol.getAddress(), user.address],
      [priceFromPriceFeeder / rate, BigInt(0) - priceFromPriceFeeder / rate]
    );
  });

  it("UNIT: User must not be able to repay loan with not enougth USDT", async function () {
    const wallets = await ethers.getSigners();
    const [owner, user] = wallets;
    await amt.transfer(user.address, ethers.parseEther("200"));
    await amt
      .connect(user)
      .approve(loanProtocol.getAddress(), ethers.parseEther("200"));

    const priceFromPriceFeeder = await priceFeeder.getPrice(
      ethers.parseEther("100")
    );
    const rate = 2n;
    //Send USDT to the loan protocol
    await usdt.transfer(loanProtocol.getAddress(), ethers.parseEther("40"));
    await expect(
      loanProtocol.connect(user).createLoan(ethers.parseEther("100"), rate)
    ).to.changeTokenBalances(
      usdt,
      [user.address, await loanProtocol.getAddress()],
      [priceFromPriceFeeder / rate, BigInt(0) - priceFromPriceFeeder / rate]
    );

    await usdt
      .connect(user)
      .approve(loanProtocol.getAddress(), priceFromPriceFeeder / rate);
    await usdt
      .connect(user)
      .transfer(await owner.getAddress(), await usdt.balanceOf(user.address));
    await expect(
      loanProtocol.connect(user).closeLoan(0, priceFromPriceFeeder / rate)
    ).to.revertedWith("Insufficient USDT to repay loan");
  });

  it("UNIT: User must not be able to repay loan with an invalid loan index", async function () {
    const wallets = await ethers.getSigners();
    const [owner, user] = wallets;
    await amt.transfer(user.address, ethers.parseEther("200"));

    //Send USDT to the loan protocol
    await usdt.transfer(loanProtocol.getAddress(), ethers.parseEther("40"));

    await amt
      .connect(user)
      .approve(loanProtocol.getAddress(), ethers.parseEther("200"));

    const priceFromPriceFeeder = await priceFeeder.getPrice(
      ethers.parseEther("100")
    );
    const rate = 2n;

    await expect(
      loanProtocol.connect(user).createLoan(ethers.parseEther("100"), rate)
    ).to.changeTokenBalances(
      usdt,
      [user.address, await loanProtocol.getAddress()],
      [priceFromPriceFeeder / rate, BigInt(0) - priceFromPriceFeeder / rate]
    );

    await usdt
      .connect(user)
      .approve(loanProtocol.getAddress(), ethers.parseEther("100"));

    await expect(
      loanProtocol.connect(user).closeLoan(5, priceFromPriceFeeder / rate)
    ).to.revertedWith("Invalid loan index");
  });

  it("UNIT: User must be able create loan and close in any order", async function () {
    const wallets = await ethers.getSigners();
    const [owner, user] = wallets;
    await amt.transfer(user.address, ethers.parseEther("2000"));
    await amt
      .connect(user)
      .approve(loanProtocol.getAddress(), ethers.parseEther("2000"));

    const loansToCreate = ["100", "30", "900", "70", "500", "400"];
    const expectedLoans = [];

    //Send USDT to the loan protocol
    await usdt.transfer(loanProtocol.getAddress(), ethers.parseEther("1000"));

    for (let amtAmount of loansToCreate) {
      const priceFromPriceFeeder = await priceFeeder.getPrice(
        ethers.parseEther(amtAmount)
      );
      const rate = 2n;

      const expectedLoan = {
        amountBorrowed: priceFromPriceFeeder / rate,
        collateralLocked: ethers.parseEther(amtAmount),
        loanPrice: await priceFeeder.getPrice(ethers.parseEther(amtAmount)),
        loanRatio: rate,
      };
      await loanProtocol
        .connect(user)
        .createLoan(ethers.parseEther(amtAmount), rate);
      expectedLoans.push(expectedLoan);
    }

    await usdt
      .connect(user)
      .approve(loanProtocol.getAddress(), ethers.parseEther("1000"));

    await expect(
      loanProtocol.connect(user).closeLoan(3, expectedLoans[3].amountBorrowed)
    ).to.changeTokenBalances(
      usdt,
      [await loanProtocol.getAddress(), user.address],
      [
        expectedLoans[3].amountBorrowed,
        BigInt(0) - expectedLoans[3].amountBorrowed,
      ]
    );

    await expect(
      loanProtocol.connect(user).closeLoan(3, expectedLoans[5].amountBorrowed)
    ).to.changeTokenBalances(
      usdt,
      [await loanProtocol.getAddress(), user.address],
      [
        expectedLoans[5].amountBorrowed,
        BigInt(0) - expectedLoans[5].amountBorrowed,
      ]
    );

    await expect(
      loanProtocol.connect(user).closeLoan(1, expectedLoans[1].amountBorrowed)
    ).to.changeTokenBalances(
      usdt,
      [await loanProtocol.getAddress(), user.address],
      [
        expectedLoans[1].amountBorrowed,
        BigInt(0) - expectedLoans[1].amountBorrowed,
      ]
    );

    await expect(
      loanProtocol.connect(user).closeLoan(2, expectedLoans[2].amountBorrowed)
    ).to.changeTokenBalances(
      usdt,
      [await loanProtocol.getAddress(), user.address],
      [
        expectedLoans[2].amountBorrowed,
        BigInt(0) - expectedLoans[2].amountBorrowed,
      ]
    );

    await expect(
      loanProtocol.connect(user).closeLoan(0, expectedLoans[0].amountBorrowed)
    ).to.changeTokenBalances(
      usdt,
      [await loanProtocol.getAddress(), user.address],
      [
        expectedLoans[0].amountBorrowed,
        BigInt(0) - expectedLoans[0].amountBorrowed,
      ]
    );

    await expect(
      loanProtocol.connect(user).closeLoan(0, expectedLoans[4].amountBorrowed)
    ).to.changeTokenBalances(
      usdt,
      [await loanProtocol.getAddress(), user.address],
      [
        expectedLoans[4].amountBorrowed,
        BigInt(0) - expectedLoans[4].amountBorrowed,
      ]
    );
  });

  it("UNIT: isLoanLiquidable must return the right values", async function () {
    const wallets = await ethers.getSigners();
    const [owner, user] = wallets;
    await amt
      .connect(user)
      .approve(loanProtocol.getAddress(), ethers.parseEther("1"));

    //Send USDT to the loan protocol
    await usdt.transfer(
      loanProtocol.getAddress(),
      ethers.parseEther("1500000")
    );
    const priceFromPriceFeeder = await priceFeeder.getPrice(
      ethers.parseEther("1")
    );

    const rate = 2n;
    await amt
      .connect(user)
      .approve(loanProtocol.getAddress(), ethers.parseEther("1"));
    await expect(
      loanProtocol.connect(user).createLoan(ethers.parseEther("1"), rate)
    ).to.changeTokenBalances(
      usdt,
      [user.address, await loanProtocol.getAddress()],
      [priceFromPriceFeeder / rate, BigInt(0) - priceFromPriceFeeder / rate]
    );

    const userLoans = await loanProtocol.getUserLoans(user.address);

    expect(await loanProtocol.isLoanLiquidable(0, user.address)).to.be.equal(
      false
    );

    await movePriceToTarget(
      ethers.formatEther(
        userLoans[0].loanPrice / userLoans[0].loanRatio - 100000000n
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
      .approve(loanProtocol.getAddress(), ethers.parseEther("1"));

    //Send USDT to the loan protocol
    await usdt.transfer(
      loanProtocol.getAddress(),
      ethers.parseEther("1500000")
    );
    const priceFromPriceFeeder = await priceFeeder.getPrice(
      ethers.parseEther("1")
    );

    const rate = 2n;
    await amt
      .connect(user)
      .approve(loanProtocol.getAddress(), ethers.parseEther("1"));
    await expect(
      loanProtocol.connect(user).createLoan(ethers.parseEther("1"), rate)
    ).to.changeTokenBalances(
      usdt,
      [user.address, await loanProtocol.getAddress()],
      [priceFromPriceFeeder / rate, BigInt(0) - priceFromPriceFeeder / rate]
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
      .approve(loanProtocol.getAddress(), ethers.parseEther("1"));

    //Send USDT to the loan protocol
    await usdt.transfer(
      loanProtocol.getAddress(),
      ethers.parseEther("1500000")
    );
    const priceFromPriceFeeder = await priceFeeder.getPrice(
      ethers.parseEther("1")
    );

    const rate = 2n;
    await amt
      .connect(user)
      .approve(loanProtocol.getAddress(), ethers.parseEther("1"));
    await expect(
      loanProtocol.connect(user).createLoan(ethers.parseEther("1"), rate)
    ).to.changeTokenBalances(
      usdt,
      [user.address, await loanProtocol.getAddress()],
      [priceFromPriceFeeder / rate, BigInt(0) - priceFromPriceFeeder / rate]
    );

    const userLoans = await loanProtocol.getUserLoans(user.address);

    expect(await loanProtocol.isLoanLiquidable(0, user.address)).to.be.equal(
      false
    );
    await movePriceToTarget(
      ethers.formatEther(
        userLoans[0].loanPrice / userLoans[0].loanRatio - 1000000n
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
      [owner.address, await loanProtocol.getAddress()],
      [userLoans[0].collateralLocked, BigInt(0) - userLoans[0].collateralLocked]
    );
    const userLoansPostClosing = await loanProtocol.getUserLoans(user.address);

    expect(userLoansPostClosing.length).to.be.equal(0);
  });

  it("UNIT: Owner must be able to liquidate the specific loan in liquidation condition when user has multiple loans and not liquidate the others", async function () {
    const wallets = await ethers.getSigners();
    const [owner, user] = wallets;
    await amt.transfer(user.address, ethers.parseEther("2000"));

    await amt
      .connect(user)
      .approve(loanProtocol.getAddress(), ethers.parseEther("2000"));

    const loansToCreate = ["100", "30", "900", "70", "500", "400"];
    const expectedLoans = [];

    //Send USDT to the loan protocol
    await usdt.transfer(loanProtocol.getAddress(), ethers.parseEther("100000"));

    //We will create two loans at the current price
    for (let i = 0; i < 2; i++) {
      const amtAmount = loansToCreate[i];
      const priceFromPriceFeeder = await priceFeeder.getPrice(
        ethers.parseEther(amtAmount)
      );
      const rate = 2n;
      const expectedLoan = {
        amountBorrowed: priceFromPriceFeeder / rate,
        collateralLocked: ethers.parseEther(amtAmount),
        loanPrice: await priceFeeder.getPrice(ethers.parseEther(amtAmount)),
        loanRatio: rate,
      };
      await loanProtocol
        .connect(user)
        .createLoan(ethers.parseEther(amtAmount), rate);
      expectedLoans.push(expectedLoan);
    }

    const liquidationPrice =
      (expectedLoans[0].amountBorrowed * BigInt("1000000000000000000")) /
      expectedLoans[0].collateralLocked;
    //We will change the price to the liquidation zone of the first two loans
    await movePriceToTarget(ethers.formatEther(liquidationPrice));

    //Let's update the oracle to update the price feeder
    await advanceTime(3600);
    await oracleAMTBTCB.update();
    await advanceTime(3600);
    await oracleAMTBTCB.update();

    //We will create the rest of the loans at the new price
    for (let i = 2; i < loansToCreate.length; i++) {
      const amtAmount = loansToCreate[i];
      const priceFromPriceFeeder = await priceFeeder.getPrice(
        ethers.parseEther(amtAmount)
      );
      const rate = 2n;

      const expectedLoan = {
        amountBorrowed: priceFromPriceFeeder / rate,
        collateralLocked: ethers.parseEther(amtAmount),
        loanPrice: await priceFeeder.getPrice(ethers.parseEther(amtAmount)),
        loanRatio: rate,
      };
      await loanProtocol
        .connect(user)
        .createLoan(ethers.parseEther(amtAmount), rate);
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
      [owner.address, await loanProtocol.getAddress()],
      [
        expectedLoans[1].collateralLocked,
        BigInt(0) - expectedLoans[1].collateralLocked,
      ]
    );

    await expect(
      loanProtocol.liquidateLoan(0, user.address)
    ).changeTokenBalances(
      amt,
      [owner.address, await loanProtocol.getAddress()],
      [
        expectedLoans[0].collateralLocked,
        BigInt(0) - expectedLoans[0].collateralLocked,
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
          loanProtocol.getAddress(),
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
        [user.address, await loanProtocol.getAddress()],
        [
          userLoansAfterLiquidations[userLoansAfterLiquidations.length - i - 1]
            .collateralLocked,
          BigInt(0) -
            userLoansAfterLiquidations[
              userLoansAfterLiquidations.length - i - 1
            ].collateralLocked,
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
    await amt.transfer(user.address, ethers.parseEther("200"));
    await amt
      .connect(user)
      .approve(loanProtocol.getAddress(), ethers.parseEther("200"));

    const priceFromPriceFeeder = await priceFeeder.getPrice(
      ethers.parseEther("100")
    );
    const rate = 2n;
    //Send USDT to the loan protocol
    await usdt.transfer(loanProtocol.getAddress(), ethers.parseEther("40"));
    await expect(
      loanProtocol.connect(user).createLoan(ethers.parseEther("100"), rate)
    ).to.changeTokenBalances(
      usdt,
      [user.address, await loanProtocol.getAddress()],
      [priceFromPriceFeeder / rate, BigInt(0) - priceFromPriceFeeder / rate]
    );

    await usdt
      .connect(user)
      .approve(loanProtocol.getAddress(), priceFromPriceFeeder / rate);

    const usdtToReturn = priceFromPriceFeeder / rate - ethers.parseEther("10");
    await expect(
      loanProtocol.connect(user).closeLoan(0, usdtToReturn)
    ).to.changeTokenBalances(
      amt,
      [await loanProtocol.getAddress(), user.address],
      [
        BigInt(0) -
          (ethers.parseEther("100") * usdtToReturn) /
            (priceFromPriceFeeder / rate),
        (ethers.parseEther("100") * usdtToReturn) /
          (priceFromPriceFeeder / rate),
      ]
    );
  });

  it("UNIT: User must be able to partial close a loan and then close the complete loan", async function () {
    const wallets = await ethers.getSigners();
    const [owner, user] = wallets;
    await amt.transfer(user.address, ethers.parseEther("200"));
    await amt
      .connect(user)
      .approve(loanProtocol.getAddress(), ethers.parseEther("200"));

    const priceFromPriceFeeder = await priceFeeder.getPrice(
      ethers.parseEther("100")
    );
    const rate = 2n;
    //Send USDT to the loan protocol
    await usdt.transfer(loanProtocol.getAddress(), ethers.parseEther("40"));
    await expect(
      loanProtocol.connect(user).createLoan(ethers.parseEther("100"), rate)
    ).to.changeTokenBalances(
      usdt,
      [user.address, await loanProtocol.getAddress()],
      [priceFromPriceFeeder / rate, BigInt(0) - priceFromPriceFeeder / rate]
    );

    await usdt
      .connect(user)
      .approve(loanProtocol.getAddress(), priceFromPriceFeeder / rate);

    const usdtToReturn = priceFromPriceFeeder / rate - ethers.parseEther("10");
    await expect(
      loanProtocol.connect(user).closeLoan(0, usdtToReturn)
    ).to.changeTokenBalances(
      amt,
      [await loanProtocol.getAddress(), user.address],
      [
        BigInt(0) -
          (ethers.parseEther("100") * usdtToReturn) /
            (priceFromPriceFeeder / rate),
        (ethers.parseEther("100") * usdtToReturn) /
          (priceFromPriceFeeder / rate),
      ]
    );

    const amtToBeReturnedInTotalClose =
      ethers.parseEther("100") -
      (ethers.parseEther("100") * usdtToReturn) / (priceFromPriceFeeder / rate);
    await expect(
      loanProtocol
        .connect(user)
        .closeLoan(0, priceFromPriceFeeder / rate - usdtToReturn)
    ).to.changeTokenBalances(
      amt,
      [await loanProtocol.getAddress(), user.address],
      [BigInt(0) - amtToBeReturnedInTotalClose, amtToBeReturnedInTotalClose]
    );
  });

  it("UNIT: Close loan transaction must revert if amount exceds amount borrowed", async function () {
    const wallets = await ethers.getSigners();
    const [owner, user] = wallets;
    await amt.transfer(user.address, ethers.parseEther("200"));
    await amt
      .connect(user)
      .approve(loanProtocol.getAddress(), ethers.parseEther("200"));

    const priceFromPriceFeeder = await priceFeeder.getPrice(
      ethers.parseEther("100")
    );
    const rate = 2n;
    //Send USDT to the loan protocol
    await usdt.transfer(loanProtocol.getAddress(), ethers.parseEther("40"));
    await expect(
      loanProtocol.connect(user).createLoan(ethers.parseEther("100"), rate)
    ).to.changeTokenBalances(
      usdt,
      [user.address, await loanProtocol.getAddress()],
      [priceFromPriceFeeder / rate, BigInt(0) - priceFromPriceFeeder / rate]
    );

    await usdt
      .connect(user)
      .approve(loanProtocol.getAddress(), priceFromPriceFeeder / 2n + 1n); // One more unit to revert the operation

    await expect(
      loanProtocol.connect(user).closeLoan(0, priceFromPriceFeeder / 2n + 1n) // One more unit to revert the operation
    ).to.revertedWith("Amount exceds borrowed amount");
  });

  it("EVENTs CHECK: Loan creation must emmit event with correct params", async function () {
    const wallets = await ethers.getSigners();
    const [owner, user] = wallets;
    await amt.transfer(user.address, ethers.parseEther("200"));

    //Send USDT to the loan protocol
    await usdt.transfer(loanProtocol.getAddress(), ethers.parseEther("150000"));

    const priceFromPriceFeeder = await priceFeeder.getPrice(
      ethers.parseEther("200")
    );
    const rate = 2n;

    await amt
      .connect(user)
      .approve(loanProtocol.getAddress(), ethers.parseEther("200"));

    await expect(
      loanProtocol.connect(user).createLoan(ethers.parseEther("200"), rate)
    )
      .to.emit(loanProtocol, "LoanCreated")
      .withArgs(
        user.address,
        priceFromPriceFeeder / rate,
        ethers.parseEther("200")
      );
  });

  it("EVENTs CHECK: Events of close and partial close must be emmited correctly", async function () {
    const wallets = await ethers.getSigners();
    const [owner, user] = wallets;
    await amt.transfer(user.address, ethers.parseEther("200"));
    await amt
      .connect(user)
      .approve(loanProtocol.getAddress(), ethers.parseEther("200"));

    const priceFromPriceFeeder = await priceFeeder.getPrice(
      ethers.parseEther("100")
    );
    const rate = 2n;
    //Send USDT to the loan protocol
    await usdt.transfer(loanProtocol.getAddress(), ethers.parseEther("40"));
    await expect(
      loanProtocol.connect(user).createLoan(ethers.parseEther("100"), rate)
    ).to.changeTokenBalances(
      usdt,
      [user.address, await loanProtocol.getAddress()],
      [priceFromPriceFeeder / rate, BigInt(0) - priceFromPriceFeeder / rate]
    );

    await usdt
      .connect(user)
      .approve(loanProtocol.getAddress(), priceFromPriceFeeder / rate);

    const usdtToReturn = priceFromPriceFeeder / rate - ethers.parseEther("10");
    await expect(loanProtocol.connect(user).closeLoan(0, usdtToReturn))
      .to.emit(loanProtocol, "LoanPartialClosed")
      .withArgs(
        user.address,
        usdtToReturn,
        (ethers.parseEther("100") * usdtToReturn) /
          (priceFromPriceFeeder / rate)
      );

    const amtToBeReturnedInTotalClose =
      ethers.parseEther("100") -
      (ethers.parseEther("100") * usdtToReturn) / (priceFromPriceFeeder / rate);
    await expect(
      loanProtocol
        .connect(user)
        .closeLoan(0, priceFromPriceFeeder / rate - usdtToReturn)
    )
      .to.emit(loanProtocol, "LoanClosed")
      .withArgs(
        user.address,
        priceFromPriceFeeder / rate - usdtToReturn,
        amtToBeReturnedInTotalClose
      );
  });

  it("UNIT: pauseAdmin must be able to pause loan protocol", async function () {
    const wallets = await ethers.getSigners();
    const [owner, user] = wallets;

    await loanProtocol.emergencyStop();
    await expect(loanProtocol.connect(user).createLoan(1, 2)).to.revertedWith(
      "Pausable: paused"
    );
  });

  it("UNIT: owner must  able to set a new pause admin", async function () {
    const wallets = await ethers.getSigners();
    const [owner, user, newPauseAdmin] = wallets;

    await loanProtocol.setPauseAdmin(newPauseAdmin.address);
    await loanProtocol.connect(newPauseAdmin).emergencyStop();
    await expect(loanProtocol.connect(user).createLoan(1, 2)).to.revertedWith(
      "Pausable: paused"
    );
  });

  it("UNIT: pause admin must be able to resume operations", async function () {
    const wallets = await ethers.getSigners();
    const [owner, user, newPauseAdmin] = wallets;

    await loanProtocol.setPauseAdmin(newPauseAdmin.address);
    await loanProtocol.connect(newPauseAdmin).emergencyStop();
    await expect(loanProtocol.connect(user).createLoan(1, 2)).to.revertedWith(
      "Pausable: paused"
    );
    const rate = 2n;
    loanProtocol.connect(newPauseAdmin).resumeOperations();
    usdt.transfer(loanProtocol.getAddress(), ethers.parseEther("1000"));
    await amt
      .connect(user)
      .approve(loanProtocol.getAddress(), ethers.parseEther("1"));
    await expect(
      loanProtocol.connect(user).createLoan(ethers.parseEther("1"), rate)
    ).to.changeTokenBalance(
      amt,
      user.address,
      BigInt(0) - ethers.parseEther("1")
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
    await amt.transfer(user1.address, ethers.parseEther("2000"));
    await amt.transfer(user2.address, ethers.parseEther("2000"));
    await amt.transfer(user3.address, ethers.parseEther("2000"));

    //Approvals for to the Loan protocol
    await amt
      .connect(user1)
      .approve(loanProtocol.getAddress(), ethers.parseEther("2000"));

    await amt
      .connect(user2)
      .approve(loanProtocol.getAddress(), ethers.parseEther("2000"));

    await amt
      .connect(user3)
      .approve(loanProtocol.getAddress(), ethers.parseEther("2000"));

    const priceFromPriceFeeder = await priceFeeder.getPrice(
      ethers.parseEther("2000")
    );
    const rate = 2n;

    //Send USDT to the loan protocol
    await usdt.transfer(loanProtocol.getAddress(), ethers.parseEther("6000"));

    //Create loans to give the loan protocol a total ammount of 6000 AMT
    await expect(
      loanProtocol.connect(user1).createLoan(ethers.parseEther("2000"), rate)
    ).to.changeTokenBalances(
      usdt,
      [user1.address, await loanProtocol.getAddress()],
      [priceFromPriceFeeder / rate, BigInt(0) - priceFromPriceFeeder / rate]
    );

    await expect(
      loanProtocol.connect(user2).createLoan(ethers.parseEther("2000"), rate)
    ).to.changeTokenBalances(
      usdt,
      [user2.address, await loanProtocol.getAddress()],
      [priceFromPriceFeeder / rate, BigInt(0) - priceFromPriceFeeder / rate]
    );

    await expect(
      loanProtocol.connect(user3).createLoan(ethers.parseEther("2000"), rate)
    ).to.changeTokenBalances(
      usdt,
      [user3.address, await loanProtocol.getAddress()],
      [priceFromPriceFeeder / rate, BigInt(0) - priceFromPriceFeeder / rate]
    );

    //Payment to master contract
    await btcb.approve(master.getAddress(), ethers.parseEther("100"));
    await master.payRent(ethers.parseEther("100"), 1);

    const rentToHolders = (ethers.parseEther("100") * 99n) / 100n; // 1% goes to the vault
    const rentToLoanProtocol =
      (rentToHolders * (await amt.balanceOfAt(loanProtocol.getAddress(), 1))) /
      (await amt.totalSupplyAt(1));
    await expect(loanProtocol.charge(1)).to.changeTokenBalances(
      btcb,
      [await master.getAddress(), owner.address],
      [BigInt(0) - rentToLoanProtocol, rentToLoanProtocol]
    );
  });

  it("UNIT: owner must be able to withdraw USDT from the loan protocol", async function () {
    const wallets = await ethers.getSigners();
    const [owner] = wallets;

    //Send USDT to the loan protocol
    await usdt.transfer(loanProtocol.getAddress(), ethers.parseEther("6000"));

    await expect(
      loanProtocol.withdrawlUsdt(ethers.parseEther("1000"))
    ).to.changeTokenBalances(
      usdt,
      [await loanProtocol.getAddress(), owner.address],
      [BigInt(0) - ethers.parseEther("1000"), ethers.parseEther("1000")]
    );

    await expect(
      loanProtocol.withdrawlUsdt(ethers.parseEther("5000"))
    ).to.changeTokenBalances(
      usdt,
      [await loanProtocol.getAddress(), owner.address],
      [BigInt(0) - ethers.parseEther("5000"), ethers.parseEther("5000")]
    );
  });

  it("UNIT: owner must not be able to withdraw USDT if the protocol has not enought usdt", async function () {
    const wallets = await ethers.getSigners();
    const [owner] = wallets;

    //Send USDT to the loan protocol
    await usdt.transfer(loanProtocol.getAddress(), ethers.parseEther("6000"));

    await expect(
      loanProtocol.withdrawlUsdt(ethers.parseEther("1000"))
    ).to.changeTokenBalances(
      usdt,
      [await loanProtocol.getAddress(), owner.address],
      [BigInt(0) - ethers.parseEther("1000"), ethers.parseEther("1000")]
    );

    await expect(
      loanProtocol.withdrawlUsdt(ethers.parseEther("5000"))
    ).to.changeTokenBalances(
      usdt,
      [await loanProtocol.getAddress(), owner.address],
      [BigInt(0) - ethers.parseEther("5000"), ethers.parseEther("5000")]
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
        usdt.getAddress(),
        amt.getAddress(),
        master.getAddress(),
        priceFeeder.getAddress(),
        2,
        2,
        5
      )
    ).to.revertedWith("Btcb address must not be the zero address");

    //USDT zero address
    LoanProtocol = await ethers.getContractFactory("LoanProtocol");
    await expect(
      LoanProtocol.deploy(
        btcb.getAddress(),
        addressZero,
        amt.getAddress(),
        master.getAddress(),
        priceFeeder.getAddress(),
        2,
        2,
        5
      )
    ).to.revertedWith("Usdt address must not be the zero address");

    //AMT zero address
    LoanProtocol = await ethers.getContractFactory("LoanProtocol");
    await expect(
      LoanProtocol.deploy(
        btcb.getAddress(),
        usdt.getAddress(),
        addressZero,
        master.getAddress(),
        priceFeeder.getAddress(),
        2,
        2,
        5
      )
    ).to.revertedWith("Amt address must not be the zero address");

    //Master zero address
    LoanProtocol = await ethers.getContractFactory("LoanProtocol");
    await expect(
      LoanProtocol.deploy(
        btcb.getAddress(),
        usdt.getAddress(),
        amt.getAddress(),
        addressZero,
        priceFeeder.getAddress(),
        2,
        2,
        5
      )
    ).to.revertedWith("Master address must not be the zero address");

    //Price feeder zero address
    LoanProtocol = await ethers.getContractFactory("LoanProtocol");
    await expect(
      LoanProtocol.deploy(
        btcb.getAddress(),
        usdt.getAddress(),
        amt.getAddress(),
        master.getAddress(),
        addressZero,
        2,
        2,
        5
      )
    ).to.revertedWith("Price feeder address must not be the zero address");

    //Loan ratio as zero
    LoanProtocol = await ethers.getContractFactory("LoanProtocol");
    await expect(
      LoanProtocol.deploy(
        btcb.getAddress(),
        usdt.getAddress(),
        amt.getAddress(),
        master.getAddress(),
        priceFeeder.getAddress(),
        0,
        2,
        5
      )
    ).to.revertedWith("Loan ratio must not be zero");
  });
  it("UNIT: Users must not be able to create loans with amount 0", async function () {
    const wallets = await ethers.getSigners();
    const [owner, user] = wallets;
    await amt.transfer(user.address, ethers.parseEther("1"));
    const rate = 2n;
    //Send USDT to the loan protocol
    await usdt.transfer(loanProtocol.getAddress(), ethers.parseEther("150000"));
    await amt
      .connect(user)
      .approve(loanProtocol.getAddress(), ethers.parseEther("1"));

    await expect(
      loanProtocol.connect(user).createLoan(0, rate)
    ).to.revertedWith("amtAmount must be greatter than zero");
  });

  it("UNIT: Users must not be able to create loans with not enought AMT", async function () {
    const wallets = await ethers.getSigners();
    const [owner, user] = wallets;
    const rate = 2n;
    amt
      .connect(user)
      .transfer(owner.address, await amt.balanceOf(user.address));
    //Send USDT to the loan protocol
    await usdt.transfer(loanProtocol.getAddress(), ethers.parseEther("150000"));
    await amt
      .connect(user)
      .approve(loanProtocol.getAddress(), ethers.parseEther("1"));

    await expect(
      loanProtocol.connect(user).createLoan(ethers.parseEther("1"), rate)
    ).to.revertedWith("Not enought AMT balance");
  });

  it("UNIT: User must not be able to partial close a loan returning 0 amt", async function () {
    const wallets = await ethers.getSigners();
    const [owner, user] = wallets;
    await amt.transfer(user.address, ethers.parseEther("200"));
    await amt
      .connect(user)
      .approve(loanProtocol.getAddress(), ethers.parseEther("200"));

    const priceFromPriceFeeder = await priceFeeder.getPrice(
      ethers.parseEther("100")
    );
    const rate = 2n;
    //Send USDT to the loan protocol
    await usdt.transfer(loanProtocol.getAddress(), ethers.parseEther("40"));
    await expect(
      loanProtocol.connect(user).createLoan(ethers.parseEther("100"), rate)
    ).to.changeTokenBalances(
      usdt,
      [user.address, await loanProtocol.getAddress()],
      [priceFromPriceFeeder / rate, BigInt(0) - priceFromPriceFeeder / rate]
    );

    await usdt
      .connect(user)
      .approve(loanProtocol.getAddress(), priceFromPriceFeeder / rate);

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
    await expect(loanProtocol.setLoanRatio(0, 1)).to.revertedWith(
      "Loan ratio must be greatter than zero"
    );
  });
});
