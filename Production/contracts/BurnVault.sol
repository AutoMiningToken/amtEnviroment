// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./Amt.sol";
import "./Master.sol";

/// @title BurnVault
/// @notice This contract burns AMT tokens and withdraws backing BTCb tokens
contract BurnVault is Ownable {
    /// The address of the BTCb token
    address constant addrBtcb = 0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c;

    IERC20 constant btcb = IERC20(addrBtcb);
    Amt immutable amt;

    event burnMade(uint256 amtBurned, uint256 btcbWithdrew);

    /// @notice Constructor sets the AMT token
    /// @param _addrAmt The address of the AMT token
    constructor(address _addrAmt) {
        amt = Amt(_addrAmt);
    }

    /// @notice Withdraws backing BTCb tokens by burning AMT tokens
    /// @param amount The amount of AMT tokens to burn
    function backingWithdraw(uint256 amount) public {
        require(btcb.balanceOf(address(this)) > 0, "Nothing to withdraw");
        uint256 totalSupply = amt.totalSupply();
        uint256 btcbToTransfer = (amount * btcb.balanceOf(address(this))) /
            totalSupply;

        amt.burnFrom(msg.sender, amount);

        bool btcbTransferSuccess = btcb.transfer(msg.sender, btcbToTransfer);
        require(btcbTransferSuccess, "Transaction failed");

        emit burnMade(amount, btcbToTransfer);
    }
}