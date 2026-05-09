"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  Plus, 
  PencilSimple, 
  Trash, 
  MagnifyingGlass, 
  WarningCircle,
  Package,
  CheckCircle,
  XCircle,
  TrendDown,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import type { Ingredient } from "@/lib/types";

interface IngredientForm {
  name: string;
  unit: string;
  currentStock: string;
  minStock: string;
  costPerUnit: string;
  active: boolean;
}

const emptyForm: IngredientForm = {
  name: "",
  unit: "",
  currentStock: "0",
  minStock: "0",
  costPerUnit: "0",
  active: true,
};

export default function IngredientsPage() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<IngredientForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchIngredients();
  }, []);

  async function fetchIngredients() {
    try {
      const res = await fetch("/api/ingredients");
      if (res.ok) setIngredients(await res.json());
    } catch {
      toast.error("Error cargando ingredientes");
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setDialogOpen(true);
  }

  function openEdit(ing: Ingredient) {
    setForm({
      name: ing.name,
      unit: ing.unit,
      currentStock: ing.currentStock,
      minStock: ing.minStock,
      costPerUnit: ing.costPerUnit,
      active: ing.active,
    });
    setEditingId(ing.id);
    setDialogOpen(true);
  }

  async function handleSubmit() {
    if (!form.name || !form.unit) {
      toast.error("Nombre y unidad son requeridos");
      return;
    }
    setSubmitting(true);
    try {
      const url = editingId ? `/api/ingredients/${editingId}` : "/api/ingredients";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      toast.success(editingId ? "Ingrediente actualizado" : "Ingrediente creado");
      setDialogOpen(false);
      fetchIngredients();
    } catch {
      toast.error("Error guardando ingrediente");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/ingredients/${deleteId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Ingrediente eliminado");
      fetchIngredients();
    } catch {
      toast.error("Error eliminando ingrediente");
    } finally {
      setDeleteId(null);
    }
  }

  const filtered = ingredients.filter(
    (i) => !search || i.name.toLowerCase().includes(search.toLowerCase())
  );

  const isLowStock = (ing: Ingredient) =>
    parseFloat(ing.currentStock) <= parseFloat(ing.minStock);

  const activeIngredients = ingredients.filter(i => i.active).length;
  const inactiveIngredients = ingredients.filter(i => !i.active).length;
  const lowStockCount = ingredients.filter(i => isLowStock(i)).length;
  const totalValue = ingredients.reduce((sum, i) => sum + (parseFloat(i.currentStock) * parseFloat(i.costPerUnit)), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-2">
          <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground">Cargando ingredientes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Ingredientes</h1>
          <p className="text-muted-foreground mt-1">
            Gestiona el inventario de ingredientes
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="size-4" /> Ingrediente
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-500/10 p-3">
                <Package className="size-5 text-blue-600" weight="duotone" />
              </div>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Ingredientes
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{ingredients.length}</div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-green-500/10 p-3">
                <CheckCircle className="size-5 text-green-600" weight="duotone" />
              </div>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Activos
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeIngredients}</div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-red-500/10 p-3">
                <TrendDown className="size-5 text-red-600" weight="duotone" />
              </div>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Stock Bajo
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{lowStockCount}</div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-purple-500/10 p-3">
                <Package className="size-5 text-purple-600" weight="duotone" />
              </div>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Valor Inventario
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalValue.toFixed(2)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Divider */}
      <div className="border-t" />

      {/* Search */}
      <div className="relative">
        <MagnifyingGlass className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar ingrediente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-11"
        />
      </div>

      {/* Table */}
      <Card className="border-none shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Unidad</TableHead>
                <TableHead className="text-right">Stock Actual</TableHead>
                <TableHead className="text-right">Stock Mínimo</TableHead>
                <TableHead className="text-right">Costo/Unidad</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center">
                    Cargando...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    No hay ingredientes
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((ing) => (
                  <TableRow key={ing.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {ing.name}
                        {isLowStock(ing) && (
                          <WarningCircle className="size-4 text-destructive" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{ing.unit}</TableCell>
                    <TableCell className={`text-right font-medium ${isLowStock(ing) ? "text-destructive" : ""}`}>
                      {parseFloat(ing.currentStock).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      {parseFloat(ing.minStock).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      ${parseFloat(ing.costPerUnit).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={ing.active ? "default" : "secondary"}>
                        {ing.active ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(ing)}>
                          <PencilSimple className="size-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteId(ing.id)}>
                          <Trash className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Form Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Editar Ingrediente" : "Nuevo Ingrediente"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nombre *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ej: Ron blanco"
                />
              </div>
              <div className="space-y-2">
                <Label>Unidad *</Label>
                <Input
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  placeholder="Ej: ml, kg, pz"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Stock Actual</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.currentStock}
                  onChange={(e) => setForm({ ...form, currentStock: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Stock Mínimo</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.minStock}
                  onChange={(e) => setForm({ ...form, minStock: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Costo/Unidad</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.costPerUnit}
                  onChange={(e) => setForm({ ...form, costPerUnit: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.active}
                onCheckedChange={(v) => setForm({ ...form, active: v })}
              />
              <Label>Activo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Guardando..." : editingId ? "Actualizar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar ingrediente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
