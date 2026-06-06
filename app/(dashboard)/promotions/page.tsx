"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { Tag, CheckCircle, XCircle, TrendUp } from "@phosphor-icons/react";
import type { Promotion, Product, Category } from "@/lib/types";

export default function PromotionsPage() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    type: "buy_x_get_y" as "buy_x_get_y" | "percentage_discount" | "fixed_discount" | "combo",
    buyQuantity: 2,
    getQuantity: 1,
    discountPercentage: 0,
    discountAmount: 0,
    applyTo: "all_products" as "all_products" | "specific_products" | "category",
    productIds: [] as string[],
    categoryId: "",
    active: true,
    startDate: "",
    endDate: "",
    daysOfWeek: [] as number[],
    startTime: "",
    endTime: "",
    priority: 0,
  });

  useEffect(() => {
    fetchPromotions();
    fetchProducts();
    fetchCategories();
  }, []);

  async function fetchPromotions() {
    try {
      const res = await fetch("/api/promotions");
      if (res.ok) {
        const data = await res.json();
        setPromotions(data);
      }
    } catch (error) {
      console.error("Error fetching promotions:", error);
      toast.error("Error al cargar promociones");
    } finally {
      setLoading(false);
    }
  }

  async function fetchProducts() {
    try {
      const res = await fetch("/api/products?active=true");
      if (res.ok) {
        const data = await res.json();
        setProducts(data);
      }
    } catch (error) {
      console.error("Error fetching products:", error);
    }
  }

  async function fetchCategories() {
    try {
      const res = await fetch("/api/categories");
      if (res.ok) {
        const data = await res.json();
        setCategories(data);
      }
    } catch (error) {
      console.error("Error fetching categories:", error);
    }
  }

  function handleNewPromotion() {
    setEditingPromotion(null);
    setFormData({
      name: "",
      description: "",
      type: "buy_x_get_y",
      buyQuantity: 2,
      getQuantity: 1,
      discountPercentage: 0,
      discountAmount: 0,
      applyTo: "all_products",
      productIds: [],
      categoryId: "",
      active: true,
      startDate: "",
      endDate: "",
      daysOfWeek: [],
      startTime: "",
      endTime: "",
      priority: 0,
    });
    setShowDialog(true);
  }

  function handleEdit(promotion: Promotion) {
    setEditingPromotion(promotion);
    setFormData({
      name: promotion.name,
      description: promotion.description || "",
      type: promotion.type,
      buyQuantity: promotion.buyQuantity || 2,
      getQuantity: promotion.getQuantity || 1,
      discountPercentage: promotion.discountPercentage ? parseFloat(promotion.discountPercentage.toString()) : 0,
      discountAmount: promotion.discountAmount ? parseFloat(promotion.discountAmount.toString()) : 0,
      applyTo: promotion.applyTo,
      productIds: promotion.productIds ? JSON.parse(promotion.productIds) : [],
      categoryId: promotion.categoryId || "",
      active: promotion.active,
      startDate: promotion.startDate || "",
      endDate: promotion.endDate || "",
      daysOfWeek: promotion.daysOfWeek ? JSON.parse(promotion.daysOfWeek) : [],
      startTime: promotion.startTime || "",
      endTime: promotion.endTime || "",
      priority: promotion.priority,
    });
    setShowDialog(true);
  }

  async function handleSubmit() {
    try {
      const url = editingPromotion
        ? `/api/promotions/${editingPromotion.id}`
        : "/api/promotions";
      
      const method = editingPromotion ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        toast.success(editingPromotion ? "Promoción actualizada" : "Promoción creada");
        setShowDialog(false);
        fetchPromotions();
      } else {
        const error = await res.json();
        toast.error(error.error || "Error al guardar promoción");
      }
    } catch (error) {
      console.error("Error saving promotion:", error);
      toast.error("Error al guardar promoción");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Estás seguro de eliminar esta promoción?")) return;

    try {
      const res = await fetch(`/api/promotions/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Promoción eliminada");
        fetchPromotions();
      } else {
        toast.error("Error al eliminar promoción");
      }
    } catch (error) {
      console.error("Error deleting promotion:", error);
      toast.error("Error al eliminar promoción");
    }
  }

  async function handleToggleActive(promotion: Promotion) {
    try {
      const res = await fetch(`/api/promotions/${promotion.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !promotion.active }),
      });

      if (res.ok) {
        toast.success(promotion.active ? "Promoción desactivada" : "Promoción activada");
        fetchPromotions();
      } else {
        toast.error("Error al cambiar estado");
      }
    } catch (error) {
      console.error("Error toggling active:", error);
      toast.error("Error al cambiar estado");
    }
  }

  const typeLabels = {
    buy_x_get_y: "Compra X Lleva Y",
    percentage_discount: "% Descuento",
    fixed_discount: "$ Descuento",
    combo: "Combo",
  };

  const applyToLabels = {
    all_products: "Todos los productos",
    specific_products: "Productos específicos",
    category: "Categoría",
  };

  const activePromotions = promotions.filter(p => p.active).length;
  const inactivePromotions = promotions.filter(p => !p.active).length;
  const buyXGetY = promotions.filter(p => p.type === 'buy_x_get_y').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-2">
          <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground">Cargando promociones...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Promociones</h1>
          <p className="text-muted-foreground mt-1">
            Gestiona ofertas y promociones especiales
          </p>
        </div>
        <Button onClick={handleNewPromotion} className="gap-2">
          <Plus className="h-4 w-4" />
          Nueva Promoción
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-500/10 p-3">
                <Tag className="size-5 text-blue-600" weight="duotone" />
              </div>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Promociones
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{promotions.length}</div>
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
            <div className="text-2xl font-bold">{activePromotions}</div>
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
            <div className="text-2xl font-bold">{inactivePromotions}</div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-purple-500/10 p-3">
                <TrendUp className="size-5 text-purple-600" weight="duotone" />
              </div>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                2x1 / 3x2
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{buyXGetY}</div>
          </CardContent>
        </Card>
      </div>

      {/* Divider */}
      <div className="border-t" />

      {/* Promotions Table */}
      <Card className="border-none shadow-sm">
        <CardContent className="p-0">
          <div className="rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted">
            <tr>
              <th className="text-left p-4">Nombre</th>
              <th className="text-left p-4">Tipo</th>
              <th className="text-left p-4">Aplica a</th>
              <th className="text-left p-4">Vigencia</th>
              <th className="text-left p-4">Estado</th>
              <th className="text-right p-4">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {promotions.map((promo) => (
              <tr key={promo.id} className="border-t">
                <td className="p-4">
                  <div>
                    <div className="font-medium">{promo.name}</div>
                    {promo.description && (
                      <div className="text-sm text-muted-foreground">{promo.description}</div>
                    )}
                  </div>
                </td>
                <td className="p-4">
                  <Badge variant="outline">{typeLabels[promo.type]}</Badge>
                </td>
                <td className="p-4">
                  <span className="text-sm">{applyToLabels[promo.applyTo]}</span>
                </td>
                <td className="p-4">
                  <div className="text-sm">
                    {promo.startDate || promo.endDate ? (
                      <>
                        {promo.startDate && <div>Desde: {promo.startDate}</div>}
                        {promo.endDate && <div>Hasta: {promo.endDate}</div>}
                      </>
                    ) : (
                      <span className="text-muted-foreground">Sin restricción</span>
                    )}
                  </div>
                </td>
                <td className="p-4">
                  <Badge variant={promo.active ? "default" : "secondary"}>
                    {promo.active ? "Activa" : "Inactiva"}
                  </Badge>
                </td>
                <td className="p-4">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleToggleActive(promo)}
                    >
                      {promo.active ? (
                        <ToggleRight className="h-4 w-4" />
                      ) : (
                        <ToggleLeft className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(promo)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(promo.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {promotions.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            No hay promociones creadas
          </div>
        )}
          </div>
        </CardContent>
      </Card>

      {/* Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingPromotion ? "Editar Promoción" : "Nueva Promoción"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Basic Info */}
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="ej: 2x1 en Tacos Ensenada"
              />
            </div>

            <div className="space-y-2">
              <Label>Descripción</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descripción opcional"
              />
            </div>

            {/* Type */}
            <div className="space-y-2">
              <Label>Tipo de Promoción *</Label>
              <Select
                value={formData.type}
                onValueChange={(value: any) => setFormData({ ...formData, type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="buy_x_get_y">Compra X Lleva Y (2x1, 3x2)</SelectItem>
                  <SelectItem value="percentage_discount">% Descuento</SelectItem>
                  <SelectItem value="fixed_discount">$ Descuento Fijo</SelectItem>
                  <SelectItem value="combo">Combo (X + Y = descuento)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Type-specific fields */}
            {formData.type === "buy_x_get_y" && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Cantidad a Comprar</Label>
                  <Input
                    type="number"
                    value={formData.buyQuantity}
                    onChange={(e) => setFormData({ ...formData, buyQuantity: parseInt(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cantidad Gratis</Label>
                  <Input
                    type="number"
                    value={formData.getQuantity}
                    onChange={(e) => setFormData({ ...formData, getQuantity: parseInt(e.target.value) })}
                  />
                </div>
              </div>
            )}

            {formData.type === "percentage_discount" && (
              <div className="space-y-2">
                <Label>Porcentaje de Descuento (%)</Label>
                <Input
                  type="number"
                  value={formData.discountPercentage}
                  onChange={(e) => setFormData({ ...formData, discountPercentage: parseFloat(e.target.value) })}
                  min="0"
                  max="100"
                />
              </div>
            )}

            {formData.type === "fixed_discount" && (
              <div className="space-y-2">
                <Label>Monto de Descuento ($)</Label>
                <Input
                  type="number"
                  value={formData.discountAmount}
                  onChange={(e) => setFormData({ ...formData, discountAmount: parseFloat(e.target.value) })}
                  min="0"
                />
              </div>
            )}

            {formData.type === "combo" && (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Items requeridos</Label>
                    <Input
                      type="number"
                      value={formData.buyQuantity}
                      onChange={(e) => setFormData({ ...formData, buyQuantity: parseInt(e.target.value) })}
                      min="2"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>% Descuento</Label>
                    <Input
                      type="number"
                      value={formData.discountPercentage}
                      onChange={(e) => setFormData({ ...formData, discountPercentage: parseFloat(e.target.value) })}
                      min="0"
                      max="100"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>$ Descuento</Label>
                    <Input
                      type="number"
                      value={formData.discountAmount}
                      onChange={(e) => setFormData({ ...formData, discountAmount: parseFloat(e.target.value) })}
                      min="0"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Aplica si el carrito tiene al menos los items seleccionados. El descuento se aplica a los items más baratos del combo.
                </p>
              </>
            )}

            {/* Apply To */}
            <div className="space-y-2">
              <Label>Aplicar a *</Label>
              <Select
                value={formData.applyTo}
                onValueChange={(value: any) => setFormData({ ...formData, applyTo: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_products">Todos los productos</SelectItem>
                  <SelectItem value="specific_products">Productos específicos</SelectItem>
                  <SelectItem value="category">Categoría</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.applyTo === "specific_products" && (
              <div className="space-y-2">
                <Label>Productos (selecciona uno o más)</Label>
                <div className="border rounded-lg p-3 max-h-60 overflow-y-auto space-y-3">
                  {products.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No hay productos disponibles</p>
                  ) : (
                    products.map((product) => {
                      const hasVariants = product.hasVariants && product.variants;
                      let variants: Array<{ name: string; price: string }> = [];
                      
                      if (hasVariants) {
                        try {
                          variants = JSON.parse(product.variants as string);
                        } catch (e) {
                          console.error('Error parsing variants:', e);
                        }
                      }

                      return (
                        <div key={product.id} className="space-y-1">
                          {/* Producto sin variantes */}
                          {!hasVariants && (
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                id={`product-${product.id}`}
                                checked={formData.productIds.includes(product.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setFormData({ 
                                      ...formData, 
                                      productIds: [...formData.productIds, product.id] 
                                    });
                                  } else {
                                    setFormData({ 
                                      ...formData, 
                                      productIds: formData.productIds.filter(id => id !== product.id) 
                                    });
                                  }
                                }}
                                className="h-4 w-4 rounded border-gray-300"
                              />
                              <label 
                                htmlFor={`product-${product.id}`}
                                className="text-sm cursor-pointer flex-1"
                              >
                                {product.name}
                                <span className="text-xs text-muted-foreground ml-2">
                                  ${product.price}
                                </span>
                              </label>
                            </div>
                          )}

                          {/* Producto con variantes */}
                          {hasVariants && variants.length > 0 && (
                            <div className="space-y-1">
                              <div className="text-sm font-medium text-foreground">
                                {product.name}
                              </div>
                              <div className="ml-4 space-y-1">
                                {variants.map((variant, idx) => {
                                  const variantId = `${product.id}-variant-${idx}`;
                                  return (
                                    <div key={variantId} className="flex items-center gap-2">
                                      <input
                                        type="checkbox"
                                        id={variantId}
                                        checked={formData.productIds.includes(variantId)}
                                        onChange={(e) => {
                                          if (e.target.checked) {
                                            setFormData({ 
                                              ...formData, 
                                              productIds: [...formData.productIds, variantId] 
                                            });
                                          } else {
                                            setFormData({ 
                                              ...formData, 
                                              productIds: formData.productIds.filter(id => id !== variantId) 
                                            });
                                          }
                                        }}
                                        className="h-4 w-4 rounded border-gray-300"
                                      />
                                      <label 
                                        htmlFor={variantId}
                                        className="text-sm cursor-pointer flex-1"
                                      >
                                        {variant.name}
                                        <span className="text-xs text-muted-foreground ml-2">
                                          ${variant.price}
                                        </span>
                                      </label>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
                {formData.productIds.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {formData.productIds.length} producto(s)/variante(s) seleccionado(s)
                  </p>
                )}
              </div>
            )}

            {formData.applyTo === "category" && (
              <div className="space-y-2">
                <Label>Categoría</Label>
                <Select
                  value={formData.categoryId}
                  onValueChange={(value) => setFormData({ ...formData, categoryId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Validity Period */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fecha Inicio</Label>
                <Input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Fecha Fin</Label>
                <Input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Hora Inicio</Label>
                <Input
                  type="time"
                  value={formData.startTime}
                  onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Hora Fin</Label>
                <Input
                  type="time"
                  value={formData.endTime}
                  onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Prioridad</Label>
              <Input
                type="number"
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) })}
                placeholder="0 = baja, mayor número = mayor prioridad"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.active}
                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                className="h-4 w-4"
              />
              <Label>Activa</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit}>
              {editingPromotion ? "Actualizar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
