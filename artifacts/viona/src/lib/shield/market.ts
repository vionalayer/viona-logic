// VIONA Shield — market price feeds via Uniswap V3 Quoter on Robinhood Chain.
import { formatUnits } from "viem";
import type { Address } from "viem";
import { publicClient, CONTRACTS, QUOTER_ABI } from "./contract.js";

export type MarketPrice = {
  symbol: string;
  priceUsdg: number | null; // price of 1 unit in USDG
};

const FEE_TIERS = [100, 500, 3000, 10000] as const;

async function quoteAcrossTiers(
  tokenIn: Address,
  tokenOut: Address,
  decimalsIn: number,
  decimalsOut: number,
): Promise<number | null> {
  const client   = publicClient();
  const amountIn = 10n ** BigInt(decimalsIn);

  const results = await Promise.all(
    FEE_TIERS.map(async (fee) => {
      try {
        const { result } = await client.simulateContract({
          address: CONTRACTS.quoter,
          abi: QUOTER_ABI,
          functionName: "quoteExactInputSingle",
          args: [{ tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: 0n }],
        });
        const out = Number(formatUnits(result[0], decimalsOut));
        return isFinite(out) && out > 0 ? out : null;
      } catch {
        return null;
      }
    }),
  );

  const valid = results.filter((r): r is number => r !== null);
  if (valid.length === 0) return null;
  const sorted = [...valid].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Get live ETH price in USDG from the Uniswap V3 pool on Robinhood Chain. */
export async function getEthPrice(): Promise<number | null> {
  try {
    return await quoteAcrossTiers(CONTRACTS.weth, CONTRACTS.usdg, 18, 6);
  } catch {
    return null;
  }
}

/** Get live USDG price (always ~1 by definition — useful for sanity checks). */
export async function getUsdgPrice(): Promise<number | null> {
  return 1.0;
}
