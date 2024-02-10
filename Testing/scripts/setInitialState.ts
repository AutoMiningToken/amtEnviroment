// deployPancakeSwapV2.ts

import { ethers } from "hardhat";
import {
  Amt,
  BurnVault,
  IPancakeFactory,
  LiquidityAmt,
  Master,
  PancakeFactory,
  PancakePair,
  TestERC20,
} from "../typechain-types";
import { ERC20, PancakeRouter } from "../typechain-types";

//TokenConfig: Represents individual token configurations.
interface TokenConfig {
  name: string;
  symbol: string;
  supply: string;
}

interface Balances {
  [tokenSymbol: string]: string;
}

interface LiquidityPair {
  [tokenSymbol: string]: string;
}

interface Liquidity {
  [pair: string]: LiquidityPair;
}

interface Config {
  tokens: TokenConfig[];
  initialBalances: Balances[];
  liquidity: Liquidity;
}

async function main(
  config: Config,
  usdt: TestERC20,
  btcb: TestERC20,
  amt: Amt,
  liqAmt: LiquidityAmt,
  burnVault: BurnVault,
  master: Master,
  router: PancakeRouter,
  factory: PancakeFactory
) {
  const wallets = await ethers.getSigners();
  const owner = wallets[0];
  for (const token of config.tokens) {
    if (token.symbol == "USDT") {
      await usdt.mint(owner.getAddress(), ethers.parseEther(token.supply));
    }
    if (token.symbol == "BTCB") {
      await btcb.mint(owner.getAddress(), ethers.parseEther(token.supply));
    }
    if (token.symbol == "AMT") {
      await master.mintMaster(
        owner.getAddress(),
        ethers.parseEther(token.supply)
      );
    }
  }

  for (const pairName in config.liquidity) {
    if (pairName == "USDT_BTCB") {
      await usdt.approve(
        router.getAddress(),
        ethers.parseEther(config.liquidity[pairName]["USDT"])
      );
      await btcb.approve(
        router.getAddress(),
        ethers.parseEther(config.liquidity[pairName]["BTCB"])
      );
      const latestBlock = await ethers.provider.getBlock("latest");
      await router.addLiquidity(
        usdt.getAddress(),
        btcb.getAddress(),
        ethers.parseEther(config.liquidity[pairName]["USDT"]),
        ethers.parseEther(config.liquidity[pairName]["BTCB"]),
        0,
        0,
        owner.getAddress(),
        latestBlock ? latestBlock.timestamp + 19000000 : 190000000
      );
    }
    if (pairName == "AMT_BTCB") {
      await amt.approve(
        router.getAddress(),
        ethers.parseEther(config.liquidity[pairName]["AMT"])
      );
      await btcb.approve(
        router.getAddress(),
        ethers.parseEther(config.liquidity[pairName]["BTCB"])
      );
      const latestBlock = await ethers.provider.getBlock("latest");
      await router.addLiquidity(
        amt.getAddress(),
        btcb.getAddress(),
        ethers.parseEther(config.liquidity[pairName]["AMT"]),
        ethers.parseEther(config.liquidity[pairName]["BTCB"]),
        0,
        0,
        owner.getAddress(),
        latestBlock ? latestBlock.timestamp + 19000000 : 190000000
      );
    }

    config.initialBalances.forEach(async (balance, index) => {
      for (const token in balance) {
        if (token == "AMT") {
          await amt.transfer(
            wallets[index + 1].getAddress(),
            ethers.parseEther(balance[token])
          );
        }
        if (token == "BTCB") {
          await btcb.transfer(
            wallets[index + 1].getAddress(),
            ethers.parseEther(balance[token])
          );
        }
        if (token == "USDT") {
          await usdt.transfer(
            wallets[index + 1].getAddress(),
            ethers.parseEther(balance[token])
          );
        }
      }
    });
  }
}

module.exports = main;
