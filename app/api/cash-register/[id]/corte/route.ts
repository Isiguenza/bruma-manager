import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cashRegisters, orders, cashRegisterTransactions, orderPayments } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

// Terminal física (MercadoPago).
const COMMISSION_RATE = 0.035;
const COMMISSION_WITH_IVA = COMMISSION_RATE * 1.16; // 4.06%
// Pedidos en línea (Stripe): 3.6% + $3.00 MXN por transacción, +IVA.
const ONLINE_PCT_RATE = 0.036;
const ONLINE_FIXED_FEE = 3.0;
const IVA = 1.16;

function calculateNetAmount(grossAmount: number): number {
  return grossAmount - (grossAmount * COMMISSION_WITH_IVA);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get cash register
    const register = await db.query.cashRegisters.findFirst({
      where: eq(cashRegisters.id, id),
      with: {
        transactions: {
          orderBy: (transactions, { asc }) => [asc(transactions.createdAt)],
        },
      },
    });

    if (!register) {
      return NextResponse.json({ error: "Caja no encontrada" }, { status: 404 });
    }

    // Get all orders for this register
    const registerOrders = await db.select()
      .from(orders)
      .where(eq(orders.cashRegisterId, id));

    // Get order IDs for split payment queries
    const orderIds = registerOrders.map(o => o.id);

    // Calculate sales and tips by method
    let cashSales = 0;
    let cardSales = 0;
    let transferSales = 0;
    let platformDeliverySales = 0;
    // Pedidos en línea (Stripe) — sección propia, con su propia comisión.
    let onlineSales = 0;

    let cashTips = 0;
    let cardTips = 0;
    let transferTips = 0;
    let onlineTips = 0;

    let totalOrders = 0;
    let cashOrders = 0;
    let cardOrders = 0;
    let transferOrders = 0;
    let onlineOrders = 0;
    let splitOrdersCount = 0;

    // Card commission calculation — solo terminal física.
    let cardCommission = 0;
    let cardTipCommission = 0;
    // Online commission — 3.6% + $3 MXN por transacción, +IVA.
    let onlineCommissionSales = 0;
    let onlineCommissionTips = 0;

    // Split payments processing
    const splitPaymentsByOrder: Record<string, typeof orderPayments.$inferSelect[]> = {};

    if (orderIds.length > 0) {
      // Query split payments for all orders in this register
      for (const orderId of orderIds) {
        const payments = await db.select()
          .from(orderPayments)
          .where(eq(orderPayments.orderId, orderId));
        if (payments.length > 0) {
          splitPaymentsByOrder[orderId] = payments;
        }
      }
    }

    for (const order of registerOrders) {
      if (order.paymentStatus !== "paid") continue;

      totalOrders++;
      const orderTip = parseFloat(order.tip || "0");
      const orderTotal = parseFloat(order.total || "0");
      const orderSubtotal = parseFloat(order.subtotal || "0") || (orderTotal - orderTip);

      // Check if this order has split payments
      const orderSplitPayments = splitPaymentsByOrder[order.id] || [];

      if (orderSplitPayments.length > 0) {
        splitOrdersCount++;
        // Process split payments
        for (const payment of orderSplitPayments) {
          const amount = parseFloat(payment.amount || "0");
          const tip = parseFloat(payment.tip || "0");
          const method = payment.paymentMethod;
          const tipMethod = payment.tipPaymentMethod || method;

          if (method === "cash") {
            cashSales += amount;
          } else if (method === "card" || method === "terminal_mercadopago") {
            cardSales += amount;
            cardCommission += amount * COMMISSION_WITH_IVA;
          } else if (method === "transfer") {
            transferSales += amount;
          } else if (method === "platform_delivery") {
            platformDeliverySales += amount * 0.73;
          } else if (method === "online") {
            onlineSales += amount;
            onlineOrders++;
            onlineCommissionSales += (amount * ONLINE_PCT_RATE + ONLINE_FIXED_FEE) * IVA;
          }

          if (tipMethod === "cash") {
            cashTips += tip;
          } else if (tipMethod === "card" || tipMethod === "terminal_mercadopago") {
            cardTips += tip;
            cardTipCommission += tip * COMMISSION_WITH_IVA;
          } else if (tipMethod === "transfer") {
            transferTips += tip;
          } else if (tipMethod === "online") {
            onlineTips += tip;
            onlineCommissionTips += tip * ONLINE_PCT_RATE * IVA;
          }
        }
      } else {
        // Regular single payment order
        const method = order.paymentMethod;
        const tipMethod = order.tipPaymentMethod || method;

        if (method === "cash") {
          cashSales += orderSubtotal;
          cashOrders++;
        } else if (method === "card" || method === "terminal_mercadopago") {
          cardSales += orderSubtotal;
          cardOrders++;
          cardCommission += orderSubtotal * COMMISSION_WITH_IVA;
        } else if (method === "transfer") {
          transferSales += orderSubtotal;
          transferOrders++;
        } else if (method === "platform_delivery") {
          platformDeliverySales += orderSubtotal * 0.73;
        } else if (method === "online") {
          onlineSales += orderSubtotal;
          onlineOrders++;
          // El fee fijo ($3) se carga una vez por transacción, sobre el renglón de venta.
          onlineCommissionSales += (orderSubtotal * ONLINE_PCT_RATE + ONLINE_FIXED_FEE) * IVA;
        }

        if (tipMethod === "cash") {
          cashTips += orderTip;
        } else if (tipMethod === "card" || tipMethod === "terminal_mercadopago") {
          cardTips += orderTip;
          cardTipCommission += orderTip * COMMISSION_WITH_IVA;
        } else if (tipMethod === "transfer") {
          transferTips += orderTip;
        } else if (tipMethod === "online") {
          onlineTips += orderTip;
          onlineCommissionTips += orderTip * ONLINE_PCT_RATE * IVA;
        }
      }
    }

    // Calculate net amounts
    const netCardSales = calculateNetAmount(cardSales);
    const netCardTips = calculateNetAmount(cardTips);
    const totalCommission = cardCommission + cardTipCommission;

    const netOnlineSales = onlineSales - onlineCommissionSales;
    const netOnlineTips = onlineTips - onlineCommissionTips;
    const onlineCommissionTotal = onlineCommissionSales + onlineCommissionTips;

    // Get deposits and withdrawals from transactions
    const deposits = register.transactions
      .filter(t => t.type === "deposit")
      .map(t => ({
        id: t.id,
        amount: parseFloat(t.amount),
        description: t.description,
        createdAt: t.createdAt,
      }));

    const withdrawals = register.transactions
      .filter(t => t.type === "withdrawal")
      .map(t => ({
        id: t.id,
        amount: parseFloat(t.amount),
        description: t.description,
        createdAt: t.createdAt,
      }));

    const totalDeposits = deposits.reduce((sum, d) => sum + d.amount, 0);
    const totalWithdrawals = withdrawals.reduce((sum, w) => sum + w.amount, 0);

    // Calculate expected cash
    const expectedCash = cashSales + cashTips + totalDeposits - totalWithdrawals + parseFloat(register.initialCash);

    // Total sales and tips
    const totalSales = cashSales + cardSales + transferSales + platformDeliverySales + onlineSales;
    const totalTips = cashTips + cardTips + transferTips + onlineTips;
    const totalNetCard = netCardSales + netCardTips;

    const corte = {
      register: {
        id: register.id,
        openedAt: register.openedAt,
        closedAt: register.closedAt,
        openedBy: register.openedBy,
        closedBy: register.closedBy,
        status: register.status,
        initialCash: parseFloat(register.initialCash),
      },
      sales: {
        total: totalSales,
        cash: cashSales,
        card: cardSales,
        transfer: transferSales,
        online: onlineSales,
        platformDelivery: platformDeliverySales,
        netCard: netCardSales,
        netOnline: netOnlineSales,
      },
      tips: {
        total: totalTips,
        cash: cashTips,
        card: cardTips,
        transfer: transferTips,
        online: onlineTips,
        netCard: netCardTips,
        netOnline: netOnlineTips,
      },
      commissions: {
        rate: COMMISSION_RATE,
        rateWithIVA: COMMISSION_WITH_IVA,
        total: totalCommission,
        salesCommission: cardCommission,
        tipsCommission: cardTipCommission,
        online: {
          percentRate: ONLINE_PCT_RATE,
          fixedFee: ONLINE_FIXED_FEE,
          rateWithIVA: ONLINE_PCT_RATE * IVA,
          fixedFeeWithIVA: ONLINE_FIXED_FEE * IVA,
          total: onlineCommissionTotal,
          salesCommission: onlineCommissionSales,
          tipsCommission: onlineCommissionTips,
        },
      },
      movements: {
        deposits: {
          count: deposits.length,
          total: totalDeposits,
          items: deposits,
        },
        withdrawals: {
          count: withdrawals.length,
          total: totalWithdrawals,
          items: withdrawals,
        },
      },
      summary: {
        totalOrders,
        cashOrders,
        cardOrders,
        transferOrders,
        onlineOrders,
        splitOrders: splitOrdersCount,
        expectedCash,
        finalCash: register.finalCash ? parseFloat(register.finalCash) : null,
        difference: register.difference ? parseFloat(register.difference) : null,
      },
      notes: {
        opening: register.notes,
        closure: register.closureNotes,
      },
    };

    return NextResponse.json(corte);
  } catch (error) {
    console.error("Error generando corte:", error);
    return NextResponse.json(
      { error: "Error generando corte" },
      { status: 500 }
    );
  }
}
