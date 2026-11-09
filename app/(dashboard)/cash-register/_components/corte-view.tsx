"use client";

import { useState } from "react";
import { ArrowClockwise, CaretDown, CheckCircle, LockSimple, Money, Printer, WarningCircle } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDateTime, formatTime } from "@/lib/time";
import {
  type CorteData,
  BigNumber,
  Eyebrow,
  InnerCard,
  METHOD_COLORS,
  Panel,
  buildCortePrintBody,
  cashExpected,
  money,
  netSales,
  netTips,
  percent,
  printServerUrl,
} from "./shared";

type MethodRow = { id: string; label: string; color: string; sales: number; tips: number | null };

/**
 * Corte financiero — réplica de `CorteView.swift` del iPad: mismo acomodo
 * (ventas a la izquierda, efectivo a la derecha), mismos números y mismo
 * ticket al imprimir.
 */
export function CorteView({
  data,
  loading,
  onReload,
  employeeNames,
  printedBy,
  onCloseRegister,
}: {
  data: CorteData;
  loading: boolean;
  onReload: () => void;
  employeeNames: Record<string, string>;
  printedBy?: string;
  onCloseRegister?: () => void;
}) {
  const [printing, setPrinting] = useState(false);
  const [showMovements, setShowMovements] = useState(false);

  const isOpen = data.register.status === "open";
  const expected = cashExpected(data);
  const orders = data.summary.totalOrders;
  const avgTicket = orders > 0 ? data.sales.total / orders : 0;
  const openedByName = data.register.openedBy ? employeeNames[data.register.openedBy] : undefined;

  async function print() {
    setPrinting(true);
    try {
      const res = await fetch(`${printServerUrl()}/print-corte`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildCortePrintBody(data, { openedByName, printedBy })),
      });
      if (!res.ok) throw new Error();
      toast.success("Corte impreso");
    } catch {
      toast.error("No se pudo imprimir el corte");
    } finally {
      setPrinting(false);
    }
  }

  // ¿Cómo pagaron?
  const rows: MethodRow[] = [
    { id: "cash", label: "Efectivo", color: METHOD_COLORS.cash, sales: data.sales.cash, tips: data.tips.cash },
    { id: "card", label: "Terminal", color: METHOD_COLORS.card, sales: data.sales.card, tips: data.tips.card },
    { id: "transfer", label: "Transferencia", color: METHOD_COLORS.transfer, sales: data.sales.transfer, tips: data.tips.transfer },
  ];
  const hasOnline = data.sales.online > 0 || data.tips.online > 0;
  if (hasOnline) rows.push({ id: "online", label: "En línea", color: METHOD_COLORS.online, sales: data.sales.online, tips: data.tips.online });
  if (data.sales.platformDelivery > 0)
    rows.push({ id: "platform", label: "Plataformas", color: METHOD_COLORS.platform, sales: data.sales.platformDelivery, tips: null });
  const salesTotal = rows.reduce((s, r) => s + r.sales, 0);
  const salesCommission = data.commissions.salesCommission + (hasOnline ? data.commissions.online.salesCommission : 0);
  const tipsCommission = data.commissions.tipsCommission + (hasOnline ? data.commissions.online.tipsCommission : 0);

  // Movimientos
  const movements = [
    ...data.movements.deposits.items.map((i) => ({ ...i, deposit: true })),
    ...data.movements.withdrawals.items.map((i) => ({ ...i, deposit: false })),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // Meta
  const meta = [
    `Abierta ${formatDateTime(data.register.openedAt)}`,
    data.register.closedAt ? `cerrada ${formatTime(data.register.closedAt)}` : null,
    duration(data.register.openedAt, data.register.closedAt),
    openedByName ? `abrió ${openedByName}` : null,
    data.summary.splitOrders > 0 ? `${data.summary.splitOrders} pagos divididos` : null,
  ].filter(Boolean);

  const finalCash = data.summary.finalCash;
  const diff = finalCash != null ? finalCash - expected : 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      {/* Izquierda: ventas */}
      <Panel className="space-y-6 p-6">
        <div className="space-y-1">
          <Eyebrow>Ventas netas</Eyebrow>
          <BigNumber>{money(netSales(data))}</BigNumber>
          <p className="text-sm text-muted-foreground">
            {orders} órdenes · ticket promedio {money(avgTicket)} · propinas netas {money(netTips(data))}
          </p>
        </div>

        <InnerCard className="p-4">
          {/* Proporción por método, con los colores del cobro */}
          <div className="mb-5 flex h-2.5 gap-[3px] overflow-hidden rounded bg-muted">
            {rows
              .filter((r) => r.sales > 0)
              .map((r) => (
                <div key={r.id} className="h-full rounded-[3px]" style={{ backgroundColor: r.color, width: `${(r.sales / Math.max(salesTotal, 0.01)) * 100}%` }} />
              ))}
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <th className="pb-2 text-left font-bold">Método</th>
                <th className="w-36 pb-2 text-right font-bold">Ventas</th>
                <th className="w-36 pb-2 text-right font-bold">Propinas</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="py-3">
                    <span className="flex items-center gap-2">
                      <span className="size-2 rounded-full" style={{ backgroundColor: r.color }} />
                      {r.label}
                      {salesTotal > 0 && r.sales > 0 && (
                        <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                          {Math.round((r.sales / salesTotal) * 100)}%
                        </span>
                      )}
                    </span>
                  </td>
                  <td className={cn("py-3 text-right tabular-nums", r.sales === 0 && "text-muted-foreground/50")}>{money(r.sales)}</td>
                  <td className={cn("py-3 text-right tabular-nums", !r.tips && "text-muted-foreground/50")}>
                    {r.tips === null ? "—" : money(r.tips)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="tabular-nums">
              <tr className="border-t-2">
                <td className="pt-3 text-muted-foreground">Bruto</td>
                <td className="pt-3 text-right">{money(data.sales.total)}</td>
                <td className="pt-3 text-right">{money(data.tips.total)}</td>
              </tr>
              <tr>
                <td className="pt-2 text-muted-foreground">Comisión {percent(data.commissions.rateWithIVA)}</td>
                <td className="pt-2 text-right text-muted-foreground">{salesCommission > 0 ? `−${money(salesCommission)}` : "—"}</td>
                <td className="pt-2 text-right text-muted-foreground">{tipsCommission > 0 ? `−${money(tipsCommission)}` : "—"}</td>
              </tr>
              <tr className="font-semibold">
                <td className="pt-2">Neto</td>
                <td className="pt-2 text-right font-bold">{money(netSales(data))}</td>
                <td className="pt-2 text-right font-bold">{money(netTips(data))}</td>
              </tr>
            </tfoot>
          </table>
          {data.sales.platformDelivery > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">Plataformas se liquidan aparte y no suman al neto.</p>
          )}
        </InnerCard>

        <p className="text-xs text-muted-foreground/80">{meta.join(" · ")}</p>
      </Panel>

      {/* Derecha: efectivo */}
      <Panel className="flex flex-col">
        <div className="flex-1 space-y-5 p-5">
          <div
            className="space-y-1 rounded-xl border p-4"
            style={{ backgroundColor: `${METHOD_COLORS.cash}14`, borderColor: `${METHOD_COLORS.cash}4d` }}
          >
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.12em]">
              <Money className="size-3.5" weight="fill" style={{ color: METHOD_COLORS.cash }} />
              <span className="text-foreground/70">Efectivo en cajón</span>
            </p>
            <p className="text-4xl font-extrabold tracking-tight tabular-nums">{money(expected)}</p>
            {finalCash == null && <p className="text-sm text-muted-foreground">Lo que debe haber ahora</p>}
          </div>

          {finalCash != null && <CashCheck diff={diff} counted={finalCash} />}

          <InnerCard className="px-4 py-1.5 text-sm">
            <CashLine label="Fondo inicial" value={data.register.initialCash} />
            <CashLine sign="+" label="Ventas en efectivo" value={data.sales.cash} />
            <CashLine sign="+" label="Propinas en efectivo" value={data.tips.cash} />
            <CashLine sign="+" label="Depósitos" value={data.movements.deposits.total} />
            <CashLine sign="−" label="Sangrías" value={data.movements.withdrawals.total} />
          </InnerCard>

          {movements.length > 0 && (
            <InnerCard className="px-4 text-sm">
              <button
                type="button"
                onClick={() => setShowMovements((v) => !v)}
                className="flex w-full items-center gap-2 py-3 text-left"
              >
                <span className="font-semibold">Movimientos</span>
                <span className="text-xs font-semibold text-muted-foreground">{movements.length}</span>
                <CaretDown className={cn("ml-auto size-3.5 text-muted-foreground transition-transform", showMovements && "rotate-180")} />
              </button>
              {showMovements &&
                movements.map((m) => (
                  <div key={(m.deposit ? "d" : "w") + m.id} className="flex items-baseline justify-between gap-3 border-t py-2.5">
                    <div className="min-w-0">
                      <p className="truncate">{m.description || (m.deposit ? "Depósito" : "Sangría")}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.deposit ? "Depósito" : "Sangría"} · {formatTime(m.createdAt)}
                      </p>
                    </div>
                    <span className="tabular-nums">
                      {m.deposit ? "+" : "−"}
                      {money(m.amount)}
                    </span>
                  </div>
                ))}
            </InnerCard>
          )}

          {[["Nota de apertura", data.notes.opening], ["Nota de cierre", data.notes.closure]]
            .filter(([, t]) => t)
            .map(([title, text]) => (
              <div key={title} className="text-sm">
                <p className="text-xs text-muted-foreground">{title}</p>
                <p className="whitespace-pre-line">{text}</p>
              </div>
            ))}
        </div>

        <div className="space-y-2.5 border-t p-4">
          <div className="flex gap-2">
            <Button variant="outline" size="icon" className="size-11 shrink-0 rounded-full" onClick={onReload} disabled={loading} aria-label="Actualizar">
              <ArrowClockwise className={cn("size-4", loading && "animate-spin")} />
            </Button>
            <Button className="h-11 flex-1 rounded-full" onClick={print} disabled={printing}>
              <Printer className="mr-2 size-4" weight="fill" />
              {printing ? "Imprimiendo…" : "Imprimir corte"}
            </Button>
          </div>
          {isOpen && onCloseRegister && (
            <Button variant="destructive" className="h-11 w-full rounded-full" onClick={onCloseRegister}>
              <LockSimple className="mr-2 size-4" weight="fill" />
              Cerrar caja
            </Button>
          )}
        </div>
      </Panel>
    </div>
  );
}

function CashLine({ sign = "", label, value }: { sign?: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 py-2">
      <span className="w-3.5 text-muted-foreground">{sign}</span>
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("ml-auto tabular-nums", value === 0 && "text-muted-foreground/50")}>{money(value)}</span>
    </div>
  );
}

export function CashCheck({ diff, counted }: { diff: number; counted?: number }) {
  const squared = Math.abs(diff) < 0.5;
  const color = squared ? METHOD_COLORS.cash : diff < 0 ? "#dc2626" : "#ea580c";
  const text = squared ? "Cuadra" : diff < 0 ? `Faltan ${money(-diff)}` : `Sobran ${money(diff)}`;
  return (
    <div
      className="flex items-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold"
      style={{ color, backgroundColor: `${color}14`, borderColor: `${color}4d` }}
    >
      {squared ? <CheckCircle className="size-4" weight="fill" /> : <WarningCircle className="size-4" weight="fill" />}
      {text}
      {counted != null && <span className="ml-auto text-xs font-normal text-muted-foreground">Contado {money(counted)}</span>}
    </div>
  );
}

function duration(from: string, to: string | null) {
  const minutes = Math.max(Math.floor(((to ? new Date(to) : new Date()).getTime() - new Date(from).getTime()) / 60000), 0);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}

