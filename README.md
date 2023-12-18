# Auto Mining Token (AMT)

Welcome to the Auto Mining Token repository. This project focuses on integrating blockchain technology to provide token holders with daily BTC benefits in the form of BTCB on the Binance Smart Chain (BSC). The main branch of this repository is dedicated to the Auto Mining Token smart contract, but this particular branch is specifically for presenting and auditing a new feature, the Loan Protocol.

## Loan Protocol

The Loan Protocol is a groundbreaking addition to the AMT ecosystem, allowing AMT holders to use their tokens as collateral to receive USDT at a predetermined rate. This feature aims to enhance the functionality and utility of AMT, providing holders with more flexibility and options for their assets.

## Project Overview

Auto Mining Token is a smart contract project that automatically distributes a share of daily BTC earnings among AMT holders. The primary focus of our smart contracts is on security, efficiency, and transparent distribution of rewards.

## Installation

The project is structured into two main directories: `Production` and `Testing`. Each directory is a self-contained Hardhat project and requires separate setup.

### Prerequisites

- Node.js
- npm

### Setup

1. Navigate to the `Production` folder and install dependencies:

```bash
cd Production
npm install
```

2. Apply the `fixedPoint.patch` to ensure compatibility and proper functionality:

```
patch -p1 < ../fixedPoint.patch
```

3. Repeat the installation process for the Testing environment:

```bash
cd Production
npm install
```

```
patch -p1 < ../fixedPoint.patch
```

## Usage

In the Testing environment, we have custom npm commands tailored to various testing scenarios involving different initialization hashes for the pancakeLibrary pair. Here are the commands and their uses:

1. Local Testing:

```bash
npm run test:local
```

2. Coverage Testing:

```bash
npm run test:coverage
```

3. Fork Testing:

```bash
npm run test:fork
```
