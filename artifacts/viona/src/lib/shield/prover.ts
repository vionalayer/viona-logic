// ZK proof worker wrapper for VIONA Shield.
//
// VIONA Shield uses UltraHonk proofs (Aztec Barretenberg + Noir circuits).
// The prover runs in a Web Worker to keep the UI responsive during the
// 30–120s proof generation.
//
// The worker is bundled by Vite (?worker) and loads the Barretenberg WASM
// at runtime. Private keys and note data never leave the browser.
import type { Note } from "./note.js";
import type { Append } from "./tree.js";
import type { ShieldedKeys } from "./keys.js";
import { fieldToHex } from "./field.js";

export type ShieldProof = {
  proof: `0x${string}`;
  publicInputs: readonly `0x${string}`[];
  stub?: boolean; // true while dedicated shield circuit is pending
};

export type SpendPlan = {
  inputs: Array<{
    note: Note;
    leafIndex: number;
    pathElements: bigint[];
    pathIndices: (0 | 1)[];
    nullifier: bigint;
  }>;
  outputs: Array<{ note: Note; commitment: bigint }>;
  membershipRoot: bigint;
  oldRoot: bigint;
  newRoot: bigint;
  publicToken: bigint;
  publicValue: bigint;
  publicFee: bigint;
  publicRecipient: `0x${string}`;
  relayer: `0x${string}`;
};

export type TransferProof = {
  proof: `0x${string}`;
  publicInputs: readonly `0x${string}`[];
};

/** Progress callback: phase label + optional 0–100 percentage. */
export type ProofProgressCallback = (phase: string, pct?: number) => void;

// ─── Worker management ────────────────────────────────────────────────────────

type PendingCall = {
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
  onProgress?: ProofProgressCallback;
};

let worker: Worker | null = null;
let workerFailed = false;
let idCounter = 0;
const pending = new Map<number, PendingCall>();

// Lazy-import the bundled worker (Vite bundles prover-worker.ts as a Worker)
async function getWorker(): Promise<Worker | null> {
  if (workerFailed) return null;
  if (worker) return worker;

  try {
    // Vite's ?worker syntax bundles the file and returns a Worker constructor.
    const { default: ProverWorker } = await import("./prover-worker.ts?worker");
    worker = new ProverWorker() as Worker;

    worker.onmessage = (e: MessageEvent) => {
      const data = e.data as Record<string, unknown>;

      // Progress events have no id — dispatch to the most recently pending call
      if (data.kind === "progress") {
        const phase = data.phase as string;
        const pct   = data.pct as number | undefined;
        // Broadcast to all pending calls (only one should be active at a time)
        for (const p of pending.values()) {
          p.onProgress?.(phase, pct);
        }
        return;
      }

      const id = data.id as number;
      const p  = pending.get(id);
      if (!p) return;
      pending.delete(id);

      if (data.ok) {
        p.resolve(data);
      } else {
        p.reject(new Error(data.error as string));
      }
    };

    worker.onerror = () => {
      workerFailed = true;
      for (const [, p] of pending) {
        p.reject(new Error("VIONA Shield prover failed to load. Check network/WASM support."));
      }
      pending.clear();
      worker?.terminate();
      worker = null;
    };

    return worker;
  } catch (err) {
    workerFailed = true;
    console.error("[shield/prover] Worker init failed:", err);
    return null;
  }
}

function postToWorker<T>(
  msg: Record<string, unknown>,
  onProgress?: ProofProgressCallback,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    getWorker().then((w) => {
      if (!w) {
        reject(new Error("VIONA Shield prover is not available in this browser."));
        return;
      }
      const id = idCounter++;
      pending.set(id, { resolve: resolve as (r: unknown) => void, reject, onProgress });
      w.postMessage({ ...msg, id });
    });
  });
}

// ─── Serialisation helpers ────────────────────────────────────────────────────

function serNote(n: Note) {
  return {
    owner:    fieldToHex(n.owner),
    token:    fieldToHex(n.token),
    value:    fieldToHex(n.value),
    blinding: fieldToHex(n.blinding),
  };
}

function serSpendPlan(plan: SpendPlan, keys: ShieldedKeys) {
  const skHex = fieldToHex(keys.sk);
  return {
    inputs: plan.inputs.map((inp) => ({
      note:         serNote(inp.note),
      leafIndex:    inp.leafIndex,
      pathElements: inp.pathElements.map(fieldToHex),
      pathIndices:  inp.pathIndices,
      nullifier:    fieldToHex(inp.nullifier),
    })),
    outputs: plan.outputs.map((out) => ({
      note:       serNote(out.note),
      commitment: fieldToHex(out.commitment),
    })),
    membershipRoot:  fieldToHex(plan.membershipRoot),
    publicToken:     fieldToHex(plan.publicToken),
    publicValue:     fieldToHex(plan.publicValue),
    publicFee:       fieldToHex(plan.publicFee),
    publicRecipient: fieldToHex(BigInt(plan.publicRecipient)),
    relayer:         fieldToHex(BigInt(plan.relayer)),
    // Each input is owned by the same wallet; pad to 2
    skPerInput:   [skHex, skHex],
    nullifiers:   plan.inputs.map((inp) => fieldToHex(inp.nullifier)),
    outCommitments: plan.outputs.map((out) => fieldToHex(out.commitment)),
  };
}

function serAppend(at: Append) {
  return {
    pathElements: at.pathElements.map(fieldToHex),
    right:        at.right,
    oldRoot:      fieldToHex(at.oldRoot),
    newRoot:      fieldToHex(at.newRoot),
    leafIndex:    at.leafIndex,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate a shield (deposit) proof.
 *
 * Uses a compact commitment stub until a dedicated shield circuit is compiled.
 * ~2–5s (stub) or 30–120s (real circuit, future).
 */
export function proveShield(
  note: Note,
  c: bigint,
  at: Append,
  keys: ShieldedKeys,
  onProgress?: ProofProgressCallback,
): Promise<ShieldProof> {
  return postToWorker<{
    proof: `0x${string}`;
    publicInputs: `0x${string}`[];
    stub?: boolean;
  }>(
    {
      kind:       "shield",
      note:       serNote(note),
      commitment: fieldToHex(c),
      at:         serAppend(at),
      sk:         fieldToHex(keys.sk),
    },
    onProgress,
  ).then((r) => ({
    proof:        r.proof,
    publicInputs: r.publicInputs,
    stub:         r.stub,
  }));
}

/**
 * Generate a transfer/trade/unshield proof.
 * ~30–120s on a modern machine.
 */
export function proveTransfer(
  plan: SpendPlan,
  keys: ShieldedKeys,
  onProgress?: ProofProgressCallback,
): Promise<TransferProof> {
  return postToWorker<{
    proof: `0x${string}`;
    publicInputs: `0x${string}`[];
  }>(
    { kind: "transfer", plan: serSpendPlan(plan, keys) },
    onProgress,
  ).then((r) => ({
    proof:        r.proof,
    publicInputs: r.publicInputs,
  }));
}

/** Terminate the worker to free memory. Call when the user navigates away. */
export function terminateWorker(): void {
  worker?.terminate();
  worker = null;
  workerFailed = false;
  pending.clear();
}

/** Pre-warm the worker and load the WASM backend proactively. */
export function warmProver(): void {
  getWorker().catch(() => {/* ignore — will retry on first use */});
}
