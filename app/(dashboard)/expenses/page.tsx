"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  eachDayOfInterval,
  eachHourOfInterval,
  endOfDay,
  format,
  isSameDay,
  isToday,
  isYesterday,
  startOfDay,
  startOfHour,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";
import { es } from "date-fns/locale";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Icon } from "@phosphor-icons/react";
import {
  BeerBottle,
  Broom,
  Car,
  DotsThreeCircle,
  Fish,
  Lightning,
  MagnifyingGlass,
  Package,
  PencilSimple,
  Plus,
  Receipt,
  Trash,
  TrendDown,
  TrendUp,
  UsersThree,
  WhatsappLogo,
  Wrench,
  X,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { EXPENSE_CATEGORIES, guessExpenseCategory, type ExpenseCategory } from "@/lib/expenses/categories";

interface Expense {
  id: string;
  concept: string;
  amount: string;
  currency: string;
  category: ExpenseCategory;
  source: "whatsapp" | "manual";
  sourceMessageId: string | null;
  chatId: string | null;
  senderName: string | null;
  notes: string | null;
  expenseDate: string;
  createdAt: string;
}

const CATEGORY_META: Record<ExpenseCategory, { label: string; icon: Icon }> = {
  insumos: { label: "Insumos", icon: Fish },
  bebidas: { label: "Bebidas", icon: BeerBottle },
  empaque: { label: "Empaque", icon: Package },
  limpieza: { label: "Limpieza", icon: Broom },
  servicios: { label: "Servicios", icon: Lightning },
  transporte: { label: "Transporte", icon: Car },
  mantenimiento: { label: "Mantenimiento", icon: Wrench },
  personal: { label: "Personal", icon: UsersThree },
  otros: { label: "Otros", icon: DotsThreeCircle },
};

type RangeKey = "today" | "7d" | "30d" | "month" | "lastMonth";

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Hoy" },
  { key: "7d", label: "7 días" },
  { key: "30d", label: "30 días" },
  { key: "month", label: "Este mes" },
  { key: "lastMonth", label: "Mes pasado" },
];

// Los rangos "en curso" terminan en AHORA (no a fin de día/mes): así el
// periodo anterior que calcula la API tiene la misma duración y el
// comparativo no castiga a un mes que va a la mitad.
function rangeBounds(key: RangeKey, now = new Date()) {
  switch (key) {
    case "today":
      return { from: startOfDay(now), to: now, end: endOfDay(now) };
    case "7d":
      return { from: startOfDay(subDays(now, 6)), to: now, end: endOfDay(now) };
    case "30d":
      return { from: startOfDay(subDays(now, 29)), to: now, end: endOfDay(now) };
    case "month":
      return { from: startOfMonth(now), to: now, end: endOfDay(now) };
    case "lastMonth": {
      const from = startOfMonth(subMonths(now, 1));
      const to = startOfMonth(now);
      return { from, to, end: endOfDay(subDays(to, 1)) };
    }
  }
}

const POLL_MS = 30_000;

const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
const mxnCompact = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", notation: "compact", maximumFractionDigits: 1 });

function money(amount: number, currency = "MXN") {
  if (currency === "MXN") return mxn.format(amount);
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
}

function dayLabel(date: Date) {
  if (isToday(date)) return "Hoy";
  if (isYesterday(date)) return "Ayer";
  return format(date, "EEEE d 'de' MMMM", { locale: es });
}

const emptyForm = {
  concept: "",
  amount: "",
  category: "" as ExpenseCategory | "",
  expenseDate: "",
  notes: "",
};

export default function ExpensesPage() {
  const [range, setRange] = useState<RangeKey>("7d");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [previousTotal, setPreviousTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<ExpenseCategory | null>(null);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const knownIds = useRef<Set<string> | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Expense | null>(null);

  const fetchExpenses = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      const { from, to } = rangeBounds(range);
      try {
        const res = await fetch(`/api/expenses?from=${from.toISOString()}&to=${to.toISOString()}`, { cache: "no-store" });
        if (!res.ok) throw new Error();
        const data: { expenses: Expense[]; previousTotal: number } = await res.json();

        // Resalta lo que llegó desde el último poll (típicamente, de Hermes).
        if (knownIds.current && opts.silent) {
          const incoming = data.expenses.filter((e) => !knownIds.current!.has(e.id));
          if (incoming.length) {
            setFreshIds(new Set(incoming.map((e) => e.id)));
            toast(`${incoming.length === 1 ? "Nuevo gasto" : `${incoming.length} gastos nuevos`} desde WhatsApp`, {
              description: incoming.slice(0, 3).map((e) => `${e.concept} · ${money(Number(e.amount), e.currency)}`).join("\n"),
            });
            setTimeout(() => setFreshIds(new Set()), 4000);
          }
        }
        knownIds.current = new Set(data.expenses.map((e) => e.id));
        setExpenses(data.expenses);
        setPreviousTotal(data.previousTotal);
      } catch {
        if (!opts.silent) toast.error("Error al cargar gastos");
      } finally {
        setLoading(false);
      }
    },
    [range]
  );

  useEffect(() => {
    setLoading(true);
    knownIds.current = null;
    fetchExpenses();
    const id = setInterval(() => fetchExpenses({ silent: true }), POLL_MS);
    const onFocus = () => fetchExpenses({ silent: true });
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchExpenses]);

  // ---- Agregados (solo MXN para las cifras; otras monedas se reportan aparte)
  const mxnExpenses = useMemo(() => expenses.filter((e) => e.currency === "MXN"), [expenses]);
  const otherCurrencyTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const e of expenses) if (e.currency !== "MXN") totals[e.currency] = (totals[e.currency] ?? 0) + Number(e.amount);
    return totals;
  }, [expenses]);

  const total = useMemo(() => mxnExpenses.reduce((s, e) => s + Number(e.amount), 0), [mxnExpenses]);
  const delta = previousTotal > 0 ? ((total - previousTotal) / previousTotal) * 100 : null;
  const biggest = useMemo(
    () => mxnExpenses.reduce<Expense | null>((max, e) => (!max || Number(e.amount) > Number(max.amount) ? e : max), null),
    [mxnExpenses]
  );
  const whatsappShare = expenses.length
    ? Math.round((expenses.filter((e) => e.source === "whatsapp").length / expenses.length) * 100)
    : 0;

  const series = useMemo(() => {
    const { from, end } = rangeBounds(range);
    const hourly = range === "today";
    const buckets = hourly
      ? eachHourOfInterval({ start: from, end })
      : eachDayOfInterval({ start: from, end: startOfDay(end) });
    const byKey = new Map<number, number>();
    for (const e of mxnExpenses) {
      const d = new Date(e.expenseDate);
      const k = (hourly ? startOfHour(d) : startOfDay(d)).getTime();
      byKey.set(k, (byKey.get(k) ?? 0) + Number(e.amount));
    }
    return buckets.map((b) => ({
      ts: b.getTime(),
      label: hourly ? format(b, "HH:mm") : format(b, "d MMM", { locale: es }),
      longLabel: hourly ? format(b, "HH:mm 'h'") : format(b, "EEEE d 'de' MMMM", { locale: es }),
      total: Math.round((byKey.get(b.getTime()) ?? 0) * 100) / 100,
    }));
  }, [mxnExpenses, range]);

  const byCategory = useMemo(() => {
    const map = new Map<ExpenseCategory, { total: number; count: number }>();
    for (const e of mxnExpenses) {
      const cur = map.get(e.category) ?? { total: 0, count: 0 };
      cur.total += Number(e.amount);
      cur.count += 1;
      map.set(e.category, cur);
    }
    return [...map.entries()]
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [mxnExpenses]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return expenses.filter(
      (e) =>
        (!categoryFilter || e.category === categoryFilter) &&
        (!q || e.concept.toLowerCase().includes(q) || (e.senderName ?? "").toLowerCase().includes(q) || (e.notes ?? "").toLowerCase().includes(q))
    );
  }, [expenses, search, categoryFilter]);

  const grouped = useMemo(() => {
    const groups: { day: Date; items: Expense[]; total: number }[] = [];
    for (const e of filtered) {
      const d = new Date(e.expenseDate);
      const last = groups[groups.length - 1];
      if (last && isSameDay(last.day, d)) {
        last.items.push(e);
        if (e.currency === "MXN") last.total += Number(e.amount);
      } else {
        groups.push({ day: startOfDay(d), items: [e], total: e.currency === "MXN" ? Number(e.amount) : 0 });
      }
    }
    return groups;
  }, [filtered]);

  // ---- Captura / edición
  function openNew() {
    setEditing(null);
    setForm({ ...emptyForm, expenseDate: format(new Date(), "yyyy-MM-dd'T'HH:mm") });
    setDialogOpen(true);
  }

  function openEdit(e: Expense) {
    setEditing(e);
    setForm({
      concept: e.concept,
      amount: String(Number(e.amount)),
      category: e.category,
      expenseDate: format(new Date(e.expenseDate), "yyyy-MM-dd'T'HH:mm"),
      notes: e.notes ?? "",
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.concept.trim()) return toast.error("Escribe el concepto");
    if (!(Number(form.amount) > 0)) return toast.error("El monto debe ser mayor a 0");
    setSaving(true);
    try {
      const payload = {
        concept: form.concept.trim(),
        amount: Number(form.amount),
        category: form.category || guessExpenseCategory(form.concept),
        expenseDate: form.expenseDate ? new Date(form.expenseDate).toISOString() : undefined,
        notes: form.notes,
      };
      const res = await fetch(editing ? `/api/expenses/${editing.id}` : "/api/expenses", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error);
      toast.success(editing ? "Gasto actualizado" : "Gasto registrado");
      setDialogOpen(false);
      fetchExpenses();
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!toDelete) return;
    const target = toDelete;
    setToDelete(null);
    setExpenses((prev) => prev.filter((e) => e.id !== target.id));
    const res = await fetch(`/api/expenses/${target.id}`, { method: "DELETE" });
    if (res.ok) toast.success("Gasto eliminado");
    else {
      toast.error("No se pudo eliminar");
      fetchExpenses();
    }
  }

  const suggestedCategory = form.concept ? guessExpenseCategory(form.concept) : null;
  const maxCategory = byCategory[0]?.total ?? 0;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      {/* Encabezado */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60 motion-reduce:animate-none" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            En vivo · Hermes registra desde WhatsApp
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Compras y gastos</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border bg-muted/40 p-1">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  range === r.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          <Button onClick={openNew} className="gap-2">
            <Plus className="size-4" weight="bold" />
            Registrar gasto
          </Button>
        </div>
      </div>

      {/* Hero: total + tendencia */}
      <Card className="overflow-hidden py-0">
        <CardContent className="grid gap-0 p-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="flex flex-col justify-between gap-6 border-b p-6 lg:border-r lg:border-b-0">
            <div>
              <p className="text-sm text-muted-foreground">Gastado en el periodo</p>
              {loading ? (
                <Skeleton className="mt-2 h-12 w-48" />
              ) : (
                <p className="mt-1 text-5xl font-semibold tracking-tight tabular-nums">{mxn.format(total)}</p>
              )}
              {!loading && delta !== null && (
                <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                  {delta >= 0 ? <TrendUp className="size-3.5" weight="bold" /> : <TrendDown className="size-3.5" weight="bold" />}
                  {Math.abs(delta).toFixed(0)}% {delta >= 0 ? "más" : "menos"} que el periodo anterior
                  <span className="text-muted-foreground">({mxnCompact.format(previousTotal)})</span>
                </p>
              )}
              {!loading && delta === null && previousTotal === 0 && total > 0 && (
                <p className="mt-3 text-xs text-muted-foreground">Sin gastos en el periodo anterior para comparar</p>
              )}
              {Object.keys(otherCurrencyTotals).length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Además: {Object.entries(otherCurrencyTotals).map(([c, v]) => money(v, c)).join(" · ")}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Stat label="Registros" value={loading ? null : String(expenses.length)} />
              <Stat label="Promedio" value={loading ? null : mxn.format(mxnExpenses.length ? total / mxnExpenses.length : 0)} />
              <Stat
                label="Compra más grande"
                value={loading ? null : biggest ? mxn.format(Number(biggest.amount)) : "—"}
                hint={biggest?.concept}
              />
              <Stat label="Vía WhatsApp" value={loading ? null : `${whatsappShare}%`} />
            </div>
          </div>
          <div className="p-4 pt-6 lg:p-6">
            <p className="mb-3 px-2 text-sm font-medium">{range === "today" ? "Gasto por hora" : "Gasto por día"}</p>
            <div className="h-64">
              {loading ? (
                <Skeleton className="size-full" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                      minTickGap={24}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={56}
                      tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                      tickFormatter={(v) => mxnCompact.format(v)}
                    />
                    <Tooltip
                      cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1, strokeDasharray: "4 4" }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const p = payload[0].payload as (typeof series)[number];
                        return (
                          <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
                            <p className="text-xs capitalize text-muted-foreground">{p.longLabel}</p>
                            <p className="font-semibold tabular-nums">{mxn.format(p.total)}</p>
                          </div>
                        );
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="total"
                      stroke="var(--primary)"
                      strokeWidth={2}
                      fill="url(#expenseFill)"
                      activeDot={{ r: 5, fill: "var(--primary)", stroke: "var(--background)", strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        {/* Categorías */}
        <Card className="h-fit">
          <CardContent className="flex flex-col gap-1">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium">¿En qué se va?</p>
              {categoryFilter && (
                <button onClick={() => setCategoryFilter(null)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  <X className="size-3" /> Quitar filtro
                </button>
              )}
            </div>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="my-1 h-10 w-full" />)
            ) : byCategory.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Sin gastos en este periodo</p>
            ) : (
              byCategory.map(({ category, total: catTotal, count }) => {
                const meta = CATEGORY_META[category];
                const active = categoryFilter === category;
                return (
                  <button
                    key={category}
                    onClick={() => setCategoryFilter(active ? null : category)}
                    className={cn(
                      "group flex flex-col gap-1.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/60",
                      active && "bg-muted",
                      categoryFilter && !active && "opacity-50"
                    )}
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <meta.icon className="size-4 text-muted-foreground" weight="duotone" />
                      <span className="font-medium">{meta.label}</span>
                      <span className="text-xs text-muted-foreground">{count}</span>
                      <span className="ml-auto font-medium tabular-nums">{mxn.format(catTotal)}</span>
                      <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                        {total > 0 ? Math.round((catTotal / total) * 100) : 0}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
                        style={{ width: `${maxCategory ? (catTotal / maxCategory) * 100 : 0}%` }}
                      />
                    </div>
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Feed */}
        <Card>
          <CardContent className="flex flex-col gap-4">
            <div className="relative">
              <MagnifyingGlass className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar concepto, quién lo mandó o nota…"
                className="pl-9"
              />
            </div>

            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)
            ) : grouped.length === 0 ? (
              <EmptyState filtered={expenses.length > 0} onNew={openNew} />
            ) : (
              <div className="flex flex-col gap-5">
                {grouped.map((g) => (
                  <section key={g.day.toISOString()}>
                    <div className="sticky top-0 z-10 mb-1 flex items-baseline justify-between bg-card/95 py-1 backdrop-blur">
                      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{dayLabel(g.day)}</h3>
                      <span className="text-xs tabular-nums text-muted-foreground">{mxn.format(g.total)}</span>
                    </div>
                    <ul className="flex flex-col">
                      {g.items.map((e) => (
                        <ExpenseRow
                          key={e.id}
                          expense={e}
                          fresh={freshIds.has(e.id)}
                          onEdit={() => openEdit(e)}
                          onDelete={() => setToDelete(e)}
                        />
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Alta / edición */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar gasto" : "Registrar gasto"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="concept">Concepto</Label>
              <Input
                id="concept"
                autoFocus
                value={form.concept}
                onChange={(e) => setForm({ ...form, concept: e.target.value })}
                placeholder="Camarón 5 kg en la central"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="amount">Monto (MXN)</Label>
                <Input
                  id="amount"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="date">Fecha</Label>
                <Input
                  id="date"
                  type="datetime-local"
                  value={form.expenseDate}
                  onChange={(e) => setForm({ ...form, expenseDate: e.target.value })}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Categoría</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as ExpenseCategory })}>
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={suggestedCategory ? `Automática: ${CATEGORY_META[suggestedCategory].label}` : "Automática"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((c) => {
                    const Meta = CATEGORY_META[c];
                    return (
                      <SelectItem key={c} value={c}>
                        <Meta.icon className="size-4" weight="duotone" />
                        {Meta.label}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="notes">Notas</Label>
              <Textarea id="notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            {editing?.source === "whatsapp" && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <WhatsappLogo className="size-3.5" weight="fill" />
                Registrado por Hermes{editing.senderName ? ` · mensaje de ${editing.senderName}` : ""}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Guardando…" : editing ? "Guardar cambios" : "Registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este gasto?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete ? `${toDelete.concept} · ${money(Number(toDelete.amount), toDelete.currency)}` : ""}. Si Hermes
              vuelve a mandar el mismo mensaje no se volverá a registrar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-white hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | null; hint?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      {value === null ? (
        <Skeleton className="mt-1 h-6 w-20" />
      ) : (
        <p className="text-lg font-semibold tabular-nums">{value}</p>
      )}
      {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ExpenseRow({
  expense: e,
  fresh,
  onEdit,
  onDelete,
}: {
  expense: Expense;
  fresh: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const meta = CATEGORY_META[e.category] ?? CATEGORY_META.otros;
  return (
    <li
      className={cn(
        "group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors duration-700 hover:bg-muted/50",
        fresh && "bg-emerald-500/10"
      )}
    >
      <button onClick={onEdit} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <meta.icon className="size-5" weight="duotone" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{e.concept}</span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {e.source === "whatsapp" ? (
              <WhatsappLogo className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" weight="fill" />
            ) : (
              <Receipt className="size-3.5 shrink-0" />
            )}
            <span className="truncate">
              {e.source === "whatsapp" ? e.senderName ?? "WhatsApp" : "Manual"} · {format(new Date(e.expenseDate), "HH:mm")} · {meta.label}
              {e.notes ? ` · ${e.notes}` : ""}
            </span>
          </span>
        </span>
        <span className="shrink-0 text-right font-semibold tabular-nums">
          {money(Number(e.amount), e.currency)}
          {e.currency !== "MXN" && <span className="block text-[10px] font-normal text-muted-foreground">{e.currency}</span>}
        </span>
      </button>
      <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <Button size="icon" variant="ghost" className="size-8" onClick={onEdit} aria-label="Editar">
          <PencilSimple className="size-4" />
        </Button>
        <Button size="icon" variant="ghost" className="size-8 text-destructive hover:text-destructive" onClick={onDelete} aria-label="Eliminar">
          <Trash className="size-4" />
        </Button>
      </div>
    </li>
  );
}

function EmptyState({ filtered, onNew }: { filtered: boolean; onNew: () => void }) {
  if (filtered) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Nada coincide con la búsqueda o el filtro.</p>;
  }
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
        <WhatsappLogo className="size-7" weight="fill" />
      </span>
      <div>
        <p className="font-medium">Todavía no hay gastos en este periodo</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Cuando alguien mande una compra al grupo de WhatsApp, Hermes la registra y aparece aquí sola.
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onNew} className="gap-2">
        <Plus className="size-4" /> Registrar uno a mano
      </Button>
    </div>
  );
}
