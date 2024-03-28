// SPDX-License-Identifier: MIT
pragma solidity =0.6.6;
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/lib/contracts/libraries/FixedPoint.sol";
import "@uniswap/v2-periphery/contracts/libraries/UniswapV2OracleLibrary.sol";
import "./Pancake-exchange-contracts/contracts/libraries/PancakeLibrary.sol";

/// @title Oracle for computing average price over a fixed time window using Uniswap V2 pairs
/// @notice This contract calculates the average price of a token pair over a fixed period, updating once per period
/// @dev This contract is based on the Uniswap V2 oracle example and uses cumulative prices for calculations
contract Oracle {
    using FixedPoint for *;

    uint public constant PERIOD = 1 hours;

    IUniswapV2Pair immutable pair;
    address public immutable token0;
    address public immutable token1;

    uint public price0CumulativeLast;
    uint public price1CumulativeLast;
    uint32 public blockTimestampLast;
    FixedPoint.uq112x112 public price0Average;
    FixedPoint.uq112x112 public price1Average;

    address public updater; //Address allowed to execute the update function

    /// @notice Initializes the Oracle contract with Uniswap V2 pair
    /// @param factory The address of the Uniswap V2 factory
    /// @param tokenA The address of the first token of the pair
    /// @param tokenB The address of the second token of the pair
    /// @dev The contract uses PancakeLibrary for finding the pair address
    constructor(address factory, address tokenA, address tokenB) public {
        updater = msg.sender;
        IUniswapV2Pair _pair = IUniswapV2Pair(
            PancakeLibrary.pairFor(factory, tokenA, tokenB)
        );

        pair = _pair;
        token0 = _pair.token0();
        token1 = _pair.token1();

        price0CumulativeLast = _pair.price0CumulativeLast(); // fetch the current accumulated price value (1 / 0)
        price1CumulativeLast = _pair.price1CumulativeLast(); // fetch the current accumulated price value (0 / 1)
        uint112 reserve0;
        uint112 reserve1;
        (reserve0, reserve1, blockTimestampLast) = _pair.getReserves();

        require(reserve0 != 0 && reserve1 != 0, "Oracle: NO_RESERVES"); // ensure that there's liquidity in the pair
    }

    /// @notice Updates the average prices for the token pair
    /// @dev This function should be called periodically to update the price averages
    function update() external {
        require(msg.sender == updater, "Oracle: NOT_ALLOWED");
        (
            uint price0Cumulative,
            uint price1Cumulative,
            uint32 blockTimestamp
        ) = UniswapV2OracleLibrary.currentCumulativePrices(address(pair));
        uint32 timeElapsed = blockTimestamp - blockTimestampLast; // overflow is desired

        // ensure that at least one full period has passed since the last update
        require(timeElapsed >= PERIOD, "Oracle: PERIOD_NOT_ELAPSED");

        // overflow is desired, casting never truncates
        // cumulative price is in (uq112x112 price * seconds) units so we simply wrap it after division by time elapsed
        price0Average = FixedPoint.uq112x112(
            uint224((price0Cumulative - price0CumulativeLast) / timeElapsed)
        );
        price1Average = FixedPoint.uq112x112(
            uint224((price1Cumulative - price1CumulativeLast) / timeElapsed)
        );

        price0CumulativeLast = price0Cumulative;
        price1CumulativeLast = price1Cumulative;
        blockTimestampLast = blockTimestamp;
    }

    /// @notice changes the updater address
    /// @dev only previous updater will be able to call this function
    /// @param _updater new updater address
    function setUpdater(address _updater) external {
        require(msg.sender == updater, "Oracle: NOT_ALLOWED");
        updater = _updater;
    }

    // note this will always return 0 before update has been called successfully for the first time.
    function consult(
        address token,
        uint amountIn
    ) external view returns (uint amountOut) {
        if (token == token0) {
            amountOut = price0Average.mul(amountIn).decode144();
        } else {
            require(token == token1, "Oracle: INVALID_TOKEN");
            amountOut = price1Average.mul(amountIn).decode144();
        }
    }
}
