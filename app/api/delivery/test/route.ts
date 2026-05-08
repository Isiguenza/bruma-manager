import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deliveryOrders } from "@/lib/db/schema";

// POST /api/delivery/test - Crear pedido de prueba
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { platform = "uber_eats" } = body;

    // Crear pedido de prueba
    const [deliveryOrder] = await db
      .insert(deliveryOrders)
      .values({
        platform: platform as any,
        externalId: `test-${Date.now()}`,
        status: "pending",
        customerName: "Juan Pérez (Prueba)",
        customerPhone: "555-1234-5678",
        deliveryAddress: "Av. Reforma 123, CDMX",
        deliveryInstructions: "Tocar el timbre 2 veces",
        subtotal: "250.00",
        deliveryFee: "45.00",
        platformFee: "25.00",
        total: "320.00",
        estimatedPickupTime: new Date(Date.now() + 30 * 60 * 1000), // 30 min
        rawData: JSON.stringify({
          test: true,
          cart: {
            items: [
              { name: "Hamburguesa Clásica", quantity: 2, price: "90.00" },
              { name: "Papas Grandes", quantity: 1, price: "70.00" },
            ],
          },
        }),
      })
      .returning();

    console.log("Created test delivery order:", deliveryOrder.id);

    return NextResponse.json({
      success: true,
      order: deliveryOrder,
      message: "✅ Pedido de prueba creado. Revisa la tab Delivery en el iPad.",
    });
  } catch (error) {
    console.error("Error creating test order:", error);
    return NextResponse.json(
      { error: "Error creating test order" },
      { status: 500 }
    );
  }
}
