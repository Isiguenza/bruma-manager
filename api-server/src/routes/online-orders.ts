import { Router, type Request, type Response } from "express";
import Stripe from "stripe";
import { db, schema } from "../db";
import { eq, and, or, desc, sql } from "drizzle-orm";
import { emitOrderNew, emitOnlineOrder, emitOrderUpdated } from "../sockets/events";
import { haversineMeters, resolveDeliveryFee, type DeliveryTier } from "../lib/distance";
import { notifyOrderReceived, notifyOrderConfirmed, notifyOrderCancelled } from "../lib/whatsapp";

const router = Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-06-20" as any,
});

// Guard contra el incidente real que ya pasó: una key de TEST corriendo en
// producción deja "pasar" pedidos que nunca se cobraron de verdad. Esto no
// arregla el pago, pero hace imposible no notar el modo equivocado en los
// logs de arranque, y truena el arranque si además sabemos que este proceso
// es de producción (NODE_ENV=production).
const stripeKeyMode = process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_")
  ? "LIVE"
  : process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")
  ? "TEST"
  : "UNKNOWN";
console.log(`[stripe] modo detectado: ${stripeKeyMode} (${process.env.STRIPE_SECRET_KEY?.slice(0, 12) ?? "sin key"}…)`);
if (process.env.NODE_ENV === "production" && stripeKeyMode !== "LIVE") {
  // Escape hatch explícito: solo si alguien puso esta variable A PROPÓSITO
  // (no por accidente, como pasó la vez pasada) se permite arrancar en modo
  // test en producción — igual queda un warning imposible de ignorar.
  if (process.env.ALLOW_TEST_STRIPE_IN_PRODUCTION === "true") {
    console.warn(
      `⚠️⚠️⚠️ [stripe] ATENCIÓN: corriendo en modo ${stripeKeyMode} con NODE_ENV=production ` +
      `porque ALLOW_TEST_STRIPE_IN_PRODUCTION=true está puesto a propósito. Cualquier cliente real ` +
      `que intente pagar en el sitio en vivo va a fallar/crear pedidos sin cobrar — quita esta ` +
      `variable en cuanto termines de probar. ⚠️⚠️⚠️`
    );
  } else {
    throw new Error(
      `[stripe] STRIPE_SECRET_KEY está en modo ${stripeKeyMode} pero NODE_ENV=production — esto es ` +
      `exactamente lo que causó el incidente donde se crearon pedidos "pagados" sin cobrar nada real. ` +
      `Corrige la key, o si es a propósito pon ALLOW_TEST_STRIPE_IN_PRODUCTION=true.`
    );
  }
}

const DEFAULT_TIERS: DeliveryTier[] = [
  { maxMeters: 600, fee: 25 },
  { maxMeters: 1200, fee: 40 },
];

// Pedidos web "pending" cuyo PaymentIntent nunca se resolvió — ni succeeded,
// ni failed, ni canceled llegó nunca (el cliente cerró la pestaña a medio
// checkout, o nunca llegó a intentar pagar) — se marcan como fallidos tras
// este tiempo en vez de quedarse en limbo para siempre.
const ABANDONED_ORDER_MINUTES = 30;

/** Barre pedidos web abandonados a medio pago. Se corre periódicamente desde
 * index.ts (no hay infra de cron en este proyecto — un setInterval basta). */
export async function cleanupAbandonedOnlineOrders() {
  try {
    const cutoff = new Date(Date.now() - ABANDONED_ORDER_MINUTES * 60 * 1000);
    const abandoned = await db
      .update(schema.orders)
      .set({ paymentStatus: "failed", status: "cancelled", updatedAt: new Date() })
      .where(
        and(
          eq(schema.orders.source, "web"),
          eq(schema.orders.paymentStatus, "pending"),
          sql`${schema.orders.createdAt} < ${cutoff}`
        )
      )
      .returning({ id: schema.orders.id, orderNumber: schema.orders.orderNumber });
    if (abandoned.length > 0) {
      console.log(
        `[cleanup] ${abandoned.length} pedido(s) web abandonados marcados como fallidos: ` +
        abandoned.map((o) => `#${o.orderNumber}`).join(", ")
      );
    }
  } catch (error) {
    console.error("[cleanup] error limpiando pedidos abandonados:", error);
  }
}

/** Reembolsa un pago de Stripe por su PaymentIntent. Reusable desde otras rutas. */
export async function refundStripePayment(paymentIntentId: string) {
  return stripe.refunds.create({ payment_intent: paymentIntentId });
}

/** Captura (cobra de verdad) una autorización pendiente. Reusable desde otras rutas. */
export async function captureStripePayment(paymentIntentId: string) {
  return stripe.paymentIntents.capture(paymentIntentId);
}

/** Cancela una autorización que nunca se capturó — libera el hold sin cobrar
 * ni reembolsar nada (no hubo cargo real). Reusable desde otras rutas. */
export async function cancelStripePaymentIntent(paymentIntentId: string) {
  return stripe.paymentIntents.cancel(paymentIntentId);
}

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
      customerEmail,
      clerkUserId,
      deliveryType, // "pickup" | "delivery"
      lat,
      lng,
      address,
      notes,
    } = req.body;

    if (!items?.length || !customerName || !customerPhone || !customerEmail || !deliveryType) {
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
      // Precio base: si el producto tiene variantes, usa el precio de la variante
      // elegida (por nombre); si no, el precio base del producto.
      let base = parseFloat(product.price || "0");
      let displayName = product.name;
      if (it.variantName && product.hasVariants && product.variants) {
        const variants = safeParse(product.variants) || [];
        const v = Array.isArray(variants) ? variants.find((x: any) => x.name === it.variantName) : null;
        if (v) {
          base = parseFloat(v.price) || base;
          displayName = `${product.name} (${v.name})`;
        }
      }
      // Surcharge de modificadores (precio por opción enviado por la web).
      const mods = it.customModifiers ? safeParse(it.customModifiers) : null;
      const modsTotal = sumModifierPrices(mods);
      const unit = base + modsTotal;
      const lineSubtotal = unit * qty;
      subtotal += lineSubtotal;
      validatedItems.push({
        productId: product.id,
        productName: displayName,
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
        customerEmail,
        clerkUserId: clerkUserId || null,
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

    // Si el cliente inició sesión (Bearer opcional — invitados siguen
    // funcionando igual), liga el pago a su Stripe Customer: el Payment
    // Element le muestra sus tarjetas guardadas automáticamente, sin UI de
    // selección propia — eso ya lo maneja Stripe. No fuerza guardar la
    // tarjeta nueva que use aquí (eso solo pasa explícito en /perfil/pago).
    let stripeCustomerId: string | undefined;
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (bearerToken && process.env.CLERK_SECRET_KEY) {
      try {
        const { verifyToken } = await import("@clerk/backend");
        const verified = await verifyToken(bearerToken, { secretKey: process.env.CLERK_SECRET_KEY });
        const { getOrCreateStripeCustomer } = await import("./payment-methods");
        stripeCustomerId = await getOrCreateStripeCustomer(verified.sub, customerEmail);
      } catch (e) {
        console.error("[online-orders/intent] sesión opcional inválida (sigue como invitado):", e);
      }
    }

    // PaymentIntent (MXN, en centavos). metadata.orderId enlaza el webhook.
    // capture_method:"manual" → esto solo AUTORIZA la tarjeta (hold), no cobra
    // todavía. El cobro real se dispara después, cuando el POS marca el pedido
    // "ready" (recoger: al estar listo; domicilio: antes de marcarlo enviado)
    // — así, si el pedido se rechaza antes de eso, basta con liberar el hold
    // sin necesidad de emitir un reembolso (nunca se cobró nada).
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(total * 100),
      currency: "mxn",
      automatic_payment_methods: { enabled: true },
      capture_method: "manual",
      ...(stripeCustomerId ? { customer: stripeCustomerId } : {}),
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

// GET /api/public/online-orders/eta?type=pickup|delivery
// Tiempo estimado según la carga de cocina: base 35 min + carga (órdenes activas
// y comensales sentados) + buffer de reparto si es a domicilio.
router.get("/public/online-orders/eta", async (req, res) => {
  try {
    const type = (req.query.type as string) || "pickup";
    const BASE = 35;
    // Reusa el mismo cálculo que /intent usa para rechazar (CLOSED/DISABLED),
    // pero aquí se expone de forma consultable ANTES de que el cliente
    // intente pagar, para poder bloquear "Continuar al pago" de forma
    // proactiva en vez de solo enterarse por un error del servidor.
    const settings = await getSettings();

    const active = await db.query.orders.findMany({
      where: sql`${schema.orders.status} IN ('pending','preparing','ready')`,
      columns: { id: true, tableId: true, guestCount: true },
    });
    const activeOrders = active.length;
    const seatedGuests = active
      .filter((o) => o.tableId)
      .reduce((s, o) => s + (o.guestCount || 1), 0);

    // Cada orden activa suma 4 min; cada 4 comensales sentados suma 5 min. Tope +30.
    const load = Math.min(30, activeOrders * 4 + Math.floor(seatedGuests / 4) * 5);
    const deliveryBuffer = type === "delivery" ? 10 : 0;
    const etaMinutes = BASE + load + deliveryBuffer;

    res.json({
      etaMinutes,
      activeOrders,
      seatedGuests,
      isOpen: isOpenNow(settings.serviceHours),
      onlineOrderingEnabled: settings.onlineOrderingEnabled,
    });
  } catch (error) {
    res.json({ etaMinutes: 35, isOpen: true, onlineOrderingEnabled: true });
  }
});

// GET /api/public/online-orders/delivery-quote?lat=&lng=
// Cotiza el envío por distancia SIN crear orden ni PaymentIntent — mismo
// cálculo que usa el intent real, para mostrarlo en vivo mientras el
// cliente elige su ubicación en el checkout.
router.get("/public/online-orders/delivery-quote", async (req, res) => {
  try {
    const settings = await getSettings();

    // Sin lat/lng todavía (p. ej. antes de elegir ubicación): solo regresa
    // los tramos reales, para reemplazar el texto estático de siempre.
    const latRaw = req.query.lat as string | undefined;
    const lngRaw = req.query.lng as string | undefined;
    if (latRaw == null || lngRaw == null) {
      return res.json({ feeAvailable: false, fee: null, distanceMeters: null, tiers: settings.deliveryTiers });
    }

    const lat = parseFloat(latRaw);
    const lng = parseFloat(lngRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: "Coordenadas inválidas" });
    }
    if (settings.restaurantLat == null || settings.restaurantLng == null) {
      return res.status(409).json({ error: "El restaurante no tiene ubicación configurada", code: "NO_ORIGIN" });
    }

    const distanceMeters = haversineMeters(settings.restaurantLat, settings.restaurantLng, lat, lng);
    const fee = resolveDeliveryFee(distanceMeters, settings.deliveryTiers);

    res.json({
      feeAvailable: fee != null,
      fee,
      distanceMeters: Math.round(distanceMeters),
      tiers: settings.deliveryTiers,
    });
  } catch (error) {
    console.error("[online-orders/delivery-quote] error:", error);
    res.status(500).json({ error: "Error al cotizar el envío" });
  }
});

// GET /api/public/online-orders/:id/status  (polling desde la web)
router.get("/public/online-orders/:id/status", async (req, res) => {
  try {
    const order = await db.query.orders.findFirst({
      where: eq(schema.orders.id, req.params.id),
      columns: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        deliveryType: true,
        deliveryAddress: true,
        deliveryLat: true,
        deliveryLng: true,
        estimatedReadyMinutes: true,
        updatedAt: true,
      },
    });
    if (!order) return res.status(404).json({ error: "No encontrado" });
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: "Error" });
  }
});

// GET /api/public/restaurant  → ubicación del restaurante (coords del dashboard).
router.get("/public/restaurant", async (_req, res) => {
  try {
    const s = await getSettings();
    res.json({
      lat: s.restaurantLat,
      lng: s.restaurantLng,
      address: "Av. Panamericana Casa B14, Col. Pedregal de Carrasco, 04700, Coyoacán, CDMX",
    });
  } catch (error) {
    res.status(500).json({ error: "Error" });
  }
});

// GET /api/public/profile/orders  (BRUMA Web, sitio estático → llamada
// directa del navegador). Verifica el JWT de sesión de Clerk (nunca confía
// en un correo mandado por el cliente — lo saca de Clerk server-side), liga
// cualquier pedido pagado con ese correo hecho como invitado, y devuelve el
// historial completo.
router.get("/public/profile/orders", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token || !process.env.CLERK_SECRET_KEY) {
      return res.status(401).json({ error: "No autorizado" });
    }

    let clerkUserId: string;
    try {
      const { verifyToken, createClerkClient } = await import("@clerk/backend");
      const verified = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
      clerkUserId = verified.sub;

      const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
      const user = await clerk.users.getUser(clerkUserId);
      const email = user.primaryEmailAddress?.emailAddress;
      if (!email) return res.status(400).json({ error: "Tu cuenta no tiene correo" });

      // Liga (una sola vez) los pedidos hechos como invitado con este correo.
      await db
        .update(schema.orders)
        .set({ clerkUserId })
        .where(sql`${schema.orders.customerEmail} = ${email} AND ${schema.orders.clerkUserId} IS NULL AND ${schema.orders.paymentStatus} IN ('authorized', 'paid')`);

      // Pedidos con pago autorizado o ya capturado — un carrito abandonado
      // (nunca autorizado) no debe aparecer como "pedido" en el historial,
      // aunque haya quedado ligado por clerkUserId. Incluye "authorized" para
      // que el cliente vea su pedido en curso aunque el cobro real (captura)
      // todavía no haya pasado al marcarse "ready".
      const ordersList = await db.query.orders.findMany({
        where: and(
          sql`${schema.orders.paymentStatus} IN ('authorized', 'paid')`,
          or(eq(schema.orders.clerkUserId, clerkUserId), eq(schema.orders.customerEmail, email))
        ),
        with: { items: true },
        orderBy: desc(schema.orders.createdAt),
      });

      res.json(ordersList);
    } catch (verifyErr) {
      console.error("[profile/orders] token inválido:", verifyErr);
      return res.status(401).json({ error: "Sesión inválida" });
    }
  } catch (error) {
    console.error("[profile/orders] error:", error);
    res.status(500).json({ error: "Error al obtener pedidos" });
  }
});

// POS: aceptar pedido online → a cocina.
router.post("/orders/:id/accept-online", async (req, res) => {
  try {
    const { id } = req.params;
    const { estimatedReadyMinutes } = req.body;
    const order = await db.query.orders.findFirst({ where: eq(schema.orders.id, id) });
    if (!order) return res.status(404).json({ error: "Orden no encontrada" });
    // Con captura manual, al aceptar el pedido normalmente está "authorized"
    // (tarjeta retenida, aún no cobrada) — el cobro real pasa después, al
    // marcar "ready". También se acepta "paid" por si ya se capturó.
    if (order.paymentStatus !== "authorized" && order.paymentStatus !== "paid") {
      return res.status(400).json({ error: "El pedido aún no tiene un pago autorizado" });
    }
    const minutes = Number.isFinite(estimatedReadyMinutes) ? Math.round(estimatedReadyMinutes) : null;
    const [updated] = await db
      .update(schema.orders)
      .set({
        status: "preparing",
        updatedAt: new Date(),
        ...(minutes != null ? { estimatedReadyMinutes: minutes } : {}),
      })
      .where(eq(schema.orders.id, id))
      .returning();
    const complete = await db.query.orders.findFirst({
      where: eq(schema.orders.id, id),
      with: { items: true },
    });
    // Al ACEPTAR es cuando cae a cocina (KDS/dispatch) y se marca preparando.
    emitOrderNew(complete);
    emitOrderUpdated(complete);
    notifyOrderConfirmed(updated).catch(() => {});
    res.json({ success: true, order: updated });
  } catch (error) {
    console.error("[accept-online] error:", error);
    res.status(500).json({ error: "Error al aceptar" });
  }
});

// POS: rechazar pedido online.
// Con captura manual, la mayoría de los rechazos pasan ANTES de cobrar nada
// (paymentStatus="authorized") — ahí solo se libera el hold de la tarjeta
// (cancel), nunca se cobró así que no hay nada que reembolsar. Si por algún
// motivo el pedido ya se había capturado ("paid"), sí se emite un reembolso
// real. En cualquier otro caso no hay nada que hacer en Stripe.
router.post("/orders/:id/reject-online", async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const order = await db.query.orders.findFirst({ where: eq(schema.orders.id, id) });
    if (!order) return res.status(404).json({ error: "Orden no encontrada" });

    let newPaymentStatus: string = order.paymentStatus;
    let message = "Pedido rechazado.";

    try {
      if (order.stripePaymentIntentId && order.paymentStatus === "authorized") {
        await stripe.paymentIntents.cancel(order.stripePaymentIntentId);
        newPaymentStatus = "canceled";
        message = "Pedido rechazado. No se cobró nada al cliente — solo se liberó la retención de su tarjeta.";
      } else if (order.stripePaymentIntentId && order.paymentStatus === "paid") {
        await stripe.refunds.create({ payment_intent: order.stripePaymentIntentId });
        newPaymentStatus = "refunded";
        message = "Pedido rechazado y reembolsado. El monto cobrado se devolverá al cliente en 5–10 días hábiles.";
      } else {
        message = "Pedido rechazado. No se había realizado ningún cobro.";
      }
    } catch (stripeError: any) {
      console.error("[reject-online] error de Stripe al rechazar:", stripeError);
      return res.status(502).json({
        error:
          order.paymentStatus === "paid"
            ? "No se pudo procesar el reembolso en Stripe. Intenta de nuevo o contacta soporte."
            : "No se pudo liberar la retención de la tarjeta en Stripe. Intenta de nuevo.",
        code: "STRIPE_ERROR",
        detail: stripeError?.message,
      });
    }

    const [updated] = await db
      .update(schema.orders)
      .set({
        status: "cancelled",
        paymentStatus: newPaymentStatus as any,
        notes: reason ? `Rechazado: ${reason}` : order.notes,
        updatedAt: new Date(),
      })
      .where(eq(schema.orders.id, id))
      .returning();
    emitOrderUpdated({ ...updated, rejected: true });
    notifyOrderCancelled(updated).catch(() => {});
    res.json({ success: true, message, paymentStatus: newPaymentStatus });
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

  if (event.type === "payment_intent.amount_capturable_updated") {
    // Con captura manual, ESTE es el evento equivalente al "succeeded" de
    // antes: la tarjeta quedó autorizada (retenida) con éxito — todavía no se
    // cobró nada. Aquí es cuando el pedido debe caer a la PANTALLA VERDE del
    // POS (aceptar/rechazar). El cobro real ocurre después, al marcar "ready".
    const pi = event.data.object as Stripe.PaymentIntent;
    const orderId = pi.metadata?.orderId;
    if (orderId) {
      const [authorized] = await db
        .update(schema.orders)
        .set({
          paymentStatus: "authorized",
          updatedAt: new Date(),
        } as any)
        .where(and(eq(schema.orders.id, orderId), eq(schema.orders.paymentStatus, "pending")))
        .returning();
      if (authorized) {
        const complete = await db.query.orders.findFirst({
          where: eq(schema.orders.id, orderId),
          with: { items: true },
        });
        emitOnlineOrder(complete);
        notifyOrderReceived(authorized).catch(() => {});
      }
    }
  } else if (event.type === "payment_intent.succeeded") {
    // Con captura manual, esto ya NO dispara al pagar en el checkout — dispara
    // hasta que el POS realmente captura el cobro (ver PATCH /orders/:id/status
    // en orders.ts, al marcar "ready"). Es decir: aquí es cuando el dinero de
    // verdad se cobra. La orden ya está en cocina desde accept-online; esto
    // solo formaliza el pago para el corte de caja.
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
      if (paid) {
        const complete = await db.query.orders.findFirst({
          where: eq(schema.orders.id, orderId),
          with: { items: true },
        });
        emitOrderUpdated(complete);
      }
    }
  } else if (event.type === "payment_intent.payment_failed") {
    // La autorización nunca se completó (tarjeta rechazada, etc.) — la orden
    // ya existe como "pending" desde /intent; márcala como fallida y
    // cancelada en vez de dejarla en un limbo "pending" para siempre.
    const pi = event.data.object as Stripe.PaymentIntent;
    const orderId = pi.metadata?.orderId;
    if (orderId) {
      await db
        .update(schema.orders)
        .set({
          paymentStatus: "failed",
          status: "cancelled",
          updatedAt: new Date(),
        })
        .where(and(eq(schema.orders.id, orderId), eq(schema.orders.paymentStatus, "pending")));
    }
  } else if (event.type === "payment_intent.canceled") {
    // Puede llegar por dos caminos: (1) Stripe cancela solo una autorización
    // que nunca se resolvió, o (2) NOSOTROS cancelamos explícitamente al
    // rechazar un pedido desde el POS (reject-online) — en ese caso la BD ya
    // se actualizó ahí mismo de forma síncrona, este evento solo llega después
    // y no debe pisar nada más reciente. El guard cubre "pending" (autorización
    // abandonada) y "authorized" (por si este evento gana la carrera al update
    // síncrono de reject-online — deja el mismo resultado final).
    const pi = event.data.object as Stripe.PaymentIntent;
    const orderId = pi.metadata?.orderId;
    if (orderId) {
      await db
        .update(schema.orders)
        .set({
          paymentStatus: "canceled",
          status: "cancelled",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.orders.id, orderId),
            sql`${schema.orders.paymentStatus} IN ('pending', 'authorized')`
          )
        );
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
