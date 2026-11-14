/**
 * Formato de `promotions.combo_rules`.
 *
 * v2 (editor actual): objeto `{ version: 2, groups, reward, repeat }`. Cada
 * grupo es "N piezas de estos platillos/categorías" y puede llevar su propio
 * premio ("el refresco gratis"), o el combo completo lleva uno (% / $ / precio
 * especial).
 *
 * Legacy: arreglo de reglas; el descuento vivía en `discountPercentage` (% al
 * combo) o `discountAmount` ($ a CADA platillo del combo). Un build viejo del
 * POS no entiende el objeto v2 y simplemente no aplica el combo (falla seguro).
 *
 * Espejo: `Bruma POS/Bruma POS/Models/Promotion.swift` (`ComboConfig`).
 */

export type ComboItemRewardType = "none" | "free" | "percent" | "amount" | "price";
export type ComboRewardType = "items" | "percent" | "amount" | "price";

export interface ComboItemReward {
  type: ComboItemRewardType;
  value?: number | null;
  /** A cuántas piezas del grupo aplica (las más baratas). Vacío = todas. */
  quantity?: number | null;
}

export interface ComboGroup {
  label?: string | null;
  quantity: number;
  /** `"<productId>"` (todas sus variantes) o `"<productId>::<variante>"`. */
  productIds?: string[];
  /** Toda la categoría, incluidos los platillos que se agreguen después. */
  categoryIds?: string[];
  reward?: ComboItemReward | null;
  // Legacy
  productId?: string | null;
  categoryId?: string | null;
  variantNames?: string[] | null;
}

export interface ComboConfig {
  version: 2;
  groups: ComboGroup[];
  reward: { type: ComboRewardType; value?: number | null };
  repeat: boolean;
}

interface PromotionLike {
  type: string;
  comboRules: string | null;
  discountPercentage?: number | string | null;
  discountAmount?: number | string | null;
}

function num(value: unknown): number {
  const n = typeof value === "string" ? parseFloat(value) : typeof value === "number" ? value : 0;
  return Number.isFinite(n) ? n : 0;
}

/** Lee `combo_rules` (v2 o legacy) y lo devuelve normalizado a v2. */
export function parseComboConfig(promo: PromotionLike): ComboConfig | null {
  if (promo.type !== "combo" || !promo.comboRules) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(promo.comboRules);
  } catch {
    return null;
  }
  if (raw && !Array.isArray(raw) && typeof raw === "object" && "version" in raw) {
    const v2 = raw as Partial<ComboConfig>;
    if (!Array.isArray(v2.groups) || v2.groups.length === 0) return null;
    return {
      version: 2,
      groups: v2.groups,
      reward: v2.reward ?? { type: "items" },
      repeat: v2.repeat ?? true,
    };
  }
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const legacy = raw as ComboGroup[];
  const pct = num(promo.discountPercentage);
  const amt = num(promo.discountAmount);
  if (pct > 0) return { version: 2, groups: legacy, reward: { type: "percent", value: pct }, repeat: true };
  if (amt > 0) {
    return {
      version: 2,
      groups: legacy.map((g) => ({ ...g, reward: { type: "amount", value: amt } })),
      reward: { type: "items" },
      repeat: true,
    };
  }
  return null;
}

export function groupProductRefs(group: ComboGroup): string[] {
  return [...(group.productId ? [group.productId] : []), ...(group.productIds ?? [])];
}

export function groupCategoryIds(group: ComboGroup): string[] {
  return [...(group.categoryId ? [group.categoryId] : []), ...(group.categoryIds ?? [])];
}

/**
 * Pasa un grupo legacy (`productId`/`categoryId`/`variantNames` sueltos) al
 * formato del editor: refs `id::variante` explícitos. Las variantes se
 * resuelven contra el catálogo actual porque `variantNames` era una lista
 * plana compartida por todos los productos del grupo.
 */
export function normalizeGroupForEditor(
  group: ComboGroup,
  variantsOf: (productId: string) => string[],
): ComboGroup {
  const names = (group.variantNames ?? []).map((n) => n.trim()).filter(Boolean);
  const productIds: string[] = [];
  for (const ref of groupProductRefs(group)) {
    if (ref.includes("::") || names.length === 0) {
      productIds.push(ref);
      continue;
    }
    const variants = variantsOf(ref);
    const picked = variants.filter((v) => names.includes(v.trim()));
    if (variants.length === 0 || picked.length === 0 || picked.length === variants.length) productIds.push(ref);
    else productIds.push(...picked.map((v) => `${ref}::${v}`));
  }
  return {
    label: group.label ?? null,
    quantity: Math.max(1, group.quantity || 1),
    productIds,
    categoryIds: groupCategoryIds(group),
    reward: group.reward ?? { type: "none" },
  };
}
