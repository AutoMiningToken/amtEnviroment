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
describe("Tests of price feeder contract", function () {
  //This values need to be updated to work
  const btcbPrice = 45000;
  const amtPrice = "0.48";

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
        0, // This is a placeholder; in reality, you'd calculate a minimum amount out based on allowable slippage.
        [amt.address, btcb.address],
        owner.address,
        (await ethers.provider.getBlock("latest")).timestamp + 19000000
      );
    } else {
      //Implement buy logic to increase the price
    }
  }

  it("UNIT: Get latest BTCB price must return a correct value", async function () {
    //Actual BTCB price (Need to be updated to work)

    expect(await priceFeeder.getLatestBTCBPrice()).to.be.closeTo(
      btcbPrice,
      1000
    );
  });

  it("UNIT: Price Feeder must return the correct value in usdt quoting amt", async function () {
    //Actual AMT price (Need to be updated to work)

    expect(
      await priceFeeder.getPrice(ethers.utils.parseEther("1"))
    ).to.be.closeTo(
      ethers.utils.parseEther(amtPrice),
      ethers.utils.parseEther("0.01")
    );
  });

  it("UNIT: Price Feeder must return the price (using the oracle as upper limit) in case of a big buy event", async function () {
    const wallets = await ethers.getSigners();
    const owner = wallets[0];
    //Actual AMT price (Need to be updated to work)
    await btcb.approve(router.address, ethers.utils.parseEther("100"));
    await router.swapExactTokensForTokens(
      ethers.utils.parseEther("100"),
      0,
      [btcb.address, amt.address],
      owner.address,
      (await ethers.provider.getBlock("latest")).timestamp + 19000000
    );

    expect(
      await priceFeeder.getPrice(ethers.utils.parseEther("1"))
    ).to.be.closeTo(
      ethers.utils.parseEther(amtPrice),
      ethers.utils.parseEther("0.01")
    );
  });

  it("UNIT: Price Feeder must return the price (using quote as upper limit) in case of a big sell event", async function () {
    const wallets = await ethers.getSigners();
    const owner = wallets[0];
    const priceTarget = "0.2";
    await movePriceToTarget(priceTarget);

    expect(
      await priceFeeder.getPrice(ethers.utils.parseEther("1"))
    ).to.be.closeTo(
      ethers.utils.parseEther(priceTarget),
      ethers.utils.parseEther("0.01")
    );
  });

  it("UNIT: Constructor requires for zero address in parameters", async function () {
    const wallets = await ethers.getSigners();
    const owner = wallets[0];
    const addressZero = "0x0000000000000000000000000000000000000000";

    const PriceFeeder = await ethers.getContractFactory("PriceFeeder");
    await expect(
      PriceFeeder.deploy(
        addressZero,
        amt.address,
        btcb.address,
        btcb.address,
        factory.getPair(amt.address, btcb.address)
      )
    ).to.revertedWith("Oracle AMTBTCB must not be the zero address");

    await expect(
      PriceFeeder.deploy(
        oracleAMTBTCB.address,
        addressZero,
        btcb.address,
        btcb.address,
        factory.getPair(amt.address, btcb.address)
      )
    ).to.revertedWith("Amt must not be the zero address");

    await expect(
      PriceFeeder.deploy(
        oracleAMTBTCB.address,
        amt.address,
        addressZero,
        btcb.address,
        factory.getPair(amt.address, btcb.address)
      )
    ).to.revertedWith("Btcb must not be the zero address");

    await expect(
      PriceFeeder.deploy(
        oracleAMTBTCB.address,
        amt.address,
        btcb.address,
        addressZero,
        factory.getPair(amt.address, btcb.address)
      )
    ).to.revertedWith("priceFeedUSDTBTCB must not be the zero address");

    await expect(
      PriceFeeder.deploy(
        oracleAMTBTCB.address,
        amt.address,
        btcb.address,
        btcb.address,
        addressZero
      )
    ).to.revertedWith("Pair AMTBTCB must not be the zero address");
  });
});
