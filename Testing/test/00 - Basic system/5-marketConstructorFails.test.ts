import { ethers } from "hardhat";
import chai from "chai";
import { TestERC20 } from "../../typechain-types";
import { Market } from "../../typechain-types";
import { TestMaster } from "../../typechain-types";

const { expect } = chai;

describe("Market constructor fail requires", function () {
  let amt: TestERC20;
  let btcb: TestERC20;
  let usdt: TestERC20;
  let masterTrucho: TestMaster;
  const zeroAddress = "0x0000000000000000000000000000000000000000";
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
  });

  it("Contract deployment may fail setting master address as zero address", async function () {
    const [owner] = await ethers.getSigners();
    const Market = await ethers.getContractFactory("Market");
    expect(
      Market.deploy(
        amt.getAddress(),
        zeroAddress,
        35,
        10,
        owner.address,
        btcb.getAddress(),
        usdt.getAddress()
      )
    ).to.revertedWith("Can not set master to zero address");
  });
  it("Contract deployment may fail setting amt address as zero address", async function () {
    const [owner] = await ethers.getSigners();
    const Market = await ethers.getContractFactory("Market");
    expect(
      Market.deploy(
        zeroAddress,
        masterTrucho.getAddress(),
        35,
        10,
        owner.address,
        btcb.getAddress(),
        usdt.getAddress()
      )
    ).to.revertedWith("Can not set amt to zero address");
  });
});
