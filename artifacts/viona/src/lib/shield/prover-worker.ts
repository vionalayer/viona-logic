// VIONA Shield prover — Barretenberg UltraHonk WASM worker.
//
// This file is imported by Vite as a Web Worker (`?worker` in prover.ts).
// It runs Barretenberg WASM in a single-threaded mode (no SharedArrayBuffer
// required) and generates UltraHonk proofs for the transfer circuit.
//
// Message protocol — main → worker:
//   { kind:"transfer", id, plan: SerialSpendPlan }
//   { kind:"shield",   id, note, commitment, at, sk }
//
// worker → main:
//   { id, ok:true,  proof:"0x…", publicInputs:["0x…",…], stub?:true }
//   { id, ok:false, error:"…" }
//   { kind:"progress", phase:"…", pct:0–100 }   (no id)

import { UltraHonkBackend } from "@aztec/bb.js";
import { Noir } from "@noir-lang/noir_js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function progress(phase: string, pct?: number) {
  self.postMessage({ kind: "progress", phase, pct });
}

function proofToHex(proof: Uint8Array): `0x${string}` {
  let hex = "0x";
  for (let i = 0; i < proof.length; i++) {
    hex += proof[i]!.toString(16).padStart(2, "0");
  }
  return hex as `0x${string}`;
}

function hexToBytes32(h: string): Uint8Array {
  const s = h.replace(/^0x/, "").padStart(64, "0");
  const b = new Uint8Array(32);
  for (let i = 0; i < 32; i++) b[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return b;
}

const ZERO_HEX = "0x" + "0".repeat(64);
const DEPTH = 20;

// ─── Circuit / backend loading ────────────────────────────────────────────────

type BackendBundle = { backend: UltraHonkBackend; noir: Noir };
let backendP: Promise<BackendBundle> | null = null;

function loadBackend(): Promise<BackendBundle> {
  if (backendP) return backendP;
  backendP = (async () => {
    progress("Loading circuit…", 2);

    // BASE_URL from Vite — includes trailing slash
    const base: string = (import.meta.env.BASE_URL as string | undefined) ?? "/";
    const url = `${base}viona_transfer.json`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Circuit fetch failed: ${resp.status} ${url}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const circuit = await resp.json() as any;

    progress("Initialising WASM…", 8);
    const backend = new UltraHonkBackend(circuit.bytecode as string, { threads: 1 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const noir = new Noir(circuit as any);

    progress("Prover ready", 12);
    return { backend, noir };
  })();
  return backendP;
}

// ─── Input builders ───────────────────────────────────────────────────────────

/** Serialised note (all bigints as "0x…" hex). */
type SNote = { owner: string; token: string; value: string; blinding: string };

/** Serialised spend input. */
type SInput = {
  note: SNote;
  leafIndex: number;
  pathElements: string[];
  pathIndices: (0 | 1)[];
  nullifier: string;
};

/** Serialised output note + commitment. */
type SOutput = { note: SNote; commitment: string };

/** Full transfer plan (serialised — all bigints as hex strings). */
type SSpendPlan = {
  inputs: SInput[];
  outputs: SOutput[];
  membershipRoot: string;
  publicToken: string;
  publicValue: string;
  publicFee: string;
  publicRecipient: string;
  relayer: string;
  skPerInput: string[];     // spending key per input (same order as inputs[])
  nullifiers: string[];     // nullifier per input
  outCommitments: string[]; // output commitment per output
};

function buildTransferInputs(plan: SSpendPlan): Record<string, unknown> {
  const zeroNote = (): Record<string, unknown> => ({
    owner: ZERO_HEX,
    token: ZERO_HEX,
    value: ZERO_HEX,
    blinding: ZERO_HEX,
    sk: ZERO_HEX,
    path: Array(DEPTH).fill(ZERO_HEX) as string[],
    idx: Array(DEPTH).fill(false) as boolean[],
    nullifier: ZERO_HEX,
  });

  const build = (inp: SInput | undefined, i: number) => {
    if (!inp) return zeroNote();
    return {
      owner:    inp.note.owner,
      token:    inp.note.token,
      value:    inp.note.value,
      blinding: inp.note.blinding,
      sk:       plan.skPerInput[i] ?? ZERO_HEX,
      path:     inp.pathElements,
      idx:      inp.pathIndices.map((b) => b === 1),
      nullifier: inp.nullifier,
    };
  };

  const zeroOut = (): Record<string, unknown> => ({
    owner: ZERO_HEX, token: ZERO_HEX, value: ZERO_HEX, blinding: ZERO_HEX,
  });
  const buildOut = (out: SOutput | undefined) => {
    if (!out) return zeroOut();
    return {
      owner: out.note.owner, token: out.note.token,
      value: out.note.value, blinding: out.note.blinding,
    };
  };

  const i0 = build(plan.inputs[0], 0);
  const i1 = build(plan.inputs[1], 1);
  const o0 = buildOut(plan.outputs[0]);
  const o1 = buildOut(plan.outputs[1]);

  return {
    in0_owner: i0.owner, in0_token: i0.token, in0_value: i0.value,
    in0_blinding: i0.blinding, in0_sk: i0.sk,
    in0_path: i0.path, in0_idx: i0.idx,
    in1_owner: i1.owner, in1_token: i1.token, in1_value: i1.value,
    in1_blinding: i1.blinding, in1_sk: i1.sk,
    in1_path: i1.path, in1_idx: i1.idx,
    out0_owner: o0.owner, out0_token: o0.token,
    out0_value: o0.value, out0_blinding: o0.blinding,
    out1_owner: o1.owner, out1_token: o1.token,
    out1_value: o1.value, out1_blinding: o1.blinding,
    membership_root:  plan.membershipRoot,
    nullifier0:       plan.nullifiers[0] ?? ZERO_HEX,
    nullifier1:       plan.nullifiers[1] ?? ZERO_HEX,
    out_commitment0:  plan.outCommitments[0] ?? ZERO_HEX,
    out_commitment1:  plan.outCommitments[1] ?? ZERO_HEX,
    token:            plan.publicToken,
    public_value:     plan.publicValue,
    public_fee:       plan.publicFee,
    public_recipient: plan.publicRecipient,
    relayer:          plan.relayer,
  };
}

// ─── Shield stub proof ────────────────────────────────────────────────────────
//
// The transfer circuit cannot prove a deposit (shield) operation directly because
// deposit inputs come from the public side, not from existing shielded notes. A
// dedicated shield circuit will be compiled in the next task. Until then we return
// compact stub bytes that the StubVerifier (always-true) on Robinhood Chain accepts.
//
// Stub format: 4-byte magic | 32-byte commitment | 32-byte newRoot = 68 bytes.

function shieldStubProof(commitment: string, newRoot: string): Uint8Array {
  const stub = new Uint8Array(68);
  stub[0] = 0xf1; stub[1] = 0x5a; stub[2] = 0xfe; stub[3] = 0x00; // VIONA stub magic
  stub.set(hexToBytes32(commitment), 4);
  stub.set(hexToBytes32(newRoot), 36);
  return stub;
}

// ─── Message handler ──────────────────────────────────────────────────────────

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data as Record<string, unknown>;
  const id  = msg.id as number;

  try {
    // ── Shield proof ──────────────────────────────────────────────────────────
    // Handled BEFORE loadBackend() — shield uses a compact stub proof and does
    // not need the transfer circuit WASM (saves 30+ MB download + init time).
    if (msg.kind === "shield") {
      const commitment = msg.commitment as string;
      const at = msg.at as {
        pathElements: string[];
        right: boolean[];
        oldRoot: string;
        newRoot: string;
        leafIndex: number;
      };

      progress("Generating shield proof…", 20);
      // Dedicated shield circuit pending — use stub accepted by StubVerifier.
      // This path will generate a real UltraHonk proof once the shield circuit
      // is compiled and the proving key is bundled.
      progress("Committing note to Merkle tree…", 60);
      const stub = shieldStubProof(commitment, at.newRoot);
      progress("Shield proof ready", 100);

      self.postMessage({
        id,
        ok: true,
        proof: proofToHex(stub),
        publicInputs: [commitment, at.newRoot],
        stub: true,
      });
      return;
    }

    // ── Transfer proof ────────────────────────────────────────────────────────
    // Loads the transfer circuit WASM only when actually needed.
    if (msg.kind === "transfer") {
      const { backend, noir } = await loadBackend();
      const plan = msg.plan as SSpendPlan;

      progress("Building witness…", 20);
      const inputs = buildTransferInputs(plan);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { witness } = await noir.execute(inputs as any);

      progress("Running UltraHonk prover… (30–120 s)", 35);
      // keccak: true → Keccak256 Fiat-Shamir challenges required by the
      // Solidity UltraHonk verifier generated by bb.js for EVM verification.
      const proofData = await backend.generateProof(witness, { keccak: true });

      progress("Verifying proof locally…", 92);
      const valid = await backend.verifyProof(proofData, { keccak: true });
      if (!valid) {
        throw new Error("Proof failed local verification — please retry.");
      }

      progress("Proof complete", 100);
      self.postMessage({
        id,
        ok: true,
        proof: proofToHex(proofData.proof),
        publicInputs: (proofData.publicInputs ?? []) as string[],
      });
      return;
    }

    throw new Error(`Unknown message kind: ${String(msg.kind)}`);

  } catch (err: unknown) {
    self.postMessage({
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};

// Pre-warm the transfer circuit WASM when the worker starts.
// Shield proofs use a lightweight stub and don't need this — they return
// immediately. Transfer proofs take 30–120s so warming early helps.
loadBackend().catch(() => {
  // Will retry on first transfer proof request
});
