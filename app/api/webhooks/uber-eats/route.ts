import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deliveryOrders } from "@/lib/db/schema";
import crypto from "crypto";

// Verificar firma HMAC de Uber
function verifyUberSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payload);
  const expectedSignature = hmac.digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

export async function POST(request: NextRequest) {
  try {
    // Leer el body raw
    const rawBody = await request.text();
    const signature = request.headers.get("x-uber-signature") || "";

    // Verificar firma
    const secret = process.env.UBER_WEBHOOK_SIGNING_KEY || "";
    if (!verifyUberSignature(rawBody, signature, secret)) {
      console.error("Invalid Uber webhook signature");
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    // Parsear el body
    const body = JSON.parse(rawBody);
    const { event_type, resource_href, resource_id, meta } = body;

    console.log("Uber Eats webhook received:", {
      event_type,
      resource_id,
      meta,
    });

    // Responder 200 OK inmediatamente (Uber requiere respuesta rápida)
    const response = NextResponse.json({ received: true }, { status: 200 });

    // Procesar el evento en background
    setImmediate(async () => {
      try {
        if (event_type === "orders.notification") {
          await handleNewOrder(resource_href, resource_id, body);
        } else if (event_type === "orders.cancel") {
          await handleOrderCancellation(resource_id);
        }
      } catch (error) {
        console.error("Error processing Uber webhook:", error);
      }
    });

    return response;
  } catch (error) {
    console.error("Error in Uber webhook:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function handleNewOrder(
  resourceHref: string,
  orderId: string,
  rawData: any
) {
  try {
    // Obtener detalles completos del pedido desde Uber API
    const orderDetails = await fetchUberOrderDetails(resourceHref);

    // Crear delivery order en DB
    const [deliveryOrder] = await db
      .insert(deliveryOrders)
      .values({
        platform: "uber_eats",
        externalId: orderId,
        status: "pending",
        customerName: orderDetails.eater?.first_name || "Cliente Uber",
        customerPhone: orderDetails.eater?.phone,
        deliveryAddress: orderDetails.delivery?.location?.address || null,
        deliveryInstructions: orderDetails.delivery?.notes || null,
        subtotal: orderDetails.payment?.charges?.total?.amount || "0",
        deliveryFee: orderDetails.payment?.charges?.delivery_fee?.amount || "0",
        platformFee: orderDetails.payment?.charges?.service_fee?.amount || "0",
        total: orderDetails.payment?.charges?.total?.amount || "0",
        estimatedPickupTime: orderDetails.estimated_ready_for_pickup_at
          ? new Date(orderDetails.estimated_ready_for_pickup_at)
          : null,
        rawData: JSON.stringify(rawData),
      })
      .returning();

    console.log("Created delivery order:", deliveryOrder.id);

    // TODO: Emitir evento WebSocket para notificar al POS
    // io.emit('delivery.new_order', deliveryOrder);

    // Si auto-aceptar está activado, aceptar automáticamente
    // const autoAccept = await getAutoAcceptSetting();
    // if (autoAccept) {
    //   await acceptDeliveryOrder(deliveryOrder.id);
    // }
  } catch (error) {
    console.error("Error handling new Uber order:", error);
    throw error;
  }
}

async function handleOrderCancellation(orderId: string) {
  try {
    // Actualizar estado en DB
    const { eq } = await import("drizzle-orm");
    await db
      .update(deliveryOrders)
      .set({
        status: "cancelled",
        cancelledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(deliveryOrders.externalId, orderId));

    console.log("Cancelled delivery order:", orderId);

    // TODO: Emitir evento WebSocket
    // io.emit('delivery.order_cancelled', { orderId });
  } catch (error) {
    console.error("Error handling order cancellation:", error);
    throw error;
  }
}

async function fetchUberOrderDetails(resourceHref: string) {
  const accessToken = await getUberAccessToken();

  const response = await fetch(resourceHref, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Uber order: ${response.statusText}`);
  }

  return response.json();
}

async function getUberAccessToken(): Promise<string> {
  // TODO: Implementar OAuth flow para obtener access token
  // Por ahora, retornar el token guardado en env (si existe)
  const token = process.env.UBER_ACCESS_TOKEN;
  if (!token) {
    throw new Error("Uber access token not configured");
  }
  return token;
}
