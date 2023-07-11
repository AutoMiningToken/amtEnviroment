// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract TestMaster {
    IERC20 btcb;
    constructor(address _btcb){
        btcb = IERC20(_btcb);
    }

    function getRandomNumber() private view returns (uint256) {
        return (uint256(keccak256(abi.encodePacked(block.timestamp, block.difficulty))) % 21) + 1;
    }
    function charge(uint256 snapId) public returns(uint256){
        snapId = snapId *2; //para sacar el warning, no va
        uint256 toPay = getRandomNumber();
        btcb.transfer(msg.sender,toPay);
        return toPay;
    }
}
