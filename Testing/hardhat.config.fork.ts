import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      { version: "0.5.0" },
      { version: "0.8.9" },
      { version: "0.6.6" },
      { version: "0.5.16" },
      { version: "0.4.18" },
    ],

    settings: { optimizer: { enabled: true, runs: 1000 } },
    overrides: {
      "@uniswap/lib/contracts/libraries/FixedPoint.sol": {
        version: "0.5.0",
        settings: { optimizer: { enabled: true, runs: 1000 } },
      },
      "@uniswap/lib/contracts/libraries/FullMath.sol": {
        version: "0.5.0",
        settings: { optimizer: { enabled: true, runs: 1000 } },
      },
      "@uniswap/lib/contracts/libraries/BitMath.sol": {
        version: "0.5.0",
        settings: { optimizer: { enabled: true, runs: 1000 } },
      },
    },
  },
  paths: {
    tests: "./testForked",
  },
  networks: {
    hardhat: {
      gas: "auto",
      blockGasLimit: 9000000000000000,
      allowUnlimitedContractSize: true,

      forking: {
        url: "https://bsc-dataseed1.binance.org/",
      },

      accounts: {
        accountsBalance: "9000000000000000000000000000000",
        count: 300,
      },
    },
  },
};

export default config;
