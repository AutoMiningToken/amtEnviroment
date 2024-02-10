// deployPancakeSwapV2.ts

import { ethers } from "hardhat";
import { PancakePair, TestERC20 } from "../typechain-types";
async function main(usdt: TestERC20, btcb: TestERC20) {
  const wallets = await ethers.getSigners();
  const owner = wallets[0];

  const Factory = await ethers.getContractFactory("PancakeFactory");
  const factory = await Factory.deploy(owner.getAddress(), {
    gasLimit: 9000000000000000,
  });

  await factory.waitForDeployment();

  const WBNB = await ethers.getContractFactory("WBNB");
  const wbnb = await WBNB.deploy();
  await wbnb.waitForDeployment();
  const Router = await ethers.getContractFactory("PancakeRouter");
  const router = await Router.deploy(factory.getAddress(), wbnb.getAddress(), {
    gasLimit: 9000000000000000,
  });
  await router.waitForDeployment();
  await factory.createPair(usdt.getAddress(), btcb.getAddress());
  const pair: PancakePair = await ethers.getContractAt(
    "PancakePair",
    await factory.getPair(usdt.getAddress(), btcb.getAddress())
  );

  // Return deployed contracts for use in tests
  return {
    factory,
    router,
    wbnb,
  };
}

module.exports = main;
