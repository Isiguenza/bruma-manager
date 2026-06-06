"use client";

import { useState, useEffect } from "react";
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
  ArrowUp,
  ArrowDown,
  ArrowCounterClockwise,
} from "@phosphor-icons/react";
import { Switch } from "@/components/ui/switch";
import { useRouter } from "next/navigation";
import type { Category } from "@/lib/types";

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

  useEffect(() => {
    fetchCategories();
  }, []);

  async function fetchCategories() {
    try {
      const res = await fetch("/api/categories");
      if (res.ok) {
        const data = await res.json();
        setCategories(data);
        setOrderedCategories(data);
      }
    } catch (error) {
      toast.error("Error cargando categorías");
    } finally {
      setLoading(false);
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

  function moveCategory(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= orderedCategories.length) return;
    const newArr = [...orderedCategories];
    [newArr[index], newArr[newIndex]] = [newArr[newIndex], newArr[index]];
    setOrderedCategories(newArr);
  }

  async function handleSaveOrder() {
    setSavingOrder(true);
    try {
      const orders = orderedCategories.map((cat, idx) => ({
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

  function handleResetOrder() {
    setOrderedCategories(categories);
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
              Usa las flechas para ordenar. El orden se refleja en el POS.
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
              disabled={savingOrder}
            >
              {savingOrder ? "Guardando..." : "Guardar orden"}
            </Button>
          </div>
        </div>

        <div className="rounded-lg border bg-card">
          {orderedCategories.map((category, index) => (
            <div
              key={category.id}
              className={`flex items-center gap-3 px-4 py-3 ${
                index !== orderedCategories.length - 1 ? "border-b" : ""
              }`}
            >
              <div
                className="size-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: category.color || "#6B7280" }}
              />
              <span className="flex-1 font-medium">{category.name}</span>
              {category.isBeverage && (
                <BeerStein className="size-4 text-cyan-500" weight="fill" />
              )}
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => moveCategory(index, -1)}
                  disabled={index === 0}
                >
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => moveCategory(index, 1)}
                  disabled={index === orderedCategories.length - 1}
                >
                  <ArrowDown className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
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
    </div>
  );
}
