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
} from "../typechain-types";
import { Amt } from "../typechain-types";
import { BurnVault } from "../typechain-types";
import { BigNumber as nativeBigNumber } from "bignumber.js";
import fs from "fs";
import { Oracle } from "../typechain-types";
import { BigNumberish } from "ethers";
const { expect } = chai;
const deployPancake = require("./deployPancakeSwapV2");
const deployExternalToken = require("./deployExternalTokens");
const mainDeploy = require("./deployMainAmtContracts");
const setInitialState = require("./setInitialState");
const deployOracles = require("./deployOracles");

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

async function advanceTime(time: number) {
  await network.provider.send("evm_increaseTime", [time]);
  await network.provider.send("evm_mine");
}
async function main() {
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
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
