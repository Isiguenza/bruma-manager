"use client";

import { useEffect, useState } from "react";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Printer, Spinner } from "@phosphor-icons/react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";

// Espejo del payload de GET /api/cash-register/:id/corte (el MISMO que el POS
// manda a /print-corte). El corte se recalcula en vivo desde `orders`, así que
// esto funciona igual para una caja abierta que para una cerrada hace meses.
type Movement = {
  id: string;
  amount: number;
  description: string | null;
  createdAt: string;
};

export type CorteData = {
  register: {
    id: string;
    openedAt: string;
    closedAt: string | null;
    openedBy: string | null;
    closedBy: string | null;
    status: string;
    initialCash: number;
  };
  sales: {
    total: number;
    cash: number;
    card: number;
    transfer: number;
    online: number;
    platformDelivery: number;
    netCard: number;
    netOnline: number;
  };
  tips: {
    total: number;
    cash: number;
    card: number;
    transfer: number;
    online: number;
    netCard: number;
    netOnline: number;
  };
  commissions: {
    rate: number;
    rateWithIVA: number;
    total: number;
    salesCommission: number;
    tipsCommission: number;
    online: {
      percentRate: number;
      fixedFee: number;
      rateWithIVA: number;
      fixedFeeWithIVA: number;
      total: number;
      salesCommission: number;
      tipsCommission: number;
    };
  };
  movements: {
    deposits: { count: number; total: number; items: Movement[] };
    withdrawals: { count: number; total: number; items: Movement[] };
  };
  summary: {
    totalOrders: number;
    cashOrders: number;
    cardOrders: number;
    transferOrders: number;
    onlineOrders: number;
    splitOrders: number;
    expectedCash: number;
    finalCash: number | null;
    difference: number | null;
  };
  notes: { opening: string | null; closure: string | null };
};

const money = (v: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(v);

function Row({
  label,
  value,
  muted,
  bold,
  className,
}: {
  label: string;
  value: string;
  muted?: boolean;
  bold?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`flex justify-between text-sm ${bold ? "font-semibold" : ""} ${
        muted ? "text-muted-foreground" : ""
      } ${className ?? ""}`}
    >
      <span className={muted ? "pl-4" : ""}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <Separator />
      <div className="space-y-1 pt-1">{children}</div>
    </div>
  );
}

export function CorteDetail({ registerId }: { registerId: string }) {
  const [data, setData] = useState<CorteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/cash-register/${registerId}/corte`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("No se pudo cargar el corte");
        return res.json();
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setError("No se pudo cargar el corte de esta caja");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [registerId]);

  // Reimpresión: mismo body que CorteViewModel.printCorte() del POS, para que
  // el papel salga idéntico al del día del cierre.
  async function handleReprint() {
    if (!data) return;
    setPrinting(true);
    try {
      const printServerUrl =
        process.env.NEXT_PUBLIC_PRINT_SERVER_URL || "http://192.168.0.160:3001";
      const res = await fetch(`${printServerUrl}/print-corte`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sales: data.sales,
          tips: data.tips,
          commissions: {
            rateWithIVA: data.commissions.rateWithIVA,
            total: data.commissions.total,
            online: {
              rateWithIVA: data.commissions.online.rateWithIVA,
              fixedFeeWithIVA: data.commissions.online.fixedFeeWithIVA,
              total: data.commissions.online.total,
            },
          },
          movements: {
            deposits: {
              total: data.movements.deposits.total,
              count: data.movements.deposits.count,
            },
            withdrawals: {
              total: data.movements.withdrawals.total,
              count: data.movements.withdrawals.count,
            },
          },
          summary: {
            totalOrders: data.summary.totalOrders,
            splitOrders: data.summary.splitOrders,
            expectedCash: data.summary.expectedCash,
            finalCash: data.summary.finalCash ?? 0,
          },
        }),
      });
      if (!res.ok) throw new Error("print failed");
      toast.success("Corte reimpreso");
    } catch {
      toast.error("No se pudo reimprimir (¿impresora en red?)");
    } finally {
      setPrinting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Spinner className="mr-2 size-5 animate-spin" />
        Calculando corte...
      </div>
    );
  }

  if (error || !data) {
    return <p className="py-6 text-center text-sm text-destructive">{error}</p>;
  }

  const { sales, tips, commissions, movements, summary, notes, register } = data;

  const hasNet =
    sales.netCard !== sales.card || sales.netOnline !== sales.online;
  const totalNetSales =
    sales.cash + sales.transfer + sales.netCard + sales.netOnline;
  const difference =
    summary.finalCash !== null ? summary.finalCash - summary.expectedCash : null;

  return (
    <div className="space-y-5">
      <Section title="Caja">
        <Row
          label="Apertura"
          value={format(new Date(register.openedAt), "dd MMM yyyy HH:mm", { locale: es })}
        />
        <Row
          label="Cierre"
          value={
            register.closedAt
              ? format(new Date(register.closedAt), "dd MMM yyyy HH:mm", { locale: es })
              : "—"
          }
        />
        <Row label="Efectivo inicial" value={money(register.initialCash)} />
      </Section>

      <Section title="Ventas">
        {sales.cash > 0 && <Row label="Efectivo" value={money(sales.cash)} />}
        {sales.card > 0 && (
          <>
            <Row label="Tarjeta" value={money(sales.card)} />
            {sales.netCard !== sales.card && (
              <Row label="Neto real" value={money(sales.netCard)} muted />
            )}
          </>
        )}
        {sales.transfer > 0 && <Row label="Transferencia" value={money(sales.transfer)} />}
        {sales.online > 0 && (
          <>
            <Row label="Online" value={money(sales.online)} />
            {sales.netOnline !== sales.online && (
              <Row label="Neto real" value={money(sales.netOnline)} muted />
            )}
          </>
        )}
        {sales.platformDelivery > 0 && (
          <Row label="Plataformas (neto)" value={money(sales.platformDelivery)} />
        )}
        <Separator className="my-1" />
        <Row label="Total bruto" value={money(sales.total)} bold />
        {hasNet && <Row label="Total neto" value={money(totalNetSales)} bold />}
      </Section>

      <Section title="Propinas">
        {tips.cash > 0 && <Row label="Efectivo" value={money(tips.cash)} />}
        {tips.card > 0 && (
          <>
            <Row label="Tarjeta" value={money(tips.card)} />
            {tips.netCard !== tips.card && (
              <Row label="Neto real" value={money(tips.netCard)} muted />
            )}
          </>
        )}
        {tips.transfer > 0 && <Row label="Transferencia" value={money(tips.transfer)} />}
        {tips.online > 0 && (
          <>
            <Row label="Online" value={money(tips.online)} />
            {tips.netOnline !== tips.online && (
              <Row label="Neto real" value={money(tips.netOnline)} muted />
            )}
          </>
        )}
        {tips.total === 0 && <Row label="Sin propinas" value={money(0)} muted />}
        <Separator className="my-1" />
        <Row label="Total bruto" value={money(tips.total)} bold />
      </Section>

      {commissions.total > 0 && (
        <Section title={`Comisiones bancarias — ${(commissions.rateWithIVA * 100).toFixed(2)}%`}>
          <Row label="Sobre ventas" value={`-${money(commissions.salesCommission)}`} />
          <Row label="Sobre propinas" value={`-${money(commissions.tipsCommission)}`} />
          <Separator className="my-1" />
          <Row label="Total" value={`-${money(commissions.total)}`} bold />
        </Section>
      )}

      {commissions.online.total > 0 && (
        <Section
          title={`Comisión pedidos en línea — ${(commissions.online.rateWithIVA * 100).toFixed(
            2
          )}% + ${money(commissions.online.fixedFeeWithIVA)}/op.`}
        >
          <Row label="Sobre ventas" value={`-${money(commissions.online.salesCommission)}`} />
          <Row label="Sobre propinas" value={`-${money(commissions.online.tipsCommission)}`} />
          <Separator className="my-1" />
          <Row label="Total" value={`-${money(commissions.online.total)}`} bold />
        </Section>
      )}

      <Section title="Movimientos de caja">
        <Row
          label={`Depósitos (${movements.deposits.count})`}
          value={money(movements.deposits.total)}
        />
        {movements.deposits.items.map((d) => (
          <Row
            key={d.id}
            label={`${format(new Date(d.createdAt), "HH:mm")} · ${d.description || "Sin nota"}`}
            value={money(d.amount)}
            muted
          />
        ))}
        <Row
          label={`Sangrías (${movements.withdrawals.count})`}
          value={`-${money(movements.withdrawals.total)}`}
        />
        {movements.withdrawals.items.map((w) => (
          <Row
            key={w.id}
            label={`${format(new Date(w.createdAt), "HH:mm")} · ${w.description || "Sin nota"}`}
            value={`-${money(w.amount)}`}
            muted
          />
        ))}
      </Section>

      <Section title="Resumen">
        <Row label="Órdenes" value={String(summary.totalOrders)} />
        {summary.splitOrders > 0 && (
          <Row label="Pagos divididos" value={String(summary.splitOrders)} />
        )}
        <Row label="Efectivo esperado" value={money(summary.expectedCash)} />
        {summary.finalCash !== null && (
          <Row label="Efectivo contado" value={money(summary.finalCash)} />
        )}
        {difference !== null && (
          <>
            <Separator className="my-1" />
            <div className="flex justify-between text-sm font-bold">
              <span>{difference >= 0 ? "Diferencia" : "Faltante"}</span>
              <span
                className={`tabular-nums ${
                  difference >= 0 ? "text-green-600" : "text-destructive"
                }`}
              >
                {difference >= 0 ? "+" : "-"}
                {money(Math.abs(difference))}
              </span>
            </div>
          </>
        )}
      </Section>

      {(notes.opening || notes.closure) && (
        <Section title="Notas">
          {notes.opening && (
            <div>
              <p className="text-xs text-muted-foreground">Apertura</p>
              <p className="text-sm">{notes.opening}</p>
            </div>
          )}
          {notes.closure && (
            <div>
              <p className="text-xs text-muted-foreground">Cierre</p>
              <p className="text-sm">{notes.closure}</p>
            </div>
          )}
        </Section>
      )}

      <Button
        variant="outline"
        className="w-full"
        onClick={handleReprint}
        disabled={printing}
      >
        {printing ? (
          <Spinner className="mr-2 size-4 animate-spin" />
        ) : (
          <Printer className="mr-2 size-4" />
        )}
        Reimprimir corte
      </Button>
    </div>
  );
}
