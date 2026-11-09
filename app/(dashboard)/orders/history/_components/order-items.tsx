"use client";

import { cn } from "@/lib/utils";
import { money } from "../../../cash-register/_components/shared";

export type HistoryItem = {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: string;
  subtotal: string;
  notes: string | null;
  frostingName: string | null;
  dryToppingName: string | null;
  extraName: string | null;
  customModifiers: string | null;
  seat?: string | null;
  course?: number | null;
  voided?: boolean;
  voidReason?: string | null;
  isGuest?: boolean;
  promotionName?: string | null;
  originalPrice?: string | null;
  parentItemId?: string | null;
  packageLabel?: string | null;
  createdAt?: string;
};

type Modifier = { name: string; price: number };

/** "Coctel de camarón - Grande" → ["Coctel de camarón", "Grande"]. */
function splitVariant(name: string): [string, string | null] {
  const i = name.lastIndexOf(" - ");
  return i > 0 ? [name.slice(0, i), name.slice(i + 3)] : [name, null];
}

/** Modificadores como los dibuja el carrito del POS (`CartItemRow`). */
function modifiersOf(item: HistoryItem): Modifier[] {
  const mods: Modifier[] = [];
  if (item.frostingName) mods.push({ name: item.frostingName, price: 0 });
  if (item.dryToppingName) mods.push({ name: item.dryToppingName, price: 0 });
  if (item.extraName) mods.push({ name: item.extraName, price: 0 });
  if (item.customModifiers) {
    try {
      const json = JSON.parse(item.customModifiers) as Record<string, { options?: { name?: string; price?: string | number }[] }>;
      for (const key of Object.keys(json).sort()) {
        for (const opt of json[key]?.options ?? []) {
          if (opt.name) mods.push({ name: opt.name, price: Number(opt.price) || 0 });
        }
      }
    } catch {
      /* JSON viejo o corrupto: se omite */
    }
  }
  return mods;
}

/** Orden en que se agregó, cada hijo de paquete bajo su padre (como `cartOrdered` del POS). */
function nest(items: HistoryItem[]) {
  const byTime = [...items].sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.id.localeCompare(b.id));
  const ids = new Set(items.map((i) => i.id));
  const children = new Map<string, HistoryItem[]>();
  for (const i of byTime) {
    if (i.parentItemId && ids.has(i.parentItemId)) {
      children.set(i.parentItemId, [...(children.get(i.parentItemId) ?? []), i]);
    }
  }
  const roots = byTime.filter((i) => !i.parentItemId || !ids.has(i.parentItemId));
  return roots.map((root) => ({ root, children: children.get(root.id) ?? [] }));
}

export function OrderItems({ items }: { items: HistoryItem[] }) {
  const groups = nest(items);
  const seats = [...new Set(groups.map((g) => g.root.seat).filter(Boolean))] as string[];
  const bySeat = seats.length > 1;

  if (items.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Esta orden no tiene detalle de productos.</p>;
  }

  if (!bySeat) {
    return (
      <div className="space-y-2">
        {groups.map((g) => (
          <ItemCard key={g.root.id} item={g.root} childItems={g.children} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {seats.map((seat) => {
        const seatGroups = groups.filter((g) => g.root.seat === seat);
        const seatTotal = seatGroups.reduce((s, g) => s + (g.root.voided ? 0 : parseFloat(g.root.subtotal || "0")), 0);
        return (
          <section key={seat} className="space-y-2">
            <div className="flex items-baseline justify-between px-1">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Asiento {seat}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{money(seatTotal)}</span>
            </div>
            {seatGroups.map((g) => (
              <ItemCard key={g.root.id} item={g.root} childItems={g.children} />
            ))}
          </section>
        );
      })}
      {groups.some((g) => !g.root.seat) && (
        <section className="space-y-2">
          <span className="px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Sin asiento</span>
          {groups
            .filter((g) => !g.root.seat)
            .map((g) => (
              <ItemCard key={g.root.id} item={g.root} childItems={g.children} />
            ))}
        </section>
      )}
    </div>
  );
}

function ItemCard({ item, childItems }: { item: HistoryItem; childItems: HistoryItem[] }) {
  const [base, variant] = splitVariant(item.productName);
  const mods = modifiersOf(item);
  const subtotal = parseFloat(item.subtotal || "0");
  const original = item.originalPrice ? parseFloat(item.originalPrice) * item.quantity : null;
  const isPackage = childItems.length > 0;

  return (
    <div className={cn("rounded-xl border bg-background p-3", item.voided && "border-dashed opacity-60")}>
      <div className="flex gap-3">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold tabular-nums",
            item.voided && "line-through"
          )}
        >
          {item.quantity}
        </span>

        <div className="min-w-0 flex-1 space-y-1">
          <p className={cn("leading-tight", item.voided && "line-through")}>
            <span className="font-semibold">{base}</span>
            {variant && <span className="text-muted-foreground"> · {variant}</span>}
          </p>

          {mods.length > 0 && (
            <div className="space-y-0.5">
              {mods.map((m, i) => (
                <p key={i} className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="text-muted-foreground/60">↳</span>
                  {m.name}
                  {m.price !== 0 && <span className="text-orange-600 dark:text-orange-400">+{money(m.price, 0)}</span>}
                </p>
              ))}
            </div>
          )}

          {item.notes && (
            <p className="flex items-start gap-1 text-xs italic text-orange-600 dark:text-orange-400">
              <span>↳</span>
              {item.notes}
            </p>
          )}

          <div className="flex flex-wrap gap-1.5 empty:hidden">
            {isPackage && <Chip>{item.packageLabel || "Paquete"}</Chip>}
            {(item.course ?? 1) > 1 && <Chip>Tiempo {item.course}</Chip>}
            {item.isGuest && <Chip tone="blue">Cortesía</Chip>}
            {item.promotionName && <Chip tone="orange">{item.promotionName}</Chip>}
            {item.voided && <Chip tone="red">Anulado{item.voidReason ? `: ${item.voidReason}` : ""}</Chip>}
          </div>
        </div>

        <div className="text-right">
          <p className={cn("text-sm font-semibold tabular-nums", item.voided && "line-through")}>
            {item.isGuest ? money(0) : money(subtotal)}
          </p>
          {original !== null && original > subtotal && !item.isGuest && (
            <p className="text-xs text-muted-foreground line-through tabular-nums">{money(original)}</p>
          )}
          {item.quantity > 1 && !item.isGuest && (
            <p className="text-[11px] text-muted-foreground tabular-nums">{money(parseFloat(item.unitPrice || "0"))} c/u</p>
          )}
        </div>
      </div>

      {/* Incluidos del paquete, dentro de la tarjeta (como `packageCard` del POS) */}
      {isPackage && (
        <div className="mt-3 space-y-1.5 rounded-lg bg-muted/50 px-3 py-2.5">
          {childItems.map((child) => {
            const [cBase, cVariant] = splitVariant(child.productName);
            const cMods = modifiersOf(child);
            return (
              <div key={child.id} className={cn("text-sm", child.voided && "line-through opacity-60")}>
                <p>
                  <span className="text-muted-foreground">» </span>
                  {child.quantity > 1 && <span className="font-semibold tabular-nums">{child.quantity}× </span>}
                  {cBase}
                  {cVariant && <span className="text-muted-foreground"> · {cVariant}</span>}
                </p>
                {cMods.map((m, i) => (
                  <p key={i} className="pl-4 text-xs text-muted-foreground">
                    ↳ {m.name}
                    {m.price !== 0 && <span className="text-orange-600 dark:text-orange-400"> +{money(m.price, 0)}</span>}
                  </p>
                ))}
                {child.notes && <p className="pl-4 text-xs italic text-orange-600 dark:text-orange-400">↳ {child.notes}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone?: "blue" | "orange" | "red" }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
        !tone && "bg-muted text-muted-foreground",
        tone === "blue" && "bg-blue-500/10 text-blue-600 dark:text-blue-400",
        tone === "orange" && "bg-orange-500/10 text-orange-600 dark:text-orange-400",
        tone === "red" && "bg-red-500/10 text-red-600 dark:text-red-400"
      )}
    >
      {children}
    </span>
  );
}
