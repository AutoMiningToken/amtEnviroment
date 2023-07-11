// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./Amt.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract BurnVault is Ownable {
    event burnMade(uint256 amtBurned, uint256 btcbWithdrew);

    address constant addrBtcb = 0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c;
    address constant addrAmt = 0x6Ae0A238a6f51Df8eEe084B1756A54dD8a8E85d3;

    //For production
    /*
    IERC20 constant btcb = IERC20(addrBtcb);
    AMT constant amt = AMT(addrAmt);
    */

    //For testing
    IERC20 btcb;
    Amt amt;

    constructor(address _amt, address _btcb) {
        btcb = IERC20(_btcb);
        amt = Amt(_amt);
    }

    /**
        * @dev Allows a user to burn AMT tokens and withdraw an equivalent amount of
        BTCB tokens.
        * @param amount The amount of AMT tokens to burn and withdraw BTCB tokens
        against.
    */
    function backingWithdraw(uint256 amount) public {
        uint256 totalSupply = amt.totalSupply();
        require(
            totalSupply > 0,
            "Unable to withdraw with 0 total supply of AMT tokens"
        );
        uint256 btcbToTransfer = (amount * btcb.balanceOf(address(this))) /
            totalSupply;
        require(btcbToTransfer > 0, "Nothing to withdraw");
        amt.burnFrom(msg.sender, amount);
        bool btcbTransferSuccess = btcb.transfer(msg.sender, btcbToTransfer);
        require(btcbTransferSuccess, "Transaction failed");
        emit burnMade(amount, btcbToTransfer);
    }
}
