import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cashRegisters, cashRegisterTransactions, orderPayments, orders } from "@/lib/db/schema";
import { and, eq, desc, inArray } from "drizzle-orm";
import { registerTotals } from "@/lib/cash-register/register-totals";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const result = await db.query.cashRegisters.findMany({
      where: status
        ? eq(cashRegisters.status, status as "open" | "closed")
        : undefined,
      orderBy: [desc(cashRegisters.openedAt)],
    });

    // Ventas, esperado y diferencia de las cajas cerradas se recalculan EN VIVO
    // con las reglas del Corte: las columnas guardadas al cerrar venían de una
    // fórmula vieja (efectivo con propinas de tarjeta, sin pagos divididos) y la
    // lista marcaba faltantes en cortes cuyo detalle sí cuadraba.
    const closed = result.filter((r) => r.status === "closed");
    if (closed.length === 0) return NextResponse.json(result);

    const ids = closed.map((r) => r.id);
    const [registerOrders, transactions] = await Promise.all([
      db.select().from(orders).where(and(inArray(orders.cashRegisterId, ids), eq(orders.paymentStatus, "paid"))),
      db.select().from(cashRegisterTransactions).where(inArray(cashRegisterTransactions.registerId, ids)),
    ]);
    const orderIds = registerOrders.map((o) => o.id);
    const payments = orderIds.length
      ? await db.select().from(orderPayments).where(inArray(orderPayments.orderId, orderIds))
      : [];

    const live = result.map((r) => {
      if (r.status !== "closed") return r;
      const regOrders = registerOrders.filter((o) => o.cashRegisterId === r.id);
      const regOrderIds = new Set(regOrders.map((o) => o.id));
      const totals = registerTotals(
        parseFloat(r.initialCash),
        regOrders,
        payments.filter((p) => regOrderIds.has(p.orderId)),
        transactions.filter((t) => t.registerId === r.id)
      );
      return {
        ...r,
        totalSales: totals.totalSales.toFixed(2),
        expectedCash: totals.expectedCash.toFixed(2),
        difference: r.finalCash != null ? (parseFloat(r.finalCash) - totals.expectedCash).toFixed(2) : r.difference,
      };
    });

    return NextResponse.json(live);
  } catch (error) {
    console.error("Error fetching cash registers:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { initialCash, employeeId } = body;

    if (!employeeId) {
      return NextResponse.json(
        { error: "Se requiere identificación del empleado" },
        { status: 400 }
      );
    }

    // Check if there's already an open register
    const existing = await db.query.cashRegisters.findFirst({
      where: eq(cashRegisters.status, "open"),
    });

    if (existing) {
      return NextResponse.json(
        { error: "Ya hay una caja abierta" },
        { status: 400 }
      );
    }

    const [register] = await db
      .insert(cashRegisters)
      .values({
        openedBy: employeeId,
        initialCash: initialCash.toFixed(2),
        totalSales: "0",
        cashSales: "0",
        terminalSales: "0",
        transferSales: "0",
        withdrawals: "0",
        deposits: "0",
        totalOrders: 0,
        status: "open",
        tolerance: "10",
      })
      .returning();

    return NextResponse.json(register, { status: 201 });
  } catch (error) {
    console.error("Error opening cash register:", error);
    return NextResponse.json({ error: "Error abriendo caja" }, { status: 500 });
  }
}
