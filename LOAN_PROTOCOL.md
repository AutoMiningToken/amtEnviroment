# Loan Protocol Documentation

## Overview

The Loan Protocol is a key feature of the Auto Mining Token (AMT) ecosystem. It allows AMT token holders to use their tokens as collateral to borrow USDT at a predetermined rate. This document provides an in-depth explanation of the Loan Protocol smart contract, including its API and usage instructions.

## Contract Details

- **Contract Name**: `LoanProtocol`
- **Primary Function**: Enabling users to borrow USDT against their AMT tokens.
- **Network**: Binance Smart Chain (BSC)
- **Price feeder**: This contract use a custom price feeder to determinate the valuation of the amount of AMT to be used on a loan and the liquidation condition, for specific documentation about the price feeder see [Price Feeder Documentation](PRICE_FEEDER.md).

## Key Features

1. **Loan Creation**: Users can lock their AMT tokens to borrow USDT.
2. **Loan Closure**: Options for users to close their loans, either partially or in full.
3. **Loan Liquidation**: Under certain conditions, a loan can be liquidated.
4. **Administrative Functions**: Functions for contract management, including pausing the contract, adjusting loan parameters, and liquidating loans.

## API Reference

### Contract Constructor

```solidity
constructor(
    address _btcb,
    address _usdt,
    address _amt,
    address _master,
    address _priceFeeder,
    uint256 _loanRatio
)
```

Initializes the contract with necessary parameters including token addresses and the initial loan ratio.

### Public Functions

#### createLoan

```solidity
function createLoan(uint256 amtAmount, uint256 loanRatio) external
```

Allows a user to create a loan by locking a specified amount of AMT tokens at the specified rate.

#### addCollateral

```solidity
function addCollateral(uint256 loanIndex, uint256 amount)
```

Allows the user to transfer more collateral to an already created loan to avoid liquidation.

#### closeLoan

```solidity
function closeLoan(uint256 loanIndex, uint256 amount) external
```

Enables a user to close an existing loan, either partially or in full, by repaying the borrowed amount.

#### setPriceFeeder

```solidity
function setPriceFeeder(address _priceFeeder) public onlyOwner
```

Allows the contract owner to update the address of the price feeder contract.

#### setLoanRatio

```solidity
    function setLoanRatio(
        uint256 _loanRatioMin,
        uint256 _loanRatioMax
    )
```

Used by the contract owner to adjust the % of the ratio allowed to the loans.

### View Functions

#### getUserLoans

```solidity
function getUserLoans(address user) public view returns (Loan[] memory loans)
```

Retrieves all loans associated with a specific user.

#### isLoanLiquidable

```solidity
function isLoanLiquidable(uint256 loanIndex, address user) public view returns (bool)
```

Determines if a specific loan is eligible for liquidation based on current criteria.

## Events

- `LoanCreated`: Emitted when a new loan is created.
- `LoanClosed`: Emitted when a loan is fully closed.
- `LoanPartialClosed`: Emitted when a loan is partially closed.
- `PriceFeederChanged`: Indicates a change in the price feeder contract.
- `LoanRatioChanged`: Signals a change in the loan-to-value ratio.

## Usage Examples

### Example: Loan Creation

```solidity
// Example: Creating a loan
LoanProtocol loanProtocol = LoanProtocol(loanProtocolAddress);
uint256 amtAmount = 1000; // AMT tokens to lock as collateral
uint256 ratio = 60; // 60% of value from collateral locked will be transfered to the loan creator in USDT
loanProtocol.createLoan(amtAmount,ratio);
```

### Example: Interacting with the Loan Protocol

```solidity
// Another contract interacting with LoanProtocol
contract InteractingContract {
    LoanProtocol loanProtocol;

    constructor(address _loanProtocolAddress) {
        loanProtocol = LoanProtocol(_loanProtocolAddress);
    }

    function interactCreateLoan(uint256 amtAmount, uint256 ratio) public {
        loanProtocol.createLoan(amtAmount,ratio);
    }

    function interactCloseLoan(uint256 loanIndex, uint256 amount) public {
        loanProtocol.closeLoan(loanIndex, amount);
    }
}
```

### Example: Closing a Loan

```typescript
// TypeScript example for closing a loan
const loanIndex = 0; // Index of the loan to close
const amountToRepay = ethers.utils.parseEther("500"); // USDT amount to repay
await loanProtocol.connect(user).closeLoan(loanIndex, amountToRepay);
```

### Example: Loan Closure in Solidity

```solidity
// Solidity example of a user closing their loan
function closeMyLoan(uint256 loanIndex, uint256 amountToRepay) public {
    loanProtocol.closeLoan(loanIndex, amountToRepay);
}
```
