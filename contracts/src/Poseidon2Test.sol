// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { Poseidon2BN254 } from "./Poseidon2.sol";

/// @dev Test helper — exposes Poseidon2BN254 library for Hardhat tests.
contract Poseidon2Test {
    function hash2(uint256 a, uint256 b) external pure returns (uint256) {
        return Poseidon2BN254.hash2(a, b);
    }

    function hash4(uint256 a, uint256 b, uint256 c, uint256 d) external pure returns (uint256) {
        return Poseidon2BN254.hash4(a, b, c, d);
    }
}
