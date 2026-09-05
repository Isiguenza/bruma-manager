import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL no está definida en .env");
}

const sql = neon(process.env.DATABASE_URL);

async function main() {
  console.log("🔧 Agregando soporte de flujos por subcategoría a modifier_steps...");

  console.log("1️⃣ category_id → nullable");
  await sql`ALTER TABLE "modifier_steps" ALTER COLUMN "category_id" DROP NOT NULL`;

  console.log("2️⃣ agregando columna subcategory_id");
  await sql`
    ALTER TABLE "modifier_steps"
    ADD COLUMN IF NOT EXISTS "subcategory_id" uuid
    REFERENCES "subcategories"("id") ON DELETE CASCADE
  `;

  console.log("3️⃣ índice por subcategory_id");
  await sql`
    CREATE INDEX IF NOT EXISTS "modifier_steps_subcategory_id_idx"
    ON "modifier_steps" ("subcategory_id")
  `;

  console.log("\n🎉 Migración completada.");
}

main().catch((error) => {
  console.error("❌ Error en migración:", error);
  process.exit(1);
});
