/**
 * VIONA Trader — React hooks for VIONATrader + VIONAPriceFeed on Robinhood Chain.
 * Uses viem + wagmi for all on-chain interactions.
 */
import { useState, useEffect, useCallback } from "react";
import { useAccount, usePublicClient, useWalletClient, useChainId } from "wagmi";
import { parseUnits, formatUnits, type Address } from "viem";

// ── Contract addresses (set after deployment) ────────────────────────────────
// Loaded dynamically from /trader-addresses.json to avoid hardcoding.

export type TraderAddresses = {
  priceFeed: Address;
  trader:    Address;
  usdg:      Address;
};

let _addrs: TraderAddresses | null = null;

export async function loadTraderAddresses(): Promise<TraderAddresses | null> {
  if (_addrs) return _addrs;
  try {
    // Use BASE_URL so the path is correct regardless of deployment prefix.
    const base = (import.meta.env.BASE_URL as string | undefined) ?? "/";
    const url  = `${base}trader-addresses.json`.replace(/\/\//g, "/");
    const res  = await fetch(url);
    if (!res.ok) return null;
    const j = await res.json();
    if (!j.priceFeed || !j.trader) return null;
    _addrs = { priceFeed: j.priceFeed as Address, trader: j.trader as Address, usdg: j.usdg as Address };
    return _addrs;
  } catch {
    return null;
  }
}

// ── ABIs ─────────────────────────────────────────────────────────────────────

const TRADER_ABI = [
  {
    name: "openPosition",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "symbol",     type: "string"  },
      { name: "usdgAmount", type: "uint256" },
      { name: "isLong",     type: "bool"    },
    ],
    outputs: [{ name: "positionId", type: "uint256" }],
  },
  {
    name: "closePosition",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "positionId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "getPositionIds",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_owner", type: "address" }],
    outputs: [{ name: "", type: "uint256[]" }],
  },
  {
    name: "positions",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "owner",          type: "address" },
      { name: "symbol",         type: "string"  },
      { name: "usdgCollateral", type: "uint256" },
      { name: "entryPrice",     type: "uint256" },
      { name: "shares",         type: "uint256" },
      { name: "isLong",         type: "bool"    },
      { name: "openTime",       type: "uint256" },
      { name: "closed",         type: "bool"    },
    ],
  },
  {
    name: "unrealisedPnl",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "positionId", type: "uint256" }],
    outputs: [
      { name: "pnl",          type: "int256"  },
      { name: "currentPrice", type: "uint256" },
    ],
  },
  {
    name: "FEE_BPS",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "PositionOpened",
    type: "event",
    inputs: [
      { name: "id",             type: "uint256", indexed: true  },
      { name: "owner",          type: "address", indexed: true  },
      { name: "symbol",         type: "string",  indexed: false },
      { name: "isLong",         type: "bool",    indexed: false },
      { name: "usdgCollateral", type: "uint256", indexed: false },
      { name: "entryPrice",     type: "uint256", indexed: false },
      { name: "shares",         type: "uint256", indexed: false },
    ],
  },
  {
    name: "PositionClosed",
    type: "event",
    inputs: [
      { name: "id",           type: "uint256", indexed: true  },
      { name: "owner",        type: "address", indexed: true  },
      { name: "symbol",       type: "string",  indexed: false },
      { name: "isLong",       type: "bool",    indexed: false },
      { name: "entryPrice",   type: "uint256", indexed: false },
      { name: "exitPrice",    type: "uint256", indexed: false },
      { name: "pnl",          type: "int256",  indexed: false },
      { name: "usdgReturned", type: "uint256", indexed: false },
    ],
  },
] as const;

const ERC20_ABI = [
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export type OnChainPosition = {
  id:            bigint;
  owner:         Address;
  symbol:        string;
  usdgCollateral: number;   // in USD
  entryPrice:    number;    // in USD
  shares:        number;    // 18-dec normalized
  isLong:        boolean;
  openTime:      number;    // unix seconds
  closed:        boolean;
  unrealisedPnl?: number;   // in USD, populated async
  currentPrice?:  number;
};

type TradeStep = "idle" | "approving" | "opening" | "done" | "closing";

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useVIONATrader() {
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [addrs, setAddrs] = useState<TraderAddresses | null>(null);
  const [positions, setPositions] = useState<OnChainPosition[]>([]);
  const [step, setStep] = useState<TradeStep>("idle");
  const [error, setError] = useState("");
  const [lastTxHash, setLastTxHash] = useState<string>("");

  // Load contract addresses
  useEffect(() => {
    loadTraderAddresses().then(setAddrs);
  }, []);

  // Load positions
  const refreshPositions = useCallback(async () => {
    if (!address || !addrs || !publicClient) return;
    try {
      const ids = await publicClient.readContract({
        address: addrs.trader,
        abi: TRADER_ABI,
        functionName: "getPositionIds",
        args: [address],
      }) as bigint[];

      const posData = await Promise.all(
        ids.map(id =>
          publicClient.readContract({
            address: addrs.trader,
            abi: TRADER_ABI,
            functionName: "positions",
            args: [id],
          }).then(r => {
            const [owner, symbol, usdgCollateral, entryPrice, shares, isLong, openTime, closed] = r as [Address, string, bigint, bigint, bigint, boolean, bigint, boolean];
            return {
              id,
              owner,
              symbol,
              usdgCollateral: Number(usdgCollateral) / 1e6,
              entryPrice:     Number(entryPrice) / 1e6,
              shares:         Number(shares) / 1e18,
              isLong,
              openTime:       Number(openTime),
              closed,
            } as OnChainPosition;
          })
        )
      );

      // Fetch unrealised P&L for open positions
      const enriched = await Promise.all(
        posData.map(async pos => {
          if (pos.closed) return pos;
          try {
            const [pnlRaw, priceRaw] = await publicClient.readContract({
              address: addrs.trader,
              abi: TRADER_ABI,
              functionName: "unrealisedPnl",
              args: [pos.id],
            }) as [bigint, bigint];
            return {
              ...pos,
              unrealisedPnl: Number(pnlRaw) / 1e6,
              currentPrice:  Number(priceRaw) / 1e6,
            };
          } catch {
            return pos;
          }
        })
      );

      setPositions(enriched.reverse()); // newest first
    } catch (e) {
      console.warn("useVIONATrader: failed to load positions", e);
    }
  }, [address, addrs, publicClient]);

  useEffect(() => {
    refreshPositions();
  }, [refreshPositions]);

  /**
   * Open a position: approve USDG → openPosition()
   * @param symbol   Ticker, e.g. "AAPL"
   * @param usdgUsd  Amount in USD (e.g. 100.00)
   * @param isLong   True = long
   */
  const openPosition = useCallback(async (
    symbol: string,
    usdgUsd: number,
    isLong: boolean,
  ): Promise<string> => {
    if (!address || !addrs || !publicClient || !walletClient) throw new Error("Wallet not connected");
    if (chainId !== 4663) throw new Error("Switch to Robinhood Chain");

    setError("");
    const usdgAmount = parseUnits(usdgUsd.toFixed(6), 6);

    // Step 1: check allowance
    const allowance = await publicClient.readContract({
      address: addrs.usdg,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [address, addrs.trader],
    }) as bigint;

    if (allowance < usdgAmount) {
      setStep("approving");
      const approveTx = await walletClient.writeContract({
        address: addrs.usdg,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [addrs.trader, usdgAmount],
        account: address,
        chain: walletClient.chain,
      });
      await publicClient.waitForTransactionReceipt({ hash: approveTx });
    }

    // Step 2: open position
    setStep("opening");
    const tx = await walletClient.writeContract({
      address: addrs.trader,
      abi: TRADER_ABI,
      functionName: "openPosition",
      args: [symbol, usdgAmount, isLong],
      account: address,
      chain: walletClient.chain,
    });

    await publicClient.waitForTransactionReceipt({ hash: tx });
    setLastTxHash(tx);
    setStep("done");
    await refreshPositions();
    return tx;
  }, [address, addrs, publicClient, walletClient, chainId, refreshPositions]);

  /**
   * Close an open position and realise P&L.
   */
  const closePosition = useCallback(async (positionId: bigint): Promise<string> => {
    if (!address || !addrs || !publicClient || !walletClient) throw new Error("Wallet not connected");

    setStep("closing");
    setError("");
    const tx = await walletClient.writeContract({
      address: addrs.trader,
      abi: TRADER_ABI,
      functionName: "closePosition",
      args: [positionId],
      account: address,
      chain: walletClient.chain,
    });
    await publicClient.waitForTransactionReceipt({ hash: tx });
    setLastTxHash(tx);
    setStep("idle");
    await refreshPositions();
    return tx;
  }, [address, addrs, publicClient, walletClient, refreshPositions]);

  const resetStep = useCallback(() => { setStep("idle"); setError(""); setLastTxHash(""); }, []);

  return {
    addrs,
    isDeployed: !!addrs,
    positions,
    step,
    error,
    lastTxHash,
    openPosition,
    closePosition,
    refreshPositions,
    resetStep,
    setError,
  };
}
