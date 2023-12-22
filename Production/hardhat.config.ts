import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomiclabs/hardhat-etherscan";
require("dotenv").config();
const config: HardhatUserConfig = {
  networks: {
    bsc: {
      url: "https://binance.llamarpc.com",
      accounts: [`0x${process.env.PRIVATE_KEY}`],
    },
  },
  etherscan: {
    apiKey: {
      bsc: process.env.BSCSCAN_API_KEY
        ? process.env.BSCSCAN_API_KEY
        : "undefined",
    },
  },
  solidity: {
    compilers: [
      { version: "0.8.9" },
      { version: "0.6.6" },
      { version: "0.5.16" },
      { version: "0.4.18" },
    ],
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
};

export default config;
