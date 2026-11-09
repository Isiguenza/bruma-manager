import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cashRegisters, cashRegisterTransactions, auditLog, orders, orderPayments } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { registerTotals } from "@/lib/cash-register/register-totals";

const CASH_TOLERANCE = parseFloat(process.env.CASH_TOLERANCE || "10");

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { 
      finalCash, 
      closureNotes, 
      closedBy, 
      vouchersTotal,
      receiptsTotal,
      supervisorId,
      supervisorReason 
    } = body;

    // Validate required fields
    if (finalCash === undefined || finalCash === null) {
      return NextResponse.json(
        { error: "El efectivo contado es obligatorio" },
        { status: 400 }
      );
    }

    if (!closedBy) {
      return NextResponse.json(
        { error: "Se requiere identificación del empleado" },
        { status: 400 }
      );
    }

    // Get register
    const register = await db.query.cashRegisters.findFirst({
      where: eq(cashRegisters.id, id),
    });

    if (!register) {
      return NextResponse.json({ error: "Caja no encontrada" }, { status: 404 });
    }

    if (register.status !== "open") {
      return NextResponse.json(
        { error: "La caja ya está cerrada" },
        { status: 400 }
      );
    }

    // Get all paid orders for this register session (scoped by cashRegisterId, no date filter)
    const paidOrders = await db.query.orders.findMany({
      where: and(
        eq(orders.cashRegisterId, id),
        eq(orders.paymentStatus, "paid"),
        eq(orders.isPractice, false)
      ),
    });

    const transactions = await db.query.cashRegisterTransactions.findMany({
      where: eq(cashRegisterTransactions.registerId, id),
    });
    const payments = paidOrders.length
      ? await db.select().from(orderPayments).where(inArray(orderPayments.orderId, paidOrders.map((o) => o.id)))
      : [];

    // Mismas reglas que el Corte en vivo (antes sumaba `total` con propina de
    // las cuentas en efectivo e ignoraba pagos divididos: la lista de cortes
    // marcaba faltantes en cajas que sí cuadraban).
    const totals = registerTotals(parseFloat(register.initialCash), paidOrders, payments, transactions);
    const { cashSales, transferSales, totalSales, withdrawals, deposits, expectedCash } = totals;
    const terminalSales = totals.cardSales;
    const difference = finalCash - expectedCash;
    const absDifference = Math.abs(difference);


    // Close register
    const [updated] = await db
      .update(cashRegisters)
      .set({
        closedAt: new Date(),
        closedBy,
        finalCash: finalCash.toFixed(2),
        expectedCash: expectedCash.toFixed(2),
        difference: difference.toFixed(2),
        totalSales: totalSales.toFixed(2),
        totalOrders: paidOrders.length,
        cashSales: cashSales.toFixed(2),
        terminalSales: terminalSales.toFixed(2),
        transferSales: transferSales.toFixed(2),
        withdrawals: withdrawals.toFixed(2),
        deposits: deposits.toFixed(2),
        vouchersTotal: vouchersTotal?.toFixed(2) || "0",
        receiptsTotal: receiptsTotal?.toFixed(2) || "0",
        closureNotes: closureNotes || null,
        tolerance: CASH_TOLERANCE.toFixed(2),
        status: "closed",
      })
      .where(eq(cashRegisters.id, id))
      .returning();

    // Create audit log entry
    await db.insert(auditLog).values({
      action: "cash_register_closed",
      entityType: "cash_register",
      entityId: id,
      userId: closedBy,
      details: JSON.stringify({
        initialCash: register.initialCash,
        finalCash: finalCash.toFixed(2),
        expectedCash: expectedCash.toFixed(2),
        difference: difference.toFixed(2),
        totalSales: totalSales.toFixed(2),
        cashSales: cashSales.toFixed(2),
        terminalSales: terminalSales.toFixed(2),
        transferSales: transferSales.toFixed(2),
        withdrawals: withdrawals.toFixed(2),
        deposits: deposits.toFixed(2),
        supervisorId: supervisorId || null,
        supervisorReason: supervisorReason || null,
        exceedsTolerance: absDifference > CASH_TOLERANCE,
      }),
    });

    return NextResponse.json({
      ...updated,
      summary: {
        initialCash: parseFloat(register.initialCash),
        cashSales,
        terminalSales,
        transferSales,
        totalSales,
        withdrawals,
        deposits,
        expectedCash,
        finalCash,
        difference,
        withinTolerance: absDifference <= CASH_TOLERANCE,
      },
    });
  } catch (error) {
    console.error("Error closing register:", error);
    return NextResponse.json(
      { error: "Error cerrando caja" },
      { status: 500 }
    );
  }
}
