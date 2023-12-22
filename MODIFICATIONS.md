# Modifications Documentation

## Overview

This document outlines the modifications made to standard libraries in the AMT project to ensure compatibility with the Solidity version used and to adapt certain functionalities to our specific requirements.

## Note on Diffs

The specific changes made to these files can be viewed in the diffs provided in the repository: `fixedPoint.patch` and `pancake_changes.diff`. The diff is against the original files fixedPoint.sol from the @uniswap library and from the pancakeExchangeContract of the [oficial pancake respository](https://github.com/pancakeswap/pancake-smart-contracts/tree/master/projects/exchange-protocol)

## Modifications

### FixedPoint.sol Library (Uniswap)

#### Modified File

- Location: `node_modules/@uniswap/lib/contracts/libraries/FixedPoint.sol`

#### Changes

- Removed unused imports (`FullMath.sol`, `Babylonian.sol`, `BitMath.sol`).
- Removed unused functions that were not relevant to our project's use case.
- Minor modifications were made to existing functions to enhance readability and maintain compatibility with the newer Solidity version.
- The modifications primarily involve formatting changes and simplification of function parameters and return statements.

### PancakeLibrary.sol

#### Modified File

- Location: `Pancake-exchange-contracts/contracts/libraries/PancakeLibrary.sol`

#### Changes

- Adjusted the `pairFor` function to be compatible with higher versions of Solidity.
- Changed the initialization code hash in the `pairFor` function to match the deployment environment of our project.
- The modification involved altering the way the pair address is calculated, ensuring it aligns with our specific version of the PancakeSwap contracts.

### SafeMath.sol Library (PancakeSwap)

#### Modified File

- Location: `contracts/Pancake-exchange-contracts/contracts/libraries/SafeMath.sol`

#### Changes

- Updated the Solidity version pragma to support newer versions.
- Ensured that the SafeMath library functions are compatible with the Solidity version used in our project.

## Rationale for Modifications

- **Compatibility**: The main driver for these modifications was to ensure compatibility with the Solidity version used in our project. The standard libraries were originally designed for older versions of Solidity, necessitating updates to work with newer compiler versions.
- **Project-Specific Requirements**: Certain functionalities in the standard libraries were not needed for our project. Removing these unused parts helped streamline the codebase, making it more efficient and easier to maintain.
- **Custom Deployment Environments**: For contracts like `PancakeLibrary`, the modifications in the initialization code hash were crucial to align the contract's behavior with our deployment environment and the specific versions of the PancakeSwap contracts used.
