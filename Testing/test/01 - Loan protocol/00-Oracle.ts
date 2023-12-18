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
describe("Tests of Oracle contract", function () {
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
  this.beforeEach(async function () {
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

  it("UNIT: Owner must not be able to update oracle if period not elapsed", async function () {
    await expect(oracleAMTBTCB.update()).to.revertedWith(
      "Oracle: PERIOD_NOT_ELAPSED"
    );
  });

  it("UNIT: Consult must revert with wrong token addresses", async function () {
    await expect(oracleAMTBTCB.consult(usdt.address, 1)).to.revertedWith(
      "Oracle: INVALID_TOKEN"
    );
  });

  it("UNIT: Constructor must fail with pairs without liquidity", async function () {
    const NewOracle = await ethers.getContractFactory("Oracle");
    const TokenA = await ethers.getContractFactory("TestERC20");
    const tokenA = await TokenA.deploy(0, "Token A", "A");
    await tokenA.deployed();
    const TokenB = await ethers.getContractFactory("TestERC20");
    const tokenB = await TokenB.deploy(0, "Token B", "B");
    await tokenB.deployed();
    await factory.createPair(tokenA.address, tokenB.address);

    await expect(
      NewOracle.deploy(factory.address, tokenA.address, tokenB.address)
    ).to.revertedWith("Oracle: NO_RESERVES");
  });
});
