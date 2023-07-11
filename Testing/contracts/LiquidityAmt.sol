// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Snapshot.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract LiquidityAmt is ERC20Snapshot, Ownable {
    string constant nameForDeploy = "liqAutoMiningToken";
    string constant symbolForDeploy = "liqAMT";

    constructor() ERC20(nameForDeploy, symbolForDeploy) {}

    function mint(address account, uint256 amount) public onlyOwner {
        _mint(account, amount);
    }

    function snapshot() public onlyOwner returns (uint256) {
        return _snapshot();
    }

    function getCurrentSnapshotId() public view returns (uint256) {
        return _getCurrentSnapshotId();
    }

    // burning functions
    function burnFrom(address account, uint256 amount) public virtual {
        _spendAllowance(account, _msgSender(), amount);
        _burn(account, amount);
    }
}