import { Router } from "express";
import { db, walletsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const DEFAULT_USER_ID = 1;
const router = Router();

router.get("/", async (req, res) => {
  const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, DEFAULT_USER_ID));

  if (!wallet) {
    res.status(404).json({ error: "Wallet not found" });
    return;
  }

  res.json({
    balance: Number(wallet.balance),
    currency: "USDG",
    updatedAt: wallet.updatedAt.toISOString(),
  });
});

router.post("/deposit", async (req, res) => {
  const body = req.body as { amount?: number };
  const amount = Number(body.amount);

  if (!amount || amount <= 0) {
    res.status(400).json({ error: "amount must be a positive number" });
    return;
  }

  if (amount > 1_000_000) {
    res.status(400).json({ error: "Maximum single deposit is $1,000,000" });
    return;
  }

  const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, DEFAULT_USER_ID));

  if (!wallet) {
    res.status(404).json({ error: "Wallet not found" });
    return;
  }

  const newBalance = Number(wallet.balance) + amount;
  const [updated] = await db
    .update(walletsTable)
    .set({ balance: String(newBalance), updatedAt: new Date() })
    .where(eq(walletsTable.userId, DEFAULT_USER_ID))
    .returning();

  res.json({
    balance: Number(updated.balance),
    currency: "USDG",
    updatedAt: updated.updatedAt.toISOString(),
  });
});

export default router;
