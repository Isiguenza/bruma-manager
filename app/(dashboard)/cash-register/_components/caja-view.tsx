"use client";

import { useMemo, useState } from "react";
import {
  ArrowCircleDown,
  ArrowCircleUp,
  CaretRight,
  ClipboardText,
  DotsThree,
  LockSimple,
  MagnifyingGlass,
  PencilSimple,
  Printer,
  Trash,
} from "@phosphor-icons/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/time";
import { type CorteData, Eyebrow, InnerCard, METHOD_COLORS, Panel, money, netSales } from "./shared";

export type CajaOrder = {
  id: string;
  orderNumber: number;
  createdAt: string;
  tableId: string | null;
  tableNumber?: string | null;
  customerName?: string | null;
  userId?: string | null;
  paymentMethod?: string | null;
  subtotal?: string | null;
  total?: string | null;
  tip?: string | null;
  discountAmount?: string | null;
};

const METHOD_LABEL: Record<string, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  terminal_mercadopago: "Terminal",
  transfer: "Transferencia",
  online: "En línea",
  platform_delivery: "Plataforma",
};

const methodColor = (m?: string | null) =>
  m === "cash"
    ? METHOD_COLORS.cash
    : m === "card" || m === "terminal_mercadopago"
      ? METHOD_COLORS.card
      : m === "transfer"
        ? METHOD_COLORS.transfer
        : m === "online"
          ? METHOD_COLORS.online
          : METHOD_COLORS.platform;

type Filter = "all" | "cash" | "card" | "transfer";

/**
 * Vista "Caja" — réplica de la de `CashRegisterView.swift` del iPad: barras por
 * método + órdenes a la izquierda; Ventas Netas, acciones y movimientos a la
 * derecha. Las acciones de la web (editar pago, reimprimir, eliminar) van en el
 * menú de cada orden.
 */
export function CajaView({
  corte,
  orders,
  employeeNames,
  isEditable,
  reprintingId,
  onGoToCorte,
  onDeposit,
  onWithdraw,
  onAudit,
  onEditPayment,
  onReprint,
  onDelete,
}: {
  corte: CorteData | null;
  orders: CajaOrder[];
  employeeNames: Record<string, string>;
  isEditable: (o: CajaOrder) => boolean;
  reprintingId: string | null;
  onGoToCorte: () => void;
  onDeposit: () => void;
  onWithdraw: () => void;
  onAudit: () => void;
  onEditPayment: (o: CajaOrder) => void;
  onReprint: (o: CajaOrder) => void;
  onDelete: (o: CajaOrder) => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const bars = corte
    ? [
        { label: "Efectivo", value: corte.sales.cash + corte.tips.cash, color: METHOD_COLORS.cash },
        { label: "Terminal", value: corte.sales.card + corte.tips.card, color: METHOD_COLORS.card },
        { label: "Transfer", value: corte.sales.transfer + corte.tips.transfer, color: METHOD_COLORS.transfer },
      ]
    : [];
  const barsTotal = Math.max(bars.reduce((s, b) => s + b.value, 0), 0.01);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders
      .filter((o) => {
        if (filter === "cash") return o.paymentMethod === "cash";
        if (filter === "card") return o.paymentMethod === "card" || o.paymentMethod === "terminal_mercadopago";
        if (filter === "transfer") return o.paymentMethod === "transfer";
        return true;
      })
      .filter(
        (o) =>
          !q ||
          String(o.orderNumber).includes(q) ||
          (o.customerName ?? "").toLowerCase().includes(q) ||
          (o.tableNumber ?? "").toLowerCase().includes(q)
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [orders, search, filter]);

  const movements = corte
    ? [
        ...corte.movements.deposits.items.map((i) => ({ ...i, deposit: true })),
        ...corte.movements.withdrawals.items.map((i) => ({ ...i, deposit: false })),
      ].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : [];

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      {/* Izquierda: métodos + órdenes */}
      <Panel className="space-y-4 p-4">
        <div className="grid grid-cols-3 gap-3">
          {bars.map((b) => (
            <div key={b.label} className="space-y-1">
              <div className="flex items-center justify-between text-[11px] font-bold">
                <span style={{ color: b.color }}>{b.label}</span>
                <span className="tabular-nums">{money(b.value, 0)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted">
                <div className="h-full rounded-full" style={{ backgroundColor: b.color, width: `${(b.value / barsTotal) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1">
            <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar orden, mesa o cliente…" className="pl-9" />
          </div>
          <div className="inline-flex rounded-lg border bg-background p-1">
            {(
              [
                ["all", "Todas"],
                ["cash", "Efectivo"],
                ["card", "Terminal"],
                ["transfer", "Transfer"],
              ] as [Filter, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={cn(
                  "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                  filter === key ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 flex items-baseline justify-between px-1 text-sm">
            <span className="font-semibold">Órdenes cobradas</span>
            <span className="text-xs text-muted-foreground">{visible.length} de {orders.length}</span>
          </p>
          {visible.length === 0 ? (
            <InnerCard className="py-12 text-center text-sm text-muted-foreground">
              {orders.length === 0 ? "Aún no hay órdenes cobradas en esta caja" : "Ninguna orden coincide con el filtro"}
            </InnerCard>
          ) : (
            <InnerCard className="divide-y">
              {visible.map((o) => {
                const tip = parseFloat(o.tip || "0");
                const discount = parseFloat(o.discountAmount || "0");
                return (
                  <div key={o.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="w-14 text-sm font-semibold tabular-nums">#{o.orderNumber}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">
                        {o.tableId ? `Mesa ${o.tableNumber ?? ""}` : "Para llevar"}
                        {o.customerName ? ` · ${o.customerName}` : ""}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatTime(o.createdAt)}
                        {o.userId && employeeNames[o.userId] ? ` · ${employeeNames[o.userId]}` : ""}
                      </p>
                    </div>
                    <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                      <span className="size-2 rounded-full" style={{ backgroundColor: methodColor(o.paymentMethod) }} />
                      {METHOD_LABEL[o.paymentMethod ?? ""] ?? o.paymentMethod}
                    </span>
                    <div className="w-28 text-right">
                      <p className="text-sm font-semibold tabular-nums">{money(parseFloat(o.total || "0"))}</p>
                      {(tip > 0 || discount > 0) && (
                        <p className="text-[11px] text-muted-foreground tabular-nums">
                          {tip > 0 ? `propina ${money(tip, 0)}` : ""}
                          {tip > 0 && discount > 0 ? " · " : ""}
                          {discount > 0 ? `−${money(discount, 0)}` : ""}
                        </p>
                      )}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                        <DotsThree className="size-5" weight="bold" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {isEditable(o) && (
                          <DropdownMenuItem onClick={() => onEditPayment(o)}>
                            <PencilSimple className="mr-2 size-4" /> Editar pago y propina
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => onReprint(o)} disabled={reprintingId === o.id}>
                          <Printer className="mr-2 size-4" /> Reimprimir ticket
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onDelete(o)} className="text-destructive focus:text-destructive">
                          <Trash className="mr-2 size-4" /> Eliminar orden
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })}
            </InnerCard>
          )}
        </div>
      </Panel>

      {/* Derecha: ventas netas + acciones + movimientos */}
      <Panel className="space-y-4 p-4">
        <button
          type="button"
          onClick={onGoToCorte}
          className="group w-full rounded-2xl border p-5 text-left transition-colors hover:bg-muted/40"
          style={{ background: `linear-gradient(135deg, ${METHOD_COLORS.cash}26, transparent 70%)`, borderColor: `${METHOD_COLORS.cash}40` }}
        >
          <div className="flex items-center justify-between">
            <Eyebrow>Ventas netas</Eyebrow>
            <CaretRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" weight="bold" />
          </div>
          <p className="mt-1 text-4xl font-extrabold tracking-tight tabular-nums">{corte ? money(netSales(corte)) : "…"}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {corte ? `Bruto ${money(corte.sales.total)} · ${corte.summary.totalOrders} órdenes` : "Cargando corte…"}
          </p>
        </button>

        <div className="grid grid-cols-2 gap-2.5">
          <Action icon={ArrowCircleDown} color="#16a34a" title="Depósito" subtitle="Ingresar efectivo" onClick={onDeposit} />
          <Action icon={ArrowCircleUp} color="#ea580c" title="Sangría" subtitle="Retirar efectivo" onClick={onWithdraw} />
          <Action icon={ClipboardText} color="#7c3aed" title="Auditoría" subtitle="Quién comandó/cobró" onClick={onAudit} />
          <Action icon={LockSimple} color="#dc2626" title="Cerrar" subtitle="Revisar y cerrar" onClick={onGoToCorte} />
        </div>

        <div>
          <p className="mb-2 px-1 text-sm font-semibold">Movimientos</p>
          {movements.length === 0 ? (
            <InnerCard className="py-6 text-center text-sm text-muted-foreground">Sin depósitos ni sangrías</InnerCard>
          ) : (
            <InnerCard className="divide-y text-sm">
              {movements.map((m) => (
                <div key={(m.deposit ? "d" : "w") + m.id} className="flex items-center gap-3 px-3.5 py-2.5">
                  {m.deposit ? (
                    <ArrowCircleDown className="size-5 shrink-0 text-green-600" weight="fill" />
                  ) : (
                    <ArrowCircleUp className="size-5 shrink-0 text-orange-600" weight="fill" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{m.description || (m.deposit ? "Depósito" : "Sangría")}</p>
                    <p className="text-xs text-muted-foreground">{formatTime(m.createdAt)}</p>
                  </div>
                  <span className="tabular-nums">
                    {m.deposit ? "+" : "−"}
                    {money(m.amount)}
                  </span>
                </div>
              ))}
            </InnerCard>
          )}
        </div>
      </Panel>
    </div>
  );
}

function Action({
  icon: Icon,
  color,
  title,
  subtitle,
  onClick,
}: {
  icon: typeof LockSimple;
  color: string;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="rounded-xl border bg-background p-3 text-left transition-colors hover:bg-muted/50">
      <span className="flex size-9 items-center justify-center rounded-[10px]" style={{ backgroundColor: `${color}26`, color }}>
        <Icon className="size-5" weight="fill" />
      </span>
      <p className="mt-2.5 text-sm font-semibold">{title}</p>
      <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>
    </button>
  );
}
