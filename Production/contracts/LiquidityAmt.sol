// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Snapshot.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title Liquidity Auto Mining Token (liqAMT)
/// @notice This contract creates a snapshotable and ownable ERC20 token for liquidity purposes.
contract LiquidityAmt is ERC20Snapshot, Ownable {
    string constant nameForDeploy = "liqAutoMiningToken";
    string constant symbolForDeploy = "liqAMT";

    /// @notice Constructor sets the name and symbol of the token
    constructor() ERC20(nameForDeploy, symbolForDeploy) {}

    /// @notice Mints new liqAMT tokens
    /// @dev Only the owner can call this function
    /// @param account The address to receive the newly minted tokens
    /// @param amount The number of tokens to mint
    function mint(address account, uint256 amount) public onlyOwner {
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

    /// @notice Burns a specified amount of tokens from a given account
    /// @dev The caller must have allowance for the specified account's tokens
    /// @param account The account from which tokens will be burnt
    /// @param amount The number of tokens to burn
    function burnFrom(address account, uint256 amount) public virtual {
        _spendAllowance(account, _msgSender(), amount);
        _burn(account, amount);
    }
}