/**
 * Valida y normaliza el body de crear/editar promoción a columnas de
 * `promotions`. Espejo a mano: `api-server/src/lib/promotionInput.ts` (el POS
 * crea/edita contra el api-server; el dashboard contra Next).
 *
 * En PATCH se valida la promoción YA mezclada con la fila actual, para que un
 * cambio parcial (p. ej. solo `type`) no deje una promo imposible de aplicar.
 */

type Row = Record<string, unknown>;

const TYPES = ["buy_x_get_y", "percentage_discount", "fixed_discount", "combo"];
const APPLY_TO = ["all_products", "specific_products", "category"];
const ITEM_REWARDS = ["none", "free", "percent", "amount", "price"];
const COMBO_REWARDS = ["items", "percent", "amount", "price"];

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

/** Arreglos/objetos → texto JSON. Un texto se respeta tal cual. */
function jsonText(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

function parseJson(v: unknown): unknown {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return undefined;
  }
}

function validateCombo(raw: unknown, row: Row): string | null {
  const value = parseJson(raw);
  if (Array.isArray(value)) {
    if (value.length < 2) return "El combo necesita al menos 2 grupos";
    if (!(num(row.discountPercentage) ?? 0) && !(num(row.discountAmount) ?? 0)) return "El combo necesita un descuento";
    return null;
  }
  if (!value || typeof value !== "object") return "Configura los platillos del combo";
  const config = value as { version?: number; groups?: unknown; reward?: { type?: string; value?: unknown } };
  if (config.version !== 2 || !Array.isArray(config.groups) || config.groups.length === 0)
    return "Configura los platillos del combo";
  let anyItemReward = false;
  for (const [i, g] of (config.groups as Row[]).entries()) {
    const qty = num(g.quantity);
    if (!qty || qty < 1 || !Number.isInteger(qty)) return `Grupo ${i + 1}: la cantidad debe ser un número entero`;
    const refs = [...((g.productIds as unknown[]) ?? []), ...((g.categoryIds as unknown[]) ?? [])];
    if (refs.length === 0) return `Grupo ${i + 1}: elige al menos un platillo o categoría`;
    const reward = g.reward as { type?: string; value?: unknown; quantity?: unknown } | null | undefined;
    if (reward && reward.type && reward.type !== "none") {
      if (!ITEM_REWARDS.includes(reward.type)) return `Grupo ${i + 1}: premio inválido`;
      const v = num(reward.value) ?? 0;
      if (reward.type === "percent" && (v <= 0 || v > 100)) return `Grupo ${i + 1}: el % debe estar entre 1 y 100`;
      if (reward.type === "amount" && v <= 0) return `Grupo ${i + 1}: escribe el monto del descuento`;
      if (reward.type === "price" && v < 0) return `Grupo ${i + 1}: el precio no puede ser negativo`;
      const rq = num(reward.quantity);
      if (rq !== null && (rq < 1 || rq > qty)) return `Grupo ${i + 1}: el premio aplica a máximo ${qty} pieza(s)`;
      anyItemReward = true;
    }
  }
  const type = config.reward?.type ?? "items";
  if (!COMBO_REWARDS.includes(type)) return "Premio del combo inválido";
  const v = num(config.reward?.value);
  if (type === "items" && !anyItemReward) return "Marca qué platillo lleva el premio (gratis, % o $)";
  if (type === "percent" && (!v || v <= 0 || v > 100)) return "El % del combo debe estar entre 1 y 100";
  if (type === "amount" && (!v || v <= 0)) return "Escribe cuánto se descuenta al combo";
  if (type === "price" && (v === null || v < 0)) return "Escribe el precio del combo";
  return null;
}

/** Columnas a escribir a partir del body (solo los campos que vienen). */
export function promotionColumns(body: Row): Row {
  const out: Row = {};
  const has = (k: string) => body[k] !== undefined;
  if (has("name")) out.name = typeof body.name === "string" ? body.name.trim() : body.name;
  if (has("description")) out.description = body.description || null;
  if (has("type")) out.type = body.type;
  if (has("buyQuantity")) out.buyQuantity = num(body.buyQuantity);
  if (has("getQuantity")) out.getQuantity = num(body.getQuantity);
  if (has("discountPercentage")) out.discountPercentage = num(body.discountPercentage) ? String(num(body.discountPercentage)) : null;
  if (has("discountAmount")) out.discountAmount = num(body.discountAmount) ? String(num(body.discountAmount)) : null;
  if (has("applyTo")) out.applyTo = body.applyTo;
  if (has("productIds")) {
    const ids = parseJson(body.productIds);
    out.productIds = Array.isArray(ids) && ids.length > 0 ? JSON.stringify(ids) : null;
  }
  if (has("categoryId")) out.categoryId = body.categoryId || null;
  if (has("active")) out.active = body.active !== false;
  if (has("startDate")) out.startDate = body.startDate || null;
  if (has("endDate")) out.endDate = body.endDate || null;
  if (has("daysOfWeek")) {
    const days = parseJson(body.daysOfWeek);
    out.daysOfWeek = Array.isArray(days) && days.length > 0 ? JSON.stringify(days) : null;
  }
  if (has("startTime")) out.startTime = body.startTime || null;
  if (has("endTime")) out.endTime = body.endTime || null;
  if (has("priority")) out.priority = num(body.priority) ?? 0;
  if (has("comboRules")) out.comboRules = jsonText(body.comboRules);
  return out;
}

/**
 * Valida la promoción completa (fila actual + cambios) y ajusta lo que el
 * tipo no usa. Regresa el error para el usuario, o `null` si es válida.
 */
export function validatePromotion(row: Row): string | null {
  if (!row.name || !String(row.name).trim()) return "Escribe el nombre de la promoción";
  if (!TYPES.includes(String(row.type))) return "Tipo de promoción inválido";
  if (row.type !== "combo" && !APPLY_TO.includes(String(row.applyTo))) return "Elige a qué platillos aplica";

  switch (row.type) {
    case "buy_x_get_y": {
      const buy = num(row.buyQuantity) ?? 0;
      const get = num(row.getQuantity) ?? 0;
      if (buy < 2 || get < 1 || get >= buy) return "En Compra X lleva Y, los gratis deben ser menos que los que se compran (ej. 2x1)";
      break;
    }
    case "percentage_discount": {
      const pct = num(row.discountPercentage) ?? 0;
      if (pct <= 0 || pct > 100) return "El % de descuento debe estar entre 1 y 100";
      break;
    }
    case "fixed_discount":
      if ((num(row.discountAmount) ?? 0) <= 0) return "Escribe el monto del descuento";
      break;
    case "combo": {
      const error = validateCombo(row.comboRules, row);
      if (error) return error;
      break;
    }
  }

  if (row.type !== "combo") {
    if (row.applyTo === "specific_products" && !row.productIds) return "Elige al menos un platillo";
    if (row.applyTo === "category" && !row.categoryId) return "Elige la categoría";
  }
  if (row.startDate && row.endDate && String(row.startDate) > String(row.endDate))
    return "La fecha de fin es antes que la de inicio";
  return null;
}

/** Lo que el tipo no usa se limpia (un combo v2 lleva su descuento en `comboRules`). */
export function cleanupForType(row: Row): Row {
  const out = { ...row };
  if (out.type !== "buy_x_get_y") {
    out.buyQuantity = null;
    out.getQuantity = null;
  }
  if (out.type !== "percentage_discount" && !(out.type === "combo" && Array.isArray(parseJson(out.comboRules))))
    out.discountPercentage = null;
  if (out.type !== "fixed_discount" && !(out.type === "combo" && Array.isArray(parseJson(out.comboRules))))
    out.discountAmount = null;
  if (out.type === "combo") {
    out.applyTo = "all_products";
    out.productIds = null;
    out.categoryId = null;
  } else {
    out.comboRules = null;
  }
  return out;
}
