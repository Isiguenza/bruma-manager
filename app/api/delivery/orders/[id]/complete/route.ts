import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deliveryOrders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// POST /api/delivery/orders/:id/complete - Marcar como completado
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const deliveryOrder = await db.query.deliveryOrders.findFirst({
      where: eq(deliveryOrders.id, id),
    });

    if (!deliveryOrder) {
      return NextResponse.json(
        { error: "Delivery order not found" },
        { status: 404 }
      );
    }

    // Actualizar estado
    await db
      .update(deliveryOrders)
      .set({
        status: "completed",
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(deliveryOrders.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error completing delivery order:", error);
    return NextResponse.json(
      { error: "Error completing order" },
      { status: 500 }
    );
  }
}
