// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./IPriceFeeder.sol";
import "./IOracle.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "hardhat/console.sol";

/// @title Price Feeder for AMT BTC to be used on loan protocol
/// @notice This contract provides price feed functionality for AMT-BTCB in USDT using chainlink oracles to get the price of USDT BTCB and an Oracle that uses uniswap V2 TWAP.

/// @dev Inherits from OpenZeppelin's Ownable for access control and utilizes Chainlink for reliable price feeds.
contract PriceFeeder is Ownable, IPriceFeeder {
    IOracle oracleAMTBTCB;
    address amt;
    address btcb;
    address pairAMTBTCB;
    AggregatorV3Interface internal priceFeedUSDTBTCB;

    /// @notice Initializes the contract with necessary oracle and token addresses.
    /// @param _oracleAMTBTCB Address of the AMT-BTCB price oracle.
    /// @param _amt Address of the AMT token.
    /// @param _btcb Address of the BTCB token.
    /// @param _priceFeedUSDTBTCB Address of the Chainlink price feed for USDT-BTCB.
    /// @param _pairAMTBTCB Address of the AMT-BTCB token pair.
    constructor(
        address _oracleAMTBTCB,
        address _amt,
        address _btcb,
        address _priceFeedUSDTBTCB,
        address _pairAMTBTCB
    ) {
        require(
            _oracleAMTBTCB != address(0),
            "Oracle AMTBTCB must not be the zero address"
        );
        require(_amt != address(0), "Amt must not be the zero address");
        require(_btcb != address(0), "Btcb must not be the zero address");
        require(
            _priceFeedUSDTBTCB != address(0),
            "priceFeedUSDTBTCB must not be the zero address"
        );
        require(
            _pairAMTBTCB != address(0),
            "Pair AMTBTCB must not be the zero address"
        );
        oracleAMTBTCB = IOracle(_oracleAMTBTCB);
        amt = _amt;
        btcb = _btcb;
        pairAMTBTCB = _pairAMTBTCB;
        priceFeedUSDTBTCB = AggregatorV3Interface(_priceFeedUSDTBTCB);
    }

    /// @notice Fetches the latest BTCB price from the Chainlink oracle.
    /// @return The latest BTCB price scaled to 8 decimal places.
    function getLatestBTCBPrice() public view returns (uint256) {
        (, int price, , , ) = priceFeedUSDTBTCB.latestRoundData();
        return uint256(price / 10 ** 8); // Scale to 8 decimal places
    }

    /// @notice Calculates the price of a given amount of AMT in USDT terms.
    /// @dev Uses both AMT-BTCB oracle and Chainlink aggregator for USDT-BTCB to derive the final price.
    /// @dev Takes the lower price between the quoted balance and the oracle price
    /// @param amountIn The amount of AMT tokens to price in USDT.
    /// @return The calculated price of the given amount of AMT in USDT.
    function getPrice(uint256 amountIn) public view returns (uint256) {
        uint256 price_amt_btcb = oracleAMTBTCB.consult(amt, amountIn);
        IERC20 Amt = IERC20(amt);
        IERC20 Btcb = IERC20(btcb);

        uint256 reserveAmt = Amt.balanceOf(pairAMTBTCB);
        uint256 reserveBtcb = Btcb.balanceOf(pairAMTBTCB);

        uint256 quotedBalance = getAmountOut(amountIn, reserveAmt, reserveBtcb);
        if (quotedBalance < price_amt_btcb) {
            price_amt_btcb = quotedBalance;
        }
        uint256 price_btcb_amt_usdt = getLatestBTCBPrice() * price_amt_btcb;

        return price_btcb_amt_usdt;
    }

    /// @dev copied from uniswap
    function getAmountOut(
        uint amountIn,
        uint reserveA,
        uint reserveB
    ) private pure returns (uint amountOut) {
        require(amountIn > 0, "Invalid amountIn");
        require(reserveA > 0 && reserveB > 0, "Invalid reserves");

        uint256 fee = 3; // Representing 0.3%
        uint256 amountInWithFee = amountIn * (1000 - fee);
        uint256 numerator = amountInWithFee * reserveB;
        uint256 denominator = (reserveA * 1000) + amountInWithFee;

        require(denominator != 0, "Division by zero");

        amountOut = numerator / denominator;
    }
}
