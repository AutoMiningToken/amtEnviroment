// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./IPriceFeeder.sol";
import "./Amt.sol";
import "./Master.sol";
import "hardhat/console.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/// @title LoanProtocol
/// @notice A contract to allow users to borrow USDT against their AMT tokens.
/// @author Auto Mining Token
/// @dev Uses price feed for AMT token to calculate loan amounts.
contract LoanProtocol is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using SafeERC20 for Amt;

    /// @notice Loan struct to hold information about a user's loan.
    /// @dev Contains the details of the user's loan including the amount borrowed, collateral locked, loan creation timestamp, loan price at creation time, and loan ratio.
    struct Loan {
        uint256 amountBorrowed; /// @notice The amount of USDT borrowed.
        uint256 collateralLocked; /// @notice The amount of AMT tokens locked as collateral.
        uint256 loanTimestamp; /// @notice Timestamp when the loan was created.
        uint256 loanPrice; /// @notice Price of the total AMT used as collateral at the moment of the loan creation.
        uint256 loanRatio; /// @notice The loan-to-value ratio used for this loan.
        address priceFeeder; /// @notice the price feeder address used at the moment of loan creation
    }

    IERC20 private immutable usdt; /// @dev Interface instance for the USDT token.
    IERC20 private immutable btcb; /// @dev Interface instance for the BTCB token.
    Master private immutable master; /// @dev Interface instance for the Master contract.
    Amt private immutable amt; /// @dev Interface instance for the AMT token.
    IPriceFeeder private priceFeeder; /// @dev Interface instance for the AMT price feed.

    address private _pauseAdmin; /// @dev address allowed to pause and unpause the contract

    /// @notice Mapping of user's address to their array of loans.
    mapping(address => Loan[]) public userLoans;

    uint256 public loanRatioMin; /// @notice The global minimun % of USDT to borrow in relation with the collateral value.
    uint256 public loanRatioMax; /// @notice The global maximun % of USDT to borrow in relation with the collateral value.

    /// Event emitted when a loan is created.
    event LoanCreated(
        address indexed user,
        uint256 borrowedAmount,
        uint256 collateralAmount
    );

    /// Event emitted when a loan is closed.
    event LoanClosed(
        address indexed user,
        uint256 repaidAmount,
        uint256 collateralReturned
    );

    /// Event emitted when a loan is partially closed (User return part of the collateral)
    event LoanPartialClosed(
        address indexed user,
        uint256 repaidAmount,
        uint256 collateralReturned
    );

    /// Event emitted when the owner changes the price feeder contract
    event PriceFeederChanged(address newPriceFeeder);

    /// Event emitted when the owner changes the minimun and maximun loan ratio to accept loans.
    event LoanRatioChanged(uint256 newLoanRatioMin, uint256 newLoanRatioMax);

    // Modifier that allows only the pause admin to execute a function
    modifier onlyPauseAdmin() {
        require(msg.sender == _pauseAdmin, "Caller is not the pause admin");
        _;
    }

    /// @notice Contract constructor sets up token interfaces and price feed.
    /// @dev Initializes token interfaces and the price feeder contract. Also sets the initial loan ratio.
    /// @param _btcb Address of the BTCB token.
    /// @param _usdt Address of the USDT token.
    /// @param _amt Address of the AMT token.
    /// @param _master Address of the Master contract
    /// @param _priceFeeder Address of the price feeder contract.
    constructor(
        address _btcb,
        address _usdt,
        address _amt,
        address _master,
        address _priceFeeder,
        uint256 _loanRatioMin,
        uint256 _loanRatioMax
    ) {
        require(
            _btcb != address(0),
            "Btcb address must not be the zero address"
        );
        require(
            _usdt != address(0),
            "Usdt address must not be the zero address"
        );
        require(_amt != address(0), "Amt address must not be the zero address");
        require(
            _master != address(0),
            "Master address must not be the zero address"
        );
        require(
            _priceFeeder != address(0),
            "Price feeder address must not be the zero address"
        );
        require(_loanRatioMin > 0, "Minumun loan ratio must not be zero");
        require(
            _loanRatioMax >= _loanRatioMin,
            "Maximun loan ratio must be greater than minumun"
        );
        require(
            _loanRatioMax < 100,
            "Maximun loan ratio must be lesser than 100"
        );
        usdt = IERC20(_usdt);
        btcb = IERC20(_btcb);
        master = Master(_master);
        amt = Amt(_amt);
        priceFeeder = IPriceFeeder(_priceFeeder);

        loanRatioMin = _loanRatioMin;
        loanRatioMax = _loanRatioMax;
        _pauseAdmin = msg.sender;
    }

    /// @notice Allows users to create a loan by locking their AMT tokens.
    /// @dev The loan amount is based on the current AMT token price and the loan ratio. The function transfers the locked AMT tokens to the contract and sends the loan amount in USDT to the user.
    /// @param amtAmount Amount of AMT tokens user wants to lock as collateral.
    /// @param loanRatio Loan ratio for the new loan to create
    function createLoan(
        uint256 amtAmount,
        uint256 loanRatio
    ) external whenNotPaused nonReentrant {
        require(amtAmount > 0, "amtAmount must be greatter than zero");
        require(loanRatio <= loanRatioMax, "Loan ratio must be lower than maximun allowed");
        require(loanRatio >= loanRatioMin, "Loan ratio must be greatter than minimun allowed");
        require(
            amt.balanceOf(msg.sender) >= amtAmount,
            "Not enought AMT balance"
        );
        uint256 loanAmount = calculateLoanAmount(amtAmount, loanRatio);
        require(loanAmount > 0, "Loan ammount too small");
        require(
            loanAmount <= usdt.balanceOf(address(this)),
            "Loan protocol has not enought balance"
        );
        Loan memory newLoan = Loan({
            amountBorrowed: loanAmount,
            collateralLocked: amtAmount,
            loanTimestamp: block.timestamp,
            loanPrice: priceFeeder.getPrice(amtAmount),
            loanRatio: loanRatio,
            priceFeeder: address(priceFeeder)
        });

        userLoans[msg.sender].push(newLoan);

        amt.safeTransferFrom(msg.sender, address(this), amtAmount);

        usdt.safeTransfer(msg.sender, loanAmount);

        emit LoanCreated(msg.sender, loanAmount, amtAmount);
    }
    /// @notice Adds additional AMT tokens as collateral to an existing loan.
    /// @dev Transfers AMT tokens from the caller to the contract and increases the collateral amount for the specified loan.
    ///      This function requires the caller to have a sufficient AMT balance and for the loan to exist.
    ///      It also uses the `safeTransferFrom` method to securely transfer AMT tokens from the caller to the contract.
    /// @param loanIndex The index of the loan in the caller's array of loans to which the collateral is being added.
    ///                  This index must be valid and correspond to an existing loan.
    /// @param amount The amount of AMT tokens to be added as additional collateral.
    ///               This amount must be greater than zero and the caller must have enough tokens to cover the transfer.
    /// @notice Emit an event to reflect the addition of collateral to a specific loan.
    /// @notice This function is protected against reentrancy attacks.
    function addCollateral(uint256 loanIndex, uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must not be zero");
        require(loanIndex < userLoans[msg.sender].length, "Invalid loan index");
        require(amt.balanceOf(msg.sender) >= amount, "insufficient AMT balance");
        
        amt.safeTransferFrom(msg.sender,address(this), amount);
        userLoans[msg.sender][loanIndex].collateralLocked += amount;
    }

    /// @notice Allows users to close an active loan.
    /// @dev Users need to repay the full loan amount. After repayment, the contract returns the locked collateral to the user and the loan is closed.
    /// @param loanIndex Index of the loan in the user's loans array.
    function closeLoan(
        uint256 loanIndex,
        uint256 amount
    ) external nonReentrant {
        require(amount > 0, "Amount must not be zero");
        require(loanIndex < userLoans[msg.sender].length, "Invalid loan index");
        require(
            usdt.balanceOf(msg.sender) >= amount,
            "Insufficient USDT to repay loan"
        );
        require(
            amount <= userLoans[msg.sender][loanIndex].amountBorrowed,
            "Amount exceds borrowed amount"
        );
        if (userLoans[msg.sender][loanIndex].amountBorrowed == amount) {
            totalCloseLoan(loanIndex);
        } else {
            partialCloseLoan(loanIndex, amount);
        }
    }

    /// @notice Sets a new pause admin for the contract.
    /// @dev Can only be called by the current owner.
    /// @param newPauseAdmin The address to be set as the new pause admin.
    function setPauseAdmin(address newPauseAdmin) public onlyOwner {
        require(
            newPauseAdmin != address(0),
            "New pause admin is the zero address"
        );
        _pauseAdmin = newPauseAdmin;
    }

    /// @notice Pauses all critical functionalities of the contract.
    /// @dev Can only be called by the pause admin. This function triggers the paused state.
    function emergencyStop() public onlyPauseAdmin {
        _pause();
    }

    /// @notice Resumes all functionalities of the contract from the paused state.
    /// @dev Only the pause admin can call this to unpause the contract.
    function resumeOperations() public onlyPauseAdmin {
        _unpause();
    }

    /// @notice Allows the owner to set a new price feeder contract.
    /// @dev Only callable by the contract owner.
    /// @param _priceFeeder Address of the new price feeder contract.
    function setPriceFeeder(address _priceFeeder) public onlyOwner {
        require(
            _priceFeeder != address(0),
            "Price feeder address must not be the zero address"
        );
        priceFeeder = IPriceFeeder(_priceFeeder);
        emit PriceFeederChanged(_priceFeeder);
    }

    /// @notice Allows the owner to set a new loan ratio.
    /// @dev Only callable by the contract owner.
    /// @param _loanRatioMin New minumiun 1/loan-to-value ratio for loans.
    /// @param _loanRatioMax New maximun 1/loan-to-value ratio for loans.
    function setLoanRatio(
        uint256 _loanRatioMin,
        uint256 _loanRatioMax
    ) public onlyOwner {
        require(_loanRatioMin > 0, "Minumun loan ratio must not be zero");
        require(
            _loanRatioMax >= _loanRatioMin,
            "Maximun loan ratio must be greater than minumun"
        );
        require(
            _loanRatioMax < 100,
            "Maximun loan ratio must be lesser than 100"
        );
        loanRatioMax = _loanRatioMax;
        loanRatioMin = _loanRatioMin;
        emit LoanRatioChanged(_loanRatioMin, _loanRatioMax);
    }

    /// @notice Allows the owner to liquidate a user's loan.
    /// @dev The loan can be liquidated if its current value is less than the borrowed amount, potentially due to a drop in the AMT token price. The locked collateral is transferred to the contract owner.
    /// @param loanIndex Index of the loan in the user's loans array.
    /// @param user Address of the user.
    function liquidateLoan(uint256 loanIndex, address user) public onlyOwner {
        require(loanIndex < userLoans[user].length, "Invalid loan index");
        Loan storage userLoan = userLoans[user][loanIndex];

        require(isLoanLiquidable(loanIndex, user), "Loan not liquidable");
        amt.safeTransfer(msg.sender, userLoan.collateralLocked);

        // 0 repayment implies liquidation
        emit LoanClosed(user, 0, userLoan.collateralLocked);

        delete userLoans[user][loanIndex];
        if (loanIndex < userLoans[user].length - 1) {
            userLoans[user][loanIndex] = userLoans[user][
                userLoans[user].length - 1
            ];
        }
        userLoans[user].pop();
    }

    /// @notice Charges the contract by a specified snapshot ID.
    /// @dev Only callable by the owner, it triggers the `charge` function of the Master contract and transfers BTCB tokens.
    /// @param snapId The snapshot ID to be used for charging.
    function charge(uint256 snapId) public onlyOwner {
        master.charge(snapId);
        btcb.safeTransfer(msg.sender, btcb.balanceOf(address(this)));
    }

    /// @notice Withdraws a specified amount of USDT from the contract to the owner's address.
    /// @dev Ensures the withdrawal amount is available before transfer.
    /// @param amount The amount of USDT to withdraw.
    function withdrawlUsdt(uint256 amount) public onlyOwner {
        require(amount <= usdt.balanceOf(address(this)), "Not enought USDT");
        usdt.safeTransfer(msg.sender, amount);
    }

    /// @notice Returns the address of the price feeder
    function getPriceFeederAddress() public view returns (address) {
        return (address(priceFeeder));
    }

    /// @notice Retrieves all loans associated with a user.
    /// @param user The address of the user whose loans are to be retrieved.
    /// @return loans An array of Loan structs representing the user's loans.
    function getUserLoans(
        address user
    ) public view returns (Loan[] memory loans) {
        return userLoans[user];
    }

    /// @notice Determines if a given loan is liquidable.
    /// @dev A loan might be liquidable if the current price of AMT drops  compared to the price at loan creation time, making the locked collateral's value less than the borrowed amount.
    /// @param loanIndex Index of the loan in the user's loans array.
    /// @param user Address of the user.
    /// @return True if the loan is liquidable, false otherwise.
    function isLoanLiquidable(
        uint256 loanIndex,
        address user
    ) public view returns (bool) {
        require(loanIndex < userLoans[user].length, "Invalid loan index");
        Loan storage userLoan = userLoans[user][loanIndex];

        return
            IPriceFeeder(userLoan.priceFeeder).getPrice(
                userLoan.collateralLocked
            ) < userLoans[user][loanIndex].amountBorrowed;
    }

    /// @notice Internally called to partially close a specified loan.
    /// @param loanIndex The index of the loan in the user's loan array.
    /// @param amount The amount of USDT being repaid.
    /// @dev Adjusts the loan's borrowed amount and collateral accordingly.
    function partialCloseLoan(uint256 loanIndex, uint256 amount) internal {
        Loan storage userLoan = userLoans[msg.sender][loanIndex];

        uint256 amtToReturn = (userLoan.collateralLocked * amount) /
            userLoan.amountBorrowed;
        usdt.safeTransferFrom(msg.sender, address(this), amount);
        amt.safeTransfer(msg.sender, amtToReturn);

        emit LoanPartialClosed(msg.sender, amount, amtToReturn);
        userLoan.amountBorrowed -= amount;
        userLoan.collateralLocked -= amtToReturn;
    }

    /// @notice Internally called to completely close a specified loan.
    /// @param loanIndex The index of the loan in the user's loan array.
    /// @dev Transfers back the full collateral and marks the loan as closed.
    function totalCloseLoan(uint256 loanIndex) internal {
        Loan storage userLoan = userLoans[msg.sender][loanIndex];

        uint256 totalRepayment = userLoan.amountBorrowed;

        usdt.safeTransferFrom(msg.sender, address(this), totalRepayment);
        amt.safeTransfer(msg.sender, userLoan.collateralLocked);

        emit LoanClosed(msg.sender, totalRepayment, userLoan.collateralLocked);

        delete userLoans[msg.sender][loanIndex];
        if (loanIndex < userLoans[msg.sender].length - 1) {
            userLoans[msg.sender][loanIndex] = userLoans[msg.sender][
                userLoans[msg.sender].length - 1
            ];
        }
        userLoans[msg.sender].pop();
    }

    /// @notice Calculates the potential loan amount for a given AMT token amount.
    /// @dev Uses the price feed to get the current price of AMT tokens.
    /// @param amtAmount Amount of AMT tokens user wants to lock as collateral.
    /// @param loanRatio Loan ratio to calculate the loan amount
    /// @return Calculated loan amount in USDT.
    function calculateLoanAmount(
        uint256 amtAmount,
        uint256 loanRatio
    ) internal view returns (uint256) {
        uint256 amtPrice = priceFeeder.getPrice(amtAmount);
        return ((amtPrice) * loanRatio) / 100;
    }
}
