// Note types and commitment computation for VIONA Shield.
import { poseidon, fieldToHex } from "./field.js";

export type Note = {
  owner: bigint;    // masterPubKey — who owns this note
  token: bigint;    // token field element (0 = ETH, address = ERC-20)
  value: bigint;    // amount in base units (wei for ETH)
  blinding: bigint; // random blinding factor
};

/** Poseidon2 commitment to a note. Matches commit() in VIONA Shield circuits. */
export function commitment(note: Note): bigint {
  return poseidon([note.owner, note.token, note.value, note.blinding]);
}

/** Nullifier for spending a note — authorised by spending key sk.
 *  Uses hash2(sk, c) = poseidon2([sk, c]) — matches derive_nullifier() in the Noir circuit.
 *  NOTE: no domain tag; the circuit comment references keys.ts deriveNullifier(). */
export function nullifier(sk: bigint, c: bigint): bigint {
  return poseidon([sk, c]);
}

/** A note returned from pool sync — stored with leafIndex and spent status. */
export type StoredNote = Note & {
  commitment: bigint;
  nullifier: bigint;
  leafIndex: number;
  spent: boolean;
};

/** A note being deposited — written before the tx confirms so blinding isn't lost. */
export type PendingNote = {
  note: Note;
  commitment: bigint;
  tx?: `0x${string}`;
};

/** Serialise a note to localStorage-safe JSON. */
export function serializeNote(n: StoredNote): Record<string, string | number | boolean> {
  return {
    owner:      fieldToHex(n.owner),
    token:      fieldToHex(n.token),
    value:      fieldToHex(n.value),
    blinding:   fieldToHex(n.blinding),
    commitment: fieldToHex(n.commitment),
    nullifier:  fieldToHex(n.nullifier),
    leafIndex:  n.leafIndex,
    spent:      n.spent,
  };
}

export function deserializeNote(raw: Record<string, string | number | boolean>): StoredNote {
  return {
    owner:      BigInt(raw.owner as string),
    token:      BigInt(raw.token as string),
    value:      BigInt(raw.value as string),
    blinding:   BigInt(raw.blinding as string),
    commitment: BigInt(raw.commitment as string),
    nullifier:  BigInt(raw.nullifier as string),
    leafIndex:  raw.leafIndex as number,
    spent:      raw.spent as boolean,
  };
}
