import type { Category, Product, Promotion } from "@/lib/types";
import { parseVariants } from "@/components/product-picker-utils";
import {
  type ComboConfig,
  type ComboGroup,
  type ComboItemReward,
  type ComboRewardType,
  normalizeGroupForEditor,
  parseComboConfig,
} from "@/lib/promotions/combo";
import { parseProductIds } from "@/lib/promotions/engine";
import { BRUMA_TZ } from "@/lib/time";

export type PromoType = Promotion["type"];

/** Selección del picker: categorías completas (incluye platillos futuros) + refs sueltos. */
export interface Selection {
  categoryIds: string[];
  /** `"<productId>"` o `"<productId>::<variante>"`. */
  refs: string[];
}

export interface DraftGroup {
  key: string;
  label: string;
  quantity: number;
  selection: Selection;
  reward: ComboItemReward;
}

export interface Draft {
  name: string;
  description: string;
  type: PromoType;
  buyQuantity: number;
  getQuantity: number;
  discountPercentage: number;
  discountAmount: number;
  /** null = todo el menú. */
  selection: Selection | null;
  groups: DraftGroup[];
  comboReward: { type: ComboRewardType; value: number };
  comboRepeat: boolean;
  active: boolean;
  startDate: string;
  endDate: string;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  priority: number;
}

export const WEEKDAYS = [
  { value: 1, short: "L", label: "Lun" },
  { value: 2, short: "M", label: "Mar" },
  { value: 3, short: "M", label: "Mié" },
  { value: 4, short: "J", label: "Jue" },
  { value: 5, short: "V", label: "Vie" },
  { value: 6, short: "S", label: "Sáb" },
  { value: 0, short: "D", label: "Dom" },
];

export const TYPE_META: Record<PromoType, { label: string; short: string; example: string; tone: string }> = {
  buy_x_get_y: { label: "Compra X, lleva Y", short: "2x1 / 3x2", example: "2x1 en tacos, 3x2 en aguas", tone: "emerald" },
  percentage_discount: { label: "% de descuento", short: "% desc.", example: "20% en toda la barra", tone: "sky" },
  fixed_discount: { label: "$ de descuento", short: "$ desc.", example: "$15 menos en cada empanada", tone: "amber" },
  combo: { label: "Combo", short: "Combo", example: "2 empanadas + refresco gratis", tone: "violet" },
};

/** Clases por tono (Tailwind necesita los nombres completos en el código). */
export const TONE: Record<string, { bg: string; text: string; ring: string; soft: string }> = {
  emerald: { bg: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400", ring: "ring-emerald-500/40", soft: "bg-emerald-500/10" },
  sky: { bg: "bg-sky-500", text: "text-sky-600 dark:text-sky-400", ring: "ring-sky-500/40", soft: "bg-sky-500/10" },
  amber: { bg: "bg-amber-500", text: "text-amber-600 dark:text-amber-400", ring: "ring-amber-500/40", soft: "bg-amber-500/10" },
  violet: { bg: "bg-violet-500", text: "text-violet-600 dark:text-violet-400", ring: "ring-violet-500/40", soft: "bg-violet-500/10" },
};

let keySeq = 0;
export const newKey = () => `g${Date.now().toString(36)}${(keySeq++).toString(36)}`;

export const emptySelection = (): Selection => ({ categoryIds: [], refs: [] });

export function newGroup(partial: Partial<DraftGroup> = {}): DraftGroup {
  return { key: newKey(), label: "", quantity: 1, selection: emptySelection(), reward: { type: "none" }, ...partial };
}

export const EMPTY_DRAFT: Draft = {
  name: "",
  description: "",
  type: "buy_x_get_y",
  buyQuantity: 2,
  getQuantity: 1,
  discountPercentage: 15,
  discountAmount: 20,
  selection: emptySelection(),
  groups: [newGroup({ label: "Platillos", quantity: 2 }), newGroup({ label: "Bebida", reward: { type: "free" } })],
  comboReward: { type: "items", value: 0 },
  comboRepeat: true,
  active: true,
  startDate: "",
  endDate: "",
  daysOfWeek: [],
  startTime: "",
  endTime: "",
  priority: 0,
};

const num = (v: unknown) => {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : 0;
  return Number.isFinite(n) ? n : 0;
};

function variantsOf(products: Product[]) {
  return (productId: string) =>
    parseVariants(products.find((p) => p.id === productId)?.variants).map((v) => v.name);
}

/** Ids viejos `${productId}-variant-${idx}` → `productId::variante`. */
function migrateLegacyRef(id: string, products: Product[]): string {
  const match = id.match(/^(.+)-variant-(\d+)$/);
  if (!match || id.includes("::")) return id;
  const product = products.find((p) => p.id === match[1]);
  const variant = product ? parseVariants(product.variants)[Number(match[2])] : undefined;
  return variant ? `${match[1]}::${variant.name}` : id;
}

export function draftFromPromotion(p: Promotion, products: Product[]): Draft {
  const base: Draft = {
    ...EMPTY_DRAFT,
    name: p.name,
    description: p.description ?? "",
    type: p.type,
    buyQuantity: p.buyQuantity ?? 2,
    getQuantity: p.getQuantity ?? 1,
    discountPercentage: num(p.discountPercentage) || EMPTY_DRAFT.discountPercentage,
    discountAmount: num(p.discountAmount) || EMPTY_DRAFT.discountAmount,
    selection:
      p.applyTo === "all_products"
        ? null
        : p.applyTo === "category"
          ? { categoryIds: p.categoryId ? [p.categoryId] : [], refs: [] }
          : { categoryIds: [], refs: dedupe(parseProductIds(p.productIds).map((id) => migrateLegacyRef(id, products))) },
    active: p.active,
    startDate: p.startDate ?? "",
    endDate: p.endDate ?? "",
    daysOfWeek: (() => {
      try {
        const d = p.daysOfWeek ? JSON.parse(p.daysOfWeek) : [];
        return Array.isArray(d) ? d : [];
      } catch {
        return [];
      }
    })(),
    startTime: p.startTime?.slice(0, 5) ?? "",
    endTime: p.endTime?.slice(0, 5) ?? "",
    priority: p.priority ?? 0,
  };
  if (p.type === "combo") {
    const config = parseComboConfig(p);
    if (config) {
      base.groups = config.groups.map((g, i) => {
        const n = normalizeGroupForEditor(g, variantsOf(products));
        return {
          key: newKey(),
          label: n.label || `Grupo ${i + 1}`,
          quantity: n.quantity,
          selection: { categoryIds: n.categoryIds ?? [], refs: n.productIds ?? [] },
          reward: n.reward ?? { type: "none" },
        };
      });
      base.comboReward = { type: config.reward.type, value: num(config.reward.value) };
      base.comboRepeat = config.repeat;
    }
  }
  return base;
}

function dedupe(ids: string[]) {
  return [...new Set(ids)];
}

/** Expande categorías completas a ids de producto (para promos que no son combo). */
function expandSelection(sel: Selection, products: Product[]): string[] {
  const fromCats = products.filter((p) => p.categoryId && sel.categoryIds.includes(p.categoryId)).map((p) => p.id);
  return dedupe([...fromCats, ...sel.refs]);
}

export function comboConfigFromDraft(d: Draft): ComboConfig {
  const perItem = d.comboReward.type === "items";
  return {
    version: 2,
    groups: d.groups.map<ComboGroup>((g) => ({
      label: g.label.trim() || null,
      quantity: g.quantity,
      categoryIds: g.selection.categoryIds,
      productIds: g.selection.refs,
      reward: perItem ? g.reward : { type: "none" },
    })),
    reward: perItem ? { type: "items" } : { type: d.comboReward.type, value: d.comboReward.value },
    repeat: d.comboRepeat,
  };
}

/** Body para POST/PATCH de `/api/promotions` (lo valida `lib/promotions/input.ts`). */
export function bodyFromDraft(d: Draft, products: Product[]) {
  const sel = d.selection;
  const onlyOneCategory = sel && sel.categoryIds.length === 1 && sel.refs.length === 0;
  return {
    name: d.name.trim(),
    description: d.description.trim() || null,
    type: d.type,
    buyQuantity: d.buyQuantity,
    getQuantity: d.getQuantity,
    discountPercentage: d.type === "percentage_discount" ? d.discountPercentage : null,
    discountAmount: d.type === "fixed_discount" ? d.discountAmount : null,
    applyTo: d.type === "combo" || !sel ? "all_products" : onlyOneCategory ? "category" : "specific_products",
    categoryId: onlyOneCategory ? sel.categoryIds[0] : null,
    // Varias categorías se guardan como sus platillos de hoy (la columna solo
    // admite una categoría); una sola categoría sí jala platillos futuros.
    productIds: d.type !== "combo" && sel && !onlyOneCategory ? expandSelection(sel, products) : null,
    comboRules: d.type === "combo" ? comboConfigFromDraft(d) : null,
    active: d.active,
    startDate: d.startDate || null,
    endDate: d.endDate || null,
    daysOfWeek: d.daysOfWeek,
    startTime: d.startTime || null,
    endTime: d.endTime || null,
    priority: d.priority,
  };
}

/** Promoción "como la guardaría el servidor", para el simulador. */
export function promotionFromDraft(d: Draft, products: Product[], id = "draft") {
  const body = bodyFromDraft(d, products);
  return {
    ...body,
    id,
    name: body.name || "Esta promoción",
    productIds: body.productIds ? JSON.stringify(body.productIds) : null,
    comboRules: body.comboRules ? JSON.stringify(body.comboRules) : null,
  };
}

// ───── Textos ─────

export const money = (n: number) =>
  `$${n.toLocaleString("es-MX", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

export function selectionLabel(sel: Selection | null, products: Product[], categories: Category[], max = 3): string {
  if (!sel) return "todo el menú";
  const names: string[] = [
    ...sel.categoryIds.map((id) => categories.find((c) => c.id === id)?.name ?? "categoría"),
    ...sel.refs.map((ref) => refLabel(ref, products)),
  ];
  if (names.length === 0) return "…";
  if (names.length <= max) return listJoin(names);
  return `${names.slice(0, max).join(", ")} y ${names.length - max} más`;
}

export function refLabel(ref: string, products: Product[]) {
  const [pid, variant] = ref.split("::");
  const name = products.find((p) => p.id === pid)?.name ?? "Platillo";
  return variant ? `${name} ${variant.trim()}` : name;
}

export function listJoin(items: string[]) {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

function rewardText(r: ComboItemReward, qty: number) {
  const v = num(r.value);
  const n = r.quantity && r.quantity < qty ? `${r.quantity} ` : "";
  switch (r.type) {
    case "free":
      return n ? `${n}gratis` : "gratis";
    case "percent":
      return `${n ? n + "con " : ""}${v}% menos`;
    case "amount":
      return `${n ? n + "con " : ""}${money(v)} menos`;
    case "price":
      return `${n ? n + "a " : "a "}${money(v)}`;
    default:
      return "";
  }
}

/** Una frase que cualquiera entiende: así se lee la promo en la lista y en el editor. */
export function summarize(d: Draft, products: Product[], categories: Category[]): string {
  const what = selectionLabel(d.selection, products, categories);
  switch (d.type) {
    case "buy_x_get_y":
      return `Compra ${d.buyQuantity} de ${what} y paga ${d.buyQuantity - d.getQuantity}. Sale gratis lo más barato.`;
    case "percentage_discount":
      return `${d.discountPercentage}% de descuento en ${what}.`;
    case "fixed_discount":
      return `${money(d.discountAmount)} menos en cada pieza de ${what}.`;
    case "combo": {
      const parts = d.groups.map((g) => {
        const label = selectionLabel(g.selection, products, categories, 2);
        return `${g.quantity} ${label}`;
      });
      const combo = parts.join(" + ");
      let reward = "";
      if (d.comboReward.type === "items") {
        const rewards = d.groups
          .filter((g) => g.reward.type !== "none")
          .map((g) => `${g.label.trim() || selectionLabel(g.selection, products, categories, 1)} ${rewardText(g.reward, g.quantity)}`);
        reward = rewards.length ? `→ ${listJoin(rewards)}` : "→ (marca qué platillo lleva el premio)";
      } else if (d.comboReward.type === "percent") reward = `→ ${d.comboReward.value}% menos al combo`;
      else if (d.comboReward.type === "amount") reward = `→ ${money(d.comboReward.value)} menos al combo`;
      else reward = `→ todo por ${money(d.comboReward.value)}`;
      return `${combo} ${reward}${d.comboRepeat ? "" : " (una vez por orden)"}`;
    }
  }
}

export function scheduleText(d: Pick<Draft, "startDate" | "endDate" | "daysOfWeek" | "startTime" | "endTime">): string {
  const parts: string[] = [];
  const days = [...d.daysOfWeek].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  if (days.length === 0 || days.length === 7) parts.push("Todos los días");
  else if (days.join() === "1,2,3,4,5") parts.push("Lunes a viernes");
  else if (days.join() === "6,0") parts.push("Fines de semana");
  else parts.push(days.map((v) => WEEKDAYS.find((w) => w.value === v)?.label).join(", "));
  if (d.startTime || d.endTime) parts.push(`${d.startTime || "abrir"}–${d.endTime || "cerrar"}`);
  else parts.push("todo el día");
  if (d.startDate && d.endDate) parts.push(`del ${shortDate(d.startDate)} al ${shortDate(d.endDate)}`);
  else if (d.startDate) parts.push(`desde el ${shortDate(d.startDate)}`);
  else if (d.endDate) parts.push(`hasta el ${shortDate(d.endDate)}`);
  return parts.join(" · ");
}

function shortDate(key: string) {
  return new Date(`${key}T18:00:00Z`).toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: BRUMA_TZ });
}

// ───── Estado en vivo (hora de CDMX, misma regla que promotionSchedule.ts) ─────

export type LiveState = "live" | "scheduled" | "paused" | "expired";

function cdmxNow(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: BRUMA_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}`, weekday };
}

export function liveState(p: Promotion, now = new Date()): { state: LiveState; reason: string } {
  if (!p.active) return { state: "paused", reason: "Pausada" };
  const t = cdmxNow(now);
  if (p.endDate && t.date > p.endDate) return { state: "expired", reason: `Venció el ${shortDate(p.endDate)}` };
  if (p.startDate && t.date < p.startDate) return { state: "scheduled", reason: `Empieza el ${shortDate(p.startDate)}` };
  let days: number[] = [];
  try {
    days = p.daysOfWeek ? JSON.parse(p.daysOfWeek) : [];
  } catch {}
  if (days.length > 0 && !days.includes(t.weekday)) return { state: "scheduled", reason: "Hoy no aplica" };
  const start = p.startTime?.slice(0, 5);
  const end = p.endTime?.slice(0, 5);
  if (start && t.time < start) return { state: "scheduled", reason: `Empieza hoy a las ${start}` };
  if (end && t.time > end) return { state: "scheduled", reason: `Terminó hoy a las ${end}` };
  return { state: "live", reason: "En vivo ahora" };
}
