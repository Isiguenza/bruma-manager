import { sql } from "drizzle-orm";
import { db } from "../db";

export const DEFAULT_LOYALTY_DISCOUNT_PCT = 6;

// restaurant_settings.loyalty_discount_pct se lee con SQL crudo a propósito (como
// wallet_season): si la columna no existe todavía, findFirst() de esa tabla
// tumbaría los pedidos en línea; aquí solo cae al default.
export async function getLoyaltyDiscountPct(): Promise<number> {
  try {
    const result: any = await db.execute(sql`SELECT loyalty_discount_pct FROM restaurant_settings LIMIT 1`);
    const value = parseFloat((result.rows ?? result)[0]?.loyalty_discount_pct);
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_LOYALTY_DISCOUNT_PCT;
  } catch (error) {
    console.error("[Loyalty] Could not read loyalty_discount_pct, using default:", error);
    return DEFAULT_LOYALTY_DISCOUNT_PCT;
  }
}

export async function setLoyaltyDiscountPct(pct: number): Promise<void> {
  const updated: any = await db.execute(
    sql`UPDATE restaurant_settings SET loyalty_discount_pct = ${pct}, updated_at = NOW() RETURNING id`
  );
  if ((updated.rows ?? updated).length === 0) {
    await db.execute(sql`INSERT INTO restaurant_settings (loyalty_discount_pct) VALUES (${pct})`);
  }
}
