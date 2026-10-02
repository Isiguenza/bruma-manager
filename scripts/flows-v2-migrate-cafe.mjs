import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

// This migration is intentionally read-only unless --apply is supplied.
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
if (resolve(process.cwd()) !== repositoryRoot) {
  throw new Error("Run node scripts/flows-v2-migrate-cafe.mjs from the repository root.");
}
const unknownArguments = process.argv.slice(2).filter((argument) => argument !== "--apply");
if (unknownArguments.length) throw new Error(`Unknown arguments: ${unknownArguments.join(", ")}`);
const apply = process.argv.includes("--apply");
const envContents = readFileSync(resolve(repositoryRoot, ".env"), "utf8");
const databaseUrl = envContents.match(/^DATABASE_URL\s*=\s*(.+)$/m)?.[1].trim().replace(/^['"]|['"]$/g, "");
if (!databaseUrl) throw new Error("DATABASE_URL is missing from .env.");
const sql = neon(databaseUrl);

const PAIRS = new Map([
  ["Americano", ["39", "40"]], ["Capuccino", ["40", "45"]], ["Caramel", ["45", "50"]],
  ["Chocolate", ["45", "50"]], ["Moka", ["45", "50"]], ["Latte", ["40", "45"]],
]);
const MILK_PRODUCTS = new Set(["Capuccino", "Caramel", "Chocolate", "Moka", "Latte"]);

function display(value) {
  if (value === null || value === undefined) return "∅";
  return JSON.stringify(value);
}
function diff(table, row, column, before, after) {
  console.log(`  ${table} ${row} | ${column}: ${display(before)} → ${display(after)}`);
}
function normalizeJson(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return JSON.parse(value);
}
function variants(coldPrice, hotPrice) {
  return JSON.stringify([{ name: "Frío", price: coldPrice }, { name: "Caliente", price: hotPrice }]);
}
function sameJsonText(left, right) {
  try { return JSON.stringify(JSON.parse(left ?? "null")) === JSON.stringify(JSON.parse(right)); } catch { return false; }
}

async function createCafeFlow(categoryId) {
  const [flow] = await sql`
    INSERT INTO flow_definitions (name, description, scope_kind, priority, active)
    VALUES ('Café', 'Router de leche por variante Caliente y tag con-leche.', 'category', 0, true)
    RETURNING id
  `;
  await sql`INSERT INTO flow_targets (flow_id, mode, category_id) VALUES (${flow.id}, 'include', ${categoryId})`;
  const [router] = await sql`
    INSERT INTO flow_nodes (flow_id, title, select_mode, min_selections, max_selections, include_none_option, is_entry, pos_x, pos_y, sort_order, active)
    VALUES (${flow.id}, '__router Café', 'single', 0, 1, true, true, 0, 0, 0, true) RETURNING id
  `;
  const [milk] = await sql`
    INSERT INTO flow_nodes (flow_id, title, select_mode, min_selections, max_selections, include_none_option, none_label, is_entry, pos_x, pos_y, sort_order, active)
    VALUES (${flow.id}, 'Tipo de leche', 'single', 0, 1, true, 'Entera', false, 360, 0, 1, true) RETURNING id
  `;
  await sql`
    INSERT INTO flow_node_options (node_id, source, label, price_mode, price_delta, emits_child_item, sort_order, active)
    VALUES (${milk.id}, 'manual', 'Deslactosada', 'delta', '0.00', false, 0, true),
           (${milk.id}, 'manual', 'Avena', 'delta', '6.00', false, 1, true)
  `;
  await sql`
    INSERT INTO flow_edges (flow_id, from_node_id, to_node_id, condition, sort_order)
    VALUES (${flow.id}, ${router.id}, ${milk.id}, ${JSON.stringify({ variantNameIn: ["Caliente"], productHasTag: "con-leche" })}::jsonb, 0),
           (${flow.id}, ${router.id}, NULL, NULL, 1),
           (${flow.id}, ${milk.id}, NULL, NULL, 0)
  `;
}

function printCafeFlowDiff() {
  const row = '[name="Café", scope=category]';
  diff("flow_definitions", row, "name", null, "Café");
  diff("flow_definitions", row, "scope_kind", null, "category");
  diff("flow_targets", row, "include", null, "categoría Café");
  diff("flow_nodes", '[flow="Café", title="__router Café"]', "node", null, { isEntry: true, visibleOptions: 0 });
  diff("flow_nodes", '[flow="Café", title="Tipo de leche"]', "node", null, { selectMode: "single", noneLabel: "Entera" });
  diff("flow_node_options", '[flow="Café", title="Tipo de leche"]', "option", null, { label: "Deslactosada", priceDelta: "0.00" });
  diff("flow_node_options", '[flow="Café", title="Tipo de leche"]', "option", null, { label: "Avena", priceDelta: "6.00" });
  diff("flow_edges", row, "edge", null, { from: "__router Café", to: "Tipo de leche", condition: { variantNameIn: ["Caliente"], productHasTag: "con-leche" }, sortOrder: 0 });
  diff("flow_edges", row, "edge", null, { from: "__router Café", to: "fin", condition: null, sortOrder: 1 });
  diff("flow_edges", row, "edge", null, { from: "Tipo de leche", to: "fin", condition: null, sortOrder: 0 });
}

async function main() {
  console.log(`${apply ? "APLICANDO" : "DRY-RUN (sin escrituras)"}: Flows v2 — consolidación Café`);
  const [categories, subcategories, products, modifierSteps, existingFlows, historicalOrphans] = await Promise.all([
    sql`SELECT id, name, active FROM categories WHERE name = 'Café'`,
    sql`SELECT id, name, active FROM subcategories ORDER BY name, id`,
    sql`SELECT id, name, category_id, subcategory_id, price, has_variants, variants, flow_tags, active, deleted_at, created_at FROM products ORDER BY name, id`,
    sql`SELECT id, category_id, subcategory_id, step_name, active FROM modifier_steps ORDER BY id`,
    sql`SELECT fd.id, fd.name, fd.scope_kind, ft.category_id FROM flow_definitions fd LEFT JOIN flow_targets ft ON ft.flow_id = fd.id AND ft.mode = 'include' ORDER BY fd.id`,
    sql`SELECT oi.id FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.product_id IS NOT NULL AND p.id IS NULL LIMIT 10`,
  ]);
  if (categories.length !== 1) throw new Error(`Expected one Café category, found ${categories.length}.`);
  if (historicalOrphans.length) throw new Error(`Historical order_items already orphaned: ${historicalOrphans.map((row) => row.id).join(", ")}`);
  console.log("VALIDACIÓN historial: 0 order_items con product_id huérfano. ✓");
  const cafe = categories[0];
  const hot = subcategories.find((subcategory) => subcategory.name === "Calientes");
  const cold = subcategories.find((subcategory) => subcategory.name === "Fríos");
  if (!hot || !cold) throw new Error("Café requires subcategories Fríos and Calientes.");
  // Keep deleted rows in the inspection so a second dry-run can recognize a completed migration.
  const cafeProducts = products.filter((product) => product.category_id === cafe.id);
  if (cafeProducts.length !== 15) throw new Error(`Expected the 15 historical Café product rows, found ${cafeProducts.length}.`);
  const writes = [];
  console.log("CRITERIO DE CONSERVACIÓN: se conserva el producto de Calientes en cada par; Calientes tiene 8 productos frente a 7 en Fríos y conserva el historial/orden relativo de Espresso y Tissana. Los seis conservados y los tres exclusivos se desprenden de la subcategoría para dejar Fríos y Calientes vacías antes de desactivarlas.");

  for (const [name, [coldPrice, hotPrice]] of PAIRS) {
    const pair = cafeProducts.filter((product) => product.name === name);
    const keepers = pair.filter((product) => product.deleted_at === null);
    const duplicates = pair.filter((product) => product.deleted_at !== null);
    if (pair.length !== 2 || !((keepers.length === 2 && duplicates.length === 0) || (keepers.length === 1 && duplicates.length === 1))) {
      throw new Error(`Expected two pre-migration rows or one retained/one deleted row for ${name}; found ${keepers.length} retained / ${duplicates.length} deleted.`);
    }
    const keeper = keepers.length === 2 ? keepers.find((product) => product.subcategory_id === hot.id) : keepers[0];
    const duplicate = pair.find((product) => product.id !== keeper.id);
    if (!keeper || !duplicate || duplicate.subcategory_id !== cold.id) throw new Error(`Could not identify the expected Calientes keeper and Fríos duplicate for ${name}.`);
    // Before application the keeper is in Calientes; after application it has no subcategory.
    if (keeper.subcategory_id !== hot.id && keeper.subcategory_id !== null) throw new Error(`The retained ${name} is not the expected Calientes row.`);
    const targetVariants = variants(coldPrice, hotPrice);
    if (!keeper.has_variants || !sameJsonText(keeper.variants, targetVariants)) {
      diff("products", `[id=${keeper.id}, name=${JSON.stringify(name)}]`, "has_variants", keeper.has_variants, true);
      diff("products", `[id=${keeper.id}, name=${JSON.stringify(name)}]`, "variants (string JSON)", keeper.variants, targetVariants);
      writes.push(() => sql`UPDATE products SET has_variants = true, variants = ${targetVariants}, updated_at = NOW() WHERE id = ${keeper.id}`);
    }
    if (MILK_PRODUCTS.has(name)) {
      const tags = normalizeJson(keeper.flow_tags);
      if (JSON.stringify(tags) !== JSON.stringify(["con-leche"])) {
        diff("products", `[id=${keeper.id}, name=${JSON.stringify(name)}]`, "flow_tags", tags, ["con-leche"]);
        writes.push(() => sql`UPDATE products SET flow_tags = ${JSON.stringify(["con-leche"])}::jsonb, updated_at = NOW() WHERE id = ${keeper.id}`);
      }
    }
    if (keeper.subcategory_id !== null) {
      diff("products", `[id=${keeper.id}, name=${JSON.stringify(name)}]`, "subcategory_id", keeper.subcategory_id, null);
      writes.push(() => sql`UPDATE products SET subcategory_id = NULL, updated_at = NOW() WHERE id = ${keeper.id} AND subcategory_id IS NOT NULL`);
    }
    if (duplicate.deleted_at === null) {
      diff("products", `[id=${duplicate.id}, name=${JSON.stringify(name)}]`, "deleted_at", null, "NOW() (soft delete duplicate Frío)");
      // Convención del repo: un soft delete pone deleted_at Y active=false. El
      // endpoint de productos del api-server NO filtra deleted_at y el modelo
      // Product de Swift ni conoce esa columna, así que sin active=false el POS
      // seguiría pintando el duplicado en el grid.
      diff("products", `[id=${duplicate.id}, name=${JSON.stringify(name)}]`, "active", true, false);
      writes.push(() => sql`UPDATE products SET deleted_at = NOW(), active = false, updated_at = NOW() WHERE id = ${duplicate.id} AND deleted_at IS NULL`);
    }
  }

  // These products have an inherent temperature, so a one-item variant would add a POS tap without conveying a choice.
  console.log("RECOMENDACIÓN — Coffee tonic y Tissana Frutal: dejarlos sin variantes. Solo tienen una temperatura inherente (Frío/Caliente) y una variante única añadiría un tap obligatorio sin decisión del usuario; al desprenderlos de las subcategorías se elimina el bug de Tipo de leche.");
  for (const name of ["Coffee tonic", "Tissana Frutal", "Espresso"]) {
    const matches = cafeProducts.filter((product) => product.name === name);
    if (matches.length !== 1) throw new Error(`Expected one ${name}, found ${matches.length}.`);
    const product = matches[0];
    if (product.subcategory_id !== null) {
      diff("products", `[id=${product.id}, name=${JSON.stringify(name)}]`, "subcategory_id", product.subcategory_id, null);
      writes.push(() => sql`UPDATE products SET subcategory_id = NULL, updated_at = NOW() WHERE id = ${product.id} AND subcategory_id IS NOT NULL`);
    }
  }

  const milkStep = modifierSteps.find((step) => step.subcategory_id === hot.id && step.step_name === "Tipo de Leche");
  if (!milkStep) throw new Error('Calientes modifier step "Tipo de Leche" was not found.');
  if (milkStep.active) {
    diff("modifier_steps", `[id=${milkStep.id}, name="Tipo de Leche"]`, "active", true, false);
    writes.push(() => sql`UPDATE modifier_steps SET active = false WHERE id = ${milkStep.id} AND active = true`);
  } else console.log('SIN CAMBIOS: modifier_steps "Tipo de Leche" ya está retirado (active=false).');
  for (const subcategory of [cold, hot]) {
    if (subcategory.active) {
      diff("subcategories", `[id=${subcategory.id}, name=${JSON.stringify(subcategory.name)}]`, "active", true, false);
      writes.push(() => sql`UPDATE subcategories SET active = false WHERE id = ${subcategory.id} AND active = true`);
    }
  }

  let cafeFlowWillBeCreated = false;
  const cafeFlow = existingFlows.filter((flow) => flow.name === "Café" && flow.scope_kind === "category");
  if (cafeFlow.length) {
    if (!cafeFlow.some((flow) => flow.category_id === cafe.id)) throw new Error('A category flow named "Café" exists but does not target category Café; refusing to overwrite it.');
    console.log('SIN CAMBIOS: flujo de categoría Café ya existe.');
  } else {
    cafeFlowWillBeCreated = true;
    console.log("\nPLAN DEL GRAFO CAFÉ:");
    printCafeFlowDiff();
    if (apply) writes.unshift(() => createCafeFlow(cafe.id));
  }

  console.log("\nPRUEBA SELECT — base sin modificar por este dry-run:");
  const proof = await sql`SELECT name, deleted_at FROM products WHERE category_id = ${cafe.id} AND deleted_at IS NULL ORDER BY name, created_at`;
  console.log(`  SELECT devolvió ${proof.length} productos Café con deleted_at = NULL (esperado antes de aplicar: 15; tras aplicar: 9).`);
  for (const row of proof) console.log(`  ${row.name}: deleted_at = ${row.deleted_at === null ? "NULL" : row.deleted_at.toISOString()}`);
  if (!apply) {
    console.log(`\nDRY-RUN COMPLETO: ${writes.length + (cafeFlowWillBeCreated ? 1 : 0)} cambio(s) serían escritos. No se ejecutó --apply; la base no fue modificada.`);
    return;
  }
  for (const write of writes) await write();
  console.log(`\nAPLICADO: ${writes.length} cambio(s) de Café.`);
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exitCode = 1;
});
