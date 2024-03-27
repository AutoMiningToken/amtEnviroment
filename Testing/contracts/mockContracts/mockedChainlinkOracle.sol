// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MockChainlinkOracle {
    uint80 public roundID;
    int256 private mockPrice;
    uint256 public startedAt;
    uint256 public updatedAt;
    uint80 public answeredInRound;

    constructor(int256 _price) {
        mockPrice = _price;
        roundID = 5;
        startedAt = 0;
        updatedAt = 1;
        answeredInRound = 6;
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
        return (roundID, mockPrice, startedAt, updatedAt, answeredInRound); // Mock values
    }

    // Add functions to set mock values if needed
    function setMockPrice(int256 _price) public {
        mockPrice = _price;
    }

    function setOtherMockValues(
        uint80 _roundID,
        uint256 _startedAt,
        uint256 _updatedAt,
        uint80 _answeredInRound
    ) public {
        roundID = _roundID;
        startedAt = _startedAt;
        updatedAt = _updatedAt;
        answeredInRound = _answeredInRound;
    }
}
