import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders, orderItems } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    console.log(`🔄 PATCH /api/orders/${id}/status - Cambiando status a: ${status}`);

    const validStatuses = ["pending", "preparing", "ready", "delivered", "cancelled"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    // Verificar orden antes de actualizar
    const orderBefore = await db.query.orders.findFirst({
      where: eq(orders.id, id),
    });
    console.log(`📦 Orden ANTES: id=${orderBefore?.id}, status=${orderBefore?.status}, tableId=${orderBefore?.tableId}`);

    const [order] = await db
      .update(orders)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, id))
      .returning();

    console.log(`✅ Orden DESPUÉS: id=${order.id}, status=${order.status}, tableId=${order.tableId}`);

    // Si la orden se marca como delivered o cancelled, sacar items de Dispatch/cocina
    if (status === "delivered" || status === "cancelled") {
      await db
        .update(orderItems)
        .set({ deliveredToTable: true })
        .where(eq(orderItems.orderId, id));
      console.log(`✅ Items de orden ${id} marcados como deliveredToTable (status: ${status})`);
    }

    return NextResponse.json(order);
  } catch (error) {
    console.error("Error updating order status:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
