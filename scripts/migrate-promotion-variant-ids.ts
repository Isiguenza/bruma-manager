import "dotenv/config";
import { neon } from "@neondatabase/serverless";

type ProductRow = { id: string; variants: string | null };
type PromotionRow = { id: string; name: string; product_ids: string | null };

const apply = process.argv.includes("--apply");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL no está definida en .env");
}

const sql = neon(process.env.DATABASE_URL);

function migrateLegacyId(id: string, productsById: Map<string, ProductRow>): string {
  const match = id.match(/^(.+)-variant-(\d+)$/);
  if (!match) return id;

  const [, productId, indexText] = match;
  const product = productsById.get(productId);
  if (!product?.variants) {
    console.warn(`  No se encontró producto/variantes para ${id}; se conserva.`);
    return id;
  }

  try {
    const variants = JSON.parse(product.variants) as Array<{ name?: string }>;
    const variant = variants[Number(indexText)];
    if (!variant?.name) {
      console.warn(`  No se encontró variante actual ${id}; se conserva.`);
      return id;
    }
    return `${productId}::${variant.name}`;
  } catch {
    console.warn(`  Variantes inválidas para ${productId}; se conserva ${id}.`);
    return id;
  }
}

async function main() {
  const [productRows, promotionRows] = await Promise.all([
    sql`SELECT id, variants FROM products`,
    sql`
      SELECT id, name, product_ids
      FROM promotions
      WHERE product_ids LIKE '%-variant-%'
    `,
  ]);
  const products = productRows as unknown as ProductRow[];
  const promotions = promotionRows as unknown as PromotionRow[];
  const productsById = new Map(products.map((product) => [product.id, product]));
  let changed = 0;

  console.log(`${apply ? "Aplicando" : "Simulando"} migración de ${promotions.length} promoción(es)...`);
  for (const promotion of promotions) {
    if (!promotion.product_ids) continue;

    let ids: string[];
    try {
      const parsed = JSON.parse(promotion.product_ids);
      if (!Array.isArray(parsed) || !parsed.every((id) => typeof id === "string")) {
        console.warn(`Promoción ${promotion.id} tiene product_ids inválido; se omite.`);
        continue;
      }
      ids = parsed;
    } catch {
      console.warn(`Promoción ${promotion.id} tiene product_ids no parseable; se omite.`);
      continue;
    }

    const migratedIds = ids.map((id) => migrateLegacyId(id, productsById));
    if (migratedIds.every((id, index) => id === ids[index])) continue;

    changed++;
    console.log(`${promotion.name} (${promotion.id}): ${JSON.stringify(ids)} -> ${JSON.stringify(migratedIds)}`);
    if (apply) {
      await sql`
        UPDATE promotions
        SET product_ids = ${JSON.stringify(migratedIds)}, updated_at = NOW()
        WHERE id = ${promotion.id}
      `;
    }
  }

  console.log(`${apply ? "Migradas" : "Detectadas"}: ${changed}.`);
  if (!apply && changed > 0) {
    console.log("Revisa el plan y vuelve a correr con --apply para escribir cambios.");
  }
}

main().catch((error) => {
  console.error("Error migrando ids de variante de promociones:", error);
  process.exit(1);
});
