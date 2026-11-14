"use client";

import { useMemo, useRef, useState } from "react";
import { Lightning, MagnifyingGlass, Minus, Plus, Receipt, Trash } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { Product } from "@/lib/types";
import { parseVariants } from "@/components/product-picker-utils";
import { parseComboConfig } from "@/lib/promotions/combo";
import {
  type EnginePromotion,
  type PromoLine,
  evaluatePromotions,
  matchesGroup,
  matchesPromotion,
} from "@/lib/promotions/engine";
import { money } from "./shared";

interface SimLine {
  key: string;
  productId: string;
  variant: string | null;
  qty: number;
}

interface Option {
  productId: string;
  variant: string | null;
  label: string;
  price: number;
  categoryId: string | null;
}

let seq = 0;

/**
 * Carrito de prueba con el MISMO motor que cobra en el iPad
 * (`lib/promotions/engine.ts`, espejo de `PromotionEngine.swift`). Sirve para
 * ver, antes de guardar, qué platillo sale gratis y cuánto se descuenta.
 */
export function PromotionSimulator({
  products,
  promotion,
  otherPromotions,
}: {
  products: Product[];
  promotion: EnginePromotion;
  otherPromotions: EnginePromotion[];
}) {
  const [lines, setLines] = useState<SimLine[]>([]);
  const [search, setSearch] = useState("");
  const [focused, setFocused] = useState(false);
  const [withOthers, setWithOthers] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const options = useMemo<Option[]>(
    () =>
      products.flatMap((p): Option[] => {
        const vs = p.hasVariants ? parseVariants(p.variants) : [];
        if (vs.length === 0) {
          return [{ productId: p.id, variant: null, label: p.name, price: Number(p.price) || 0, categoryId: p.categoryId }];
        }
        return vs.map((v) => ({
          productId: p.id,
          variant: v.name,
          label: `${p.name} - ${v.name.trim()}`,
          price: Number(v.price) || 0,
          categoryId: p.categoryId,
        }));
      }),
    [products],
  );
  const optionOf = (l: { productId: string; variant: string | null }) =>
    options.find((o) => o.productId === l.productId && o.variant === l.variant);
  const toEngine = (o: Option, qty = 1): PromoLine => ({
    productId: o.productId,
    variantName: o.variant,
    categoryId: o.categoryId,
    unitPrice: o.price,
    quantity: qty,
    eligible: true,
  });

  const q = search.trim().toLowerCase();
  const results = q ? options.filter((o) => o.label.toLowerCase().includes(q)).slice(0, 8) : [];

  function add(o: Option, qty = 1) {
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === o.productId && l.variant === o.variant);
      if (existing) return prev.map((l) => (l === existing ? { ...l, qty: l.qty + qty } : l));
      return [...prev, { key: `s${seq++}`, productId: o.productId, variant: o.variant, qty }];
    });
  }

  /** Arma un carrito que cumple la promo una vez (lo más barato que califica). */
  function fillExample() {
    const cheapest = (match: (l: PromoLine) => boolean) =>
      options.filter((o) => o.price > 0 && match(toEngine(o))).sort((a, b) => a.price - b.price);
    const next: SimLine[] = [];
    const push = (o: Option | undefined, qty: number) => {
      if (o) next.push({ key: `s${seq++}`, productId: o.productId, variant: o.variant, qty });
    };
    const config = parseComboConfig({ ...promotion, comboRules: promotion.comboRules ?? null });
    if (config) {
      for (const g of config.groups) {
        const list = cheapest((l) => matchesGroup(g, l));
        // Dos sabores distintos si se puede: se ve mejor que "2x lo mismo".
        if (g.quantity > 1 && list.length > 1) {
          push(list[0], Math.ceil(g.quantity / 2));
          push(list[1], Math.floor(g.quantity / 2));
        } else push(list[0], g.quantity);
      }
    } else {
      const list = cheapest((l) => matchesPromotion(promotion, l));
      const qty = promotion.type === "buy_x_get_y" ? promotion.buyQuantity ?? 2 : 2;
      if (list.length > 1 && qty > 1) {
        push(list[1], 1);
        push(list[0], qty - 1);
      } else push(list[0], qty);
    }
    setLines(next);
  }

  const engineLines = lines.map((l) => {
    const o = optionOf(l);
    return o ? toEngine(o, l.qty) : { productId: l.productId, unitPrice: 0, quantity: l.qty, eligible: false };
  });
  const promos = withOthers ? [promotion, ...otherPromotions] : [promotion];
  const results2 = evaluatePromotions(engineLines, promos);
  const subtotal = engineLines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const discount = results2.reduce((s, r) => s + r.discount, 0);
  const byPromo = new Map<string, number>();
  results2.forEach((r) => r.promotionName && r.discount > 0 && byPromo.set(r.promotionName, (byPromo.get(r.promotionName) ?? 0) + r.discount));

  return (
    <section className="overflow-hidden rounded-2xl border bg-card">
      <div className="flex items-center justify-between gap-2 border-b px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Receipt className="size-4.5 text-muted-foreground" weight="duotone" />
          <h2 className="font-semibold">Pruébala</h2>
        </div>
        <button
          type="button"
          onClick={fillExample}
          className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/15"
        >
          <Lightning className="size-3.5" weight="fill" />
          Llenar ejemplo
        </button>
      </div>

      <div className="space-y-3 p-4">
        <div className="relative">
          <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 120)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && results[0]) {
                add(results[0]);
                setSearch("");
              }
            }}
            placeholder="Agregar platillo al carrito…"
            className="h-10 w-full rounded-lg bg-muted/50 pr-3 pl-9 text-sm outline-none placeholder:text-muted-foreground focus:bg-muted focus:ring-2 focus:ring-ring/30"
          />
          {focused && results.length > 0 && (
            <div className="absolute inset-x-0 top-11 z-20 overflow-hidden rounded-lg border bg-popover shadow-lg">
              {results.map((o) => (
                <button
                  key={`${o.productId}::${o.variant}`}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    add(o);
                    setSearch("");
                    inputRef.current?.focus();
                  }}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <span className="truncate">{o.label}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{money(o.price)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {lines.length === 0 ? (
          <div className="rounded-xl border border-dashed px-4 py-8 text-center">
            <p className="text-sm font-medium">Carrito vacío</p>
            <p className="mt-1 text-xs text-muted-foreground">Agrega platillos o toca “Llenar ejemplo” para ver cómo se cobra.</p>
          </div>
        ) : (
          <div className="rounded-xl bg-muted/40 p-3 font-mono text-[13px]">
            <div className="space-y-2">
              {lines.map((l, i) => {
                const o = optionOf(l);
                const r = results2[i];
                const gross = (o?.price ?? 0) * l.qty;
                const free = r.discount > 0 && r.discount >= gross - 0.005;
                return (
                  <div key={l.key} className="group">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center rounded-md border bg-background">
                        <button
                          type="button"
                          onClick={() =>
                            setLines((prev) =>
                              l.qty <= 1 ? prev.filter((x) => x.key !== l.key) : prev.map((x) => (x.key === l.key ? { ...x, qty: x.qty - 1 } : x)),
                            )
                          }
                          className="flex size-6 items-center justify-center text-muted-foreground hover:text-foreground"
                          aria-label="Menos"
                        >
                          {l.qty <= 1 ? <Trash className="size-3" /> : <Minus className="size-3" weight="bold" />}
                        </button>
                        <span className="w-5 text-center font-sans text-xs font-semibold tabular-nums">{l.qty}</span>
                        <button
                          type="button"
                          onClick={() => setLines((prev) => prev.map((x) => (x.key === l.key ? { ...x, qty: x.qty + 1 } : x)))}
                          className="flex size-6 items-center justify-center text-muted-foreground hover:text-foreground"
                          aria-label="Más"
                        >
                          <Plus className="size-3" weight="bold" />
                        </button>
                      </div>
                      <span className="min-w-0 flex-1 truncate font-sans">{o?.label ?? "Platillo"}</span>
                      <span className={cn("tabular-nums", r.discount > 0 && "text-muted-foreground line-through")}>{money(gross)}</span>
                    </div>
                    {r.discount > 0 && (
                      <div className="mt-0.5 flex items-center justify-between pl-[4.6rem] text-xs">
                        <span className={cn("truncate font-sans font-semibold", free ? "text-emerald-600 dark:text-emerald-400" : "text-sky-600 dark:text-sky-400")}>
                          {free ? "GRATIS" : `−${money(r.discount)}`} · {r.promotionName}
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums">{money(gross - r.discount)}</span>
                      </div>
                    )}
                    {r.discount === 0 && r.promotionId && (
                      <p className="mt-0.5 pl-[4.6rem] font-sans text-[11px] text-muted-foreground">Completa {r.promotionName}</p>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-3 space-y-1 border-t border-dashed pt-2">
              <Row label="Subtotal" value={money(subtotal)} />
              {[...byPromo].map(([name, amount]) => (
                <Row key={name} label={name} value={`−${money(amount)}`} accent />
              ))}
              <div className="flex items-baseline justify-between pt-1 font-sans">
                <span className="text-sm font-semibold">Total</span>
                <span className="text-lg font-bold tabular-nums">{money(subtotal - discount)}</span>
              </div>
            </div>
          </div>
        )}

        {lines.length > 0 && discount === 0 && (
          <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            Con este carrito la promoción todavía no aplica.
          </p>
        )}

        {otherPromotions.length > 0 && (
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={withOthers} onChange={(e) => setWithOthers(e.target.checked)} className="size-3.5 accent-primary" />
            Probar junto con las otras {otherPromotions.length} promociones activas
          </label>
        )}
      </div>
    </section>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 font-sans text-xs", accent ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
      <span className="truncate">{label}</span>
      <span className="shrink-0 tabular-nums">{value}</span>
    </div>
  );
}
