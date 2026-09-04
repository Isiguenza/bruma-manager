"use client";

import { useState, useEffect } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash,
  FlowArrow,
  BeerStein,
  FolderOpen,
  CheckCircle,
  XCircle,
  Package,
  ArrowCounterClockwise,
  DotsSixVertical,
  SortAscending,
  HandGrabbing,
  ListBullets,
  ArrowUp,
  ArrowDown,
} from "@phosphor-icons/react";
import { Switch } from "@/components/ui/switch";
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

// Sortable category item for drag-and-drop
function SortableCategoryItem({ category }: { category: Category }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0 bg-card hover:bg-accent/50 transition-colors"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground"
      >
        <DotsSixVertical className="size-5" />
      </button>
      <div
        className="size-3 rounded-full flex-shrink-0"
        style={{ backgroundColor: category.color || "#6B7280" }}
      />
      <span className="flex-1 font-medium">{category.name}</span>
      {category.isBeverage && (
        <BeerStein className="size-4 text-cyan-500" weight="fill" />
      )}
    </div>
  );
}

export default function CategoriesPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    color: "#6B7280",
    sortOrder: 0,
    isBeverage: false,
  });
  const [orderedCategories, setOrderedCategories] = useState<Category[]>([]);
  const [savingOrder, setSavingOrder] = useState(false);
  const [sortMode, setSortMode] = useState<"custom" | "alphabetical">("custom");

  // Subcategories dialog
  const [subcatDialogOpen, setSubcatDialogOpen] = useState(false);
  const [subcatCategoryId, setSubcatCategoryId] = useState<string | null>(null);
  const [subcatList, setSubcatList] = useState<Subcategory[]>([]);
  const [newSubcatName, setNewSubcatName] = useState("");
  const [editingSubcatId, setEditingSubcatId] = useState<string | null>(null);
  const [editingSubcatName, setEditingSubcatName] = useState("");
  const [subcatSaving, setSubcatSaving] = useState(false);

  const subcatCategory = categories.find((c) => c.id === subcatCategoryId) || null;

  useEffect(() => {
    fetchCategories();
  }, []);

  async function fetchCategoriesData(): Promise<Category[] | null> {
    try {
      const res = await fetch("/api/categories");
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async function fetchCategories() {
    const data = await fetchCategoriesData();
    if (data) {
      setCategories(data);
      setOrderedCategories(data);
    } else {
      toast.error("Error cargando categorías");
    }
    setLoading(false);
  }

  function openSubcatDialog(category: Category) {
    setSubcatCategoryId(category.id);
    setSubcatList(category.subcategories || []);
    setNewSubcatName("");
    setEditingSubcatId(null);
    setSubcatDialogOpen(true);
  }

  async function refreshSubcategories() {
    const data = await fetchCategoriesData();
    if (data && subcatCategoryId) {
      setCategories(data);
      setOrderedCategories(data);
      const updated = data.find((c) => c.id === subcatCategoryId);
      setSubcatList(updated?.subcategories || []);
    }
  }

  async function handleAddSubcategory() {
    if (!subcatCategoryId || !newSubcatName.trim()) return;
    setSubcatSaving(true);
    try {
      const res = await fetch(`/api/categories/${subcatCategoryId}/subcategories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newSubcatName.trim(), sortOrder: subcatList.length }),
      });
      if (!res.ok) throw new Error();
      setNewSubcatName("");
      await refreshSubcategories();
      toast.success("Subcategoría creada");
    } catch {
      toast.error("Error creando subcategoría");
    } finally {
      setSubcatSaving(false);
    }
  }

  async function handleRenameSubcategory(id: string) {
    if (!editingSubcatName.trim()) return;
    try {
      const res = await fetch(`/api/subcategories/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingSubcatName.trim() }),
      });
      if (!res.ok) throw new Error();
      setEditingSubcatId(null);
      await refreshSubcategories();
      toast.success("Subcategoría actualizada");
    } catch {
      toast.error("Error actualizando subcategoría");
    }
  }

  async function handleDeleteSubcategory(id: string) {
    if (!confirm("¿Eliminar esta subcategoría? Los productos que la usan quedarán sin subcategoría.")) return;
    try {
      const res = await fetch(`/api/subcategories/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      await refreshSubcategories();
      toast.success("Subcategoría eliminada");
    } catch {
      toast.error("Error eliminando subcategoría");
    }
  }

  async function handleMoveSubcategory(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= subcatList.length) return;
    const reordered = [...subcatList];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    setSubcatList(reordered);
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
      await refreshSubcategories();
    } catch {
      toast.error("Error guardando orden");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    try {
      const url = editingCategory ? `/api/categories/${editingCategory.id}` : "/api/categories";
      const method = editingCategory ? "PUT" : "POST";
      
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) throw new Error();

      toast.success(editingCategory ? "Categoría actualizada" : "Categoría creada");
      setDialogOpen(false);
      resetForm();
      fetchCategories();
    } catch (error) {
      toast.error("Error guardando categoría");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar esta categoría?")) return;

    try {
      const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      
      toast.success("Categoría eliminada");
      fetchCategories();
    } catch (error) {
      toast.error("Error eliminando categoría");
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setSortMode("custom");
      setOrderedCategories((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }

  async function persistOrder(ordered: Category[]) {
    setSavingOrder(true);
    try {
      const orders = ordered.map((cat, idx) => ({
        id: cat.id,
        sortOrder: idx,
      }));
      const res = await fetch("/api/categories/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orders }),
      });
      if (!res.ok) throw new Error();
      toast.success("Orden guardado");
      fetchCategories();
    } catch {
      toast.error("Error guardando orden");
    } finally {
      setSavingOrder(false);
    }
  }

  async function handleSaveOrder() {
    await persistOrder(orderedCategories);
  }

  function handleResetOrder() {
    setOrderedCategories(categories);
  }

  async function handleSortModeChange(mode: "custom" | "alphabetical") {
    setSortMode(mode);
    if (mode === "alphabetical") {
      const sorted = [...categories].sort((a, b) =>
        a.name.localeCompare(b.name, "es", { sensitivity: "base" })
      );
      setOrderedCategories(sorted);
      await persistOrder(sorted);
    } else {
      setOrderedCategories(categories);
    }
  }

  function handleEdit(category: Category) {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      description: category.description || "",
      color: category.color || "#6B7280",
      sortOrder: category.sortOrder,
      isBeverage: category.isBeverage || false,
    });
    setDialogOpen(true);
  }

  function resetForm() {
    setEditingCategory(null);
    setFormData({
      name: "",
      description: "",
      color: "#6B7280",
      sortOrder: 0,
      isBeverage: false,
    });
  }

  const activeCategories = categories.filter(c => c.active).length;
  const inactiveCategories = categories.filter(c => !c.active).length;
  const beverageCategories = categories.filter(c => c.isBeverage).length;

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

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Categorías de Productos</h1>
            <p className="text-muted-foreground mt-1">
              Organiza y gestiona tus categorías
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm} className="gap-2">
                <Plus className="size-4" />
                Nueva Categoría
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingCategory ? "Editar Categoría" : "Nueva Categoría"}
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
                      className={`h-12 rounded-md border-2 transition-all ${
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

              <div>
                <Label htmlFor="sortOrder">Orden</Label>
                <Input
                  id="sortOrder"
                  type="number"
                  value={formData.sortOrder}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      sortOrder: parseInt(e.target.value),
                    })
                  }
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <BeerStein className="size-4 text-cyan-500" weight="fill" />
                  <Label htmlFor="isBeverage" className="cursor-pointer">Es bebida</Label>
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
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-500/10 p-3">
                <FolderOpen className="size-5 text-blue-600" weight="duotone" />
              </div>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Categorías
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{categories.length}</div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-green-500/10 p-3">
                <CheckCircle className="size-5 text-green-600" weight="duotone" />
              </div>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Activas
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeCategories}</div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-orange-500/10 p-3">
                <XCircle className="size-5 text-orange-600" weight="duotone" />
              </div>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Inactivas
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inactiveCategories}</div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-cyan-500/10 p-3">
                <BeerStein className="size-5 text-cyan-600" weight="duotone" />
              </div>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Bebidas
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{beverageCategories}</div>
          </CardContent>
        </Card>
      </div>

      {/* Divider */}
      <div className="border-t" />

      {/* Reorder Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Orden de categorías</h2>
            <p className="text-sm text-muted-foreground">
              Elige cómo se acomodan. El orden se refleja en Bruma POS (iOS).
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetOrder}
              disabled={savingOrder}
            >
              <ArrowCounterClockwise className="size-4 mr-1" />
              Restaurar
            </Button>
            <Button
              size="sm"
              onClick={handleSaveOrder}
              disabled={savingOrder || sortMode === "alphabetical"}
            >
              {savingOrder ? "Guardando..." : "Guardar orden"}
            </Button>
          </div>
        </div>

        {/* Sort mode toggle: custom (drag) vs alphabetical */}
        <div className="inline-flex rounded-lg border bg-muted p-1">
          <button
            type="button"
            onClick={() => handleSortModeChange("custom")}
            disabled={savingOrder}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              sortMode === "custom"
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <HandGrabbing className="size-4" />
            Personalizado
          </button>
          <button
            type="button"
            onClick={() => handleSortModeChange("alphabetical")}
            disabled={savingOrder}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              sortMode === "alphabetical"
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <SortAscending className="size-4" />
            Alfabético (A-Z)
          </button>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={orderedCategories.map((c) => c.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="rounded-lg border bg-card">
              {orderedCategories.map((category) => (
                <SortableCategoryItem
                  key={category.id}
                  category={category}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      <div className="border-t" />

      {/* Categories Grid */}
      {categories.length === 0 ? (
        <Card className="border-none shadow-sm">
          <CardContent className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <FolderOpen className="size-16 mb-4 opacity-20" weight="duotone" />
            <p className="text-lg font-medium">No hay categorías creadas</p>
            <p className="text-sm">Crea tu primera categoría para organizar productos</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => (
            <Card 
              key={category.id} 
              className="group border-none shadow-sm hover:shadow-md transition-all"
            >
              <CardContent className="p-5">
                <div className="space-y-3">
                  {/* Header with color dot aligned with title */}
                  <div className="flex items-center gap-3">
                    <div
                      className="size-3 rounded-full shadow-sm animate-pulse"
                      style={{ 
                        backgroundColor: category.color || "#6B7280",
                        boxShadow: `0 0 0 4px ${category.color || "#6B7280"}20`
                      }}
                    />
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg leading-none">{category.name}</h3>
                    </div>
                  </div>

                  {/* Metadata */}
                  <div className="flex items-center gap-2 pl-6">
                    <span className="text-xs text-muted-foreground">
                      Orden: {category.sortOrder}
                    </span>
                    {category.isBeverage && (
                      <>
                        <span className="text-xs text-muted-foreground">•</span>
                        <div className="flex items-center gap-1 text-cyan-600">
                          <BeerStein className="size-3.5" weight="fill" />
                          <span className="text-xs font-medium">Bebida</span>
                        </div>
                      </>
                    )}
                    <span className="text-xs text-muted-foreground">•</span>
                    {(category as any).hasCustomFlow ? (
                      <div className="flex items-center gap-1 text-blue-600">
                        <FlowArrow className="size-3.5" />
                        <span className="text-xs font-medium">Flujo propio</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <FlowArrow className="size-3.5" />
                        <span className="text-xs">Flujo default</span>
                      </div>
                    )}
                  </div>

                  {/* Description */}
                  {category.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2 pl-6">
                      {category.description}
                    </p>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push(`/inventory/categories/${category.id}/flow`)}
                      className="flex-1 gap-2"
                      title="Configurar flujo de modificadores"
                    >
                      <FlowArrow className="size-4" />
                      Flujo
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openSubcatDialog(category)}
                      className="gap-2"
                      title="Gestionar subcategorías"
                    >
                      <ListBullets className="size-4" />
                      {category.subcategories && category.subcategories.length > 0
                        ? category.subcategories.length
                        : ""}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(category)}
                      className="gap-2"
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(category.id)}
                      className="gap-2 text-destructive hover:text-destructive"
                    >
                      <Trash className="size-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Subcategories Dialog */}
      <Dialog open={subcatDialogOpen} onOpenChange={setSubcatDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Subcategorías de {subcatCategory?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={newSubcatName}
                onChange={(e) => setNewSubcatName(e.target.value)}
                placeholder="Ej: Fríos, Calientes, Té..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddSubcategory();
                  }
                }}
              />
              <Button
                onClick={handleAddSubcategory}
                disabled={subcatSaving || !newSubcatName.trim()}
                className="gap-2 shrink-0"
              >
                <Plus className="size-4" />
                Agregar
              </Button>
            </div>

            {subcatList.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Esta categoría no tiene subcategorías. Los productos se
                mostrarán sin agrupar en Bruma POS.
              </p>
            ) : (
              <div className="rounded-lg border divide-y">
                {subcatList.map((sub, index) => (
                  <div key={sub.id} className="flex items-center gap-2 px-3 py-2">
                    <div className="flex flex-col">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => handleMoveSubcategory(index, -1)}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-20"
                      >
                        <ArrowUp className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={index === subcatList.length - 1}
                        onClick={() => handleMoveSubcategory(index, 1)}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-20"
                      >
                        <ArrowDown className="size-3.5" />
                      </button>
                    </div>

                    {editingSubcatId === sub.id ? (
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
                        onBlur={() => handleRenameSubcategory(sub.id)}
                        className="h-8 flex-1"
                      />
                    ) : (
                      <span
                        className="flex-1 text-sm font-medium cursor-pointer hover:underline"
                        onClick={() => {
                          setEditingSubcatId(sub.id);
                          setEditingSubcatName(sub.name);
                        }}
                      >
                        {sub.name}
                      </span>
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingSubcatId(sub.id);
                        setEditingSubcatName(sub.name);
                      }}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteSubcategory(sub.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setSubcatDialogOpen(false)}
            >
              Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
