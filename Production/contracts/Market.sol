// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./Amt.sol";
import "./Master.sol";

/// @title Market
/// @notice This contract allows for the buying and selling of AMT tokens with USDT
contract Market is Context, Ownable {
    Amt immutable amt;
    IERC20 immutable btcb;
    IERC20 immutable usdt;
    Master immutable master;

    address private immutable adminWallet;

    address constant addrBtcb = 0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c;
    address constant addrUsdt = 0x55d398326f99059fF775485246999027B3197955;

    /// The current price of 100 AMT tokens in USD
    uint256 public usdPer100Amt;
    /// The fee for transactions
    uint256 immutable fee;

    bool masterSetControl = false;

    event amtBought(uint256 usdtFromUser, uint256 amtToUser);
    event userSold(uint256 amountUsdt, uint256 amtFromUser);
    event charged(uint256 snapId, uint256 amount);

    /// @notice Constructor sets the AMT and Master contracts, the price of AMT, the fee, and the admin wallet
    /// @param _addrAMT The address of the AMT contract
    /// @param _addrMaster The address of the Master contract
    /// @param _usdPer100Amt The price of 100 AMT in USD
    /// @param _fee The fee for transactions
    /// @param _adminWallet The address of the admin wallet
    constructor(
        address _addrAMT,
        address _addrMaster,
        uint256 _usdPer100Amt,
        uint256 _fee,
        address _adminWallet
    ) {
        amt = Amt(_addrAMT);
        master = Master(_addrMaster);
        btcb = IERC20(addrBtcb);
        usdt = IERC20(addrUsdt);
        usdPer100Amt = _usdPer100Amt;
        fee = _fee;
        adminWallet = _adminWallet;
    }


    /// @notice Allows a user to buy AMT tokens with USDT
    /// @param amountUsdt The amount of USDT to spend
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

    /// @notice Allows a user to sell AMT tokens for USDT
    /// @param amountAmt The amount of AMT tokens to sell
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

    /// @notice Allows the contract owner to set the price of AMT tokens
    /// @param _usdPer100Amt The new price for 100 AMT in USD
    function setRate(uint256 _usdPer100Amt) public onlyOwner {
        require(_usdPer100Amt > 0, "Rate must be greater than 0");
        usdPer100Amt = _usdPer100Amt;
    }

    /// @notice Allows the contract owner to charge a snapshot from the Master contract
    /// @param snapId The id of the snapshot to charge
    function charge(uint256 snapId) public onlyOwner {
        uint256 amount = master.charge(snapId);
        bool btcbTransfer = btcb.transfer(msg.sender, amount);

        require(btcbTransfer, "Transfer failed");

        emit charged(snapId, amount);
    }
    
    /// @notice Allows the contract owner to withdraw all tokens from the contract
    function withdrawAll() public onlyOwner {
        uint256 balanceAmt = amt.balanceOf(address(this));
        uint256 balanceUsdt = usdt.balanceOf(address(this));

        bool amtTransfer = amt.transfer(adminWallet, balanceAmt);
        bool usdtTransfer = usdt.transfer(adminWallet, balanceUsdt);

        require(amtTransfer && usdtTransfer, "Transfer failed");
    }
}