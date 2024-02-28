pragma solidity ^0.5.16;
import "@uniswap/lib/contracts/libraries/FixedPoint.sol";
import "./mockContracts/FixedPointOriginal.sol";

contract testFixedPoint {
    constructor()public{}

    struct uq112x112 {
        uint224 _x;
    }

    // range: [0, 2**144 - 1]
    // resolution: 1 / 2**112
    struct uq144x112 {
        uint256 _x;
    }

    uint8 public constant RESOLUTION = 112;
    uint256 public constant Q112 = 0x10000000000000000000000000000; // 2**112
    uint256 private constant Q224 = 0x100000000000000000000000000000000000000000000000000000000; // 2**224
    uint256 private constant LOWER_MASK = 0xffffffffffffffffffffffffffff; // decimal of UQ*x112 (lower 112 bits)

    function encodeOriginal(uint112 x) internal pure returns (FixedPointOriginal.uq112x112 memory) {
        return FixedPointOriginal.encode(x);
    }

    // encodes a uint144 as a UQ144x112
    function encode144Original(uint144 x) internal pure returns (FixedPointOriginal.uq144x112 memory) {
        return FixedPointOriginal.encode144(x);
    }

    // decode a UQ112x112 into a uint112 by truncating after the radix point
    function decodeOriginal(uq112x112 memory self) internal pure returns (uint112) {
        FixedPointOriginal.uq112x112 memory convertedStruct = FixedPointOriginal.uq112x112(self._x);
        return FixedPointOriginal.decode(convertedStruct);
    }

    // decode a UQ144x112 into a uint144 by truncating after the radix point
    function decode144Original(uq144x112 memory self) internal pure returns (uint144) {
        FixedPointOriginal.uq144x112 memory convertedStruct = FixedPointOriginal.uq144x112(self._x);
        return FixedPointOriginal.decode144(convertedStruct);
    }

    // multiply a UQ112x112 by a uint, returning a UQ144x112
    // reverts on overflow
    function mulOriginal(
        uq112x112 memory self,
        uint256 y
    ) internal pure returns (FixedPointOriginal.uq144x112 memory) {
        FixedPointOriginal.uq112x112 memory convertedStruct = FixedPointOriginal.uq112x112(self._x);
        return FixedPointOriginal.mul(convertedStruct, y);
    }

    // returns a UQ112x112 which represents the ratio of the numerator to the denominator
    // equivalent to encode(numerator).div(denominator)
    function fractionOriginal(
        uint112 numerator,
        uint112 denominator
    ) internal pure returns (FixedPointOriginal.uq112x112 memory) {
        return FixedPointOriginal.fraction(numerator, denominator);
    }

    // take the reciprocal of a UQ112x112
    // reverts on overflow
    // lossy
    function reciprocalOriginal(
        uq112x112 memory self
    ) internal pure returns (FixedPointOriginal.uq112x112 memory) {
         FixedPointOriginal.uq112x112 memory convertedStruct = FixedPointOriginal.uq112x112(self._x);

        return FixedPointOriginal.reciprocal(convertedStruct);
    }


    //MODIFIEDs

    
    function encode(uint112 x) internal pure returns (FixedPoint.uq112x112 memory) {
        return FixedPoint.encode(x);
    }

    // encodes a uint144 as a UQ144x112
    function encode144(uint144 x) internal pure returns (FixedPoint.uq144x112 memory) {
        return FixedPoint.encode144(x);
    }

    // decode a UQ112x112 into a uint112 by truncating after the radix point
    function decode(uq112x112 memory self) internal pure returns (uint112) {
        FixedPoint.uq112x112 memory convertedStruct = FixedPoint.uq112x112(self._x);

        return FixedPoint.decode(convertedStruct);
    }

    // decode a UQ144x112 into a uint144 by truncating after the radix point
    function decode144(uq144x112 memory self) internal pure returns (uint144) {
        FixedPoint.uq144x112 memory convertedStruct = FixedPoint.uq144x112(self._x);

        return FixedPoint.decode144(convertedStruct);
    }

    // multiply a UQ112x112 by a uint, returning a UQ144x112
    // reverts on overflow
    function mul(
        uq112x112 memory self,
        uint256 y
    ) internal pure returns (FixedPoint.uq144x112 memory) {
        FixedPoint.uq112x112 memory convertedStruct = FixedPoint.uq112x112(self._x);
        return FixedPoint.mul(convertedStruct,y);
    }

    // returns a UQ112x112 which represents the ratio of the numerator to the denominator
    // equivalent to encode(numerator).div(denominator)
    function fraction(
        uint112 numerator,
        uint112 denominator
    ) internal pure returns (FixedPoint.uq112x112 memory) {
        return FixedPoint.fraction(numerator,denominator);
    }

    // take the reciprocal of a UQ112x112
    // reverts on overflow
    // lossy
    function reciprocal(
        uq112x112 memory self
    ) internal pure returns (FixedPoint.uq112x112 memory) {
        FixedPoint.uq112x112 memory convertedStruct = FixedPoint.uq112x112(self._x);
        return FixedPoint.reciprocal(convertedStruct);
    }
}