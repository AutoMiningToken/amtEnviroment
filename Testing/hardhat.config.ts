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
    overrides: {
      "contracts/IUniswapV2Router01.sol": {
        version: "0.6.2",
        settings: {},
      },
      "contracts/Pancake-exchange-contracts/contracts/libraries/SafeMath.sol": {
        version: "0.6.6",
        settings: {},
      },
      "contracts/Pancake-exchange-contracts/contracts/libraries/PancakeLibrary.sol":
        {
          version: "0.6.6",
          settings: {},
        },
      "contracts/mockedContracts/FixedPointOriginal.sol": {
        version: "0.5.16",
        settings: {},
      },
    },

    settings: { optimizer: { enabled: true, runs: 2000 } },
  },

  networks: {
    hardhat: {
      gas: "auto",
      blockGasLimit: 9000000000000000,
      allowUnlimitedContractSize: true,
      accounts: {
        accountsBalance: "9000000000000000000000000000000",
        count: 300,
      },
    },
  },
};

export default config;
