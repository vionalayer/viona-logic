// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { IVerifier } from "./IVerifier.sol";

/**
 * @title StubVerifier
 * @notice Development-only verifier that always returns true.
 *
 * ⚠️  RETIRED 2026-07-31 — ShieldedPool now points to HonkVerifier (bb 0.84.0
 * UltraHonk). This contract is kept for historical reference only.
 *
 * Deployed address (Robinhood Chain, chainId 4663):
 *   0x82291667D9955aDA131ebd345eF740367376770D
 *
 * The real verifier is at:
 *   0xAEa82dbA04e11F7455DF1D19344AD49026f69a83
 *
 * Do NOT redeploy this contract as the active verifier.
 */
contract StubVerifier is IVerifier {
    function verify(bytes calldata, bytes32[] calldata) external pure override returns (bool) {
        return true;
    }
}
