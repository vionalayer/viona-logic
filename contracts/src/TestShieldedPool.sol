// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { ShieldedPool } from "./ShieldedPool.sol";

/**
 * @title TestShieldedPool
 * @notice Test-only wrapper that exposes a privileged leaf insertion bypass.
 *         Never deploy to mainnet — no access control on insertLeafForTest().
 *
 * Used in HardHat tests to seed the Merkle tree with zero-value notes that
 * cannot be inserted via shield() (which requires value > 0) so spend()
 * integration tests can prove against a known tree state.
 */
contract TestShieldedPool is ShieldedPool {
    constructor(address _spendVerifier, address _shieldVerifier)
        ShieldedPool(_spendVerifier, _shieldVerifier) {}

    /// @dev Insert a commitment directly into the tree, bypassing all checks.
    function insertLeafForTest(bytes32 commitment) external {
        _insert(commitment);
    }
}
