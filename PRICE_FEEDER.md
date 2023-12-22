# Price Feeder Contract Documentation

## Overview

The Price Feeder contract provides price feed functionality for AMT-BTCB in USDT, utilizing Chainlink oracles for USDT-BTCB price data and a custom Oracle for AMT-BTCB price data based on Uniswap V2 TWAP.

## Contract Details

- **Contract Name**: `PriceFeeder`
- **Primary Function**: Fetching and calculating the price of AMT-BTCB in USDT terms.
- **Key Technologies**: Chainlink Oracles, Uniswap V2 TWAP.

## Constructor

```solidity
constructor(
    address _oracleAMTBTCB,
    address _amt,
    address _btcb,
    address _priceFeedUSDTBTCB,
    address _pairAMTBTCB
)
```

Initializes the contract with the addresses of the AMT-BTCB oracle, AMT token, BTCB token, Chainlink price feed for USDT-BTCB, and the AMT-BTCB token pair.

## Key Functions

### getLatestBTCBPrice

```solidity
function getLatestBTCBPrice() public view returns (uint256)
```

Fetches the latest BTCB price from the Chainlink oracle, returning the price scaled to 8 decimal places.

### getPrice

```solidity
function getPrice(uint256 amountIn) public view returns (uint256)
```

Calculates the price of a given amount of AMT tokens in USDT terms. It uses the AMT-BTCB oracle and the Chainlink aggregator for USDT-BTCB to derive the final price. The function returns the lower of the quoted balance and the oracle price.

## Usage Example

### Fetching BTCB Price

```solidity
// Example: Fetching the latest BTCB price
PriceFeeder priceFeeder = PriceFeeder(priceFeederAddress);
uint256 btcbPrice = priceFeeder.getLatestBTCBPrice();
```

### Calculating AMT Price in USDT

```solidity
// Example: Calculating the price of AMT in USDT
uint256 amtAmount = 1000; // Amount of AMT tokens
uint256 amtPriceInUSDT = priceFeeder.getPrice(amtAmount);
```

## Integration

This contract can be integrated with other contracts, especially those requiring real-time price data of AMT-BTCB in USDT, such as loan protocols or financial dApps on the BSC network.

## Security Considerations

- Chainlink oracles are used for reliable and up-to-date price feeds.
- The contract uses the latest Solidity version (0.8.9) for improved security and efficiency.
- The contract inherits from OpenZeppelin's Ownable for secure access control.
