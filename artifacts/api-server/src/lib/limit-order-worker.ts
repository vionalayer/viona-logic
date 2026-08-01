import { db, ordersTable, positionsTable, walletsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { fetchQuote } from "./yahoo-finance";
import { logger } from "./logger";

const INTERVAL_MS = 30 * 1000; // 30 seconds

async function fillLimitOrder(orderId: number, side: string, symbol: string, assetName: string, quantity: number, fillPrice: number) {
  const totalValue = fillPrice * quantity;

  const [wallet] = await db
    .select()
    .from(walletsTable)
    .where(eq(walletsTable.userId, 1));

  if (!wallet) {
    logger.warn({ orderId }, "Limit order worker: wallet not found, skipping order");
    return;
  }

  if (side === "BUY") {
    if (Number(wallet.balance) < totalValue) {
      logger.warn({ orderId, required: totalValue, available: wallet.balance }, "Limit order worker: insufficient balance, skipping order");
      return;
    }

    // Deduct from wallet
    await db
      .update(walletsTable)
      .set({ balance: String(Number(wallet.balance) - totalValue), updatedAt: new Date() })
      .where(eq(walletsTable.userId, 1));

    // Update/create position
    const [existing] = await db
      .select()
      .from(positionsTable)
      .where(and(eq(positionsTable.userId, 1), eq(positionsTable.symbol, symbol)));

    if (existing) {
      const newQty = Number(existing.quantity) + quantity;
      const newAvgCost =
        (Number(existing.avgCost) * Number(existing.quantity) + fillPrice * quantity) / newQty;
      await db
        .update(positionsTable)
        .set({ quantity: String(newQty), avgCost: String(newAvgCost), updatedAt: new Date() })
        .where(eq(positionsTable.id, existing.id));
    } else {
      await db.insert(positionsTable).values({
        userId: 1,
        symbol,
        name: assetName || symbol,
        quantity: String(quantity),
        avgCost: String(fillPrice),
      });
    }
  } else {
    // SELL — check position first
    const [existing] = await db
      .select()
      .from(positionsTable)
      .where(and(eq(positionsTable.userId, 1), eq(positionsTable.symbol, symbol)));

    if (!existing || Number(existing.quantity) < quantity) {
      const held = existing ? Number(existing.quantity) : 0;
      logger.warn({ orderId, required: quantity, held }, "Limit order worker: insufficient position, skipping order");
      return;
    }

    // Add proceeds to wallet
    await db
      .update(walletsTable)
      .set({ balance: String(Number(wallet.balance) + totalValue), updatedAt: new Date() })
      .where(eq(walletsTable.userId, 1));

    // Reduce position
    const newQty = Number(existing.quantity) - quantity;
    if (newQty <= 0) {
      await db.delete(positionsTable).where(eq(positionsTable.id, existing.id));
    } else {
      await db
        .update(positionsTable)
        .set({ quantity: String(newQty), updatedAt: new Date() })
        .where(eq(positionsTable.id, existing.id));
    }
  }

  // Mark order as FILLED
  await db
    .update(ordersTable)
    .set({
      status: "FILLED",
      executionPrice: String(fillPrice),
      totalValue: String(totalValue),
      filledAt: new Date(),
    })
    .where(eq(ordersTable.id, orderId));

  logger.info({ orderId, symbol, side, quantity, fillPrice, totalValue }, "Limit order worker: order filled");
}

async function checkLimitOrders() {
  let pendingOrders: typeof ordersTable.$inferSelect[];
  try {
    pendingOrders = await db
      .select()
      .from(ordersTable)
      .where(and(eq(ordersTable.status, "PENDING"), eq(ordersTable.orderType, "LIMIT")));
  } catch (err) {
    logger.warn({ err }, "Limit order worker: failed to load pending orders");
    return;
  }

  if (pendingOrders.length === 0) return;

  // Deduplicate symbols to minimise API calls
  const symbols = [...new Set(pendingOrders.map((o) => o.symbol))];
  const priceMap = new Map<string, number>();

  await Promise.allSettled(
    symbols.map(async (symbol) => {
      const quote = await fetchQuote(symbol);
      if (quote) priceMap.set(symbol, quote.regularMarketPrice);
    })
  );

  for (const order of pendingOrders) {
    const currentPrice = priceMap.get(order.symbol);
    if (currentPrice == null || order.limitPrice == null) continue;

    const limitPrice = Number(order.limitPrice);
    const quantity = Number(order.quantity);
    const triggered =
      order.side === "BUY" ? currentPrice <= limitPrice : currentPrice >= limitPrice;

    if (triggered) {
      try {
        await fillLimitOrder(order.id, order.side, order.symbol, order.name || order.symbol, quantity, currentPrice);
      } catch (err) {
        logger.warn({ err, orderId: order.id }, "Limit order worker: error filling order");
      }
    }
  }
}

export function startLimitOrderWorker() {
  logger.info("Limit order worker started (interval: 30s)");
  // Run immediately on startup, then on interval
  void checkLimitOrders();
  setInterval(() => void checkLimitOrders(), INTERVAL_MS);
}
