// deployMainAmtContracts.ts

import { ethers } from "hardhat";
import { ERC20, PancakeRouter } from "../typechain-types";
async function main(btcb: ERC20, router: PancakeRouter) {
  const wallets = await ethers.getSigners();
  const owner = wallets[0];

  const AMT = await ethers.getContractFactory("Amt");
  const amt = await AMT.deploy();
  await amt.waitForDeployment();

  const LIQAMT = await ethers.getContractFactory("LiquidityAmt");
  const liqAmt = await LIQAMT.deploy();
  await liqAmt.waitForDeployment();

  const BURNVAULT = await ethers.getContractFactory("BurnVault");
  const burnVault = await BURNVAULT.deploy(amt.getAddress(), btcb.getAddress());
  await burnVault.waitForDeployment();

  const MASTER = await ethers.getContractFactory("Master");
  const master = await MASTER.deploy(
    amt.getAddress(),
    btcb.getAddress(),
    burnVault.getAddress(),
    liqAmt.getAddress(),
    owner.getAddress(),
    router.getAddress()
  );

  await amt.transferOwnership(master.getAddress());
  await liqAmt.transferOwnership(master.getAddress());

  await master.mintMaster(owner.getAddress(), ethers.parseEther("51000000"));
  // Return deployed contracts for use in tests
  return {
    amt,
    liqAmt,
    burnVault,
    master,
  };
}

module.exports = main;
