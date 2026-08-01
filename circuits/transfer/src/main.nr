// VIONA Shield -- private transfer / unshield (spend) circuit.
//
// Proves:
//  1. Two input notes with valid Merkle membership proofs.
//  2. Correct nullifier derivation (prevents double-spend).
//  3. Two output commitments are well-formed.
//  4. Value conservation: sum(inputs) == sum(outputs) + public_value + public_fee.
//
// Public inputs (verified on-chain):
//   membership_root    -- Merkle root the input notes are included in
//   nullifier0/1       -- spend tokens, stored on-chain to prevent replay
//   out_commitment0/1  -- new UTXOs inserted into the tree
//   token              -- asset (0 = ETH; ERC-20 address as field element)
//   public_value       -- amount sent to public recipient (unshield); 0 for private
//   public_fee         -- relayer fee; 0 if self-relayed
//   public_recipient   -- recipient address as Field; 0 if none
//   relayer            -- relayer address as Field; 0 if none

// ---- hash helpers (must match TypeScript field.ts) --------------------------

fn hash2(a: Field, b: Field) -> Field {
    let iv: Field = 36893488147419103232; // 2 << 64
    std::hash::poseidon2_permutation([a, b, 0, iv], 4)[0]
}

fn hash4(a: Field, b: Field, c: Field, d: Field) -> Field {
    let iv: Field = 73786976294838206464; // 4 << 64
    let s1 = std::hash::poseidon2_permutation([a, b, c, iv], 4);
    std::hash::poseidon2_permutation([s1[0] + d, s1[1], s1[2], s1[3]], 4)[0]
}

// note_commitment = poseidon2Hash([owner, token, value, blinding])
fn note_commitment(owner: Field, token: Field, value: Field, blinding: Field) -> Field {
    hash4(owner, token, value, blinding)
}

// nullifier = poseidon2Hash([sk, commitment]) matching keys.ts deriveNullifier()
fn derive_nullifier(sk: Field, c: Field) -> Field {
    hash2(sk, c)
}

// Merkle parent = poseidon2Hash([left, right]) matching tree.ts poseidon()
fn hash_pair(left: Field, right: Field) -> Field {
    hash2(left, right)
}

// Recompute Merkle root from leaf + sibling path.
// path_indices[i] = true  -> leaf is right child at level i
// path_indices[i] = false -> leaf is left child at level i
fn merkle_root(
    leaf:          Field,
    path_elements: [Field; 20],
    path_indices:  [bool; 20],
) -> Field {
    let mut cur = leaf;
    for i in 0..20 {
        let sib = path_elements[i];
        if path_indices[i] {
            cur = hash_pair(sib, cur);
        } else {
            cur = hash_pair(cur, sib);
        }
    }
    cur
}

// ---- circuit ----------------------------------------------------------------

fn main(
    // Private: input note 0
    in0_owner:    Field,
    in0_token:    Field,
    in0_value:    Field,
    in0_blinding: Field,
    in0_sk:       Field,
    in0_path:     [Field; 20],
    in0_idx:      [bool; 20],

    // Private: input note 1 (may be a zero-value padding note)
    in1_owner:    Field,
    in1_token:    Field,
    in1_value:    Field,
    in1_blinding: Field,
    in1_sk:       Field,
    in1_path:     [Field; 20],
    in1_idx:      [bool; 20],

    // Private: output note 0
    out0_owner:    Field,
    out0_token:    Field,
    out0_value:    Field,
    out0_blinding: Field,

    // Private: output note 1
    out1_owner:    Field,
    out1_token:    Field,
    out1_value:    Field,
    out1_blinding: Field,

    // Public
    membership_root:  pub Field,
    nullifier0:       pub Field,
    nullifier1:       pub Field,
    out_commitment0:  pub Field,
    out_commitment1:  pub Field,
    token:            pub Field,
    public_value:     pub Field,
    public_fee:       pub Field,
    public_recipient: pub Field,
    relayer:          pub Field,
) {
    // --- input note 0 -------------------------------------------------------
    let c0   = note_commitment(in0_owner, in0_token, in0_value, in0_blinding);
    let nul0 = derive_nullifier(in0_sk, c0);
    assert(nul0 == nullifier0, "nullifier0 mismatch");
    let root0 = merkle_root(c0, in0_path, in0_idx);
    assert(root0 == membership_root, "input0 Merkle proof invalid");
    assert(in0_token == token, "input0 token mismatch");

    // --- input note 1 -------------------------------------------------------
    // For single-input spends the second note is a zero-value dummy.
    // Nullifier is always checked. Merkle proof + token are gated on value != 0.
    let c1   = note_commitment(in1_owner, in1_token, in1_value, in1_blinding);
    let nul1 = derive_nullifier(in1_sk, c1);
    assert(nul1 == nullifier1, "nullifier1 mismatch");
    if in1_value != 0 {
        let root1 = merkle_root(c1, in1_path, in1_idx);
        assert(root1 == membership_root, "input1 Merkle proof invalid");
        assert(in1_token == token, "input1 token mismatch");
    }

    // --- output commitments -------------------------------------------------
    let oc0 = note_commitment(out0_owner, out0_token, out0_value, out0_blinding);
    assert(oc0 == out_commitment0, "out_commitment0 mismatch");
    if out0_value != 0 {
        assert(out0_token == token, "output0 token mismatch");
    }

    let oc1 = note_commitment(out1_owner, out1_token, out1_value, out1_blinding);
    assert(oc1 == out_commitment1, "out_commitment1 mismatch");
    if out1_value != 0 {
        assert(out1_token == token, "output1 token mismatch");
    }

    // --- value conservation -------------------------------------------------
    let total_in  = in0_value + in1_value;
    let total_out = out0_value + out1_value + public_value + public_fee;
    assert(total_in == total_out, "value conservation violated");

    // silence unused public inputs (checked on-chain)
    let _ = public_recipient;
    let _ = relayer;
}

// ---- tests ------------------------------------------------------------------

// Verifies that a single real input + zero-value dummy input works:
// the Merkle proof for the dummy is intentionally all-zeros (invalid) but
// should be skipped because in1_value == 0.
#[test]
fn test_single_input_unshield_dummy_skips_merkle() {
    let sk:       Field = 1234567890;
    let owner:    Field = 111;
    let token:    Field = 222;
    let value:    Field = 1000;
    let blinding: Field = 999;

    // Real note: input 0
    let c0   = note_commitment(owner, token, value, blinding);
    let nul0 = derive_nullifier(sk, c0);

    // Merkle root for a tree containing only c0 at index 0, all siblings = 0
    let zero_path: [Field; 20] = [0; 20];
    let zero_idx:  [bool;  20] = [false; 20];
    let root = merkle_root(c0, zero_path, zero_idx);

    // Dummy note: input 1 (zero value, random blinding, INVALID path = all zeros)
    let dummy_blinding: Field = 42;
    let c1   = note_commitment(0, 0, 0, dummy_blinding);
    let nul1 = derive_nullifier(sk, c1);

    // Outputs: no change (full amount unshielded), one dummy output
    let out0_blinding: Field = 555;
    let oc0 = note_commitment(owner, token, 0, out0_blinding); // change = 0

    let out1_blinding: Field = 666;
    let oc1 = note_commitment(0, 0, 0, out1_blinding);

    // value conservation: 1000 + 0 == 0 + 0 + 1000 + 0
    main(
        owner, token, value, blinding, sk, zero_path, zero_idx,   // input 0
        0,     0,     0,     dummy_blinding, sk,                   // input 1 (dummy)
        [0; 20], [false; 20],
        owner, token, 0, out0_blinding,                            // output 0
        0,     0,     0, out1_blinding,                            // output 1
        root,                                                       // membership_root
        nul0,                                                       // nullifier0
        nul1,                                                       // nullifier1
        oc0,                                                        // out_commitment0
        oc1,                                                        // out_commitment1
        token,                                                      // token
        1000,                                                       // public_value
        0,                                                          // public_fee
        owner,                                                      // public_recipient
        0,                                                          // relayer
    );
}
