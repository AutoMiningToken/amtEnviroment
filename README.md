# Auto Mining Token (AMT)

Welcome to the Auto Mining Token repository. This project focuses on integrating blockchain technology to provide token holders with daily BTC benefits in the form of BTCB on the Binance Smart Chain (BSC). The main branch of this repository is dedicated to the Auto Mining Token smart contract, but this particular branch is specifically for presenting and auditing a new feature, the Loan Protocol.

## Project Overview

Auto Mining Token is a smart contract project that automatically distributes a share of daily BTC earnings among AMT holders. The primary focus of our smart contracts is on security, efficiency, and transparent distribution of rewards.

## Loan Protocol

The Loan Protocol is a groundbreaking addition to the AMT ecosystem, allowing AMT holders to use their tokens as collateral to receive USDT at a predetermined rate. This feature aims to enhance the functionality and utility of AMT, providing holders with more flexibility and options for their assets.

For an in-depth explanation of the Loan Protocol, including API details and examples, see [Loan Protocol Documentation](LOAN_PROTOCOL.md).

For an in-depth explanation of the Price Feeder used in the Loan Protocol, see [Price Feeder Documentation](PRICE_FEEDER.md).

For an in-depth explanation of the small modifications to FixedFloat.sol library and pancake contracts for testing purposes, see [MODIFICATIONS.md](MODIFICATIONS.md).

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

```bash
patch -p1 < ../fixedPoint.patch
```

3. Repeat the installation process for the Testing environment:

```bash
cd Production
npm install
```

```bash
patch -p1 < ../fixedPoint.patch
```

## Usage

In the Testing environment, we have custom npm commands tailored to various testing scenarios. These commands facilitate the process of altering the testing setup without manually modifying the `pairFor` function each time. The modification of the initialization hash in the `pairFor` function of the PancakeLibrary is necessary for the tests to run correctly. This approach ensures ease and efficiency in testing the AMT smart contract under different scenarios, making it a crucial part of our testing strategy. Here are the commands and their uses:

1. **Local Testing:**

   - Command: `npm run test:local`
   - Description: This command sets up a local testing environment with a specific initialization hash. It's used for standard testing of the AMT contract functionalities in a controlled local environment.

   ```bash
   npm run test:local
   ```

2. **Coverage Testing:**

   - Command: `npm run test:coverage`
   - Description: Runs tests while measuring the code coverage. This ensures that the tests adequately cover the smart contract code and that different aspects of the AMT contract are thoroughly tested under various scenarios. Executes the npx hardhat coverage.

   ```bash
   npm run test:coverage
   ```

3. **Fork Testing:**

   - Command: `npm run test:fork`
   - Description: This command is used for fork testing, where tests are run on a fork of the mainnet or another live network. It allows testing of the AMT contracts in an environment that closely mirrors the actual blockchain, with an initialization hash reflecting the state of the contracts in the forked environment.

   ```bash
   npm run test:fork
   ```

Each of these testing commands triggers a script that dynamically modifies the initialization hash in the `PancakeLibrary.sol` contract before the tests are run. This approach ensures that the `pairFor` function within the contract computes pair addresses accurately, based on the simulated deployment environment, be it local, coverage, or a forked network.

## Troubleshooting

### Issue: Test Fails with "call to non-contract account" Error

It's possible that your tests might fail with errors like "call to non-contract account" if the initialization hash is not correctly set. This issue can arise due to various factors, and the following instructions will guide you through resolving it:

#### Steps to Resolve:

1. **Run the Failing Command**: Execute the command that is failing (e.g., `npm run test:local`, `npm run test:coverage`). Do not run any other command after this as the data generated in the `artifacts` during the failing execution is required for the next steps.

2. **Locate the PancakePair JSON File**: Navigate to the `Testing\artifacts\contracts\Pancake-exchange-contracts\contracts\PancakePair.sol\PancakePair.json` file and open it.

3. **Copy the Bytecode**: In the JSON file, locate the `"bytecode"` key and copy the hex string bytecode. Ensure not to confuse this with the `"deployedBytecode"` key. The string you copy should start with `0x`.

4. **Generate the Initialization Hash**:

   - Go to an online Keccak-256 generator like [Keccak-256 Online Tool](https://emn178.github.io/online-tools/keccak_256.html).
   - Set the input type as Hex.
   - Remove the initial `0x` from the copied bytecode string.
   - Generate the hash. The result should be a string similar in length to `"3c96aa5190ff88a7216ba45b8da1bdb346ea9366dad9db8e2b3139d0eb777eb6"`.

5. **Update `package.json` Scripts**: Copy the generated hash and modify the `scripts` section of your `package.json` file. Replace the first parameter used in the `prepareTestEnvironment.js` script with the new hash.

   Example:

   ```json
   "scripts": {
     "test:local": "node scripts/testSetUp/prepareTestEnviroment.js [NEW_HASH] && npx hardhat test",
     "test:coverage": "node scripts/testSetUp/prepareTestEnviroment.js [NEW_HASH] && npx hardhat coverage",
     "test:fork": "node scripts/testSetUp/prepareTestEnviroment.js [NEW_HASH] && npx hardhat test --config ./hardhat.config.fork.ts"
   }
   ```

#### Note:

- Ensure that you replace `[NEW_HASH]` with the actual hash string you obtained.
- This process is critical for accurately setting up the testing environment and ensuring that the `pairFor` function in your contract operates correctly with the updated initialization hash.

## Contact

If you have any questions or need further clarification, please contact us at developer@autominingtoken.com
