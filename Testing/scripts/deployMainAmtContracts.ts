// deployMainAmtContracts.ts

import { ethers } from "hardhat";
import { ERC20, PancakeRouter } from "../typechain-types";
async function main(btcb: ERC20, router: PancakeRouter) {
  const wallets = await ethers.getSigners();
  const owner = wallets[0];

  const AMT = await ethers.getContractFactory("Amt");
  const amt = await AMT.deploy();
  await amt.deployed();

  const LIQAMT = await ethers.getContractFactory("LiquidityAmt");
  const liqAmt = await LIQAMT.deploy();
  await liqAmt.deployed();

  const BURNVAULT = await ethers.getContractFactory("BurnVault");
  const burnVault = await BURNVAULT.deploy(amt.address, btcb.address);
  await burnVault.deployed();

  const MASTER = await ethers.getContractFactory("Master");
  const master = await MASTER.deploy(
    amt.address,
    btcb.address,
    burnVault.address,
    liqAmt.address,
    owner.address,
    router.address
  );

  await amt.transferOwnership(master.address);
  await liqAmt.transferOwnership(master.address);

  await master.mintMaster(owner.address, ethers.utils.parseEther("51000000"));
  // Return deployed contracts for use in tests
  return {
    amt,
    liqAmt,
    burnVault,
    master,
  };
}

module.exports = main;
