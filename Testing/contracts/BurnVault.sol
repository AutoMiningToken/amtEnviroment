// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./Amt.sol";

/// @title BurnVault
/// @notice This contract burns AMT tokens and withdraws backing BTCb tokens
contract BurnVault is Ownable {
    using SafeERC20 for IERC20;
    using SafeERC20 for Amt;
    /// The address of the BTCb token
    address constant addrBtcb = 0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c;

    IERC20 immutable btcb;
    Amt immutable amt;

    event burnMade(uint256 amtBurned, uint256 btcbWithdrew);

    /// @notice Constructor sets the AMT token
    /// @param _addrAmt The address of the AMT token
    constructor(address _addrAmt, address _btcb) {
        amt = Amt(_addrAmt);
        btcb = IERC20(_btcb);
    }

    /// @notice Withdraws backing BTCb tokens by burning AMT tokens
    /// @param amount The amount of AMT tokens to burn
    function backingWithdraw(uint256 amount) public {
        uint256 totalSupply = amt.totalSupply();
        require(
            totalSupply > 0,
            "Unable to withdraw with 0 total supply of AMT tokens"
        );
        require(btcb.balanceOf(address(this)) > 0, "Nothing to withdraw");

        uint256 btcbToTransfer = (amount * btcb.balanceOf(address(this))) /
            totalSupply;

        amt.burnFrom(msg.sender, amount);

        btcb.safeTransfer(msg.sender, btcbToTransfer);

        emit burnMade(amount, btcbToTransfer);
    }
}
