/**
 * Generate a valid UltraHonk proof for the VIONA transfer circuit.
 * Uses @noir-lang/noir_js@1.0.0-beta.6 + @aztec/bb.js@0.82.0 (keccak mode).
 * The proof is accepted by the bb 0.84.0 HonkVerifier on-chain.
 */
"use strict";

const fs   = require("fs");
const path = require("path");

// Resolve pnpm package paths
const PNPM  = "/home/runner/workspace/node_modules/.pnpm";
const P2    = `${PNPM}/@zkpassport+poseidon2@0.6.2/node_modules/@zkpassport/poseidon2/dist/cjs/index.cjs`;
const NRJS  = `${PNPM}/@noir-lang+noir_js@1.0.0-beta.6/node_modules/@noir-lang/noir_js/lib/index.cjs`;
const BBJS  = `${PNPM}/@aztec+bb.js@0.82.0/node_modules/@aztec/bb.js/dest/node-cjs/index.js`;

const { poseidon2Hash } = require(P2);
const { Noir }           = require(NRJS);
const { UltraHonkBackend } = require(BBJS);

const DEPTH = 20;

function toHex(n) {
  return "0x" + n.toString(16).padStart(64, "0");
}

async function main() {
  console.log("Loading circuit…");
  const circuit = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "../../circuits/transfer/target/viona_transfer.json"),
      "utf8"
    ).toString()
  );

  // ── Compute witness values ────────────────────────────────────────────────
  // Input note 0
  const owner = 1n, token = 1n, value = 100n, blinding = 2n, sk = 3n;
  const c0   = poseidon2Hash([owner, token, value, blinding]);   // hash4
  const nul0 = poseidon2Hash([sk, c0]);                          // hash2

  // Input note 1 — zero-value padding note
  const in1_owner = 0n, in1_token = 0n, in1_value = 0n, in1_blinding = 0n, in1_sk = 0n;
  const c1   = poseidon2Hash([in1_owner, in1_token, in1_value, in1_blinding]);
  const nul1 = poseidon2Hash([in1_sk, c1]);

  // ZEROS for the empty Merkle tree (depth 20)
  const zeros = [0n];
  for (let i = 1; i <= DEPTH; i++) {
    zeros.push(poseidon2Hash([zeros[i - 1], zeros[i - 1]]));
  }

  // Both c0 (idx=0) and c1 (idx=1) are in a two-leaf tree.
  // Level-0 node = hash2(c0, c1); then pair with zeros upward.
  const path0 = [c1, ...zeros.slice(1, DEPTH)];
  const idx0  = new Array(DEPTH).fill(false); // c0 is always left child

  const path1 = [c0, ...zeros.slice(1, DEPTH)];
  const idx1  = [true, ...new Array(DEPTH - 1).fill(false)]; // c1 is right at level 0

  // Recompute root from c0's perspective to confirm correctness
  let root = c0;
  for (let i = 0; i < DEPTH; i++) {
    if (idx0[i]) {
      root = poseidon2Hash([path0[i], root]);
    } else {
      root = poseidon2Hash([root, path0[i]]);
    }
  }
  const membershipRoot = root;
  console.log("Membership root:", toHex(membershipRoot));

  // Output note 0 — same value as in0 (100), different blinding
  const out0_owner = owner, out0_token = token, out0_value = value, out0_blinding = 4n;
  // Output note 1 — zero padding, blinding=5 to avoid collision with in1's commitment
  // (in1 uses blinding=0 → hash4([0,0,0,0]); using blinding=5 here keeps them distinct)
  const out1_owner = 0n, out1_token = 0n, out1_value = 0n, out1_blinding = 5n;

  const oc0 = poseidon2Hash([out0_owner, out0_token, out0_value, out0_blinding]);
  const oc1 = poseidon2Hash([out1_owner, out1_token, out1_value, out1_blinding]);

  const public_value = 0n, public_fee = 0n, public_recipient = 0n, relayer = 0n;

  // ── Build circuit inputs ──────────────────────────────────────────────────
  const inputs = {
    in0_owner:    toHex(owner),    in0_token:    toHex(token),
    in0_value:    toHex(value),    in0_blinding: toHex(blinding),
    in0_sk:       toHex(sk),
    in0_path:     path0.map(toHex), in0_idx: idx0,

    in1_owner:    toHex(in1_owner), in1_token:    toHex(in1_token),
    in1_value:    toHex(in1_value), in1_blinding: toHex(in1_blinding),
    in1_sk:       toHex(in1_sk),
    in1_path:     path1.map(toHex), in1_idx: idx1,

    out0_owner:   toHex(out0_owner), out0_token:   toHex(out0_token),
    out0_value:   toHex(out0_value), out0_blinding: toHex(out0_blinding),
    out1_owner:   toHex(out1_owner), out1_token:   toHex(out1_token),
    out1_value:   toHex(out1_value), out1_blinding: toHex(out1_blinding),

    membership_root:  toHex(membershipRoot),
    nullifier0:       toHex(nul0),
    nullifier1:       toHex(nul1),
    out_commitment0:  toHex(oc0),
    out_commitment1:  toHex(oc1),
    token:            toHex(token),
    public_value:     toHex(public_value),
    public_fee:       toHex(public_fee),
    public_recipient: toHex(public_recipient),
    relayer:          toHex(relayer),
  };

  // ── Execute circuit → witness ─────────────────────────────────────────────
  console.log("Executing circuit (noir.execute)…");
  const noir = new Noir(circuit);
  const { witness } = await noir.execute(inputs);
  console.log("Witness generated, length:", witness.length);

  // ── Generate proof ────────────────────────────────────────────────────────
  console.log("Generating UltraHonk proof (keccak mode, may take 30–120 s)…");
  const backend = new UltraHonkBackend(circuit.bytecode, { threads: 1 });
  const proofData = await backend.generateProof(witness, { keccak: true });
  console.log("Proof generated! Byte length:", proofData.proof.length);

  // ── Verify locally ────────────────────────────────────────────────────────
  console.log("Verifying locally…");
  const valid = await backend.verifyProof(proofData, { keccak: true });
  console.log("Local verification:", valid ? "PASS ✅" : "FAIL ❌");
  if (!valid) throw new Error("Local proof verification failed");

  // ── Save fixture ──────────────────────────────────────────────────────────
  const proofHex = "0x" + Buffer.from(proofData.proof).toString("hex");
  const pubInputs = proofData.publicInputs ?? [];

  const fixture = {
    proof: proofHex,
    publicInputs: pubInputs,
    // Parsed public inputs in circuit order for convenience
    membership_root:  toHex(membershipRoot),
    nullifier0:       toHex(nul0),
    nullifier1:       toHex(nul1),
    out_commitment0:  toHex(oc0),
    out_commitment1:  toHex(oc1),
    token:            toHex(token),
    public_value:     toHex(public_value),
    public_fee:       toHex(public_fee),
    public_recipient: toHex(public_recipient),
    relayer:          toHex(relayer),
  };
  const outPath = path.resolve(__dirname, "../test/fixtures/transfer_proof.hex.json");
  fs.writeFileSync(outPath, JSON.stringify(fixture, null, 2));
  console.log("\nFixture saved to:", outPath);
  console.log("Proof hex length:", proofHex.length);
  console.log("Public inputs count:", pubInputs.length);
}

main().catch((e) => { console.error(e); process.exit(1); });
