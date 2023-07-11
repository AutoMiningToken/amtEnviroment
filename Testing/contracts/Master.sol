// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

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

/*
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
        masterContract = Master(masterContract_);
        btcb = btcb_;
        liqToken = liqToken_;
    }

    function charge(uint256 snapId) public {
        masterContract.liqCharge(snapId);
        btcb.transfer(beneficiary(), btcb.balanceOf(address(this)));
    }

    function release() public virtual override {
        require(
            block.timestamp >= releaseTime(),
            "TokenTimelock: current time is before release time"
        );

        uint256 amount = token().balanceOf(address(this));
        require(amount > 0, "TokenTimelock: no tokens to release");

        token().transfer(address(masterContract), amount);
        liqToken.transfer(beneficiary(), amount);
    }
}
*/
contract Master is Ownable {
    address public addrLiqLocker;

    bool liqLocked = false;

    Amt amt;
    IERC20 btcb;
    LiquidityAmt liqToken;
    IERC20 externalLiqToken;
    address addrRouter = 0x10ED43C718714eb63d5aA57B78B54704E256024E;
    IUniswapV2Router02 liqRouter = IUniswapV2Router02(addrRouter);
    IUniswapV2Factory liqFactory;
    address public vault;
    address public liqPool;
    address public payerWallet; // wallet which makes payments

    address constant addrBtcb = 0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c;

    mapping(uint256 => uint256) public pays; // snapId -> corresponding amount payed on that snapshot, registry of the amount of btcb payed on specific snapshot
    mapping(uint256 => uint256) public liqPays; // snapId -> corresponding amount payd on that snapshot to liq providers
    mapping(address => mapping(uint256 => bool)) public alreadyCharged; // Registry of already charged by address for normal pays
    mapping(address => mapping(uint256 => bool)) public liqAlreadyCharged; //Registry of already charged by address for liquidity providers

    event payerWalletSet(address newPayerWallet);
    event rentPaid(uint256 amount, uint256 vaultPart);
    event approveExtended(uint256 amountApproved);
    event liqAdded(uint256 amountAmt, uint256 amountBtcb, address from);
    event liqLockingAdded(uint256 amountAmt, uint256 amountBtcb, address from);
    event liqRemoved(uint256 amountAmt, uint256 amountBtcb, address from);
    event masterHasMinted(address addr, uint256 amount);
    event charged(uint snapId, address user, uint256 amount);

    uint256 amountForApproval = 99999999999999999999 * (10 ** 18);

    constructor(
        address _amt,
        address _btcb, //Testing
        address _vault,
        address _liqToken,
        address _payerWallet,
        address _liqRouter
    ) {
        amt = Amt(_amt);
        btcb = IERC20(_btcb);
        liqToken = LiquidityAmt(_liqToken);

        //Testing
        liqRouter = IUniswapV2Router02(_liqRouter);
        liqPool = _liqRouter;
        externalLiqToken = IERC20(_liqRouter);
        addrRouter = _liqRouter;

        //liqFactory = IUniswapV2Factory(liqRouter.factory());
        //externalLiqToken = IERC20(liqFactory.createPair(_amt, addrBtcb));
        vault = _vault;
        //liqPool = address(externalLiqToken);
        btcb.approve(addrRouter, amountForApproval);
        amt.approve(addrRouter, amountForApproval);
        payerWallet = _payerWallet;
    }

    // Extended approve function
    function extendApprove(uint256 amount) public onlyOwner {
        amt.approve(addrRouter, amount);
        btcb.approve(addrRouter, amount);

        emit approveExtended(amount);
    }

    // Change payer wallet
    function setPayerWallet(address newPayerWallet) public onlyOwner {
        payerWallet = newPayerWallet;

        emit payerWalletSet(newPayerWallet);
    }

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

    //Charge function for AMT holders
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

    /*
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
                (amountAmt * (100 - 2)) / 100,
                (amountBtcb * (100 - 2)) / 100,
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
*/
    //Master add liquidity provider function
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

    //Master remove liquidity provider function
    function removeLiquidity(uint256 amount) public {
        require(liqToken.balanceOf(msg.sender) >= amount, "Not enough liqAMT");

        uint256 milisecsToValidate = 60;
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

    // Minting function for AMT
    function mintMaster(address account, uint256 amount) public onlyOwner {
        amt.mint(account, amount);
        emit masterHasMinted(account, amount);
    }
}
