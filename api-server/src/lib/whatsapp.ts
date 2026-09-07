// Notificaciones de WhatsApp para pedidos en línea. Reusa las mismas env vars
// que ya usa routes/reservations.ts (META_WA_PHONE_ID, META_WA_TOKEN) y el
// webhook ya montado en routes/whatsapp.ts (META_WA_VERIFY_TOKEN).

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("52") ? digits : `52${digits}`;
}

/**
 * `buttonUrlParam`, si viene, es el valor que rellena el botón CTA de URL
 * dinámica de la plantilla (configurado en Meta como
 * `https://cocinabruma.com.mx/checkout/confirmacion?orderId={{1}}`) — se
 * manda como componente `button` aparte de las variables del cuerpo del
 * mensaje.
 */
async function sendTemplate(phone: string, template: string, params: string[], buttonUrlParam?: string) {
  const phoneId = process.env.META_WA_PHONE_ID;
  const token = process.env.META_WA_TOKEN;
  if (!phoneId || !token) return; // WhatsApp no configurado — no-op silencioso

  const to = normalizePhone(phone);
  const components: Record<string, unknown>[] = [
    { type: "body", parameters: params.map((text) => ({ type: "text", text })) },
  ];
  if (buttonUrlParam) {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: buttonUrlParam }],
    });
  }

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
          // Las plantillas se crearon con idioma "Spanish" (código `es`), no
          // "Spanish (MEX)" (`es_MX`) — hay que usar el código que Meta
          // realmente tiene asociado a cada plantilla.
          language: { code: "es" },
          components,
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
  id: string;
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

/**
 * El POS aceptó el pedido (entra a cocina).
 *
 * NOTA: la plantilla `pedido_confirmado` en Meta todavía NO tiene el botón
 * CTA (solo tiene el BODY) — mandar el componente `button` hace que Meta
 * rechace el mensaje completo. Por eso no se pasa `order.id` aquí. En cuanto
 * agregues el botón "Ir a un sitio web" (URL dinámica) en Meta, vuelve a
 * agregar `, order.id` al final de la llamada de abajo.
 */
export async function notifyOrderConfirmed(order: NotifiableOrder) {
  if (!order.customerPhone) return;
  const eta = order.estimatedReadyMinutes ? clockTimeIn(order.estimatedReadyMinutes) : "pronto";
  await sendTemplate(order.customerPhone, "pedido_confirmado", [String(order.orderNumber), eta]);
}

/**
 * El pedido está listo (para recoger o para salir a reparto).
 * Mismo caso que `notifyOrderConfirmed`: sin botón CTA por ahora en Meta.
 */
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

// ---------------------------------------------------------------------------
// Auto-respuesta "este número es solo para notificaciones"
// ---------------------------------------------------------------------------

// Cuando un cliente responde a un mensaje nuestro, abre una ventana de 24h de
// atención — dentro de esa ventana SÍ se permite mandar texto libre (no hace
// falta plantilla). Le contestamos una sola vez cada AUTO_REPLY_COOLDOWN_MS por
// número, para no spamear si manda varios mensajes seguidos.
const AUTO_REPLY_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const lastAutoReplyAt = new Map<string, number>();

const DEFAULT_AUTO_REPLY =
  "Este chat es solo para avisos automáticos de tu pedido y no se contesta por aquí. " +
  "Si necesitas algo, contáctanos por nuestras redes sociales o por teléfono. ¡Gracias!";

/** Manda un mensaje de texto libre (solo válido dentro de la ventana de 24h). */
async function sendWhatsAppText(phone: string, text: string) {
  const phoneId = process.env.META_WA_PHONE_ID;
  const token = process.env.META_WA_TOKEN;
  if (!phoneId || !token) return;

  const to = normalizePhone(phone);
  try {
    const resp = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text, preview_url: false },
      }),
    });
    if (!resp.ok) {
      console.error("❌ WhatsApp auto-reply error:", resp.status, await resp.text());
    } else {
      console.log(`📱 WhatsApp auto-reply enviado a ${to}`);
    }
  } catch (err) {
    console.error("❌ WhatsApp auto-reply fetch error:", err);
  }
}

/** Llamar por cada mensaje ENTRANTE de un cliente (desde el webhook). Contesta
 * el aviso de "solo notificaciones" con rate-limit por número. */
export async function handleInboundWhatsApp(from: string): Promise<void> {
  if (!from) return;
  const now = Date.now();
  const last = lastAutoReplyAt.get(from) ?? 0;
  if (now - last < AUTO_REPLY_COOLDOWN_MS) return;
  lastAutoReplyAt.set(from, now);

  const text = process.env.WHATSAPP_AUTO_REPLY?.trim() || DEFAULT_AUTO_REPLY;
  await sendWhatsAppText(from, text);
}
