import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const positionsTable = pgTable("positions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  symbol: text("symbol").notNull(),
  name: text("name").notNull(),
  quantity: numeric("quantity", { precision: 20, scale: 8 }).notNull().default("0"),
  avgCost: numeric("avg_cost", { precision: 20, scale: 8 }).notNull().default("0"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPositionSchema = createInsertSchema(positionsTable).omit({ id: true, updatedAt: true });
export type InsertPosition = z.infer<typeof insertPositionSchema>;
export type Position = typeof positionsTable.$inferSelect;
