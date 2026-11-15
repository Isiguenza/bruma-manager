"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { CaretRight, ChatText, DotsSixVertical, MagnifyingGlass, Plus, Spinner, Trash, X } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/page-header";
import { CatalogPicker, expandSelection } from "@/components/catalog-picker";
import { parseVariants } from "@/components/product-picker-utils";
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
import { cn } from "@/lib/utils";
import type { Category, Product, QuickNote } from "@/lib/types";

interface Form {
  label: string;
  /** Vacío = aplica a todos los platillos (así lo interpreta el POS). */
  productIds: string[];
  scoped: boolean;
  active: boolean;
}

function parseIds(note: QuickNote): string[] {
  if (!note.productIds) return [];
  try {
    const parsed = JSON.parse(note.productIds);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Misma regla que `QuickNote.applies` del POS (Models/QuickNote.swift). */
function appliesTo(note: QuickNote, productId: string, variant: string | null) {
  const ids = parseIds(note);
  if (ids.length === 0) return true;
  return ids.includes(productId) || (!!variant && ids.includes(`${productId}::${variant}`));
}

function scopeLabel(ids: string[], products: Product[]) {
  if (ids.length === 0) return "Todos los platillos";
  const names = ids.map((ref) => {
    const [pid, v] = ref.split("::");
    const name = products.find((p) => p.id === pid)?.name ?? "Platillo";
    return v ? `${name} ${v}` : name;
  });
  return names.length <= 2 ? names.join(" y ") : `${names.slice(0, 2).join(", ")} y ${names.length - 2} más`;
}

function NoteRow({
  note,
  scope,
  selected,
  onOpen,
  onToggle,
}: {
  note: QuickNote;
  scope: string;
  selected: boolean;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: note.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group flex items-center gap-2 border-b bg-card px-2 py-2 last:border-b-0",
        isDragging && "relative z-10 rounded-xl shadow-lg ring-1 ring-border",
        selected && "bg-primary/5",
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none rounded-md p-1.5 text-muted-foreground/50 hover:bg-muted hover:text-foreground active:cursor-grabbing"
        aria-label={`Mover ${note.label}`}
      >
        <DotsSixVertical className="size-4" weight="bold" />
      </button>
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span
          className={cn(
            "max-w-[55%] shrink-0 truncate rounded-full border px-3 py-1 text-sm font-medium",
            note.active ? "bg-background" : "border-dashed text-muted-foreground line-through",
          )}
        >
          {note.label}
        </span>
        <span className="min-w-0 truncate text-xs text-muted-foreground">{scope}</span>
      </button>
      <Switch size="sm" checked={note.active} onCheckedChange={onToggle} aria-label={note.active ? "Ocultar en el POS" : "Mostrar en el POS"} />
      <CaretRight className={cn("size-4 shrink-0 text-muted-foreground/50 transition-transform", selected && "translate-x-0.5 text-primary")} />
    </div>
  );
}

export default function QuickNotesPage() {
  const [notes, setNotes] = useState<QuickNote[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [quickAdd, setQuickAdd] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Form>({ label: "", productIds: [], scoped: false, active: true });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    Promise.all([fetch("/api/quick-notes"), fetch("/api/products?active=true"), fetch("/api/categories")])
      .then(async ([n, p, c]) => {
        if (n.ok) setNotes(await n.json());
        if (p.ok) setProducts(await p.json());
        if (c.ok) setCategories(await c.json());
      })
      .catch(() => toast.error("Error cargando notas rápidas"))
      .finally(() => setLoading(false));
  }, []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  /** Reordenar guarda solo (antes había que tocar "Guardar orden"). */
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const previous = notes;
    const next = arrayMove(notes, notes.findIndex((n) => n.id === active.id), notes.findIndex((n) => n.id === over.id));
    setNotes(next);
    const res = await fetch("/api/quick-notes/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orders: next.map((n, i) => ({ id: n.id, sortOrder: i })) }),
    }).catch(() => null);
    if (!res?.ok) {
      setNotes(previous);
      toast.error("No se pudo guardar el orden");
    }
  }

  async function create(label: string, productIds: string[] = [], active = true) {
    const res = await fetch("/api/quick-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, productIds, active }),
    });
    if (!res.ok) throw new Error();
    const created: QuickNote = await res.json();
    // Al final de la lista, como la crea el API.
    setNotes((prev) => [...prev, created]);
    return created;
  }

  async function submitQuickAdd(e: React.FormEvent) {
    e.preventDefault();
    const label = quickAdd.trim();
    if (!label) return;
    if (notes.some((n) => n.label.toLowerCase() === label.toLowerCase())) return toast.error(`“${label}” ya existe`);
    try {
      await create(label);
      setQuickAdd("");
      toast.success(`“${label}” agregada para todos los platillos`);
    } catch {
      toast.error("No se pudo crear la nota");
    }
  }

  function openEdit(note: QuickNote) {
    const ids = parseIds(note);
    setForm({ label: note.label, productIds: ids, scoped: ids.length > 0, active: note.active });
    setEditing(note.id);
  }

  function openNew() {
    setForm({ label: "", productIds: [], scoped: false, active: true });
    setEditing("new");
  }

  async function save() {
    const label = form.label.trim();
    if (!label) return toast.error("Escribe el texto de la nota");
    if (form.scoped && form.productIds.length === 0) return toast.error("Elige al menos un platillo, o déjala para todos");
    const productIds = form.scoped ? form.productIds : [];
    setSaving(true);
    try {
      if (editing === "new") {
        await create(label, productIds, form.active);
      } else {
        const res = await fetch(`/api/quick-notes/${editing}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label, productIds, active: form.active }),
        });
        if (!res.ok) throw new Error();
        const updated: QuickNote = await res.json();
        setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      }
      toast.success(editing === "new" ? "Nota creada" : "Nota guardada");
      setEditing(null);
    } catch {
      toast.error("No se pudo guardar la nota");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(note: QuickNote) {
    setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, active: !note.active } : n)));
    if (editing === note.id) setForm((f) => ({ ...f, active: !note.active }));
    const res = await fetch(`/api/quick-notes/${note.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !note.active }),
    }).catch(() => null);
    if (!res?.ok) {
      setNotes((prev) => prev.map((n) => (n.id === note.id ? note : n)));
      toast.error("No se pudo cambiar");
    }
  }

  async function remove() {
    if (!editing || editing === "new") return;
    const res = await fetch(`/api/quick-notes/${editing}`, { method: "DELETE" });
    if (!res.ok) return toast.error("No se pudo eliminar");
    setNotes((prev) => prev.filter((n) => n.id !== editing));
    setEditing(null);
    toast.success("Nota eliminada");
  }

  const q = search.trim().toLowerCase();
  const visible = q ? notes.filter((n) => n.label.toLowerCase().includes(q)) : notes;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notas rápidas"
        description="Chips que el mesero toca al agregar un comentario en el POS (ej. “Sin cebolla”)."
        actions={
          <Button onClick={openNew} variant="outline" className="gap-2">
            <Plus className="size-4" weight="bold" />
            Nota con platillos
          </Button>
        }
      />

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Spinner className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className="min-w-0 space-y-3">
            <form onSubmit={submitQuickAdd} className="flex gap-2">
              <div className="relative flex-1">
                <ChatText className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={quickAdd} onChange={(e) => setQuickAdd(e.target.value)} placeholder="Escribe una nota nueva y presiona Enter…" maxLength={100} className="h-11 pl-9 text-base" />
              </div>
              <Button type="submit" className="h-11 gap-2" disabled={!quickAdd.trim()}>
                <Plus className="size-4" weight="bold" /> Agregar
              </Button>
            </form>

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {notes.length} nota{notes.length === 1 ? "" : "s"} · {notes.filter((n) => n.active).length} visibles · arrastra para cambiar el orden en el POS
              </p>
              {notes.length > 8 && (
                <div className="relative w-44">
                  <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar…"
                    className="h-8 w-full rounded-full border bg-background pr-2 pl-8 text-xs outline-none focus:ring-2 focus:ring-ring/30"
                  />
                </div>
              )}
            </div>

            {notes.length === 0 ? (
              <div className="rounded-2xl border border-dashed px-6 py-14 text-center">
                <ChatText className="mx-auto size-10 text-muted-foreground/40" weight="duotone" />
                <p className="mt-3 font-semibold">Todavía no hay notas rápidas</p>
                <p className="mt-1 text-sm text-muted-foreground">Escribe la primera arriba: “Sin cebolla”, “Bien cocido”, “Para llevar”…</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={visible.map((n) => n.id)} strategy={verticalListSortingStrategy}>
                    {visible.map((note) => (
                      <NoteRow
                        key={note.id}
                        note={note}
                        scope={scopeLabel(parseIds(note), products)}
                        selected={editing === note.id}
                        onOpen={() => openEdit(note)}
                        onToggle={() => toggle(note)}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              </div>
            )}
          </div>

          <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            {editing ? (
              <section className="space-y-5 rounded-2xl border bg-card p-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">{editing === "new" ? "Nueva nota" : "Editar nota"}</h2>
                  <button type="button" onClick={() => setEditing(null)} className="text-muted-foreground hover:text-foreground" aria-label="Cerrar">
                    <X className="size-4" />
                  </button>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="qn-label">Texto</Label>
                  <Input id="qn-label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} maxLength={100} placeholder="Ej. Sin cebolla" autoFocus={editing === "new"} />
                </div>
                <div className="space-y-2">
                  <Label>¿En qué platillos sale?</Label>
                  <div className="inline-flex rounded-lg bg-muted p-1">
                    {[
                      { id: false, label: "Todos" },
                      { id: true, label: "Solo algunos" },
                    ].map((o) => (
                      <button
                        key={String(o.id)}
                        type="button"
                        onClick={() => setForm({ ...form, scoped: o.id })}
                        className={cn("rounded-md px-3 py-1.5 text-sm font-medium transition-all", form.scoped === o.id ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                  {form.scoped && (
                    <CatalogPicker
                      products={products}
                      categories={categories}
                      value={{ categoryIds: [], refs: form.productIds }}
                      onChange={(sel) => setForm({ ...form, productIds: expandSelection(sel, products) })}
                      maxHeight={300}
                    />
                  )}
                </div>
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3">
                  <span>
                    <span className="block text-sm font-medium">Visible en el POS</span>
                    <span className="block text-xs text-muted-foreground">Apagada, no sale como chip</span>
                  </span>
                  <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
                </label>
                <div className="flex items-center gap-2">
                  {editing !== "new" && (
                    <Button variant="ghost" size="icon" onClick={() => setConfirmDelete(true)} className="text-destructive hover:text-destructive" aria-label="Eliminar">
                      <Trash className="size-4" />
                    </Button>
                  )}
                  <Button variant="outline" className="ml-auto" onClick={() => setEditing(null)} disabled={saving}>
                    Cancelar
                  </Button>
                  <Button onClick={save} disabled={saving}>
                    {saving ? "Guardando…" : editing === "new" ? "Crear" : "Guardar"}
                  </Button>
                </div>
              </section>
            ) : (
              <PosPreview notes={notes} products={products} />
            )}
          </div>
        </div>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar “{form.label}”?</AlertDialogTitle>
            <AlertDialogDescription>Deja de salir en el POS. Los comentarios que ya se mandaron a cocina no cambian.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-destructive text-white hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Elige un platillo y ve qué chips le salen al mesero, en el orden del POS. */
function PosPreview({ notes, products }: { notes: QuickNote[]; products: Product[] }) {
  const [search, setSearch] = useState("");
  const [focused, setFocused] = useState(false);
  const [pick, setPick] = useState<{ productId: string; variant: string | null; label: string } | null>(null);
  const [tapped, setTapped] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  const options = useMemo(
    () =>
      products.flatMap((p) => {
        const vs = p.hasVariants ? parseVariants(p.variants) : [];
        return vs.length === 0
          ? [{ productId: p.id, variant: null as string | null, label: p.name }]
          : vs.map((v) => ({ productId: p.id, variant: v.name, label: `${p.name} - ${v.name}` }));
      }),
    [products],
  );
  const q = search.trim().toLowerCase();
  const results = q ? options.filter((o) => o.label.toLowerCase().includes(q)).slice(0, 8) : [];
  const chips = pick ? notes.filter((n) => n.active && appliesTo(n, pick.productId, pick.variant)) : notes.filter((n) => n.active && parseIds(n).length === 0);

  return (
    <section className="space-y-4 rounded-2xl border bg-card p-5">
      <div>
        <h2 className="font-semibold">Pruébalo como en el POS</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Elige un platillo y mira qué notas le salen al mesero.</p>
      </div>
      <div className="relative">
        <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          placeholder={pick ? pick.label : "Buscar platillo…"}
          className="h-10 w-full rounded-lg bg-muted/50 pr-3 pl-9 text-sm outline-none placeholder:text-muted-foreground focus:bg-muted focus:ring-2 focus:ring-ring/30"
        />
        {focused && results.length > 0 && (
          <div className="absolute inset-x-0 top-11 z-20 overflow-hidden rounded-lg border bg-popover shadow-lg">
            {results.map((o) => (
              <button
                key={`${o.productId}::${o.variant}`}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setPick(o);
                  setTapped(new Set());
                  setSearch("");
                  inputRef.current?.blur();
                }}
                className="block w-full truncate px-3 py-2 text-left text-sm hover:bg-muted"
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl bg-zinc-950 p-4 text-white">
        <p className="text-sm font-semibold">{pick?.label ?? "Cualquier platillo"}</p>
        <p className="mb-3 text-[11px] text-white/50">Comentario</p>
        {chips.length === 0 ? (
          <p className="text-xs text-white/50">Sin notas rápidas para este platillo.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {chips.map((n) => {
              const on = tapped.has(n.id);
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() =>
                    setTapped((prev) => {
                      const next = new Set(prev);
                      if (next.has(n.id)) next.delete(n.id);
                      else next.add(n.id);
                      return next;
                    })
                  }
                  className={cn("rounded-full px-3 py-1.5 text-xs font-semibold transition-colors", on ? "bg-orange-500 text-white" : "bg-white/10 text-white/80 hover:bg-white/15")}
                >
                  {n.label}
                </button>
              );
            })}
          </div>
        )}
        {tapped.size > 0 && (
          <p className="mt-3 rounded-lg bg-white/5 px-3 py-2 text-xs text-white/80">
            {chips.filter((n) => tapped.has(n.id)).map((n) => n.label).join(", ")}
          </p>
        )}
      </div>
      {pick && (
        <button type="button" onClick={() => setPick(null)} className="text-xs text-muted-foreground hover:text-foreground">
          Ver las que salen en todos
        </button>
      )}
    </section>
  );
}
