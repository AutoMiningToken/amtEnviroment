// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./Amt.sol";
import "./Master.sol";

/// @title Market
/// @notice This contract allows for the buying and selling of AMT tokens with USDT
contract Market is Context, Ownable {
    using SafeERC20 for IERC20;
    using SafeERC20 for Amt;
    Amt private immutable amt;
    IERC20 private immutable btcb;
    IERC20 private immutable usdt;
    Master private immutable master;

    address private immutable adminWallet;

    address public constant addrBtcb =
        0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c;
    address public constant addrUsdt =
        0x55d398326f99059fF775485246999027B3197955;

    /// The current price of 100 AMT tokens in USD
    uint256 public usdPer100Amt;

    /// @notice The fee for transactions. The fee is represented in perthousand (1/1000), not in percent (1/100)
    uint256 public fee;

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
        address _adminWallet,
        address _addrBtcb,
        address _addrUsdt
    ) {
        require(
            _addrMaster != address(0),
            "Can not set master to zero address"
        );
        require(_addrAMT != address(0), "Can not set amt to zero address");
        amt = Amt(_addrAMT);
        master = Master(_addrMaster);
        btcb = IERC20(_addrBtcb);
        usdt = IERC20(_addrUsdt);
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
        usdt.safeTransferFrom(msg.sender, adminWallet, amountUsdt);
        amt.safeTransfer(msg.sender, amtToUser);
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

        amt.safeTransferFrom(msg.sender, adminWallet, amountAmt);
        usdt.safeTransfer(msg.sender, usdtToTransfer);

        emit userSold(usdtToTransfer, amountAmt);
    }

    /// @notice Allows the contract owner to set the price of AMT tokens
    /// @param _usdPer100Amt The new price for 100 AMT in USD
    function setRate(uint256 _usdPer100Amt) public onlyOwner {
        require(_usdPer100Amt > 0, "Rate must be greater than 0");
        usdPer100Amt = _usdPer100Amt;
    }

    /// @notice Allows the contract owner to set the fee for the sell of AMT tokens
    /// @param _fee The new fee to use
    function setFee(uint256 _fee) public onlyOwner {
        require(_fee < 1000, "Fee must be lesser than 1000");
        fee = _fee;
    }

    /// @notice Allows the contract owner to charge a snapshot from the Master contract
    /// @param snapId The id of the snapshot to charge
    function charge(uint256 snapId) public onlyOwner {
        uint256 amount = master.charge(snapId);
        btcb.safeTransfer(msg.sender, amount);

        emit charged(snapId, amount);
    }

    /// @notice Allows the contract owner to withdraw all tokens from the contract
    function withdrawAll() public onlyOwner {
        uint256 balanceAmt = amt.balanceOf(address(this));
        uint256 balanceUsdt = usdt.balanceOf(address(this));

        amt.safeTransfer(adminWallet, balanceAmt);
        usdt.safeTransfer(adminWallet, balanceUsdt);
    }
}
