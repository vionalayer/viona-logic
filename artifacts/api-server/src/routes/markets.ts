import { Router } from "express";
import { fetchQuote, fetchQuotes, fetchChart } from "../lib/yahoo-finance";
import {
  fetchRobinhoodAssets,
  fetchRobinhoodPrice,
  fetchRobinhoodPrices,
  type RHJAsset,
} from "../lib/robinhood-api";
import type { RHJPrice } from "../lib/robinhood-api";

const router = Router();

// ── Logo proxy ────────────────────────────────────────────────────────────────
// Serve the official Robinhood CDN logo for any symbol.

const logoCache = new Map<string, { buf: Buffer; contentType: string; fetched: number }>();
const LOGO_TTL = 24 * 60 * 60 * 1000; // 24h

router.get("/logo/:symbol", async (req, res) => {
  const symbol = (req.params as { symbol: string }).symbol.toUpperCase();

  const cached = logoCache.get(symbol);
  if (cached && Date.now() - cached.fetched < LOGO_TTL) {
    res.set("Content-Type", cached.contentType);
    res.set("Cache-Control", "public, max-age=86400");
    res.send(cached.buf);
    return;
  }

  const assets = await fetchRobinhoodAssets();
  const asset = assets.get(symbol);
  if (!asset?.logoUrl) {
    res.status(404).end();
    return;
  }

  try {
    const upstream = await fetch(asset.logoUrl, { signal: AbortSignal.timeout(6000) });
    if (!upstream.ok) throw new Error(`upstream ${upstream.status}`);
    const contentType = upstream.headers.get("content-type") ?? "image/png";
    const buf = Buffer.from(await upstream.arrayBuffer());
    logoCache.set(symbol, { buf, contentType, fetched: Date.now() });
    res.set("Content-Type", contentType);
    res.set("Cache-Control", "public, max-age=86400");
    res.send(buf);
  } catch {
    res.status(502).end();
  }
});

// ── Helper: build a market row from RHJ + Yahoo data ────────────────────────

function buildRow(
  asset: RHJAsset,
  yahoo: { regularMarketPrice: number; regularMarketChange: number; regularMarketChangePercent: number; regularMarketVolume: number | null; marketCap: number | null; fiftyTwoWeekHigh: number | null; fiftyTwoWeekLow: number | null; regularMarketOpen?: number | null; regularMarketPreviousClose?: number | null; regularMarketDayHigh?: number | null; regularMarketDayLow?: number | null } | null,
  rhj: RHJPrice | null,
) {
  const midPrice = rhj ? (rhj.bid + rhj.ask) / 2 : null;
  const price = yahoo?.regularMarketPrice ?? midPrice ?? null;
  const change = yahoo?.regularMarketChange ?? null;
  const changePercent = yahoo?.regularMarketChangePercent ?? null;

  return {
    symbol: asset.tokenSymbol,
    name: asset.cleanName,
    assetType: asset.assetType,
    price,
    change,
    changePercent,
    volume: yahoo?.regularMarketVolume ?? null,
    marketCap: yahoo?.marketCap ?? null,
    high52w: yahoo?.fiftyTwoWeekHigh ?? null,
    low52w: yahoo?.fiftyTwoWeekLow ?? null,
    open: yahoo?.regularMarketOpen ?? null,
    previousClose: yahoo?.regularMarketPreviousClose ?? null,
    dayHigh: yahoo?.regularMarketDayHigh ?? null,
    dayLow: yahoo?.regularMarketDayLow ?? null,
    bid: rhj?.bid ?? null,
    ask: rhj?.ask ?? null,
    logoUrl: asset.logoUrl,
    contractAddress: asset.contractAddress,
    currentMultiplier: asset.currentMultiplier,
    tradingCapabilities: asset.tradingCapabilities,
    isTradingHalt: rhj?.isTradingHalt ?? false,
  };
}

// ── GET /markets/corporate-actions ────────────────────────────────────────────
let corpActionsCache: { data: unknown[]; expiresAt: number } | null = null;
const CORP_TTL_MS = 5 * 60 * 1000;

router.get("/corporate-actions", async (req, res) => {
  if (corpActionsCache && corpActionsCache.expiresAt > Date.now()) {
    res.json(corpActionsCache.data);
    return;
  }
  try {
    const r = await fetch("https://api.robinhood.com/rhj/corporate-actions", {
      headers: { "User-Agent": "VIONA-Layer/1.0", Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) {
      res.status(r.status).json([]);
      return;
    }
    const json = (await r.json()) as { corporateActions?: unknown[]; actions?: unknown[] };
    const data = json.corporateActions ?? json.actions ?? [];
    corpActionsCache = { data, expiresAt: Date.now() + CORP_TTL_MS };
    res.json(data);
  } catch {
    res.json(corpActionsCache?.data ?? []);
  }
});

// ── GET /markets ──────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  const assets = await fetchRobinhoodAssets();
  const symbols = Array.from(assets.keys());

  const [yahooQuotes, rhjPrices] = await Promise.all([
    fetchQuotes(symbols),
    fetchRobinhoodPrices(symbols),
  ]);

  const yahooMap = new Map(yahooQuotes.map((q) => [q.symbol, q]));

  const markets = symbols
    .map((sym) => buildRow(assets.get(sym)!, yahooMap.get(sym) ?? null, rhjPrices.get(sym) ?? null))
    .filter((r) => r.price !== null && r.price > 0);

  // Sort: stocks first (alphabetical), then ETFs, then treasury
  markets.sort((a, b) => {
    const order = { STOCK: 0, ETF: 1, TREASURY: 2 };
    const typeSort = order[a.assetType as keyof typeof order] - order[b.assetType as keyof typeof order];
    if (typeSort !== 0) return typeSort;
    return a.symbol.localeCompare(b.symbol);
  });

  res.json(markets);
});

// ── GET /markets/movers ────────────────────────────────────────────────────────
router.get("/movers", async (req, res) => {
  const assets = await fetchRobinhoodAssets();
  const symbols = Array.from(assets.keys());

  const [yahooQuotes, rhjPrices] = await Promise.all([
    fetchQuotes(symbols),
    fetchRobinhoodPrices(symbols),
  ]);

  const yahooMap = new Map(yahooQuotes.map((q) => [q.symbol, q]));

  // Only include rows where we have actual price data (not zero)
  const rows = symbols
    .map((sym) => buildRow(assets.get(sym)!, yahooMap.get(sym) ?? null, rhjPrices.get(sym) ?? null))
    .filter((r) => r.price !== null && r.price > 0 && r.changePercent !== null && r.changePercent !== 0);

  const byGain = [...rows].sort((a, b) => (b.changePercent ?? 0) - (a.changePercent ?? 0));
  const gainers = byGain.slice(0, 5);
  const losers  = byGain.slice(-5).reverse();

  res.json({ gainers, losers });
});

// ── GET /markets/:symbol ──────────────────────────────────────────────────────
router.get("/:symbol", async (req, res) => {
  const sym = (req.params as { symbol: string }).symbol.toUpperCase();
  const assets = await fetchRobinhoodAssets();
  const asset = assets.get(sym);

  if (!asset) {
    res.status(404).json({ error: "Asset not found on Robinhood Chain" });
    return;
  }

  const [yahoo, rhj] = await Promise.all([
    fetchQuote(asset.tokenSymbol),
    fetchRobinhoodPrice(asset.tokenSymbol),
  ]);

  res.json(buildRow(asset, yahoo, rhj));
});

// ── GET /markets/:symbol/chart/:range ─────────────────────────────────────────
router.get("/:symbol/chart/:range", async (req, res) => {
  const { symbol, range } = req.params as { symbol: string; range: string };
  const sym = symbol.toUpperCase();
  const assets = await fetchRobinhoodAssets();
  const asset = assets.get(sym);

  if (!asset) {
    res.status(404).json({ error: "Asset not found on Robinhood Chain" });
    return;
  }

  const points = await fetchChart(asset.tokenSymbol, range);
  res.json({ symbol: asset.tokenSymbol, range, points });
});

export default router;
