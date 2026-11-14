/**
 * Motor de promociones — espejo EXACTO de
 * `Bruma POS/Bruma POS/Services/PromotionEngine.swift`, que es el que de verdad
 * cobra (el POS calcula el descuento y el api-server solo lo guarda). Aquí lo
 * usa el simulador del editor de promociones del dashboard.
 *
 * Los dos se fijan con `fixtures/engine-vectors.json`:
 *   TS:    npx tsx lib/promotions/__tests__/engine.test.ts
 *   Swift: ver la primera línea de `Bruma POS/PromotionEngineVectorVerification.swift`
 * Si cambias una regla, cámbiala en los dos y agrega su vector.
 *
 * Reglas:
 * 1. Cada pieza cuenta una sola vez: lo que toma una promoción ya no lo toma otra.
 * 2. Primero los combos, luego 2x1 / % / $; dentro de cada bloque, mayor
 *    `priority` primero (empate: orden de la lista).
 * 3. Todo es sobre la orden completa, sin importar el asiento.
 * 4. En los empates gana el negocio: lo gratis es lo más barato.
 */
import {
  type ComboConfig,
  type ComboGroup,
  type ComboItemReward,
  groupCategoryIds,
  groupProductRefs,
  parseComboConfig,
} from "./combo";

export interface PromoLine {
  productId: string;
  variantName?: string | null;
  categoryId?: string | null;
  unitPrice: number;
  quantity: number;
  /** Hijos de paquete, invitados y renglones excluidos a mano no participan. */
  eligible: boolean;
}

export interface PromoLineResult {
  promotionId: string | null;
  promotionName: string | null;
  /** Descuento total del renglón. */
  discount: number;
  /** Solo si TODAS las piezas llevan el mismo descuento. */
  newUnitPrice: number | null;
}

export interface EnginePromotion {
  id: string;
  name: string;
  type: string;
  applyTo: string;
  buyQuantity?: number | null;
  getQuantity?: number | null;
  discountPercentage?: number | string | null;
  discountAmount?: number | string | null;
  productIds?: string | null;
  categoryId?: string | null;
  priority?: number | null;
  comboRules?: string | null;
}

interface Unit {
  line: number;
  cents: number;
}

interface LineAcc {
  unitDiscounts: number[];
  byPromo: { id: string; name: string; cents: number }[];
  claimedUnits: number;
}

const num = (v: unknown) => {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : 0;
  return Number.isFinite(n) ? n : 0;
};
const toCents = (v: number) => Math.round(v * 100);
const percentCents = (cents: number, pct: number) => Math.min(cents, Math.round((cents * pct) / 100));

export function parseProductIds(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    // Filas viejas guardadas como arreglo de Postgres: `{id1,id2}`.
  }
  const t = value.trim();
  if (!t.startsWith("{") || !t.endsWith("}")) return [];
  return t
    .slice(1, -1)
    .split(",")
    .map((s) => s.replace(/^[\s"]+|[\s"]+$/g, ""))
    .filter(Boolean);
}

/** `"<productId>::<variante>"`, comparado sin espacios sobrantes (hay variantes reales como "Orden "). */
function refMatches(refs: string[], line: PromoLine): boolean {
  if (refs.includes(line.productId)) return true;
  if (line.variantName == null) return false;
  const key = `${line.productId}::${line.variantName.trim()}`;
  return refs.some((ref) => {
    const i = ref.indexOf("::");
    return i >= 0 && `${ref.slice(0, i)}::${ref.slice(i + 2).trim()}` === key;
  });
}

export function matchesGroup(group: ComboGroup, line: PromoLine): boolean {
  if (line.categoryId && groupCategoryIds(group).includes(line.categoryId)) return true;
  const refs = groupProductRefs(group);
  if (refs.includes(line.productId)) {
    const names = group.variantNames ?? [];
    if (names.length === 0 || line.variantName == null) return true;
    return names.map((n) => n.trim()).includes(line.variantName.trim());
  }
  return refMatches(refs, line);
}

export function matchesPromotion(promo: EnginePromotion, line: PromoLine): boolean {
  switch (promo.applyTo) {
    case "all_products":
      return true;
    case "specific_products":
      return refMatches(parseProductIds(promo.productIds), line);
    case "category":
      return !!line.categoryId && promo.categoryId === line.categoryId;
    default:
      return false;
  }
}

function itemRewardCents(reward: ComboItemReward, unitCents: number): number {
  const value = num(reward.value);
  switch (reward.type) {
    case "free":
      return unitCents;
    case "percent":
      return percentCents(unitCents, value);
    case "amount":
      return Math.min(unitCents, toCents(value));
    case "price":
      return Math.max(0, unitCents - toCents(value));
    default:
      return 0;
  }
}

/** Proporcional al precio; el residuo del redondeo va a la pieza más cara. */
function distribute(target: number, picks: number[], units: Unit[]): [number, number][] {
  const total = picks.reduce((s, u) => s + units[u].cents, 0);
  if (target <= 0 || total <= 0) return picks.map((u) => [u, 0]);
  const shares: [number, number][] = picks.map((u) => [u, Math.floor((units[u].cents * target) / total)]);
  const remainder = target - shares.reduce((s, [, c]) => s + c, 0);
  if (remainder !== 0) {
    let maxIndex = 0;
    shares.forEach(([u], i) => {
      if (units[u].cents > units[shares[maxIndex][0]].cents) maxIndex = i;
    });
    shares[maxIndex][1] += remainder;
  }
  return shares;
}

function comboPicks(config: ComboConfig, lines: PromoLine[], units: Unit[], initialClaimed: boolean[]): [number, number][] {
  const claimed = [...initialClaimed];
  const result: [number, number][] = [];
  const groups = config.groups.filter((g) => g.quantity > 0);
  if (groups.length === 0) return result;
  const candidateCounts = groups.map(
    (g) => units.filter((u, i) => !claimed[i] && matchesGroup(g, lines[u.line])).length,
  );
  const fillOrder = groups
    .map((_, i) => i)
    .sort((a, b) => (candidateCounts[a] !== candidateCounts[b] ? candidateCounts[a] - candidateCounts[b] : a - b));

  for (;;) {
    const taken: number[][] = groups.map(() => []);
    const used = new Set<number>();
    for (const g of fillOrder) {
      const picks: number[] = [];
      for (let i = 0; i < units.length && picks.length < groups[g].quantity; i++) {
        if (!claimed[i] && !used.has(i) && matchesGroup(groups[g], lines[units[i].line])) picks.push(i);
      }
      if (picks.length !== groups[g].quantity) return result;
      taken[g] = picks;
      picks.forEach((p) => used.add(p));
    }

    const discounts = new Map<number, number>();
    const all = taken.flat();
    const rewardType = config.reward.type;
    if (rewardType === "percent" || rewardType === "amount" || rewardType === "price") {
      const total = all.reduce((s, u) => s + units[u].cents, 0);
      const value = num(config.reward.value);
      const target =
        rewardType === "percent"
          ? percentCents(total, value)
          : rewardType === "amount"
            ? Math.min(total, toCents(value))
            : Math.max(0, total - toCents(value));
      for (const [u, c] of distribute(target, all, units)) discounts.set(u, c);
    } else {
      taken.forEach((picks, g) => {
        const reward = groups[g].reward;
        if (!reward || reward.type === "none") return;
        const count = Math.min(picks.length, reward.quantity ?? picks.length);
        for (const u of picks.slice(0, count)) discounts.set(u, itemRewardCents(reward, units[u].cents));
      });
    }

    const sum = [...discounts.values()].reduce((s, c) => s + c, 0);
    if (sum <= 0) return result;
    for (const u of all) {
      claimed[u] = true;
      result.push([u, discounts.get(u) ?? 0]);
    }
    if (!config.repeat) return result;
  }
}

export function evaluatePromotions(lines: PromoLine[], promotions: EnginePromotion[]): PromoLineResult[] {
  const results: PromoLineResult[] = lines.map(() => ({
    promotionId: null,
    promotionName: null,
    discount: 0,
    newUnitPrice: null,
  }));
  if (promotions.length === 0) return results;

  let units: Unit[] = [];
  lines.forEach((line, index) => {
    if (!line.eligible || line.quantity <= 0) return;
    const cents = toCents(line.unitPrice);
    if (cents <= 0) return;
    for (let q = 0; q < line.quantity; q++) units.push({ line: index, cents });
  });
  units = units
    .map((u, i) => ({ u, i }))
    .sort((a, b) => (a.u.cents !== b.u.cents ? a.u.cents - b.u.cents : a.i - b.i))
    .map(({ u }) => u);
  const claimed = units.map(() => false);
  const acc: LineAcc[] = lines.map(() => ({ unitDiscounts: [], byPromo: [], claimedUnits: 0 }));

  const record = (promo: EnginePromotion, unitIndex: number, cents: number) => {
    const line = units[unitIndex].line;
    claimed[unitIndex] = true;
    acc[line].claimedUnits += 1;
    acc[line].unitDiscounts.push(cents);
    const entry = acc[line].byPromo.find((e) => e.id === promo.id);
    if (entry) entry.cents += cents;
    else acc[line].byPromo.push({ id: promo.id, name: promo.name, cents });
  };

  const ordered = promotions
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      const pa = a.p.priority ?? 0;
      const pb = b.p.priority ?? 0;
      return pa !== pb ? pb - pa : a.i - b.i;
    })
    .map(({ p }) => p);

  for (const promo of ordered) {
    if (promo.type !== "combo") continue;
    const config = parseComboConfig({ ...promo, comboRules: promo.comboRules ?? null });
    if (!config) continue;
    for (const [u, c] of comboPicks(config, lines, units, claimed)) record(promo, u, c);
  }

  for (const promo of ordered) {
    if (promo.type === "combo") continue;
    const matching = units.map((_, i) => i).filter((i) => !claimed[i] && matchesPromotion(promo, lines[units[i].line]));
    if (matching.length === 0) continue;
    switch (promo.type) {
      case "buy_x_get_y": {
        const buy = Math.max(1, promo.buyQuantity ?? 2);
        const get = Math.min(buy, Math.max(0, promo.getQuantity ?? 1));
        const sets = Math.floor(matching.length / buy);
        if (sets <= 0 || get <= 0) break;
        const free = matching.slice(0, sets * get);
        const paidCount = sets * (buy - get);
        const paid = paidCount > 0 ? matching.slice(-paidCount) : [];
        for (const u of free) record(promo, u, units[u].cents);
        for (const u of paid) record(promo, u, 0);
        break;
      }
      case "percentage_discount": {
        const pct = num(promo.discountPercentage);
        if (pct <= 0) break;
        for (const u of matching) record(promo, u, percentCents(units[u].cents, pct));
        break;
      }
      case "fixed_discount": {
        const amount = toCents(num(promo.discountAmount));
        if (amount <= 0) break;
        for (const u of matching) record(promo, u, Math.min(units[u].cents, amount));
        break;
      }
    }
  }

  lines.forEach((line, index) => {
    const a = acc[index];
    if (a.claimedUnits === 0) return;
    let best = a.byPromo[0];
    for (const entry of a.byPromo.slice(1)) if (entry.cents > best.cents) best = entry;
    const total = a.unitDiscounts.reduce((s, c) => s + c, 0);
    const unitCents = toCents(line.unitPrice);
    const uniform =
      total > 0 && a.claimedUnits === line.quantity && new Set(a.unitDiscounts).size === 1;
    results[index] = {
      promotionId: best.id,
      promotionName: best.name,
      discount: total / 100,
      newUnitPrice: uniform ? (unitCents - a.unitDiscounts[0]) / 100 : null,
    };
  });
  return results;
}
