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
  ChefHat,
  Warning,
  X,
} from "@phosphor-icons/react";
import { toast } from "sonner";

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  currentStock: string;
  active: boolean;
}

interface RecipeIngredient {
  id?: string;
  ingredientId: string;
  quantity: string;
  ingredientName?: string;
  ingredientUnit?: string;
}

interface Recipe {
  id: string;
  name: string;
  description: string | null;
  unit: string;
  currentStock: string;
  minStock: string;
  active: boolean;
  ingredients: RecipeIngredient[];
  createdAt: string;
  updatedAt: string;
}

const UNITS = ["porción", "litro", "kilogramo", "pieza", "taza", "plato"];

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState("porción");
  const [currentStock, setCurrentStock] = useState("");
  const [minStock, setMinStock] = useState("");
  const [recipeIngredients, setRecipeIngredients] = useState<RecipeIngredient[]>([]);

  // New ingredient form
  const [selectedIngredientId, setSelectedIngredientId] = useState("");
  const [ingredientQuantity, setIngredientQuantity] = useState("");

  useEffect(() => {
    fetchRecipes();
    fetchIngredients();
  }, []);

  async function fetchRecipes() {
    try {
      const res = await fetch("/api/inventory/recipes");
      if (res.ok) {
        setRecipes(await res.json());
      }
    } catch (error) {
      toast.error("Error cargando recetas");
    } finally {
      setLoading(false);
    }
  }

  async function fetchIngredients() {
    try {
      const res = await fetch("/api/ingredients");
      if (res.ok) {
        const data = await res.json();
        setIngredients(data.filter((i: Ingredient) => i.active));
      }
    } catch (error) {
      console.error("Error cargando ingredientes");
    }
  }

  function openCreateDialog() {
    setEditingRecipe(null);
    setName("");
    setDescription("");
    setUnit("porción");
    setCurrentStock("0");
    setMinStock("0");
    setRecipeIngredients([]);
    setSelectedIngredientId("");
    setIngredientQuantity("");
    setDialogOpen(true);
  }

  function openEditDialog(recipe: Recipe) {
    setEditingRecipe(recipe);
    setName(recipe.name);
    setDescription(recipe.description || "");
    setUnit(recipe.unit);
    setCurrentStock(recipe.currentStock);
    setMinStock(recipe.minStock);
    setRecipeIngredients(recipe.ingredients || []);
    setSelectedIngredientId("");
    setIngredientQuantity("");
    setDialogOpen(true);
  }

  function addIngredient() {
    if (!selectedIngredientId || !ingredientQuantity) {
      toast.error("Selecciona un ingrediente y cantidad");
      return;
    }

    const ingredient = ingredients.find((i) => i.id === selectedIngredientId);
    if (!ingredient) return;

    // Check if already added
    if (recipeIngredients.some((ri) => ri.ingredientId === selectedIngredientId)) {
      toast.error("Este ingrediente ya está agregado");
      return;
    }

    setRecipeIngredients([
      ...recipeIngredients,
      {
        ingredientId: selectedIngredientId,
        quantity: ingredientQuantity,
        ingredientName: ingredient.name,
        ingredientUnit: ingredient.unit,
      },
    ]);

    setSelectedIngredientId("");
    setIngredientQuantity("");
  }

  function removeIngredient(ingredientId: string) {
    setRecipeIngredients(recipeIngredients.filter((ri) => ri.ingredientId !== ingredientId));
  }

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error("El nombre es requerido");
      return;
    }

    if (recipeIngredients.length === 0) {
      toast.error("Agrega al menos un ingrediente");
      return;
    }

    setSubmitting(true);
    try {
      const url = editingRecipe
        ? `/api/inventory/recipes/${editingRecipe.id}`
        : "/api/inventory/recipes";

      const method = editingRecipe ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || null,
          unit,
          currentStock,
          minStock,
          ingredients: recipeIngredients.map((ri) => ({
            ingredientId: ri.ingredientId,
            quantity: ri.quantity,
          })),
        }),
      });

      if (res.ok) {
        toast.success(editingRecipe ? "Receta actualizada" : "Receta creada");
        setDialogOpen(false);
        fetchRecipes();
      } else {
        toast.error("Error al guardar receta");
      }
    } catch (error) {
      toast.error("Error al guardar receta");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Estás seguro de eliminar esta receta?")) return;

    try {
      const res = await fetch(`/api/inventory/recipes/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Receta eliminada");
        fetchRecipes();
      } else {
        toast.error("Error al eliminar receta");
      }
    } catch (error) {
      toast.error("Error al eliminar receta");
    }
  }

  const activeRecipes = recipes.filter((r) => r.active);
  const lowStockRecipes = activeRecipes.filter(
    (r) => parseFloat(r.currentStock) <= parseFloat(r.minStock)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-2">
          <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground">Cargando recetas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Recetas</h1>
          <p className="text-muted-foreground mt-1">
            Recetas elaboradas con ingredientes
          </p>
        </div>
        <Button onClick={openCreateDialog} className="gap-2">
          <Plus className="size-4" />
          Nueva Receta
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-500/10 p-3">
                <ChefHat className="size-5 text-blue-600" weight="duotone" />
              </div>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Recetas
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeRecipes.length}</div>
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
            <div className="text-2xl font-bold">{lowStockRecipes.length}</div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-green-500/10 p-3">
                <ChefHat className="size-5 text-green-600" weight="duotone" />
              </div>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Ingredientes Únicos
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{ingredients.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Divider */}
      <div className="border-t" />

      {/* Recipes Grid */}
      {activeRecipes.length === 0 ? (
        <Card className="border-none shadow-sm">
          <CardContent className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <ChefHat className="size-16 mb-4 opacity-20" weight="duotone" />
            <p className="text-lg font-medium">No hay recetas creadas</p>
            <p className="text-sm">Crea tu primera receta para comenzar</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {activeRecipes.map((recipe) => {
            const isLowStock = parseFloat(recipe.currentStock) <= parseFloat(recipe.minStock);

            return (
              <Card
                key={recipe.id}
                className={`group border-none shadow-sm hover:shadow-md transition-all ${
                  isLowStock ? "ring-2 ring-orange-500/20" : ""
                }`}
              >
                <CardContent className="p-6">
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-lg truncate">{recipe.name}</h3>
                        {recipe.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                            {recipe.description}
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

                    {/* Ingredients */}
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">Ingredientes:</p>
                      <div className="space-y-1">
                        {recipe.ingredients.slice(0, 3).map((ing) => (
                          <div key={ing.id} className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground truncate">{ing.ingredientName}</span>
                            <span className="font-medium ml-2">
                              {parseFloat(ing.quantity).toFixed(2)} {ing.ingredientUnit}
                            </span>
                          </div>
                        ))}
                        {recipe.ingredients.length > 3 && (
                          <p className="text-xs text-muted-foreground">
                            +{recipe.ingredients.length - 3} más...
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Stock Info */}
                    <div className="space-y-2 pt-2 border-t">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Stock actual:</span>
                        <span className="font-semibold">
                          {parseFloat(recipe.currentStock).toFixed(2)} {recipe.unit}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Stock mínimo:</span>
                        <span>{parseFloat(recipe.minStock).toFixed(2)} {recipe.unit}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-2 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditDialog(recipe)}
                        className="flex-1 gap-2"
                      >
                        <Pencil className="size-4" />
                        Editar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(recipe.id)}
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingRecipe ? "Editar Receta" : "Nueva Receta"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Caldo de Camarón"
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

            <div className="grid grid-cols-3 gap-4">
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

            {/* Ingredients Section */}
            <div className="space-y-3 pt-4 border-t">
              <Label>Ingredientes *</Label>

              {/* Add Ingredient Form */}
              <div className="flex gap-2">
                <Select value={selectedIngredientId} onValueChange={setSelectedIngredientId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Selecciona ingrediente" />
                  </SelectTrigger>
                  <SelectContent>
                    {ingredients
                      .filter((ing) => !recipeIngredients.some((ri) => ri.ingredientId === ing.id))
                      .map((ing) => (
                        <SelectItem key={ing.id} value={ing.id}>
                          {ing.name} ({ing.unit})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>

                <Input
                  type="number"
                  step="0.01"
                  value={ingredientQuantity}
                  onChange={(e) => setIngredientQuantity(e.target.value)}
                  placeholder="Cantidad"
                  className="w-32"
                />

                <Button type="button" onClick={addIngredient} size="sm">
                  <Plus className="size-4" />
                </Button>
              </div>

              {/* Ingredients List */}
              {recipeIngredients.length > 0 && (
                <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
                  {recipeIngredients.map((ing) => (
                    <div
                      key={ing.ingredientId}
                      className="flex items-center justify-between p-2 bg-background rounded"
                    >
                      <div className="flex-1">
                        <span className="font-medium">{ing.ingredientName}</span>
                        <span className="text-sm text-muted-foreground ml-2">
                          {parseFloat(ing.quantity).toFixed(2)} {ing.ingredientUnit}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeIngredient(ing.ingredientId)}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
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
