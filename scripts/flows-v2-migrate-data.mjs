import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

// This migration is intentionally read-only unless --apply is supplied.
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
if (resolve(process.cwd()) !== repositoryRoot) {
  throw new Error("Run node scripts/flows-v2-migrate-data.mjs from the repository root.");
}
const unknownArguments = process.argv.slice(2).filter((argument) => argument !== "--apply");
if (unknownArguments.length) throw new Error(`Unknown arguments: ${unknownArguments.join(", ")}`);
const apply = process.argv.includes("--apply");
const envContents = readFileSync(resolve(repositoryRoot, ".env"), "utf8");
const databaseUrl = envContents.match(/^DATABASE_URL\s*=\s*(.+)$/m)?.[1].trim().replace(/^['"]|['"]$/g, "");
if (!databaseUrl) throw new Error("DATABASE_URL is missing from .env.");
const sql = neon(databaseUrl);

const PENDING_DELTA_CATEGORIES = ["Ceviches", "Pescado", "Especiales"];
const PACKAGE_CATEGORIES = new Map([
  ["Aguachiles", "61.00"], ["Camarones", "49.00"], ["Caldos", "64.00"],
  ["Ceviches", null], ["Pescado", null], ["Especiales", null],
]);
const PACKAGE_PRODUCTS = ["Paquete aguachile", "Paquete camarones", "Paquete caldo camarón"];

function display(value) {
  if (value === null || value === undefined) return "∅";
  if (typeof value === "string") return JSON.stringify(value);
  return JSON.stringify(value);
}
function diff(table, row, column, before, after) {
  console.log(`  ${table} ${row} | ${column}: ${display(before)} → ${display(after)}`);
}
function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
function parseSteps(text, productName) {
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error("not an array");
    return parsed;
  } catch (error) {
    throw new Error(`product_flows.steps for ${productName} is invalid JSON: ${error.message}`);
  }
}

async function createFlow(spec) {
  const [definition] = await sql`
    INSERT INTO flow_definitions (name, description, scope_kind, priority, active)
    VALUES (${spec.name}, ${spec.description}, ${spec.scopeKind}, ${spec.priority}, true)
    RETURNING id
  `;
  for (const target of spec.targets) {
    await sql`
      INSERT INTO flow_targets (flow_id, mode, category_id, subcategory_id, product_id)
      VALUES (${definition.id}, 'include', ${target.categoryId ?? null}, ${target.subcategoryId ?? null}, ${target.productId ?? null})
    `;
  }
  const nodeIds = new Map();
  const optionIds = new Map();
  for (const node of spec.nodes) {
    const [created] = await sql`
      INSERT INTO flow_nodes (flow_id, title, select_mode, min_selections, max_selections, include_none_option, none_label, is_entry, pos_x, pos_y, sort_order, active)
      VALUES (${definition.id}, ${node.title}, ${node.selectMode}, ${node.minSelections}, ${node.maxSelections}, ${node.includeNoneOption}, ${node.noneLabel ?? null}, ${node.isEntry}, ${node.posX}, ${node.posY}, ${node.sortOrder}, true)
      RETURNING id
    `;
    nodeIds.set(node.key, created.id);
    for (const option of node.options) {
      const [createdOption] = await sql`
        INSERT INTO flow_node_options (node_id, source, label, ref_product_id, ref_category_id, ref_variant_name, allow_variant_choice, price_mode, price_delta, emits_child_item, sort_order, active)
        VALUES (${created.id}, ${option.source}, ${option.label ?? null}, ${option.refProductId ?? null}, ${option.refCategoryId ?? null}, ${option.refVariantName ?? null}, ${option.allowVariantChoice ?? false}, ${option.priceMode}, ${option.priceDelta}, ${option.emitsChildItem ?? false}, ${option.sortOrder}, true)
        RETURNING id
      `;
      optionIds.set(option.key, createdOption.id);
      for (const override of option.overrides ?? []) {
        await sql`
          INSERT INTO flow_option_price_overrides (option_id, category_id, subcategory_id, product_id, price_delta)
          VALUES (${createdOption.id}, ${override.categoryId ?? null}, ${override.subcategoryId ?? null}, ${override.productId ?? null}, ${override.priceDelta})
        `;
      }
    }
  }
  for (const edge of spec.edges) {
    await sql`
      INSERT INTO flow_edges (flow_id, from_node_id, from_option_id, to_node_id, condition, sort_order)
      VALUES (${definition.id}, ${nodeIds.get(edge.from)}, ${edge.fromOption ? optionIds.get(edge.fromOption) : null}, ${edge.to ? nodeIds.get(edge.to) : null}, ${edge.condition ? JSON.stringify(edge.condition) : null}::jsonb, ${edge.sortOrder})
    `;
  }
}

function printFlowDiff(spec) {
  const flowRow = `[name=${JSON.stringify(spec.name)}, scope=${spec.scopeKind}]`;
  diff("flow_definitions", flowRow, "name", null, spec.name);
  diff("flow_definitions", flowRow, "scope_kind", null, spec.scopeKind);
  diff("flow_definitions", flowRow, "priority", null, spec.priority);
  for (const target of spec.targets) diff("flow_targets", flowRow, "include", null, target.label);
  for (const node of spec.nodes) {
    const nodeRow = `[flow=${JSON.stringify(spec.name)}, title=${JSON.stringify(node.title)}]`;
    diff("flow_nodes", nodeRow, "select_mode", null, node.selectMode);
    diff("flow_nodes", nodeRow, "min/max", null, { min: node.minSelections, max: node.maxSelections });
    diff("flow_nodes", nodeRow, "is_entry", null, node.isEntry);
    for (const option of node.options) {
      diff("flow_node_options", nodeRow, "option", null, {
        label: option.label, source: option.source, refProduct: option.refProductLabel, refCategory: option.refCategoryLabel,
        refVariant: option.refVariantName, allowVariantChoice: option.allowVariantChoice ?? false,
        priceMode: option.priceMode, priceDelta: option.priceDelta, emitsChildItem: option.emitsChildItem ?? false,
      });
      for (const override of option.overrides ?? []) diff("flow_option_price_overrides", nodeRow, "category price_delta", null, { category: override.categoryLabel, priceDelta: override.priceDelta });
    }
  }
  for (const edge of spec.edges) diff("flow_edges", flowRow, "edge", null, { from: edge.from, option: edge.fromOption ?? "any", to: edge.to ?? "fin", condition: edge.condition ?? null, sortOrder: edge.sortOrder });
}

async function main() {
  console.log(`${apply ? "APLICANDO" : "DRY-RUN (sin escrituras)"}: Flows v2 — datos legacy y Paquete`);
  const [categories, products, productFlows, modifierSteps, existingFlows, historicalOrphans] = await Promise.all([
    sql`SELECT id, name, active FROM categories ORDER BY name`,
    sql`SELECT p.id, p.name, p.category_id, p.subcategory_id, p.price, p.active, p.deleted_at, p.has_variants, p.variants FROM products p ORDER BY p.name, p.id`,
    sql`SELECT pf.product_id, pf.use_default_flow, pf.steps, p.name FROM product_flows pf JOIN products p ON p.id = pf.product_id WHERE pf.use_default_flow = false ORDER BY p.name`,
    sql`SELECT ms.id, ms.category_id, ms.subcategory_id, ms.step_name, ms.step_type, ms.sort_order, ms.is_required, ms.allow_multiple, ms.include_none_option, ms.active, COALESCE(json_agg(json_build_object('name', mo.name, 'price', mo.price, 'sortOrder', mo.sort_order, 'active', mo.active) ORDER BY mo.sort_order) FILTER (WHERE mo.id IS NOT NULL), '[]') AS options FROM modifier_steps ms LEFT JOIN modifier_options mo ON mo.step_id = ms.id GROUP BY ms.id ORDER BY ms.id`,
    sql`SELECT fd.id, fd.name, fd.scope_kind, ft.category_id, ft.subcategory_id, ft.product_id FROM flow_definitions fd LEFT JOIN flow_targets ft ON ft.flow_id = fd.id AND ft.mode = 'include' ORDER BY fd.id`,
    sql`SELECT oi.id FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.product_id IS NOT NULL AND p.id IS NULL LIMIT 10`,
  ]);
  if (historicalOrphans.length) throw new Error(`Historical order_items already orphaned: ${historicalOrphans.map((row) => row.id).join(", ")}`);
  console.log("VALIDACIÓN historial: 0 order_items con product_id huérfano. ✓");

  const categoryByName = new Map(categories.map((row) => [row.name, row]));
  const requiredCategories = [...PACKAGE_CATEGORIES.keys(), "Bebidas", "Paquetes"];
  for (const name of requiredCategories) if (!categoryByName.has(name)) throw new Error(`Required category not found: ${name}`);
  const productByName = new Map();
  for (const product of products) {
    const values = productByName.get(product.name) ?? [];
    values.push(product);
    productByName.set(product.name, values);
  }
  const oneProduct = (name) => {
    const matches = productByName.get(name)?.filter((product) => product.deleted_at === null) ?? [];
    if (matches.length !== 1) throw new Error(`Expected exactly one non-deleted product named ${JSON.stringify(name)}, found ${matches.length}`);
    return matches[0];
  };
  const targetSet = new Set(existingFlows.map((row) => `${row.scope_kind}:${row.name}:${row.category_id ?? row.subcategory_id ?? row.product_id ?? ""}`));
  const isFlowPresent = (scopeKind, name, targetId) => targetSet.has(`${scopeKind}:${name}:${targetId}`);
  const planned = [];

  // The four real product overrides exclude the three legacy package products.
  const legacyFlows = productFlows.filter((flow) => !PACKAGE_PRODUCTS.includes(flow.name));
  if (legacyFlows.length !== 4) throw new Error(`Expected 4 non-package product_flows, found ${legacyFlows.length}: ${legacyFlows.map((flow) => flow.name).join(", ")}`);
  for (const legacy of legacyFlows) {
    const name = `Migración legacy: ${legacy.name.trim()}`;
    if (isFlowPresent("product", name, legacy.product_id)) {
      console.log(`SIN CAMBIOS: ${name} ya existe para ${legacy.name}.`);
      continue;
    }
    const steps = parseSteps(legacy.steps, legacy.name);
    if (!steps.length) throw new Error(`${legacy.name} has no legacy steps to migrate.`);
    const nodes = steps.map((step, index) => ({
      key: `legacy-${index}`, title: step.stepName, selectMode: step.allowMultiple ? "multi" : "single",
      minSelections: step.isRequired ? 1 : 0, maxSelections: step.allowMultiple ? null : 1,
      includeNoneOption: step.includeNoneOption, noneLabel: null, isEntry: index === 0, posX: 0, posY: index * 180, sortOrder: index,
      options: (step.options ?? []).filter((option) => option.active !== false).map((option, optionIndex) => ({
        key: `legacy-${index}-option-${optionIndex}`, label: option.name, source: "manual", priceMode: "delta", priceDelta: String(option.price ?? 0), sortOrder: option.sortOrder ?? optionIndex,
      })),
    }));
    const spec = {
      name, description: `Migrado sin alterar el flujo legacy de producto ${legacy.name}.`, scopeKind: "product", priority: 0,
      targets: [{ productId: legacy.product_id, label: `producto ${legacy.name}` }], nodes,
      edges: nodes.map((node, index) => ({ from: node.key, to: nodes[index + 1]?.key ?? null, sortOrder: 0 })),
    };
    planned.push(spec);
  }

  const bebidasStep = modifierSteps.find((step) => step.category_id === categoryByName.get("Bebidas").id && step.step_name === "Bebida Preparada" && step.active);
  if (!bebidasStep) throw new Error('Active modifier step "Bebida Preparada" for Bebidas was not found.');
  const bebidasName = "Migración legacy: Bebidas — Bebida Preparada";
  if (isFlowPresent("category", bebidasName, categoryByName.get("Bebidas").id)) {
    console.log(`SIN CAMBIOS: ${bebidasName} ya existe.`);
  } else {
    const spec = {
      name: bebidasName, description: "Migrado desde modifier_steps; el registro legacy se conserva para compatibilidad.", scopeKind: "category", priority: 0,
      targets: [{ categoryId: categoryByName.get("Bebidas").id, label: "categoría Bebidas" }],
      nodes: [{ key: "bebida-preparada", title: bebidasStep.step_name, selectMode: bebidasStep.allow_multiple ? "multi" : "single", minSelections: bebidasStep.is_required ? 1 : 0, maxSelections: bebidasStep.allow_multiple ? null : 1, includeNoneOption: bebidasStep.include_none_option, noneLabel: null, isEntry: true, posX: 0, posY: 0, sortOrder: bebidasStep.sort_order, options: bebidasStep.options.filter((option) => option.active !== false).map((option, index) => ({ key: `bebida-preparada-${index}`, label: option.name, source: "manual", priceMode: "delta", priceDelta: String(option.price), sortOrder: option.sortOrder ?? index })) }],
      edges: [{ from: "bebida-preparada", to: null, sortOrder: 0 }],
    };
    planned.push(spec);
  }

  const packageName = "Paquete";
  const packageTargetIds = [...PACKAGE_CATEGORIES.keys()].map((name) => categoryByName.get(name).id);
  const packageExisting = existingFlows.filter((row) => row.scope_kind === "global" && row.name === packageName);
  if (packageExisting.length) {
    const foundTargets = new Set(packageExisting.map((row) => row.category_id).filter(Boolean));
    if (packageExisting.length < packageTargetIds.length || packageTargetIds.some((id) => !foundTargets.has(id))) throw new Error('A global flow named "Paquete" already exists but does not have the complete expected include targets; refusing to duplicate or overwrite it.');
    console.log('SIN CAMBIOS: flujo global Paquete ya existe con los seis targets.');
  } else {
    const productRef = (label, actualName, extra = {}) => ({ ...extra, label, source: "product", refProductId: oneProduct(actualName).id, refProductLabel: actualName, priceMode: extra.priceMode ?? "free", priceDelta: extra.priceDelta ?? "0.00", emitsChildItem: true });
    const limonada = oneProduct("Limonada");
    const naranjada = oneProduct("Naranjada");
    const variantNamed = (product, desired) => {
      const variants = JSON.parse(product.variants ?? "[]");
      const found = variants.find((variant) => String(variant.name).trim() === desired);
      if (!found) throw new Error(`${product.name} does not have variant ${desired}`);
      return found.name;
    };
    const packageSpec = {
      name: packageName, description: "Paquete dinámico: plato + entrada + bebida.", scopeKind: "global", priority: 100,
      targets: [...PACKAGE_CATEGORIES.keys()].map((name) => ({ categoryId: categoryByName.get(name).id, label: `categoría ${name}` })),
      nodes: [
        { key: "package", title: "¿Paquete?", selectMode: "single", minSelections: 1, maxSelections: 1, includeNoneOption: false, isEntry: true, posX: 0, posY: 0, sortOrder: 0, options: [
          { key: "solo", label: "Solo el plato", source: "manual", priceMode: "free", priceDelta: "0.00", sortOrder: 0 },
          { key: "hacer", label: "Hacer paquete", source: "manual", priceMode: "delta", priceDelta: "0.00", sortOrder: 1, overrides: [...PACKAGE_CATEGORIES.entries()].filter(([, delta]) => delta !== null).map(([name, delta]) => ({ categoryId: categoryByName.get(name).id, categoryLabel: name, priceDelta: delta })) },
        ] },
        { key: "entrada", title: "Entrada", selectMode: "single", minSelections: 1, maxSelections: 1, includeNoneOption: false, isEntry: false, posX: 360, posY: 0, sortOrder: 1, options: [
          productRef("Pescadito", "Pescaditos fritos", { key: "pescadito", refVariantName: "Pieza", sortOrder: 0 }),
          productRef("Empanada de camarón", "Empanada de camarón", { key: "emp-cam", priceMode: "delta", priceDelta: "20.00", sortOrder: 1 }),
          productRef("Empanada de pulpo", "Empanada de pulpo", { key: "emp-pul", priceMode: "delta", priceDelta: "20.00", sortOrder: 2 }),
          productRef("Empanada Mixta", "Empanada Mixta", { key: "emp-mix", priceMode: "delta", priceDelta: "20.00", sortOrder: 3 }),
          productRef("Quesadilla de camarón", "Quesadilla de camarón", { key: "ques-cam", allowVariantChoice: true, sortOrder: 4 }),
          productRef("Quesadilla pulpo", "Quesadilla pulpo al ajillo", { key: "ques-pul", allowVariantChoice: true, sortOrder: 5 }),
          productRef("Quesadilla de Pescado", "Quesadilla de Pescado", { key: "ques-pesc", allowVariantChoice: true, sortOrder: 6 }),
        ] },
        { key: "bebida", title: "Bebida", selectMode: "single", minSelections: 1, maxSelections: 1, includeNoneOption: false, isEntry: false, posX: 720, posY: 0, sortOrder: 2, options: [
          { key: "bebidas-category", source: "category", label: null, refCategoryId: categoryByName.get("Bebidas").id, refCategoryLabel: "Bebidas", priceMode: "free", priceDelta: "0.00", emitsChildItem: true, sortOrder: 0 },
          productRef("Limonada - Mineral", "Limonada", { key: "limonada-mineral", refVariantName: variantNamed(limonada, "Mineral"), priceMode: "delta", priceDelta: "10.00", sortOrder: 1 }),
          productRef("Naranjada - Mineral", "Naranjada", { key: "naranjada-mineral", refVariantName: variantNamed(naranjada, "Mineral"), priceMode: "delta", priceDelta: "10.00", sortOrder: 2 }),
          productRef("Sangría (prep)", "Sangría", { key: "sangria-prep", priceMode: "delta", priceDelta: "10.00", sortOrder: 3 }),
          productRef("Agua mineral (prep)", "Agua mineral", { key: "agua-prep", priceMode: "delta", priceDelta: "10.00", sortOrder: 4 }),
        ] },
      ],
      edges: [
        { from: "package", fromOption: "solo", to: null, sortOrder: 0 }, { from: "package", fromOption: "hacer", to: "entrada", sortOrder: 1 },
        { from: "entrada", to: "bebida", sortOrder: 0 }, { from: "bebida", to: null, sortOrder: 0 },
      ],
    };
    planned.push(packageSpec);
  }

  console.log("\nPLAN DE CAMBIOS:");
  if (!planned.length) console.log("  No hay flow_definitions nuevas que crear.");
  for (const spec of planned) printFlowDiff(spec);
  console.log("\nDELTA PENDIENTE DE DEFINIR POR EL USUARIO:");
  for (const name of PENDING_DELTA_CATEGORIES) console.log(`  - ${name}: target include creado, sin flow_option_price_override; usará el price_delta base de “Hacer paquete” (0.00) hasta definición explícita.`);

  const packageRows = products.filter((product) => PACKAGE_PRODUCTS.includes(product.name));
  if (packageRows.length !== 3) throw new Error(`Expected the three legacy package products, found ${packageRows.length}.`);
  const packageCategory = categoryByName.get("Paquetes");
  const writes = [];
  for (const product of packageRows) {
    if (product.deleted_at === null) {
      diff("products", `[id=${product.id}, name=${JSON.stringify(product.name)}]`, "deleted_at", null, "NOW() (soft delete)");
      // Convención del repo: un soft delete pone deleted_at Y active=false. El
      // endpoint de productos del api-server NO filtra deleted_at y el modelo
      // Product de Swift ni conoce esa columna, así que sin active=false el POS
      // seguiría pintando el producto retirado.
      diff("products", `[id=${product.id}, name=${JSON.stringify(product.name)}]`, "active", true, false);
      writes.push(() => sql`UPDATE products SET deleted_at = NOW(), active = false, updated_at = NOW() WHERE id = ${product.id} AND deleted_at IS NULL`);
    } else console.log(`SIN CAMBIOS: ${product.name} ya tiene deleted_at=${product.deleted_at.toISOString()}.`);
  }
  if (packageCategory.active) {
    diff("categories", `[id=${packageCategory.id}, name="Paquetes"]`, "active", true, false);
    writes.push(() => sql`UPDATE categories SET active = false WHERE id = ${packageCategory.id} AND active = true`);
  } else console.log("SIN CAMBIOS: categoría Paquetes ya está inactiva.");

  const validationCases = [
    ["Aguachile Verde", "61.00", "280.00"], ["Camarones Coco", "49.00", "235.00"], ["Caldo de camarón", "64.00", "169.00"], ["En crema chipotle", "49.00", "218.00"],
  ];
  console.log("\nVALIDACIÓN DE PRECIOS §4.2:");
  for (const [name, delta, expected] of validationCases) {
    const product = oneProduct(name);
    const actual = (Number(product.price) + Number(delta)).toFixed(2);
    const pass = actual === expected;
    console.log(`  ${pass ? "✓" : "✗"} ${name}: ${Number(product.price).toFixed(2)} + ${delta} = ${actual}; esperado ${expected}${name === "En crema chipotle" ? " (cambio aceptado)" : ""}`);
    if (!pass) throw new Error(`Price validation failed for ${name}.`);
  }

  console.log("\nPRUEBA SELECT — base sin modificar por este dry-run:");
  const packageProof = await sql`SELECT name, deleted_at FROM products WHERE name IN ('Paquete aguachile', 'Paquete camarones', 'Paquete caldo camarón') ORDER BY name`;
  for (const row of packageProof) console.log(`  ${row.name}: deleted_at = ${row.deleted_at === null ? "NULL" : row.deleted_at.toISOString()}`);
  if (!apply) {
    console.log(`\nDRY-RUN COMPLETO: ${planned.length} flujo(s) y ${writes.length} cambio(s) de soft-delete/desactivación serían escritos. No se ejecutó --apply; la base no fue modificada.`);
    return;
  }
  for (const spec of planned) await createFlow(spec);
  for (const write of writes) await write();
  console.log(`\nAPLICADO: ${planned.length} flujo(s) y ${writes.length} cambio(s) de catálogo.`);
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exitCode = 1;
});
