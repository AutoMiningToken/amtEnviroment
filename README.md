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

1. Prepare the Production Environment:

- Navigate to the Production directory and install the necessary dependencies with the following commands:

```bash
cd Production
npm install
```

2. Apply the fixedPoint.patch for Compatibility:

- The npm install command triggers the execution of the postinstall script, apply-patch.js, which applies the patch command to ensure compatibility with the FixedPoint.sol library. If this process fails, you can manually execute the script by running:

```bash
npm run postinstall
```

- In environments that do not support the patch command, you may need to manually adjust the file. Please refer to the corresponding section for guidance.

2. Set Up the Testing Environment::

- Repeat the installation process in the Testing directory to prepare your testing environment:

```bash
cd Testing
npm install
```

4. Ensure Patch Application for Testing:
   - Similar to the production setup, confirm that the fixedPoint.patch has been successfully applied to maintain functionality in the testing environment.

#### Manual File Replacement (Alternative Method to apply patch)

1. Locate the Modified File:

   1. Navigate to the `patches/Modified/` directory in your project.
   2. Find the `fixedPoint.sol` file, which contains the necessary modifications.

2. Replace the File in Production::

   1. Go to the Production project's `node_modules/@uniswap/lib/contracts/libraries` directory.
   2. Replace the existing `FixedPoint.sol` file with the one you found in `patches/Modified/`. You can do this by copying and pasting the modified file into this directory, overwriting the original file.

3. Replace the File in Testing:
   1. Similarly, in the Testing project, navigate to `node_modules/@uniswap/lib/contracts/libraries`.
   2. Replace the `FixedPoint.sol` file here with the modified version from `patches/Modified/`.

**Important Notes:**

1. Ensure that you replace the FixedPoint.sol file in the correct directory for both Production and Testing environments.
2. This manual process should only be used if the patch application fails or if you are unable to use the patch command.
3. After replacing the file, verify that the changes are correctly implemented by reviewing the FixedPoint.sol file in each environment.

## Usage

Execute compile before executing the tests

```bash
npx hardhat compile
```

In the Testing environment, we have custom npm commands tailored to various testing scenarios. These commands facilitate the process of altering the testing setup without manually modifying the `pairFor` function each time. The modification of the initialization hash in the `pairFor` function of the PancakeLibrary is necessary for the tests to run correctly. This approach ensures ease and efficiency in testing the AMT smart contract under different scenarios, making it a crucial part of our testing strategy.

This testing enviroment contain tests for the complete AMT system coverage. It takes a lot of time to complete execution. In case you only want to test the loan protocol please go to the `test/` and move `00 - Basic system` to the folder `_test/` to avoid over execution when not neeeded.

Remember, encountering issues during the initial setup or execution of commands is not uncommon, and the **Troubleshooting** section is here to assist you in overcoming these hurdles.

## Loan protocol and related contracts testing

We leverage Hardhat's forking functionality to create testing environments that closely mimic real-world scenarios. As a result, these tests may take longer to execute compared to others.

To test the Price Feeder Contract effectively, it's essential to update the BTCB and AMT price values within the test code. Follow these steps to make the necessary changes:

1. Locate the Test File: Navigate to the file Testing/test/01 - Loan protocol/01-PriceFeeder.ts.

2. Update Price Values: Modify the price constants in lines 29 and 30 to reflect the current prices. The constants are structured as follows:

```typescript
  //This values need to be updated to work
  const btcbPrice = [ACTUAL BTCB PRICE];
  const amtPrice = [ACTUAL AMT PRICE];
```

Note: Exact price precision is not mandatory, as the test includes a tolerance margin for price variations.

Finding Current Prices: You can easily obtain the latest prices for BTCB and AMT from the following sources:

1. [BTCB PRICE](https://coinmarketcap.com/currencies/bitcoin/).
2. [AMT PRICE](https://poocoin.app/tokens/0x6ae0a238a6f51df8eee084b1756a54dd8a8e85d3).

## Custom test commands

Here are the commands and their uses:

1. **Local Testing:**

   - Command: `npm run test:simple`
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

Each of these testing commands triggers a script that dynamically modifies the initialization hash in the `PancakeLibrary.sol` contract before the tests are run. This approach ensures that the `pairFor` function within the contract computes pair addresses accurately, based on the simulated deployment environment, be it local, coverage, or a forked network.

## Troubleshooting

### Issue: problems with BSC RPC on priceFeeder tests

At the outset of this project, our goal was to rigorously test every facet of the loan protocol system by forking the Binance Smart Chain (BSC) via a public RPC endpoint in Hardhat, rather than relying on mock contracts. We aimed to ensure our tests remained as authentic and reflective of real-world scenarios as possible. This approach was particularly relevant given our use of a Chainlink oracle for retrieving BTC prices in USDT, underscoring the importance of accurate and realistic testing environments.

However, during the development process, we encountered significant challenges with the stability and reliability of public RPC endpoints. These issues compelled us to reconsider our testing strategy for specific components. Consequently, we decided to focus this approach on the areas we deemed most critical, namely the testing of the price feeder. In contrast, for the Loan Protocol tests, we opted to mock the Chainlink oracle to ensure the stability and predictability of our test environment.

Should you encounter any failures in the price feeder tests due to RPC connectivity issues, we recommend updating the BSC RPC URL in the Testing\test\01 - Loan Protocol\01-PriceFeeder.ts file, specifically at line 48, to a new public RPC endpoint:

```typescript
const BSC_URL = "https://bscrpc.com";
```

While we have found https://bscrpc.com to be a reliable endpoint, its effectiveness may vary, and it might not work for everyone. For alternatives, please consult the following resources to select a new RPC endpoint:

- [BNB Chain RPCs List](https://rpc.info/bnb-chain)
- [Chainlist for BNB Chain](https://chainlist.org/chain/56)

Additionally, we have had positive experiences with https://bsc.meowrpc.com. Conversely, the RPC endpoints associated with "llama" have proven to be less reliable. Adjusting the RPC endpoint as needed will help ensure that your tests run as smoothly and accurately as possible.

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
     "test:simple": "node scripts/testSetUp/prepareTestEnviroment.js [NEW_HASH] && npx hardhat test",
     "test:coverage": "node scripts/testSetUp/prepareTestEnviroment.js [NEW_HASH] && npx hardhat coverage",
   }
   ```

#### Note:

- Ensure that you replace `[NEW_HASH]` with the actual hash string you obtained.
- This process is critical for accurately setting up the testing environment and ensuring that the `pairFor` function in your contract operates correctly with the updated initialization hash.

### Issue: ProviderError: missing trie node

As the tests uses a fork of the BSC mainnet to be as closer as posible to the real enviroment sometimes when running the complete test set this error happens in the Loan Protocol test executed at the end. To solve it exclude the basic testing moving the folder `00 - Basic system` inside the `/test` folder to the folder `_test/` and execute the test again. The test must pass without any other troubles.
