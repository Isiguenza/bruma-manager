"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CaretRight, CheckCircle, Spinner, WarningCircle } from "@phosphor-icons/react";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/page-header";
import type { CashRegister } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatDayLong, formatTime } from "@/lib/time";
import { CorteView } from "../_components/corte-view";
import { type CorteData, METHOD_COLORS, money } from "../_components/shared";

// Igual que el servidor al cerrar (CASH_TOLERANCE, default 10).
const TOLERANCE = 10;

/**
 * Historial de cortes. La lista usa lo que se guardó al cerrar; el detalle es
 * la MISMA pantalla de Corte que la Caja y el iPad (recalculada en vivo desde
 * las órdenes, así que refleja correcciones posteriores).
 */
export default function CashRegisterHistoryPage() {
  const [registers, setRegisters] = useState<CashRegister[]>([]);
  const [loading, setLoading] = useState(true);
  const [employeeNames, setEmployeeNames] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<CashRegister | null>(null);

  useEffect(() => {
    Promise.all([fetch("/api/cash-register?status=closed"), fetch("/api/employees")])
      .then(async ([r, e]) => {
        if (r.ok) setRegisters(await r.json());
        if (e.ok) {
          const employees = await e.json();
          setEmployeeNames(Object.fromEntries(employees.map((x: { id: string; name: string }) => [x.id, x.name])));
        }
      })
      .catch(() => console.error("Error fetching registers"))
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const diffs = registers.map((r) => parseFloat(r.difference || "0"));
    const squared = diffs.filter((d) => Math.abs(d) <= TOLERANCE).length;
    const short = diffs.filter((d) => d < -TOLERANCE);
    return {
      sales: registers.reduce((s, r) => s + parseFloat(r.totalSales || "0"), 0),
      squared,
      shortCount: short.length,
      shortTotal: short.reduce((s, d) => s + d, 0),
      overCount: diffs.filter((d) => d > TOLERANCE).length,
    };
  }, [registers]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Cortes" description={`${registers.length} cortes cerrados`} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Ventas registradas" value={money(stats.sales, 0)} detail={`${registers.length} turnos`} />
        <Kpi
          label="Cuadraron"
          value={String(stats.squared)}
          detail={registers.length ? `${Math.round((stats.squared / registers.length) * 100)}% de los cortes (±${money(TOLERANCE, 0)})` : "—"}
        />
        <Kpi
          label="Con faltante"
          value={String(stats.shortCount)}
          detail={stats.shortCount ? `${money(-stats.shortTotal, 0)} en total` : "Ninguno"}
          tone={stats.shortCount ? "bad" : undefined}
        />
        <Kpi label="Con sobrante" value={String(stats.overCount)} detail="Arriba de la tolerancia" />
      </div>

      <Card className="overflow-hidden p-0">
        {registers.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Aún no hay cortes cerrados</p>
        ) : (
          <div className="divide-y">
            <div className="hidden grid-cols-[1.4fr_1.2fr_1fr_1fr_1.2fr_24px] gap-4 bg-muted/40 px-5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground md:grid">
              <span>Día</span>
              <span>Horario</span>
              <span className="text-right">Ventas</span>
              <span className="text-right">Contado</span>
              <span className="text-right">Cuadre</span>
              <span />
            </div>
            {registers.map((reg) => {
              const diff = parseFloat(reg.difference || "0");
              return (
                <button
                  key={reg.id}
                  type="button"
                  onClick={() => setSelected(reg)}
                  className="group grid w-full grid-cols-2 items-center gap-x-4 gap-y-1 px-5 py-3.5 text-left text-sm transition-colors hover:bg-muted/40 md:grid-cols-[1.4fr_1.2fr_1fr_1fr_1.2fr_24px]"
                >
                  <span>
                    <span className="block font-medium capitalize">{formatDayLong(reg.openedAt)}</span>
                    {reg.openedBy && employeeNames[reg.openedBy] && (
                      <span className="block text-xs text-muted-foreground">Abrió {employeeNames[reg.openedBy]}</span>
                    )}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {formatTime(reg.openedAt)} – {reg.closedAt ? formatTime(reg.closedAt) : "—"}
                  </span>
                  <span className="font-medium tabular-nums md:text-right">{money(parseFloat(reg.totalSales || "0"))}</span>
                  <span className="text-muted-foreground tabular-nums md:text-right">{reg.finalCash ? money(parseFloat(reg.finalCash)) : "—"}</span>
                  <span className="md:text-right">
                    <DiffBadge diff={diff} />
                  </span>
                  <CaretRight className="hidden size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 md:block" />
                </button>
              );
            })}
          </div>
        )}
      </Card>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[92vh] w-[min(1200px,calc(100vw-2rem))] max-w-none overflow-y-auto sm:max-w-none">
          <DialogHeader>
            <DialogTitle className="capitalize">{selected ? `Corte del ${formatDayLong(selected.openedAt)}` : "Corte"}</DialogTitle>
            <DialogDescription>Recalculado en vivo desde las órdenes: incluye correcciones hechas después del cierre.</DialogDescription>
          </DialogHeader>
          {selected && <CorteLoader registerId={selected.id} employeeNames={employeeNames} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CorteLoader({ registerId, employeeNames }: { registerId: string; employeeNames: Record<string, string> }) {
  const [data, setData] = useState<CorteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [printedBy, setPrintedBy] = useState<string | undefined>();

  const fetchCorte = useCallback(() => {
    fetch(`/api/cash-register/${registerId}/corte`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        setData(d);
        setError(false);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [registerId]);

  const reload = () => {
    setLoading(true);
    fetchCorte();
  };

  useEffect(() => {
    fetchCorte();
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => setPrintedBy(u?.name))
      .catch(() => {});
  }, [fetchCorte]);

  if (error) return <p className="py-12 text-center text-sm text-muted-foreground">No se pudo cargar el corte.</p>;
  if (!data)
    return (
      <div className="flex h-48 items-center justify-center">
        <Spinner className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  return <CorteView data={data} loading={loading} onReload={reload} employeeNames={employeeNames} printedBy={printedBy} />;
}

function DiffBadge({ diff }: { diff: number }) {
  const squared = Math.abs(diff) <= TOLERANCE;
  const color = squared ? METHOD_COLORS.cash : diff < 0 ? "#dc2626" : "#ea580c";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums"
      style={{ color, backgroundColor: `${color}1a` }}
    >
      {squared ? <CheckCircle className="size-3.5" weight="fill" /> : <WarningCircle className="size-3.5" weight="fill" />}
      {squared ? (Math.abs(diff) < 0.5 ? "Cuadra" : `Cuadra (${diff > 0 ? "+" : "−"}${money(Math.abs(diff), 0)})`) : diff < 0 ? `Faltan ${money(-diff)}` : `Sobran ${money(diff)}`}
    </span>
  );
}

function Kpi({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: "bad" }) {
  return (
    <Card className="gap-2 py-5">
      <CardContent className="space-y-2 px-5">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className={cn("text-3xl font-semibold tracking-tight tabular-nums", tone === "bad" && "text-red-600 dark:text-red-400")}>{value}</p>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

