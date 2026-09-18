"use client";

import { useMemo, useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Check, Minus, ListChecks, X, FolderOpen, Tag } from "@phosphor-icons/react";
import type { Product, ProductVariant, Category } from "@/lib/types";

// Variant-scoped ids are stored as `${productId}::${variantName}` — robust to
// variant reordering, unlike the legacy `${productId}-variant-${idx}` format
// (still produced by old saved promotions, migrated on open below).
function variantId(productId: string, variantName: string) {
  return `${productId}::${variantName}`;
}

function parseVariants(raw: string | null): ProductVariant[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Best-effort upgrade of ids saved by the old flat checkbox list
// (`${productId}-variant-${idx}`) to the `::variantName` format. Anything
// already in `::` form, or a plain productId, passes through unchanged.
function migrateLegacyId(id: string, products: Product[]): string {
  if (id.includes("::")) return id;
  const match = id.match(/^(.+)-variant-(\d+)$/);
  if (!match) return id;
  const [, productId, idxStr] = match;
  const product = products.find((p) => p.id === productId);
  if (!product) return id;
  const variants = parseVariants(product.variants);
  const variant = variants[parseInt(idxStr, 10)];
  if (!variant) return id;
  return variantId(productId, variant.name);
}

function TriState({ state }: { state: "checked" | "partial" | "unchecked" }) {
  return (
    <div
      className={cn(
        "h-4 w-4 shrink-0 rounded-sm border flex items-center justify-center transition-colors",
        state === "unchecked"
          ? "border-primary"
          : "bg-primary border-primary text-primary-foreground"
      )}
    >
      {state === "checked" && <Check className="h-3 w-3" weight="bold" />}
      {state === "partial" && <Minus className="h-3 w-3" weight="bold" />}
    </div>
  );
}

function isProductFullySelected(product: Product, variantIds: string[], draft: string[]) {
  if (draft.includes(product.id)) return true;
  if (variantIds.length === 0) return false;
  return variantIds.every((id) => draft.includes(id));
}

export interface PromotionProductSelection {
  applyTo: "specific_products" | "category";
  productIds: string[];
  categoryId: string;
}

interface PromotionProductPickerProps {
  products: Product[];
  categories: Category[];
  value: PromotionProductSelection;
  onChange: (next: PromotionProductSelection) => void;
}

export function PromotionProductPicker({
  products,
  categories,
  value,
  onChange,
}: PromotionProductPickerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);

  const groups = useMemo(() => {
    const map = new Map<string, { category: Category | null; products: Product[] }>();
    for (const p of products) {
      const key = p.category?.id ?? "__none__";
      if (!map.has(key)) map.set(key, { category: p.category ?? null, products: [] });
      map.get(key)!.products.push(p);
    }
    return Array.from(map.values()).sort(
      (a, b) => (a.category?.sortOrder ?? 999) - (b.category?.sortOrder ?? 999)
    );
  }, [products]);

  // Committed selection, expressed as a flat list of ids for the UI — a
  // plain productId means "whole product", a `::variantName` id means only
  // that variant is included.
  const committedIds = useMemo(() => {
    if (value.applyTo === "category" && value.categoryId) {
      return products.filter((p) => p.categoryId === value.categoryId).map((p) => p.id);
    }
    return value.productIds.map((id) => migrateLegacyId(id, products));
  }, [value, products]);

  function handleOpenChange(next: boolean) {
    if (next) setDraft(committedIds);
    setOpen(next);
  }

  function toggleWholeProduct(product: Product, variantIds: string[]) {
    setDraft((prev) => {
      const isFull = isProductFullySelected(product, variantIds, prev);
      if (isFull) {
        return prev.filter((id) => id !== product.id && !variantIds.includes(id));
      }
      return [...prev.filter((id) => !variantIds.includes(id) && id !== product.id), product.id];
    });
  }

  function toggleVariant(product: Product, variant: ProductVariant, variantIds: string[]) {
    const vid = variantId(product.id, variant.name);
    setDraft((prev) => {
      if (prev.includes(product.id)) {
        return [...prev.filter((id) => id !== product.id), ...variantIds.filter((id) => id !== vid)];
      }
      if (prev.includes(vid)) {
        return prev.filter((id) => id !== vid);
      }
      const next = [...prev, vid];
      if (variantIds.every((id) => next.includes(id))) {
        return [...next.filter((id) => !variantIds.includes(id)), product.id];
      }
      return next;
    });
  }

  function categoryState(categoryProducts: Product[]): "checked" | "partial" | "unchecked" {
    if (categoryProducts.length === 0) return "unchecked";
    let fullCount = 0;
    let anyCount = 0;
    for (const product of categoryProducts) {
      const variants = parseVariants(product.variants);
      const variantIds = product.hasVariants ? variants.map((v) => variantId(product.id, v.name)) : [];
      const full = isProductFullySelected(product, variantIds, draft);
      const any = full || draft.includes(product.id) || variantIds.some((id) => draft.includes(id));
      if (full) fullCount++;
      if (any) anyCount++;
    }
    if (fullCount === categoryProducts.length) return "checked";
    if (anyCount > 0) return "partial";
    return "unchecked";
  }

  function toggleCategory(categoryProducts: Product[]) {
    const state = categoryState(categoryProducts);
    setDraft((prev) => {
      const categoryProductIds = new Set(categoryProducts.map((p) => p.id));
      const categoryVariantIds = new Set(
        categoryProducts.flatMap((p) => parseVariants(p.variants).map((v) => variantId(p.id, v.name)))
      );
      const withoutCategory = prev.filter(
        (id) => !categoryProductIds.has(id) && !categoryVariantIds.has(id)
      );
      if (state !== "unchecked") {
        // fully or partially selected -> clear the whole category
        return withoutCategory;
      }
      // nothing selected -> select every product in the category, whole
      return [...withoutCategory, ...categoryProducts.map((p) => p.id)];
    });
  }

  // Detects "the draft is exactly one whole category, no exceptions" so we
  // can keep saving applyTo:"category" (matches future products added to
  // that category automatically, same as the POS promotion engine expects).
  // Anything else (multiple categories, partial exceptions, loose products)
  // is resolved to a concrete productIds list at apply time.
  function resolve(finalDraft: string[]): PromotionProductSelection {
    for (const category of categories) {
      const categoryProducts = products.filter((p) => p.categoryId === category.id);
      if (categoryProducts.length === 0) continue;
      const fullIds = categoryProducts.map((p) => p.id);
      if (fullIds.length === finalDraft.length && fullIds.every((id) => finalDraft.includes(id))) {
        return { applyTo: "category", categoryId: category.id, productIds: [] };
      }
    }
    return { applyTo: "specific_products", categoryId: "", productIds: finalDraft };
  }

  function apply() {
    onChange(resolve(draft));
    setOpen(false);
  }

  const committedCount = committedIds.length;
  const totalProducts = products.length;
  const summaryLabel =
    value.applyTo === "category" && value.categoryId
      ? categories.find((c) => c.id === value.categoryId)?.name ?? "Categoría"
      : committedCount === 0
      ? null
      : `${committedCount} producto(s)/variante(s) seleccionado(s)`;

  return (
    <>
      <button
        type="button"
        onClick={() => handleOpenChange(true)}
        className="w-full flex items-center gap-3 rounded-lg border border-dashed px-4 py-3 text-left hover:border-primary hover:bg-accent/50 transition-colors group"
      >
        <div className="rounded-lg bg-primary/10 p-2 group-hover:bg-primary/15 transition-colors">
          <ListChecks className="size-4 text-primary" weight="duotone" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">
            {summaryLabel ?? "Ningún producto seleccionado"}
          </p>
          <p className="text-xs text-muted-foreground">
            {value.applyTo === "category" && value.categoryId
              ? "Aplica a toda la categoría (incluye productos futuros). Toca para editar."
              : committedCount === 0
              ? "Toca para elegir productos o categorías"
              : "Toca para editar la selección"}
          </p>
        </div>
        {committedCount > 0 && (
          <Badge variant="secondary" className="shrink-0">
            {value.applyTo === "category" ? "categoría" : committedCount}
          </Badge>
        )}
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle>Aplicar a productos o categorías</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Marca &quot;Toda la categoría&quot; para jalar automáticamente todos
              sus productos, y destilda excepciones puntuales si las hay.
            </p>
          </DialogHeader>

          <Command className="rounded-none border-t" shouldFilter>
            <CommandInput placeholder="Buscar producto o categoría..." />
            <CommandList className="max-h-[360px]">
              <CommandEmpty>
                <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
                  <FolderOpen className="size-8 opacity-30" weight="duotone" />
                  <p className="text-sm">No se encontraron productos</p>
                </div>
              </CommandEmpty>

              {groups.map((group) => {
                const catState = categoryState(group.products);
                return (
                  <CommandGroup
                    key={group.category?.id ?? "__none__"}
                    heading={
                      <span className="flex items-center gap-2">
                        <span
                          className="size-2 rounded-full shrink-0"
                          style={{ backgroundColor: group.category?.color || "#6B7280" }}
                        />
                        {group.category?.name ?? "Sin categoría"}
                      </span>
                    }
                  >
                    {group.category && (
                      <CommandItem
                        value={`${group.category.name} toda la categoria`}
                        onSelect={() => toggleCategory(group.products)}
                        className="gap-3 font-semibold"
                      >
                        <TriState state={catState} />
                        <Tag className="size-3.5 text-muted-foreground shrink-0" weight="duotone" />
                        <span className="flex-1 truncate">Toda la categoría</span>
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {group.products.length} producto(s)
                        </Badge>
                      </CommandItem>
                    )}

                    {group.products.map((product) => {
                      const variants = parseVariants(product.variants);
                      const hasVariants = product.hasVariants && variants.length > 0;
                      const searchKey = `${group.category?.name ?? ""} ${product.name}`;

                      if (!hasVariants) {
                        const isSelected = draft.includes(product.id);
                        return (
                          <CommandItem
                            key={product.id}
                            value={searchKey}
                            onSelect={() => toggleWholeProduct(product, [])}
                            className="gap-3 pl-7"
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleWholeProduct(product, [])}
                            />
                            <span className="flex-1 truncate">{product.name}</span>
                            <span className="text-xs text-muted-foreground shrink-0">
                              ${product.price}
                            </span>
                          </CommandItem>
                        );
                      }

                      const variantIds = variants.map((v) => variantId(product.id, v.name));
                      const selectedVariantCount = variantIds.filter((id) => draft.includes(id)).length;
                      const wholeSelected = draft.includes(product.id);
                      const allVariantsSelected = selectedVariantCount === variantIds.length;
                      const triState: "checked" | "partial" | "unchecked" =
                        wholeSelected || allVariantsSelected
                          ? "checked"
                          : selectedVariantCount > 0
                          ? "partial"
                          : "unchecked";

                      return (
                        <div key={product.id} className="space-y-0.5">
                          <CommandItem
                            value={searchKey}
                            onSelect={() => toggleWholeProduct(product, variantIds)}
                            className="gap-3 pl-7 font-medium"
                          >
                            <TriState state={triState} />
                            <span className="flex-1 truncate">{product.name}</span>
                            <Badge variant="outline" className="text-[10px] shrink-0">
                              {variants.length} variantes
                            </Badge>
                          </CommandItem>
                          {variants.map((variant) => {
                            const vid = variantId(product.id, variant.name);
                            const checked = wholeSelected || draft.includes(vid);
                            return (
                              <CommandItem
                                key={vid}
                                value={`${searchKey} ${variant.name}`}
                                onSelect={() => toggleVariant(product, variant, variantIds)}
                                className="gap-3 pl-12 text-muted-foreground data-selected:text-foreground"
                              >
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={() => toggleVariant(product, variant, variantIds)}
                                />
                                <span className="flex-1 truncate">{variant.name}</span>
                                <span className="text-xs shrink-0">${variant.price}</span>
                              </CommandItem>
                            );
                          })}
                        </div>
                      );
                    })}
                  </CommandGroup>
                );
              })}
            </CommandList>
          </Command>

          <div className="flex items-center justify-between gap-3 border-t px-5 py-3 bg-muted/30">
            <button
              type="button"
              onClick={() => setDraft([])}
              disabled={draft.length === 0}
              className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:pointer-events-none inline-flex items-center gap-1"
            >
              <X className="size-3.5" />
              Limpiar selección
            </button>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {draft.length === 0
                  ? `Aplica a los ${totalProducts} productos`
                  : `${draft.length} seleccionado(s)`}
              </span>
              <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={apply}>
                Aplicar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
