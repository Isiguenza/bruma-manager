import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL no está definida en .env");
}

const sql = neon(process.env.DATABASE_URL);

async function main() {
  console.log("🔧 Creando tablas de proveedores...");

  await sql`
    CREATE TABLE IF NOT EXISTS "suppliers" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "name" varchar(255) NOT NULL,
      "contact_name" varchar(255),
      "phone" varchar(50),
      "email" varchar(255),
      "address" text,
      "notes" text,
      "active" boolean NOT NULL DEFAULT true,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL
    );
  `;
  console.log("✅ suppliers creada");

  await sql`
    CREATE TABLE IF NOT EXISTS "supplier_items" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "supplier_id" uuid NOT NULL REFERENCES "suppliers"("id") ON DELETE CASCADE,
      "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
      "variant_name" varchar(255),
      "cost_price" decimal(10,2) NOT NULL,
      "source_category_id" uuid REFERENCES "categories"("id") ON DELETE SET NULL,
      "active" boolean NOT NULL DEFAULT true,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL
    );
  `;
  console.log("✅ supplier_items creada");

  await sql`CREATE INDEX IF NOT EXISTS idx_supplier_items_supplier ON supplier_items(supplier_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_supplier_items_product ON supplier_items(product_id);`;
  console.log("✅ índices creados");

  console.log("\n🎉 Migración completada!");
}

main().catch((error) => {
  console.error("❌ Error en migración:", error);
  process.exit(1);
});
