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
      ((amtReserves - BigInt(deltaX.toFixed(0))) * 10020n) / 10000n;

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
        0, // This is a placeholder; in reality, you'd calculate a minimum amount out based on allowable slippage.
        [amt.getAddress(), btcb.getAddress()],
        owner.address,
        latestBlock ? latestBlock.timestamp + 19000000 : 1
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

  it("UNIT: Not owner must not be able to update oracle", async function () {
    const wallets = await ethers.getSigners();
    const notOwner = wallets[1];
    await expect(oracleAMTBTCB.connect(notOwner).update()).to.revertedWith(
      "Ownable: caller is not the owner"
    );
  });

  it("UNIT: Consult must revert with wrong token addresses", async function () {
    await expect(oracleAMTBTCB.consult(usdt.getAddress(), 1)).to.revertedWith(
      "Oracle: INVALID_TOKEN"
    );
  });

  it("UNIT: Constructor must fail with pairs without liquidity", async function () {
    const NewOracle = await ethers.getContractFactory("Oracle");
    const TokenA = await ethers.getContractFactory("TestERC20");
    const tokenA = await TokenA.deploy(0, "Token A", "A");
    await tokenA.waitForDeployment();
    const TokenB = await ethers.getContractFactory("TestERC20");
    const tokenB = await TokenB.deploy(0, "Token B", "B");
    await tokenB.waitForDeployment();
    await factory.createPair(tokenA.getAddress(), tokenB.getAddress());

    await expect(
      NewOracle.deploy(
        factory.getAddress(),
        tokenA.getAddress(),
        tokenB.getAddress()
      )
    ).to.revertedWith("Oracle: NO_RESERVES");
  });
});
