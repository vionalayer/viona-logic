// Pool state management — sync notes from chain events, manage local wallet state.
// Notes are stored in localStorage under viona:shield: keys.
import { parseEventLogs, formatUnits } from "viem";
import type { Address } from "viem";
import { publicClient, CONTRACTS, SHIELDED_POOL_ABI, ERC20_ABI } from "./contract.js";
import type { ShieldedKeys } from "./keys.js";
import { commitment, nullifier, type Note, type StoredNote, serializeNote, deserializeNote } from "./note.js";
import { tryDecryptNote, deserializeCipher } from "./crypto.js";
import { computeRoot } from "./tree.js";
import { fieldToHex, hexToField } from "./field.js";
import { tokenByField, formatTokenAmount } from "./tokens.js";

// suppress unused imports that are used transitively
void (computeRoot as unknown);
void (fieldToHex as unknown);
void (formatUnits as unknown);

const STORAGE_KEY = (address: string) => `viona:shield:wallet:${address.toLowerCase()}`;

export type WalletState = {
  notes: StoredNote[];
  commitments: bigint[];   // all pool commitments in order (for tree reconstruction)
  nullifiers: Set<bigint>; // all spent nullifiers
  lastSyncedBlock: bigint;
};

export type ShieldedBalance = {
  symbol: string;
  raw: bigint;
  formatted: string;
  decimals: number;
};

/** Load persisted wallet state from localStorage. */
export function loadWalletState(walletAddress: string): WalletState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(walletAddress));
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    return {
      notes:            (parsed.notes      ?? []).map(deserializeNote),
      commitments:      (parsed.commitments ?? []).map(BigInt),
      nullifiers:       new Set((parsed.nullifiers ?? []).map(BigInt)),
      lastSyncedBlock:  BigInt(parsed.lastSyncedBlock ?? CONTRACTS.poolDeployBlock.toString()),
    };
  } catch {
    return emptyState();
  }
}

/** Persist wallet state to localStorage. */
export function saveWalletState(walletAddress: string, state: WalletState): void {
  const serialized = {
    notes:           state.notes.map(serializeNote),
    commitments:     state.commitments.map((c) => c.toString()),
    nullifiers:      [...state.nullifiers].map((n) => n.toString()),
    lastSyncedBlock: state.lastSyncedBlock.toString(),
  };
  localStorage.setItem(STORAGE_KEY(walletAddress), JSON.stringify(serialized));
}

function emptyState(): WalletState {
  return {
    notes:           [],
    commitments:     [],
    nullifiers:      new Set(),
    lastSyncedBlock: CONTRACTS.poolDeployBlock,
  };
}

export type SyncProgress = {
  phase: "fetching" | "decrypting" | "done";
  blocksScanned?: number;
  notesFound?: number;
};

/**
 * Sync pool events from chain and decrypt notes belonging to `keys`.
 * Returns immediately with empty state if the pool contract is not yet deployed.
 */
export async function syncPool(
  walletAddress: string,
  keys: ShieldedKeys,
  onProgress?: (p: SyncProgress) => void,
): Promise<WalletState> {
  // Pool not deployed yet — return saved state as-is
  if (!CONTRACTS.pool) {
    const state = loadWalletState(walletAddress);
    onProgress?.({ phase: "done", notesFound: 0 });
    return state;
  }

  const client = publicClient();
  const state  = loadWalletState(walletAddress);

  onProgress?.({ phase: "fetching" });

  const latestBlock = await client.getBlockNumber();
  const fromBlock   = state.lastSyncedBlock;
  const CHUNK       = 10000n;

  let newCommitments: Array<{ leafIndex: number; commitment: bigint; ciphertextHex: string }> = [];
  let newNullifiers:  bigint[] = [];

  for (let from = fromBlock; from <= latestBlock; from += CHUNK) {
    const to = from + CHUNK - 1n < latestBlock ? from + CHUNK - 1n : latestBlock;

    type RawLog = Parameters<typeof parseEventLogs>[0]["logs"][number];
    const rawPair = await Promise.all([
      client.getLogs({ address: CONTRACTS.pool!, fromBlock: from, toBlock: to }),
      client.getLogs({ address: CONTRACTS.pool!, fromBlock: from, toBlock: to }),
    ]).catch(() => [[], []] as [RawLog[], RawLog[]]);
    const [commitLogs, nullLogs] = rawPair;

    for (const log of commitLogs) {
      const decoded = parseEventLogs({ abi: SHIELDED_POOL_ABI, logs: [log] })[0] as {
        eventName: string;
        args: { leafIndex: number; commitment: `0x${string}`; ciphertext: `0x${string}` };
      };
      if (decoded?.eventName === "NoteCommitted") {
        newCommitments.push({
          leafIndex:     decoded.args.leafIndex,
          commitment:    hexToField(decoded.args.commitment),
          ciphertextHex: decoded.args.ciphertext,
        });
      }
    }

    for (const log of nullLogs) {
      const decoded = parseEventLogs({ abi: SHIELDED_POOL_ABI, logs: [log] })[0] as {
        eventName: string;
        args: { nullifier: `0x${string}` };
      };
      if (decoded?.eventName === "Nullified") {
        newNullifiers.push(hexToField(decoded.args.nullifier));
      }
    }
  }

  // Update commitments array
  for (const c of newCommitments) {
    while (state.commitments.length <= c.leafIndex) state.commitments.push(0n);
    state.commitments[c.leafIndex] = c.commitment;
  }

  // Update nullifiers
  for (const n of newNullifiers) state.nullifiers.add(n);

  // Mark known notes as spent
  for (const note of state.notes) {
    if (state.nullifiers.has(note.nullifier)) note.spent = true;
  }

  // Try to decrypt new ciphertexts
  onProgress?.({ phase: "decrypting", blocksScanned: Number(latestBlock - fromBlock) });
  let notesFound = 0;

  for (const { leafIndex, commitment: c, ciphertextHex } of newCommitments) {
    if (state.notes.some((n) => n.leafIndex === leafIndex)) continue;
    try {
      const cipher    = deserializeCipher(ciphertextHex);
      const decrypted = await tryDecryptNote(cipher, keys.viewPriv);
      if (decrypted) {
        const noteData: Note = {
          owner:    keys.mpk,
          token:    decrypted.token,
          value:    decrypted.value,
          blinding: decrypted.blinding,
        };
        const nul = nullifier(keys.sk, c);
        const stored: StoredNote = {
          ...noteData,
          commitment: c,
          nullifier:  nul,
          leafIndex,
          spent: state.nullifiers.has(nul),
        };
        state.notes.push(stored);
        notesFound++;
      }
    } catch {
      // Not our note or decryption failed — skip
    }
  }

  // Recompute nullifiers for all notes — self-healing migration if the nullifier
  // formula ever changed (e.g. from 3-input to 2-input poseidon).
  for (const note of state.notes) {
    note.nullifier = nullifier(keys.sk, note.commitment);
    note.spent = state.nullifiers.has(note.nullifier);
  }

  state.lastSyncedBlock = latestBlock + 1n;
  saveWalletState(walletAddress, state);

  onProgress?.({ phase: "done", notesFound });
  return state;
}

/** Compute shielded balances from unspent notes. */
export function shieldedBalances(state: WalletState): ShieldedBalance[] {
  const totals = new Map<bigint, bigint>();
  for (const note of state.notes) {
    if (!note.spent) {
      totals.set(note.token, (totals.get(note.token) ?? 0n) + note.value);
    }
  }
  const result: ShieldedBalance[] = [];
  for (const [field, raw] of totals) {
    const token = tokenByField(field);
    if (token && raw > 0n) {
      result.push({ symbol: token.symbol, raw, formatted: formatTokenAmount(raw, token.decimals), decimals: token.decimals });
    }
  }
  return result.sort((a, b) => a.symbol.localeCompare(b.symbol));
}

/** Get on-chain ETH balance for an address. */
export async function getEthBalance(address: Address): Promise<bigint> {
  return publicClient().getBalance({ address });
}

/** Get on-chain ERC-20 balance for an address. */
export async function getTokenBalance(tokenAddress: Address, walletAddress: Address): Promise<bigint> {
  return publicClient().readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [walletAddress],
  });
}
