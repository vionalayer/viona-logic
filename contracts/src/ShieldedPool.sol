// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { IncrementalMerkleTree } from "./MerkleTree.sol";
import { IVerifier }             from "./IVerifier.sol";

/**
 * @title ShieldedPool
 * @notice VIONA Shield — on-chain shielded liquidity pool.
 *
 * Architecture
 * ────────────
 * Deposits (shield):
 *   User calls shield() with a note commitment and a UltraHonk proof that
 *   they know the note preimage. The commitment is inserted into the append-only
 *   Poseidon2 Merkle tree. ETH is held in the contract; ERC-20 is transferred in.
 *
 * Spends (private transfer / unshield):
 *   User provides a spend() proof that:
 *     - Two input notes have valid Merkle membership proofs.
 *     - Nullifiers for those notes are computed correctly.
 *     - Two output commitments are well-formed.
 *     - Value is conserved.
 *   The contract checks nullifiers aren't spent, verifies the ZK proof,
 *   emits the new notes, and optionally transfers a public amount out.
 *
 * Verifiers
 * ─────────
 * Two independent verifier slots are used — one per operation:
 *   spendVerifier  — validates transfer/unshield proofs (10 public inputs).
 *                    Set to the bb-generated UltraHonk HonkVerifier on launch.
 *   shieldVerifier — validates deposit preimage proofs (3 public inputs).
 *                    Set to StubVerifier until the shield circuit is compiled.
 * Both slots are owner-upgradeable independently.
 *
 * Tokens
 * ──────
 * token = 0 → native ETH
 * token = uint256(address) → ERC-20 token
 */
contract ShieldedPool is IncrementalMerkleTree {
    // ── Types ─────────────────────────────────────────────────────────────────

    struct SpendStatement {
        bytes32   membershipRoot;
        bytes32[2] nullifiers;
        bytes32[2] commitments;
        bytes32   newRoot;       // unused: root computed on-chain during insertions
        uint256   token;
        uint256   value;
        uint256   fee;
        address   recipient;
        address   relayer;
    }

    // ── Storage ───────────────────────────────────────────────────────────────

    address public owner;
    /// @notice Verifier for spend() proofs (transfer circuit, 10 public inputs).
    IVerifier public spendVerifier;
    /// @notice Verifier for shield() proofs (deposit circuit, 3 public inputs).
    ///         Points to StubVerifier until the shield Noir circuit is compiled.
    IVerifier public shieldVerifier;

    mapping(bytes32 => bool) public nullifierSpent;

    // Minimum proof length sanity check (UltraHonk proofs are ~2 KB)
    uint256 public constant MIN_PROOF_BYTES = 64;
    // Max ciphertext length guard
    uint256 public constant MAX_CIPHER_BYTES = 1024;

    // ── Events ────────────────────────────────────────────────────────────────

    event NoteCommitted(uint32 leafIndex, bytes32 commitment, bytes ciphertext);
    event Nullified(bytes32 nullifier);
    event SpendVerifierUpdated(address indexed newVerifier);
    event ShieldVerifierUpdated(address indexed newVerifier);
    event OwnershipTransferred(address indexed prev, address indexed next);

    // ── Errors ────────────────────────────────────────────────────────────────

    error DuplicateCommitment();
    error TreeFull();
    error ZeroValue();
    error NotAField();
    error WrongDeposit();
    error InvalidProof();
    error TransferFailed();
    error UnknownRoot();
    error AlreadySpent();
    error RepeatedNullifier();
    error NoRecipient();
    error BadCipherLength();
    error ExceedsPooledValue();
    error NotOwner();
    error NoPendingSwap();
    error SwapNotReady();
    error ZeroAddress();

    // ── Modifiers ─────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor(address _spendVerifier, address _shieldVerifier) IncrementalMerkleTree() {
        if (_spendVerifier  == address(0)) revert ZeroAddress();
        if (_shieldVerifier == address(0)) revert ZeroAddress();
        owner          = msg.sender;
        spendVerifier  = IVerifier(_spendVerifier);
        shieldVerifier = IVerifier(_shieldVerifier);
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    /**
     * @notice Replace the spend (transfer) verifier — set to the bb UltraHonk
     *         HonkVerifier generated from the transfer circuit.
     */
    function setSpendVerifier(address _verifier) external onlyOwner {
        if (_verifier == address(0)) revert ZeroAddress();
        spendVerifier = IVerifier(_verifier);
        emit SpendVerifierUpdated(_verifier);
    }

    /**
     * @notice Replace the shield (deposit) verifier — set to the bb UltraHonk
     *         verifier generated from the shield circuit once it is compiled.
     *         Until then, StubVerifier is used.
     */
    function setShieldVerifier(address _verifier) external onlyOwner {
        if (_verifier == address(0)) revert ZeroAddress();
        shieldVerifier = IVerifier(_verifier);
        emit ShieldVerifierUpdated(_verifier);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ── Shield (deposit) ─────────────────────────────────────────────────────

    /**
     * @notice Deposit tokens into the shielded pool.
     *
     * @param token      0 for ETH; ERC-20 address cast to uint256 otherwise.
     * @param value      Amount to deposit (wei for ETH; token units for ERC-20).
     * @param commitment Note commitment — Poseidon2(owner, token, value, blinding).
     * @param newRoot    Ignored (root computed on-chain). Kept for ABI compatibility.
     * @param ciphertext AES-GCM encrypted note for the recipient.
     * @param proof      UltraHonk proof of commitment preimage knowledge.
     */
    function shield(
        uint256 token,
        uint256 value,
        bytes32 commitment,
        bytes32 newRoot,
        bytes calldata ciphertext,
        bytes calldata proof
    ) external payable {
        // Suppress unused parameter warning
        newRoot;

        if (value == 0) revert ZeroValue();
        if (uint256(commitment) >= 0x30644e72e131a029b85045b68181585d2833e84879b9709142e1f3571fbe826f)
            revert NotAField();
        if (ciphertext.length == 0 || ciphertext.length > MAX_CIPHER_BYTES)
            revert BadCipherLength();
        if (committed[commitment]) revert DuplicateCommitment();

        // Verify that token / value match the deposited amount.
        if (token == 0) {
            if (msg.value != value) revert WrongDeposit();
        } else {
            if (msg.value != 0) revert WrongDeposit();
            _erc20TransferFrom(address(uint160(token)), msg.sender, address(this), value);
        }

        // Verify the shield proof (preimage knowledge).
        _verifyShieldProof(proof, commitment, token, value);

        // Insert commitment into the tree.
        (uint32 leafIndex,) = _insert(commitment);

        emit NoteCommitted(leafIndex, commitment, ciphertext);
    }

    // ── Spend (private transfer / unshield) ──────────────────────────────────

    /**
     * @notice Spend up to two input notes, insert two output commitments,
     *         and optionally release a public amount to a recipient.
     *
     * @param s          The spend statement (public inputs to the ZK circuit).
     * @param ciphertexts Encrypted output notes for the recipients.
     * @param proof       UltraHonk proof of the spend statement.
     */
    function spend(
        SpendStatement calldata s,
        bytes[2] calldata ciphertexts,
        bytes calldata proof
    ) external {
        // ── Validate roots and nullifiers ────────────────────────────────────
        if (!knownRoot(s.membershipRoot)) revert UnknownRoot();
        if (nullifierSpent[s.nullifiers[0]]) revert AlreadySpent();
        if (nullifierSpent[s.nullifiers[1]]) revert AlreadySpent();
        if (s.nullifiers[0] == s.nullifiers[1]) revert RepeatedNullifier();

        // ── Validate ciphertexts ─────────────────────────────────────────────
        for (uint256 i = 0; i < 2; i++) {
            if (ciphertexts[i].length == 0 || ciphertexts[i].length > MAX_CIPHER_BYTES)
                revert BadCipherLength();
        }

        // ── Verify ZK proof ──────────────────────────────────────────────────
        _verifySpendProof(proof, s);

        // ── Mark nullifiers spent ────────────────────────────────────────────
        nullifierSpent[s.nullifiers[0]] = true;
        nullifierSpent[s.nullifiers[1]] = true;
        emit Nullified(s.nullifiers[0]);
        emit Nullified(s.nullifiers[1]);

        // ── Insert output commitments ────────────────────────────────────────
        for (uint256 i = 0; i < 2; i++) {
            if (uint256(s.commitments[i]) == 0) continue; // zero padding note
            (uint32 leafIdx,) = _insert(s.commitments[i]);
            emit NoteCommitted(leafIdx, s.commitments[i], ciphertexts[i]);
        }

        // ── Release public value ─────────────────────────────────────────────
        if (s.value > 0) {
            if (s.recipient == address(0)) revert NoRecipient();
            _transferOut(s.token, s.recipient, s.value);
        }

        // ── Pay relayer fee ──────────────────────────────────────────────────
        if (s.fee > 0 && s.relayer != address(0)) {
            _transferOut(s.token, s.relayer, s.fee);
        }
    }

    // ── Proof verification helpers ────────────────────────────────────────────

    function _verifyShieldProof(
        bytes calldata proof,
        bytes32 commitment,
        uint256 token,
        uint256 value
    ) internal view {
        if (proof.length < MIN_PROOF_BYTES) revert InvalidProof();

        // Public inputs to the shield circuit (order matches main.nr):
        //   commitment, token, value
        bytes32[] memory pub = new bytes32[](3);
        pub[0] = commitment;
        pub[1] = bytes32(token);
        pub[2] = bytes32(value);

        if (!shieldVerifier.verify(proof, pub)) revert InvalidProof();
    }

    function _verifySpendProof(
        bytes calldata proof,
        SpendStatement calldata s
    ) internal view {
        if (proof.length < MIN_PROOF_BYTES) revert InvalidProof();

        // Public inputs to the transfer circuit (order matches main.nr):
        //   membership_root, nullifier0, nullifier1,
        //   out_commitment0, out_commitment1,
        //   token, public_value, public_fee, public_recipient, relayer
        bytes32[] memory pub = new bytes32[](10);
        pub[0] = s.membershipRoot;
        pub[1] = s.nullifiers[0];
        pub[2] = s.nullifiers[1];
        pub[3] = s.commitments[0];
        pub[4] = s.commitments[1];
        pub[5] = bytes32(s.token);
        pub[6] = bytes32(s.value);
        pub[7] = bytes32(s.fee);
        pub[8] = bytes32(uint256(uint160(s.recipient)));
        pub[9] = bytes32(uint256(uint160(s.relayer)));

        if (!spendVerifier.verify(proof, pub)) revert InvalidProof();
    }

    // ── Transfer helpers ──────────────────────────────────────────────────────

    function _transferOut(uint256 token, address to, uint256 amount) internal {
        if (token == 0) {
            (bool ok,) = payable(to).call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            _erc20Transfer(address(uint160(token)), to, amount);
        }
    }

    function _erc20Transfer(address token, address to, uint256 amount) internal {
        (bool ok, bytes memory ret) = token.call(
            abi.encodeWithSignature("transfer(address,uint256)", to, amount)
        );
        if (!ok || (ret.length > 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }

    function _erc20TransferFrom(address token, address from, address to, uint256 amount) internal {
        (bool ok, bytes memory ret) = token.call(
            abi.encodeWithSignature("transferFrom(address,address,uint256)", from, to, amount)
        );
        if (!ok || (ret.length > 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }

    // ── ETH receive ───────────────────────────────────────────────────────────

    receive() external payable {}
}
