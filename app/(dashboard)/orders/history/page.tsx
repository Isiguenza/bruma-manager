"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CaretLeft, CaretRight, MagnifyingGlass, Plus, Receipt, Spinner } from "@phosphor-icons/react";
import { useSearchSeed } from "@/lib/use-search-seed";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { ManualOrderDialog } from "@/components/manual-order-dialog";
import { cn } from "@/lib/utils";
import { cdmxDayStart, dateKeyCDMX, formatDayLong, formatTime, fromDateKey } from "@/lib/time";
import { money } from "../../cash-register/_components/shared";
import { OrderItems } from "./_components/order-items";
import { type HistoryOrder, METHOD_LABEL, OrderSidePanel, methodColor } from "./_components/order-side-panel";

type Range = "today" | "7d" | "30d";
type Status = "paid" | "cancelled";
type MethodFilter = "all" | "cash" | "card" | "transfer";

const RANGES: [Range, string, number][] = [
  ["today", "Hoy", 0],
  ["7d", "7 días", 6],
  ["30d", "30 días", 29],
];

function rangeStart(range: Range) {
  const days = RANGES.find(([k]) => k === range)![2];
  const d = new Date(`${dateKeyCDMX()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return cdmxDayStart(d.toISOString().slice(0, 10));
}

const tableOf = (o: HistoryOrder) => o.table?.name || (o.table?.number ? `Mesa ${o.table.number}` : null);
const isCard = (m: string | null) => m === "card" || m === "terminal_mercadopago";

/** El scroll del dashboard vive en <main>, no en window. */
const scroller = () => document.querySelector("main");

/**
 * Historial de órdenes: dos vistas que NUNCA se combinan. La lista ocupa toda
 * la pantalla; al elegir una orden, la lista se oculta y se abre su detalle
 * (items a la izquierda, pago/acciones a la derecha). `?order=<id>` es
 * compartible y Esc / "Órdenes" regresa a la lista donde ibas.
 */
export default function OrderHistoryPage() {
  const [orders, setOrders] = useState<HistoryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>("7d");
  const [status, setStatus] = useState<Status>("paid");
  const [methodFilter, setMethodFilter] = useState<MethodFilter>("all");
  const [search, setSearch] = useState("");
  // La búsqueda ⌘K puede precargar este buscador (?search=).
  useSearchSeed(setSearch);
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("order")
  );
  const [showManual, setShowManual] = useState(false);
  const listScroll = useRef(0);

  const fetchOrders = useCallback(async () => {
    try {
      const startDate = rangeStart(range).toISOString();
      // Historial normal: solo pagadas con caja. Modo auditoría: solo canceladas.
      const query =
        status === "cancelled"
          ? `status=cancelled&startDate=${startDate}&limit=5000`
          : `paymentStatus=paid&startDate=${startDate}&limit=5000`;
      const res = await fetch(`/api/orders?${query}`, { cache: "no-store" });
      if (res.ok) {
        const data: HistoryOrder[] = await res.json();
        setOrders(status === "cancelled" ? data : data.filter((o) => o.cashRegisterId));
      }
    } catch (error) {
      console.error("Error fetching orders:", error);
    } finally {
      setLoading(false);
    }
  }, [range, status]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/^#/, "");
    return orders.filter((o) => {
      if (methodFilter === "cash" && o.paymentMethod !== "cash") return false;
      if (methodFilter === "card" && !isCard(o.paymentMethod)) return false;
      if (methodFilter === "transfer" && o.paymentMethod !== "transfer") return false;
      if (!q) return true;
      return (
        String(o.orderNumber).includes(q) ||
        (o.customerName ?? "").toLowerCase().includes(q) ||
        (o.table?.number ?? "").toLowerCase().includes(q) ||
        (o.employeeName ?? "").toLowerCase().includes(q) ||
        (o.items ?? []).some((i) => i.productName.toLowerCase().includes(q))
      );
    });
  }, [orders, search, methodFilter]);

  // Días en hora de CDMX.
  const days = useMemo(() => {
    const map = new Map<string, HistoryOrder[]>();
    for (const o of filtered) {
      const key = dateKeyCDMX(o.createdAt);
      map.set(key, [...(map.get(key) ?? []), o]);
    }
    const today = dateKeyCDMX();
    const yesterday = dateKeyCDMX(new Date(Date.now() - 86_400_000));
    return [...map.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, list]) => ({
        key,
        label: key === today ? "Hoy" : key === yesterday ? "Ayer" : formatDayLong(fromDateKey(key)),
        orders: list,
        total: list.reduce((s, o) => s + parseFloat(o.total || "0"), 0),
      }));
  }, [filtered]);

  const flat = useMemo(() => days.flatMap((d) => d.orders), [days]);
  const index = selectedId ? flat.findIndex((o) => o.id === selectedId) : -1;
  // Si la orden no está en el filtro actual (link directo), se busca en todas.
  const selected = index >= 0 ? flat[index] : selectedId ? orders.find((o) => o.id === selectedId) ?? null : null;

  const stats = useMemo(
    () => ({ count: filtered.length, total: filtered.reduce((s, o) => s + parseFloat(o.total || "0"), 0) }),
    [filtered]
  );

  const open = useCallback((id: string | null) => {
    const main = scroller();
    if (id && !new URLSearchParams(window.location.search).get("order") && main) listScroll.current = main.scrollTop;
    setSelectedId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("order", id);
    else url.searchParams.delete("order");
    window.history.replaceState(null, "", url);
  }, []);

  // Al abrir una orden se sube; al volver, la lista regresa a donde ibas.
  useLayoutEffect(() => {
    const main = scroller();
    if (!main) return;
    main.scrollTop = selectedId ? 0 : listScroll.current;
  }, [selectedId]);

  // Detalle: ←/→ (o ↑/↓) orden anterior/siguiente · Esc regresa a la lista.
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, [role=combobox], [role=listbox], [contenteditable=true]")) return;
      if (e.key === "Escape") open(null);
      const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (step && index >= 0) {
        const next = flat[index + step];
        if (next) {
          e.preventDefault();
          open(next.id);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, index, flat, open]);

  const refetch = (setter: () => void) => {
    setLoading(true);
    setter();
  };

  // ───────────── Detalle ─────────────
  if (selectedId) {
    if (!selected) {
      return loading ? (
        <div className="flex h-64 items-center justify-center">
          <Spinner className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4">
          <BackButton onClick={() => open(null)} />
          <Card className="py-16 text-center text-sm text-muted-foreground">No se encontró esa orden en el periodo elegido.</Card>
        </div>
      );
    }
    return (
      <OrderDetail
        order={selected}
        position={index >= 0 ? { index, total: flat.length } : null}
        onBack={() => open(null)}
        onPrev={index > 0 ? () => open(flat[index - 1].id) : undefined}
        onNext={index >= 0 && index < flat.length - 1 ? () => open(flat[index + 1].id) : undefined}
        onChanged={fetchOrders}
        onDeleted={() => {
          open(null);
          fetchOrders();
        }}
      />
    );
  }

  // ───────────── Lista ─────────────
  return (
    <div className="space-y-5">
      <PageHeader
        title="Órdenes"
        description={
          status === "cancelled"
            ? "Órdenes canceladas · solo auditoría"
            : loading
              ? "Cargando…"
              : `${stats.count} ${stats.count === 1 ? "orden" : "órdenes"} · ${money(stats.total)} cobrado`
        }
        actions={
          <>
            <Segmented value={range} onChange={(v) => refetch(() => setRange(v))} options={RANGES.map(([k, l]) => [k, l])} />
            <Segmented
              value={status}
              onChange={(v) => refetch(() => setStatus(v))}
              options={[
                ["paid", "Pagadas"],
                ["cancelled", "Canceladas"],
              ]}
            />
            <Button onClick={() => setShowManual(true)} className="gap-2">
              <Plus className="size-4" weight="bold" />
              Orden manual
            </Button>
          </>
        }
      />

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-60 flex-1">
          <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por #, mesa, cliente, mesero o platillo…" className="h-10 pl-9" />
        </div>
        <Segmented
          value={methodFilter}
          onChange={setMethodFilter}
          options={[
            ["all", "Todos"],
            ["cash", "Efectivo"],
            ["card", "Terminal"],
            ["transfer", "Transfer"],
          ]}
        />
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Spinner className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : days.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
          <Receipt className="size-10 opacity-30" weight="duotone" />
          {orders.length === 0 ? (status === "cancelled" ? "No hay órdenes canceladas en este periodo" : "No hay órdenes en este periodo") : "Ninguna orden coincide con la búsqueda"}
        </Card>
      ) : (
        <div className="space-y-6">
          {days.map((day) => (
            <section key={day.key} className="space-y-2">
              <div className="flex items-baseline justify-between px-1">
                <h2 className="text-sm font-semibold first-letter:uppercase">{day.label}</h2>
                <span className="text-sm text-muted-foreground tabular-nums">{money(day.total)}</span>
              </div>
              <Card className="gap-0 overflow-hidden py-0">
                {day.orders.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => open(o.id)}
                    className="group flex w-full items-center gap-4 border-b px-5 py-5 text-left transition-colors last:border-b-0 hover:bg-muted/40"
                  >
                    <span className="w-14 shrink-0 text-sm font-semibold text-muted-foreground tabular-nums">#{o.orderNumber}</span>
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="truncate">
                        <span className="font-medium">{tableOf(o) ?? "Para llevar"}</span>
                        {o.customerName && <span className="text-muted-foreground"> · {o.customerName}</span>}
                      </span>
                      <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
                        {formatTime(o.createdAt)}
                      </span>
                      <StatusChip order={o} />
                    </span>
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: methodColor(o.paymentMethod) }}
                      title={o.payments && o.payments.length > 0 ? "Dividido" : METHOD_LABEL[o.paymentMethod ?? ""] ?? o.paymentMethod ?? ""}
                    />
                    <span className="w-24 shrink-0 text-right font-semibold tabular-nums">{money(parseFloat(o.total || "0"))}</span>
                    <CaretRight className="size-4 shrink-0 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
                  </button>
                ))}
              </Card>
            </section>
          ))}
        </div>
      )}

      <ManualOrderDialog open={showManual} onClose={() => setShowManual(false)} onSuccess={fetchOrders} />
    </div>
  );
}

// ───────────── Vista de detalle ─────────────

function OrderDetail({
  order,
  position,
  onBack,
  onPrev,
  onNext,
  onChanged,
  onDeleted,
}: {
  order: HistoryOrder;
  position: { index: number; total: number } | null;
  onBack: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const subtotal = parseFloat(order.subtotal || "0");
  const tip = parseFloat(order.tip || "0");
  const discount = parseFloat(order.discountAmount || "0");
  const total = parseFloat(order.total || "0");
  const cancelled = order.status === "cancelled";
  const items = order.items ?? [];
  const pieces = items.filter((i) => !i.voided && !i.parentItemId).reduce((s, i) => s + i.quantity, 0);
  const voided = items.filter((i) => i.voided).length;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* Barra de navegación */}
      <div className="flex items-center justify-between gap-3">
        <BackButton onClick={onBack} />
        {position && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="hidden tabular-nums sm:inline">
              {position.index + 1} de {position.total}
            </span>
            <Button variant="outline" size="icon" className="size-8" onClick={onPrev} disabled={!onPrev} aria-label="Orden anterior (←)">
              <CaretLeft className="size-4" />
            </Button>
            <Button variant="outline" size="icon" className="size-8" onClick={onNext} disabled={!onNext} aria-label="Orden siguiente (→)">
              <CaretRight className="size-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Encabezado */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground first-letter:uppercase">
            {formatDayLong(order.createdAt)} · {formatTime(order.createdAt)}
            {order.employeeName ? ` · ${order.employeeName}` : ""}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-4xl font-semibold tracking-tight">Orden #{order.orderNumber}</h1>
            <Pill>{tableOf(order) ?? "Para llevar"}</Pill>
            {cancelled ? (
              <Pill className="bg-red-500/10 text-red-600 dark:text-red-400">Cancelada</Pill>
            ) : order.paymentStatus === "paid" ? (
              <Pill className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">Pagada</Pill>
            ) : (
              <Pill>{order.paymentStatus}</Pill>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-4xl font-semibold tracking-tight tabular-nums">{money(total)}</p>
        </div>
      </div>

      {/* Items (izquierda) · Pago y acciones (derecha) */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <div className="flex items-baseline justify-between px-1">
            <h2 className="text-sm font-semibold">Lo que se pidió</h2>
            <span className="text-xs text-muted-foreground">
              {pieces} {pieces === 1 ? "platillo" : "platillos"}
              {voided > 0 ? ` · ${voided} anulado${voided === 1 ? "" : "s"}` : ""}
            </span>
          </div>

          <OrderItems items={items} />

          <div className="space-y-2 rounded-xl border bg-muted/30 p-4 text-sm">
            <Row label="Subtotal" value={money(subtotal + discount)} />
            {discount > 0 && <Row label={order.discountName || "Descuento"} value={`−${money(discount)}`} muted />}
            {tip > 0 && <Row label="Propina" value={`+${money(tip)}`} muted />}
            <div className="flex items-baseline justify-between border-t pt-2">
              <span className="font-semibold">Total</span>
              <span className="text-2xl font-bold tabular-nums">{money(total)}</span>
            </div>
          </div>
        </div>

        <div className="lg:sticky lg:top-20 lg:self-start">
          <OrderSidePanel key={order.id} order={order} onChanged={onChanged} onDeleted={onDeleted} />
        </div>
      </div>
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick} className="-ml-2 gap-1.5 text-muted-foreground">
      <ArrowLeft className="size-4" />
      Órdenes
      <kbd className="ml-1 hidden rounded border px-1 font-mono text-[10px] sm:inline">Esc</kbd>
    </Button>
  );
}

function StatusChip({ order }: { order: HistoryOrder }) {
  if (order.status === "cancelled")
    return <span className="shrink-0 rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">Cancelada</span>;
  if (order.paymentStatus === "paid")
    return <span className="shrink-0 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">Pagada</span>;
  return <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">{order.paymentStatus}</span>;
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={cn("flex justify-between", muted && "text-muted-foreground")}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("rounded-full bg-muted px-3 py-1 text-xs font-semibold", className)}>{children}</span>;
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="inline-flex rounded-lg border bg-muted/40 p-1">
      {options.map(([k, l]) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            value === k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
