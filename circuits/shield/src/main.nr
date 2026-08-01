// VIONA Shield -- deposit (shield) circuit.
//
// Proves knowledge of a note preimage: the depositor knows (owner, token,
// value, blinding) such that poseidon2(owner, token, value, blinding) == commitment.
//
// Public inputs (on-chain calldata):
//   commitment -- note commitment being deposited
//   token      -- token field element (0 = ETH)
//   value      -- deposit amount in base units
//
// Private inputs (stay in prover):
//   owner    -- masterPubKey of the depositor
//   blinding -- random blinding scalar

// ---- hash helpers -----------------------------------------------------------

// hash4(a, b, c, d) = Poseidon2-sponge(4 inputs, rate=3, two permutations)
// IV = 4 << 64 = 73786976294838206464
fn hash4(a: Field, b: Field, c: Field, d: Field) -> Field {
    let iv: Field = 73786976294838206464;
    // First absorb: [a, b, c] into initial state [0,0,0,IV]
    let s1 = std::hash::poseidon2_permutation([a, b, c, iv], 4);
    // Second absorb: [d, 0, 0] added to squeezed state
    std::hash::poseidon2_permutation([s1[0] + d, s1[1], s1[2], s1[3]], 4)[0]
}

// note_commitment matches VIONA field.ts poseidon([owner, token, value, blinding])
fn note_commitment(owner: Field, token: Field, value: Field, blinding: Field) -> Field {
    hash4(owner, token, value, blinding)
}

// ---- circuit ----------------------------------------------------------------

fn main(
    // Private
    owner:   Field,
    blinding: Field,

    // Public
    commitment: pub Field,
    token:      pub Field,
    value:      pub Field,
) {
    let c = note_commitment(owner, token, value, blinding);
    assert(c == commitment, "commitment mismatch: invalid note preimage");
}
