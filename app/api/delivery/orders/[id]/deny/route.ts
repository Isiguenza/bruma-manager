import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deliveryOrders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// POST /api/delivery/orders/:id/deny - Rechazar pedido
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { reason } = body;

    const deliveryOrder = await db.query.deliveryOrders.findFirst({
      where: eq(deliveryOrders.id, id),
    });

    if (!deliveryOrder) {
      return NextResponse.json(
        { error: "Delivery order not found" },
        { status: 404 }
      );
    }

    // Rechazar en Uber
    await denyOrderInUber(deliveryOrder.externalId, reason);

    // Actualizar estado
    await db
      .update(deliveryOrders)
      .set({
        status: "cancelled",
        cancelledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(deliveryOrders.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error denying delivery order:", error);
    return NextResponse.json(
      { error: "Error denying order" },
      { status: 500 }
    );
  }
}

async function denyOrderInUber(externalId: string, reason: string) {
  const accessToken = process.env.UBER_ACCESS_TOKEN || "";
  const apiUrl = process.env.UBER_API_URL || "https://api.uber.com";

  const response = await fetch(
    `${apiUrl}/v1/eats/stores/orders/${externalId}/deny_pos_order`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reason: reason || "out_of_items",
        details: reason,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to deny Uber order: ${error}`);
  }

  return response.json();
}
