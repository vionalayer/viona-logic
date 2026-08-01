/**
 * useShieldSpend — encapsulates all ZK proof-generation logic for spending
 * from the VIONA Shield pool to an arbitrary recipient (typically VIONATrader).
 *
 * Usage:
 *   const { shieldedUsdg, generateProof, step, progress } = useShieldSpend();
 *   const { statement, ciphertexts, proof } = await generateProof(amountUsdg, traderAddress);
 *   then call openShieldedPosition(statement, ciphertexts, proof, symbol, isLong)
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { useAccount, useSignMessage } from "wagmi";
import type { Address } from "viem";
import { parseUnits } from "viem";

// Shield lib
import {
  keysFromSignatures, SPEND_MSG, VIEW_MSG,
  type ShieldedKeys,
} from "./shield/keys";
import {
  loadWalletState, shieldedBalances, syncPool,
  type WalletState,
} from "./shield/pool";
import { computeRoot, merkleProof } from "./shield/tree";
import { randomField } from "./shield/field";
import {
  commitment as computeCommitment,
  nullifier as computeNullifier,
  type Note,
} from "./shield/note";
import { encryptNote, serializeCipher } from "./shield/crypto";
import { proveTransfer, type SpendPlan } from "./shield/prover";
import { tokenBySymbol } from "./shield/tokens";
import { CONTRACTS } from "./shield/contract";
import type { SpendStatementArgs } from "./use-shield-trade";

type SpendStep =
  | "idle"
  | "signing"          // waiting for MetaMask to sign key-derivation msg
  | "building"         // building Merkle proofs + notes
  | "proving"          // ZK prover running
  | "ready"            // proof ready — caller submits tx
  | "error";

type SpendResult = {
  statement:   SpendStatementArgs;
  ciphertexts: [`0x${string}`, `0x${string}`];
  proof:       `0x${string}`;
};

const toHex32 = (n: bigint): `0x${string}` =>
  `0x${n.toString(16).padStart(64, "0")}` as `0x${string}`;

export function useShieldSpend() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [step, setStep]     = useState<SpendStep>("idle");
  const [progress, setProgress] = useState(0);
  const [phaseLabel, setPhaseLabel] = useState("");
  const [error, setError]   = useState("");

  // Cached keys (re-derived each session, never stored)
  const [keys, setKeys]     = useState<ShieldedKeys | null>(null);
  const [walletState, setWalletState] = useState<WalletState | null>(null);

  // Shielded USDG balance (from localStorage notes)
  const [shieldedUsdg, setShieldedUsdg] = useState(0); // in USD
  const [syncing, setSyncing] = useState(false);

  /** Read localStorage and refresh displayed balance — cheap, no network. */
  const refreshLocal = useCallback((addr: string) => {
    const state = loadWalletState(addr);
    setWalletState(state);
    const bals = shieldedBalances(state);
    const usdgBal = bals.find(b => b.symbol === "USDG");
    setShieldedUsdg(usdgBal ? Number(usdgBal.raw) / 1e6 : 0);
  }, []);

  // Load on mount + poll every 5 s (picks up notes written by Shield page)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!address) { setShieldedUsdg(0); return; }
    refreshLocal(address);
    pollRef.current = setInterval(() => refreshLocal(address), 5_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [address, refreshLocal]);

  /** Derive shield keys via MetaMask signatures (once per session). */
  const deriveKeys = useCallback(async (): Promise<ShieldedKeys> => {
    if (keys) return keys;
    setStep("signing");
    setPhaseLabel("Sign to unlock shield wallet…");
    const [spendSig, viewSig] = await Promise.all([
      signMessageAsync({ message: SPEND_MSG }),
      signMessageAsync({ message: VIEW_MSG }),
    ]);
    const k = keysFromSignatures(spendSig, viewSig);
    setKeys(k);
    return k;
  }, [keys, signMessageAsync]);

  /** Full chain sync — fetches pool events, decrypts notes, saves to localStorage.
   *  Requires keys; triggers MetaMask signature once per session. */
  const syncFromChain = useCallback(async (): Promise<void> => {
    if (!address || syncing) return;
    setSyncing(true);
    try {
      const k = await deriveKeys();
      const state = await syncPool(address, k);
      setWalletState(state);
      const bals = shieldedBalances(state);
      const usdgBal = bals.find(b => b.symbol === "USDG");
      setShieldedUsdg(usdgBal ? Number(usdgBal.raw) / 1e6 : 0);
    } finally {
      setSyncing(false);
    }
  }, [address, syncing, deriveKeys]);

  /**
   * Generate a spend proof with the given recipient.
   * recipient = CONTRACTS.trader for Shield-funded trades.
   *
   * Always syncs the note tree from chain first so the membershipRoot
   * in the proof matches the on-chain root — avoiding InvalidRoot reverts
   * when new commitments were added since the last manual sync.
   */
  const generateProof = useCallback(async (
    usdgAmount: number,    // USD amount (e.g. 100.00)
    recipient: Address,    // e.g. CONTRACTS.trader
  ): Promise<SpendResult> => {
    if (!address) throw new Error("Wallet not connected");

    setError("");
    setProgress(0);

    // Derive keys first (cached after first call — no extra MetaMask popup).
    const k = await deriveKeys();

    // Always sync from chain to get the latest commitment tree.
    // This prevents InvalidRoot reverts caused by new commitments added
    // to the pool since the user last manually synced.
    setStep("building");
    setPhaseLabel("Syncing pool state from chain…");
    let state: typeof walletState;
    try {
      state = await syncPool(address, k);
      setWalletState(state);
      // Refresh displayed balance
      const bals = shieldedBalances(state!);
      const usdgBal = bals.find(b => b.symbol === "USDG");
      setShieldedUsdg(usdgBal ? Number(usdgBal.raw) / 1e6 : 0);
    } catch {
      // If on-chain sync fails (e.g. RPC hiccup), fall back to local state.
      state = walletState ?? loadWalletState(address);
    }

    const token = tokenBySymbol("USDG");
    if (!token) throw new Error("USDG token not found");

    const amountWei = parseUnits(usdgAmount.toFixed(6), 6);

    // Find unspent USDG notes
    const unspentNotes = state.notes.filter(
      n => !n.spent && n.token === token.field,
    );
    if (unspentNotes.length === 0) {
      throw new Error("No shielded USDG — shield first on the Shield page");
    }

    // Greedy note selection (largest first, up to 2)
    const sorted = [...unspentNotes].sort((a, b) => (b.value > a.value ? 1 : -1));
    const selected: typeof sorted = [];
    let totalInput = 0n;
    for (const n of sorted) {
      if (totalInput >= amountWei) break;
      selected.push(n);
      totalInput += n.value;
      if (selected.length >= 2) break;
    }
    if (totalInput < amountWei) {
      throw new Error(
        `Insufficient shielded USDG — available: $${(Number(totalInput) / 1e6).toFixed(2)}`
      );
    }

    setStep("building");
    setPhaseLabel("Building Merkle proofs…");

    const membershipRoot = computeRoot(state.commitments);

    const inputs = selected.map(note => {
      const mp = merkleProof(state.commitments, note.leafIndex);
      return {
        note: { owner: note.owner, token: note.token, value: note.value, blinding: note.blinding } as Note,
        leafIndex: note.leafIndex,
        pathElements: mp.pathElements,
        pathIndices: mp.pathIndices,
        nullifier: note.nullifier,
      };
    });

    // Pad to 2 inputs (circuit always uses 2)
    if (inputs.length < 2) {
      const db  = randomField();
      const dn: Note = { owner: 0n, token: 0n, value: 0n, blinding: db };
      const dc = computeCommitment(dn);
      const dnul = computeNullifier(k.sk, dc);
      inputs.push({
        note: dn,
        leafIndex: 0,
        pathElements: Array(20).fill(0n) as bigint[],
        pathIndices: Array(20).fill(0)  as (0 | 1)[],
        nullifier: dnul,
      });
    }

    setPhaseLabel("Building output notes…");

    // Change note (back to self)
    const changeAmount = totalInput - amountWei;
    const changeBlinding = randomField();
    const changeNote: Note = { owner: k.mpk, token: token.field, value: changeAmount, blinding: changeBlinding };
    const changeCommitment = computeCommitment(changeNote);

    // Padding note
    const dummyBlinding = randomField();
    const dummyNote: Note = { owner: k.mpk, token: 0n, value: 0n, blinding: dummyBlinding };
    const dummyCommitment = computeCommitment(dummyNote);

    const treeWithChange = [...state.commitments, changeCommitment];
    const newRoot = computeRoot([...treeWithChange, dummyCommitment]);

    setPhaseLabel("Encrypting notes…");
    const changeCipher = await encryptNote(changeNote, k.viewPub);
    const dummyCipher  = await encryptNote(dummyNote,  k.viewPub);
    const changeCipherBytes = serializeCipher(changeCipher) as `0x${string}`;
    const dummyCipherBytes  = serializeCipher(dummyCipher)  as `0x${string}`;

    const plan: SpendPlan = {
      inputs,
      outputs: [
        { note: changeNote, commitment: changeCommitment },
        { note: dummyNote,  commitment: dummyCommitment  },
      ],
      membershipRoot,
      oldRoot: membershipRoot,
      newRoot,
      publicToken:     token.field,
      publicValue:     amountWei,
      publicFee:       0n,
      publicRecipient: recipient,     // ← VIONATrader, not user wallet
      relayer:         "0x0000000000000000000000000000000000000000",
    };

    setStep("proving");
    setPhaseLabel("Generating ZK proof…");
    setProgress(0);

    const transferProof = await proveTransfer(plan, k, (phase, pct) => {
      setPhaseLabel(phase);
      if (pct !== undefined) setProgress(pct);
    });

    setStep("ready");
    setProgress(100);

    const statement: SpendStatementArgs = {
      membershipRoot: toHex32(membershipRoot),
      nullifiers:  [
        toHex32(inputs[0].nullifier),
        toHex32(inputs[1].nullifier),
      ],
      commitments: [toHex32(changeCommitment), toHex32(dummyCommitment)],
      newRoot:    toHex32(newRoot),
      token:      token.field,
      value:      amountWei,
      fee:        0n,
      recipient,
      relayer:    "0x0000000000000000000000000000000000000000" as Address,
    };

    return {
      statement,
      ciphertexts: [changeCipherBytes, dummyCipherBytes],
      proof: transferProof.proof,
    };
  }, [address, deriveKeys, walletState]);

  const reset = useCallback(() => {
    setStep("idle");
    setProgress(0);
    setPhaseLabel("");
    setError("");
  }, []);

  return {
    shieldedUsdg,    // available shielded USDG balance in USD
    syncing,         // true while syncFromChain is running
    syncFromChain,   // trigger full chain sync (signs keys once per session)
    step,
    progress,
    phaseLabel,
    error,
    setError,
    generateProof,
    reset,
    traderAddress: CONTRACTS.trader as Address,
  };
}
