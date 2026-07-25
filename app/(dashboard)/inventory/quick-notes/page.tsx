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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash,
  ChatText,
  CheckCircle,
  XCircle,
  DotsSixVertical,
} from "@phosphor-icons/react";
import { Switch } from "@/components/ui/switch";
import type { QuickNote, Product } from "@/lib/types";

function SortableQuickNoteItem({
  note,
  productCount,
  onEdit,
  onDelete,
}: {
  note: QuickNote;
  productCount: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: note.id });

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
      <span className="flex-1 font-medium">{note.label}</span>
      <span className="text-xs text-muted-foreground">
        {productCount > 0 ? `${productCount} producto(s)` : "Todos los productos"}
      </span>
      {!note.active && (
        <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
          Inactiva
        </span>
      )}
      <Button variant="outline" size="sm" onClick={onEdit} className="gap-2">
        <Pencil className="size-4" />
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onDelete}
        className="gap-2 text-destructive hover:text-destructive"
      >
        <Trash className="size-4" />
      </Button>
    </div>
  );
}

export default function QuickNotesPage() {
  const [quickNotes, setQuickNotes] = useState<QuickNote[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<QuickNote | null>(null);

  const [formData, setFormData] = useState({
    label: "",
    productIds: [] as string[],
    active: true,
  });

  const [orderedNotes, setOrderedNotes] = useState<QuickNote[]>([]);
  const [savingOrder, setSavingOrder] = useState(false);

  useEffect(() => {
    fetchQuickNotes();
    fetchProducts();
  }, []);

  async function fetchQuickNotes() {
    try {
      const res = await fetch("/api/quick-notes");
      if (res.ok) {
        const data = await res.json();
        setQuickNotes(data);
        setOrderedNotes(data);
      }
    } catch (error) {
      toast.error("Error cargando notas rápidas");
    } finally {
      setLoading(false);
    }
  }

  async function fetchProducts() {
    try {
      const res = await fetch("/api/products");
      if (res.ok) {
        const data = await res.json();
        setProducts(data);
      }
    } catch (error) {
      console.error("Error cargando productos:", error);
    }
  }

  function parseProductIds(note: QuickNote): string[] {
    if (!note.productIds) return [];
    try {
      const parsed = JSON.parse(note.productIds);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      const url = editingNote ? `/api/quick-notes/${editingNote.id}` : "/api/quick-notes";
      const method = editingNote ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) throw new Error();

      toast.success(editingNote ? "Nota rápida actualizada" : "Nota rápida creada");
      setDialogOpen(false);
      resetForm();
      fetchQuickNotes();
    } catch (error) {
      toast.error("Error guardando nota rápida");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar esta nota rápida?")) return;

    try {
      const res = await fetch(`/api/quick-notes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();

      toast.success("Nota rápida eliminada");
      fetchQuickNotes();
    } catch (error) {
      toast.error("Error eliminando nota rápida");
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
      setOrderedNotes((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }

  async function handleSaveOrder() {
    setSavingOrder(true);
    try {
      const orders = orderedNotes.map((note, idx) => ({
        id: note.id,
        sortOrder: idx,
      }));
      const res = await fetch("/api/quick-notes/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orders }),
      });
      if (!res.ok) throw new Error();
      toast.success("Orden guardado");
      fetchQuickNotes();
    } catch {
      toast.error("Error guardando orden");
    } finally {
      setSavingOrder(false);
    }
  }

  function handleResetOrder() {
    setOrderedNotes(quickNotes);
  }

  function handleEdit(note: QuickNote) {
    setEditingNote(note);
    setFormData({
      label: note.label,
      productIds: parseProductIds(note),
      active: note.active,
    });
    setDialogOpen(true);
  }

  function resetForm() {
    setEditingNote(null);
    setFormData({ label: "", productIds: [], active: true });
  }

  const activeCount = quickNotes.filter((n) => n.active).length;
  const inactiveCount = quickNotes.filter((n) => !n.active).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-2">
          <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground">Cargando notas rápidas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Notas Rápidas</h1>
          <p className="text-muted-foreground mt-1">
            Abreviaciones predefinidas (ej. &quot;Sin cebolla&quot;) que aparecen como
            chips al agregar un comentario en el POS
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm} className="gap-2">
              <Plus className="size-4" />
              Nueva Nota Rápida
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingNote ? "Editar Nota Rápida" : "Nueva Nota Rápida"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="label">Texto (ej. &quot;Sin cebolla&quot;)</Label>
                <Input
                  id="label"
                  value={formData.label}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  maxLength={100}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Productos donde aplica</Label>
                <p className="text-xs text-muted-foreground">
                  Deja todo sin marcar para que aparezca en cualquier producto.
                </p>
                <div className="border rounded-lg p-3 max-h-60 overflow-y-auto space-y-2">
                  {products.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No hay productos disponibles</p>
                  ) : (
                    products.map((product) => (
                      <div key={product.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`qn-product-${product.id}`}
                          checked={formData.productIds.includes(product.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormData({
                                ...formData,
                                productIds: [...formData.productIds, product.id],
                              });
                            } else {
                              setFormData({
                                ...formData,
                                productIds: formData.productIds.filter(
                                  (id) => id !== product.id
                                ),
                              });
                            }
                          }}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        <label
                          htmlFor={`qn-product-${product.id}`}
                          className="text-sm cursor-pointer flex-1"
                        >
                          {product.name}
                        </label>
                      </div>
                    ))
                  )}
                </div>
                {formData.productIds.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {formData.productIds.length} producto(s) seleccionado(s)
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label htmlFor="active" className="cursor-pointer">
                  Activa
                </Label>
                <Switch
                  id="active"
                  checked={formData.active}
                  onCheckedChange={(checked) => setFormData({ ...formData, active: checked })}
                />
              </div>

              <div className="flex gap-2">
                <Button type="submit" className="flex-1">
                  {editingNote ? "Actualizar" : "Crear"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-500/10 p-3">
                <ChatText className="size-5 text-blue-600" weight="duotone" />
              </div>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{quickNotes.length}</div>
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
            <div className="text-2xl font-bold">{activeCount}</div>
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
            <div className="text-2xl font-bold">{inactiveCount}</div>
          </CardContent>
        </Card>
      </div>

      <div className="border-t" />

      {/* Reorder Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Orden de notas rápidas</h2>
            <p className="text-sm text-muted-foreground">
              Arrastra para reordenar. Así aparecen los chips en el POS.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetOrder}
              disabled={savingOrder}
            >
              Restaurar
            </Button>
            <Button size="sm" onClick={handleSaveOrder} disabled={savingOrder}>
              {savingOrder ? "Guardando..." : "Guardar orden"}
            </Button>
          </div>
        </div>

        {quickNotes.length === 0 ? (
          <Card className="border-none shadow-sm">
            <CardContent className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <ChatText className="size-16 mb-4 opacity-20" weight="duotone" />
              <p className="text-lg font-medium">No hay notas rápidas creadas</p>
              <p className="text-sm">Crea tu primera abreviación para usarla en el POS</p>
            </CardContent>
          </Card>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={orderedNotes.map((n) => n.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="rounded-lg border bg-card">
                {orderedNotes.map((note) => (
                  <SortableQuickNoteItem
                    key={note.id}
                    note={note}
                    productCount={parseProductIds(note).length}
                    onEdit={() => handleEdit(note)}
                    onDelete={() => handleDelete(note.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}
