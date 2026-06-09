import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cashRegisters, orders, cashRegisterTransactions, orderPayments } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

const COMMISSION_RATE = 0.035;
const COMMISSION_WITH_IVA = COMMISSION_RATE * 1.16; // 4.06%

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

    // Get all split payments for orders in this register
    const splitPayments = await db.select()
      .from(orderPayments)
      .where(
        eq(orderPayments.orderId, registerOrders.map(o => o.id).join(','))
      );

    // Actually we need to query split payments per order - let me do it differently
    // We'll get order IDs and then query split payments
    const orderIds = registerOrders.map(o => o.id);

    // Calculate sales and tips by method
    let cashSales = 0;
    let cardSales = 0;
    let transferSales = 0;
    let platformDeliverySales = 0;

    let cashTips = 0;
    let cardTips = 0;
    let transferTips = 0;

    let totalOrders = 0;
    let cashOrders = 0;
    let cardOrders = 0;
    let transferOrders = 0;
    let splitOrdersCount = 0;

    // Card commission calculation
    let cardCommission = 0;
    let cardTipCommission = 0;

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
      const orderSubtotal = parseFloat(order.subtotal || "0");
      const orderTip = parseFloat(order.tip || "0");
      const orderTotal = parseFloat(order.total || "0");

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
          }

          if (tipMethod === "cash") {
            cashTips += tip;
          } else if (tipMethod === "card" || tipMethod === "terminal_mercadopago") {
            cardTips += tip;
            cardTipCommission += tip * COMMISSION_WITH_IVA;
          } else if (tipMethod === "transfer") {
            transferTips += tip;
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
        }

        if (tipMethod === "cash") {
          cashTips += orderTip;
        } else if (tipMethod === "card" || tipMethod === "terminal_mercadopago") {
          cardTips += orderTip;
          cardTipCommission += orderTip * COMMISSION_WITH_IVA;
        } else if (tipMethod === "transfer") {
          transferTips += orderTip;
        }
      }
    }

    // Calculate net amounts
    const netCardSales = calculateNetAmount(cardSales);
    const netCardTips = calculateNetAmount(cardTips);
    const totalCommission = cardCommission + cardTipCommission;

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
    const totalSales = cashSales + cardSales + transferSales + platformDeliverySales;
    const totalTips = cashTips + cardTips + transferTips;
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
        platformDelivery: platformDeliverySales,
        netCard: netCardSales,
      },
      tips: {
        total: totalTips,
        cash: cashTips,
        card: cardTips,
        transfer: transferTips,
        netCard: netCardTips,
      },
      commissions: {
        rate: COMMISSION_RATE,
        rateWithIVA: COMMISSION_WITH_IVA,
        total: totalCommission,
        salesCommission: cardCommission,
        tipsCommission: cardTipCommission,
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
