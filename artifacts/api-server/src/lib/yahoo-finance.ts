import { logger } from "./logger";

export interface YahooQuote {
  symbol: string;
  shortName: string;
  longName: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketVolume: number | null;
  marketCap: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  regularMarketOpen: number | null;
  regularMarketPreviousClose: number | null;
  regularMarketDayHigh: number | null;
  regularMarketDayLow: number | null;
}

export interface YahooChartPoint {
  timestamp: string;
  price: number;
  volume: number | null;
}

const CACHE_TTL_MS = 30 * 1000; // 30 seconds
const cache = new Map<string, { data: unknown; expiresAt: number }>();

function getCache<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && entry.expiresAt > Date.now()) {
    return entry.data as T;
  }
  return null;
}

function setCache(key: string, data: unknown, ttlMs = CACHE_TTL_MS) {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

/** Parse one result from the v8 chart API meta field into YahooQuote */
function parseV8Meta(meta: Record<string, unknown>, symbol: string): YahooQuote {
  const price = Number(meta.regularMarketPrice ?? 0);
  const prev = Number(meta.previousClose ?? meta.chartPreviousClose ?? 0);
  return {
    symbol: String(meta.symbol ?? symbol),
    shortName: String(meta.shortName ?? meta.symbol ?? symbol),
    longName: String(meta.longName ?? meta.shortName ?? symbol),
    regularMarketPrice: price,
    regularMarketChange: prev !== 0 ? price - prev : 0,
    regularMarketChangePercent: prev !== 0 ? ((price - prev) / prev) * 100 : 0,
    regularMarketVolume: meta.regularMarketVolume != null ? Number(meta.regularMarketVolume) : null,
    marketCap: meta.marketCap != null ? Number(meta.marketCap) : null,
    fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh != null ? Number(meta.fiftyTwoWeekHigh) : null,
    fiftyTwoWeekLow: meta.fiftyTwoWeekLow != null ? Number(meta.fiftyTwoWeekLow) : null,
    regularMarketOpen: meta.regularMarketOpen != null ? Number(meta.regularMarketOpen) : null,
    regularMarketPreviousClose: prev !== 0 ? prev : null,
    regularMarketDayHigh: meta.regularMarketDayHigh != null ? Number(meta.regularMarketDayHigh) : null,
    regularMarketDayLow: meta.regularMarketDayLow != null ? Number(meta.regularMarketDayLow) : null,
  };
}

export async function fetchQuote(symbol: string): Promise<YahooQuote | null> {
  const cacheKey = `quote:${symbol}`;
  const cached = getCache<YahooQuote>(cacheKey);
  if (cached) return cached;

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      logger.warn({ symbol, status: res.status }, "Yahoo Finance v8 returned non-200");
      return null;
    }
    const json = (await res.json()) as Record<string, unknown>;
    const result = (json as { chart?: { result?: unknown[] } })?.chart?.result?.[0] as Record<string, unknown> | undefined;
    if (!result) return null;
    const meta = result.meta as Record<string, unknown>;
    const quote = parseV8Meta(meta, symbol);
    setCache(cacheKey, quote);
    return quote;
  } catch (err) {
    logger.warn({ symbol, err }, "Failed to fetch Yahoo Finance quote");
    return null;
  }
}

export async function fetchQuotes(symbols: string[]): Promise<YahooQuote[]> {
  const results = await Promise.allSettled(symbols.map((s) => fetchQuote(s)));
  return results
    .map((r) => (r.status === "fulfilled" ? r.value : null))
    .filter((q): q is YahooQuote => q !== null);
}

export async function fetchChart(symbol: string, range: string): Promise<YahooChartPoint[]> {
  const validRanges: Record<string, string> = {
    "1d": "1d",
    "5d": "5d",
    "1mo": "1mo",
    "3mo": "3mo",
    "1y": "1y",
  };
  const safeRange = validRanges[range] ?? "1d";
  const interval = safeRange === "1d" ? "5m" : safeRange === "5d" ? "30m" : "1d";

  const cacheKey = `chart:${symbol}:${safeRange}`;
  const cached = getCache<YahooChartPoint[]>(cacheKey);
  if (cached) return cached;

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${safeRange}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return [];

    const json = (await res.json()) as Record<string, unknown>;
    const result = (json as { chart?: { result?: unknown[] } })?.chart?.result?.[0] as Record<string, unknown> | undefined;
    if (!result) return [];

    const timestamps = (result.timestamp as number[] | undefined) ?? [];
    const closePrices = ((result.indicators as Record<string, unknown>)?.quote as Record<string, unknown>[])?.[0]?.close as (number | null)[] ?? [];
    const volumes = ((result.indicators as Record<string, unknown>)?.quote as Record<string, unknown>[])?.[0]?.volume as (number | null)[] ?? [];

    const points: YahooChartPoint[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const price = closePrices[i];
      if (price == null || price === 0) continue;
      points.push({
        timestamp: new Date(timestamps[i] * 1000).toISOString(),
        price,
        volume: volumes[i] ?? null,
      });
    }

    const ttl = safeRange === "1d" ? 60 * 1000 : 5 * 60 * 1000;
    setCache(cacheKey, points, ttl);
    return points;
  } catch (err) {
    logger.warn({ symbol, range, err }, "Failed to fetch Yahoo Finance chart");
    return [];
  }
}
