import { Router } from "express";
import { db, ordersTable, positionsTable, walletsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { fetchQuote } from "../lib/yahoo-finance";
import { verifyMessage } from "viem";
import { fetchRobinhoodAssets } from "../lib/robinhood-api";

const DEFAULT_USER_ID = 1;
const router = Router();

function mapOrder(o: {
  id: number; symbol: string; name: string; side: string; orderType: string;
  quantity: unknown; limitPrice: unknown; executionPrice: unknown; status: string;
  totalValue: unknown; createdAt: Date; filledAt: Date | null;
}, rhjAssets: Awaited<ReturnType<typeof fetchRobinhoodAssets>>) {
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
}

router.get("/", async (req, res) => {
  const [orders, rhjAssets] = await Promise.all([
    db.select().from(ordersTable).where(eq(ordersTable.userId, DEFAULT_USER_ID)).orderBy(desc(ordersTable.createdAt)),
    fetchRobinhoodAssets(),
  ]);
  res.json(orders.map((o) => mapOrder(o, rhjAssets)));
});

router.get("/recent", async (req, res) => {
  const [orders, rhjAssets] = await Promise.all([
    db.select().from(ordersTable).where(eq(ordersTable.userId, DEFAULT_USER_ID)).orderBy(desc(ordersTable.createdAt)).limit(10),
    fetchRobinhoodAssets(),
  ]);
  res.json(orders.map((o) => mapOrder(o, rhjAssets)));
});

router.get("/:id", async (req, res) => {
  const id = Number((req.params as { id: string }).id);
  const [order] = await db
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.id, id), eq(ordersTable.userId, DEFAULT_USER_ID)));

  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const rhjAssets = await fetchRobinhoodAssets();
  res.json(mapOrder(order, rhjAssets));
});

router.post("/", async (req, res) => {
  const body = req.body as {
    symbol?: string;
    side?: string;
    orderType?: string;
    quantity?: number;
    limitPrice?: number | null;
    walletAddress?: string;
    signature?: string;
    timestamp?: number;
  };

  const { symbol, side, orderType, quantity, limitPrice, walletAddress, signature, timestamp } = body;

  if (!symbol || !side || !orderType || !quantity) {
    res.status(400).json({ error: "Missing required fields: symbol, side, orderType, quantity" });
    return;
  }

  // Verify EIP-191 wallet signature if provided
  if (walletAddress && signature && timestamp) {
    // Replay protection: reject if timestamp is more than 2 minutes old
    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - timestamp) > 120) {
      res.status(401).json({ error: "Order signature expired. Please try again." });
      return;
    }

    // Reconstruct the exact message that was signed on the frontend
    const limitPriceNum = orderType === "LIMIT" ? (limitPrice ?? null) : null;
    const lines = [
      "VIONA LAYER — Order Authorization",
      `Action:    ${side}`,
      `Asset:     ${symbol.toUpperCase()}`,
      `Quantity:  ${quantity}`,
      `Type:      ${orderType}`,
      ...(limitPriceNum != null ? [`Limit:     $${limitPriceNum}`] : []),
      `Timestamp: ${timestamp}`,
      "",
      "I authorize this trade on VIONA Layer.",
    ];
    const message = lines.join("\n");

    try {
      const isValid = await verifyMessage({
        address: walletAddress as `0x${string}`,
        message,
        signature: signature as `0x${string}`,
      });
      if (!isValid) {
        res.status(401).json({ error: "Invalid wallet signature. Order rejected." });
        return;
      }
    } catch {
      res.status(401).json({ error: "Signature verification failed." });
      return;
    }
  } else if (!walletAddress && !signature) {
    // No signature — reject; wallet connection is required
    res.status(401).json({ error: "Wallet signature required. Connect your wallet to trade." });
    return;
  }

  if (!["BUY", "SELL"].includes(side)) {
    res.status(400).json({ error: "side must be BUY or SELL" });
    return;
  }

  if (!["MARKET", "LIMIT"].includes(orderType)) {
    res.status(400).json({ error: "orderType must be MARKET or LIMIT" });
    return;
  }

  if (quantity <= 0) {
    res.status(400).json({ error: "quantity must be > 0" });
    return;
  }

  const upperSymbol = symbol.toUpperCase();

  // Fetch live price
  const quote = await fetchQuote(upperSymbol);
  if (!quote) {
    res.status(400).json({ error: "Could not fetch live price for symbol. Check if the symbol is valid." });
    return;
  }

  // MARKET: fill at current price. LIMIT: no execution price yet — set only when worker fills it.
  const executionPrice = orderType === "MARKET" ? quote.regularMarketPrice : null;
  const totalValue = (executionPrice ?? (limitPrice ?? quote.regularMarketPrice)) * quantity;

  // Check wallet balance for BUY orders
  const [wallet] = await db
    .select()
    .from(walletsTable)
    .where(eq(walletsTable.userId, DEFAULT_USER_ID));

  if (!wallet) {
    res.status(400).json({ error: "Wallet not found" });
    return;
  }

  if (side === "BUY") {
    if (Number(wallet.balance) < totalValue) {
      res.status(400).json({ error: `Insufficient balance. Required: $${totalValue.toFixed(2)}, Available: $${Number(wallet.balance).toFixed(2)}` });
      return;
    }
  }

  if (side === "SELL") {
    // Check position
    const [position] = await db
      .select()
      .from(positionsTable)
      .where(and(eq(positionsTable.userId, DEFAULT_USER_ID), eq(positionsTable.symbol, upperSymbol)));

    if (!position || Number(position.quantity) < quantity) {
      const held = position ? Number(position.quantity) : 0;
      res.status(400).json({ error: `Insufficient position. Trying to sell ${quantity}, holding ${held}` });
      return;
    }
  }

  // Create order (MARKET orders fill immediately)
  const status = orderType === "MARKET" ? "FILLED" : "PENDING";
  const filledAt = orderType === "MARKET" ? new Date() : null;

  const [newOrder] = await db
    .insert(ordersTable)
    .values({
      userId: DEFAULT_USER_ID,
      symbol: upperSymbol,
      name: quote.shortName || quote.longName || upperSymbol,
      side,
      orderType,
      quantity: String(quantity),
      limitPrice: limitPrice != null ? String(limitPrice) : null,
      executionPrice: executionPrice != null ? String(executionPrice) : null,
      status,
      totalValue: String(totalValue),
      filledAt,
    })
    .returning();

  // Update wallet and position for MARKET orders
  if (orderType === "MARKET") {
    if (side === "BUY") {
      // Deduct from wallet
      await db
        .update(walletsTable)
        .set({
          balance: String(Number(wallet.balance) - totalValue),
          updatedAt: new Date(),
        })
        .where(eq(walletsTable.userId, DEFAULT_USER_ID));

      // Update/create position
      const [existing] = await db
        .select()
        .from(positionsTable)
        .where(and(eq(positionsTable.userId, DEFAULT_USER_ID), eq(positionsTable.symbol, upperSymbol)));

      if (existing) {
        const newQty = Number(existing.quantity) + quantity;
        const fillPrice = executionPrice!; // always set for MARKET orders
        const newAvgCost = (Number(existing.avgCost) * Number(existing.quantity) + fillPrice * quantity) / newQty;
        await db
          .update(positionsTable)
          .set({ quantity: String(newQty), avgCost: String(newAvgCost), updatedAt: new Date() })
          .where(eq(positionsTable.id, existing.id));
      } else {
        await db.insert(positionsTable).values({
          userId: DEFAULT_USER_ID,
          symbol: upperSymbol,
          name: quote.shortName || upperSymbol,
          quantity: String(quantity),
          avgCost: String(executionPrice!),
        });
      }
    } else {
      // SELL — add to wallet
      await db
        .update(walletsTable)
        .set({
          balance: String(Number(wallet.balance) + totalValue),
          updatedAt: new Date(),
        })
        .where(eq(walletsTable.userId, DEFAULT_USER_ID));

      // Reduce position
      const [existing] = await db
        .select()
        .from(positionsTable)
        .where(and(eq(positionsTable.userId, DEFAULT_USER_ID), eq(positionsTable.symbol, upperSymbol)));

      if (existing) {
        const newQty = Number(existing.quantity) - quantity;
        if (newQty <= 0) {
          await db.delete(positionsTable).where(eq(positionsTable.id, existing.id));
        } else {
          await db.update(positionsTable).set({ quantity: String(newQty), updatedAt: new Date() }).where(eq(positionsTable.id, existing.id));
        }
      }
    }
  }

  res.status(201).json({
    id: newOrder.id,
    symbol: newOrder.symbol,
    name: newOrder.name,
    side: newOrder.side,
    orderType: newOrder.orderType,
    quantity: Number(newOrder.quantity),
    limitPrice: newOrder.limitPrice != null ? Number(newOrder.limitPrice) : null,
    executionPrice: newOrder.executionPrice != null ? Number(newOrder.executionPrice) : null,
    status: newOrder.status,
    totalValue: newOrder.totalValue != null ? Number(newOrder.totalValue) : null,
    createdAt: newOrder.createdAt.toISOString(),
    filledAt: newOrder.filledAt != null ? newOrder.filledAt.toISOString() : null,
  });
});

router.delete("/:id", async (req, res) => {
  const id = Number((req.params as { id: string }).id);
  const [order] = await db
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.id, id), eq(ordersTable.userId, DEFAULT_USER_ID)));

  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  if (order.status !== "PENDING") {
    res.status(400).json({ error: "Only PENDING orders can be cancelled" });
    return;
  }

  const [updated] = await db
    .update(ordersTable)
    .set({ status: "CANCELLED" })
    .where(eq(ordersTable.id, id))
    .returning();

  res.json({
    id: updated.id,
    symbol: updated.symbol,
    name: updated.name,
    side: updated.side,
    orderType: updated.orderType,
    quantity: Number(updated.quantity),
    limitPrice: updated.limitPrice != null ? Number(updated.limitPrice) : null,
    executionPrice: updated.executionPrice != null ? Number(updated.executionPrice) : null,
    status: updated.status,
    totalValue: updated.totalValue != null ? Number(updated.totalValue) : null,
    createdAt: updated.createdAt.toISOString(),
    filledAt: updated.filledAt != null ? updated.filledAt.toISOString() : null,
  });
});

export default router;
