import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders, orderItems, cashRegisterTransactions, cashRegisters, loyaltyTransactions } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const order = await db.query.orders.findFirst({
      where: eq(orders.id, id),
      with: { items: true },
    });

    if (!order) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(order);
  } catch (error) {
    console.error("Error fetching order:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    
    const updateData: Record<string, any> = { updatedAt: new Date() };
    
    if (body.splitBillData !== undefined) {
      updateData.splitBillData = body.splitBillData ? JSON.stringify(body.splitBillData) : null;
    }
    if (body.guestCount !== undefined) {
      updateData.guestCount = Number(body.guestCount);
    }

    await db.update(orders).set(updateData).where(eq(orders.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating order:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Obtener la orden para saber el monto y método de pago
    const order = await db.query.orders.findFirst({
      where: eq(orders.id, id),
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // CRITICAL LOGGING: Track all order deletions
    console.error(`🚨 DELETE ORDER CALLED - ID: ${id}, Order#: ${order.orderNumber}, Total: ${order.total}, PaymentStatus: ${order.paymentStatus}, Table: ${order.tableId}, Customer: ${order.customerName}, CreatedAt: ${order.createdAt}`);
    console.error(`🚨 DELETE SOURCE: ${request.headers.get('referer') || 'unknown'}, User-Agent: ${request.headers.get('user-agent')}`);
    
    // Get request body if any (for reason tracking)
    const body = await request.json().catch(() => ({}));
    if (body.reason) {
      console.error(`🚨 DELETE REASON: ${body.reason}`);
    }

    // Revertir totales de la caja registradora
    const txns = await db.query.cashRegisterTransactions.findMany({
      where: eq(cashRegisterTransactions.orderId, id),
    });

    for (const txn of txns) {
      const amount = parseFloat(txn.amount);
      const register = await db.query.cashRegisters.findFirst({
        where: eq(cashRegisters.id, txn.registerId),
      });
      if (register) {
        const updateData: Record<string, any> = {
          totalSales: sql`GREATEST(0, COALESCE(${cashRegisters.totalSales}, 0) - ${amount})`,
          totalOrders: sql`GREATEST(0, COALESCE(${cashRegisters.totalOrders}, 0) - 1)`,
        };
        const method = order.paymentMethod;
        if (method === "cash") {
          updateData.cashSales = sql`GREATEST(0, COALESCE(${cashRegisters.cashSales}, 0) - ${amount})`;
        } else if (method === "transfer") {
          updateData.transferSales = sql`GREATEST(0, COALESCE(${cashRegisters.transferSales}, 0) - ${amount})`;
        } else if (method === "terminal_mercadopago") {
          updateData.terminalSales = sql`GREATEST(0, COALESCE(${cashRegisters.terminalSales}, 0) - ${amount})`;
        } else if (method === "split") {
          updateData.cashSales = sql`GREATEST(0, COALESCE(${cashRegisters.cashSales}, 0) - ${amount})`;
        }
        await db.update(cashRegisters).set(updateData).where(eq(cashRegisters.id, register.id));
      }
    }

    // Eliminar transacciones de caja
    await db.delete(cashRegisterTransactions).where(eq(cashRegisterTransactions.orderId, id));
    
    // Eliminar transacciones de lealtad
    await db.delete(loyaltyTransactions).where(eq(loyaltyTransactions.orderId, id));
    
    // Eliminar los items de la orden
    await db.delete(orderItems).where(eq(orderItems.orderId, id));
    
    // Eliminar la orden
    await db.delete(orders).where(eq(orders.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting order:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
