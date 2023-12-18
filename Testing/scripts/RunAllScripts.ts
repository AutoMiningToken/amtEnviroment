const deployPancake = require("../scripts/deployPancakeSwapV2");
const deployExternalToken = require("../scripts/deployExternalTokens");
const mainDeploy = require("../scripts/deployMainAmtContracts");
const setInitialState = require("../scripts/setInitialState");
const deployOracles = require("../scripts/deployOracles");
import { BigNumber } from "ethers";
import { BigNumber as nativeBigNumber } from "bignumber.js";
import fs from "fs";
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
  Amt,
  BurnVault,
  Oracle,
} from "../typechain-types";

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

async function runAll() {
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
  ({ oracleUSDTBTCB, oracleAMTBTCB, priceFeeder, loanProtocol } =
    await deployOracles(factory, usdt, btcb, amt));
}

runAll().then(() => {
  console.log("terminamo");
});
