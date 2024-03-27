// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "hardhat/console.sol";

contract MaliciousERC20Token is ERC20 {
    address public loanContract;
    uint256 public ratio;

    uint256 public functionToTest;
    constructor(uint256 initialSupply) ERC20("MaliciousToken", "MALT") {
        _mint(msg.sender, initialSupply);
    }

    function setLoanContract(address _loanContract, uint256 _ratio) external {
        loanContract = _loanContract;
        ratio = _ratio;
    }
    function setFunctionToTest(uint256 functionId) external {
        functionToTest = functionId;
    }

    function transfer(
        address recipient,
        uint256 amount
    ) public override returns (bool) {
        if (functionToTest == 3) {
            (bool success, bytes memory data) = loanContract.call(
                abi.encodeWithSignature("closeLoan(uint256,uint256)", 0, amount)
            );
            require(success, getRevertReason(data)); // This will revert the transaction if the call failed
        }
        _transfer(_msgSender(), recipient, amount);

        return true;
    }
    function transferFrom(
        address from,
        address to,
        uint256 value
    ) public override returns (bool) {
        address spender = _msgSender();
        // Attempt to call `createLoan`. If this call fails, it should revert.
        if (functionToTest == 1) {
            (bool success, bytes memory data) = loanContract.call(
                abi.encodeWithSignature(
                    "createLoan(uint256,uint256,uint256)",
                    value,
                    ratio,
                    0
                )
            );
            require(success, getRevertReason(data)); // This will revert the transaction if the call failed
        }
        if (functionToTest == 2) {
            (bool success, bytes memory data) = loanContract.call(
                abi.encodeWithSignature(
                    "addCollateral(uint256,uint256)",
                    value,
                    0
                )
            );
            require(success, getRevertReason(data)); // This will revert the transaction if the call failed
        }
        if (functionToTest == 3) {
            (bool success, bytes memory data) = loanContract.call(
                abi.encodeWithSignature("closeLoan(uint256,uint256)", 0, value)
            );
            require(success, getRevertReason(data)); // This will revert the transaction if the call failed
        }

        _spendAllowance(from, spender, value);
        _transfer(from, to, value);

        return true;
    }

    // Helper function to extract the revert reason from the returned data
    function getRevertReason(
        bytes memory returnData
    ) private pure returns (string memory) {
        // If the returnData is empty, it means no error message was returned.
        if (returnData.length < 68) return "Transaction reverted silently";

        assembly {
            // Slice the sighash.
            returnData := add(returnData, 4)
        }
        return abi.decode(returnData, (string)); // All that remains is the revert string
    }
}
