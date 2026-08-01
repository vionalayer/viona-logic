import { logger } from "./logger";

const RHJ_BASE = "https://api.robinhood.com/rhj";
const RHN_CHAIN_ID = 4663;

// ── Asset-type detection ──────────────────────────────────────────────────────

// Only symbols actually present on Robinhood Chain
const TREASURY_SYMBOLS = new Set(["SGOV"]);
const ETF_KEYWORDS = [
  "ETF", "Fund", "Trust", "iShares", "SPDR", "Invesco",
  "State Street", "United States Oil", "iShares MSCI",
];

export function cleanTokenName(tokenName: string): string {
  return tokenName.replace(/ • Robinhood Token$/i, "").trim();
}

export function detectAssetType(symbol: string, tokenName: string): "STOCK" | "ETF" | "TREASURY" {
  if (TREASURY_SYMBOLS.has(symbol)) return "TREASURY";
  const clean = cleanTokenName(tokenName);
  if (ETF_KEYWORDS.some((k) => clean.includes(k))) return "ETF";
  return "STOCK";
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface TradingCapabilities {
  market: boolean;    // regular hours 9:30am–4pm ET
  extended: boolean;  // pre/post market 4am–9:30am & 4pm–8pm ET
  overnight: boolean; // 24/7 continuous trading
}

export interface RHJAsset {
  tokenSymbol: string;
  tokenName: string;        // raw from API (includes " • Robinhood Token")
  cleanName: string;        // stripped display name
  assetType: "STOCK" | "ETF" | "TREASURY";
  contractAddress: string;  // on chain 4663
  logoUrl: string;          // cdn.robinhood.com/ncw_assets/logos/<addr>.png
  currentMultiplier: number; // corporate action multiplier (1.0 = no adjustment)
  status: string;
  tradingCapabilities: TradingCapabilities; // which sessions this token can trade
}

export interface RHJPrice {
  bid: number;
  ask: number;
  dailyTradingVolume: number;
  isTradingHalt: boolean;
}

// ── In-memory caches ─────────────────────────────────────────────────────────

let assetsCache: { map: Map<string, RHJAsset>; expiresAt: number } | null = null;
const ASSETS_TTL_MS = 5 * 60 * 1000; // 5 min (asset list is stable)

const priceCache = new Map<string, { data: RHJPrice; expiresAt: number }>();
const PRICE_TTL_MS = 15 * 1000; // 15 s — matches RHJ cache window

// ── /assets ──────────────────────────────────────────────────────────────────

export async function fetchRobinhoodAssets(): Promise<Map<string, RHJAsset>> {
  if (assetsCache && assetsCache.expiresAt > Date.now()) {
    return assetsCache.map;
  }

  try {
    const res = await fetch(`${RHJ_BASE}/assets`, {
      headers: { "User-Agent": "VIONA-Layer/1.0", Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      logger.warn({ status: res.status }, "Robinhood /assets returned non-200");
      return assetsCache?.map ?? new Map();
    }

    const json = (await res.json()) as { assets?: unknown[] };
    const assets = (json.assets ?? []) as Array<{
      tokenSymbol: string;
      tokenName: string;
      deployments: Array<{ contractAddress: string; chainId: number }>;
      currentMultiplier: string;
      logoUrl: string;
      status: string;
      tradingCapabilities?: {
        market?: boolean;
        extended?: boolean;
        overnight?: boolean;
      };
    }>;

    const map = new Map<string, RHJAsset>();
    for (const a of assets) {
      if (a.status !== "ASSET_STATUS_ACTIVE") continue;
      // Pick the deployment on Robinhood Chain (4663); fall back to first
      const dep =
        a.deployments.find((d) => d.chainId === RHN_CHAIN_ID) ??
        a.deployments[0];
      if (!dep) continue;

      map.set(a.tokenSymbol.toUpperCase(), {
        tokenSymbol: a.tokenSymbol,
        tokenName: a.tokenName,
        cleanName: cleanTokenName(a.tokenName),
        assetType: detectAssetType(a.tokenSymbol, a.tokenName),
        contractAddress: dep.contractAddress,
        logoUrl:
          a.logoUrl ||
          `https://cdn.robinhood.com/ncw_assets/logos/${dep.contractAddress.toLowerCase()}.png`,
        currentMultiplier: parseFloat(a.currentMultiplier) || 1,
        status: a.status,
        tradingCapabilities: {
          market:   a.tradingCapabilities?.market   ?? true,
          extended: a.tradingCapabilities?.extended ?? false,
          overnight: a.tradingCapabilities?.overnight ?? false,
        },
      });
    }

    assetsCache = { map, expiresAt: Date.now() + ASSETS_TTL_MS };
    logger.info({ count: map.size }, "Robinhood assets loaded");
    return map;
  } catch (err) {
    logger.warn({ err }, "Failed to fetch Robinhood assets");
    return assetsCache?.map ?? new Map();
  }
}

// ── /prices/{symbol} ─────────────────────────────────────────────────────────

export async function fetchRobinhoodPrice(symbol: string): Promise<RHJPrice | null> {
  const key = symbol.toUpperCase();
  const cached = priceCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  try {
    const res = await fetch(`${RHJ_BASE}/prices/${encodeURIComponent(key)}`, {
      headers: { "User-Agent": "VIONA-Layer/1.0", Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      logger.warn({ symbol: key, status: res.status }, "Robinhood /prices returned non-200");
      return null;
    }

    const json = (await res.json()) as {
      quotes?: Array<{
        tokenSymbol: string;
        bid: string;
        ask: string;
        dailyTradingVolume: string;
        isTradingHalt: boolean;
      }>;
    };

    const quote = json.quotes?.[0];
    if (!quote) return null;

    const data: RHJPrice = {
      bid: parseFloat(quote.bid) || 0,
      ask: parseFloat(quote.ask) || 0,
      dailyTradingVolume: parseFloat(quote.dailyTradingVolume) || 0,
      isTradingHalt: quote.isTradingHalt ?? false,
    };

    priceCache.set(key, { data, expiresAt: Date.now() + PRICE_TTL_MS });
    return data;
  } catch (err) {
    logger.warn({ symbol: key, err }, "Failed to fetch Robinhood price");
    return null;
  }
}

// ── Batch prices ─────────────────────────────────────────────────────────────

export async function fetchRobinhoodPrices(
  symbols: string[]
): Promise<Map<string, RHJPrice>> {
  const results = await Promise.allSettled(
    symbols.map(async (s) => ({ symbol: s, price: await fetchRobinhoodPrice(s) }))
  );
  const map = new Map<string, RHJPrice>();
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.price) {
      map.set(r.value.symbol.toUpperCase(), r.value.price);
    }
  }
  return map;
}
