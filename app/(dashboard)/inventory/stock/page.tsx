"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Pencil,
  Trash,
  Package,
  TrendDown,
  CurrencyDollar,
  Warning,
} from "@phosphor-icons/react";
import { toast } from "sonner";

interface InventoryProduct {
  id: string;
  name: string;
  description: string | null;
  unit: string;
  currentStock: string;
  minStock: string;
  cost: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

const UNITS = [
  "unidad",
  "caja",
  "paquete",
  "litro",
  "kilogramo",
  "docena",
  "pieza",
];

export default function InventoryStockPage() {
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<InventoryProduct | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState("unidad");
  const [currentStock, setCurrentStock] = useState("");
  const [minStock, setMinStock] = useState("");
  const [cost, setCost] = useState("");

  useEffect(() => {
    fetchProducts();
  }, []);

  async function fetchProducts() {
    try {
      const res = await fetch("/api/inventory/stock");
      if (res.ok) {
        setProducts(await res.json());
      }
    } catch (error) {
      toast.error("Error cargando productos");
    } finally {
      setLoading(false);
    }
  }

  function openCreateDialog() {
    setEditingProduct(null);
    setName("");
    setDescription("");
    setUnit("unidad");
    setCurrentStock("0");
    setMinStock("0");
    setCost("0");
    setDialogOpen(true);
  }

  function openEditDialog(product: InventoryProduct) {
    setEditingProduct(product);
    setName(product.name);
    setDescription(product.description || "");
    setUnit(product.unit);
    setCurrentStock(product.currentStock);
    setMinStock(product.minStock);
    setCost(product.cost);
    setDialogOpen(true);
  }

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error("El nombre es requerido");
      return;
    }

    setSubmitting(true);
    try {
      const url = editingProduct
        ? `/api/inventory/stock/${editingProduct.id}`
        : "/api/inventory/stock";
      
      const method = editingProduct ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || null,
          unit,
          currentStock,
          minStock,
          cost,
        }),
      });

      if (res.ok) {
        toast.success(editingProduct ? "Producto actualizado" : "Producto creado");
        setDialogOpen(false);
        fetchProducts();
      } else {
        toast.error("Error al guardar producto");
      }
    } catch (error) {
      toast.error("Error al guardar producto");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Estás seguro de eliminar este producto?")) return;

    try {
      const res = await fetch(`/api/inventory/stock/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Producto eliminado");
        fetchProducts();
      } else {
        toast.error("Error al eliminar producto");
      }
    } catch (error) {
      toast.error("Error al eliminar producto");
    }
  }

  const activeProducts = products.filter(p => p.active);
  const lowStockProducts = activeProducts.filter(
    p => parseFloat(p.currentStock) <= parseFloat(p.minStock)
  );
  const totalValue = activeProducts.reduce(
    (sum, p) => sum + parseFloat(p.currentStock) * parseFloat(p.cost),
    0
  );

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(value);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-2">
          <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground">Cargando inventario...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inventario</h1>
          <p className="text-muted-foreground mt-1">
            Control de productos contables
          </p>
        </div>
        <Button onClick={openCreateDialog} className="gap-2">
          <Plus className="size-4" />
          Nuevo Producto
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-500/10 p-3">
                <Package className="size-5 text-blue-600" weight="duotone" />
              </div>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Productos
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeProducts.length}</div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-orange-500/10 p-3">
                <Warning className="size-5 text-orange-600" weight="duotone" />
              </div>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Bajo Stock
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{lowStockProducts.length}</div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-green-500/10 p-3">
                <CurrencyDollar className="size-5 text-green-600" weight="duotone" />
              </div>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Valor Total
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalValue)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Divider */}
      <div className="border-t" />

      {/* Products Grid */}
      {activeProducts.length === 0 ? (
        <Card className="border-none shadow-sm">
          <CardContent className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <Package className="size-16 mb-4 opacity-20" weight="duotone" />
            <p className="text-lg font-medium">No hay productos en inventario</p>
            <p className="text-sm">Crea tu primer producto para comenzar</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {activeProducts.map((product) => {
            const isLowStock = parseFloat(product.currentStock) <= parseFloat(product.minStock);
            const stockValue = parseFloat(product.currentStock) * parseFloat(product.cost);

            return (
              <Card
                key={product.id}
                className={`group border-none shadow-sm hover:shadow-md transition-all ${
                  isLowStock ? "ring-2 ring-orange-500/20" : ""
                }`}
              >
                <CardContent className="p-6">
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-lg truncate">{product.name}</h3>
                        {product.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                            {product.description}
                          </p>
                        )}
                      </div>
                      {isLowStock && (
                        <Badge variant="destructive" className="ml-2">
                          <Warning className="size-3 mr-1" weight="fill" />
                          Bajo
                        </Badge>
                      )}
                    </div>

                    {/* Stock Info */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Stock actual:</span>
                        <span className="font-semibold">
                          {parseFloat(product.currentStock).toFixed(2)} {product.unit}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Stock mínimo:</span>
                        <span>{parseFloat(product.minStock).toFixed(2)} {product.unit}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Costo unitario:</span>
                        <span>{formatCurrency(parseFloat(product.cost))}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm pt-2 border-t">
                        <span className="text-muted-foreground font-medium">Valor total:</span>
                        <span className="font-bold text-primary">
                          {formatCurrency(stockValue)}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-2 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditDialog(product)}
                        className="flex-1 gap-2"
                      >
                        <Pencil className="size-4" />
                        Editar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(product.id)}
                        className="gap-2 text-destructive hover:text-destructive"
                      >
                        <Trash className="size-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? "Editar Producto" : "Nuevo Producto"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Coca Cola 600ml"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descripción</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descripción opcional"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="unit">Unidad *</Label>
                <Select value={unit} onValueChange={setUnit}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cost">Costo</Label>
                <Input
                  id="cost"
                  type="number"
                  step="0.01"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="currentStock">Stock Actual</Label>
                <Input
                  id="currentStock"
                  type="number"
                  step="0.01"
                  value={currentStock}
                  onChange={(e) => setCurrentStock(e.target.value)}
                  placeholder="0"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="minStock">Stock Mínimo</Label>
                <Input
                  id="minStock"
                  type="number"
                  step="0.01"
                  value={minStock}
                  onChange={(e) => setMinStock(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
