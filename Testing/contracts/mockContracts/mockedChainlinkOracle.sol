// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MockChainlinkOracle {
    int256 private mockPrice;

    constructor(int256 _price) {
        mockPrice = _price;
    }

    function latestRoundData()
        public
        view
        returns (
            uint80, // roundId
            int256, // answer
            uint256, // startedAt
            uint256, // updatedAt
            uint80 // answeredInRound
        )
    {
        return (0, mockPrice, 0, 0, 0);
    }

    // Add functions to set mock values if needed
    function setMockPrice(int256 _price) public {
        mockPrice = _price;
    }
}
