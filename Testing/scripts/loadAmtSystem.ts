//loadAmtSystem.ts

import contractAddresses from "../Addresses/contractAddresses";

//For tests over a forked mainnet network or mainnet deploy
import { ethers } from "hardhat";
async function main() {
  const wallets = await ethers.getSigners();
  const owner = wallets[0];

  const usdt = await ethers.getContractAt("ERC20", contractAddresses.Usdt);
  const btcb = await ethers.getContractAt("ERC20", contractAddresses.Btcb);

  const factory = await ethers.getContractAt(
    "IPancakeFactory",
    contractAddresses.Factory
  );

  const router = await ethers.getContractAt(
    "PancakeRouter",
    contractAddresses.Router
  );
  const pair = await ethers.getContractAt(
    "PancakePair",
    contractAddresses.LiqPool
  );

  const amt = await ethers.getContractAt("Amt", contractAddresses.Amt);

  const liqAmt = await ethers.getContractAt(
    "LiquidityAmt",
    contractAddresses.LiqAmt
  );

  const burnVault = await ethers.getContractAt(
    "BurnVault",
    contractAddresses.burnVault
  );

  const master = await ethers.getContractAt("Master", contractAddresses.Master);

  return {
    usdt,
    btcb,
    factory,
    router,
    pair,
    amt,
    liqAmt,
    burnVault,
    master,
  };
}

module.exports = main;
