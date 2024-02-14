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

  await oracleAMTBTCB.waitForDeployment();

  const PriceFeeder = await ethers.getContractFactory("PriceFeeder");
  const priceFeeder = await PriceFeeder.deploy(
    await oracleAMTBTCB.getAddress(),
    contractAddresses.Amt,
    contractAddresses.Btcb,
    contractAddresses.chainLinkOracle,
    contractAddresses.LiqPool, // Pair address,
    { gasLimit: 10000000 }
  );
  await priceFeeder.waitForDeployment();

  const LoanProtocol = await ethers.getContractFactory("LoanProtocol");
  const loanProtocol = await LoanProtocol.deploy(
    contractAddresses.Btcb,
    contractAddresses.Usdt,
    contractAddresses.Amt,
    contractAddresses.Master,
    await priceFeeder.getAddress(),
    50,
    80,
    { gasLimit: 10000000 }
  );

  await loanProtocol.waitForDeployment();

  // Verify Oracle contract
  await run("verify:verify", {
    address: await oracleAMTBTCB.getAddress(),
    constructorArguments: [
      contractAddresses.Factory,
      contractAddresses.Amt,
      contractAddresses.Btcb,
    ],
  });

  // Verify PriceFeeder contract
  await run("verify:verify", {
    address: await priceFeeder.getAddress(),
    constructorArguments: [
      await oracleAMTBTCB.getAddress(),
      contractAddresses.Amt,
      contractAddresses.Btcb,
      contractAddresses.chainLinkOracle,
      contractAddresses.LiqPool, // Pair address
    ],
  });

  // Verify LoanProtocol contract
  await run("verify:verify", {
    address: await loanProtocol.getAddress(),
    constructorArguments: [
      contractAddresses.Btcb,
      contractAddresses.Usdt,
      contractAddresses.Amt,
      contractAddresses.Master,
      await priceFeeder.getAddress(),
      50,
      80,
    ],
  });
  console.log("Contracts deployed");
  console.log("OracleAMTBTCB: ", await oracleAMTBTCB.getAddress());
  console.log("priceFeeder: ", await priceFeeder.getAddress());
  console.log("loanProtocol: ", await loanProtocol.getAddress());
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
