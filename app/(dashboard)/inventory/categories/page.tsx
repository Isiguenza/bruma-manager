"use client";

import { useState, useEffect, useMemo } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash,
  FlowArrow,
  BeerStein,
  FolderOpen,
  DotsSixVertical,
  SortAscending,
  HandGrabbing,
  ArrowUp,
  ArrowDown,
  CaretRight,
  Check,
  X,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import type { Category, Subcategory } from "@/lib/types";

const PRESET_COLORS = [
  { name: "Rojo", value: "#EF4444" },
  { name: "Naranja", value: "#F97316" },
  { name: "Amarillo", value: "#EAB308" },
  { name: "Verde", value: "#22C55E" },
  { name: "Azul", value: "#3B82F6" },
  { name: "Índigo", value: "#6366F1" },
  { name: "Morado", value: "#A855F7" },
  { name: "Rosa", value: "#EC4899" },
  { name: "Café", value: "#92400E" },
  { name: "Gris", value: "#6B7280" },
];

function SortableCategoryRow({
  category,
  selected,
  onSelect,
}: {
  category: Category;
  selected: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: category.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const subcatCount = category.subcategories?.length ?? 0;
  const flowCount =
    (category.hasCustomFlow ? 1 : 0) +
    (category.subcategories?.filter((s) => s.hasCustomFlow).length ?? 0);

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={`group flex items-center gap-2 rounded-lg px-2 py-2 cursor-pointer transition-colors ${
        selected ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-accent/60"
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/40 hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <DotsSixVertical className="size-4" />
      </button>
      <div
        className="size-2.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: category.color || "#6B7280" }}
      />
      <span className="flex-1 truncate text-sm font-medium">{category.name}</span>
      {category.isBeverage && (
        <BeerStein className="size-3.5 text-cyan-500" weight="fill" />
      )}
      {subcatCount > 0 && (
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {subcatCount}
        </span>
      )}
      {flowCount > 0 && <FlowArrow className="size-3.5 text-blue-500" />}
    </div>
  );
}

export default function CategoriesPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<"custom" | "alphabetical">("custom");
  const [savingOrder, setSavingOrder] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    color: "#6B7280",
    isBeverage: false,
  });

  // Inline subcategory editing
  const [newSubcatName, setNewSubcatName] = useState("");
  const [subcatSaving, setSubcatSaving] = useState(false);
  const [editingSubcatId, setEditingSubcatId] = useState<string | null>(null);
  const [editingSubcatName, setEditingSubcatName] = useState("");

  const selected = useMemo(
    () => categories.find((c) => c.id === selectedId) || null,
    [categories, selectedId]
  );

  useEffect(() => {
    fetchCategories();
  }, []);

  async function fetchCategories(keepSelection = true) {
    try {
      const res = await fetch("/api/categories");
      if (!res.ok) throw new Error();
      const data: Category[] = await res.json();
      setCategories(data);
      setSelectedId((prev) => {
        if (keepSelection && prev && data.some((c) => c.id === prev)) return prev;
        return data[0]?.id ?? null;
      });
    } catch {
      toast.error("Error cargando categorías");
    } finally {
      setLoading(false);
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  async function persistOrder(ordered: Category[]) {
    setSavingOrder(true);
    try {
      const res = await fetch("/api/categories/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orders: ordered.map((cat, idx) => ({ id: cat.id, sortOrder: idx })),
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Orden guardado");
    } catch {
      toast.error("Error guardando orden");
      fetchCategories();
    } finally {
      setSavingOrder(false);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSortMode("custom");
    setCategories((items) => {
      const oldIndex = items.findIndex((i) => i.id === active.id);
      const newIndex = items.findIndex((i) => i.id === over.id);
      const reordered = arrayMove(items, oldIndex, newIndex);
      persistOrder(reordered);
      return reordered;
    });
  }

  async function handleSortModeChange(mode: "custom" | "alphabetical") {
    setSortMode(mode);
    if (mode !== "alphabetical") return;
    const sorted = [...categories].sort((a, b) =>
      a.name.localeCompare(b.name, "es", { sensitivity: "base" })
    );
    setCategories(sorted);
    await persistOrder(sorted);
  }

  function openCreate() {
    setEditingCategory(null);
    setFormData({ name: "", description: "", color: "#6B7280", isBeverage: false });
    setDialogOpen(true);
  }

  function openEdit(category: Category) {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      description: category.description || "",
      color: category.color || "#6B7280",
      isBeverage: category.isBeverage || false,
    });
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const url = editingCategory
        ? `/api/categories/${editingCategory.id}`
        : "/api/categories";
      const res = await fetch(url, {
        method: editingCategory ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error();
      const saved = await res.json();
      toast.success(editingCategory ? "Categoría actualizada" : "Categoría creada");
      setDialogOpen(false);
      await fetchCategories();
      if (!editingCategory && saved?.id) setSelectedId(saved.id);
    } catch {
      toast.error("Error guardando categoría");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar esta categoría?")) return;
    try {
      const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Categoría eliminada");
      setSelectedId(null);
      await fetchCategories(false);
    } catch {
      toast.error("Error eliminando categoría");
    }
  }

  async function handleAddSubcategory() {
    if (!selected || !newSubcatName.trim()) return;
    setSubcatSaving(true);
    try {
      const res = await fetch(`/api/categories/${selected.id}/subcategories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newSubcatName.trim(),
          sortOrder: selected.subcategories?.length ?? 0,
        }),
      });
      if (!res.ok) throw new Error();
      setNewSubcatName("");
      await fetchCategories();
      toast.success("Subcategoría creada");
    } catch {
      toast.error("Error creando subcategoría");
    } finally {
      setSubcatSaving(false);
    }
  }

  async function handleRenameSubcategory(id: string) {
    if (!editingSubcatName.trim()) {
      setEditingSubcatId(null);
      return;
    }
    try {
      const res = await fetch(`/api/subcategories/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingSubcatName.trim() }),
      });
      if (!res.ok) throw new Error();
      setEditingSubcatId(null);
      await fetchCategories();
    } catch {
      toast.error("Error actualizando subcategoría");
    }
  }

  async function handleDeleteSubcategory(id: string) {
    if (
      !confirm(
        "¿Eliminar esta subcategoría? Los productos que la usan quedarán sin subcategoría."
      )
    )
      return;
    try {
      const res = await fetch(`/api/subcategories/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      await fetchCategories();
      toast.success("Subcategoría eliminada");
    } catch {
      toast.error("Error eliminando subcategoría");
    }
  }

  async function handleMoveSubcategory(
    list: Subcategory[],
    index: number,
    direction: -1 | 1
  ) {
    const target = index + direction;
    if (target < 0 || target >= list.length) return;
    const reordered = [...list];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setCategories((cats) =>
      cats.map((c) =>
        c.id === selectedId ? { ...c, subcategories: reordered } : c
      )
    );
    try {
      await Promise.all(
        reordered.map((s, idx) =>
          fetch(`/api/subcategories/${s.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sortOrder: idx }),
          })
        )
      );
      await fetchCategories();
    } catch {
      toast.error("Error guardando orden");
      fetchCategories();
    }
  }

  const beverageCount = categories.filter((c) => c.isBeverage).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-2">
          <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground">Cargando categorías...</p>
        </div>
      </div>
    );
  }

  const subcats = selected?.subcategories ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Categorías</h1>
          <p className="text-sm text-muted-foreground">
            {categories.length} categoría{categories.length === 1 ? "" : "s"}
            {beverageCount > 0 && ` · ${beverageCount} bebida${beverageCount === 1 ? "" : "s"}`}
            {" · el orden se refleja en Bruma POS"}
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="size-4" />
          Nueva categoría
        </Button>
      </div>

      <div className="flex gap-6 items-start">
        {/* Left: list */}
        <div className="w-72 shrink-0 space-y-2">
          <div className="inline-flex rounded-lg border bg-muted p-0.5 text-xs w-full">
            <button
              type="button"
              onClick={() => handleSortModeChange("custom")}
              disabled={savingOrder}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 font-medium transition-colors ${
                sortMode === "custom"
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <HandGrabbing className="size-3.5" />
              Manual
            </button>
            <button
              type="button"
              onClick={() => handleSortModeChange("alphabetical")}
              disabled={savingOrder}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 font-medium transition-colors ${
                sortMode === "alphabetical"
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <SortAscending className="size-3.5" />
              A–Z
            </button>
          </div>

          {categories.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Sin categorías todavía
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={categories.map((c) => c.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="rounded-lg border bg-card p-1 space-y-0.5">
                  {categories.map((category) => (
                    <SortableCategoryRow
                      key={category.id}
                      category={category}
                      selected={category.id === selectedId}
                      onSelect={() => setSelectedId(category.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>

        {/* Right: detail */}
        <div className="flex-1 min-w-0">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-80 rounded-lg border border-dashed text-muted-foreground">
              <FolderOpen className="size-14 mb-3 opacity-20" weight="duotone" />
              <p className="font-medium">Selecciona una categoría</p>
              <p className="text-sm">o crea una nueva para empezar</p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Header */}
              <div className="flex items-start gap-3">
                <div
                  className="size-4 rounded-full mt-1.5 flex-shrink-0"
                  style={{ backgroundColor: selected.color || "#6B7280" }}
                />
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-bold truncate">{selected.name}</h2>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    {selected.isBeverage && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/10 px-2 py-0.5 text-xs font-medium text-cyan-600">
                        <BeerStein className="size-3.5" weight="fill" />
                        Bebida
                      </span>
                    )}
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                        selected.hasCustomFlow
                          ? "bg-blue-500/10 text-blue-600"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <FlowArrow className="size-3.5" />
                      {selected.hasCustomFlow ? "Flujo propio" : "Flujo default"}
                    </span>
                  </div>
                  {selected.description && (
                    <p className="text-sm text-muted-foreground mt-2">
                      {selected.description}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEdit(selected)}
                    className="gap-1.5"
                  >
                    <Pencil className="size-4" />
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(selected.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash className="size-4" />
                  </Button>
                </div>
              </div>

              {/* Category flow */}
              <button
                type="button"
                onClick={() =>
                  router.push(`/inventory/categories/${selected.id}/flow`)
                }
                className="flex w-full items-center gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent/60"
              >
                <div className="rounded-lg bg-blue-500/10 p-2.5">
                  <FlowArrow className="size-5 text-blue-600" weight="duotone" />
                </div>
                <div className="flex-1">
                  <p className="font-medium">Flujo de la categoría</p>
                  <p className="text-sm text-muted-foreground">
                    {selected.hasCustomFlow
                      ? "Personalizado — aplica a todos sus productos"
                      : "Usa el flujo default (Escarchado · Topping · Extras)"}
                  </p>
                </div>
                <CaretRight className="size-4 text-muted-foreground" />
              </button>

              {/* Subcategories */}
              <div className="rounded-lg border bg-card">
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <div>
                    <p className="font-medium">Subcategorías</p>
                    <p className="text-xs text-muted-foreground">
                      Agrupan productos dentro de la categoría y pueden tener su
                      propio flujo
                    </p>
                  </div>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {subcats.length}
                  </span>
                </div>

                <div className="p-3 space-y-1">
                  {subcats.length === 0 && (
                    <p className="px-1 py-3 text-sm text-muted-foreground">
                      Sin subcategorías. Los productos se muestran sin agrupar en
                      Bruma POS.
                    </p>
                  )}

                  {subcats.map((sub, index) => (
                    <div
                      key={sub.id}
                      className="flex items-center gap-2 rounded-md px-1 py-1.5 hover:bg-accent/50"
                    >
                      <div className="flex flex-col">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() =>
                            handleMoveSubcategory(subcats, index, -1)
                          }
                          className="text-muted-foreground/50 hover:text-foreground disabled:opacity-20"
                        >
                          <ArrowUp className="size-3" />
                        </button>
                        <button
                          type="button"
                          disabled={index === subcats.length - 1}
                          onClick={() =>
                            handleMoveSubcategory(subcats, index, 1)
                          }
                          className="text-muted-foreground/50 hover:text-foreground disabled:opacity-20"
                        >
                          <ArrowDown className="size-3" />
                        </button>
                      </div>

                      {editingSubcatId === sub.id ? (
                        <div className="flex flex-1 items-center gap-1">
                          <Input
                            value={editingSubcatName}
                            autoFocus
                            onChange={(e) => setEditingSubcatName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleRenameSubcategory(sub.id);
                              } else if (e.key === "Escape") {
                                setEditingSubcatId(null);
                              }
                            }}
                            className="h-8 flex-1"
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRenameSubcategory(sub.id)}
                          >
                            <Check className="size-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingSubcatId(null)}
                          >
                            <X className="size-4" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="flex-1 truncate text-left text-sm font-medium hover:underline"
                            onClick={() => {
                              setEditingSubcatId(sub.id);
                              setEditingSubcatName(sub.name);
                            }}
                          >
                            {sub.name}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              router.push(`/inventory/subcategories/${sub.id}/flow`)
                            }
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition-colors ${
                              sub.hasCustomFlow
                                ? "bg-blue-500/10 text-blue-600 hover:bg-blue-500/20"
                                : "bg-muted text-muted-foreground hover:bg-accent"
                            }`}
                          >
                            <FlowArrow className="size-3.5" />
                            {sub.hasCustomFlow ? "Flujo propio" : "Hereda categoría"}
                            <CaretRight className="size-3" />
                          </button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteSubcategory(sub.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash className="size-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  ))}

                  <div className="flex gap-2 pt-2">
                    <Input
                      value={newSubcatName}
                      onChange={(e) => setNewSubcatName(e.target.value)}
                      placeholder="Nueva subcategoría (ej. Fríos, Calientes, Té…)"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddSubcategory();
                        }
                      }}
                      className="h-9"
                    />
                    <Button
                      onClick={handleAddSubcategory}
                      disabled={subcatSaving || !newSubcatName.trim()}
                      className="h-9 shrink-0 gap-1.5"
                    >
                      <Plus className="size-4" />
                      Agregar
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? "Editar categoría" : "Nueva categoría"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">Nombre</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                required
              />
            </div>

            <div>
              <Label htmlFor="description">Descripción</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                rows={3}
              />
            </div>

            <div>
              <Label>Color</Label>
              <div className="grid grid-cols-5 gap-2 mt-2">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    onClick={() =>
                      setFormData({ ...formData, color: color.value })
                    }
                    className={`h-11 rounded-md border-2 transition-all ${
                      formData.color === color.value
                        ? "border-primary scale-110"
                        : "border-transparent"
                    }`}
                    style={{ backgroundColor: color.value }}
                    title={color.name}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <BeerStein className="size-4 text-cyan-500" weight="fill" />
                <Label htmlFor="isBeverage" className="cursor-pointer">
                  Es bebida
                </Label>
              </div>
              <Switch
                id="isBeverage"
                checked={formData.isBeverage}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, isBeverage: checked })
                }
              />
            </div>

            <div className="flex gap-2">
              <Button type="submit" className="flex-1">
                {editingCategory ? "Actualizar" : "Crear"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancelar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
