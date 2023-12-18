import { ethers, network } from "hardhat";
import chai from "chai";
import {
  ERC20,
  LiquidityAmt,
  LoanProtocol,
  Master,
  PancakeFactory,
  PancakePair,
  PancakeRouter,
  PriceFeeder,
  TestERC20,
  TestLiqPoolAndRouter,
  WBNB,
  Amt,
  BurnVault,
} from "../typechain-types";

import { BigNumber } from "ethers";
import { BigNumber as nativeBigNumber } from "bignumber.js";
import fs from "fs";
import { Oracle } from "../typechain-types";
const { expect } = chai;
const deployPancake = require("../scripts/deployPancakeSwapV2");
const deployExternalToken = require("../scripts/deployExternalTokens");
const mainDeploy = require("../scripts/deployMainAmtContracts");
const setInitialState = require("../scripts/setInitialState");
const deployOracles = require("../scripts/deployOracles");
const loadAmtSystem = require("../scripts/loadAmtSystem");

describe("Tests with deploy from external scripts", function () {
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
  let pair: PancakePair;
  this.beforeEach(async function () {
    ({ usdt, btcb, factory, router, pair, amt, liqAmt, burnVault, master } =
      await loadAmtSystem());

    ({ oracleUSDTBTCB, oracleAMTBTCB, priceFeeder, loanProtocol } =
      await deployOracles(factory, usdt, btcb, amt));
    await advanceTime(3600);
    await oracleAMTBTCB.update();
    await oracleUSDTBTCB.update();
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
    const scaledActualPriceOfAmtInBtcb = btcbReserves
      .mul(oneEth)
      .div(amtReserves);
    const wantedPriceOfAmtInBtcb = targetPriceUSDT
      .mul(oneEth)
      .div(priceOfBTCBinUSDT);

    const prevDeltaX = k.mul(oneEth).div(wantedPriceOfAmtInBtcb);
    const deltaX = new nativeBigNumber(prevDeltaX.toString()).sqrt();
    const amtToTrade = amtReserves
      .sub(BigNumber.from(deltaX.toFixed(0)))
      .mul(10013) //Add a little bit extra to pass fee structure
      .div(10000);

    return amtToTrade;
  }

  async function movePriceToTarget(
    targetPriceInUSDT: string // The target price of AMT in USDT
  ) {
    const wallets = await ethers.getSigners();
    const owner = wallets[0];
    // Fetch the current reserves from the pool
    const priceOfBTCBinUSDT = await oracleUSDTBTCB.consult(
      btcb.address,
      ethers.utils.parseEther("1")
    );
    const pairAMTBTCB = await factory.getPair(amt.address, btcb.address);
    let reserveAMT = await amt.balanceOf(pairAMTBTCB);
    let reserveBTCB = await btcb.balanceOf(pairAMTBTCB);

    const currentPriceAMTinUSDT = priceOfBTCBinUSDT
      .mul(reserveBTCB)
      .div(reserveAMT);

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

  it("CHECK ENVIROMENT: Testing pancake contracts: Excepting good behaviour of router, factory and tokens", async function () {
    const wallets = await ethers.getSigners();
    const owner = wallets[0];

    console.log("STARTING TEST WITH INITIAL STATE....");
    const btcbPrice = await priceFeeder.getLatestBTCBPrice();
    const amtPrice = await priceFeeder.getPrice(ethers.utils.parseEther("1"));

    await advanceTime(3600);
    await oracleAMTBTCB.update();
    await oracleUSDTBTCB.update();
    console.log("BTCB Price: ", btcbPrice);
    console.log("AMT Price: ", ethers.utils.formatEther(amtPrice));
  });
});
