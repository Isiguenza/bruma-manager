import { Router, type Request, type Response } from "express";
import Stripe from "stripe";
import { db, schema } from "../db";
import { eq, sql } from "drizzle-orm";
import { emitOrderNew, emitOnlineOrder, emitOrderUpdated } from "../sockets/events";
import { haversineMeters, resolveDeliveryFee, type DeliveryTier } from "../lib/distance";

const router = Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-06-20" as any,
});

const DEFAULT_TIERS: DeliveryTier[] = [
  { maxMeters: 600, fee: 25 },
  { maxMeters: 1200, fee: 40 },
];

async function getSettings() {
  const s: any = await db.query.restaurantSettings.findFirst();
  return {
    onlineOrderingEnabled: s?.onlineOrderingEnabled ?? false,
    serviceHours: s?.serviceHours ? JSON.parse(s.serviceHours) : null,
    restaurantLat: s?.restaurantLat ? parseFloat(s.restaurantLat) : null,
    restaurantLng: s?.restaurantLng ? parseFloat(s.restaurantLng) : null,
    deliveryTiers: (s?.deliveryTiers ? JSON.parse(s.deliveryTiers) : DEFAULT_TIERS) as DeliveryTier[],
  };
}

// Zona horaria del restaurante (el server corre en UTC; el horario se configura
// en hora local de México).
const RESTAURANT_TZ = "America/Mexico_City";

/** ¿El restaurante está abierto ahora según el horario configurado? Usa la hora
 * local de México, no la del server (que está en UTC). */
function isOpenNow(serviceHours: any): boolean {
  if (!serviceHours) return true; // sin horario configurado → siempre abierto

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: RESTAURANT_TZ,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);

  const map: Record<string, string> = {
    Sun: "sun", Mon: "mon", Tue: "tue", Wed: "wed", Thu: "thu", Fri: "fri", Sat: "sat",
  };
  const day = serviceHours[map[wd]];
  if (!day || day.closed) return false;

  const cur = hour * 60 + minute;
  const [oh, om] = String(day.open || "00:00").split(":").map(Number);
  const [ch, cm] = String(day.close || "23:59").split(":").map(Number);
  return cur >= oh * 60 + om && cur <= ch * 60 + cm;
}

// POST /api/public/online-orders/intent
// Valida el carrito contra la BD, calcula envío por distancia, crea la orden
// "pending" (no pagada) y un PaymentIntent. Devuelve { clientSecret, orderId }.
router.post("/public/online-orders/intent", async (req: Request, res: Response) => {
  try {
    const {
      items,
      customerName,
      customerPhone,
      deliveryType, // "pickup" | "delivery"
      lat,
      lng,
      address,
      notes,
    } = req.body;

    if (!items?.length || !customerName || !customerPhone || !deliveryType) {
      return res.status(400).json({ error: "Faltan datos del pedido" });
    }

    const settings = await getSettings();
    if (!settings.onlineOrderingEnabled) {
      return res.status(409).json({ error: "Los pedidos en línea están pausados", code: "DISABLED" });
    }
    if (!isOpenNow(settings.serviceHours)) {
      return res.status(409).json({ error: "Fuera de horario de servicio", code: "CLOSED" });
    }

    // Validar productos y recalcular subtotal desde la BD (base price) + modificadores enviados.
    let subtotal = 0;
    const validatedItems: any[] = [];
    for (const it of items) {
      const product = await db.query.products.findFirst({
        where: eq(schema.products.id, it.productId),
      });
      if (!product || !product.active) {
        return res.status(400).json({ error: `Producto no disponible: ${it.productName || it.productId}` });
      }
      const qty = Math.max(1, parseInt(it.quantity, 10) || 1);
      const base = parseFloat(product.price || "0");
      // Surcharge de modificadores (precio por opción enviado por la web).
      const mods = it.customModifiers ? safeParse(it.customModifiers) : null;
      const modsTotal = sumModifierPrices(mods);
      const unit = base + modsTotal;
      const lineSubtotal = unit * qty;
      subtotal += lineSubtotal;
      validatedItems.push({
        productId: product.id,
        productName: product.name,
        quantity: qty,
        unitPrice: unit,
        subtotal: lineSubtotal,
        notes: it.notes || null,
        customModifiers: it.customModifiers || null,
      });
    }

    // Envío por distancia (solo si es a domicilio).
    let deliveryFee = 0;
    let resolvedAddress: string | null = null;
    let dLat: number | null = null;
    let dLng: number | null = null;
    if (deliveryType === "delivery") {
      if (settings.restaurantLat == null || settings.restaurantLng == null) {
        return res.status(409).json({ error: "El restaurante no tiene ubicación configurada", code: "NO_ORIGIN" });
      }
      if (typeof lat !== "number" || typeof lng !== "number") {
        return res.status(400).json({ error: "Falta la ubicación de entrega" });
      }
      const meters = haversineMeters(settings.restaurantLat, settings.restaurantLng, lat, lng);
      const fee = resolveDeliveryFee(meters, settings.deliveryTiers);
      if (fee == null) {
        return res.status(400).json({ error: "Fuera del área de entrega", code: "OUT_OF_RANGE" });
      }
      deliveryFee = fee;
      resolvedAddress = address || null;
      dLat = lat;
      dLng = lng;
    }

    const total = subtotal + deliveryFee;

    // Número de orden.
    const maxOrderResult = await db
      .select({ max: sql<number>`COALESCE(MAX(${schema.orders.orderNumber}), 0)` })
      .from(schema.orders);
    const nextOrderNumber = (maxOrderResult[0]?.max ?? 0) + 1;

    // Crea la orden pending (no pagada). El fee va a tip (como el envío del POS).
    const [order] = await db
      .insert(schema.orders)
      .values({
        orderNumber: nextOrderNumber,
        source: "web",
        status: "pending",
        paymentStatus: "pending",
        paymentMethod: "online",
        tipPaymentMethod: "online",
        subtotal: subtotal.toFixed(2),
        tip: deliveryFee.toFixed(2),
        total: total.toFixed(2),
        deliveryFee: deliveryFee.toFixed(2),
        customerName,
        customerPhone,
        deliveryType,
        deliveryAddress: resolvedAddress,
        deliveryLat: dLat != null ? dLat.toString() : null,
        deliveryLng: dLng != null ? dLng.toString() : null,
        notes: notes || null,
      })
      .returning();

    await db.insert(schema.orderItems).values(
      validatedItems.map((v) => ({
        orderId: order.id,
        productId: v.productId,
        productName: v.productName,
        quantity: v.quantity,
        unitPrice: v.unitPrice.toString(),
        subtotal: v.subtotal.toString(),
        notes: v.notes,
        customModifiers: v.customModifiers,
      }))
    );

    // PaymentIntent (MXN, en centavos). metadata.orderId enlaza el webhook.
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(total * 100),
      currency: "mxn",
      automatic_payment_methods: { enabled: true },
      metadata: { orderId: order.id },
      description: `Pedido #${order.orderNumber} — ${customerName}`,
    });

    await db
      .update(schema.orders)
      .set({ stripePaymentIntentId: paymentIntent.id })
      .where(eq(schema.orders.id, order.id));

    res.json({
      clientSecret: paymentIntent.client_secret,
      orderId: order.id,
      orderNumber: order.orderNumber,
      subtotal,
      deliveryFee,
      total,
    });
  } catch (error) {
    console.error("[online-orders/intent] error:", error);
    res.status(500).json({ error: "Error al crear el pedido" });
  }
});

// GET /api/public/online-orders/:id/status  (polling desde la web)
router.get("/public/online-orders/:id/status", async (req, res) => {
  try {
    const order = await db.query.orders.findFirst({
      where: eq(schema.orders.id, req.params.id),
      columns: { id: true, orderNumber: true, status: true, paymentStatus: true },
    });
    if (!order) return res.status(404).json({ error: "No encontrado" });
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: "Error" });
  }
});

// POS: aceptar pedido online → a cocina.
router.post("/orders/:id/accept-online", async (req, res) => {
  try {
    const { id } = req.params;
    const order = await db.query.orders.findFirst({ where: eq(schema.orders.id, id) });
    if (!order) return res.status(404).json({ error: "Orden no encontrada" });
    if (order.paymentStatus !== "paid") {
      return res.status(400).json({ error: "El pedido aún no está pagado" });
    }
    const [updated] = await db
      .update(schema.orders)
      .set({ status: "preparing", updatedAt: new Date() })
      .where(eq(schema.orders.id, id))
      .returning();
    const complete = await db.query.orders.findFirst({
      where: eq(schema.orders.id, id),
      with: { items: true },
    });
    emitOrderUpdated(complete);
    res.json({ success: true, order: updated });
  } catch (error) {
    console.error("[accept-online] error:", error);
    res.status(500).json({ error: "Error al aceptar" });
  }
});

// POS: rechazar pedido online → reembolso Stripe + cancelado.
router.post("/orders/:id/reject-online", async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const order = await db.query.orders.findFirst({ where: eq(schema.orders.id, id) });
    if (!order) return res.status(404).json({ error: "Orden no encontrada" });

    if (order.stripePaymentIntentId && order.paymentStatus === "paid") {
      await stripe.refunds.create({ payment_intent: order.stripePaymentIntentId });
    }

    const [updated] = await db
      .update(schema.orders)
      .set({
        status: "cancelled",
        paymentStatus: "refunded",
        notes: reason ? `Rechazado: ${reason}` : order.notes,
        updatedAt: new Date(),
      })
      .where(eq(schema.orders.id, id))
      .returning();
    emitOrderUpdated({ ...updated, rejected: true });
    res.json({ success: true });
  } catch (error) {
    console.error("[reject-online] error:", error);
    res.status(500).json({ error: "Error al rechazar" });
  }
});

// Webhook de Stripe. Se monta con express.raw en index.ts (necesita raw body).
export async function stripeWebhookHandler(req: Request, res: Response) {
  const sig = req.headers["stripe-signature"] as string;
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body, // raw Buffer
      sig,
      process.env.STRIPE_WEBHOOK_SECRET || ""
    );
  } catch (err) {
    console.error("[stripe webhook] signature error:", err);
    return res.status(400).send(`Webhook Error`);
  }

  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent;
    const orderId = pi.metadata?.orderId;
    if (orderId) {
      // Engancha a la caja abierta para que aparezca en el corte (bucket "online").
      const openRegister = await db.query.cashRegisters.findFirst({
        where: eq(schema.cashRegisters.status, "open"),
      });
      const [paid] = await db
        .update(schema.orders)
        .set({
          paymentStatus: "paid",
          paidAt: new Date(),
          cashRegisterId: openRegister?.id ?? undefined,
          updatedAt: new Date(),
        } as any)
        .where(eq(schema.orders.id, orderId))
        .returning();
      const complete = await db.query.orders.findFirst({
        where: eq(schema.orders.id, orderId),
        with: { items: true },
      });
      // Cae al POS (pantalla verde) y a las listas de órdenes.
      emitOnlineOrder(complete);
      emitOrderNew(complete);
    }
  }

  res.json({ received: true });
}

// Helpers -------------------------------------------------------------------

function safeParse(json: any): any {
  if (typeof json !== "string") return json;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Suma el precio de las opciones elegidas en un customModifiers { stepId: { options:[{price}] } }. */
function sumModifierPrices(mods: any): number {
  if (!mods || typeof mods !== "object") return 0;
  let total = 0;
  for (const step of Object.values<any>(mods)) {
    const opts = step?.options || step?.selectedOptions || [];
    for (const o of opts) {
      total += parseFloat(o?.price ?? "0") || 0;
    }
  }
  return total;
}

export default router;
