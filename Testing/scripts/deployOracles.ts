// deployOracles.ts

import { ethers } from "hardhat";

import {
  Amt,
  ERC20,
  PancakeFactory,
  PriceFeeder,
  LoanProtocol,
  MockChainlinkOracle,
  Master,
} from "../typechain-types";
async function main(
  factory: PancakeFactory,
  usdt: ERC20,
  btcb: ERC20,
  amt: Amt,
  master: Master,
  onChain: boolean
) {
  ethers;
  const wallets = await ethers.getSigners();
  const owner = wallets[0];

  const Oracle = await ethers.getContractFactory("Oracle");

  const oracleAMTBTCB = await Oracle.deploy(
    factory.getAddress(),
    amt.getAddress(),
    btcb.getAddress()
  );

  await oracleAMTBTCB.waitForDeployment();

  const MockChainlinkOracle = await ethers.getContractFactory(
    "MockChainlinkOracle"
  );
  const chainLinkMocked = await MockChainlinkOracle.deploy(4728805000000);
  await chainLinkMocked.waitForDeployment();
  const chainlinkOracle = onChain
    ? await ethers.getContractAt(
        "MockChainlinkOracle",
        "0x264990fbd0a4796a3e3d8e37c4d5f87a3aca5ebf"
      )
    : chainLinkMocked;

  const PriceFeeder = await ethers.getContractFactory("PriceFeeder");
  const priceFeeder = await PriceFeeder.deploy(
    oracleAMTBTCB.getAddress(),
    amt.getAddress(),
    btcb.getAddress(),
    chainlinkOracle.getAddress(),
    factory.getPair(amt.getAddress(), btcb.getAddress())
  );
  await priceFeeder.waitForDeployment();

  const LoanProtocol = await ethers.getContractFactory("LoanProtocol");
  const loanProtocol = await LoanProtocol.deploy(
    btcb.getAddress(),
    usdt.getAddress(),
    amt.getAddress(),
    master.getAddress(),
    priceFeeder.getAddress(),
    50,
    80
  );

  await loanProtocol.waitForDeployment();

  return {
    oracleAMTBTCB,
    priceFeeder,
    loanProtocol,
  };
}

module.exports = main;
