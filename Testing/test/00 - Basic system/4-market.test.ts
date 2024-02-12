import { ethers } from "hardhat";
import chai from "chai";
import { TestERC20 } from "../../typechain-types";
import { Market } from "../../typechain-types";
import { TestMaster } from "../../typechain-types";

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
    btcb = (await Btcb.deploy(1000000000, "Bitcoin", "BTCB")) as TestERC20;
    await btcb.waitForDeployment();

    const Amt = await ethers.getContractFactory("TestERC20");
    amt = (await Amt.deploy(
      1000000000,
      "Auto Mining Token",
      "AMT"
    )) as TestERC20;
    await amt.waitForDeployment();

    const Usdt = await ethers.getContractFactory("TestERC20");
    usdt = (await Usdt.deploy(1000000000, "USDT Tether", "USDT")) as TestERC20;
    await usdt.waitForDeployment();

    const MasterTrucho = await ethers.getContractFactory("TestMaster");
    masterTrucho = (await MasterTrucho.deploy(btcb.getAddress())) as TestMaster;
    await masterTrucho.waitForDeployment();

    const Market = await ethers.getContractFactory("Market");
    market = (await Market.deploy(
      amt.getAddress(),
      masterTrucho.getAddress(),
      35,
      10,
      owner.address,
      btcb.getAddress(),
      usdt.getAddress()
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

  it("Owner must be able to change fee", async function () {
    const [owner] = await ethers.getSigners();
    await market.setFee(980);
    expect(await market.fee()).to.equal(980);
  });

  it("Owner must not able to change fee to a value greater than 1000", async function () {
    const [owner] = await ethers.getSigners();
    expect(market.setFee(1001)).to.revertedWith("Fee must be lesser than 1000");
  });

  it("User should be able to buy at defined rate", async function () {
    const [owner, user] = await ethers.getSigners();

    //Send tokens to market to be able to execute exchanges
    await usdt.transfer(market.getAddress(), 1000000);
    await amt.transfer(market.getAddress(), 2857 * 2); //Border case emptying the market

    //Send tokens to user to be able to buy
    await usdt.transfer(user.address, 2000);

    //User approve usdt to be expended by market
    await usdt.connect(user).approve(market.getAddress(), 100000);

    const usdtToSend = 1000n;
    const expectedAmtToRecive =
      (usdtToSend * 100n) / (await market.usdPer100Amt());

    await expect(market.connect(user).buy(usdtToSend)).to.changeTokenBalances(
      amt,
      [user.address, await market.getAddress()],
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
    await usdt.transfer(market.getAddress(), 1000000);
    await amt.transfer(market.getAddress(), 1000000);

    //Send tokens to user to be able to buy
    await usdt.transfer(user.address, 1000);

    //User approve usdt to be expended by market
    await usdt.connect(user).approve(market.getAddress(), 100000);

    const usdtToSend = 1001n;
    const expectedAmtToRecive =
      (usdtToSend * 100n) / (await market.usdPer100Amt());

    await expect(market.connect(user).buy(usdtToSend)).to.revertedWith(
      "User doesn't have enough USDT"
    );
  });

  it("User must not be able to buy more amt than the market balance", async function () {
    const [owner, user] = await ethers.getSigners();

    //Send tokens to market to be able to execute exchanges
    await usdt.transfer(market.getAddress(), 1000000);
    await amt.transfer(market.getAddress(), 100);

    //Send tokens to user to be able to buy
    await usdt.transfer(user.address, 1000);

    //User approve usdt to be expended by market
    await usdt.connect(user).approve(market.getAddress(), 100000);

    const usdtToSend = 1000n;
    const expectedAmtToRecive =
      (usdtToSend * 100n) / (await market.usdPer100Amt());

    await expect(market.connect(user).buy(usdtToSend)).to.revertedWith(
      "Market doesn't have enough AMT"
    );
  });

  it("Buy function must emmit event with correct params", async function () {
    const [owner, user] = await ethers.getSigners();

    //Send tokens to market to be able to execute exchanges
    await usdt.transfer(market.getAddress(), 1000000);
    await amt.transfer(market.getAddress(), 1000000);

    //Send tokens to user to be able to buy
    await usdt.transfer(user.address, 1000);

    //User approve usdt to be expended by market
    await usdt.connect(user).approve(market.getAddress(), 100000);

    const usdtToSend = 1000n;
    const expectedAmtToRecive =
      (usdtToSend * 100n) / (await market.usdPer100Amt());

    await expect(market.connect(user).buy(usdtToSend))
      .to.emit(market, "amtBought")
      .withArgs(usdtToSend, expectedAmtToRecive);
  });

  it("User should be able to sell at defined rate paying the fee", async function () {
    const [owner, user] = await ethers.getSigners();
    //Send tokens to market to be able to execute exchanges
    await usdt.transfer(market.getAddress(), 1000000);
    await amt.transfer(market.getAddress(), 1000000);

    //Send tokens to user to be able to sell
    await amt.transfer(user.address, 10000);

    //User approve amt to be expended by market
    await amt.connect(user).approve(market.getAddress(), 100000);

    const amtToSend = 100n;
    const expectedUsdtToRecive =
      (((amtToSend * 35n) / 100n) * (1000n - 10n)) / 1000n;
    await expect(market.connect(user).sell(amtToSend)).to.changeTokenBalances(
      usdt,
      [user.address, await market.getAddress()],
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
    await usdt.transfer(market.getAddress(), 1000000);
    await amt.transfer(market.getAddress(), 1000000);

    //Send tokens to user to be able to sell
    await amt.transfer(user.address, 10000);

    //User approve amt to be expended by market
    await amt.connect(user).approve(market.getAddress(), 100000);

    const amtToSend = 10001n;
    const expectedUsdtToRecive =
      (((amtToSend * 35n) / 100n) * (1000n - 10n)) / 1000n;
    await expect(market.connect(user).sell(amtToSend)).to.revertedWith(
      "User doesn't have enough AMT"
    );
  });

  it("User must not be able to recive more usdt than the market usdt balance", async function () {
    const [owner, user] = await ethers.getSigners();
    //Send tokens to market to be able to execute exchanges
    await usdt.transfer(market.getAddress(), 100);
    await amt.transfer(market.getAddress(), 1000000);

    //Send tokens to user to be able to sell
    await amt.transfer(user.address, 10000);

    //User approve amt to be expended by market
    await amt.connect(user).approve(market.getAddress(), 100000);

    const amtToSend = 10000n;

    await expect(market.connect(user).sell(amtToSend)).to.revertedWith(
      "Market doesn't have enough USDT"
    );
  });

  it("Buy function must emmit event with correct params", async function () {
    const [owner, user] = await ethers.getSigners();
    //Send tokens to market to be able to execute exchanges
    await usdt.transfer(market.getAddress(), 1000000);
    await amt.transfer(market.getAddress(), 1000000);

    //Send tokens to user to be able to sell
    await amt.transfer(user.address, 10000);

    //User approve amt to be expended by market
    await amt.connect(user).approve(market.getAddress(), 100000);

    const amtToSend = 100n;
    const expectedUsdtToRecive =
      (((amtToSend * 35n) / 100n) * (1000n - 10n)) / 1000n;
    await expect(market.connect(user).sell(amtToSend))
      .to.emit(market, "userSold")
      .withArgs(expectedUsdtToRecive, amtToSend);
  });

  it("Admin must recive charged btcb", async function () {
    const [owner, user] = await ethers.getSigners();
    //Send tokens to master to be able to charge
    await btcb.transfer(masterTrucho.getAddress(), 1000);

    const prevBtcbBalance = await btcb.balanceOf(owner.address);
    await market.charge(1);
    expect(await btcb.balanceOf(owner.address)).to.be.greaterThan(
      prevBtcbBalance
    );
  });

  it("WithdrawAll must empty the market and send every token to the owner", async function () {
    const [owner, user] = await ethers.getSigners();
    //Send tokens to market to be able to execute exchanges
    await usdt.transfer(market.getAddress(), 1000000);
    await amt.transfer(market.getAddress(), 1000000);

    const prevAmtBalance = await amt.balanceOf(owner.address);
    const prevUsdtBalance = await usdt.balanceOf(owner.address);

    const transaction = await market.withdrawAll();
    await transaction.wait();
    expect(await amt.balanceOf(owner.address)).to.be.equal(
      prevAmtBalance + 1000000n
    );
    expect(await usdt.balanceOf(owner.address)).to.be.equal(
      prevUsdtBalance + 1000000n
    );
    expect(await amt.balanceOf(market.getAddress())).to.be.equal(0);
    expect(await usdt.balanceOf(market.getAddress())).to.be.equal(0);
  });

  it("MODIFIERS: operations with only owner", async function () {
    const [owner, user] = await ethers.getSigners();
    await expect(market.connect(user).setRate(25)).to.revertedWith(
      "Ownable: caller is not the owner"
    );
    await expect(market.connect(user).setFee(25)).to.revertedWith(
      "Ownable: caller is not the owner"
    );
    await expect(market.connect(user).charge(0)).to.revertedWith(
      "Ownable: caller is not the owner"
    );
    await expect(market.connect(user).withdrawAll()).to.revertedWith(
      "Ownable: caller is not the owner"
    );
  });
});
