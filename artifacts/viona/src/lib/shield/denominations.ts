// Fixed denominations for VIONA Shield's privacy boundary.
// Amounts cross the shield boundary in shared tiers so no single amount is a fingerprint.

/** Tier exponents relative to one whole token (10^decimals base units). */
const TIER_STEPS = [6, 5, 4, 3, 2, 1, 0, -1, -2, -3] as const;

/** Maximum boundary transactions one shield/unshield may fan into. */
export const MAX_BOUNDARY_TXS = 12;

/** The denomination ladder for a token, largest first, in base units. */
export function tiersFor(decimals: number): bigint[] {
  return TIER_STEPS.map((step) => decimals + step)
    .filter((exp) => exp >= 0)
    .map((exp) => 10n ** BigInt(exp));
}

/** The most that can cross in shared denominations at all. */
export function sharedCeiling(decimals: number): bigint {
  const top = tiersFor(decimals)[0] ?? 0n;
  return top * BigInt(MAX_BOUNDARY_TXS);
}

export type Decomposition = {
  /** Tier-sized parts, largest first — one boundary transaction each. */
  parts: bigint[];
  /** Remainder below the smallest tier. */
  remainder: bigint;
};

/** Greedy largest-first split of `value` into denomination parts. */
export function decompose(value: bigint, decimals: number): Decomposition {
  const tiers = tiersFor(decimals);
  const parts: bigint[] = [];
  let remaining = value;

  for (const tier of tiers) {
    while (remaining >= tier && parts.length < MAX_BOUNDARY_TXS) {
      parts.push(tier);
      remaining -= tier;
    }
  }

  return { parts, remainder: remaining };
}

/** Pick the best single denomination for a UI suggestion. */
export function suggestDenomination(value: bigint, decimals: number): bigint {
  const tiers = tiersFor(decimals);
  return tiers.find((t) => t <= value) ?? tiers[tiers.length - 1] ?? 1n;
}
