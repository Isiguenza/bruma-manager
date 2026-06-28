# WhatsApp Business API — Guía de Configuración

Instrucciones para enviar confirmaciones de reservación por WhatsApp usando la **Meta WhatsApp Business Cloud API** (gratis hasta 1,000 conversaciones/mes).

---

## Requisitos previos

- Cuenta de Facebook/Meta activa
- Número de teléfono que **no** esté ya registrado en WhatsApp (puede ser el número de BRUMA, o un número nuevo solo para esto)
- Acceso al dashboard de bruma-manager para agregar variables de entorno

---

## Paso 1 — Crear una Meta Business Account

1. Ve a [business.facebook.com](https://business.facebook.com) e inicia sesión con tu cuenta de Facebook.
2. Crea una nueva Business Account para BRUMA (si no tienes una ya).
3. Verifica el negocio con los documentos que te pide Meta (puede tomar 1-3 días).

---

## Paso 2 — Crear una App de Meta para Desarrolladores

1. Ve a [developers.facebook.com](https://developers.facebook.com) → **My Apps** → **Create App**.
2. Selecciona tipo: **Business**.
3. Dale un nombre (e.g., "BRUMA Notificaciones").
4. Asocia la app a tu Business Account de BRUMA.

---

## Paso 3 — Agregar WhatsApp al App

1. En el dashboard de tu app, ve a **Add a Product** y selecciona **WhatsApp**.
2. Vincula la app a tu Meta Business Account.
3. En el menú lateral aparecerá **WhatsApp → Getting Started**.

---

## Paso 4 — Obtener un número de teléfono

En **WhatsApp → Getting Started**:

- **Número de prueba gratuito**: Meta te da un número temporal para testing. Solo puede enviar mensajes a 5 números "receptores de prueba" que registres manualmente. Úsalo para desarrollo.
- **Número propio**: Para producción, haz clic en **Add Phone Number**, ingresa el número de BRUMA, y verifica con código SMS/llamada.

Anota el **Phone Number ID** — lo necesitarás en las variables de entorno.

---

## Paso 5 — Generar el Access Token

### Token temporal (solo para pruebas — expira en 24h)
En **Getting Started**, copia el **Temporary Access Token**.

### Token permanente (para producción)
1. Ve a **Business Settings → System Users**.
2. Crea un System User con rol **Admin**.
3. Genera un token para ese usuario con los permisos:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
4. Copia el token — no se muestra de nuevo.

---

## Paso 6 — Registrar una Plantilla de Mensaje (Message Template)

Meta **requiere** usar plantillas aprobadas para mensajes business-initiated (enviados sin que el cliente haya escrito primero en las últimas 24h).

1. Ve a **WhatsApp → Message Templates** → **Create Template**.
2. Categoría: **UTILITY** (para confirmaciones transaccionales).
3. Nombre: `reservacion_confirmada` (snake_case, solo minúsculas).
4. Idioma: Español (es_MX).
5. Cuerpo del mensaje de ejemplo:

```
Hola {{1}}, tu reservación en BRUMA está confirmada.

Fecha: {{2}}
Hora: {{3}} hrs
Personas: {{4}}

Te esperamos en Av. Panamericana, Casa B14, Coyoacán.

¿Necesitas cambiar algo? Escríbenos: 56 3555 5587
```

6. Envía la plantilla para aprobación. Generalmente se aprueba en minutos, pero puede tardar hasta 24h.

---

## Paso 7 — Variables de entorno

Agrega en `.env.local` (y en los secrets del servidor de producción):

```env
META_WA_PHONE_ID=1234567890       # Phone Number ID de tu número en Meta
META_WA_TOKEN=EAAxxxxxxxx...      # Access Token permanente
META_WA_TEMPLATE=reservacion_confirmada
```

---

## Paso 8 — Implementar el envío en `app/api/public/reservations/route.ts`

Agrega esta función al archivo y llámala después de crear la reservación (igual que se hace con Mailgun):

```typescript
async function sendWhatsAppConfirmation({
  phone,
  name,
  date,
  time,
  guestCount,
}: {
  phone: string;
  name: string;
  date: string;
  time: string;
  guestCount: number;
}) {
  const [year, month, day] = date.split("-");
  const monthNames = [
    "enero","febrero","marzo","abril","mayo","junio",
    "julio","agosto","septiembre","octubre","noviembre","diciembre",
  ];
  const formattedDate = `${parseInt(day)} de ${monthNames[parseInt(month) - 1]} de ${year}`;

  // Normalize phone: remove spaces/dashes, ensure it starts with country code
  const normalized = phone.replace(/\D/g, "");
  const withCountry = normalized.startsWith("52") ? normalized : `52${normalized}`;

  const res = await fetch(
    `https://graph.facebook.com/v18.0/${process.env.META_WA_PHONE_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.META_WA_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: withCountry,
        type: "template",
        template: {
          name: process.env.META_WA_TEMPLATE ?? "reservacion_confirmada",
          language: { code: "es_MX" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: name.split(" ")[0] },
                { type: "text", text: formattedDate },
                { type: "text", text: time },
                { type: "text", text: String(guestCount) },
              ],
            },
          ],
        },
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WhatsApp API ${res.status}: ${text}`);
  }
}
```

Luego agregar la llamada en el POST handler, después de la llamada a `sendConfirmationEmail`:

```typescript
if (process.env.META_WA_PHONE_ID && process.env.META_WA_TOKEN) {
  await sendWhatsAppConfirmation({
    phone: customerPhone,
    name: fullName,
    date: reservationDate,
    time: reservationTime,
    guestCount: Number(guestCount),
  }).catch((err) => console.error("WhatsApp error:", err));
}
```

---

## Límites del tier gratuito

| Categoría | Límite |
|---|---|
| Conversaciones de utilidad | 1,000/mes gratis |
| Costo adicional (México) | ~$0.035 USD por conversación |
| Velocidad de envío | Depende del nivel de calidad del número |

Una "conversación" dura 24 horas — si el cliente responde, todos los mensajes en esa ventana cuentan como una sola conversación.

---

## Notas adicionales

- El número de WhatsApp Business **no puede** usarse en la app de WhatsApp normal al mismo tiempo. Considera un número secundario dedicado.
- Para aumentar el límite de mensajes, el número necesita mantener una buena "calidad de número" (pocas quejas de spam).
- Si el cliente ha escrito al número en las últimas 24h, puedes responder con cualquier mensaje (sin plantilla). Ideal para confirmaciones manuales.
- Documentación oficial: [developers.facebook.com/docs/whatsapp/cloud-api](https://developers.facebook.com/docs/whatsapp/cloud-api)
