"use client";

import { useMemo, useState } from "react";
import { CaretRight, Check, MagnifyingGlass, Minus, Tag, X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { Category, Product } from "@/lib/types";
import { parseVariants } from "@/components/product-picker-utils";
import { type Selection, money, refLabel } from "./shared";

type CheckState = "checked" | "partial" | "unchecked";

function Box({ state, className }: { state: CheckState; className?: string }) {
  return (
    <span
      className={cn(
        "flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors",
        state === "unchecked" ? "border-muted-foreground/40 bg-background" : "border-primary bg-primary text-primary-foreground",
        className,
      )}
    >
      {state === "checked" && <Check className="size-3" weight="bold" />}
      {state === "partial" && <Minus className="size-3" weight="bold" />}
    </span>
  );
}

interface Group {
  id: string;
  category: Category | null;
  products: Product[];
}

/**
 * Selector de platillos en línea. "Toda la categoría" guarda la categoría
 * (los platillos que se agreguen después entran solos); destildar un
 * platillo de una categoría completa la convierte en lista con esa excepción.
 * Las variantes son chips: "Boing" completo o solo "Boing Uva".
 */
export function CatalogPicker({
  products,
  categories,
  value,
  onChange,
  maxHeight = 380,
}: {
  products: Product[];
  categories: Category[];
  value: Selection;
  onChange: (next: Selection) => void;
  maxHeight?: number;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const p of products) {
      const id = p.categoryId ?? "__none__";
      if (!map.has(id)) {
        map.set(id, { id, category: categories.find((c) => c.id === p.categoryId) ?? p.category ?? null, products: [] });
      }
      map.get(id)!.products.push(p);
    }
    return [...map.values()].sort((a, b) => (a.category?.sortOrder ?? 999) - (b.category?.sortOrder ?? 999));
  }, [products, categories]);

  const q = search.trim().toLowerCase();
  const visibleGroups = useMemo(() => {
    if (!q) return groups;
    return groups
      .map((g) => {
        const catHit = g.category?.name.toLowerCase().includes(q);
        return {
          ...g,
          products: catHit
            ? g.products
            : g.products.filter(
                (p) =>
                  p.name.toLowerCase().includes(q) ||
                  parseVariants(p.variants).some((v) => `${p.name} ${v.name}`.toLowerCase().includes(q)),
              ),
        };
      })
      .filter((g) => g.products.length > 0);
  }, [groups, q]);

  const refs = new Set(value.refs);
  const variantNames = (p: Product) => (p.hasVariants ? parseVariants(p.variants).map((v) => v.name) : []);

  function productState(p: Product): CheckState {
    if (p.categoryId && value.categoryIds.includes(p.categoryId)) return "checked";
    if (refs.has(p.id)) return "checked";
    const vs = variantNames(p);
    const picked = vs.filter((v) => refs.has(`${p.id}::${v}`)).length;
    if (vs.length > 0 && picked === vs.length) return "checked";
    return picked > 0 ? "partial" : "unchecked";
  }

  function categoryState(g: Group): CheckState {
    if (g.category && value.categoryIds.includes(g.category.id)) return "checked";
    const states = g.products.map(productState);
    if (states.length > 0 && states.every((s) => s === "checked")) return "checked";
    return states.some((s) => s !== "unchecked") ? "partial" : "unchecked";
  }

  const withoutProduct = (list: string[], p: Product) => list.filter((r) => r !== p.id && !r.startsWith(`${p.id}::`));

  /** Pasa una categoría completa a lista explícita (para poder hacer excepciones). */
  function explodeCategory(sel: Selection, categoryId: string): Selection {
    if (!sel.categoryIds.includes(categoryId)) return sel;
    const ids = products.filter((p) => p.categoryId === categoryId).map((p) => p.id);
    return { categoryIds: sel.categoryIds.filter((c) => c !== categoryId), refs: [...new Set([...sel.refs, ...ids])] };
  }

  function toggleCategory(g: Group) {
    const state = categoryState(g);
    const productIds = new Set(g.products.map((p) => p.id));
    const cleanRefs = value.refs.filter((r) => !productIds.has(r.split("::")[0]));
    if (state === "checked") {
      onChange({ categoryIds: value.categoryIds.filter((c) => c !== g.category?.id), refs: cleanRefs });
    } else if (g.category) {
      onChange({ categoryIds: [...value.categoryIds, g.category.id], refs: cleanRefs });
    } else {
      onChange({ ...value, refs: [...cleanRefs, ...g.products.map((p) => p.id)] });
    }
  }

  function toggleProduct(p: Product) {
    const sel = p.categoryId ? explodeCategory(value, p.categoryId) : value;
    const state = productState(p);
    onChange({
      ...sel,
      refs: state === "unchecked" ? [...withoutProduct(sel.refs, p), p.id] : withoutProduct(sel.refs, p),
    });
  }

  function toggleVariant(p: Product, variant: string) {
    const sel = p.categoryId ? explodeCategory(value, p.categoryId) : value;
    const vs = variantNames(p);
    let picked = sel.refs.includes(p.id) ? vs : vs.filter((v) => sel.refs.includes(`${p.id}::${v}`));
    picked = picked.includes(variant) ? picked.filter((v) => v !== variant) : [...picked, variant];
    const rest = withoutProduct(sel.refs, p);
    onChange({
      ...sel,
      refs: picked.length === vs.length ? [...rest, p.id] : [...rest, ...picked.map((v) => `${p.id}::${v}`)],
    });
  }

  const chips = [
    ...value.categoryIds.map((id) => ({
      key: `c:${id}`,
      label: categories.find((c) => c.id === id)?.name ?? "Categoría",
      category: true,
      remove: () => onChange({ ...value, categoryIds: value.categoryIds.filter((c) => c !== id) }),
    })),
    ...value.refs.map((ref) => ({
      key: ref,
      label: refLabel(ref, products),
      category: false,
      remove: () => onChange({ ...value, refs: value.refs.filter((r) => r !== ref) }),
    })),
  ];

  return (
    <div className="overflow-hidden rounded-xl border bg-background">
      <div className="space-y-2 border-b p-3">
        <div className="relative">
          <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar platillo, variante o categoría…"
            className="h-10 w-full rounded-lg bg-muted/50 pr-3 pl-9 text-sm outline-none placeholder:text-muted-foreground focus:bg-muted focus:ring-2 focus:ring-ring/30"
          />
        </div>
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <span
                key={c.key}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border py-0.5 pr-1 pl-2.5 text-xs font-medium",
                  c.category ? "border-primary/30 bg-primary/10 text-primary" : "bg-muted",
                )}
              >
                {c.category && <Tag className="size-3" weight="fill" />}
                {c.label}
                {c.category && <span className="font-normal opacity-70">· toda</span>}
                <button
                  type="button"
                  onClick={c.remove}
                  className="ml-0.5 flex size-4 items-center justify-center rounded-full hover:bg-foreground/10"
                  aria-label={`Quitar ${c.label}`}
                >
                  <X className="size-2.5" weight="bold" />
                </button>
              </span>
            ))}
            {chips.length > 1 && (
              <button
                type="button"
                onClick={() => onChange({ categoryIds: [], refs: [] })}
                className="px-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Limpiar
              </button>
            )}
          </div>
        )}
      </div>

      <div className="overflow-y-auto" style={{ maxHeight }}>
        {visibleGroups.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Nada coincide con “{search}”.</p>}
        {visibleGroups.map((g) => {
          const state = categoryState(g);
          const isOpen = !!q || open.has(g.id);
          const count = g.products.filter((p) => productState(p) !== "unchecked").length;
          const whole = !!g.category && value.categoryIds.includes(g.category.id);
          return (
            <div key={g.id} className="border-b last:border-b-0">
              <div className="flex items-center gap-2 px-3 py-2 hover:bg-muted/40">
                <button
                  type="button"
                  onClick={() =>
                    setOpen((prev) => {
                      const next = new Set(prev);
                      if (next.has(g.id)) next.delete(g.id);
                      else next.add(g.id);
                      return next;
                    })
                  }
                  className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
                >
                  <CaretRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")} weight="bold" />
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: g.category?.color || "#9CA3AF" }} />
                  <span className="truncate text-sm font-semibold">{g.category?.name ?? "Sin categoría"}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {count > 0 ? `${count}/${g.products.length}` : g.products.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleCategory(g)}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    state === "checked" ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                  )}
                >
                  <Box state={state} className={cn("size-3.5", state === "checked" && "border-primary-foreground/50")} />
                  Toda la categoría
                </button>
              </div>

              {isOpen && (
                <div className="pb-2">
                  {whole && (
                    <p className="px-10 pb-1 text-[11px] text-muted-foreground">
                      Incluye los platillos que agregues después. Destilda uno para hacer una excepción.
                    </p>
                  )}
                  {g.products.map((p) => {
                    const ps = productState(p);
                    const vs = p.hasVariants ? parseVariants(p.variants) : [];
                    return (
                      <div key={p.id} className="px-3">
                        <button
                          type="button"
                          onClick={() => toggleProduct(p)}
                          className="flex w-full items-center gap-3 rounded-lg py-1.5 pr-2 pl-7 text-left hover:bg-muted/60"
                        >
                          <Box state={ps} />
                          <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                          {vs.length === 0 && <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{money(Number(p.price) || 0)}</span>}
                        </button>
                        {vs.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pb-1.5 pl-[3.75rem]">
                            {vs.map((v) => {
                              const on =
                                ps === "checked" || refs.has(`${p.id}::${v.name}`);
                              return (
                                <button
                                  key={v.name}
                                  type="button"
                                  onClick={() => toggleVariant(p, v.name)}
                                  className={cn(
                                    "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                                    on ? "border-primary/40 bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted",
                                  )}
                                >
                                  {v.name.trim()} <span className="opacity-60 tabular-nums">{money(Number(v.price) || 0)}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
