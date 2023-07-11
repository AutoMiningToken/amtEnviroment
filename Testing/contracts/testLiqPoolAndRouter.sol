// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestLiqPoolAndRouter is ERC20 {
    uint256 immutable base;
    constructor(uint256 _base) ERC20("TestExternalLiqToken", "TELT") {
        base = _base;
    }

    //Ratios never checked, do it right outside
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint amountADesired,
        uint amountBDesired,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline
    ) public returns (uint amountA, uint amountB, uint liquidity){
        ERC20 A = ERC20(tokenA);
        ERC20 B = ERC20(tokenB);

        uint256 balanceA = A.balanceOf(address(this));
        A.transferFrom(msg.sender, address(this), amountADesired);
        B.transferFrom(msg.sender,address(this),amountBDesired);
        
        if(balanceA == 0){
            _mint(msg.sender, base);
            return (amountADesired,amountBDesired,base);
        }
        else{
            uint256 toMintLiq = (totalSupply() * amountADesired )/ balanceA;
            _mint(msg.sender,  toMintLiq);
            return (amountADesired,amountBDesired,toMintLiq);
        }    
    }

    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint liquidity,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline
    ) external returns (uint amountA, uint amountB){
        ERC20 A = ERC20(tokenA);
        ERC20 B = ERC20(tokenB);
        uint256 ts = totalSupply();
        _burn(msg.sender,liquidity);
        uint256 AToRemove = (A.balanceOf(address(this)) * liquidity)/ts;
        uint256 BToRemove = (B.balanceOf(address(this)) * liquidity)/ts;
        A.transfer(msg.sender, AToRemove);
        B.transfer(msg.sender, BToRemove);
        return(AToRemove,BToRemove);
    }
}