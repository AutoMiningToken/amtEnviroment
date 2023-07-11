// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./Amt.sol";
import "./Master.sol";

contract Market is Context, Ownable {
    Amt immutable amt;
    IERC20 immutable btcb;
    IERC20 immutable usdt;
    Master immutable master;

    address private immutable adminWallet;

    address constant addrBtcb = 0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c;
    address constant addrUsdt = 0x55d398326f99059fF775485246999027B3197955;

    uint256 public usdPer100Amt;
    uint256 immutable fee;

    bool masterSetControl = false;

    event amtBought(uint256 usdtFromUser, uint256 amtToUser);
    event userSold(uint256 amountUsdt, uint256 amtFromUser);
    event charged(uint256 snapId, uint256 amount);

    constructor(
        address _addrAMT,
        address _addrMaster,
        uint256 _usdPer100Amt,
        uint256 _fee,
        address _adminWallet,
        address _btcb,
        address _usdt
    ) {
        amt = Amt(_addrAMT);
        master = Master(_addrMaster);
        btcb = IERC20(_btcb);
        usdt = IERC20(_usdt);
        usdPer100Amt = _usdPer100Amt;
        fee = _fee;
        adminWallet = _adminWallet;

    }

    function buy(uint256 amountUsdt) public {
        require(
            amountUsdt <= usdt.balanceOf(msg.sender),
            "User doesn't have enough USDT"
        );

        uint256 amtToUser = (amountUsdt * 100) / usdPer100Amt;

        require(
            amtToUser <= amt.balanceOf(address(this)),
            "Market doesn't have enough AMT"
        );

        bool usdtTransfer = usdt.transferFrom(
            msg.sender,
            adminWallet,
            amountUsdt
        );
        bool amtTransfer = amt.transfer(msg.sender, amtToUser);

        require(usdtTransfer && amtTransfer, "Transfer failed");

        emit amtBought(amountUsdt, amtToUser);
    }

    function sell(uint256 amountAmt) public {
        require(
            amountAmt <= amt.balanceOf(msg.sender),
            "User doesn't have enough AMT"
        );

        uint256 usdtToTransfer = (((amountAmt * usdPer100Amt) / 100) *
            (1000 - fee)) / 1000;

        require(
            usdtToTransfer <= usdt.balanceOf(address(this)),
            "Market doesn't have enough USDT"
        );

        bool amtTransfer = amt.transferFrom(msg.sender, adminWallet, amountAmt);
        bool usdtTransfer = usdt.transfer(msg.sender, usdtToTransfer);

        require(amtTransfer && usdtTransfer, "Transfer failed");

        emit userSold(usdtToTransfer, amountAmt);
    }

    function setRate(uint256 _usdPer100Amt) public onlyOwner {
        require(_usdPer100Amt > 0, "Rate must be greater than 0");
        usdPer100Amt = _usdPer100Amt;
    }

    function charge(uint256 snapId) public onlyOwner {
        uint256 amount = master.charge(snapId);
        bool btcbTransfer = btcb.transfer(msg.sender, amount);

        require(btcbTransfer, "Transfer failed");

        emit charged(snapId, amount);
    }

    function withdrawAll() public onlyOwner {
        uint256 balanceAmt = amt.balanceOf(address(this));
        uint256 balanceUsdt = usdt.balanceOf(address(this));

        bool amtTransfer = amt.transfer(adminWallet, balanceAmt);
        bool usdtTransfer = usdt.transfer(adminWallet, balanceUsdt);

        require(amtTransfer && usdtTransfer, "Transfer failed");
    }
}