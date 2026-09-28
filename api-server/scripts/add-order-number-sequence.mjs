import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL es requerido");
}

// Manual migration only. Do not run through drizzle-kit migrate: this database
// has a historical migration ledger that does not match the live schema.
const sql = neon(process.env.DATABASE_URL);

await sql.transaction([
  sql`LOCK TABLE orders IN ACCESS EXCLUSIVE MODE`,
  sql`CREATE SEQUENCE IF NOT EXISTS orders_order_number_seq`,
  sql`ALTER SEQUENCE orders_order_number_seq OWNED BY orders.order_number`,
  sql`SELECT setval(
    'orders_order_number_seq',
    GREATEST(COALESCE((SELECT MAX(order_number) FROM orders), 0) + 1, 1),
    false
  )`,
  sql`ALTER TABLE orders
    ALTER COLUMN order_number
    SET DEFAULT nextval('orders_order_number_seq'::regclass)`,
]);

console.log("orders_order_number_seq configured successfully");
