// Note encryption/decryption for VIONA Shield — browser-safe, Web Crypto API only.
//
// Each note is ECDH-encrypted to the recipient's secp256k1 view key so only they
// can find it while scanning the pool's event log. A 1-byte view tag lets a scan
// skip ~99.6% of ciphertexts without AES — only ciphertexts whose tag matches
// the first byte of the shared secret need full decryption.
import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import type { Note } from "./note.js";

const Point = secp256k1.ProjectivePoint;

export type NoteCipher = {
  eph: string; // ephemeral compressed pubkey (33 bytes, hex, no 0x)
  vt: string;  // 1-byte view tag (hex)
  iv: string;  // AES-GCM 12-byte IV (hex)
  tag: string; // AES-GCM 16-byte auth tag (hex)
  ct: string;  // 96-byte ciphertext (hex): value || token || blinding, each 32 bytes
};

const FIELD_BYTES   = 32;
const PAYLOAD_BYTES = 3 * FIELD_BYTES; // value, token, blinding = 96 bytes

function toBuffer(u: Uint8Array): ArrayBuffer {
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
}

function packField(v: bigint): Uint8Array {
  const hex = v.toString(16).padStart(64, "0");
  return hexToBytes(hex);
}

async function ecdhSecret(privKey: bigint, pubKey: Uint8Array): Promise<Uint8Array> {
  const P = Point.fromHex(bytesToHex(pubKey));
  const S = P.multiply(privKey);
  return keccak_256(S.toRawBytes(true));
}

function viewTag(secret: Uint8Array): string {
  return bytesToHex(secret.slice(0, 1));
}

async function deriveAesKey(secret: Uint8Array, usage: KeyUsage[]): Promise<CryptoKey> {
  const raw = await globalThis.crypto.subtle.importKey("raw", toBuffer(secret), "HKDF", false, ["deriveKey"]);
  return globalThis.crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32),
      info: new TextEncoder().encode("viona:shield:enc"),
    },
    raw,
    { name: "AES-GCM", length: 256 },
    false,
    usage,
  );
}

/** Encrypt a note to a recipient's compressed secp256k1 view public key. */
export async function encryptNote(note: Note, recipientViewPub: Uint8Array): Promise<NoteCipher> {
  const ephBytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(ephBytes);
  const ephPriv  = BigInt("0x" + bytesToHex(ephBytes)) % secp256k1.CURVE.n;
  const ephPoint = Point.BASE.multiply(ephPriv);
  const eph      = bytesToHex(ephPoint.toRawBytes(true));

  const secret = await ecdhSecret(ephPriv, recipientViewPub);
  const vt     = viewTag(secret);

  const aesKey = await deriveAesKey(secret, ["encrypt"]);
  const iv     = globalThis.crypto.getRandomValues(new Uint8Array(12));

  const payload = new Uint8Array(PAYLOAD_BYTES);
  payload.set(packField(note.value), 0);
  payload.set(packField(note.token), FIELD_BYTES);
  payload.set(packField(note.blinding), FIELD_BYTES * 2);

  // Web Crypto returns ciphertext || tag (tag is last 16 bytes)
  const encrypted = new Uint8Array(
    await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv: toBuffer(iv) }, aesKey, toBuffer(payload)),
  );

  return {
    eph,
    vt,
    iv:  bytesToHex(iv),
    ct:  bytesToHex(encrypted.slice(0, PAYLOAD_BYTES)),
    tag: bytesToHex(encrypted.slice(PAYLOAD_BYTES)),
  };
}

/** Try to decrypt a ciphertext with the given view private key. Returns null if not ours. */
export async function tryDecryptNote(
  cipher: NoteCipher,
  viewPriv: bigint,
): Promise<{ value: bigint; token: bigint; blinding: bigint } | null> {
  try {
    const ephPub = hexToBytes(cipher.eph);
    const secret = await ecdhSecret(viewPriv, ephPub);

    if (viewTag(secret) !== cipher.vt) return null;

    const aesKey   = await deriveAesKey(secret, ["decrypt"]);
    const iv       = hexToBytes(cipher.iv);
    const ctWithTag = new Uint8Array([...hexToBytes(cipher.ct), ...hexToBytes(cipher.tag)]);

    const decrypted = new Uint8Array(
      await globalThis.crypto.subtle.decrypt({ name: "AES-GCM", iv: toBuffer(iv) }, aesKey, toBuffer(ctWithTag)),
    );

    const readField = (off: number) =>
      BigInt("0x" + bytesToHex(decrypted.slice(off, off + FIELD_BYTES)));

    return {
      value:    readField(0),
      token:    readField(FIELD_BYTES),
      blinding: readField(FIELD_BYTES * 2),
    };
  } catch {
    return null;
  }
}

/**
 * Serialise a NoteCipher to bytes for the on-chain ciphertext field.
 * Format: eph (33) | vt (1) | iv (12) | tag (16) | ct (96) = 158 bytes total.
 */
export function serializeCipher(c: NoteCipher): `0x${string}` {
  return `0x${c.eph}${c.vt}${c.iv}${c.tag}${c.ct}`;
}

/** Parse a serialised on-chain ciphertext back to NoteCipher. */
export function deserializeCipher(raw: string): NoteCipher {
  const hex = raw.startsWith("0x") ? raw.slice(2) : raw;
  return {
    eph: hex.slice(0, 66),
    vt:  hex.slice(66, 68),
    iv:  hex.slice(68, 92),
    tag: hex.slice(92, 124),
    ct:  hex.slice(124, 316),
  };
}
