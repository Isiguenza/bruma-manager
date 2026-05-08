import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deliveryOrders, orders, orderItems } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// POST /api/delivery/orders/:id/accept - Aceptar pedido de delivery
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Obtener delivery order
    const deliveryOrder = await db.query.deliveryOrders.findFirst({
      where: eq(deliveryOrders.id, id),
    });

    if (!deliveryOrder) {
      return NextResponse.json(
        { error: "Delivery order not found" },
        { status: 404 }
      );
    }

    if (deliveryOrder.status !== "pending") {
      return NextResponse.json(
        { error: "Order already processed" },
        { status: 400 }
      );
    }

    // Aceptar en Uber Eats
    await acceptOrderInUber(deliveryOrder.externalId);

    // Crear orden en el sistema
    const systemOrder = await createSystemOrder(deliveryOrder);

    // Actualizar delivery order
    await db
      .update(deliveryOrders)
      .set({
        status: "accepted",
        acceptedAt: new Date(),
        orderId: systemOrder.id,
        updatedAt: new Date(),
      })
      .where(eq(deliveryOrders.id, id));

    // TODO: Imprimir ticket automáticamente
    // await printDeliveryTicket(deliveryOrder, systemOrder);

    // TODO: Emitir evento WebSocket
    // io.emit('delivery.order_accepted', { deliveryOrderId: id, orderId: systemOrder.id });

    return NextResponse.json({
      success: true,
      deliveryOrderId: id,
      orderId: systemOrder.id,
    });
  } catch (error) {
    console.error("Error accepting delivery order:", error);
    return NextResponse.json(
      { error: "Error accepting order" },
      { status: 500 }
    );
  }
}

async function acceptOrderInUber(externalId: string) {
  const accessToken = await getUberAccessToken();
  const apiUrl = process.env.UBER_API_URL || "https://api.uber.com";

  const response = await fetch(
    `${apiUrl}/v1/eats/stores/orders/${externalId}/accept_pos_order`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reason: "accepted",
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to accept Uber order: ${error}`);
  }

  return response.json();
}

async function createSystemOrder(deliveryOrder: any) {
  // Parsear items del rawData
  const rawData = JSON.parse(deliveryOrder.rawData || "{}");
  const uberItems = rawData.cart?.items || [];

  // Obtener siguiente número de orden
  const lastOrder = await db.query.orders.findFirst({
    orderBy: (orders, { desc }) => [desc(orders.orderNumber)],
  });
  const nextOrderNumber = (lastOrder?.orderNumber || 0) + 1;

  // Crear orden
  const [order] = await db
    .insert(orders)
    .values({
      orderNumber: nextOrderNumber,
      status: "preparing",
      subtotal: deliveryOrder.subtotal,
      total: deliveryOrder.total,
      paymentStatus: "paid", // Ya está pagado en Uber
      paymentMethod: "platform_delivery",
      customerName: deliveryOrder.customerName,
      notes: `Uber Eats - ${deliveryOrder.deliveryInstructions || ""}`,
      source: "uber_eats",
      deliveryOrderId: deliveryOrder.id,
    })
    .returning();

  // TODO: Crear order items basados en los productos de Uber
  // Esto requiere mapear productos de Uber a productos del sistema
  // Por ahora, guardar en notes o crear items genéricos

  return order;
}

async function getUberAccessToken(): Promise<string> {
  const token = process.env.UBER_ACCESS_TOKEN;
  if (!token) {
    throw new Error("Uber access token not configured");
  }
  return token;
}
