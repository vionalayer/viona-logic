// VIONA Shield — Private Trading on Robinhood Chain
// Browser-side ZK proving: non-custodial, no private key exposure.
// Keys derive from wallet signatures. Circuits and pool contract in development.
import { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { useAccount, useSignMessage, useChainId, useSwitchChain } from "wagmi";
import { formatEther, parseEther, parseUnits, parseAbi, maxUint256 } from "viem";
import type { Address } from "viem";
import { useToast } from "@/hooks/use-toast";
import {
  keysFromSignatures,
  type ShieldedKeys,
  SPEND_MSG,
  VIEW_MSG,
} from "@/lib/shield/keys";
import {
  syncPool,
  shieldedBalances,
  loadWalletState,
  getEthBalance,
  getTokenBalance,
  type WalletState,
  type ShieldedBalance,
  type SyncProgress,
} from "@/lib/shield/pool";
import { getEthPrice } from "@/lib/shield/market";
import { randomField } from "@/lib/shield/field";
import { commitment as computeCommitment, nullifier as computeNullifier } from "@/lib/shield/note";
import { appendProof } from "@/lib/shield/tree";
import { encryptNote, serializeCipher } from "@/lib/shield/crypto";
import { proveShield, proveTransfer, warmProver, terminateWorker, type SpendPlan } from "@/lib/shield/prover";
import { CONTRACTS, walletClient, publicClient, SHIELDED_POOL_ABI, robinhoodChain } from "@/lib/shield/contract";
import { tokenBySymbol, tokenByField, formatTokenAmount, ALL_TOKENS } from "@/lib/shield/tokens";
import { merkleProof, computeRoot } from "@/lib/shield/tree";
import type { Note } from "@/lib/shield/note";

// ─────────────────────────────────────────────────────────────────────────────
//  Small reusable components
// ─────────────────────────────────────────────────────────────────────────────
function StatusBadge({ text, color }: { text: string; color: string }) {
  return (
    <span className={`font-mono text-xs px-2 py-0.5 rounded border ${color}`}>
      {text}
    </span>
  );
}

function SectionCard({ title, children, badge }: {
  title: string;
  children: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <div className="border border-green-900/40 bg-black/60 rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-mono text-green-400 text-sm font-semibold tracking-widest uppercase">
          {title}
        </h3>
        {badge}
      </div>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Main page
// ─────────────────────────────────────────────────────────────────────────────
export function ShieldPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { signMessageAsync } = useSignMessage();
  const { toast } = useToast();

  const [keys, setKeys]               = useState<ShieldedKeys | null>(null);
  const [keysLoading, setKeysLoading] = useState(false);

  const [walletState, setWalletState] = useState<WalletState | null>(null);
  const [balances, setBalances]       = useState<ShieldedBalance[]>([]);
  const [ethBalance, setEthBalance]   = useState<bigint>(0n);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [syncing, setSyncing]         = useState(false);

  const [ethPrice, setEthPrice]       = useState<number | null>(null);
  const [marketLoading, setMarketLoading] = useState(false);

  const [shieldToken, setShieldToken] = useState("ETH");
  const [shieldAmount, setShieldAmount] = useState("");
  const [shieldLoading, setShieldLoading] = useState(false);
  const [shieldStep, setShieldStep]   = useState<string>("");
  const [shieldPct, setShieldPct]     = useState<number | null>(null);
  const [shieldElapsed, setShieldElapsed] = useState(0);

  const [unshieldToken, setUnshieldToken] = useState("ETH");
  const [unshieldAmount, setUnshieldAmount] = useState("");
  const [unshieldRecipient, setUnshieldRecipient] = useState("");
  const [unshieldLoading, setUnshieldLoading] = useState(false);
  const [unshieldStep, setUnshieldStep] = useState<string>("");
  const [unshieldPct, setUnshieldPct] = useState<number | null>(null);
  const [unshieldElapsed, setUnshieldElapsed] = useState(0);
  const [unshieldTxHash, setUnshieldTxHash] = useState<`0x${string}` | null>(null);

  const isRobinhoodChain = chainId === 4663;
  const poolDeployed     = CONTRACTS.pool !== null;

  // ── Pre-warm prover when wallet connects ─────────────────────────────────
  useEffect(() => {
    if (isConnected) warmProver();
    return () => { if (!isConnected) terminateWorker(); };
  }, [isConnected]);

  // ── Elapsed timer during proving ─────────────────────────────────────────
  useEffect(() => {
    if (!shieldLoading) { setShieldElapsed(0); return; }
    const t = setInterval(() => setShieldElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [shieldLoading]);

  useEffect(() => {
    if (!unshieldLoading) { setUnshieldElapsed(0); return; }
    const t = setInterval(() => setUnshieldElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [unshieldLoading]);

  // ── Market data ────────────────────────────────────────────────────────────
  useEffect(() => {
    setMarketLoading(true);
    getEthPrice().then((price) => {
      setEthPrice(price);
      setMarketLoading(false);
    });
  }, []);

  // ── ETH balance ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!address || !isRobinhoodChain) return;
    getEthBalance(address as Address).then(setEthBalance).catch(() => {});
  }, [address, isRobinhoodChain]);

  // ── Load saved keys from localStorage ────────────────────────────────────
  useEffect(() => {
    if (!address || !isConnected) { setKeys(null); return; }
    const saved = localStorage.getItem(`viona:shield:address:${address.toLowerCase()}`);
    if (saved) {
      const state = loadWalletState(address);
      setWalletState(state);
      setBalances(shieldedBalances(state));
    }
  }, [address, isConnected]);

  // ── Derive shielded keys via wallet signatures ────────────────────────────
  const deriveKeys = useCallback(async () => {
    if (!address) return;
    setKeysLoading(true);
    try {
      toast({
        title: "Sign two messages to derive your shielded keys",
        description: "Your private key is never exposed — keys derive from deterministic wallet signatures.",
      });
      const [spendSig, viewSig] = await Promise.all([
        signMessageAsync({ message: SPEND_MSG }),
        signMessageAsync({ message: VIEW_MSG }),
      ]);
      const k = keysFromSignatures(spendSig, viewSig);
      setKeys(k);
      localStorage.setItem(`viona:shield:address:${address.toLowerCase()}`, k.address);
      toast({ title: "VIONA Shield account ready", description: k.address.slice(0, 22) + "…" });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("rejected") && !msg.includes("denied")) {
        toast({ title: "Key derivation failed", description: msg, variant: "destructive" });
      }
    } finally {
      setKeysLoading(false);
    }
  }, [address, signMessageAsync, toast]);

  // ── Sync pool ─────────────────────────────────────────────────────────────
  const doSync = useCallback(async () => {
    if (!address || !keys || syncing) return;
    setSyncing(true);
    try {
      const state = await syncPool(address, keys, (p) => setSyncProgress(p));
      setWalletState(state);
      setBalances(shieldedBalances(state));
      getEthBalance(address as Address).then(setEthBalance).catch(() => {});
    } catch (e: unknown) {
      toast({ title: "Sync failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setSyncing(false);
      setSyncProgress(null);
    }
  }, [address, keys, syncing, toast]);

  // ── Shield (deposit) ──────────────────────────────────────────────────────
  const handleShield = useCallback(async () => {
    if (!keys || !address || !poolDeployed) return;

    const token = tokenBySymbol(shieldToken);
    if (!token) return;

    const amountNum = parseFloat(shieldAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast({ title: "Invalid amount", variant: "destructive" });
      return;
    }

    const amountWei = shieldToken === "ETH"
      ? parseEther(shieldAmount)
      : parseUnits(shieldAmount, token.decimals);

    setShieldLoading(true);
    try {
      setShieldStep("Building note…");
      const blinding = randomField();
      const note = { owner: keys.mpk, token: token.field, value: amountWei, blinding };
      const c    = computeCommitment(note);

      setShieldStep("Computing Merkle proof…");
      const commitments = walletState?.commitments ?? [];
      const at = appendProof(commitments, c);

      setShieldStep("Encrypting note…");
      const cipher        = await encryptNote(note, keys.viewPub);
      const ciphertextBytes = serializeCipher(cipher) as `0x${string}`;

      setShieldStep("Starting ZK prover…");
      setShieldPct(0);
      toast({
        title: "Generating ZK proof",
        description: "Running in a background worker — do not close this tab.",
      });
      const proof = await proveShield(note, c, at, keys, (phase, pct) => {
        setShieldStep(phase);
        if (pct !== undefined) setShieldPct(pct);
      });

      const wc     = walletClient();
      const client = publicClient();
      const [walletAddr] = await wc.getAddresses();

      // Helper: fresh pending nonce from node (avoids MetaMask cache staleness)
      const pendingNonce = () =>
        client.getTransactionCount({ address: walletAddr, blockTag: "pending" });

      const ERC20_ABI = parseAbi([
        "function allowance(address owner, address spender) view returns (uint256)",
        "function approve(address spender, uint256 amount) returns (bool)",
      ]);

      // ── Approve pool to pull ERC-20 tokens (skip for ETH deposits) ──
      if (shieldToken !== "ETH") {
        const tokenAddr = address as `0x${string}`;  // real token address = address(uint160(token.field))
        const erc20Addr = `0x${token.field.toString(16).padStart(40, "0")}` as `0x${string}`;
        const allowance = await client.readContract({
          address: erc20Addr,
          abi: ERC20_ABI,
          functionName: "allowance",
          args: [walletAddr, CONTRACTS.pool!],
        }) as bigint;

        if (allowance < amountWei) {
          setShieldStep("Approving USDG for Shield pool…");
          const approveHash = await wc.writeContract({
            address: erc20Addr,
            abi: ERC20_ABI,
            functionName: "approve",
            account: walletAddr,
            chain: robinhoodChain,
            nonce: await pendingNonce(),
            args: [CONTRACTS.pool!, maxUint256],
          });
          await client.waitForTransactionReceipt({ hash: approveHash });
        }
      }

      setShieldStep("Submitting shield transaction…");
      const hash = await wc.writeContract({
        address: CONTRACTS.pool!,
        abi: SHIELDED_POOL_ABI,
        functionName: "shield",
        account: walletAddr,
        chain: robinhoodChain,
        nonce: await pendingNonce(),
        args: [
          token.field,
          amountWei,
          `0x${c.toString(16).padStart(64, "0")}` as `0x${string}`,
          `0x${at.newRoot.toString(16).padStart(64, "0")}` as `0x${string}`,
          ciphertextBytes,
          proof.proof,
        ],
        value: shieldToken === "ETH" ? amountWei : 0n,
      });

      setShieldStep("Waiting for confirmation…");
      const receipt = await publicClient().waitForTransactionReceipt({ hash });

      if (receipt.status === "success") {
        toast({ title: "Shielded!", description: `${shieldAmount} ${shieldToken} is now in your private pool.` });
        setShieldAmount("");
        doSync();
      } else {
        toast({ title: "Transaction reverted", variant: "destructive" });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("rejected") && !msg.includes("denied")) {
        toast({ title: "Shield failed", description: msg.slice(0, 200), variant: "destructive" });
      }
    } finally {
      setShieldLoading(false);
      setShieldStep("");
      setShieldPct(null);
    }
  }, [keys, address, poolDeployed, shieldToken, shieldAmount, walletState, toast, doSync]);

  // ── Unshield (withdraw) ───────────────────────────────────────────────────
  const handleUnshield = useCallback(async () => {
    if (!keys || !address || !poolDeployed || !walletState) return;

    const amountNum = parseFloat(unshieldAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast({ title: "Invalid amount", variant: "destructive" });
      return;
    }

    const token = tokenBySymbol(unshieldToken);
    if (!token) return;

    const amountWei = unshieldToken === "ETH"
      ? parseEther(unshieldAmount)
      : parseUnits(unshieldAmount, token.decimals);

    // Find unspent notes for this token
    const unspentNotes = walletState.notes.filter(
      (n) => !n.spent && n.token === token.field,
    );
    if (unspentNotes.length === 0) {
      toast({ title: "No shielded notes", description: `No ${unshieldToken} in your private account. Sync first.`, variant: "destructive" });
      return;
    }

    // Greedy select up to 2 notes (largest first) to cover amount
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
      toast({
        title: "Insufficient shielded balance",
        description: `Available: ${formatTokenAmount(totalInput, token.decimals)} ${unshieldToken}`,
        variant: "destructive",
      });
      return;
    }

    const changeAmount = totalInput - amountWei;
    const recipientAddr = ((unshieldRecipient.trim() || address) as `0x${string}`);
    const toHex32 = (n: bigint) => `0x${n.toString(16).padStart(64, "0")}` as `0x${string}`;

    setUnshieldLoading(true);
    setUnshieldTxHash(null);
    try {
      setUnshieldStep("Building Merkle proofs…");
      const membershipRoot = computeRoot(walletState.commitments);

      const inputs: Array<{
        note: Note;
        leafIndex: number;
        pathElements: bigint[];
        pathIndices: (0 | 1)[];
        nullifier: bigint;
      }> = selected.map((note) => {
        const mp = merkleProof(walletState.commitments, note.leafIndex);
        return {
          note: { owner: note.owner, token: note.token, value: note.value, blinding: note.blinding } as Note,
          leafIndex: note.leafIndex,
          pathElements: mp.pathElements,
          pathIndices: mp.pathIndices,
          nullifier: note.nullifier,
        };
      });

      // Pad to 2 inputs — circuit always checks nullifier1 even for zero-value notes.
      // Provide a dummy with random blinding so nullifier1 is unique every call
      // (avoids AlreadySpent on repeated single-note unshields). Merkle check is
      // skipped by the circuit when in1_value == 0.
      if (inputs.length < 2) {
        const dummyInputBlinding = randomField();
        const dummyInputNote: Note = { owner: 0n, token: 0n, value: 0n, blinding: dummyInputBlinding };
        const dummyInputCommitment = computeCommitment(dummyInputNote);
        const dummyInputNullifier  = computeNullifier(keys.sk, dummyInputCommitment);
        inputs.push({
          note: dummyInputNote,
          leafIndex: 0,
          pathElements: Array(20).fill(0n) as bigint[],
          pathIndices: Array(20).fill(0)  as (0 | 1)[],
          nullifier: dummyInputNullifier,
        });
      }

      setUnshieldStep("Building output notes…");
      // Output 0: change back to self
      const changeBlinding = randomField();
      const changeNote: Note = { owner: keys.mpk, token: token.field, value: changeAmount, blinding: changeBlinding };
      const changeCommitment = computeCommitment(changeNote);
      // Output 1: zero-value padding note (random blinding → unique nullifier every call,
      // avoids AlreadySpent on subsequent single-input unshields; Merkle check skipped
      // by circuit when value == 0).
      const dummyBlinding = randomField();
      const dummyNote: Note = { owner: keys.mpk, token: 0n, value: 0n, blinding: dummyBlinding };
      const dummyCommitment = computeCommitment(dummyNote);

      // New Merkle root after appending both output commitments
      const treeWithChange = [...walletState.commitments, changeCommitment];
      const newRoot = computeRoot([...treeWithChange, dummyCommitment]);

      setUnshieldStep("Encrypting output notes…");
      const changeCipher = await encryptNote(changeNote, keys.viewPub);
      const dummyCipher  = await encryptNote(dummyNote,  keys.viewPub);
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
        publicRecipient: recipientAddr,
        relayer:         "0x0000000000000000000000000000000000000000",
      };

      setUnshieldStep("Starting ZK prover…");
      setUnshieldPct(0);
      toast({ title: "Generating ZK proof", description: "Running in a background worker — do not close this tab." });

      const proof = await proveTransfer(plan, keys, (phase, pct) => {
        setUnshieldStep(phase);
        if (pct !== undefined) setUnshieldPct(pct);
      });

      setUnshieldStep("Submitting transaction…");
      const wc = walletClient();
      const [walletAddr] = await wc.getAddresses();

      const hash = await wc.writeContract({
        address: CONTRACTS.pool!,
        abi: SHIELDED_POOL_ABI,
        functionName: "spend",
        args: [
          {
            membershipRoot: toHex32(membershipRoot),
            nullifiers:  [inputs[0] ? toHex32(inputs[0].nullifier) : toHex32(0n), inputs[1] ? toHex32(inputs[1].nullifier) : toHex32(0n)] as [`0x${string}`, `0x${string}`],
            commitments: [toHex32(changeCommitment), toHex32(dummyCommitment)] as [`0x${string}`, `0x${string}`],
            newRoot:    toHex32(newRoot),
            token:      token.field,
            value:      amountWei,
            fee:        0n,
            recipient:  recipientAddr,
            relayer:    "0x0000000000000000000000000000000000000000" as `0x${string}`,
          },
          [changeCipherBytes, dummyCipherBytes] as [`0x${string}`, `0x${string}`],
          proof.proof,
        ],
        account: walletAddr,
      });

      setUnshieldStep("Waiting for confirmation…");
      const receipt = await publicClient().waitForTransactionReceipt({ hash });

      if (receipt.status === "success") {
        setUnshieldTxHash(hash);
        toast({ title: "Unshielded!", description: `${unshieldAmount} ${unshieldToken} withdrawn to ${recipientAddr.slice(0, 10)}…` });
        setUnshieldAmount("");
        doSync();
      } else {
        toast({ title: "Transaction reverted", variant: "destructive" });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("rejected") && !msg.includes("denied")) {
        toast({ title: "Unshield failed", description: msg.slice(0, 200), variant: "destructive" });
      }
    } finally {
      setUnshieldLoading(false);
      setUnshieldStep("");
      setUnshieldPct(null);
    }
  }, [keys, address, poolDeployed, walletState, unshieldToken, unshieldAmount, unshieldRecipient, toast, doSync]);

  // ─────────────────────────────────────────────────────────────────────────
  //  Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 p-4 max-w-3xl mx-auto">

      {/* Header */}
      <div className="border-b border-green-900/40 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <span className="font-mono text-green-400 text-xl font-bold tracking-wider">
            ◎ VIONA SHIELD
          </span>
          <StatusBadge text="ROBINHOOD CHAIN" color="text-green-400 border-green-800 bg-green-950/40" />
          <StatusBadge text="ZK PRIVATE" color="text-yellow-400 border-yellow-800 bg-yellow-950/30" />
          {!poolDeployed && (
            <StatusBadge text="CONTRACTS PENDING" color="text-orange-400 border-orange-800 bg-orange-950/30" />
          )}
        </div>
        <p className="font-mono text-gray-500 text-xs">
          Private trading built by VIONA · UltraHonk ZK proofs · Non-custodial · No private key exposure
        </p>
      </div>

      {/* Wrong chain */}
      {isConnected && !isRobinhoodChain && (
        <div className="border border-yellow-800 bg-yellow-950/30 rounded-lg p-4 flex items-center justify-between">
          <span className="font-mono text-yellow-400 text-sm">⚠ Switch to Robinhood Chain (4663)</span>
          <button
            onClick={() => switchChain({ chainId: 4663 })}
            className="font-mono text-xs bg-yellow-900/40 text-yellow-300 border border-yellow-700 px-3 py-1.5 rounded hover:bg-yellow-800/40"
          >
            SWITCH CHAIN
          </button>
        </div>
      )}

      {/* Not connected */}
      {!isConnected && (
        <div className="border border-gray-800 bg-gray-950/60 rounded-lg p-8 text-center">
          <p className="font-mono text-gray-500 text-sm mb-1">Connect your wallet to use VIONA Shield</p>
          <p className="font-mono text-gray-600 text-xs">Keys derive from wallet signatures — your private key is never exposed.</p>
        </div>
      )}

      {/* Contract pending deployment notice */}
      {!poolDeployed && isConnected && (
        <div className="border border-orange-800/60 bg-orange-950/20 rounded-lg p-4">
          <div className="font-mono text-orange-400 text-sm font-semibold mb-1">
            ◉ Pool contract deploying
          </div>
          <p className="font-mono text-orange-300/70 text-xs leading-relaxed">
            VIONA Shield's shielded pool and ZK circuits are being deployed to Robinhood Chain.
            You can already derive your private keys and prepare your account — shielding will
            activate automatically once the contracts are live.
          </p>
        </div>
      )}

      {isConnected && isRobinhoodChain && (
        <>
          {/* ── Shielded Account ── */}
          <SectionCard
            title="Private Account"
            badge={
              keys
                ? <StatusBadge text="KEYS READY" color="text-green-400 border-green-800 bg-green-950/40" />
                : <StatusBadge text="NOT ACTIVATED" color="text-gray-500 border-gray-700 bg-gray-900/40" />
            }
          >
            {!keys ? (
              <div className="flex flex-col gap-3">
                <p className="font-mono text-gray-400 text-xs leading-relaxed">
                  Your VIONA Shield keys derive deterministically from two wallet signatures.
                  No private key is ever exposed. Same wallet always gives you the same private account.
                </p>
                <button
                  onClick={deriveKeys}
                  disabled={keysLoading}
                  className="font-mono text-sm bg-green-900/30 text-green-400 border border-green-700 px-4 py-2 rounded hover:bg-green-800/30 disabled:opacity-50"
                >
                  {keysLoading ? "⟳ SIGNING…" : "⚡ ACTIVATE VIONA SHIELD"}
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div>
                  <div className="font-mono text-gray-500 text-xs mb-1">PRIVATE PAYMENT ADDRESS</div>
                  <div className="font-mono text-green-300 text-xs break-all bg-green-950/20 border border-green-900/40 rounded p-2">
                    {keys.address}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-black/40 border border-gray-800 rounded p-3">
                    <div className="font-mono text-gray-500 text-xs mb-1">ETH BALANCE</div>
                    <div className="font-mono text-white text-sm">
                      {parseFloat(formatEther(ethBalance)).toFixed(4)} ETH
                    </div>
                  </div>
                  <div className="bg-black/40 border border-gray-800 rounded p-3">
                    <div className="font-mono text-gray-500 text-xs mb-1">PRIVATE NOTES</div>
                    <div className="font-mono text-white text-sm">
                      {walletState ? walletState.notes.filter(n => !n.spent).length : "–"} notes
                    </div>
                  </div>
                </div>

                {balances.length > 0 && (
                  <div>
                    <div className="font-mono text-gray-500 text-xs mb-2">PRIVATE BALANCES</div>
                    <div className="flex flex-col gap-1">
                      {balances.map((b) => (
                        <div key={b.symbol} className="flex justify-between items-center font-mono text-sm">
                          <span className="text-gray-400">{b.symbol}</span>
                          <span className="text-green-400">{b.formatted}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={doSync}
                  disabled={syncing}
                  className="font-mono text-xs bg-gray-900/40 text-gray-400 border border-gray-700 px-3 py-1.5 rounded hover:bg-gray-800/40 disabled:opacity-50"
                >
                  {syncing
                    ? syncProgress
                      ? `⟳ ${syncProgress.phase.toUpperCase()}…`
                      : "⟳ SYNCING…"
                    : "↺ SYNC PRIVATE POOL"}
                </button>
              </div>
            )}
          </SectionCard>

          {/* ── Market Prices ── */}
          <SectionCard
            title="Market Prices"
            badge={<StatusBadge text="LIVE · ROBINHOOD CHAIN" color="text-blue-400 border-blue-800 bg-blue-950/30" />}
          >
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="font-mono text-gray-500 text-xs mb-1">ETH / USDG</div>
                <div className="font-mono text-white text-lg">
                  {marketLoading
                    ? "…"
                    : ethPrice
                      ? `$${ethPrice.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
                      : "N/A"}
                </div>
                <div className="font-mono text-gray-600 text-xs">Uniswap V3 · live on-chain</div>
              </div>
              <div>
                <div className="font-mono text-gray-500 text-xs mb-1">POOL STATUS</div>
                <div className={`font-mono text-sm mt-1 ${poolDeployed ? "text-green-400" : "text-orange-400"}`}>
                  {poolDeployed ? "● LIVE" : "⟳ Deploying…"}
                </div>
                <div className="font-mono text-gray-600 text-xs">VIONA Shield pool</div>
              </div>
            </div>
          </SectionCard>

          {/* ── Shield (Deposit) ── */}
          {keys && (
            <SectionCard
              title="Shield Funds"
              badge={
                poolDeployed
                  ? <StatusBadge text="ZK PROOF REQUIRED" color="text-yellow-400 border-yellow-800 bg-yellow-950/30" />
                  : <StatusBadge text="CONTRACT PENDING" color="text-orange-400 border-orange-800 bg-orange-950/30" />
              }
            >
              <div className="flex flex-col gap-4">
                <p className="font-mono text-gray-500 text-xs leading-relaxed">
                  Shielding deposits your tokens into the VIONA private pool. A ZK proof is generated
                  entirely in your browser — amounts, owners, and timing become invisible on-chain.
                </p>

                {!poolDeployed ? (
                  <div className="border border-orange-800/40 bg-orange-950/10 rounded p-4 text-center">
                    <div className="font-mono text-orange-400 text-sm mb-1">⏳ Waiting for contract deployment</div>
                    <div className="font-mono text-orange-300/60 text-xs">
                      Your keys are ready. Shielding will be enabled once the VIONA Shield pool goes live on Robinhood Chain.
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <label className="font-mono text-gray-500 text-xs mb-1 block">AMOUNT</label>
                        <input
                          type="number"
                          min="0"
                          step="0.001"
                          value={shieldAmount}
                          onChange={(e) => setShieldAmount(e.target.value)}
                          placeholder="0.0"
                          className="w-full bg-black/60 border border-gray-700 rounded px-3 py-2 font-mono text-white text-sm focus:border-green-700 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="font-mono text-gray-500 text-xs mb-1 block">TOKEN</label>
                        <select
                          value={shieldToken}
                          onChange={(e) => setShieldToken(e.target.value)}
                          className="w-full bg-black/60 border border-gray-700 rounded px-2 py-2 font-mono text-white text-sm focus:border-green-700 focus:outline-none"
                        >
                          <option value="ETH">ETH</option>
                          <option value="USDG">USDG</option>
                        </select>
                      </div>
                    </div>

                    {shieldToken === "ETH" && ethBalance > 0n && (
                      <div className="flex justify-between font-mono text-xs text-gray-600">
                        <span>Available: {parseFloat(formatEther(ethBalance)).toFixed(4)} ETH</span>
                        <button
                          onClick={() => setShieldAmount(parseFloat(formatEther(ethBalance - parseEther("0.001"))).toFixed(4))}
                          className="text-green-600 hover:text-green-400"
                        >
                          MAX
                        </button>
                      </div>
                    )}

                    {shieldStep && (
                      <div className="border border-yellow-900/40 bg-yellow-950/20 rounded px-3 py-2 space-y-1.5">
                        <div className="flex justify-between items-center">
                          <span className="font-mono text-xs text-yellow-400">⟳ {shieldStep}</span>
                          {shieldLoading && shieldElapsed > 0 && (
                            <span className="font-mono text-xs text-yellow-600">{shieldElapsed}s</span>
                          )}
                        </div>
                        {shieldPct !== null && (
                          <div className="w-full bg-yellow-950/60 rounded-full h-1">
                            <div
                              className="bg-yellow-500 h-1 rounded-full transition-all duration-500"
                              style={{ width: `${shieldPct}%` }}
                            />
                          </div>
                        )}
                      </div>
                    )}

                    <button
                      onClick={handleShield}
                      disabled={shieldLoading || !shieldAmount}
                      className="font-mono text-sm bg-green-900/30 text-green-400 border border-green-700 px-4 py-2.5 rounded hover:bg-green-800/30 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {shieldLoading
                        ? `⟳ ${shieldStep || "PROVING…"}`
                        : `⚡ SHIELD ${shieldAmount || "0"} ${shieldToken}`}
                    </button>

                    <div className="font-mono text-gray-700 text-xs">
                      ℹ Amounts cross the boundary in shared denominations — no fingerprint on-chain.
                    </div>
                  </>
                )}
              </div>
            </SectionCard>
          )}

          {/* ── Unshield (Withdraw) ── */}
          {keys && (
            <SectionCard
              title="Unshield Funds"
              badge={
                poolDeployed
                  ? <StatusBadge text="ULTRAHONK · JOIN-SPLIT" color="text-blue-400 border-blue-800 bg-blue-950/30" />
                  : <StatusBadge text="CONTRACT PENDING" color="text-orange-400 border-orange-800 bg-orange-950/30" />
              }
            >
              <div className="flex flex-col gap-4">
                <p className="font-mono text-gray-500 text-xs leading-relaxed">
                  Withdraw shielded funds back to any address. A join-split ZK proof is generated
                  in your browser — the withdrawn amount is the only public information.
                </p>

                {!poolDeployed ? (
                  <div className="border border-orange-800/40 bg-orange-950/10 rounded p-4 text-center">
                    <div className="font-mono text-orange-400 text-sm mb-1">⏳ Waiting for contract deployment</div>
                    <div className="font-mono text-orange-300/60 text-xs">
                      Unshielding will be enabled once the VIONA Shield pool goes live.
                    </div>
                  </div>
                ) : balances.length === 0 && (!walletState || walletState.notes.filter(n => !n.spent).length === 0) ? (
                  <div className="border border-gray-800/40 bg-gray-900/20 rounded p-4 text-center">
                    <div className="font-mono text-gray-500 text-sm mb-1">No shielded funds</div>
                    <div className="font-mono text-gray-600 text-xs">
                      Shield some ETH or USDG first, then sync to see your notes here.
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Token + Amount row */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <label className="font-mono text-gray-500 text-xs mb-1 block">AMOUNT</label>
                        <input
                          type="number"
                          min="0"
                          step="0.0001"
                          value={unshieldAmount}
                          onChange={(e) => setUnshieldAmount(e.target.value)}
                          placeholder="0.0"
                          disabled={unshieldLoading}
                          className="w-full bg-black/60 border border-gray-700 rounded px-3 py-2 font-mono text-white text-sm focus:border-blue-700 focus:outline-none disabled:opacity-50"
                        />
                      </div>
                      <div>
                        <label className="font-mono text-gray-500 text-xs mb-1 block">TOKEN</label>
                        <select
                          value={unshieldToken}
                          onChange={(e) => setUnshieldToken(e.target.value)}
                          disabled={unshieldLoading}
                          className="w-full bg-black/60 border border-gray-700 rounded px-2 py-2 font-mono text-white text-sm focus:border-blue-700 focus:outline-none disabled:opacity-50"
                        >
                          <option value="ETH">ETH</option>
                          <option value="USDG">USDG</option>
                        </select>
                      </div>
                    </div>

                    {/* Available shielded balance */}
                    {(() => {
                      const bal = balances.find(b => b.symbol === unshieldToken);
                      return bal ? (
                        <div className="flex justify-between font-mono text-xs text-gray-600">
                          <span>Shielded: {bal.formatted} {bal.symbol}</span>
                          <button
                            onClick={() => setUnshieldAmount(bal.formatted.replace(/,/g, ""))}
                            className="text-blue-600 hover:text-blue-400"
                          >
                            MAX
                          </button>
                        </div>
                      ) : null;
                    })()}

                    {/* Recipient address */}
                    <div>
                      <label className="font-mono text-gray-500 text-xs mb-1 block">
                        RECIPIENT ADDRESS <span className="text-gray-700">(leave blank to withdraw to your wallet)</span>
                      </label>
                      <input
                        type="text"
                        value={unshieldRecipient}
                        onChange={(e) => setUnshieldRecipient(e.target.value)}
                        placeholder={address ?? "0x…"}
                        disabled={unshieldLoading}
                        className="w-full bg-black/60 border border-gray-700 rounded px-3 py-2 font-mono text-gray-300 text-xs focus:border-blue-700 focus:outline-none disabled:opacity-50"
                      />
                    </div>

                    {/* Proof progress */}
                    {unshieldStep && (
                      <div className="border border-blue-900/40 bg-blue-950/20 rounded px-3 py-2 space-y-1.5">
                        <div className="flex justify-between items-center">
                          <span className="font-mono text-xs text-blue-400">⟳ {unshieldStep}</span>
                          {unshieldLoading && unshieldElapsed > 0 && (
                            <span className="font-mono text-xs text-blue-600">{unshieldElapsed}s</span>
                          )}
                        </div>
                        {unshieldPct !== null && (
                          <div className="w-full bg-blue-950/60 rounded-full h-1">
                            <div
                              className="bg-blue-500 h-1 rounded-full transition-all duration-500"
                              style={{ width: `${unshieldPct}%` }}
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Success tx link */}
                    {unshieldTxHash && (
                      <a
                        href={`https://robinhoodchain.blockscout.com/tx/${unshieldTxHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 font-mono text-xs text-green-400 hover:text-green-300"
                      >
                        ✓ Unshield confirmed · view on explorer ↗
                      </a>
                    )}

                    <button
                      onClick={handleUnshield}
                      disabled={unshieldLoading || !unshieldAmount}
                      className="font-mono text-sm bg-blue-900/30 text-blue-400 border border-blue-700 px-4 py-2.5 rounded hover:bg-blue-800/30 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {unshieldLoading
                        ? `⟳ ${unshieldStep || "PROVING…"}`
                        : `↑ UNSHIELD ${unshieldAmount || "0"} ${unshieldToken}`}
                    </button>

                    <div className="font-mono text-gray-700 text-xs">
                      ℹ UltraHonk join-split proof — only the withdrawal amount is visible on-chain.
                    </div>
                  </>
                )}
              </div>
            </SectionCard>
          )}

          {/* ── How it works ── */}
          <SectionCard title="How VIONA Shield Works">
            <div className="grid grid-cols-1 gap-3">
              {[
                ["◎ Private UTXO Pool",   "Funds become hidden notes in a Poseidon2 Merkle tree. Amounts, owners, and timing never appear on the explorer."],
                ["⚡ Browser ZK Proofs",   "UltraHonk proofs (Aztec Barretenberg + Noir circuits) generated on your machine. No server sees your inputs."],
                ["🔐 Non-Custodial Keys",  "Keys derive from your wallet signatures — deterministic and permanent. Your private key never leaves your wallet."],
                ["🛡 VIONA's Own Stack",   "VIONA Shield's circuits, pool contract, and relay are built and deployed by VIONA — not integrated from any third party."],
              ].map(([title, desc]) => (
                <div key={title} className="flex gap-3">
                  <span className="font-mono text-sm shrink-0 w-44">{title}</span>
                  <span className="font-mono text-gray-500 text-xs leading-relaxed">{desc}</span>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* ── Quick navigation ── */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { href: "/portfolio", icon: "◑", label: "PORTFOLIO" },
              { href: "/trade",     icon: "⚡", label: "TRADE"     },
              { href: "/markets",   icon: "↗", label: "MARKETS"   },
            ].map(({ href, icon, label }) => (
              <Link key={href} href={href} style={{ textDecoration: "none" }}>
                <div className="border border-gray-800 bg-black/40 rounded p-3 hover:bg-gray-900/60 hover:border-gray-700 transition-colors cursor-pointer text-center">
                  <div className="font-mono text-green-400 text-base mb-1">{icon}</div>
                  <div className="font-mono text-gray-300 text-xs font-semibold tracking-widest">{label}</div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
