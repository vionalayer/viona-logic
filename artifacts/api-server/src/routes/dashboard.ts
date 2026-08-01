import { Router } from "express";
import { db, positionsTable, walletsTable, ordersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { fetchQuotes } from "../lib/yahoo-finance";
import { fetchRobinhoodAssets } from "../lib/robinhood-api";

const DEFAULT_USER_ID = 1;
const router = Router();

router.get("/", async (req, res) => {
  const [wallet, positions, recentOrdersRaw, totalOrdersRaw] = await Promise.all([
    db.select().from(walletsTable).where(eq(walletsTable.userId, DEFAULT_USER_ID)).then((r) => r[0]),
    db.select().from(positionsTable).where(eq(positionsTable.userId, DEFAULT_USER_ID)),
    db.select().from(ordersTable).where(eq(ordersTable.userId, DEFAULT_USER_ID)).orderBy(desc(ordersTable.createdAt)).limit(5),
    db.select().from(ordersTable).where(eq(ordersTable.userId, DEFAULT_USER_ID)),
  ]);

  const [positionQuotes, rhjAssets] = await Promise.all([
    positions.length > 0 ? fetchQuotes(positions.map((p) => p.symbol)) : Promise.resolve([]),
    fetchRobinhoodAssets(),
  ]);

  const allSymbols = Array.from(rhjAssets.keys());
  const marketQuotes = await fetchQuotes(allSymbols);
  const marketQuoteMap = new Map(marketQuotes.map((q) => [q.symbol, q]));

  const posQuoteMap = new Map(positionQuotes.map((q) => [q.symbol, q]));

  let investedValue = 0;
  let currentValue = 0;
  let dayPnl = 0;

  for (const p of positions) {
    const q = posQuoteMap.get(p.symbol);
    const qty = Number(p.quantity);
    const avgCost = Number(p.avgCost);
    const price = q?.regularMarketPrice ?? avgCost;
    const prevClose = q?.regularMarketPreviousClose ?? price;

    investedValue += avgCost * qty;
    currentValue += price * qty;
    dayPnl += (price - prevClose) * qty;
  }

  const cashBalance = wallet ? Number(wallet.balance) : 0;
  const portfolioValue = cashBalance + currentValue;
  const totalPnl = currentValue - investedValue;
  const dayPnlPercent = currentValue > 0 ? (dayPnl / (currentValue - dayPnl || 1)) * 100 : 0;

  const topMovers = Array.from(rhjAssets.values())
    .map((asset) => {
      const q = marketQuoteMap.get(asset.tokenSymbol);
      return {
        symbol: asset.tokenSymbol,
        name: asset.cleanName,
        assetType: asset.assetType,
        price: q?.regularMarketPrice ?? 0,
        change: q?.regularMarketChange ?? 0,
        changePercent: q?.regularMarketChangePercent ?? 0,
        volume: q?.regularMarketVolume ?? null,
        marketCap: q?.marketCap ?? null,
        high52w: q?.fiftyTwoWeekHigh ?? null,
        low52w: q?.fiftyTwoWeekLow ?? null,
        logoUrl: asset.logoUrl,
        contractAddress: asset.contractAddress,
        bid: null,
        ask: null,
      };
    })
    .filter((r) => r.price > 0 && r.changePercent !== 0)
    .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
    .slice(0, 5);

  const recentOrders = recentOrdersRaw.map((o) => {
    const rhj = rhjAssets.get(o.symbol.toUpperCase());
    return {
      id: o.id,
      symbol: o.symbol,
      name: o.name,
      side: o.side,
      orderType: o.orderType,
      quantity: Number(o.quantity),
      limitPrice: o.limitPrice != null ? Number(o.limitPrice) : null,
      executionPrice: o.executionPrice != null ? Number(o.executionPrice) : null,
      status: o.status,
      totalValue: o.totalValue != null ? Number(o.totalValue) : null,
      createdAt: o.createdAt.toISOString(),
      filledAt: o.filledAt != null ? o.filledAt.toISOString() : null,
      logoUrl: rhj?.logoUrl ?? null,
      contractAddress: rhj?.contractAddress ?? null,
    };
  });

  res.json({
    portfolioValue,
    cashBalance,
    dayPnl,
    dayPnlPercent,
    totalPnl,
    totalTrades: totalOrdersRaw.length,
    openPositions: positions.length,
    topMovers,
    recentOrders,
  });
});

export default router;
