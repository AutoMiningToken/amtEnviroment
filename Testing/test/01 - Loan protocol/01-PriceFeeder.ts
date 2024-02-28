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
import fs from "fs";
import { Oracle } from "../../typechain-types";
import contractAddresses from "../../Addresses/contractAddresses";
import { BigNumber as nativeBigNumber } from "bignumber.js";
import { Networkish } from "ethers";

const { expect } = chai;
const deployPancake = require("../../scripts/deployPancakeSwapV2");
const deployExternalToken = require("../../scripts/deployExternalTokens");
const mainDeploy = require("../../scripts/deployMainAmtContracts");
const setInitialState = require("../../scripts/setInitialState");
const deployOracles = require("../../scripts/deployOracles");
describe("Tests of price feeder contract", function () {
  //This values need to be updated to work
  const localTest = true;
  let btcbPrice = 51700;
  let amtPrice = "0.559550";

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

  const BSC_URL = "https://bsc.meowrpc.com";
  this.beforeEach(async function () {
    if (!localTest) {
      const bscProvider = new ethers.JsonRpcProvider(BSC_URL);
      const latestBlock = (await bscProvider.getBlockNumber()) - 100;

      await network.provider.send("hardhat_reset", [
        {
          forking: {
            jsonRpcUrl: BSC_URL,
            blockNumber: latestBlock,
          },
        },
      ]);
    }

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
      !localTest
    ));

    if (localTest) {
      btcbPrice = 47288;
      amtPrice = "0.51";
    }
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

  it("UNIT: Get latest BTCB price must return a correct value", async function () {
    //Actual BTCB price (Need to be updated to work)

    expect(await priceFeeder.getLatestBTCBPrice()).to.be.closeTo(
      btcbPrice,
      1000
    );
  });

  it("UNIT: Price Feeder must return the correct value in usdt quoting amt", async function () {
    //Actual AMT price (Need to be updated to work)

    expect(await priceFeeder.getPrice(ethers.parseEther("1"))).to.be.closeTo(
      ethers.parseEther(amtPrice),
      ethers.parseEther("0.01")
    );
  });

  it("UNIT: Price Feeder must return the price (using the oracle as upper limit) in case of a big buy event", async function () {
    const wallets = await ethers.getSigners();
    const owner = wallets[0];

    await btcb.approve(router.getAddress(), ethers.parseEther("100"));
    const latestBlock = await ethers.provider.getBlock("latest");
    await router.swapExactTokensForTokens(
      ethers.parseEther("100"),
      0,
      [btcb.getAddress(), amt.getAddress()],
      owner.address,
      latestBlock ? latestBlock.timestamp + 19000000 : 1
    );

    expect(await priceFeeder.getPrice(ethers.parseEther("1"))).to.be.closeTo(
      ethers.parseEther(amtPrice),
      ethers.parseEther("0.01")
    );
  });

  it("UNIT: Price Feeder must return the price (using quote as upper limit) in case of a big sell event", async function () {
    const wallets = await ethers.getSigners();
    const owner = wallets[0];
    const priceTarget = "0.2";
    await movePriceToTarget(priceTarget);

    expect(await priceFeeder.getPrice(ethers.parseEther("1"))).to.be.closeTo(
      ethers.parseEther(priceTarget),
      ethers.parseEther("0.01")
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
        amt.getAddress(),
        btcb.getAddress(),
        btcb.getAddress(),
        factory.getPair(amt.getAddress(), btcb.getAddress())
      )
    ).to.revertedWith("Oracle AMTBTCB must not be the zero address");

    await expect(
      PriceFeeder.deploy(
        oracleAMTBTCB.getAddress(),
        addressZero,
        btcb.getAddress(),
        btcb.getAddress(),
        factory.getPair(amt.getAddress(), btcb.getAddress())
      )
    ).to.revertedWith("Amt must not be the zero address");

    await expect(
      PriceFeeder.deploy(
        oracleAMTBTCB.getAddress(),
        amt.getAddress(),
        addressZero,
        btcb.getAddress(),
        factory.getPair(amt.getAddress(), btcb.getAddress())
      )
    ).to.revertedWith("Btcb must not be the zero address");

    await expect(
      PriceFeeder.deploy(
        oracleAMTBTCB.getAddress(),
        amt.getAddress(),
        btcb.getAddress(),
        addressZero,
        factory.getPair(amt.getAddress(), btcb.getAddress())
      )
    ).to.revertedWith("priceFeedUSDTBTCB must not be the zero address");

    await expect(
      PriceFeeder.deploy(
        oracleAMTBTCB.getAddress(),
        amt.getAddress(),
        btcb.getAddress(),
        btcb.getAddress(),
        addressZero
      )
    ).to.revertedWith("Pair AMTBTCB must not be the zero address");
  });

  it("UNIT: Price Feeder must work with extreme (big) amount operations", async function () {
    const wallets = await ethers.getSigners();
    const owner = wallets[0];
    const btcbPrice = await priceFeeder.getLatestBTCBPrice();
    const pairAddress = await factory.getPair(
      amt.getAddress(),
      btcb.getAddress()
    );
    const amtPoolBalance = await amt.balanceOf(pairAddress);
    const btcbPoolBalance = await btcb.balanceOf(pairAddress);
    expect(await priceFeeder.getPrice(amtPoolBalance * 10n)).to.be.closeTo(
      btcbPoolBalance * btcbPrice,
      (btcbPoolBalance * btcbPrice * 100n) / 99n // 10% margin to total BTCB balance of pool
    );
  });

  it("UNIT: Price feeder getPrice must revert with amountIn equal to zero", async function () {
    await expect(priceFeeder.getPrice(0)).to.revertedWith("Invalid amountIn");
  });
});
