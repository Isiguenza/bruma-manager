"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CaretRight, DotsThree, FlowArrow, GlobeX, MagnifyingGlass, PencilSimple, Plus, Spinner, Star, Trash, X } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useSearchSeed } from "@/lib/use-search-seed";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import type { Category, Product } from "@/lib/types";
import { money, parseVariants, priceLabel, productThumb } from "./_components/shared";

interface Extra {
  id: string;
  name: string;
  description: string | null;
  price: string;
  sortOrder: number;
  active: boolean;
}

type Tab = "products" | "extras";
type StatusFilter = "all" | "active" | "inactive" | "nophoto";

export default function ProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("products");

  const [search, setSearch] = useState("");
  // La búsqueda ⌘K puede precargar este buscador (?search=).
  useSearchSeed(setSearch);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [subcategoryFilter, setSubcategoryFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Categoría rápida
  const [catOpen, setCatOpen] = useState(false);
  const [catName, setCatName] = useState("");

  // Extras
  const [extraOpen, setExtraOpen] = useState(false);
  const [editingExtra, setEditingExtra] = useState<Extra | null>(null);
  const [extraForm, setExtraForm] = useState({ name: "", description: "", price: "", sortOrder: 0 });
  const [savingExtra, setSavingExtra] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [p, c, e] = await Promise.all([fetch("/api/products"), fetch("/api/categories"), fetch("/api/extras")]);
      if (p.ok) setProducts(await p.json());
      if (c.ok) setCategories(await c.json());
      if (e.ok) setExtras(await e.json());
    } catch {
      toast.error("Error cargando el menú");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const sortedCategories = useMemo(() => [...categories].sort((a, b) => a.sortOrder - b.sortOrder), [categories]);
  const activeCategory = categories.find((c) => c.id === categoryFilter);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q) && !(p.description ?? "").toLowerCase().includes(q)) return false;
      if (categoryFilter === "none" ? p.categoryId : categoryFilter && p.categoryId !== categoryFilter) return false;
      if (subcategoryFilter && p.subcategoryId !== subcategoryFilter) return false;
      if (statusFilter === "active" && !p.active) return false;
      if (statusFilter === "inactive" && p.active) return false;
      if (statusFilter === "nophoto" && productThumb(p)) return false;
      return true;
    });
  }, [products, search, categoryFilter, subcategoryFilter, statusFilter]);

  const groups = useMemo(() => {
    const byCat = new Map<string, Product[]>();
    for (const p of filtered) byCat.set(p.categoryId ?? "none", [...(byCat.get(p.categoryId ?? "none") ?? []), p]);
    const ordered = sortedCategories.filter((c) => byCat.has(c.id)).map((c) => ({ id: c.id, name: c.name, color: c.color, items: byCat.get(c.id)! }));
    if (byCat.has("none")) ordered.push({ id: "none", name: "Sin categoría", color: null, items: byCat.get("none")! });
    return ordered.map((g) => ({ ...g, items: [...g.items].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)) }));
  }, [filtered, sortedCategories]);

  const countByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products) map.set(p.categoryId ?? "none", (map.get(p.categoryId ?? "none") ?? 0) + 1);
    return map;
  }, [products]);

  const activeCount = products.filter((p) => p.active).length;
  const noPhotoCount = products.filter((p) => !productThumb(p)).length;

  // ───── Acciones ─────

  // La API de producto (PUT) espera el platillo completo, como la acción masiva.
  async function setActive(product: Product, active: boolean) {
    setTogglingId(product.id);
    setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, active } : p)));
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...product, active }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${product.name} ${active ? "activado" : "desactivado"}`);
    } catch {
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, active: !active } : p)));
      toast.error("No se pudo actualizar");
    } finally {
      setTogglingId(null);
    }
  }

  async function bulkSetActive(active: boolean) {
    setBulkBusy(true);
    try {
      await Promise.all(
        [...selected].map((id) => {
          const product = products.find((p) => p.id === id);
          return product
            ? fetch(`/api/products/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...product, active }) })
            : null;
        })
      );
      toast.success(`${selected.size} platillos ${active ? "activados" : "desactivados"}`);
      setSelected(new Set());
      fetchData();
    } catch {
      toast.error("Error actualizando platillos");
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkDelete() {
    if (!confirm(`¿Eliminar ${selected.size} platillos? Se conservan en las órdenes históricas.`)) return;
    setBulkBusy(true);
    let ok = 0;
    for (const id of selected) {
      const res = await fetch(`/api/products/${id}`, { method: "DELETE" }).catch(() => null);
      if (res?.ok) ok++;
    }
    if (ok) toast.success(`${ok} platillos eliminados`);
    if (ok < selected.size) toast.error(`${selected.size - ok} no se pudieron eliminar`);
    setSelected(new Set());
    setBulkBusy(false);
    fetchData();
  }

  async function createCategory() {
    if (!catName.trim()) return;
    try {
      const res = await fetch("/api/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: catName }) });
      if (!res.ok) throw new Error();
      toast.success("Categoría creada");
      setCatOpen(false);
      setCatName("");
      fetchData();
    } catch {
      toast.error("Error creando categoría");
    }
  }

  function openExtra(extra: Extra | null) {
    setEditingExtra(extra);
    setExtraForm(
      extra
        ? { name: extra.name, description: extra.description ?? "", price: extra.price, sortOrder: extra.sortOrder }
        : { name: "", description: "", price: "", sortOrder: extras.length }
    );
    setExtraOpen(true);
  }

  async function saveExtra() {
    if (!extraForm.name || !extraForm.price) return toast.error("Nombre y precio son requeridos");
    setSavingExtra(true);
    try {
      const res = await fetch(editingExtra ? `/api/extras/${editingExtra.id}` : "/api/extras", {
        method: editingExtra ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...extraForm, description: extraForm.description || null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Error");
      }
      toast.success(editingExtra ? "Extra actualizado" : "Extra creado");
      setExtraOpen(false);
      fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al guardar extra");
    } finally {
      setSavingExtra(false);
    }
  }

  async function deactivateExtra(extra: Extra) {
    if (!confirm(`¿Desactivar el extra "${extra.name}"?`)) return;
    const res = await fetch(`/api/extras/${extra.id}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) {
      toast.success("Extra desactivado");
      fetchData();
    } else toast.error("Error al desactivar extra");
  }

  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Platillos"
        description={loading ? "Cargando…" : `${products.length} platillos · ${activeCount} activos · ${extras.filter((e) => e.active).length} extras`}
        actions={
          <>
            <div className="inline-flex rounded-lg border bg-muted/40 p-1">
              {(
                [
                  ["products", "Platillos"],
                  ["extras", "Extras"],
                ] as [Tab, string][]
              ).map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTab(k)}
                  className={cn("rounded-md px-3 py-1.5 text-sm font-medium transition-colors", tab === k ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
                >
                  {l}
                </button>
              ))}
            </div>
            {tab === "products" ? (
              <>
                <Button variant="outline" onClick={() => setCatOpen(true)} className="gap-2">
                  <Plus className="size-4" /> Categoría
                </Button>
                <Button asChild className="gap-2">
                  <Link href="/inventory/products/new">
                    <Plus className="size-4" weight="bold" /> Nuevo platillo
                  </Link>
                </Button>
              </>
            ) : (
              <Button onClick={() => openExtra(null)} className="gap-2">
                <Plus className="size-4" weight="bold" /> Nuevo extra
              </Button>
            )}
          </>
        }
      />

      {tab === "products" ? (
        <>
          {/* Filtros */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-60 flex-1">
                <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar platillo…" className="h-10 pl-9" />
              </div>
              <div className="inline-flex rounded-lg border bg-muted/40 p-1">
                {(
                  [
                    ["all", "Todos"],
                    ["active", "Activos"],
                    ["inactive", "Inactivos"],
                    ["nophoto", `Sin foto${noPhotoCount ? ` · ${noPhotoCount}` : ""}`],
                  ] as [StatusFilter, string][]
                ).map(([k, l]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setStatusFilter(k)}
                    className={cn("rounded-md px-3 py-1.5 text-sm font-medium transition-colors", statusFilter === k ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
              <CategoryChip
                label="Todas"
                count={products.length}
                active={!categoryFilter}
                onClick={() => {
                  setCategoryFilter(null);
                  setSubcategoryFilter(null);
                }}
              />
              {sortedCategories.map((c) => (
                <CategoryChip
                  key={c.id}
                  label={c.name}
                  color={c.color}
                  count={countByCategory.get(c.id) ?? 0}
                  active={categoryFilter === c.id}
                  onClick={() => {
                    setCategoryFilter(categoryFilter === c.id ? null : c.id);
                    setSubcategoryFilter(null);
                  }}
                />
              ))}
              {countByCategory.has("none") && (
                <CategoryChip label="Sin categoría" count={countByCategory.get("none")!} active={categoryFilter === "none"} onClick={() => setCategoryFilter("none")} />
              )}
            </div>

            {activeCategory?.subcategories && activeCategory.subcategories.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {activeCategory.subcategories.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSubcategoryFilter(subcategoryFilter === s.id ? null : s.id)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      subcategoryFilter === s.id ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Selección masiva */}
          {selected.size > 0 && (
            <div className="sticky top-16 z-10 flex items-center gap-3 rounded-xl border bg-background/95 px-4 py-2.5 shadow-sm backdrop-blur">
              <span className="text-sm font-medium">{selected.size} seleccionados</span>
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())} className="gap-1">
                <X className="size-3.5" /> Quitar selección
              </Button>
              <div className="ml-auto flex gap-2">
                <Button variant="outline" size="sm" disabled={bulkBusy} onClick={() => bulkSetActive(true)}>
                  Activar
                </Button>
                <Button variant="outline" size="sm" disabled={bulkBusy} onClick={() => bulkSetActive(false)}>
                  Desactivar
                </Button>
                <Button variant="outline" size="sm" disabled={bulkBusy} onClick={bulkDelete} className="text-destructive hover:text-destructive">
                  Eliminar
                </Button>
              </div>
            </div>
          )}

          {/* Lista */}
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <Spinner className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : groups.length === 0 ? (
            <Card className="py-16 text-center text-sm text-muted-foreground">
              {products.length === 0 ? "Aún no hay platillos." : "Ningún platillo coincide con los filtros."}
            </Card>
          ) : (
            <div className="space-y-6">
              {groups.map((g) => (
                <section key={g.id} className="space-y-2">
                  <div className="flex items-center gap-2 px-1">
                    <span className="size-2 rounded-full" style={{ backgroundColor: g.color || "var(--muted-foreground)" }} />
                    <h2 className="text-sm font-semibold">{g.name}</h2>
                    <span className="text-xs text-muted-foreground">{g.items.length}</span>
                  </div>
                  <Card className="gap-0 overflow-hidden py-0">
                    {g.items.map((p) => (
                      <ProductRow
                        key={p.id}
                        product={p}
                        selected={selected.has(p.id)}
                        selecting={selected.size > 0}
                        toggling={togglingId === p.id}
                        subcategory={categories.find((c) => c.id === p.categoryId)?.subcategories?.find((s) => s.id === p.subcategoryId)?.name}
                        onOpen={() => router.push(`/inventory/products/${p.id}`)}
                        onSelect={() => toggleSelected(p.id)}
                        onActive={(v) => setActive(p, v)}
                      />
                    ))}
                  </Card>
                </section>
              ))}
            </div>
          )}
        </>
      ) : (
        /* Extras */
        <Card className="gap-0 overflow-hidden py-0">
          {extras.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">No hay extras registrados</p>
          ) : (
            [...extras]
              .sort((a, b) => Number(b.active) - Number(a.active) || a.sortOrder - b.sortOrder)
              .map((e) => (
                <div key={e.id} className={cn("flex items-center gap-4 border-b px-5 py-4 last:border-b-0", !e.active && "opacity-50")}>
                  <span className="w-8 text-xs text-muted-foreground tabular-nums">{e.sortOrder}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{e.name}</p>
                    {e.description && <p className="truncate text-sm text-muted-foreground">{e.description}</p>}
                  </div>
                  {!e.active && <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">Inactivo</span>}
                  <span className="w-24 text-right font-semibold tabular-nums">{money(e.price)}</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                      <DotsThree className="size-5" weight="bold" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openExtra(e)}>
                        <PencilSimple className="mr-2 size-4" /> Editar
                      </DropdownMenuItem>
                      {e.active && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => deactivateExtra(e)} className="text-destructive focus:text-destructive">
                            <Trash className="mr-2 size-4" /> Desactivar
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))
          )}
        </Card>
      )}

      {/* Nueva categoría */}
      <Dialog open={catOpen} onOpenChange={setCatOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nueva categoría</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createCategory();
            }}
          >
            <Input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="Ej: Cocteles" autoFocus />
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setCatOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!catName.trim()}>
                Crear
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Extra */}
      <Dialog open={extraOpen} onOpenChange={setExtraOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingExtra ? "Editar extra" : "Nuevo extra"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ex-name">Nombre *</Label>
              <Input id="ex-name" value={extraForm.name} onChange={(e) => setExtraForm({ ...extraForm, name: e.target.value })} placeholder="Ej: Aguacate" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ex-desc">Descripción</Label>
              <Textarea id="ex-desc" rows={2} value={extraForm.description} onChange={(e) => setExtraForm({ ...extraForm, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ex-price">Precio *</Label>
                <Input id="ex-price" inputMode="decimal" value={extraForm.price} onChange={(e) => setExtraForm({ ...extraForm, price: e.target.value })} placeholder="0.00" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ex-order">Orden</Label>
                <Input id="ex-order" type="number" value={extraForm.sortOrder} onChange={(e) => setExtraForm({ ...extraForm, sortOrder: parseInt(e.target.value) || 0 })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtraOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveExtra} disabled={savingExtra}>
              {savingExtra ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CategoryChip({ label, count, color, active, onClick }: { label: string; count: number; color?: string | null; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "border-foreground/20 bg-foreground text-background" : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {color && <span className="size-2 rounded-full" style={{ backgroundColor: color }} />}
      {label}
      <span className={cn("text-xs tabular-nums", active ? "text-background/70" : "text-muted-foreground/70")}>{count}</span>
    </button>
  );
}

function ProductRow({
  product: p,
  subcategory,
  selected,
  selecting,
  toggling,
  onOpen,
  onSelect,
  onActive,
}: {
  product: Product;
  subcategory?: string;
  selected: boolean;
  selecting: boolean;
  toggling: boolean;
  onOpen: () => void;
  onSelect: () => void;
  onActive: (v: boolean) => void;
}) {
  const thumb = productThumb(p);
  const [broken, setBroken] = useState(false);
  const variants = p.hasVariants ? parseVariants(p.variants).length : 0;
  const raw = p as Product & { hasCustomFlow?: boolean; menuWebVisible?: boolean; loyaltyEligible?: boolean };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      className={cn("group flex cursor-pointer items-center gap-4 border-b px-4 py-3 transition-colors last:border-b-0 hover:bg-muted/40", selected && "bg-primary/5")}
    >
      <div onClick={(e) => e.stopPropagation()} className={cn("transition-opacity", selecting || selected ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
        <Checkbox checked={selected} onCheckedChange={onSelect} aria-label={`Seleccionar ${p.name}`} />
      </div>

      <div className={cn("size-12 shrink-0 overflow-hidden rounded-lg border bg-muted", !p.active && "opacity-50")}>
        {thumb && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" loading="lazy" onError={() => setBroken(true)} className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center text-sm font-semibold text-muted-foreground">{p.name.charAt(0).toUpperCase()}</span>
        )}
      </div>

      <div className={cn("min-w-0 flex-1", !p.active && "opacity-60")}>
        <div className="flex items-center gap-2">
          <p className="truncate font-medium">{p.name}</p>
          {raw.loyaltyEligible && <Star className="size-3.5 shrink-0 text-amber-500" weight="fill" aria-label="Premio de lealtad" />}
          {raw.hasCustomFlow && <FlowArrow className="size-3.5 shrink-0 text-primary" aria-label="Flujo propio" />}
          {raw.menuWebVisible === false && <GlobeX className="size-3.5 shrink-0 text-muted-foreground" aria-label="Oculto en el menú web" />}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {[subcategory, variants ? `${variants} variantes` : null, !p.active ? "Inactivo" : null].filter(Boolean).join(" · ") || p.description || " "}
        </p>
      </div>

      <span className={cn("hidden text-right text-sm font-semibold tabular-nums sm:block", !p.active && "text-muted-foreground")}>{priceLabel(p)}</span>

      <div onClick={(e) => e.stopPropagation()} title={p.active ? "Activo en el POS" : "Inactivo en el POS"}>
        <Switch checked={p.active} onCheckedChange={onActive} disabled={toggling} aria-label={`${p.name} activo`} />
      </div>

      <CaretRight className="size-4 shrink-0 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
    </div>
  );
}
