import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  symbol: text("symbol").notNull(),
  name: text("name").notNull(),
  side: text("side").notNull(), // BUY | SELL
  orderType: text("order_type").notNull(), // MARKET | LIMIT
  quantity: numeric("quantity", { precision: 20, scale: 8 }).notNull(),
  limitPrice: numeric("limit_price", { precision: 20, scale: 8 }),
  executionPrice: numeric("execution_price", { precision: 20, scale: 8 }),
  status: text("status").notNull().default("PENDING"), // PENDING | FILLED | CANCELLED
  totalValue: numeric("total_value", { precision: 20, scale: 8 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  filledAt: timestamp("filled_at"),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
