import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL no está definida en .env");
}

const sql = neon(process.env.DATABASE_URL);

async function main() {
  console.log("🔧 Agregando columnas de reparto por porcentaje a supplier_items...");

  await sql`
    ALTER TABLE "supplier_items"
    ADD COLUMN IF NOT EXISTS "pricing_type" varchar(20) NOT NULL DEFAULT 'fixed_cost';
  `;
  console.log("✅ pricing_type agregada");

  await sql`
    ALTER TABLE "supplier_items"
    ADD COLUMN IF NOT EXISTS "business_cut_percent" decimal(5,2);
  `;
  console.log("✅ business_cut_percent agregada");

  // cost_price ya existía NOT NULL sin default — igualarlo al nuevo schema
  // (default '0') para que las filas "percentage" puedan dejarlo en 0.
  await sql`
    ALTER TABLE "supplier_items"
    ALTER COLUMN "cost_price" SET DEFAULT '0';
  `;
  console.log("✅ cost_price default actualizado");

  console.log("\n🎉 Migración completada!");
}

main().catch((error) => {
  console.error("❌ Error en migración:", error);
  process.exit(1);
});
