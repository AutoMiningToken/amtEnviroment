import { ethers } from "hardhat";
import { expect } from "chai";

describe("Impersonation Test", function () {
  it("Should impersonate an address", async function () {
    const addressToImpersonate = "0x8B24FA0E3E792Ef4C74A3ECA847189E9C3Dc3071"; // replace with the address you want to impersonate
      
    await ethers.provider.send("hardhat_impersonateAccount", [
      addressToImpersonate,
    ]);

    const impersonatedSigner = await ethers.getSigner(addressToImpersonate);
    const balance = await ethers.provider.getBalance(addressToImpersonate);

    console.log(
      "Impersonated account's balance:",
      ethers.utils.formatEther(balance)
    );

    await ethers.provider.send("hardhat_stopImpersonatingAccount", [
      addressToImpersonate,
    ]);
  });
});
