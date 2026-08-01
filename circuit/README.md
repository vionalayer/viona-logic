# VIONA Shield — ZK Circuits

UltraHonk ZK circuits for VIONA Shield, written in Noir 1.0.0-beta.6.

## Circuits

### `shield/` — Deposit proof
Proves knowledge of a note preimage:
```
poseidon2(owner, token, value, blinding) == commitment
```
Public inputs: `commitment`, `token`, `value`
Private inputs: `owner`, `blinding`

### `transfer/` — Spend proof (private transfer + unshield)
Proves:
1. Two input notes are in the Merkle tree (membership proofs)
2. Nullifiers are correctly derived
3. Output commitments are well-formed
4. Value is conserved: in0 + in1 == out0 + out1 + public_value + public_fee

Public inputs: `membership_root`, `nullifier0/1`, `out_commitment0/1`,
`token`, `public_value`, `public_fee`, `public_recipient`, `relayer`

## Hash functions (must match TypeScript lib)

| Operation | Formula | IV |
|-----------|---------|-----|
| Merkle pair | `hash2(left, right)` | `2<<64` |
| Note commitment | `hash4(owner, token, value, blinding)` | `4<<64` (sponge, 2 permutations) |
| Nullifier | `hash2(sk, commitment)` | `2<<64` |

All use `std::hash::poseidon2_permutation` (Noir stdlib BN254 Poseidon2).
Verified to match `@zkpassport/poseidon2` v0.6.2 JS library.

## Compile

```bash
export PATH="$HOME/.nargo/bin:$PATH"   # nargo 1.0.0-beta.6

cd circuits/shield
nargo compile
# output: target/viona_shield.json (ACIR bytecode)

cd circuits/transfer
nargo compile
# output: target/viona_transfer.json (ACIR bytecode)
```

## Generate ZK keys + Solidity verifier

After installing `bb` (Barretenberg) matching nargo 1.0.0-beta.6:

```bash
cd circuits/transfer

# Write proving and verification keys
bb write_vk -b target/viona_transfer.json -o target/
# Creates: target/vk

# Generate Solidity UltraHonk verifier
bb contract -k target/vk -o ../../contracts/src/
# Creates: contracts/src/HonkVerifier.sol (or similar)
```

## Circuit sizes (estimate)

| Circuit | Gates (approx) | Proof time (browser) |
|---------|---------------|----------------------|
| shield | ~1 000 | ~5–10s |
| transfer | ~50 000 | ~30–60s |

Gate count dominated by 20 Poseidon2 Merkle path hashes per input note
(2 inputs × 20 levels × ~300 gates/hash ≈ 12 000 gates from Merkle alone).
