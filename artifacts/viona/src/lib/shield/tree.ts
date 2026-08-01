// Depth-20 Poseidon2 Merkle tree for VIONA Shield.
// The on-chain contract stores only the root; clients rebuild from NoteCommitted events.
import { poseidon } from "./field.js";

export const DEPTH = 20;

/** Pre-computed zero hashes for each level. ZEROS[0] is the empty-leaf value (0). */
export const ZEROS: bigint[] = (() => {
  const z: bigint[] = [0n];
  for (let i = 1; i <= DEPTH; i++) {
    z.push(poseidon([z[i - 1]!, z[i - 1]!]));
  }
  return z;
})();

/** Compute the Merkle root for the given leaves (empty leaves pad with 0). */
export function computeRoot(leaves: bigint[]): bigint {
  let layer = [...leaves];
  for (let d = 0; d < DEPTH; d++) {
    const next: bigint[] = [];
    const size = Math.ceil(layer.length / 2);
    for (let i = 0; i < size; i++) {
      const l = layer[2 * i] ?? ZEROS[d]!;
      const r = layer[2 * i + 1] ?? ZEROS[d]!;
      next.push(poseidon([l, r]));
    }
    if (next.length === 0) next.push(ZEROS[d + 1]!);
    layer = next;
  }
  return layer[0] ?? ZEROS[DEPTH]!;
}

export type MerkleProof = {
  leaf: bigint;
  pathElements: bigint[];
  /** 0 = leaf is left child, 1 = leaf is right child at that level. */
  pathIndices: (0 | 1)[];
  root: bigint;
};

/** Produce a Merkle proof for `leaves[leafIndex]`. */
export function merkleProof(leaves: bigint[], leafIndex: number): MerkleProof {
  const leaf = leaves[leafIndex] ?? 0n;
  const pathElements: bigint[] = [];
  const pathIndices: (0 | 1)[] = [];

  let layer = [...leaves];
  let idx = leafIndex;
  for (let d = 0; d < DEPTH; d++) {
    const isRight = idx % 2 === 1;
    pathIndices.push(isRight ? 1 : 0);
    const siblingIdx = isRight ? idx - 1 : idx + 1;
    pathElements.push(layer[siblingIdx] ?? ZEROS[d]!);

    const next: bigint[] = [];
    const size = Math.ceil(layer.length / 2);
    for (let i = 0; i < size; i++) {
      const l = layer[2 * i] ?? ZEROS[d]!;
      const r = layer[2 * i + 1] ?? ZEROS[d]!;
      next.push(poseidon([l, r]));
    }
    if (next.length === 0) next.push(ZEROS[d + 1]!);
    layer = next;
    idx = Math.floor(idx / 2);
  }

  return { leaf, pathElements, pathIndices, root: layer[0] ?? ZEROS[DEPTH]! };
}

export type Append = {
  pathElements: bigint[];
  /** True where the appended node is the right child at that level. */
  right: boolean[];
  oldRoot: bigint;
  newRoot: bigint;
  leafIndex: number;
};

/** Witness for appending `leaf` to a tree whose existing leaves are `leaves`. */
export function appendProof(leaves: bigint[], leaf: bigint): Append {
  const leafIndex = leaves.length;
  const p = merkleProof([...leaves, 0n], leafIndex);
  return {
    pathElements: p.pathElements,
    right: p.pathIndices.map((b) => b === 1),
    oldRoot: computeRoot(leaves),
    newRoot: computeRoot([...leaves, leaf]),
    leafIndex,
  };
}
