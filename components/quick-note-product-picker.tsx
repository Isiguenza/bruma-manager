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
import { Check, Minus, ListChecks, X, FolderOpen } from "@phosphor-icons/react";
import type { Product, ProductVariant, Category } from "@/lib/types";

// Variant-scoped ids are stored as `${productId}::${variantName}`.
// A bare productId means "applies to the whole product / all its variants".
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

interface QuickNoteProductPickerProps {
  products: Product[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function QuickNoteProductPicker({
  products,
  selectedIds,
  onChange,
}: QuickNoteProductPickerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(selectedIds);

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

  function handleOpenChange(next: boolean) {
    if (next) setDraft(selectedIds); // reset draft to committed value each time it opens
    setOpen(next);
  }

  function toggleWholeProduct(product: Product, variantIds: string[]) {
    setDraft((prev) => {
      const isFull = prev.includes(product.id) || (variantIds.length > 0 && variantIds.every((id) => prev.includes(id)));
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
        // whole product was selected — split it into individual variants, minus this one
        return [...prev.filter((id) => id !== product.id), ...variantIds.filter((id) => id !== vid)];
      }
      if (prev.includes(vid)) {
        return prev.filter((id) => id !== vid);
      }
      const next = [...prev, vid];
      // all variants now selected — collapse back into a single whole-product id
      if (variantIds.every((id) => next.includes(id))) {
        return [...next.filter((id) => !variantIds.includes(id)), product.id];
      }
      return next;
    });
  }

  function apply() {
    onChange(draft);
    setOpen(false);
  }

  const selectedCount = selectedIds.length;
  const totalProducts = products.length;

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
            {selectedCount === 0
              ? "Todos los productos"
              : `${selectedCount} producto(s)/variante(s) seleccionado(s)`}
          </p>
          <p className="text-xs text-muted-foreground">
            {selectedCount === 0
              ? "Toca para restringir a productos o variantes específicas"
              : "Toca para editar la selección"}
          </p>
        </div>
        {selectedCount > 0 && (
          <Badge variant="secondary" className="shrink-0">
            {selectedCount}
          </Badge>
        )}
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle>Aplicar a productos</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Deja todo sin marcar para que aplique a cualquier producto. Para
              productos con variantes, puedes elegir todas o solo algunas.
            </p>
          </DialogHeader>

          <Command className="rounded-none border-t" shouldFilter>
            <CommandInput placeholder="Buscar producto..." />
            <CommandList className="max-h-[360px]">
              <CommandEmpty>
                <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
                  <FolderOpen className="size-8 opacity-30" weight="duotone" />
                  <p className="text-sm">No se encontraron productos</p>
                </div>
              </CommandEmpty>

              {groups.map((group) => (
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
                          className="gap-3"
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
                    const selectedVariantCount = variantIds.filter((id) =>
                      draft.includes(id)
                    ).length;
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
                          className="gap-3 font-medium"
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
                              className="gap-3 pl-9 text-muted-foreground data-selected:text-foreground"
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
              ))}
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
