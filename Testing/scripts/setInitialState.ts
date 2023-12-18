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
      await usdt.mint(owner.address, ethers.utils.parseEther(token.supply));
    }
    if (token.symbol == "BTCB") {
      await btcb.mint(owner.address, ethers.utils.parseEther(token.supply));
    }
    if (token.symbol == "AMT") {
      await master.mintMaster(
        owner.address,
        ethers.utils.parseEther(token.supply)
      );
    }
  }

  for (const pairName in config.liquidity) {
    if (pairName == "USDT_BTCB") {
      await usdt.approve(
        router.address,
        ethers.utils.parseEther(config.liquidity[pairName]["USDT"])
      );
      await btcb.approve(
        router.address,
        ethers.utils.parseEther(config.liquidity[pairName]["BTCB"])
      );
      await router.addLiquidity(
        usdt.address,
        btcb.address,
        ethers.utils.parseEther(config.liquidity[pairName]["USDT"]),
        ethers.utils.parseEther(config.liquidity[pairName]["BTCB"]),
        0,
        0,
        owner.address,
        (await ethers.provider.getBlock("latest")).timestamp + 19000000
      );
    }
    if (pairName == "AMT_BTCB") {
      await amt.approve(
        router.address,
        ethers.utils.parseEther(config.liquidity[pairName]["AMT"])
      );
      await btcb.approve(
        router.address,
        ethers.utils.parseEther(config.liquidity[pairName]["BTCB"])
      );
      await router.addLiquidity(
        amt.address,
        btcb.address,
        ethers.utils.parseEther(config.liquidity[pairName]["AMT"]),
        ethers.utils.parseEther(config.liquidity[pairName]["BTCB"]),
        0,
        0,
        owner.address,
        (await ethers.provider.getBlock("latest")).timestamp + 19000000
      );
    }

    config.initialBalances.forEach(async (balance, index) => {
      for (const token in balance) {
        if (token == "AMT") {
          await amt.transfer(
            wallets[index + 1].address,
            ethers.utils.parseEther(balance[token])
          );
        }
        if (token == "BTCB") {
          await btcb.transfer(
            wallets[index + 1].address,
            ethers.utils.parseEther(balance[token])
          );
        }
        if (token == "USDT") {
          await usdt.transfer(
            wallets[index + 1].address,
            ethers.utils.parseEther(balance[token])
          );
        }
      }
    });
  }
}

module.exports = main;
