import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deliveryOrders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// POST /api/delivery/orders/:id/ready - Marcar como listo
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

    // Notificar a Uber que está listo
    await markOrderReadyInUber(deliveryOrder.externalId);

    // Actualizar estado
    await db
      .update(deliveryOrders)
      .set({
        status: "ready",
        readyAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(deliveryOrders.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error marking delivery order as ready:", error);
    return NextResponse.json(
      { error: "Error marking order as ready" },
      { status: 500 }
    );
  }
}

async function markOrderReadyInUber(externalId: string) {
  const accessToken = process.env.UBER_ACCESS_TOKEN || "";
  const apiUrl = process.env.UBER_API_URL || "https://api.uber.com";

  const response = await fetch(
    `${apiUrl}/v1/eats/stores/orders/${externalId}/ready_for_pickup`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error("Failed to mark Uber order as ready:", error);
    // No lanzar error, continuar con actualización local
  }

  return response.ok;
}
