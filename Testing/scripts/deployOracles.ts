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
  master: Master
) {
  const wallets = await ethers.getSigners();
  const owner = wallets[0];

  const Oracle = await ethers.getContractFactory("Oracle");

  const oracleAMTBTCB = await Oracle.deploy(
    factory.address,
    amt.address,
    btcb.address
  );

  await oracleAMTBTCB.deployed();

  const MockChainlinkOracle = await ethers.getContractFactory(
    "MockChainlinkOracle"
  );

  const chainlinkOracle = await ethers.getContractAt(
    "MockChainlinkOracle",
    "0x264990fbd0a4796a3e3d8e37c4d5f87a3aca5ebf"
  );

  const PriceFeeder = await ethers.getContractFactory("PriceFeeder");
  const priceFeeder = await PriceFeeder.deploy(
    oracleAMTBTCB.address,
    amt.address,
    btcb.address,
    chainlinkOracle.address,
    factory.getPair(amt.address, btcb.address)
  );
  await priceFeeder.deployed();

  const LoanProtocol = await ethers.getContractFactory("LoanProtocol");
  const loanProtocol = await LoanProtocol.deploy(
    btcb.address,
    usdt.address,
    amt.address,
    master.address,
    priceFeeder.address,
    2,
    2,
    3
  );

  await loanProtocol.deployed();

  return {
    oracleAMTBTCB,
    priceFeeder,
    loanProtocol,
  };
}

module.exports = main;
