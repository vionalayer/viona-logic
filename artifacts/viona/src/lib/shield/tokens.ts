// Token registry for VIONA Shield on Robinhood Chain mainnet.
// ETH field element is 0; every ERC-20 uses its checksummed address cast to a field element.
export type TokenInfo = {
  symbol: string;
  field: bigint;
  address: `0x${string}` | null; // null for native ETH
  decimals: number;
  name: string;
};

function addrToField(addr: `0x${string}`): bigint {
  return BigInt(addr);
}

const LIST: TokenInfo[] = [
  {
    symbol: "ETH",
    field: 0n,
    address: null,
    decimals: 18,
    name: "Ether",
  },
  {
    symbol: "WETH",
    field: addrToField("0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73"),
    address: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
    decimals: 18,
    name: "Wrapped Ether",
  },
  {
    symbol: "USDG",
    field: addrToField("0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168"),
    address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
    decimals: 6,
    name: "Global Dollar",
  },
];

export const TOKENS_BY_SYMBOL  = new Map(LIST.map((t) => [t.symbol, t]));
export const TOKENS_BY_FIELD   = new Map(LIST.map((t) => [t.field, t]));
export const TOKENS_BY_ADDRESS = new Map(
  LIST.filter((t) => t.address).map((t) => [t.address!.toLowerCase(), t]),
);

export const ALL_TOKENS = LIST;

export function tokenBySymbol(symbol: string): TokenInfo | undefined {
  return TOKENS_BY_SYMBOL.get(symbol.toUpperCase());
}

export function tokenByField(field: bigint): TokenInfo | undefined {
  return TOKENS_BY_FIELD.get(field);
}

export function symbolField(symbol: string): bigint | null {
  return tokenBySymbol(symbol)?.field ?? null;
}

export function fieldSymbol(field: bigint): string | null {
  return tokenByField(field)?.symbol ?? null;
}

/** Format a raw bigint balance using the token's decimals. */
export function formatTokenAmount(amount: bigint, decimals: number, precision = 4): string {
  const divisor = 10n ** BigInt(decimals);
  const whole   = amount / divisor;
  const frac    = amount % divisor;
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, precision);
  return `${whole}.${fracStr}`;
}
