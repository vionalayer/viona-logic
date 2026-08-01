// BN254 scalar field (Fr) helpers for VIONA Shield's ZK privacy layer.
// Poseidon2 parity with Noir circuits is guaranteed by @zkpassport/poseidon2.
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { poseidon2Hash } from "@zkpassport/poseidon2";

/** BN254 scalar field modulus. */
export const FR = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/** Domain tags — ASCII "vion:mpk" and "vion:nul"; must mirror VIONA Shield circuits. */
export const DOMAIN_MPK      = 0x76696f6e3a6d706bn;  // "vion:mpk"
export const DOMAIN_NULLIFIER = 0x76696f6e3a6e756cn; // "vion:nul"

export function mod(x: bigint): bigint {
  const r = x % FR;
  return r < 0n ? r + FR : r;
}

/** Reduce arbitrary bytes to a field element. */
export function bytesToField(b: Uint8Array): bigint {
  return mod(BigInt("0x" + bytesToHex(b)));
}

/** Keccak of label parts into the field — deterministic key derivation. */
export function hashToField(...parts: Uint8Array[]): bigint {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const buf = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { buf.set(p, o); o += p.length; }
  return bytesToField(keccak_256(buf));
}

/** Browser-safe random 32 bytes. */
export function randomBytes32(): Uint8Array {
  const buf = new Uint8Array(32);
  globalThis.crypto.getRandomValues(buf);
  return buf;
}

/** A uniform random field element. */
export function randomField(): bigint {
  return bytesToField(randomBytes32());
}

/** Poseidon2 over 1–4 field inputs (variable-length sponge, matches Noir). */
export function poseidon(inputs: bigint[]): bigint {
  if (inputs.length < 1 || inputs.length > 4) {
    throw new Error(`poseidon arity ${inputs.length} unsupported`);
  }
  return poseidon2Hash(inputs);
}

/** 0x-prefixed, zero-padded 32-byte hex of a field element. */
export function fieldToHex(x: bigint): `0x${string}` {
  return `0x${x.toString(16).padStart(64, "0")}`;
}

export function hexToField(hex: string): bigint {
  return mod(BigInt(hex.startsWith("0x") ? hex : "0x" + hex));
}

export { hexToBytes, bytesToHex };
