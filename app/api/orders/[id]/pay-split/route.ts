import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  orders,
  tables,
  cashRegisters,
  cashRegisterTransactions,
  orderPayments,
  orderItems,
  productIngredients,
  ingredients,
} from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

const COMMISSION_RATE = 0.035;
const COMMISSION_WITH_IVA = COMMISSION_RATE * 1.16;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { payments } = body;

    if (!payments || !Array.isArray(payments) || payments.length === 0) {
      return NextResponse.json(
        { error: "Se requiere al menos un pago" },
        { status: 400 }
      );
    }

    // Get the order
    const order = await db.query.orders.findFirst({
      where: eq(orders.id, id),
      with: { items: true },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (order.paymentStatus === "paid") {
      return NextResponse.json({ error: "Already paid" }, { status: 400 });
    }

    // Validate total
    const orderTotal = parseFloat(order.total);
    const totalPaid = payments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);

    if (Math.abs(totalPaid - orderTotal) > 0.01) {
      return NextResponse.json(
        {
          error: "Total pagado no coincide con total de orden",
          expected: orderTotal,
          received: totalPaid,
        },
        { status: 400 }
      );
    }

    // Validate each payment has a method
    for (const payment of payments) {
      if (!payment.paymentMethod) {
        return NextResponse.json(
          { error: "Cada pago debe tener un método de pago" },
          { status: 400 }
        );
      }
      if (!payment.amount || payment.amount <= 0) {
        return NextResponse.json(
          { error: "Cada pago debe tener un monto mayor a 0" },
          { status: 400 }
        );
      }
    }

    // Calculate total tip from all payments
    const totalTip = payments.reduce((sum: number, p: any) => sum + (p.tip || 0), 0);

    // Save split payments
    for (let i = 0; i < payments.length; i++) {
      const payment = payments[i];
      await db.insert(orderPayments).values({
        orderId: id,
        paymentMethod: payment.paymentMethod,
        amount: payment.amount.toString(),
        tip: (payment.tip || 0).toString(),
        tipPaymentMethod: payment.tipPaymentMethod || payment.paymentMethod,
        sequenceNumber: i + 1,
        status: "completed",
      });
    }

    // Mark order as paid
    await db
      .update(orders)
      .set({
        paymentMethod: "split",
        paymentStatus: "paid",
        status: "delivered",
        tip: totalTip.toString(),
        total: (orderTotal + totalTip).toString(),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, id));

    // Mark all items as delivered
    await db
      .update(orderItems)
      .set({ deliveredToTable: true })
      .where(eq(orderItems.orderId, id));

    // Free table if applicable
    if (order.tableId) {
      await db
        .update(tables)
        .set({ status: "available", guestCount: 1 })
        .where(eq(tables.id, order.tableId));
    }

    // Record cash register transactions
    const currentRegister = await db.query.cashRegisters.findFirst({
      where: eq(cashRegisters.status, "open"),
    });

    if (currentRegister) {
      // Insert transaction for each payment
      for (const payment of payments) {
        await db.insert(cashRegisterTransactions).values({
          registerId: currentRegister.id,
          type: "sale",
          amount: payment.amount.toString(),
          orderId: order.id,
          paymentMethod: payment.paymentMethod,
          description: `Orden #${order.orderNumber} - Split Pago ${payment.paymentMethod}`,
        });
      }

      // Update register totals
      const updateData: Record<string, any> = {
        totalSales: sql`COALESCE(${cashRegisters.totalSales}, 0) + ${orderTotal + totalTip}`,
        totalOrders: sql`COALESCE(${cashRegisters.totalOrders}, 0) + 1`,
        totalTips: sql`COALESCE(${cashRegisters.totalTips}, 0) + ${totalTip}`,
      };

      // Aggregate by method
      for (const payment of payments) {
        const method = payment.paymentMethod;
        const amount = payment.amount;
        const tip = payment.tip || 0;
        const tipMethod = payment.tipPaymentMethod || method;

        if (method === "cash") {
          updateData.cashSales = sql`COALESCE(${cashRegisters.cashSales}, 0) + ${amount}`;
        } else if (method === "transfer") {
          updateData.transferSales = sql`COALESCE(${cashRegisters.transferSales}, 0) + ${amount}`;
        } else if (method === "terminal_mercadopago" || method === "card") {
          updateData.terminalSales = sql`COALESCE(${cashRegisters.terminalSales}, 0) + ${amount}`;
          updateData.cardCommission = sql`COALESCE(${cashRegisters.cardCommission}, 0) + ${(amount + tip) * COMMISSION_WITH_IVA}`;
          updateData.netCardSales = sql`COALESCE(${cashRegisters.netCardSales}, 0) + ${amount - (amount * COMMISSION_WITH_IVA)}`;
          updateData.netCardTips = sql`COALESCE(${cashRegisters.netCardTips}, 0) + ${tip - (tip * COMMISSION_WITH_IVA)}`;
        }

        // Track tips by method
        if (tipMethod === "cash") {
          updateData.cashTips = sql`COALESCE(${cashRegisters.cashTips}, 0) + ${tip}`;
        } else if (tipMethod === "terminal_mercadopago" || tipMethod === "card") {
          updateData.cardTips = sql`COALESCE(${cashRegisters.cardTips}, 0) + ${tip}`;
        } else if (tipMethod === "transfer") {
          updateData.transferTips = sql`COALESCE(${cashRegisters.transferTips}, 0) + ${tip}`;
        }
      }

      await db
        .update(cashRegisters)
        .set(updateData)
        .where(eq(cashRegisters.id, currentRegister.id));
    }

    // Deduct inventory
    const consolidatedItems = await db.query.orderItems.findMany({
      where: eq(orderItems.orderId, id),
    });

    for (const item of consolidatedItems || []) {
      const recipe = await db.query.productIngredients.findMany({
        where: eq(productIngredients.productId, item.productId),
      });
      for (const r of recipe) {
        const deduction = parseFloat(r.quantityNeeded) * item.quantity;
        await db
          .update(ingredients)
          .set({
            currentStock: sql`GREATEST(0, CAST(${ingredients.currentStock} AS NUMERIC) - ${deduction})`,
            updatedAt: new Date(),
          })
          .where(eq(ingredients.id, r.ingredientId));
      }
    }

    const updatedOrder = await db.query.orders.findFirst({
      where: eq(orders.id, id),
      with: { items: true },
    });

    return NextResponse.json(updatedOrder);
  } catch (error) {
    console.error("Error processing split payment:", error);
    return NextResponse.json(
      { error: "Error procesando pago dividido" },
      { status: 500 }
    );
  }
}
