import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL no está definida en .env");
}

const sql = neon(process.env.DATABASE_URL);

async function main() {
  console.log("🔧 Agregando columna is_practice a orders...");
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_practice boolean NOT NULL DEFAULT false`;
  await sql`CREATE INDEX IF NOT EXISTS idx_orders_is_practice ON orders(is_practice) WHERE is_practice = true`;
  console.log("✅ Columna is_practice lista");

  console.log("🔧 Creando mesa oculta 'PRACTICA' (si no existe)...");
  await sql`
    INSERT INTO tables (number, name, capacity, status, active)
    VALUES ('PRACTICA', 'Mesa de Práctica (Modo Práctica)', 4, 'available', false)
    ON CONFLICT (number) DO NOTHING
  `;
  console.log("✅ Mesa 'PRACTICA' lista");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
