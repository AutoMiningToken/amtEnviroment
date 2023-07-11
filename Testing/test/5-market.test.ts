import { ethers } from "hardhat";
import chai from "chai";
import { TestERC20 } from "../typechain-types";
import { Market } from "../typechain-types";
import { TestMaster } from "../typechain-types";
import { BigNumber } from "ethers";

const { expect } = chai;

describe("Market", function () {
  let amt: TestERC20;
  let btcb: TestERC20;
  let usdt: TestERC20;
  let market: Market;
  let masterTrucho: TestMaster;
  beforeEach(async function () {
    const [owner] = await ethers.getSigners();
    const Btcb = await ethers.getContractFactory("TestERC20");
    btcb = (await Btcb.deploy(1000000000)) as TestERC20;
    await btcb.deployed();

    const Amt = await ethers.getContractFactory("TestERC20");
    amt = (await Amt.deploy(1000000000)) as TestERC20;
    await amt.deployed();

    const Usdt = await ethers.getContractFactory("TestERC20");
    usdt = (await Usdt.deploy(1000000000)) as TestERC20;
    await usdt.deployed();

    const MasterTrucho = await ethers.getContractFactory("TestMaster");
    masterTrucho = (await MasterTrucho.deploy(btcb.address)) as TestMaster;
    await masterTrucho.deployed();

    const Market = await ethers.getContractFactory("Market");
    market = (await Market.deploy(
      amt.address,
      masterTrucho.address,
      35,
      10,
      owner.address,
      btcb.address,
      usdt.address
    )) as Market;
  });

  it("Owner must be able to change rate", async function () {
    const [owner] = await ethers.getSigners();
    await market.setRate(15);
    expect(await market.usdPer100Amt()).to.equal(15);
  });

  it("Owner must not  be able to set 0 as rate", async function () {
    const [owner] = await ethers.getSigners();
    await expect(market.setRate(0)).to.revertedWith(
      "Rate must be greater than 0"
    );
  });

  it("User should be able to buy at defined rate", async function () {
    const [owner, user] = await ethers.getSigners();

    //Send tokens to market to be able to execute exchanges
    await usdt.transfer(market.address, 1000000);
    await amt.transfer(market.address, 2857 * 2); //Border case emptying the market

    //Send tokens to user to be able to buy
    await usdt.transfer(user.address, 2000);

    //User approve usdt to be expended by market
    await usdt.connect(user).approve(market.address, 100000);

    const usdtToSend = BigNumber.from(1000);
    const expectedAmtToRecive = usdtToSend
      .mul(100)
      .div(await market.usdPer100Amt());

    await expect(market.connect(user).buy(usdtToSend)).to.changeTokenBalances(
      amt,
      [user.address, market.address],
      [expectedAmtToRecive, -expectedAmtToRecive]
    );
    await expect(market.connect(user).buy(usdtToSend)).to.changeTokenBalances(
      usdt,
      [user.address, owner.address],
      [-usdtToSend, usdtToSend]
    );
  });

  it("User must not be able to buy with not enough usdt", async function () {
    const [owner, user] = await ethers.getSigners();

    //Send tokens to market to be able to execute exchanges
    await usdt.transfer(market.address, 1000000);
    await amt.transfer(market.address, 1000000);

    //Send tokens to user to be able to buy
    await usdt.transfer(user.address, 1000);

    //User approve usdt to be expended by market
    await usdt.connect(user).approve(market.address, 100000);

    const usdtToSend = BigNumber.from(1001);
    const expectedAmtToRecive = usdtToSend
      .mul(100)
      .div(await market.usdPer100Amt());

    await expect(market.connect(user).buy(usdtToSend)).to.revertedWith(
      "User doesn't have enough USDT"
    );
  });

  it("User must not be able to buy more amt than the market balance", async function () {
    const [owner, user] = await ethers.getSigners();

    //Send tokens to market to be able to execute exchanges
    await usdt.transfer(market.address, 1000000);
    await amt.transfer(market.address, 100);

    //Send tokens to user to be able to buy
    await usdt.transfer(user.address, 1000);

    //User approve usdt to be expended by market
    await usdt.connect(user).approve(market.address, 100000);

    const usdtToSend = BigNumber.from(1000);
    const expectedAmtToRecive = usdtToSend
      .mul(100)
      .div(await market.usdPer100Amt());

    await expect(market.connect(user).buy(usdtToSend)).to.revertedWith(
      "Market doesn't have enough AMT"
    );
  });

  it("Buy function must emmit event with correct params", async function () {
    const [owner, user] = await ethers.getSigners();

    //Send tokens to market to be able to execute exchanges
    await usdt.transfer(market.address, 1000000);
    await amt.transfer(market.address, 1000000);

    //Send tokens to user to be able to buy
    await usdt.transfer(user.address, 1000);

    //User approve usdt to be expended by market
    await usdt.connect(user).approve(market.address, 100000);

    const usdtToSend = BigNumber.from(1000);
    const expectedAmtToRecive = usdtToSend
      .mul(100)
      .div(await market.usdPer100Amt());

    await expect(market.connect(user).buy(usdtToSend))
      .to.emit(market, "amtBought")
      .withArgs(usdtToSend,expectedAmtToRecive);
  });

  it("User should be able to sell at defined rate paying the fee", async function () {
    const [owner, user] = await ethers.getSigners();
    //Send tokens to market to be able to execute exchanges
    await usdt.transfer(market.address, 1000000);
    await amt.transfer(market.address, 1000000);

    //Send tokens to user to be able to sell
    await amt.transfer(user.address, 10000);

    //User approve amt to be expended by market
    await amt.connect(user).approve(market.address, 100000);

    const amtToSend = BigNumber.from(100);
    const expectedUsdtToRecive = amtToSend
      .mul(35)
      .div(100)
      .mul(1000 - 10)
      .div(1000);
    await expect(market.connect(user).sell(amtToSend)).to.changeTokenBalances(
      usdt,
      [user.address, market.address],
      [expectedUsdtToRecive, -expectedUsdtToRecive]
    );
    await expect(market.connect(user).sell(amtToSend)).to.changeTokenBalances(
      amt,
      [user.address, owner.address],
      [-amtToSend, amtToSend]
    );
  });

  it("User must not be able to buy with not enough amt ", async function () {
    const [owner, user] = await ethers.getSigners();
    //Send tokens to market to be able to execute exchanges
    await usdt.transfer(market.address, 1000000);
    await amt.transfer(market.address, 1000000);

    //Send tokens to user to be able to sell
    await amt.transfer(user.address, 10000);

    //User approve amt to be expended by market
    await amt.connect(user).approve(market.address, 100000);

    const amtToSend = BigNumber.from(10001);
    const expectedUsdtToRecive = amtToSend
      .mul(35)
      .div(100)
      .mul(1000 - 10)
      .div(1000);
    await expect(market.connect(user).sell(amtToSend)).to.revertedWith(
      "User doesn't have enough AMT"
    );
  });

  it("User must not be able to recive more usdt than the market usdt balance", async function () {
    const [owner, user] = await ethers.getSigners();
    //Send tokens to market to be able to execute exchanges
    await usdt.transfer(market.address, 100);
    await amt.transfer(market.address, 1000000);

    //Send tokens to user to be able to sell
    await amt.transfer(user.address, 10000);

    //User approve amt to be expended by market
    await amt.connect(user).approve(market.address, 100000);

    const amtToSend = BigNumber.from(10000);
    const expectedUsdtToRecive = amtToSend
      .mul(35)
      .div(100)
      .mul(1000 - 10)
      .div(1000);
    await expect(market.connect(user).sell(amtToSend)).to.revertedWith(
      "Market doesn't have enough USDT"
    );
  });

  it("Buy function must emmit event with correct params", async function () {
    const [owner, user] = await ethers.getSigners();
    //Send tokens to market to be able to execute exchanges
    await usdt.transfer(market.address, 1000000);
    await amt.transfer(market.address, 1000000);

    //Send tokens to user to be able to sell
    await amt.transfer(user.address, 10000);

    //User approve amt to be expended by market
    await amt.connect(user).approve(market.address, 100000);

    const amtToSend = BigNumber.from(100);
    const expectedUsdtToRecive = amtToSend
      .mul(35)
      .div(100)
      .mul(1000 - 10)
      .div(1000);
    await expect(market.connect(user).sell(amtToSend))
      .to.emit(market, "userSold")
      .withArgs(expectedUsdtToRecive, amtToSend);
  });

  it("Admin must recive charged btcb", async function () {
    const [owner, user] = await ethers.getSigners();
    //Send tokens to master to be able to charge
    await btcb.transfer(masterTrucho.address, 1000);

    const prevBtcbBalance = await btcb.balanceOf(owner.address);
    await market.charge(1);
    expect(await btcb.balanceOf(owner.address)).to.be.greaterThan(
      prevBtcbBalance
    );
  });

  it("WithdrawAll must empty the market and send every token to the owner", async function () {
    const [owner, user] = await ethers.getSigners();
    //Send tokens to market to be able to execute exchanges
    await usdt.transfer(market.address, 1000000);
    await amt.transfer(market.address, 1000000);

    const prevAmtBalance = await amt.balanceOf(owner.address);
    const prevUsdtBalance = await usdt.balanceOf(owner.address);

    const transaction = await market.withdrawAll();
    await transaction.wait();
    expect(await amt.balanceOf(owner.address)).to.be.equal(
      prevAmtBalance.add(1000000)
    );
    expect(await usdt.balanceOf(owner.address)).to.be.equal(
      prevUsdtBalance.add(1000000)
    );
    expect(await amt.balanceOf(market.address)).to.be.equal(0);
    expect(await usdt.balanceOf(market.address)).to.be.equal(0);
  });
});
