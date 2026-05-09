"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { X, Plus, Trash } from "@phosphor-icons/react";
import type { ModifierStep, ModifierOption, Product, Category } from "@/lib/types";

interface StepEditPanelProps {
  step: ModifierStep;
  onUpdate: (updates: Partial<ModifierStep>) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function StepEditPanel({
  step,
  onUpdate,
  onDelete,
  onClose,
}: StepEditPanelProps) {
  const [stepName, setStepName] = useState(step.stepName);
  const [includeNone, setIncludeNone] = useState(step.includeNoneOption ?? true);
  const [options, setOptions] = useState<ModifierOption[]>(
    step.options || []
  );
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setStepName(step.stepName);
    setIncludeNone(step.includeNoneOption ?? true);
    setOptions(step.options || []);
    
    // Load selected items from step metadata
    if (step.stepType === "products" && step.options) {
      const productIds = new Set(step.options.map(o => o.id));
      setSelectedProducts(productIds);
    }
    if (step.stepType === "category" && step.options && step.options.length > 0) {
      setSelectedCategory(step.options[0]?.id || "");
    }
  }, [step]);

  useEffect(() => {
    if (step.stepType === "products" || step.stepType === "category") {
      fetchProductsAndCategories();
    }
  }, [step.stepType]);

  async function fetchProductsAndCategories() {
    setLoading(true);
    try {
      const [productsRes, categoriesRes] = await Promise.all([
        fetch("/api/products"),
        fetch("/api/categories"),
      ]);
      if (productsRes.ok) {
        const data = await productsRes.json();
        setProducts(data);
      }
      if (categoriesRes.ok) {
        const data = await categoriesRes.json();
        setCategories(data);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  }

  const handleSave = () => {
    let updatedOptions = step.options;

    // For products type, convert selected products to options
    if ((step.stepType as string) === "products") {
      updatedOptions = products
        .filter((p) => selectedProducts.has(p.id))
        .map((p, index) => ({
          id: p.id,
          stepId: step.id,
          name: p.name,
          description: null,
          price: p.price,
          sortOrder: index,
          active: true,
          createdAt: new Date(),
        }));
      console.log("Saving products:", updatedOptions);
    }

    // For category type, store category info
    if ((step.stepType as string) === "category" && selectedCategory) {
      const category = categories.find((c) => c.id === selectedCategory);
      if (category) {
        updatedOptions = [
          {
            id: category.id,
            stepId: step.id,
            name: category.name,
            description: `Categoría: ${category.name}`,
            price: "0",
            sortOrder: 0,
            active: true,
            createdAt: new Date(),
          },
        ];
        console.log("Saving category:", updatedOptions);
      }
    }

    // For custom type, use manually created options
    if (step.stepType === "custom") {
      updatedOptions = options;
    }

    const updates = {
      stepName,
      includeNoneOption: includeNone,
      options: updatedOptions,
    };
    
    console.log("Updating step with:", updates);
    onUpdate(updates);
    onClose();
  };

  const addOption = () => {
    const newOption: ModifierOption = {
      id: `opt-${Date.now()}`,
      stepId: step.id,
      name: "",
      description: null,
      price: "0",
      sortOrder: options.length,
      active: true,
      createdAt: new Date(),
    };
    setOptions([...options, newOption]);
  };

  const updateOption = (index: number, updates: Partial<ModifierOption>) => {
    const newOptions = [...options];
    newOptions[index] = { ...newOptions[index], ...updates };
    setOptions(newOptions);
  };

  const deleteOption = (index: number) => {
    setOptions(options.filter((_, i) => i !== index));
  };

  return (
    <div className="absolute right-0 top-0 bottom-0 w-96 bg-card border-l border-border overflow-auto shadow-xl z-50">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Editar Paso</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        {/* Step Name */}
        <div className="space-y-2">
          <Label>Nombre del Paso</Label>
          <Input
            value={stepName}
            onChange={(e) => setStepName(e.target.value)}
            placeholder="Ej: Selecciona tu opción"
          />
        </div>

        {/* Step Type (read-only) */}
        <div className="space-y-2">
          <Label>Tipo de Paso</Label>
          <div className="px-3 py-2 bg-muted rounded-md text-sm capitalize">
            {step.stepType}
          </div>
        </div>

        {/* Include None Option */}
        <div className="flex items-center justify-between">
          <Label>Incluir opción "Ninguno"</Label>
          <Switch checked={includeNone} onCheckedChange={setIncludeNone} />
        </div>

        {/* Product Selector (only for products type) */}
        {(step.stepType as string) === "products" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Seleccionar Productos</Label>
              <span className="text-xs text-muted-foreground">
                {selectedProducts.size} seleccionado{selectedProducts.size !== 1 ? 's' : ''}
              </span>
            </div>
            {loading ? (
              <div className="text-sm text-muted-foreground">Cargando productos...</div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-auto border rounded-lg p-3">
                {products.map((product) => (
                  <div 
                    key={product.id} 
                    className="flex items-center gap-2 p-2 hover:bg-muted rounded cursor-pointer"
                    onClick={() => {
                      const newSet = new Set(selectedProducts);
                      if (newSet.has(product.id)) {
                        newSet.delete(product.id);
                      } else {
                        newSet.add(product.id);
                      }
                      setSelectedProducts(newSet);
                    }}
                  >
                    <Checkbox
                      checked={selectedProducts.has(product.id)}
                      onCheckedChange={(checked) => {
                        const newSet = new Set(selectedProducts);
                        if (checked) {
                          newSet.add(product.id);
                        } else {
                          newSet.delete(product.id);
                        }
                        setSelectedProducts(newSet);
                      }}
                    />
                    <label className="text-sm flex-1 cursor-pointer">
                      {product.name} - ${product.price}
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Category Selector (only for category type) */}
        {(step.stepType as string) === "category" && (
          <div className="space-y-3">
            <Label>Seleccionar Categoría</Label>
            {loading ? (
              <div className="text-sm text-muted-foreground">Cargando categorías...</div>
            ) : (
              <>
                <div className="space-y-2 border rounded-lg p-3">
                  {categories.map((category) => (
                    <div 
                      key={category.id} 
                      className="flex items-center gap-2 p-2 hover:bg-muted rounded cursor-pointer"
                      onClick={() => setSelectedCategory(category.id)}
                    >
                      <input
                        type="radio"
                        name="category"
                        checked={selectedCategory === category.id}
                        onChange={() => setSelectedCategory(category.id)}
                        className="cursor-pointer"
                      />
                      <label className="text-sm flex-1 cursor-pointer">
                        {category.name}
                      </label>
                    </div>
                  ))}
                </div>
                
                {/* Preview of products in selected category */}
                {selectedCategory && (
                  <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                    <div className="text-xs font-semibold text-muted-foreground mb-2">
                      Preview de productos (se mostrarán en el POS):
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {products.filter(p => p.categoryId === selectedCategory).length} productos de esta categoría se incluirán automáticamente
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {products
                        .filter(p => p.categoryId === selectedCategory)
                        .slice(0, 10)
                        .map(p => (
                          <span key={p.id} className="text-xs bg-background px-2 py-1 rounded">
                            {p.name}
                          </span>
                        ))}
                      {products.filter(p => p.categoryId === selectedCategory).length > 10 && (
                        <span className="text-xs text-muted-foreground px-2 py-1">
                          +{products.filter(p => p.categoryId === selectedCategory).length - 10} más
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Custom Options (only for custom type) */}
        {step.stepType === "custom" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Opciones</Label>
              <Button size="sm" variant="outline" onClick={addOption}>
                <Plus className="size-4 mr-1" />
                Agregar
              </Button>
            </div>

            <div className="space-y-2 max-h-96 overflow-auto">
              {options.map((option, index) => (
                <Card key={option.id} className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Opción {index + 1}</Label>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteOption(index)}
                    >
                      <Trash className="size-3 text-destructive" />
                    </Button>
                  </div>
                  <Input
                    placeholder="Nombre"
                    value={option.name}
                    onChange={(e) =>
                      updateOption(index, { name: e.target.value })
                    }
                  />
                  <Input
                    placeholder="Precio"
                    type="number"
                    step="0.01"
                    value={option.price}
                    onChange={(e) =>
                      updateOption(index, { price: e.target.value })
                    }
                  />
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2 pt-4 border-t">
          <Button onClick={handleSave} className="w-full">
            Guardar Cambios
          </Button>
          <Button
            variant="destructive"
            onClick={onDelete}
            className="w-full"
          >
            <Trash className="size-4 mr-2" />
            Eliminar Paso
          </Button>
        </div>
      </div>
    </div>
  );
}
