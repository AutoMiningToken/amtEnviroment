import { ethers, run } from "hardhat";
import contractAddresses from "./contractAddresses";

async function main() {
  const wallets = await ethers.getSigners();
  const owner = wallets[0];

  const Oracle = await ethers.getContractFactory("Oracle");

  const oracleAMTBTCB = await Oracle.deploy(
    contractAddresses.Factory,
    contractAddresses.Amt,
    contractAddresses.Btcb,
    { gasLimit: 10000000 }
  );

  await oracleAMTBTCB.deployed();

  const PriceFeeder = await ethers.getContractFactory("PriceFeeder");
  const priceFeeder = await PriceFeeder.deploy(
    oracleAMTBTCB.address,
    contractAddresses.Amt,
    contractAddresses.Btcb,
    contractAddresses.chainLinkOracle,
    contractAddresses.LiqPool, // Pair address,
    { gasLimit: 10000000 }
  );
  await priceFeeder.deployed();

  const LoanProtocol = await ethers.getContractFactory("LoanProtocol");
  const loanProtocol = await LoanProtocol.deploy(
    contractAddresses.Btcb,
    contractAddresses.Usdt,
    contractAddresses.Amt,
    contractAddresses.Master,
    priceFeeder.address,
    2,
    { gasLimit: 10000000 }
  );

  await loanProtocol.deployed();

  // Verify Oracle contract
  await run("verify:verify", {
    address: oracleAMTBTCB.address,
    constructorArguments: [
      contractAddresses.Factory,
      contractAddresses.Amt,
      contractAddresses.Btcb,
    ],
  });

  // Verify PriceFeeder contract
  await run("verify:verify", {
    address: priceFeeder.address,
    constructorArguments: [
      oracleAMTBTCB.address,
      contractAddresses.Amt,
      contractAddresses.Btcb,
      contractAddresses.chainLinkOracle,
      contractAddresses.LiqPool, // Pair address
    ],
  });

  // Verify LoanProtocol contract
  await run("verify:verify", {
    address: loanProtocol.address,
    constructorArguments: [
      contractAddresses.Btcb,
      contractAddresses.Usdt,
      contractAddresses.Amt,
      contractAddresses.Master,
      priceFeeder.address,
      2,
    ],
  });
  console.log("Contracts deployed");
  console.log("OracleAMTBTCB: ", oracleAMTBTCB.address);
  console.log("priceFeeder: ", priceFeeder.address);
  console.log("loanProtocol: ", loanProtocol.address);
  return {
    oracleAMTBTCB,
    priceFeeder,
    loanProtocol,
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
