// deployExternalTokens.ts

import { ethers } from "hardhat";
async function main() {
  const wallets = await ethers.getSigners();
  const owner = wallets[0];

  const USDT = await ethers.getContractFactory("TestERC20");
  const usdt = await USDT.deploy(0, "USD Tether", "USDT");
  await usdt.waitForDeployment();
  const BTCB = await ethers.getContractFactory("TestERC20");
  const btcb = await USDT.deploy(0, "Bitcoin B", "BTCB");
  await btcb.waitForDeployment();

  // Return deployed contracts for use in tests
  return {
    usdt,
    btcb,
  };
}

module.exports = main;
