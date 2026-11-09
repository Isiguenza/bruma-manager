// Totales de una caja con las MISMAS reglas que el Corte en vivo
// (`routes/cash-register.ts` GET /:id/corte y su espejo Next): venta =
// subtotal sin propina, pagos divididos por `order_payments`, y propinas por el
// método con que se dejaron (una propina con tarjeta sobre una cuenta en efectivo
// NO entra al efectivo esperado). Lo usan el cierre de caja y la lista de cortes.
// Espejo a mano: `lib/cash-register/register-totals.ts` (raíz, dashboard).

export type TotalsOrder = {
  id: string;
  paymentStatus: string | null;
  isPractice: boolean | null;
  paymentMethod: string | null;
  tipPaymentMethod: string | null;
  subtotal: string | null;
  total: string | null;
  tip: string | null;
};

export type TotalsPayment = {
  orderId: string;
  paymentMethod: string | null;
  tipPaymentMethod: string | null;
  amount: string | null;
  tip: string | null;
};

export type TotalsTransaction = { type: string; amount: string };

const num = (v: string | null | undefined) => parseFloat(v || "0") || 0;
const isCard = (m: string | null) => m === "card" || m === "terminal_mercadopago";

export function registerTotals(
  initialCash: number,
  orders: TotalsOrder[],
  payments: TotalsPayment[],
  transactions: TotalsTransaction[]
) {
  const paymentsByOrder = new Map<string, TotalsPayment[]>();
  for (const p of payments) paymentsByOrder.set(p.orderId, [...(paymentsByOrder.get(p.orderId) ?? []), p]);

  let cashSales = 0, cardSales = 0, transferSales = 0, platformSales = 0, onlineSales = 0;
  let cashTips = 0, totalTips = 0;

  const addSale = (method: string | null, amount: number) => {
    if (method === "cash") cashSales += amount;
    else if (isCard(method)) cardSales += amount;
    else if (method === "transfer") transferSales += amount;
    else if (method === "platform_delivery") platformSales += amount * 0.73;
    else if (method === "online") onlineSales += amount;
  };
  const addTip = (method: string | null, tip: number) => {
    if (method === "cash") cashTips += tip;
    if (method === "cash" || isCard(method) || method === "transfer" || method === "online") totalTips += tip;
  };

  for (const order of orders) {
    if (order.paymentStatus !== "paid" || order.isPractice) continue;
    const split = paymentsByOrder.get(order.id) ?? [];
    if (split.length > 0) {
      for (const p of split) {
        addSale(p.paymentMethod, num(p.amount));
        addTip(p.tipPaymentMethod || p.paymentMethod, num(p.tip));
      }
    } else {
      const tip = num(order.tip);
      addSale(order.paymentMethod, num(order.subtotal) || num(order.total) - tip);
      addTip(order.tipPaymentMethod || order.paymentMethod, tip);
    }
  }

  const deposits = transactions.filter((t) => t.type === "deposit").reduce((s, t) => s + num(t.amount), 0);
  const withdrawals = transactions.filter((t) => t.type === "withdrawal").reduce((s, t) => s + num(t.amount), 0);

  return {
    cashSales,
    cardSales,
    transferSales,
    totalSales: cashSales + cardSales + transferSales + platformSales + onlineSales,
    cashTips,
    totalTips,
    deposits,
    withdrawals,
    expectedCash: initialCash + cashSales + cashTips + deposits - withdrawals,
  };
}
