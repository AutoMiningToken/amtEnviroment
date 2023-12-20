# Loan Protocol Documentation

## Overview

The Loan Protocol is a key feature of the Auto Mining Token (AMT) ecosystem. It allows AMT token holders to use their tokens as collateral to borrow USDT at a predetermined rate. This document provides an in-depth explanation of the Loan Protocol smart contract, including its API and usage instructions.

## Contract Details

- **Contract Name**: `LoanProtocol`
- **Primary Function**: Enabling users to borrow USDT against their AMT tokens.
- **Network**: Binance Smart Chain (BSC)

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
function createLoan(uint256 amtAmount) external
```

Allows a user to create a loan by locking a specified amount of AMT tokens.

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
function setLoanRatio(uint256 _loanRatio) public onlyOwner
```

Used by the contract owner to adjust the loan-to-value ratio.

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

1. Loan creation and loan fetching for an user (test example)

```typescript
const wallets = await ethers.getSigners();
const [owner, user] = wallets;
await amt.transfer(user.address, ethers.utils.parseEther("2000"));
await amt
  .connect(user)
  .approve(loanProtocol.address, ethers.utils.parseEther("2000"));

const loansToCreate = ["100", "30", "900"];
const expectedLoans = [];

//Send USDT to the loan protocol
await usdt.transfer(loanProtocol.address, ethers.utils.parseEther("1500000"));
for (let amtAmount of loansToCreate) {
  const priceFromPriceFeeder = await priceFeeder.getPrice(
    ethers.utils.parseEther(amtAmount)
  );
  const rate = await loanProtocol.loanRatio();
  const expectedLoan = {
    amountBorrowed: priceFromPriceFeeder.div(rate),
    collateralLocked: ethers.utils.parseEther(amtAmount),
    loanPrice: await priceFeeder.getPrice(ethers.utils.parseEther(amtAmount)),
    loanRatio: await loanProtocol.loanRatio(),
  };
  await loanProtocol
    .connect(user)
    .createLoan(ethers.utils.parseEther(amtAmount));
  expectedLoans.push(expectedLoan);
}

const userLoans = await loanProtocol.getUserLoans(user.address);

for (let i = 0; i < userLoans.length; i++) {
  expect(userLoans[i].amountBorrowed).to.equal(expectedLoans[i].amountBorrowed);
  expect(userLoans[i].collateralLocked).to.equal(
    expectedLoans[i].collateralLocked
  );
  expect(userLoans[i].loanPrice).to.equal(expectedLoans[i].loanPrice);
  expect(userLoans[i].loanRatio).to.equal(expectedLoans[i].loanRatio);
}
```

## Troubleshooting

(Include common issues and their resolutions related to interacting with the Loan Protocol contract.)
