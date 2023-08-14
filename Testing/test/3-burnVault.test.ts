import { ethers } from "hardhat";
import chai from "chai";
import { TestERC20 } from "../typechain-types";
import { Amt } from "../typechain-types";
import { BurnVault } from "../typechain-types";
const { expect } = chai;

describe("burnVault", function () {
    let amt: Amt;
    let btcb: TestERC20;
    let burnVault: BurnVault;

    this.beforeEach(async function () {
        const [owner,  addr1, addr2, addr3, addr4, addr5] = await ethers.getSigners();

        const Btcb = await ethers.getContractFactory("TestERC20");
        btcb = (await Btcb.deploy(1000000000)) as TestERC20;
        await btcb.deployed();

        const Amt = await ethers.getContractFactory("Amt");
        amt = (await Amt.deploy()) as Amt;
        await amt.deployed();

        await amt.mint(owner.address,100);

        const BurnVault = await ethers.getContractFactory("BurnVault");
        burnVault = (await BurnVault.deploy(amt.address, btcb.address)) as BurnVault;

        //Allowances
        await amt.connect(addr1).approve(burnVault.address,"999999999999");
        await amt.connect(addr2).approve(burnVault.address,"999999999999");
        await amt.connect(addr3).approve(burnVault.address,"999999999999");
        await amt.connect(addr4).approve(burnVault.address,"999999999999");
        await amt.connect(addr5).approve(burnVault.address,"999999999999");

    })

    it("UNIT: backing withdrawl", async function(){
        const [owner,  addr1] = await ethers.getSigners();
        await amt.transfer(addr1.address,10);
        await btcb.transfer(burnVault.address, 100);
        await expect(burnVault.connect(addr1).backingWithdraw(10)).to.changeTokenBalance(btcb,addr1.address,10);
    })

    it("UNIT: backing withdrawl revert condition total supply eq to 0", async function(){
        const [owner,  addr1] = await ethers.getSigners();
        await amt.burn(100);
        await expect(burnVault.connect(addr1).backingWithdraw(10)).to.revertedWith("Unable to withdraw with 0 total supply of AMT tokens");
    })

    it("UNIT: backing withdrawl revert condition btcbToWithdraw eq to 0", async function(){
        const [owner,  addr1] = await ethers.getSigners();
        await expect(burnVault.connect(addr1).backingWithdraw(10)).to.revertedWith("Nothing to withdraw");

    })

    it("UNIT: backing withdrawl must emit event with correct arguments", async function(){
        const [owner,  addr1] = await ethers.getSigners();
        await amt.transfer(addr1.address,10);
        await btcb.transfer(burnVault.address, 100);
        await expect(burnVault.connect(addr1).backingWithdraw(10)).to.emit(burnVault,"burnMade").withArgs(10,10);   
    })

    it("Basic burn and distribution with multiple wallets", async function () {
        const [owner,  addr1, addr2, addr3, addr4, addr5] = await ethers.getSigners();

        await amt.transfer(addr1.address,10);
        await amt.transfer(addr2.address,10);
        await amt.transfer(addr3.address,20);
        await amt.transfer(addr4.address,20);
        await amt.transfer(addr5.address,40);

        await btcb.transfer(burnVault.address, 100);

        await expect(burnVault.connect(addr1).backingWithdraw(10)).to.changeTokenBalance(btcb,addr1.address,10);
        await expect(burnVault.connect(addr2).backingWithdraw(10)).to.changeTokenBalance(btcb,addr2.address,10);
        await expect(burnVault.connect(addr3).backingWithdraw(20)).to.changeTokenBalance(btcb,addr3.address,20);
        await expect(burnVault.connect(addr4).backingWithdraw(20)).to.changeTokenBalance(btcb,addr4.address,20);
        await expect(burnVault.connect(addr5).backingWithdraw(40)).to.changeTokenBalance(btcb,addr5.address,40);
    })
})