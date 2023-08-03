// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

//imports for liquitity interactions
import "./IUniswapV2Router02.sol";
import "./IUniswapV2Factory.sol";

//local imports
import "./Amt.sol";
import "./LiquidityAmt.sol";

//Standar imports
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
//Timelock import
import "@openzeppelin/contracts/token/ERC20/utils/TokenTimelock.sol";

/**
 * @title liqLocker
 * @notice This contract is a specialized token timelock for managing liquidity.
 * It inherits from OpenZeppelin's TokenTimelock contract.
 *
 * The contract holds tokens until a specified time, and then allows a beneficiary to withdraw them.
 * In addition, it provides functionality to charge tokens via the Master contract.
 * The contract also interacts with IERC20 tokens and other contracts like Uniswap's Router and Factory contracts.
 */
contract liqLocker is TokenTimelock {
    Master masterContract;
    IERC20 btcb;
    IERC20 liqToken;

    constructor(
        IERC20 token_,
        IERC20 btcb_,
        IERC20 liqToken_,
        address beneficiary_,
        uint256 releaseTime_,
        address masterContract_
    ) TokenTimelock(token_, beneficiary_, releaseTime_) {
        require(beneficiary_ != address(0),"Beneficiary must not be the zero address");
        require(masterContract_ != address(0),"Master must not be the zero address");
        masterContract = Master(masterContract_);
        btcb = btcb_;
        liqToken = liqToken_;
    }

    function charge(uint256 snapId) public {
        masterContract.liqCharge(snapId);
        bool transferSucceded = btcb.transfer(beneficiary(), btcb.balanceOf(address(this)));
        require(transferSucceded, "Transfer fail");
    }

    function release() public virtual override {
        require(
            block.timestamp >= releaseTime(),
            "TokenTimelock: current time is before release time"
        );

        uint256 amount = token().balanceOf(address(this));
        require(amount > 0, "TokenTimelock: no tokens to release");

        bool transferSucceded = token().transfer(address(masterContract), amount);
        require(transferSucceded, "Transfer fail");
        transferSucceded = liqToken.transfer(beneficiary(), amount);
        require(transferSucceded, "Transfer fail");
    }
}

/// @title Master Contract
/// @notice This contract manages payments, liquidity, and token interactions.
/// @dev Extends the Ownable contract, providing a mechanism to prevent unauthorized access to certain methods.
contract Master is Ownable {
    /// @notice The address of the liquidity locker
    address public addrLiqLocker;

    /// @notice Flag indicating if liquidity is locked
    bool liqLocked = false;

    /// @notice Instance of the AMT token
    Amt amt;

    /// @notice Instance of the BTCB token
    IERC20 btcb;

    /// @notice Instance of the liquidity token
    LiquidityAmt liqToken;

    /// @notice Instance of the external liquidity token
    IERC20 externalLiqToken;

    /// @notice The address of the Uniswap router
    address constant addrRouter = 0x10ED43C718714eb63d5aA57B78B54704E256024E;

    /// @notice Instance of the Uniswap router
    IUniswapV2Router02 constant liqRouter = IUniswapV2Router02(addrRouter);

    /// @notice Instance of the Uniswap factory
    IUniswapV2Factory liqFactory;

    /// @notice The address of the vault
    address public vault;

    /// @notice The address of the liquidity pool
    address public liqPool;

    /// @notice The address of the wallet that makes payments
    address public payerWallet;

    /// @notice Constant address of the BTCB token
    address constant addrBtcb = 0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c;

    /// @notice Mapping of snapshot IDs to corresponding amounts paid on that snapshot
    mapping(uint256 => uint256) public pays;
    /// @notice Mapping of snapshot IDs to corresponding amounts paid on that snapshot to liquidity providers
    mapping(uint256 => uint256) public liqPays;
    /// @notice Mapping of addresses to snapshot IDs indicating if they've already been charged
    mapping(address => mapping(uint256 => bool)) public alreadyCharged;
    /// @notice Mapping of addresses to snapshot IDs indicating if liquidity providers have already been charged
    mapping(address => mapping(uint256 => bool)) public liqAlreadyCharged;

    /// @notice Amount to approve for transactions
    uint256 amountForApproval = 99999999999999999999 * (10 ** 18);

    event payerWalletSet(address newPayerWallet);
    event rentPaid(uint256 amount, uint256 vaultPart);
    event approveExtended(uint256 amountApproved);
    event liqAdded(uint256 amountAmt, uint256 amountBtcb, address from);
    event liqLockingAdded(uint256 amountAmt, uint256 amountBtcb, address from);
    event liqRemoved(uint256 amountAmt, uint256 amountBtcb, address from);
    event masterHasMinted(address addr, uint256 amount);
    event charged(uint snapId, address user, uint256 amount);

    /// @notice Contract constructor, initializes instances, create the pair for the liquidity pool, and sets initial addresses
    constructor(
        address _amt,
        address _vault,
        address _liqToken,
        address _payerWallet
    ) {
        require(_amt != address(0),"Amt must not be the zero address");
        require(_vault != address(0),"Vault must not be the zero address");
        require(_liqToken != address(0),"LiqToken must not be the zero address");
        require(_payerWallet != address(0),"PayerWallet must not be the zero address");
        amt = Amt(_amt);
        btcb = IERC20(addrBtcb);
        liqToken = LiquidityAmt(_liqToken);
        liqFactory = IUniswapV2Factory(liqRouter.factory());
        externalLiqToken = IERC20(liqFactory.createPair(_amt, addrBtcb));
        vault = _vault;
        liqPool = address(externalLiqToken);
        btcb.approve(addrRouter, amountForApproval);
        amt.approve(addrRouter, amountForApproval);
        payerWallet = _payerWallet;
    }

    /// @notice Extends the approval for the AMT and BTCB tokens to the liquidity router
    /// @dev Can only be called by the contract owner
    function extendApprove(uint256 amount) public onlyOwner {
        amt.approve(addrRouter, amount);
        btcb.approve(addrRouter, amount);

        emit approveExtended(amount);
    }

    /// @notice Sets a new payer wallet
    /// @dev Can only be called by the contract owner
    function setPayerWallet(address newPayerWallet) public onlyOwner {
        require(newPayerWallet != address(0),"Payer wallet must not be the zero address");
        payerWallet = newPayerWallet;

        emit payerWalletSet(newPayerWallet);
    }

    /// @notice Pay the rent to token holders and liquidity providers and sends to vault the corresponding participation 
    function payRent(uint256 amountBtcb, uint256 vaultParticipation) public {
        require(
            btcb.balanceOf(msg.sender) >= amountBtcb,
            "Insuficient ammount of BTCB"
        );
        require(
            vaultParticipation <= 100,
            "vaultParticipation cannot be higher than 100"
        );
        require(amountBtcb > 100, "amount to small");
        require(
            msg.sender == payerWallet,
            "Only PayerWallet can make the payments"
        );

        uint256 toVault = (amountBtcb * vaultParticipation) / 100;

        uint256 toLiqProviders = ((amountBtcb - toVault) *
            amt.balanceOf(liqPool)) / amt.totalSupply();

        uint256 toHolders = amountBtcb - toVault - toLiqProviders;

        bool btcbTransfer1 = btcb.transferFrom(
            msg.sender,
            address(this),
            amountBtcb - toVault
        );
        bool btcbTransfer2 = btcb.transferFrom(msg.sender, vault, toVault);

        require(btcbTransfer1 && btcbTransfer2, "Transfer failed");

        uint256 snap = amt.snapshot();
        uint256 liqSnap = liqToken.snapshot();

        pays[snap] = toHolders;
        liqPays[liqSnap] = toLiqProviders;

        emit rentPaid(amountBtcb, vaultParticipation);
    }

    /// @notice Charge method for AMT holders to claim their payment for a given snapshot.
    /// @param snapId The id of the snapshot to claim the payment from.
    /// @return The amount of BTCB charged to the AMT holder.
    function charge(uint256 snapId) public returns (uint256) {
        require(alreadyCharged[msg.sender][snapId] == false, "Already charged");
        require(amt.balanceOfAt(msg.sender, snapId) > 0, "Nothing to charge");

        alreadyCharged[msg.sender][snapId] = true;

        uint256 toPay = (pays[snapId] * amt.balanceOfAt(msg.sender, snapId)) /
            (amt.totalSupplyAt(snapId) - amt.balanceOfAt(liqPool, snapId));
        bool btcbTransfer = btcb.transfer(msg.sender, toPay);

        require(btcbTransfer, "Transfer fail");

        emit charged(snapId, msg.sender, toPay);

        return toPay;
    }

    /// @notice Allows an AMT holder to claim their payments over a range of snapshots.
    /// @param from The starting snapshot id.
    /// @param to The ending snapshot id.
    /// @return The total amount of BTCB charged to the AMT holder for the range of snapshots.
    function chargeFromTo(uint256 from, uint256 to) public returns (uint256) {
        uint256 currentSnap = amt.getCurrentSnapshotId();
        require(to <= currentSnap, "Select a valid snapshot range");

        uint256 toPay = 0;

        for (uint256 i = from; i <= to; i++) {
            if (
                alreadyCharged[msg.sender][i] == false &&
                amt.balanceOfAt(msg.sender, i) > 0
            ) {
                uint256 paidAti = (pays[i] * amt.balanceOfAt(msg.sender, i)) /
                    (amt.totalSupplyAt(i) - amt.balanceOfAt(liqPool, i));
                toPay += paidAti;
                alreadyCharged[msg.sender][i] = true;

                emit charged(i, msg.sender, paidAti);
            }
        }

        require(toPay > 0, "There was nothing to transfer");

        bool btcbTransfer = btcb.transfer(msg.sender, toPay);

        require(btcbTransfer, "Transfer fail");

        return toPay;
    }


    /// @notice Allows a liquidity provider to claim their payment for a given snapshot.
    /// @param snapId The id of the snapshot to claim the payment from.
    function liqCharge(uint256 snapId) public {
        require(
            liqAlreadyCharged[msg.sender][snapId] == false,
            "Already charged"
        );
        require(
            liqToken.balanceOfAt(msg.sender, snapId) > 0,
            "Nothing to charge"
        );
        liqAlreadyCharged[msg.sender][snapId] = true;
        bool btcbTransfer = btcb.transfer(
            msg.sender,
            (liqPays[snapId] * liqToken.balanceOfAt(msg.sender, snapId)) /
                liqToken.totalSupplyAt(snapId)
        );

        require(btcbTransfer, "Transfer failed");
    }

    /// @notice Allows a liquidity provider to claim their payments over a range of snapshots.
    /// @param from The starting snapshot id.
    /// @param to The ending snapshot id.
    /// @return The total amount of BTCB charged to the liquidity provider for the range of snapshots.
    function liqChargeFromTo(
        uint256 from,
        uint256 to
    ) public returns (uint256) {
        uint256 currentSnap = amt.getCurrentSnapshotId();
        require(to <= currentSnap, "Select a valid snapshot range");

        uint256 toPay = 0;

        for (uint256 i = from; i <= to; i++) {
            if (
                liqAlreadyCharged[msg.sender][i] == false &&
                liqToken.balanceOfAt(msg.sender, i) > 0
            ) {
                alreadyCharged[msg.sender][i] = true;

                uint256 paidAti = (liqPays[i] *
                    liqToken.balanceOfAt(msg.sender, i)) /
                    (liqToken.totalSupplyAt(i));
                toPay += paidAti;

                emit charged(i, msg.sender, paidAti);
            }
        }

        require(toPay > 0, "There was nothing to transfer");

        bool btcbTransfer = btcb.transfer(msg.sender, toPay);

        require(btcbTransfer, "Transfer fail");

        return toPay;
    }

    /// @notice Adds liquidity to the contract and locks it for two years, can only be called by the contract owner.
    /// @param amountAmt The amount of AMT to be added.
    /// @param amountBtcb The amount of BTCB to be added.
    function addLiquidityLocking(
        uint256 amountAmt,
        uint256 amountBtcb
    ) public onlyOwner {
        //Transaction variables

        //Check requirements
        require(liqLocked == false, "Liquidity already locked");
        require(amt.balanceOf(msg.sender) >= amountAmt, "Not enough AMT");
        require(btcb.balanceOf(msg.sender) >= amountBtcb, "Not enough BBTC");
        require(amountAmt > 1, "AMT amount is too small");
        require(amountBtcb > 1, "BTCB amount is too small");

        liqLocked = true;

        bool amtTransfer1 = amt.transferFrom(
            msg.sender,
            address(this),
            amountAmt
        );
        bool btcbTransfer1 = btcb.transferFrom(
            msg.sender,
            address(this),
            amountBtcb
        );

        uint256 amountLiquidityCreated;
        uint256 amountAmtToLiq;
        uint256 amountBtcbToLiq;

        (amountAmtToLiq, amountBtcbToLiq, amountLiquidityCreated) = liqRouter
            .addLiquidity(
                address(amt),
                address(btcb),
                amountAmt,
                amountBtcb,
                (amountAmt * (98)) / 100,
                (amountBtcb * (98)) / 100,
                address(this),
                block.timestamp + 60
            );

        //Deploy of timelock
        uint256 lockingTime = 60 * 60 * 24 * 365 * 2; // locking time in secs
        liqLocker contractLiqLocker = new liqLocker(
            externalLiqToken,
            btcb,
            liqToken,
            msg.sender,
            block.timestamp + lockingTime,
            address(this)
        );
        externalLiqToken.transfer(
            address(contractLiqLocker),
            amountLiquidityCreated
        );
        liqToken.mint(address(contractLiqLocker), amountLiquidityCreated);
        bool amtTransfer2 = amt.transfer(
            msg.sender,
            amountAmt - amountAmtToLiq
        );
        bool btcbTransfer2 = btcb.transfer(
            msg.sender,
            amountBtcb - amountBtcbToLiq
        );
        addrLiqLocker = address(contractLiqLocker);

        require(
            amtTransfer1 && amtTransfer2 && btcbTransfer1 && btcbTransfer2,
            "Transfer failed"
        );

        emit liqLockingAdded(amountAmtToLiq, amountBtcbToLiq, msg.sender);
    }

    /// @notice Allows any user to add liquidity to the liquidity pool.
    /// @param amountAmt The amount of AMT to be added.
    /// @param amountBtcb The amount of BTCB to be added.
    function addLiquidity(uint256 amountAmt, uint256 amountBtcb) public {

        //Check requirements
        require(amt.balanceOf(msg.sender) >= amountAmt, "Not enough AMT");
        require(btcb.balanceOf(msg.sender) >= amountBtcb, "Not enough BBTC");
        require(amountAmt > 1, "AMT amount is too small");
        require(amountBtcb > 1, "BTCB amount is too small");

        bool amtTransfer1 = amt.transferFrom(
            msg.sender,
            address(this),
            amountAmt
        );
        bool btcbTransfer1 = btcb.transferFrom(
            msg.sender,
            address(this),
            amountBtcb
        );

        uint256 amountLiquidityCreated;
        uint256 amountAmtToLiq;
        uint256 amountBtcbToLiq;

        (amountAmtToLiq, amountBtcbToLiq, amountLiquidityCreated) = liqRouter
            .addLiquidity(
                address(amt),
                address(btcb),
                amountAmt,
                amountBtcb,
                (amountAmt * (98)) / 100,
                (amountBtcb * (98)) / 100,
                address(this),
                block.timestamp + 60
            );
        liqToken.mint(msg.sender, amountLiquidityCreated);
        bool amtTransfer2 = amt.transfer(
            msg.sender,
            amountAmt - amountAmtToLiq
        );
        bool btcbTransfer2 = btcb.transfer(
            msg.sender,
            amountBtcb - amountBtcbToLiq
        );

        require(
            amtTransfer1 && amtTransfer2 && btcbTransfer1 && btcbTransfer2,
            "Transfer failed"
        );

        emit liqAdded(amountAmtToLiq, amountBtcbToLiq, msg.sender);
    }

    /// @notice Allows any user to remove liquidity from the liquidity pool.
    /// @param amount The amount of liquidity to be removed.
    function removeLiquidity(uint256 amount) public {
        require(liqToken.balanceOf(msg.sender) >= amount, "Not enough liqAMT");

        uint256 constant milisecsToValidate = 60;
        uint256 amountAmtFromLiq;
        uint256 amountBtcbFromLiq;

        externalLiqToken.approve(addrRouter, amount);

        (amountAmtFromLiq, amountBtcbFromLiq) = liqRouter.removeLiquidity(
            address(amt),
            address(btcb),
            amount,
            0,
            0,
            address(this),
            block.timestamp + milisecsToValidate
        );
        liqToken.burnFrom(msg.sender, amount);
        bool amtTransfer = amt.transfer(msg.sender, amountAmtFromLiq);
        bool btcbTransfer = btcb.transfer(msg.sender, amountBtcbFromLiq);

        require(amtTransfer && btcbTransfer, "Transfer failed");

        emit liqRemoved(amountAmtFromLiq, amountBtcbFromLiq, msg.sender);
    }

    /// @notice Allows the contract owner to mint AMT.
    /// @param account The address to receive the minted AMT.
    /// @param amount The amount of AMT to be minted.
    function mintMaster(address account, uint256 amount) public onlyOwner {
        require(account != address(0),"Can not mint to zero address");
        amt.mint(account, amount);
        emit masterHasMinted(account, amount);
    }
}
