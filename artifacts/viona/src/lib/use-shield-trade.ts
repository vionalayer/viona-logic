/**
 * useShieldTrade — hook for opening VIONATrader positions funded directly
 * from the VIONA Shield pool (ZK proof → pool → trader atomically).
 *
 * The proof is generated with publicRecipient = CONTRACTS.trader so the
 * ShieldedPool sends USDG straight to VIONATrader without touching the wallet.
 */
import { useState, useCallback } from "react";
import { useAccount, useWalletClient, useChainId } from "wagmi";
import { usePublicClient } from "wagmi";
import type { Address } from "viem";
import { CONTRACTS } from "./shield/contract";
import { loadTraderAddresses } from "./use-trader";

// ── Minimal ABI for VIONATrader v2 shield-funded functions ───────────────────

const SHIELDED_OPEN_ABI = [
  {
    name: "openShieldedPosition",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "s",
        type: "tuple",
        components: [
          { name: "membershipRoot", type: "bytes32"    },
          { name: "nullifiers",     type: "bytes32[2]" },
          { name: "commitments",    type: "bytes32[2]" },
          { name: "newRoot",        type: "bytes32"    },
          { name: "token",          type: "uint256"    },
          { name: "value",          type: "uint256"    },
          { name: "fee",            type: "uint256"    },
          { name: "recipient",      type: "address"    },
          { name: "relayer",        type: "address"    },
        ],
      },
      { name: "ciphertexts", type: "bytes[2]" },
      { name: "proof",       type: "bytes"    },
      { name: "symbol",      type: "string"   },
      { name: "isLong",      type: "bool"     },
    ],
    outputs: [{ name: "positionId", type: "uint256" }],
  },
  {
    name: "swapShielded",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "s",
        type: "tuple",
        components: [
          { name: "membershipRoot", type: "bytes32"    },
          { name: "nullifiers",     type: "bytes32[2]" },
          { name: "commitments",    type: "bytes32[2]" },
          { name: "newRoot",        type: "bytes32"    },
          { name: "token",          type: "uint256"    },
          { name: "value",          type: "uint256"    },
          { name: "fee",            type: "uint256"    },
          { name: "recipient",      type: "address"    },
          { name: "relayer",        type: "address"    },
        ],
      },
      { name: "ciphertexts", type: "bytes[2]" },
      { name: "proof",       type: "bytes"    },
      { name: "symbol",      type: "string"   },
    ],
    outputs: [{ name: "positionId", type: "uint256" }],
  },
] as const;

// Explicit gas cap for ZK-verify + CFD open/swap transactions.
// UltraHonk proof verification + position logic uses ~2–3M gas.
// Without this, MetaMask tries eth_estimateGas which can fail on complex
// ZK-verify calls and disables the Confirm button entirely.
const GAS_LIMIT = 4_000_000n;

// ── Types ────────────────────────────────────────────────────────────────────

export type SpendStatementArgs = {
  membershipRoot: `0x${string}`;
  nullifiers:    [`0x${string}`, `0x${string}`];
  commitments:   [`0x${string}`, `0x${string}`];
  newRoot:       `0x${string}`;
  token:         bigint;
  value:         bigint;
  fee:           bigint;
  recipient:     Address;
  relayer:       Address;
};

export type ShieldTradeStep =
  | "idle"
  | "proving"       // ZK proof being generated
  | "submitting"    // MetaMask waiting for sig
  | "confirming"    // tx broadcast, waiting for receipt
  | "done"
  | "error";

export function useShieldTrade() {
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [step, setStep] = useState<ShieldTradeStep>("idle");
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState("");

  /** Submit a pre-built spend statement + proof to openShieldedPosition() */
  const openShieldedPosition = useCallback(async (
    s: SpendStatementArgs,
    ciphertexts: [`0x${string}`, `0x${string}`],
    proof: `0x${string}`,
    symbol: string,
    isLong: boolean,
  ): Promise<string> => {
    if (!address || !publicClient || !walletClient) throw new Error("Wallet not connected");
    if (chainId !== 4663) throw new Error("Switch to Robinhood Chain");

    const addrs = await loadTraderAddresses();
    if (!addrs) throw new Error("Trader contract not deployed");

    setStep("submitting");
    setError("");

    const tx = await walletClient.writeContract({
      address: addrs.trader,
      abi: SHIELDED_OPEN_ABI,
      functionName: "openShieldedPosition",
      args: [s, ciphertexts, proof, symbol, isLong],
      account: address,
      chain: walletClient.chain,
      gas: GAS_LIMIT,
    });

    setStep("confirming");
    await publicClient.waitForTransactionReceipt({ hash: tx });
    setTxHash(tx);
    setStep("done");
    return tx;
  }, [address, chainId, publicClient, walletClient]);

  /** Submit a pre-built spend statement + proof to swapShielded() */
  const swapShielded = useCallback(async (
    s: SpendStatementArgs,
    ciphertexts: [`0x${string}`, `0x${string}`],
    proof: `0x${string}`,
    symbol: string,
  ): Promise<string> => {
    if (!address || !publicClient || !walletClient) throw new Error("Wallet not connected");
    if (chainId !== 4663) throw new Error("Switch to Robinhood Chain");

    const addrs = await loadTraderAddresses();
    if (!addrs) throw new Error("Trader contract not deployed");

    setStep("submitting");
    setError("");

    const tx = await walletClient.writeContract({
      address: addrs.trader,
      abi: SHIELDED_OPEN_ABI,
      functionName: "swapShielded",
      args: [s, ciphertexts, proof, symbol],
      account: address,
      chain: walletClient.chain,
      gas: GAS_LIMIT,
    });

    setStep("confirming");
    await publicClient.waitForTransactionReceipt({ hash: tx });
    setTxHash(tx);
    setStep("done");
    return tx;
  }, [address, chainId, publicClient, walletClient]);

  const reset = useCallback(() => {
    setStep("idle");
    setTxHash("");
    setError("");
  }, []);

  return {
    step,
    txHash,
    error,
    setError,
    setStep,
    openShieldedPosition,
    swapShielded,
    reset,
    /** The address that must be set as s.recipient in the spend statement */
    traderAddress: CONTRACTS.trader as Address,
  };
}
