import { ethers, run } from "hardhat";
import contractAddresses from "./contractAddresses";

async function main() {
  const wallets = await ethers.getSigners();
  const owner = wallets[0];
  const gasPrice = await ethers.provider.getGasPrice();
  const Oracle = await ethers.getContractFactory("Oracle");

  const oracleAMTBTCB = await Oracle.getDeployTransaction(
    contractAddresses.Factory,
    contractAddresses.Amt,
    contractAddresses.Btcb
  );
  const gasEstimateoracleAMTBTCB = await ethers.provider.estimateGas(
    oracleAMTBTCB
  );
  console.log(
    `Oracle Estimated Gas: ${ethers.utils.formatEther(
      gasEstimateoracleAMTBTCB.mul(gasPrice).toString()
    )}`
  );

  const PriceFeeder = await ethers.getContractFactory("PriceFeeder");
  const priceFeeder = await PriceFeeder.getDeployTransaction(
    contractAddresses.Amt,
    contractAddresses.Amt,
    contractAddresses.Btcb,
    contractAddresses.chainLinkOracle,
    contractAddresses.LiqPool // Pair address
  );
  const gasEstimateoraclepriceFeeder = await ethers.provider.estimateGas(
    priceFeeder
  );
  console.log(
    `Price feeder Estimated Gas: ${ethers.utils.formatEther(
      gasEstimateoraclepriceFeeder.mul(gasPrice).toString()
    )}`
  );

  const LoanProtocol = await ethers.getContractFactory("LoanProtocol");
  const loanProtocol = await LoanProtocol.getDeployTransaction(
    contractAddresses.Btcb,
    contractAddresses.Usdt,
    contractAddresses.Amt,
    contractAddresses.Master,
    contractAddresses.Master,
    2
  );
  const gasEstimateoracleLoanProtocol = await ethers.provider.estimateGas(
    loanProtocol
  );
  console.log(
    `Loan protocolEstimated Gas: ${ethers.utils.formatEther(
      gasEstimateoracleLoanProtocol.mul(gasPrice).toString()
    )}`
  );

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
