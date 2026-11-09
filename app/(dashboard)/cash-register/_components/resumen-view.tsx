"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowClockwise, CaretDown, Printer } from "@phosphor-icons/react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatHour, hourCDMX } from "@/lib/time";
import { BigNumber, Eyebrow, InnerCard, Panel, printServerUrl } from "./shared";

type Item = {
  productId: string;
  productName: string;
  quantity: number;
  voided?: boolean;
  parentItemId?: string | null;
  isGuest?: boolean;
  promotionId?: string | number | null;
  promotionName?: string | null;
};
type PaidOrder = { id: string; tableId: string | null; createdAt: string; items?: Item[] };
type Kind = "sold" | "package" | "guest";
type CategoryInfo = { name: string; sort: number };

type SummaryProduct = { id: string; name: string; qty: number; hasPromo: boolean; variants: { name: string; qty: number }[] };
type SummaryCategory = { name: string; sort: number; qty: number; products: SummaryProduct[] };

/** "Espresso - Doble" → ["Espresso", "Doble"]. */
function splitVariant(name: string): [string, string | null] {
  const i = name.lastIndexOf(" - ");
  return i > 0 ? [name.slice(0, i), name.slice(i + 3)] : [name, null];
}

/**
 * Agrupado categoría → producto → variante. Espejo de `groupSummaryItems`
 * (print-server) y de `ResumenView.groupedCategories` (iPad): si cambias la
 * regla en uno, cámbiala en los tres.
 */
function groupCategories(rows: { item: Item; kind: Kind }[], categoryByProduct: Map<string, CategoryInfo>): SummaryCategory[] {
  const cats = new Map<string, { sort: number; qty: number; order: string[]; products: Map<string, { qty: number; hasPromo: boolean; names: Map<string, number> }> }>();
  for (const { item, kind } of rows) {
    if (kind !== "sold") continue;
    const info = categoryByProduct.get(item.productId);
    const catName = info?.name ?? "Otros";
    let cat = cats.get(catName);
    if (!cat) {
      cat = { sort: info?.sort ?? 99999, qty: 0, order: [], products: new Map() };
      cats.set(catName, cat);
    }
    let product = cat.products.get(item.productId);
    if (!product) {
      product = { qty: 0, hasPromo: false, names: new Map() };
      cat.products.set(item.productId, product);
      cat.order.push(item.productId);
    }
    const qty = Number(item.quantity) || 0;
    product.qty += qty;
    product.hasPromo ||= item.promotionId != null;
    product.names.set(item.productName, (product.names.get(item.productName) ?? 0) + qty);
    cat.qty += qty;
  }

  return [...cats.entries()]
    .map(([name, cat]) => ({
      name,
      sort: cat.sort,
      qty: cat.qty,
      products: cat.order
        .map((id) => {
          const p = cat.products.get(id)!;
          const names = [...p.names.entries()];
          // Un solo nombre: se muestra completo ("Boing Sabores - Mango").
          if (names.length === 1) return { id, name: names[0][0], qty: p.qty, hasPromo: p.hasPromo, variants: [] };
          const base = splitVariant(names[0][0])[0];
          return {
            id,
            name: base,
            qty: p.qty,
            hasPromo: p.hasPromo,
            variants: names
              .map(([n, q]) => {
                const [b, v] = splitVariant(n);
                return { name: b === base ? v ?? n : n, qty: q };
              })
              .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name)),
          };
        })
        .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
}

function sumByName(rows: { item: Item; kind: Kind }[], kind: Kind) {
  const totals = new Map<string, number>();
  for (const r of rows) if (r.kind === kind) totals.set(r.item.productName, (totals.get(r.item.productName) ?? 0) + (Number(r.item.quantity) || 0));
  return [...totals.entries()].map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
}

/**
 * Resumen del turno — réplica de `ResumenView.swift` del iPad: conteos y
 * productos SIN dinero (los montos van en el Corte), igual que el ticket.
 */
export function ResumenView({
  orders,
  openedAt,
  printedBy,
  loading,
  onReload,
}: {
  orders: PaidOrder[];
  openedAt?: string;
  printedBy?: string;
  loading: boolean;
  onReload: () => void;
}) {
  const [categoryByProduct, setCategoryByProduct] = useState<Map<string, CategoryInfo>>(new Map());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    Promise.all([fetch("/api/products"), fetch("/api/categories")])
      .then(async ([p, c]) => [p.ok ? await p.json() : [], c.ok ? await c.json() : []])
      .then((result) => {
        const [products, categories] = result as [{ id: string; categoryId: string | null }[], { id: string; name: string; sortOrder: number }[]];
        const byId = new Map(categories.map((c) => [c.id, c]));
        const map = new Map<string, CategoryInfo>();
        for (const p of products) {
          const c = p.categoryId ? byId.get(p.categoryId) : undefined;
          if (c) map.set(p.id, { name: c.name, sort: c.sortOrder });
        }
        setCategoryByProduct(map);
      })
      .catch(() => {});
  }, []);

  // Mismas reglas que el iPad (CashRegisterViewModel.summaryItems): sin
  // anulados; hijo de paquete = "package", cortesía = "guest".
  const rows = useMemo(
    () =>
      orders.flatMap((o) =>
        (o.items ?? [])
          .filter((i) => !i.voided)
          .map((item) => ({ item, kind: (item.parentItemId ? "package" : item.isGuest ? "guest" : "sold") as Kind }))
      ),
    [orders]
  );
  const categories = useMemo(() => groupCategories(rows, categoryByProduct), [rows, categoryByProduct]);
  const soldPieces = rows.filter((r) => r.kind === "sold").reduce((s, r) => s + (Number(r.item.quantity) || 0), 0);
  const tableCount = orders.filter((o) => o.tableId).length;
  const takeoutCount = orders.length - tableCount;
  const top = categories.flatMap((c) => c.products).sort((a, b) => b.qty - a.qty).slice(0, 5);
  const packageItems = sumByName(rows, "package");
  const guestItems = sumByName(rows, "guest");
  const promotions = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>();
    for (const { item, kind } of rows) {
      if (kind !== "sold" || item.promotionId == null) continue;
      const key = String(item.promotionId);
      const current = map.get(key) ?? { name: item.promotionName || "Promoción", count: 0 };
      current.count += Number(item.quantity) || 0;
      map.set(key, current);
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [rows]);

  // Órdenes por hora (hora de CDMX), con huecos rellenos entre la primera y la última.
  const hourly = useMemo(() => {
    const counts = new Map<number, number>();
    for (const o of orders) {
      const h = hourCDMX(o.createdAt);
      counts.set(h, (counts.get(h) ?? 0) + 1);
    }
    if (counts.size < 2) return [];
    const min = Math.min(...counts.keys());
    const max = Math.max(...counts.keys());
    return Array.from({ length: max - min + 1 }, (_, i) => ({ hour: min + i, label: formatHour(min + i), count: counts.get(min + i) ?? 0 }));
  }, [orders]);
  const peak = hourly.reduce<(typeof hourly)[number] | null>((p, h) => (!p || h.count > p.count ? h : p), null);

  async function print() {
    setPrinting(true);
    try {
      const items = rows.map(({ item, kind }) => {
        const category = categoryByProduct.get(item.productId);
        return {
          productId: item.productId,
          name: item.productName,
          qty: Number(item.quantity) || 0,
          kind,
          ...(category ? { category: category.name, categorySort: category.sort } : {}),
          ...(item.promotionId != null ? { hasPromo: true } : {}),
        };
      });
      const res = await fetch(`${printServerUrl()}/print-summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          openedAt,
          printedBy,
          totalOrders: orders.length,
          tableCount,
          takeoutCount,
          items,
          promotionSummary: promotions,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Resumen impreso");
    } catch {
      toast.error("No se pudo imprimir el resumen");
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <Panel className="space-y-6 p-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="space-y-1">
            <Eyebrow>Piezas vendidas</Eyebrow>
            <BigNumber>{soldPieces}</BigNumber>
            <p className="text-sm text-muted-foreground">
              {orders.length} órdenes · {tableCount} en mesa · {takeoutCount} para llevar
            </p>
          </div>
          {hourly.length > 0 && peak && (
            <div className="w-full max-w-[340px] space-y-1.5">
              <div className="h-[92px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourly} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={9} stroke="var(--muted-foreground)" interval="preserveStartEnd" />
                    <Tooltip
                      cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                      contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                      formatter={(v) => [`${v} órdenes`, ""]}
                      separator=""
                    />
                    <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                      {hourly.map((h) => (
                        <Cell key={h.hour} fill={h.hour === peak.hour ? "var(--primary)" : "var(--muted-foreground)"} fillOpacity={h.hour === peak.hour ? 1 : 0.25} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
                <span className="size-1.5 rounded-full bg-primary" />
                Hora pico {peak.label} · {peak.count} órdenes
              </p>
            </div>
          )}
        </div>

        {categories.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Sin productos vendidos aún</p>
        ) : (
          <div className="space-y-3">
            {categories.map((cat) => {
              const isCollapsed = collapsed.has(cat.name);
              const maxQty = Math.max(...cat.products.map((p) => p.qty), 1);
              const share = soldPieces > 0 ? Math.round((cat.qty / soldPieces) * 100) : 0;
              return (
                <InnerCard key={cat.name} className="px-4">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 py-3.5 text-left"
                    onClick={() =>
                      setCollapsed((prev) => {
                        const next = new Set(prev);
                        if (next.has(cat.name)) next.delete(cat.name);
                        else next.add(cat.name);
                        return next;
                      })
                    }
                  >
                    <span className="text-xs font-bold uppercase tracking-wider">{cat.name}</span>
                    <span className="text-xs font-semibold text-muted-foreground tabular-nums">{share}%</span>
                    <span className="ml-auto text-sm font-bold tabular-nums">{cat.qty}</span>
                    <CaretDown className={cn("size-3.5 text-muted-foreground transition-transform", isCollapsed && "-rotate-90")} />
                  </button>
                  {!isCollapsed &&
                    cat.products.map((p) => (
                      <div key={p.id} className="space-y-1.5 border-t py-2.5 pr-6 text-sm">
                        <div className="flex items-center gap-2">
                          <span>{p.name}</span>
                          {p.hasPromo && (
                            <span className="rounded-full bg-orange-500/15 px-1.5 py-0.5 text-[9px] font-bold text-orange-600 dark:text-orange-400">PROMO</span>
                          )}
                          <span className="ml-auto font-semibold tabular-nums">{p.qty}</span>
                        </div>
                        <DataBar fraction={p.qty / maxQty} />
                        {p.variants.map((v) => (
                          <div key={v.name} className="flex pl-4 text-xs text-muted-foreground">
                            <span>{v.name}</span>
                            <span className="ml-auto tabular-nums">{v.qty}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                </InnerCard>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel className="flex flex-col">
        <div className="flex-1 space-y-5 p-5">
          {top.length > 0 && (
            <SideList title="Lo más vendido">
              {top.map((p, i) => (
                <div key={p.id} className="space-y-1.5">
                  <div className="flex items-center gap-2.5 text-sm">
                    <span className={cn("w-4 text-xs font-bold tabular-nums", i === 0 ? "text-primary" : "text-muted-foreground")}>{i + 1}</span>
                    <span className="truncate">{p.name}</span>
                    <span className="ml-auto font-semibold tabular-nums">{p.qty}</span>
                  </div>
                  <div className="pl-[26px]">
                    <DataBar fraction={p.qty / Math.max(top[0].qty, 1)} strong={i === 0} />
                  </div>
                </div>
              ))}
            </SideList>
          )}
          {packageItems.length > 0 && (
            <SideList title="Incluidos en paquetes" caption="Salieron dentro de un paquete, no se vendieron sueltos">
              {packageItems.map((p) => <SimpleRow key={p.name} name={p.name} qty={p.qty} />)}
            </SideList>
          )}
          {guestItems.length > 0 && (
            <SideList title="Cortesías">
              {guestItems.map((p) => <SimpleRow key={p.name} name={p.name} qty={p.qty} />)}
            </SideList>
          )}
          {promotions.length > 0 && (
            <SideList title="Promociones aplicadas">
              {promotions.map((p) => <SimpleRow key={p.name} name={p.name} qty={p.count} />)}
            </SideList>
          )}
        </div>
        <div className="flex gap-2 border-t p-4">
          <Button variant="outline" size="icon" className="size-11 shrink-0 rounded-full" onClick={onReload} disabled={loading} aria-label="Actualizar">
            <ArrowClockwise className={cn("size-4", loading && "animate-spin")} />
          </Button>
          <Button className="h-11 flex-1 rounded-full" onClick={print} disabled={printing || orders.length === 0}>
            <Printer className="mr-2 size-4" weight="fill" />
            {printing ? "Imprimiendo…" : "Imprimir resumen"}
          </Button>
        </div>
      </Panel>
    </div>
  );
}

function DataBar({ fraction, strong }: { fraction: number; strong?: boolean }) {
  return (
    <div className="h-[3px] rounded-full bg-muted">
      <div className={cn("h-full rounded-full", strong ? "bg-primary" : "bg-primary/45")} style={{ width: `${Math.max(Math.min(fraction, 1) * 100, 2)}%` }} />
    </div>
  );
}

function SideList({ title, caption, children }: { title: string; caption?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <div>
        <Eyebrow>{title}</Eyebrow>
        {caption && <p className="text-[11px] text-muted-foreground/80">{caption}</p>}
      </div>
      <InnerCard className="space-y-2.5 p-3.5">{children}</InnerCard>
    </div>
  );
}

function SimpleRow({ name, qty }: { name: string; qty: number }) {
  return (
    <div className="flex text-sm">
      <span className="truncate">{name}</span>
      <span className="ml-auto pl-3 text-muted-foreground tabular-nums">{qty}</span>
    </div>
  );
}
