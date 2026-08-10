// Notificaciones de WhatsApp para pedidos en línea. Reusa las mismas env vars
// que ya usa routes/reservations.ts (META_WA_PHONE_ID, META_WA_TOKEN) y el
// webhook ya montado en routes/whatsapp.ts (META_WA_VERIFY_TOKEN).

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("52") ? digits : `52${digits}`;
}

async function sendTemplate(phone: string, template: string, params: string[]) {
  const phoneId = process.env.META_WA_PHONE_ID;
  const token = process.env.META_WA_TOKEN;
  if (!phoneId || !token) return; // WhatsApp no configurado — no-op silencioso

  const to = normalizePhone(phone);
  try {
    const resp = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: template,
          language: { code: "es_MX" },
          components: [
            { type: "body", parameters: params.map((text) => ({ type: "text", text })) },
          ],
        },
      }),
    });
    if (!resp.ok) {
      const err = await resp.text();
      console.error(`❌ WhatsApp error (${template}):`, resp.status, err);
    } else {
      console.log(`📱 WhatsApp "${template}" enviado a ${to}`);
    }
  } catch (err) {
    console.error(`❌ WhatsApp fetch error (${template}):`, err);
  }
}

function money(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? parseFloat(n) : n ?? 0;
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(v || 0);
}

/** Hora de reloj (America/Mexico_City) dentro de `minutes` a partir de ahora. */
function clockTimeIn(minutes: number): string {
  const target = new Date(Date.now() + minutes * 60_000);
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(target);
}

type NotifiableOrder = {
  customerName?: string | null;
  customerPhone?: string | null;
  orderNumber: number;
  total?: string | null;
  estimatedReadyMinutes?: number | null;
  deliveryType?: string | null;
};

/** Se pagó y cayó a la pantalla verde del POS (aún no confirmado por cocina). */
export async function notifyOrderReceived(order: NotifiableOrder) {
  if (!order.customerPhone) return;
  await sendTemplate(order.customerPhone, "pedido_recibido", [
    order.customerName || "Cliente",
    String(order.orderNumber),
    money(order.total),
  ]);
}

/** El POS aceptó el pedido (entra a cocina). */
export async function notifyOrderConfirmed(order: NotifiableOrder) {
  if (!order.customerPhone) return;
  const eta = order.estimatedReadyMinutes ? clockTimeIn(order.estimatedReadyMinutes) : "pronto";
  await sendTemplate(order.customerPhone, "pedido_confirmado", [String(order.orderNumber), eta]);
}

/** El pedido está listo (para recoger o para salir a reparto). */
export async function notifyOrderReady(order: NotifiableOrder) {
  if (!order.customerPhone) return;
  const where = order.deliveryType === "delivery" ? "para tu repartidor" : "para recoger";
  await sendTemplate(order.customerPhone, "pedido_listo", [String(order.orderNumber), where]);
}

/** El pedido salió a reparto (solo domicilio). */
export async function notifyOrderOutForDelivery(order: NotifiableOrder) {
  if (!order.customerPhone) return;
  await sendTemplate(order.customerPhone, "pedido_en_camino", [String(order.orderNumber), "unos minutos"]);
}

/** El pedido se rechazó/canceló (con reembolso). */
export async function notifyOrderCancelled(order: NotifiableOrder) {
  if (!order.customerPhone) return;
  await sendTemplate(order.customerPhone, "pedido_cancelado", [String(order.orderNumber)]);
}
