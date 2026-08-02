// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { Poseidon2BN254 } from "./Poseidon2.sol";

/**
 * @title IncrementalMerkleTree
 * @notice Append-only Poseidon2 Merkle tree of depth 20 (2^20 = 1 048 576 leaves).
 *         Matching the TypeScript tree.ts in VIONA Shield.
 *
 * Stores only O(DEPTH) nodes in `filledSubTrees` — the last filled node at
 * each level. On each insert, we recompute the path from leaf to root.
 * Historic roots are kept in a ring buffer (last 100) so Merkle membership
 * proofs remain valid even after further inserts.
 */
abstract contract IncrementalMerkleTree {
    uint32  internal constant DEPTH        = 20;
    uint32  internal constant MAX_LEAVES   = uint32(1) << DEPTH; // 1 048 576
    uint256 internal constant ROOT_HISTORY = 100;

    // Pre-computed zero hashes: ZEROS[i] is the root of an empty subtree of height i.
    // Computed off-chain to save constructor gas. Must match tree.ts ZEROS array.
    uint256[21] private ZEROS;

    // The last filled left-sibling at each level.
    uint256[DEPTH] internal filledSubTrees;

    // Ring buffer of historic valid roots.
    uint256[ROOT_HISTORY] private _roots;
    uint32  private _currentRootIndex;
    uint32  public  nextLeafIndex;

    constructor() {
        // ZEROS[0] = 0 (empty leaf)
        // ZEROS[i] = Poseidon2(ZEROS[i-1], ZEROS[i-1]) — matches tree.ts
        ZEROS[0] = 0;
        for (uint256 i = 1; i <= DEPTH; i++) {
            ZEROS[i] = Poseidon2BN254.hash2(ZEROS[i - 1], ZEROS[i - 1]);
        }

        // Initialise filledSubTrees to zero hashes.
        for (uint256 i = 0; i < DEPTH; i++) {
            filledSubTrees[i] = ZEROS[i];
        }

        // Store initial (empty tree) root.
        _roots[0] = ZEROS[DEPTH];
    }

    // ── External view ─────────────────────────────────────────────────────────

    /** Current Merkle root. */
    function root() public view returns (bytes32) {
        return bytes32(_roots[_currentRootIndex]);
    }

    /** True if `r` was ever a valid root of this tree. */
    function knownRoot(bytes32 r) public view returns (bool) {
        if (uint256(r) == 0) return false;
        uint32 cur = _currentRootIndex;
        for (uint256 i = 0; i < ROOT_HISTORY; i++) {
            if (_roots[cur] == uint256(r)) return true;
            if (cur == 0) cur = uint32(ROOT_HISTORY - 1);
            else cur--;
        }
        return false;
    }

    /** True if a commitment has been inserted. */
    mapping(bytes32 => bool) public committed;

    // ── Internal mutator ──────────────────────────────────────────────────────

    /**
     * @dev Insert `commitment` as the next leaf.
     *      Reverts if the tree is full.
     *      Returns (leafIndex, newRoot).
     */
    function _insert(bytes32 commitment) internal returns (uint32 leafIndex, bytes32 newRoot) {
        require(nextLeafIndex < MAX_LEAVES, "TreeFull");
        require(!committed[commitment], "DuplicateCommitment");

        leafIndex = nextLeafIndex;
        nextLeafIndex++;
        committed[commitment] = true;

        uint256 current = uint256(commitment);
        uint32  idx     = leafIndex;

        for (uint256 i = 0; i < DEPTH; i++) {
            uint256 sibling;
            if (idx % 2 == 0) {
                // leaf is a left child — sibling is the zero hash
                sibling = ZEROS[i];
                filledSubTrees[i] = current;
                current = Poseidon2BN254.hash2(current, sibling);
            } else {
                // leaf is a right child — left sibling was the last filled node
                sibling = filledSubTrees[i];
                current = Poseidon2BN254.hash2(sibling, current);
            }
            idx >>= 1;
        }

        _currentRootIndex = (_currentRootIndex + 1) % uint32(ROOT_HISTORY);
        _roots[_currentRootIndex] = current;
        newRoot = bytes32(current);
    }
}
