"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash, Pencil, ArrowUp, ArrowDown } from "@phosphor-icons/react";
import type { Category, CategoryFlow, ModifierStep, ModifierOption } from "@/lib/types";

export default function CategoryFlowPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState<string>("");
  const [category, setCategory] = useState<Category | null>(null);
  const [flow, setFlow] = useState<CategoryFlow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [stepDialogOpen, setStepDialogOpen] = useState(false);
  const [editingStep, setEditingStep] = useState<ModifierStep | null>(null);
  const [editingStepIndex, setEditingStepIndex] = useState<number>(-1);
  
  const [stepForm, setStepForm] = useState({
    stepType: "custom" as "frosting" | "topping" | "extra" | "custom" | "products" | "category",
    stepName: "",
    isRequired: false,
    allowMultiple: false,
    includeNoneOption: true,
    options: [] as Array<{ name: string; price: string; sortOrder: number }>,
  });

  useEffect(() => {
    params.then((p) => {
      setCategoryId(p.id);
      fetchData(p.id);
    });
  }, []);

  async function fetchData(id: string) {
    try {
      const [categoryRes, flowRes] = await Promise.all([
        fetch(`/api/categories/${id}`),
        fetch(`/api/categories/${id}/flow`),
      ]);

      if (categoryRes.ok) {
        setCategory(await categoryRes.json());
      }
      if (flowRes.ok) {
        setFlow(await flowRes.json());
      }
    } catch (error) {
      toast.error("Error cargando datos");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveFlow() {
    if (!flow) return;
    
    setSaving(true);
    try {
      const res = await fetch(`/api/categories/${categoryId}/flow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(flow),
      });

      if (!res.ok) throw new Error();
      
      toast.success("Flujo guardado correctamente");
      fetchData(categoryId);
    } catch (error) {
      toast.error("Error guardando flujo");
    } finally {
      setSaving(false);
    }
  }

  function handleToggleDefaultFlow() {
    if (!flow) return;
    
    setFlow({
      ...flow,
      useDefaultFlow: !flow.useDefaultFlow,
      steps: flow.useDefaultFlow ? [] : [
        {
          id: "",
          categoryId,
          stepType: "frosting",
          stepName: "Escarchado",
          sortOrder: 1,
          isRequired: false,
          allowMultiple: false,
          includeNoneOption: true,
          active: true,
          createdAt: new Date(),
          options: [],
        },
        {
          id: "",
          categoryId,
          stepType: "topping",
          stepName: "Topping Seco",
          sortOrder: 2,
          isRequired: false,
          allowMultiple: false,
          includeNoneOption: true,
          active: true,
          createdAt: new Date(),
          options: [],
        },
        {
          id: "",
          categoryId,
          stepType: "extra",
          stepName: "Extras",
          sortOrder: 3,
          isRequired: false,
          allowMultiple: true,
          includeNoneOption: false,
          active: true,
          createdAt: new Date(),
          options: [],
        },
      ],
    });
  }

  function handleAddStep() {
    setEditingStep(null);
    setEditingStepIndex(-1);
    setStepForm({
      stepType: "custom",
      stepName: "",
      isRequired: false,
      allowMultiple: false,
      includeNoneOption: true,
      options: [],
    });
    setStepDialogOpen(true);
  }

  function handleEditStep(step: ModifierStep, index: number) {
    setEditingStep(step);
    setEditingStepIndex(index);
    setStepForm({
      stepType: step.stepType,
      stepName: step.stepName,
      isRequired: step.isRequired,
      allowMultiple: step.allowMultiple,
      includeNoneOption: step.includeNoneOption,
      options: step.options?.map((o, idx) => ({
        name: o.name,
        price: o.price,
        sortOrder: idx,
      })) || [],
    });
    setStepDialogOpen(true);
  }

  function handleSaveStep() {
    if (!flow) return;
    
    const newStep: ModifierStep = {
      id: editingStep?.id || "",
      categoryId,
      stepType: stepForm.stepType,
      stepName: stepForm.stepName,
      sortOrder: editingStepIndex >= 0 ? editingStepIndex + 1 : flow.steps.length + 1,
      isRequired: stepForm.isRequired,
      allowMultiple: stepForm.allowMultiple,
      includeNoneOption: stepForm.includeNoneOption,
      active: true,
      createdAt: new Date(),
      options: stepForm.options.length > 0 ? stepForm.options.map((o, idx) => ({
        id: "",
        stepId: "",
        name: o.name,
        description: null,
        price: o.price,
        sortOrder: idx,
        active: true,
        createdAt: new Date(),
      })) : [],
    };

    if (editingStepIndex >= 0) {
      const updatedSteps = [...flow.steps];
      updatedSteps[editingStepIndex] = newStep;
      setFlow({ ...flow, steps: updatedSteps });
    } else {
      setFlow({ ...flow, steps: [...flow.steps, newStep] });
    }

    setStepDialogOpen(false);
    toast.success(editingStepIndex >= 0 ? "Paso actualizado" : "Paso agregado");
  }

  function handleDeleteStep(index: number) {
    if (!flow) return;
    if (!confirm("¿Eliminar este paso del flujo?")) return;
    
    const updatedSteps = flow.steps.filter((_, i) => i !== index);
    setFlow({ ...flow, steps: updatedSteps });
    toast.success("Paso eliminado");
  }

  function handleMoveStep(index: number, direction: "up" | "down") {
    if (!flow) return;
    
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= flow.steps.length) return;
    
    const updatedSteps = [...flow.steps];
    [updatedSteps[index], updatedSteps[newIndex]] = [updatedSteps[newIndex], updatedSteps[index]];
    
    // Update sortOrder
    updatedSteps.forEach((step, idx) => {
      step.sortOrder = idx + 1;
    });
    
    setFlow({ ...flow, steps: updatedSteps });
  }

  function handleAddOption() {
    setStepForm((prev) => ({
      ...prev,
      options: [
        ...prev.options,
        { name: "", price: "0", sortOrder: prev.options.length },
      ],
    }));
  }

  function handleUpdateOption(index: number, field: "name" | "price", value: string) {
    setStepForm((prev) => {
      const updatedOptions = [...prev.options];
      updatedOptions[index] = { ...updatedOptions[index], [field]: value };
      return { ...prev, options: updatedOptions };
    });
  }

  function handleDeleteOption(index: number) {
    setStepForm((prev) => ({
      ...prev,
      options: prev.options.filter((_, i) => i !== index),
    }));
  }

  if (loading) {
    return <div className="p-8">Cargando...</div>;
  }

  if (!category || !flow) {
    return <div className="p-8">Categoría no encontrada</div>;
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => router.push("/inventory/categories")}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 size-4" />
          Volver a Categorías
        </Button>
        
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              Flujo de Modificadores
              <div
                className="w-8 h-8 rounded border"
                style={{ backgroundColor: category.color || "#6B7280" }}
              />
            </h1>
            <p className="text-muted-foreground">{category.name}</p>
          </div>
          
          <Button onClick={handleSaveFlow} disabled={saving}>
            {saving ? "Guardando..." : "Guardar Cambios"}
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Toggle Default/Custom Flow */}
        <div className="rounded-lg border p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Tipo de Flujo</h2>
              <p className="text-sm text-muted-foreground">
                {flow.useDefaultFlow
                  ? "Flujo simplificado - Los productos se agregan directamente al carrito"
                  : "Usando flujo personalizado"}
              </p>
            </div>
            <Button variant="outline" onClick={handleToggleDefaultFlow}>
              {flow.useDefaultFlow ? "Personalizar Flujo" : "Usar Flujo Predeterminado"}
            </Button>
          </div>
        </div>

        {/* Steps List */}
        {!flow.useDefaultFlow && (
          <div className="rounded-lg border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Pasos del Flujo</h2>
              <Button onClick={handleAddStep}>
                <Plus className="mr-2 size-4" />
                Agregar Paso
              </Button>
            </div>

            {flow.steps.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No hay pasos configurados. Agrega el primer paso.
              </div>
            ) : (
              <div className="space-y-3">
                {flow.steps.map((step, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-4 rounded-lg border bg-card"
                  >
                    <div className="flex flex-col gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleMoveStep(index, "up")}
                        disabled={index === 0}
                        className="h-6 w-6 p-0"
                      >
                        <ArrowUp className="size-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleMoveStep(index, "down")}
                        disabled={index === flow.steps.length - 1}
                        className="h-6 w-6 p-0"
                      >
                        <ArrowDown className="size-3" />
                      </Button>
                    </div>

                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{step.stepName}</span>
                        <span className="text-xs px-2 py-1 rounded bg-muted">
                          {step.stepType}
                        </span>
                        {step.isRequired && (
                          <span className="text-xs px-2 py-1 rounded bg-primary/10 text-primary">
                            Requerido
                          </span>
                        )}
                        {step.allowMultiple && (
                          <span className="text-xs px-2 py-1 rounded bg-blue-500/10 text-blue-600">
                            Múltiple
                          </span>
                        )}
                      </div>
                      {step.options && step.options.length > 0 && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {step.options.length} opción(es)
                        </p>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditStep(step, index)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteStep(index)}
                      >
                        <Trash className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Preview */}
        {!flow.useDefaultFlow && flow.steps.length > 0 && (
          <div className="rounded-lg border p-6 bg-muted/30">
            <h2 className="text-lg font-semibold mb-4">Vista Previa del Flujo</h2>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Producto</span>
              {flow.steps.map((step, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="text-muted-foreground">→</span>
                  <span className="text-sm font-medium">{step.stepName}</span>
                </div>
              ))}
              <span className="text-muted-foreground">→</span>
              <span className="text-sm text-muted-foreground">Carrito</span>
            </div>
          </div>
        )}
      </div>

      {/* Step Dialog */}
      <Dialog open={stepDialogOpen} onOpenChange={setStepDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingStep ? "Editar Paso" : "Nuevo Paso"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Tipo de Paso</Label>
              <Select
                value={stepForm.stepType}
                onValueChange={(value: any) =>
                  setStepForm({ ...stepForm, stepType: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="frosting">Escarchado (usar existentes)</SelectItem>
                  <SelectItem value="topping">Topping Seco (usar existentes)</SelectItem>
                  <SelectItem value="extra">Extras (usar existentes)</SelectItem>
                  <SelectItem value="custom">Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Nombre del Paso</Label>
              <Input
                value={stepForm.stepName}
                onChange={(e) =>
                  setStepForm({ ...stepForm, stepName: e.target.value })
                }
                placeholder="ej: Tipo de Cerveza, Salsa, etc."
              />
            </div>

            <div className="flex flex-col gap-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={stepForm.isRequired}
                  onChange={(e) =>
                    setStepForm({ ...stepForm, isRequired: e.target.checked })
                  }
                  className="rounded"
                />
                <span className="text-sm">Es requerido</span>
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={stepForm.allowMultiple}
                  onChange={(e) =>
                    setStepForm({ ...stepForm, allowMultiple: e.target.checked })
                  }
                  className="rounded"
                />
                <span className="text-sm">Permite selección múltiple</span>
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={stepForm.includeNoneOption}
                  onChange={(e) =>
                    setStepForm({ ...stepForm, includeNoneOption: e.target.checked })
                  }
                  className="rounded"
                />
                <span className="text-sm">Incluir opción "Sin {stepForm.stepName || "selección"}"</span>
              </label>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Opciones Personalizadas</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddOption}
                >
                  <Plus className="mr-2 size-4" />
                  Agregar Opción
                </Button>
              </div>

              {stepForm.options.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Agrega al menos una opción
                </p>
              ) : (
                <div className="space-y-2">
                  {stepForm.options.map((option, index) => (
                    <div key={index} className="flex gap-2 items-start">
                      <Input
                        placeholder="Nombre"
                        value={option.name}
                        onChange={(e) =>
                          handleUpdateOption(index, "name", e.target.value)
                        }
                        className="flex-1"
                      />
                      <Input
                        placeholder="Precio"
                        type="number"
                        step="0.01"
                        value={option.price}
                        onChange={(e) =>
                          handleUpdateOption(index, "price", e.target.value)
                        }
                        className="w-24"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteOption(index)}
                      >
                        <Trash className="size-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setStepDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSaveStep}
              disabled={!stepForm.stepName || stepForm.options.length === 0}
            >
              {editingStep ? "Actualizar" : "Agregar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
