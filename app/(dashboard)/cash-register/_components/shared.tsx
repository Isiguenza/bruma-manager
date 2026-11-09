"use client";

import { cn } from "@/lib/utils";
/** Respuesta de `GET /api/cash-register/:id/corte` (misma forma que la del api-server que usa el iPad). */
type CorteMovement = {
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
    deposits: { count: number; total: number; items: CorteMovement[] };
    withdrawals: { count: number; total: number; items: CorteMovement[] };
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

// Mismos tonos que los botones de método del cobro en Bruma POS (PaymentView):
// la Caja web y la del iPad tienen que leerse igual.
export const METHOD_COLORS = {
  cash: "#008932",
  card: "#1E6EF4",
  transfer: "#564ADE",
  online: "#14b8a6",
  platform: "#f97316",
} as const;

export const money = (n: number, decimals = 2) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n || 0);

export const percent = (rate: number) =>
  `${(rate * 100).toLocaleString("es-MX", { maximumFractionDigits: 2 })}%`;

export const printServerUrl = () =>
  process.env.NEXT_PUBLIC_PRINT_SERVER_URL || "http://192.168.0.160:3001";

/** Efectivo que debe haber: misma fórmula que `CorteViewModel.cashExpected` del POS. */
export const cashExpected = (d: CorteData) =>
  d.sales.cash + d.tips.cash + d.movements.deposits.total - d.movements.withdrawals.total + d.register.initialCash;

/** Ventas netas: misma fórmula que `CorteViewModel.totalNetSales`. */
export const netSales = (d: CorteData) => d.sales.cash + d.sales.transfer + d.sales.netCard + d.sales.netOnline;

/** Propinas netas: misma fórmula que `CorteViewModel.totalNetTips`. */
export const netTips = (d: CorteData) => d.tips.cash + d.tips.transfer + d.tips.netCard + d.tips.netOnline;

/**
 * Body de `/print-corte`: el MISMO que arma `CorteViewModel.printCorte()` en el
 * iPad, para que el ticket salga idéntico se imprima desde donde se imprima.
 */
export function buildCortePrintBody(d: CorteData, opts: { openedByName?: string; printedBy?: string }) {
  const items = (m: CorteData["movements"]["deposits"]) =>
    m.items.map((i) => ({ amount: i.amount, description: i.description ?? "", createdAt: i.createdAt }));
  return {
    register: {
      openedAt: d.register.openedAt,
      initialCash: d.register.initialCash,
      ...(opts.openedByName ? { openedByName: opts.openedByName } : {}),
    },
    sales: {
      total: d.sales.total,
      cash: d.sales.cash,
      card: d.sales.card,
      transfer: d.sales.transfer,
      online: d.sales.online,
      netCard: d.sales.netCard,
      netOnline: d.sales.netOnline,
    },
    tips: {
      total: d.tips.total,
      cash: d.tips.cash,
      card: d.tips.card,
      transfer: d.tips.transfer,
      online: d.tips.online,
      netCard: d.tips.netCard,
      netOnline: d.tips.netOnline,
    },
    commissions: {
      rateWithIVA: d.commissions.rateWithIVA,
      total: d.commissions.total,
      online: {
        rateWithIVA: d.commissions.online.rateWithIVA,
        fixedFeeWithIVA: d.commissions.online.fixedFeeWithIVA,
        total: d.commissions.online.total,
      },
    },
    movements: {
      deposits: { total: d.movements.deposits.total, count: d.movements.deposits.count, items: items(d.movements.deposits) },
      withdrawals: { total: d.movements.withdrawals.total, count: d.movements.withdrawals.count, items: items(d.movements.withdrawals) },
    },
    summary: {
      totalOrders: d.summary.totalOrders,
      splitOrders: d.summary.splitOrders,
      expectedCash: d.summary.expectedCash,
      finalCash: d.summary.finalCash ?? 0,
    },
    ...(opts.printedBy ? { printedBy: opts.printedBy } : {}),
  };
}

/** Panel de columna — mismo papel que las dos columnas de la Caja del iPad. */
export function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("rounded-2xl border bg-muted/30", className)}>{children}</div>;
}

/** Tarjeta interna (FlatCard del POS). */
export function InnerCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("rounded-xl border bg-background", className)}>{children}</div>;
}

/** "VENTAS NETAS" — eyebrow en mayúsculas con tracking, como en el POS. */
export function Eyebrow({ className, children }: { className?: string; children: React.ReactNode }) {
  return <p className={cn("text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground", className)}>{children}</p>;
}

/** Cifra grande redondeada (el "TOTAL" del cobro). */
export function BigNumber({ className, children }: { className?: string; children: React.ReactNode }) {
  return <p className={cn("text-5xl font-extrabold tracking-tight tabular-nums", className)}>{children}</p>;
}
