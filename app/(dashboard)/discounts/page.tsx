"use client";

import { useEffect, useMemo, useState } from "react";
import { CurrencyDollar, Lock, LockOpen, Percent, Plus, Sliders, Spinner, Trash, X } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/page-header";
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
import { formatDayShort } from "@/lib/time";
import type { Discount } from "@/lib/types";

type DiscountType = Discount["type"];

interface Usage {
  discountId: string;
  count: number;
  total: number;
  lastUsed: string | null;
}

interface Form {
  name: string;
  description: string;
  type: DiscountType;
  value: number;
  requiresAuthorization: boolean;
  active: boolean;
}

const EMPTY: Form = { name: "", description: "", type: "percentage", value: 10, requiresAuthorization: false, active: true };

const TYPES: { id: DiscountType; label: string; hint: string; icon: typeof Percent }[] = [
  { id: "percentage", label: "Porcentaje", hint: "Ej. 10% de la cuenta", icon: Percent },
  { id: "fixed_amount", label: "Monto fijo", hint: "Ej. $50 menos", icon: CurrencyDollar },
  { id: "flexible", label: "Flexible", hint: "El cajero elige al cobrar", icon: Sliders },
];

const PRESETS: Record<Exclude<DiscountType, "flexible">, number[]> = {
  percentage: [5, 10, 15, 20, 50],
  fixed_amount: [20, 50, 100, 200],
};

/** Cuenta de ejemplo para la vista previa. */
const SAMPLE = 500;

const money = (n: number) => `$${n.toLocaleString("es-MX", { maximumFractionDigits: 2 })}`;

function valueLabel(type: DiscountType, value: number) {
  if (type === "flexible") return "Flexible";
  return type === "percentage" ? `${value}%` : money(value);
}

export default function DiscountsPage() {
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [usage, setUsage] = useState<Map<string, Usage>>(new Map());
  const [loading, setLoading] = useState(true);
  // null = nada abierto; "new" = alta; si no, el id que se edita.
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function load() {
    try {
      const [d, u] = await Promise.all([fetch("/api/discounts"), fetch("/api/discounts/usage?days=30")]);
      if (d.ok) setDiscounts(await d.json());
      if (u.ok) setUsage(new Map(((await u.json()).usage as Usage[]).map((x) => [x.discountId, x])));
    } catch {
      toast.error("Error al cargar descuentos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  function openNew() {
    setForm(EMPTY);
    setEditing("new");
  }

  function openEdit(d: Discount) {
    setForm({
      name: d.name,
      description: d.description ?? "",
      type: d.type,
      value: Number(d.value) || 0,
      requiresAuthorization: d.requiresAuthorization,
      active: d.active,
    });
    setEditing(d.id);
  }

  async function save() {
    if (!form.name.trim()) return toast.error("Escribe el nombre del descuento");
    if (form.type !== "flexible" && form.value <= 0) return toast.error("Escribe el valor del descuento");
    if (form.type === "percentage" && form.value > 100) return toast.error("El porcentaje no puede pasar de 100");
    setSaving(true);
    try {
      const isNew = editing === "new";
      const res = await fetch(isNew ? "/api/discounts" : `/api/discounts/${editing}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, name: form.name.trim(), description: form.description.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo guardar");
      toast.success(isNew ? "Descuento creado" : "Cambios guardados");
      setEditing(null);
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(d: Discount) {
    setDiscounts((prev) => prev.map((x) => (x.id === d.id ? { ...x, active: !d.active } : x)));
    const res = await fetch(`/api/discounts/${d.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !d.active }),
    });
    if (!res.ok) {
      setDiscounts((prev) => prev.map((x) => (x.id === d.id ? d : x)));
      return toast.error("No se pudo cambiar el estado");
    }
    if (editing === d.id) set("active", !d.active);
    toast.success(d.active ? `${d.name} oculto en el POS` : `${d.name} disponible en el POS`);
  }

  async function remove() {
    if (!editing || editing === "new") return;
    const res = await fetch(`/api/discounts/${editing}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(data.error || "No se pudo eliminar");
    toast.success("Descuento eliminado");
    setEditing(null);
    load();
  }

  const totals = useMemo(() => {
    let count = 0;
    let total = 0;
    for (const u of usage.values()) {
      count += u.count;
      total += u.total;
    }
    return { count, total };
  }, [usage]);
  const maxCount = Math.max(1, ...[...usage.values()].map((u) => u.count));
  const sorted = [...discounts].sort(
    (a, b) => Number(b.active) - Number(a.active) || (usage.get(b.id)?.count ?? 0) - (usage.get(a.id)?.count ?? 0) || a.name.localeCompare(b.name, "es"),
  );
  const editingDiscount = discounts.find((d) => d.id === editing);
  const editingUsage = editing ? usage.get(editing) : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Descuentos"
        description="Los aplica el cajero a mano al cobrar. Los automáticos (2x1, combos) viven en Promociones."
        actions={
          <Button onClick={openNew} className="gap-2">
            <Plus className="size-4" weight="bold" />
            Nuevo descuento
          </Button>
        }
      />

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Spinner className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 space-y-4">
            {/* Uso del mes */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat label="Disponibles en el POS" value={String(discounts.filter((d) => d.active).length)} hint={`de ${discounts.length}`} />
              <Stat label="Órdenes con descuento" value={String(totals.count)} hint="últimos 30 días" />
              <Stat label="Total descontado" value={money(totals.total)} hint="últimos 30 días" className="col-span-2 sm:col-span-1" />
            </div>

            {discounts.length === 0 ? (
              <div className="rounded-2xl border border-dashed px-6 py-14 text-center">
                <Percent className="mx-auto size-10 text-muted-foreground/40" weight="duotone" />
                <p className="mt-3 font-semibold">Todavía no hay descuentos</p>
                <p className="mt-1 text-sm text-muted-foreground">Crea uno para que el cajero lo pueda aplicar al cobrar.</p>
                <Button onClick={openNew} className="mt-4 gap-2">
                  <Plus className="size-4" weight="bold" /> Nuevo descuento
                </Button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {sorted.map((d) => {
                  const u = usage.get(d.id);
                  const selected = editing === d.id;
                  return (
                    <div
                      key={d.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openEdit(d)}
                      onKeyDown={(e) => e.key === "Enter" && openEdit(d)}
                      className={cn(
                        "flex cursor-pointer flex-col gap-3 rounded-2xl border bg-card p-4 text-left transition-all hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none",
                        selected && "ring-2 ring-primary/50",
                        !d.active && "opacity-60 hover:opacity-100",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <ValueTile type={d.type} value={Number(d.value)} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">{d.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{d.description || TYPES.find((t) => t.id === d.type)?.hint}</p>
                        </div>
                        <div onClick={(e) => e.stopPropagation()}>
                          <Switch checked={d.active} onCheckedChange={() => toggle(d)} aria-label={d.active ? "Ocultar en el POS" : "Mostrar en el POS"} />
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className={cn("inline-flex items-center gap-1 font-medium", d.requiresAuthorization ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>
                          {d.requiresAuthorization ? <Lock className="size-3.5" weight="fill" /> : <LockOpen className="size-3.5" />}
                          {d.requiresAuthorization ? "Pide PIN de gerente" : "Cualquier cajero"}
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          {u ? `${u.count} uso${u.count === 1 ? "" : "s"} · ${money(u.total)}` : "Sin usos en 30 días"}
                        </span>
                      </div>
                      <div className="h-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary/70 transition-[width] duration-500" style={{ width: `${((u?.count ?? 0) / maxCount) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ───── Panel derecho: editor o vista del cajero ───── */}
          <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            {editing ? (
              <section className="space-y-5 rounded-2xl border bg-card p-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">{editing === "new" ? "Nuevo descuento" : "Editar descuento"}</h2>
                  <button type="button" onClick={() => setEditing(null)} className="text-muted-foreground hover:text-foreground" aria-label="Cerrar">
                    <X className="size-4" />
                  </button>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="d-name">Nombre (así lo ve el cajero)</Label>
                  <Input id="d-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ej. Descuento empleado" autoFocus={editing === "new"} />
                </div>

                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {TYPES.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, type: t.id, value: t.id === "flexible" ? 0 : t.id === f.type ? f.value : PRESETS[t.id][1] }))}
                        className={cn(
                          "flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center transition-all",
                          form.type === t.id ? "border-transparent bg-primary/10 ring-2 ring-primary/40" : "hover:bg-muted/50",
                        )}
                      >
                        <t.icon className={cn("size-5", form.type === t.id ? "text-primary" : "text-muted-foreground")} weight="bold" />
                        <span className="text-xs font-semibold">{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {form.type === "flexible" ? (
                  <p className="rounded-lg bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground">
                    Al cobrar, el cajero elige 10, 20, 30, 50 o 60%, o escribe un monto en pesos.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <Label>{form.type === "percentage" ? "Porcentaje" : "Monto"}</Label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {PRESETS[form.type].map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => set("value", v)}
                          className={cn(
                            "rounded-full border px-3 py-1 text-sm font-semibold tabular-nums transition-colors",
                            form.value === v ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
                          )}
                        >
                          {valueLabel(form.type, v)}
                        </button>
                      ))}
                      <div className="flex h-8 items-center rounded-lg border bg-background px-2.5 focus-within:ring-2 focus-within:ring-ring/30">
                        {form.type === "fixed_amount" && <span className="mr-0.5 text-sm text-muted-foreground">$</span>}
                        <input
                          type="number"
                          min={0}
                          max={form.type === "percentage" ? 100 : undefined}
                          value={form.value}
                          onChange={(e) => set("value", parseFloat(e.target.value) || 0)}
                          className="w-14 bg-transparent text-sm font-semibold tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                          aria-label="Valor"
                        />
                        {form.type === "percentage" && <span className="text-sm text-muted-foreground">%</span>}
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="d-desc">Para qué es (opcional)</Label>
                  <Input id="d-desc" value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Ej. consumo del personal" />
                </div>

                <div className="divide-y rounded-xl border">
                  <label className="flex cursor-pointer items-center justify-between gap-3 p-3">
                    <span>
                      <span className="block text-sm font-medium">Pide PIN de gerente</span>
                      <span className="block text-xs text-muted-foreground">Un cajero no lo puede aplicar solo</span>
                    </span>
                    <Switch checked={form.requiresAuthorization} onCheckedChange={(v) => set("requiresAuthorization", v)} />
                  </label>
                  <label className="flex cursor-pointer items-center justify-between gap-3 p-3">
                    <span>
                      <span className="block text-sm font-medium">Disponible en el POS</span>
                      <span className="block text-xs text-muted-foreground">Apagado, no sale en la lista al cobrar</span>
                    </span>
                    <Switch checked={form.active} onCheckedChange={(v) => set("active", v)} />
                  </label>
                </div>

                <Preview form={form} />

                {editingUsage && (
                  <p className="text-xs text-muted-foreground">
                    Usado {editingUsage.count} {editingUsage.count === 1 ? "vez" : "veces"} en 30 días ({money(editingUsage.total)})
                    {editingUsage.lastUsed && ` · último el ${formatDayShort(editingUsage.lastUsed)}`}.
                  </p>
                )}

                <div className="flex items-center gap-2">
                  {editingDiscount && (
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
              <section className="space-y-4 rounded-2xl border bg-card p-5">
                <div>
                  <h2 className="font-semibold">Así los ve el cajero</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">En la pantalla de cobro, sobre una cuenta de {money(SAMPLE)}.</p>
                </div>
                <div className="space-y-2">
                  {sorted.filter((d) => d.active).length === 0 && <p className="text-sm text-muted-foreground">Ningún descuento disponible.</p>}
                  {sorted
                    .filter((d) => d.active)
                    .map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => openEdit(d)}
                        className="flex w-full items-center justify-between gap-3 rounded-xl bg-muted/50 px-3 py-2.5 text-left transition-colors hover:bg-muted"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          {d.requiresAuthorization && <Lock className="size-3.5 shrink-0 text-amber-600" weight="fill" />}
                          <span className="truncate text-sm font-medium">{d.name}</span>
                        </span>
                        <span className="shrink-0 text-sm font-semibold text-emerald-600 tabular-nums dark:text-emerald-400">
                          {d.type === "flexible" ? "a elegir" : `−${money(amountOf(d.type, Number(d.value)))}`}
                        </span>
                      </button>
                    ))}
                </div>
                <p className="text-xs text-muted-foreground">Toca uno para editarlo.</p>
              </section>
            )}
          </div>
        </div>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {editingDiscount?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Si ya se usó en alguna orden no se puede eliminar (se conserva en el historial); en ese caso apágalo para que deje de salir en el POS.
            </AlertDialogDescription>
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

function amountOf(type: DiscountType, value: number) {
  return type === "percentage" ? (SAMPLE * value) / 100 : Math.min(SAMPLE, value);
}

function ValueTile({ type, value }: { type: DiscountType; value: number }) {
  return (
    <span
      className={cn(
        "flex h-11 min-w-11 shrink-0 items-center justify-center rounded-xl px-2 text-sm font-bold tabular-nums",
        type === "percentage" && "bg-sky-500/10 text-sky-700 dark:text-sky-300",
        type === "fixed_amount" && "bg-amber-500/10 text-amber-700 dark:text-amber-300",
        type === "flexible" && "bg-violet-500/10 text-violet-700 dark:text-violet-300",
      )}
    >
      {type === "flexible" ? <Sliders className="size-5" weight="bold" /> : valueLabel(type, value)}
    </span>
  );
}

function Preview({ form }: { form: Form }) {
  const discount = form.type === "flexible" ? null : amountOf(form.type, form.value);
  return (
    <div className="rounded-xl bg-muted/50 p-3 font-mono text-[13px]">
      <p className="mb-2 font-sans text-xs font-medium text-muted-foreground">Vista previa · cuenta de {money(SAMPLE)}</p>
      <div className="flex justify-between font-sans text-xs text-muted-foreground">
        <span>Subtotal</span>
        <span className="tabular-nums">{money(SAMPLE)}</span>
      </div>
      <div className="flex justify-between font-sans text-xs text-emerald-600 dark:text-emerald-400">
        <span className="truncate">{form.name || "Descuento"}</span>
        <span className="tabular-nums">{discount === null ? "lo elige el cajero" : `−${money(discount)}`}</span>
      </div>
      <div className="mt-1 flex justify-between border-t border-dashed pt-1 font-sans">
        <span className="text-sm font-semibold">Total</span>
        <span className="font-bold tabular-nums">{discount === null ? "—" : money(SAMPLE - discount)}</span>
      </div>
    </div>
  );
}

function Stat({ label, value, hint, className }: { label: string; value: string; hint?: string; className?: string }) {
  return (
    <div className={cn("rounded-2xl border bg-card p-4", className)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
