// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "./IPriceFeeder.sol";
import "./IOracle.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "hardhat/console.sol";

/// @title Price Feeder for AMT BTC to be used on loan protocol
/// @notice This contract provides price feed functionality for AMT-BTCB in USDT using chainlink oracles to get the price of USDT BTCB and an Oracle that uses uniswap V2 TWAP.

/// @dev Inherits from OpenZeppelin's Ownable for access control and utilizes Chainlink for reliable price feeds.
contract PriceFeeder is Ownable2Step, IPriceFeeder {
    using SafeERC20 for IERC20;

    IOracle internal immutable oracleAmtBtcb;
    address internal immutable amt;
    address internal immutable btcb;
    address internal immutable pairAmtBtcb;
    AggregatorV3Interface internal immutable priceFeedUsdtBtcb;

    /// @notice Initializes the contract with necessary oracle and token addresses.
    /// @param _oracleAmtBtcb Address of the AMT-BTCB price oracle.
    /// @param _amt Address of the AMT token.
    /// @param _btcb Address of the BTCB token.
    /// @param _priceFeedUsdtBtcb Address of the Chainlink price feed for USDT-BTCB.
    /// @param _pairAmtBtcb Address of the AMT-BTCB token pair.
    constructor(
        address _oracleAmtBtcb,
        address _amt,
        address _btcb,
        address _priceFeedUsdtBtcb,
        address _pairAmtBtcb
    ) {
        require(
            _oracleAmtBtcb != address(0),
            "Oracle AMTBTCB must not be the zero address"
        );
        require(_amt != address(0), "Amt must not be the zero address");
        require(_btcb != address(0), "Btcb must not be the zero address");
        require(
            _priceFeedUsdtBtcb != address(0),
            "priceFeedUSDTBTCB must not be the zero address"
        );
        require(
            _pairAmtBtcb != address(0),
            "Pair AMTBTCB must not be the zero address"
        );
        oracleAmtBtcb = IOracle(_oracleAmtBtcb);
        amt = _amt;
        btcb = _btcb;
        pairAmtBtcb = _pairAmtBtcb;
        priceFeedUsdtBtcb = AggregatorV3Interface(_priceFeedUsdtBtcb);
    }

    /// @notice Calculate the amount out from an uniswap V2 pool given the amount in and the token reserves
    /// @dev Based on getAmountOut from PancakeLibrary but without SafeMath to be compiled with a higher solidity version
    /// @param amountIn The amount of tokenA to price.
    /// @param reserveA The amount of tokenA in pool reserves
    /// @param reserveB The amount of token B in pool reserves
    /// @return amountOut the maximum output amount of the tokenB to be swaped
    function getAmountOut(
        uint amountIn,
        uint reserveA,
        uint reserveB
    ) internal pure returns (uint amountOut) {
        require(amountIn > 0, "Invalid amountIn");
        require(reserveA > 0 && reserveB > 0, "Invalid reserves");

        uint256 fee = 25; // Representing 0.25%
        uint256 amountInWithFee = amountIn * (10000 - fee);
        uint256 numerator = amountInWithFee * reserveB;
        uint256 denominator = (reserveA * 10000) + amountInWithFee;

        require(denominator != 0, "Division by zero");

        amountOut = numerator / denominator;
    }
    /// @notice Fetches the latest BTCB price from the Chainlink oracle.
    /// @return The latest BTCB price scaled to 8 decimal places.
    function getLatestBTCBPrice() public view returns (uint256) {
        (
            uint80 roundID,
            int256 price,
            ,
            uint256 timestamp,
            uint80 answeredInRound
        ) = priceFeedUsdtBtcb.latestRoundData();
        require(answeredInRound >= roundID, "Stale price");
        require(timestamp != 0, "Round not complete");
        require(price > 0, "Chainlink price reporting 0");
        return uint256(price / 10 ** 8); // Scale to 8 decimal places
    }

    /// @notice Calculates the price of a given amount of AMT in USDT terms.
    /// @dev Uses both AMT-BTCB oracle and Chainlink aggregator for USDT-BTCB to derive the final price.
    /// @dev Takes the lower price between the quoted balance and the oracle price
    /// @param amountIn The amount of AMT tokens to price in USDT.
    /// @return The calculated price of the given amount of AMT in USDT.
    function getPrice(uint256 amountIn) public view returns (uint256) {
        uint256 priceAmtBtcb = oracleAmtBtcb.consult(amt, amountIn);
        IERC20 Amt = IERC20(amt);
        IERC20 Btcb = IERC20(btcb);

        uint256 reserveAmt = Amt.balanceOf(pairAmtBtcb);
        uint256 reserveBtcb = Btcb.balanceOf(pairAmtBtcb);

        uint256 quotedBalance = getAmountOut(amountIn, reserveAmt, reserveBtcb);
        if (quotedBalance < priceAmtBtcb) {
            priceAmtBtcb = quotedBalance;
        }
        uint256 priceAmtBtcbUsdt = getLatestBTCBPrice() * priceAmtBtcb;

        return priceAmtBtcbUsdt;
    }
}
