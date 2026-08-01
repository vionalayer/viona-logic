import { Router } from "express";
import { db, positionsTable, walletsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { fetchQuotes, fetchChart } from "../lib/yahoo-finance";
import { fetchRobinhoodAssets } from "../lib/robinhood-api";

const DEFAULT_USER_ID = 1;
const router = Router();

router.get("/", async (req, res) => {
  const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, DEFAULT_USER_ID));
  const positions = await db.select().from(positionsTable).where(eq(positionsTable.userId, DEFAULT_USER_ID));

  if (positions.length === 0) {
    const cashBalance = wallet ? Number(wallet.balance) : 0;
    res.json({
      totalValue: cashBalance,
      cashBalance,
      investedValue: 0,
      totalPnl: 0,
      totalPnlPercent: 0,
      dayPnl: 0,
      dayPnlPercent: 0,
      positions: [],
    });
    return;
  }

  const symbols = positions.map((p) => p.symbol);
  const [quotes, rhjAssets] = await Promise.all([
    fetchQuotes(symbols),
    fetchRobinhoodAssets(),
  ]);
  const quoteMap = new Map(quotes.map((q) => [q.symbol, q]));

  let investedValue = 0;
  let currentValue = 0;
  let dayPnl = 0;

  const enriched = positions.map((p) => {
    const q = quoteMap.get(p.symbol);
    const rhj = rhjAssets.get(p.symbol.toUpperCase());
    const qty = Number(p.quantity);
    const avgCost = Number(p.avgCost);
    const currentPrice = q?.regularMarketPrice ?? avgCost;
    const prevClose = q?.regularMarketPreviousClose ?? currentPrice;

    const marketValue = currentPrice * qty;
    const unrealizedPnl = (currentPrice - avgCost) * qty;
    const unrealizedPnlPercent = avgCost !== 0 ? ((currentPrice - avgCost) / avgCost) * 100 : 0;
    const dayChange = (currentPrice - prevClose) * qty;
    const dayChangePercent = prevClose !== 0 ? ((currentPrice - prevClose) / prevClose) * 100 : 0;

    investedValue += avgCost * qty;
    currentValue += marketValue;
    dayPnl += dayChange;

    return {
      symbol: p.symbol,
      name: p.name,
      quantity: qty,
      avgCost,
      currentPrice,
      marketValue,
      unrealizedPnl,
      unrealizedPnlPercent,
      dayChange,
      dayChangePercent,
      logoUrl: rhj?.logoUrl ?? null,
      contractAddress: rhj?.contractAddress ?? null,
    };
  });

  const cashBalance = wallet ? Number(wallet.balance) : 0;
  const totalValue = cashBalance + currentValue;
  const totalPnl = currentValue - investedValue;
  const totalPnlPercent = investedValue !== 0 ? (totalPnl / investedValue) * 100 : 0;
  const dayPnlPercent = currentValue !== 0 ? (dayPnl / (currentValue - dayPnl)) * 100 : 0;

  res.json({
    totalValue,
    cashBalance,
    investedValue: currentValue,
    totalPnl,
    totalPnlPercent,
    dayPnl,
    dayPnlPercent,
    positions: enriched,
  });
});

router.get("/positions", async (req, res) => {
  const positions = await db.select().from(positionsTable).where(eq(positionsTable.userId, DEFAULT_USER_ID));

  if (positions.length === 0) {
    res.json([]);
    return;
  }

  const symbols = positions.map((p) => p.symbol);
  const [quotes, rhjAssets] = await Promise.all([
    fetchQuotes(symbols),
    fetchRobinhoodAssets(),
  ]);
  const quoteMap = new Map(quotes.map((q) => [q.symbol, q]));

  const enriched = positions.map((p) => {
    const q = quoteMap.get(p.symbol);
    const rhj = rhjAssets.get(p.symbol.toUpperCase());
    const qty = Number(p.quantity);
    const avgCost = Number(p.avgCost);
    const currentPrice = q?.regularMarketPrice ?? avgCost;
    const prevClose = q?.regularMarketPreviousClose ?? currentPrice;

    return {
      symbol: p.symbol,
      name: p.name,
      quantity: qty,
      avgCost,
      currentPrice,
      marketValue: currentPrice * qty,
      unrealizedPnl: (currentPrice - avgCost) * qty,
      unrealizedPnlPercent: avgCost !== 0 ? ((currentPrice - avgCost) / avgCost) * 100 : 0,
      dayChange: (currentPrice - prevClose) * qty,
      dayChangePercent: prevClose !== 0 ? ((currentPrice - prevClose) / prevClose) * 100 : 0,
      logoUrl: rhj?.logoUrl ?? null,
      contractAddress: rhj?.contractAddress ?? null,
    };
  });

  res.json(enriched);
});

router.get("/performance/:range", async (req, res) => {
  const { range } = req.params as { range: string };

  // Map our UI ranges to Yahoo Finance chart ranges and day counts
  const rangeConfig: Record<string, { days: number; yahooRange: string }> = {
    "7d":  { days: 7,   yahooRange: "1mo" },
    "30d": { days: 30,  yahooRange: "1mo" },
    "3mo": { days: 90,  yahooRange: "3mo" },
    "90d": { days: 90,  yahooRange: "3mo" },
    "1y":  { days: 365, yahooRange: "1y"  },
  };
  const config = rangeConfig[range] ?? rangeConfig["30d"];
  const { days, yahooRange } = config;

  const [[wallet], positions] = await Promise.all([
    db.select().from(walletsTable).where(eq(walletsTable.userId, DEFAULT_USER_ID)),
    db.select().from(positionsTable).where(eq(positionsTable.userId, DEFAULT_USER_ID)),
  ]);

  const cashBalance = wallet ? Number(wallet.balance) : 0;

  // No positions — return flat line at cash balance
  if (positions.length === 0) {
    const now = new Date();
    const points = [];
    for (let i = days; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      points.push({ date: date.toISOString().split("T")[0], value: cashBalance });
    }
    res.json({ range, points, startValue: cashBalance, endValue: cashBalance, changePercent: 0 });
    return;
  }

  // Fetch historical OHLC for every held symbol in parallel
  const chartResults = await Promise.allSettled(
    positions.map((p) => fetchChart(p.symbol, yahooRange).then((data) => ({ symbol: p.symbol, data })))
  );

  // Build symbol -> (dateStr -> closing price) lookup
  const symbolPriceByDate = new Map<string, Map<string, number>>();
  for (const result of chartResults) {
    if (result.status === "fulfilled") {
      const { symbol, data } = result.value;
      const priceMap = new Map<string, number>();
      for (const point of data) {
        // timestamp is ISO string; keep only the date part
        const dateStr = point.timestamp.slice(0, 10);
        priceMap.set(dateStr, point.price);
      }
      symbolPriceByDate.set(symbol, priceMap);
    }
  }

  // Collect all trading-day dates within the requested range
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);

  const allDatesSet = new Set<string>();
  for (const priceMap of symbolPriceByDate.values()) {
    for (const dateStr of priceMap.keys()) {
      const d = new Date(dateStr);
      if (d >= cutoff && d <= now) {
        allDatesSet.add(dateStr);
      }
    }
  }

  const sortedDates = Array.from(allDatesSet).sort();

  // For each date compute NAV: sum of (close price × quantity) + cash
  // Fall back to avgCost when no historical price is available for a symbol
  // (handles instruments added mid-range or with no history)
  const points = sortedDates.map((dateStr) => {
    let value = cashBalance;
    for (const position of positions) {
      const priceMap = symbolPriceByDate.get(position.symbol);
      const price = priceMap?.get(dateStr) ?? Number(position.avgCost);
      value += price * Number(position.quantity);
    }
    return { date: dateStr, value };
  });

  // If Yahoo returned no data at all, fall back to a single current-value point
  if (points.length === 0) {
    const quotes = await fetchQuotes(positions.map((p) => p.symbol));
    const quoteMap = new Map(quotes.map((q) => [q.symbol, q]));
    const investmentValue = positions.reduce((sum, p) => {
      const price = quoteMap.get(p.symbol)?.regularMarketPrice ?? Number(p.avgCost);
      return sum + price * Number(p.quantity);
    }, 0);
    const currentTotal = cashBalance + investmentValue;
    res.json({
      range,
      points: [{ date: now.toISOString().slice(0, 10), value: currentTotal }],
      startValue: currentTotal,
      endValue: currentTotal,
      changePercent: 0,
    });
    return;
  }

  const startValue = points[0].value;
  const endValue = points[points.length - 1].value;
  const changePercent = startValue !== 0 ? ((endValue - startValue) / startValue) * 100 : 0;

  res.json({ range, points, startValue, endValue, changePercent });
});

export default router;
