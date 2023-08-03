// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Snapshot.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title AutoMiningToken (AMT)
/// @notice This contract creates a snapshotable and ownable ERC20 token.
contract Amt is ERC20Snapshot, Ownable {

    /// The name of the token to be created upon deployment
    string constant nameForDeploy = "AutoMiningToken";
    /// The symbol of the token to be created upon deployment
    string constant symbolForDeploy = "AMT";

    /// The maximum number of AMT that can ever exist
    uint256 constant maxAmt = 100000000 * (10 ** 18);

    /// @notice Constructor sets the name and symbol of the token
    constructor() ERC20(nameForDeploy, symbolForDeploy) {}

    /// @notice Mints new AMT tokens
    /// @dev Only the owner can call this function and the total supply must never exceed the maximum supply of AMT
    /// @param account The address to receive the newly minted tokens
    /// @param amount The number of tokens to mint
    function mint(address account, uint256 amount) public onlyOwner {
        require(
            totalSupply() + amount <= maxAmt,
            "Total AMT minted must not exceed 100.000.000 ATM"
        );

        _mint(account, amount);
    }

    /// @notice Takes a snapshot of the current token state
    /// @dev Only the owner can call this function
    /// @return The id of the snapshot created
    function snapshot() public onlyOwner returns (uint256) {
        return _snapshot();
    }

    /// @notice Gets the current snapshot id
    /// @return The current snapshot id
    function getCurrentSnapshotId() public view returns (uint256) {
        return _getCurrentSnapshotId();
    }

    /// @notice Burns a specified amount of the caller's tokens
    /// @param amount The number of tokens to burn
    function burn(uint256 amount) public virtual {
        _burn(_msgSender(), amount);
    }

    /// @notice Burns a specified amount of tokens from a given account
    /// @dev The caller must have allowance for the specified account's tokens
    /// @param account The account from which tokens will be burnt
    /// @param amount The number of tokens to burn
    function burnFrom(address account, uint256 amount) public virtual {
        _spendAllowance(account, _msgSender(), amount);
        _burn(account, amount);
    }
}