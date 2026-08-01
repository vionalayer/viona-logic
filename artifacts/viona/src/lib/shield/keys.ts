// Shielded-account key derivation for VIONA Shield.
//
// In the browser we never touch the wallet's raw private key. Instead, keys are
// derived from deterministic wallet *signatures*. The user signs two fixed
// EIP-191 personal_sign messages:
//   "viona:shield:spend:sig-v1"  → spending key
//   "viona:shield:view:sig-v1"   → view / encryption key
// Same wallet → same VIONA Shield keys, forever, non-custodially.
import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex, hexToBytes, concatBytes } from "@noble/hashes/utils";
import { bech32m } from "@scure/base";
import { hashToField, poseidon, DOMAIN_MPK, mod, fieldToHex } from "./field.js";

// suppress unused import warning for concatBytes (kept for future use)
void (keccak_256 as unknown);
void (concatBytes as unknown);

const Point = secp256k1.ProjectivePoint;

export type ShieldedKeys = {
  sk: bigint;           // spending key (private — authorises spends)
  nk: bigint;           // nullifying key = Poseidon2(sk)
  mpk: bigint;          // master public key = Poseidon2(DOMAIN_MPK, sk, nk) — note owner id
  viewPriv: bigint;     // secp256k1 scalar — decrypts notes
  viewPub: Uint8Array;  // compressed secp256k1 pubkey — recipients encrypt to this
  address: string;      // viona1... payment address (bech32m)
};

/** EIP-191 personal_sign messages used to derive VIONA Shield keys. */
export const SPEND_MSG = "viona:shield:spend:sig-v1";
export const VIEW_MSG  = "viona:shield:view:sig-v1";

/** Derive all shielded keys from two wallet signatures. */
export function keysFromSignatures(spendSig: `0x${string}`, viewSig: `0x${string}`): ShieldedKeys {
  const sk  = hashToField(hexToBytes(spendSig.slice(2)));
  const nk  = poseidon([sk]);
  const mpk = poseidon([DOMAIN_MPK, sk, nk]);

  const viewPriv = mod(hashToField(hexToBytes(viewSig.slice(2))));
  const viewPoint = Point.BASE.multiply(viewPriv);
  const viewPub   = viewPoint.toRawBytes(true); // 33 bytes, compressed

  // viona1... payment address — bech32m of the compressed view pubkey
  const address = bech32m.encode("viona", bech32m.toWords(viewPub), false);

  return { sk, nk, mpk, viewPriv, viewPub, address };
}

/** Reconstruct viewPub from a viona1... address string. */
export function addressToViewPub(addr: string): Uint8Array {
  const { words } = bech32m.decode(addr as `viona1${string}`, 200);
  return bech32m.fromWords(words);
}

/** Validate that a string looks like a valid viona1... payment address. */
export function isPaymentAddress(addr: string): boolean {
  try {
    const { prefix } = bech32m.decode(addr as `viona1${string}`, 200);
    return prefix === "viona";
  } catch {
    return false;
  }
}

/** Derive the nullifier for note with commitment `c`, spent by spending key `sk`. */
export function deriveNullifier(sk: bigint, c: bigint): bigint {
  return poseidon([sk, c]);
}

export { fieldToHex };
