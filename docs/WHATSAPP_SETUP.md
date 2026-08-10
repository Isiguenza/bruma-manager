# Notificaciones de WhatsApp — Guía de credenciales y plantillas

Mandamos un WhatsApp automático en 5 momentos del pedido en línea:

1. **Recibido** — se pagó y cayó a la pantalla verde del POS.
2. **Confirmado** — el POS aceptó el pedido (incluye la hora en que estará listo).
3. **Listo** — el POS lo marca listo (para recoger o para el repartidor).
4. **En camino** — el POS lo marca en camino (solo pedidos a domicilio).
5. **Cancelado** — se rechazó / se emitió reembolso.

Usamos la **WhatsApp Cloud API de Meta** directo. El código y el webhook **ya existían**
en el proyecto (se usaban para confirmar reservaciones) — solo se reutilizó el mismo
patrón para los pedidos en línea, así que las credenciales van en las **mismas**
variables de entorno que ya tenías configuradas.

---

## 1) Credenciales — ya están cargadas ✅

Ya me pasaste las 3 y quedaron en `api-server/.env`:

| Variable | Qué es | Dónde se saca |
|---|---|---|
| `META_WA_PHONE_ID` | Phone number ID | Meta for Developers → tu app → WhatsApp → API Setup, bajo "From" |
| `META_WA_TOKEN` | Access token | Mismo lugar, botón "Generar token" (el de 24h para pruebas) |
| `META_WA_BUSINESS_ACCOUNT_ID` | WABA ID | Mismo lugar, arriba a la derecha (no se usa para mandar mensajes, pero queda guardado por si luego administramos plantillas por API) |

⚠️ El **token que me pasaste expira en 24h** (es el de prueba). Cuando quieras dejarlo
en serio, genera uno **permanente**:

1. [business.facebook.com/settings](https://business.facebook.com/settings) →
   **Usuarios → Usuarios del sistema**.
2. Crea o usa un Usuario del Sistema (rol *Admin*) → **Añadir activos** → tu app → *Control total*.
3. **Generar nuevo token** → permisos `whatsapp_business_messaging` +
   `whatsapp_business_management` → duración **"Nunca expira"**.
4. Reemplaza el valor de `META_WA_TOKEN` en `.env` con ese token.

---

## 2) El webhook — tu pregunta de "no sé cómo sacarlo"

El **verify token no se saca de Meta** — es una palabra secreta que tú (o una sesión
anterior) inventaste, y **ya estaba puesta**:

```
META_WA_VERIFY_TOKEN=cab282b5fc7a51cf4b954d8d1073bdc70aa42aae3b54df55
```

El endpoint que Meta necesita **ya existe y ya está desplegado** (no hace falta ngrok
ni nada local — el api-server ya es público):

```
https://api.cocinabruma.com.mx/api/whatsapp/webhook
```

Para activarlo del lado de Meta:

1. Meta for Developers → tu app → **WhatsApp → Configuración** (*Configuration*).
2. Sección **Webhook** → **Editar**.
3. **Callback URL**: `https://api.cocinabruma.com.mx/api/whatsapp/webhook`
4. **Verify token**: pega exactamente `cab282b5fc7a51cf4b954d8d1073bdc70aa42aae3b54df55`
5. **Verificar y guardar** — Meta va a hacer un GET a esa URL; si contesta bien (ya lo
   hace, ver `api-server/src/routes/whatsapp.ts`), se pone en verde ✅.
6. Debajo, en **"Webhook fields"**, suscríbete al campo **`messages`** (para recibir
   confirmaciones de entrega/lectura de lo que mandemos — no es indispensable para que
   salgan los mensajes, pero sirve para depurar si algo no llegó).

Esto **no afecta el envío** de las notificaciones (eso es un POST que hacemos nosotros
hacia Meta) — el webhook es solo para que Meta nos avise cosas a nosotros (entregado,
leído, o si el cliente responde). Es opcional para que ya funcione, pero déjalo
configurado ya que estamos.

---

## 3) Plantillas — esto SÍ falta

WhatsApp no deja mandar texto libre cuando el negocio inicia la conversación (nuestro
caso). Cada mensaje necesita una **plantilla aprobada**. El código ya está listo
esperando estos 5 nombres exactos:

1. Ve a **[business.facebook.com/wa/manage/message-templates](https://business.facebook.com/wa/manage/message-templates)**.
2. Crea estas 5, categoría **Utilidad** (*Utility*), idioma **Español (MX)**:

| Nombre (exacto, usado por el código) | Texto sugerido | Variables |
|---|---|---|
| `pedido_recibido` | Hola {{1}}, recibimos tu pedido #{{2}} por {{3}}. Te avisamos cuando lo confirmemos. | nombre, # de orden, total |
| `pedido_confirmado` | ¡Tu pedido #{{1}} en Bruma fue confirmado! Estará listo aprox. a las {{2}}. | # de orden, hora estimada |
| `pedido_listo` | Tu pedido #{{1}} ya está listo {{2}}. | # de orden, "para recoger" / "para tu repartidor" |
| `pedido_en_camino` | Tu pedido #{{1}} va en camino 🛵. Llega en aprox. {{2}}. | # de orden, tiempo |
| `pedido_cancelado` | Tu pedido #{{1}} fue cancelado y ya emitimos tu reembolso. | # de orden |

### Botón CTA (link al pedido) en `pedido_confirmado` y `pedido_listo`

Estas dos plantillas llevan además un **botón con URL dinámica** que abre la página de
seguimiento del pedido (`https://cocinabruma.com.mx/checkout/confirmacion?orderId=...`).
Como ya están **Aprobadas**, para agregarlo:

1. WhatsApp Manager → Plantillas de mensaje → abre `pedido_confirmado` → **Editar**
   (esto crea una nueva versión y la vuelve a mandar a revisión — es normal).
2. Sección **Botones** → **Agregar un botón** → **Ir a un sitio web** (*Visit website*).
3. Texto del botón: por ejemplo `Ver mi pedido`.
4. Tipo de URL: **Dinámica**.
5. URL del sitio web:
   ```
   https://cocinabruma.com.mx/checkout/confirmacion?orderId={{1}}
   ```
   Meta va a pedir un **valor de ejemplo** para `{{1}}` — pon cualquier UUID de prueba
   (ej. `a1b2c3d4-e5f6-7890-abcd-ef1234567890`).
6. Guarda y repite lo mismo para `pedido_listo`.

El código ya manda el `orderId` real como el valor que rellena ese `{{1}}` — no hace
falta tocar nada más una vez que el botón quede aprobado en ambas plantillas.

- Aprobación: de minutos a ~24h (verás el status *En revisión → Aprobada* en el mismo panel).
- **Si les pones otros nombres**, dime cuáles usaste y ajusto el código
  (están en `api-server/src/lib/whatsapp.ts`, son 5 líneas cambiar).

---

## 4) Dónde quedó enganchado en el código

| Evento | Dónde pasa | Plantilla |
|---|---|---|
| Pago confirmado (Stripe) | `routes/online-orders.ts` → webhook de Stripe | `pedido_recibido` |
| POS acepta (pantalla verde → Aceptar) | `POST /orders/:id/accept-online` | `pedido_confirmado` (usa el tiempo que editaste en la pantalla del pedido) |
| POS marca "Marcar listo" | `PATCH /orders/:id/status` (botón nuevo en el carrito, solo pedidos web) | `pedido_listo` |
| POS marca "Marcar en camino" | Mismo endpoint, solo domicilio, después de "listo" | `pedido_en_camino` |
| POS rechaza / reembolso | `POST /orders/:id/reject-online` | `pedido_cancelado` |

En el POS, para pedidos **web** pagados aparece un flujo nuevo antes de "Finalizar
orden": **Marcar listo** → (si es domicilio) **Marcar en camino** → **Finalizar orden**.
Para mesas y pedidos normales para llevar (no web) no cambia nada.

Si falta `META_WA_PHONE_ID`/`META_WA_TOKEN` o la plantilla no existe/no está aprobada,
el envío falla **en silencio** (no rompe el flujo del POS) — el error queda en los logs
del api-server (`❌ WhatsApp error (...)`).

---

## 5) Probar rápido sin esperar las plantillas

Con el token y el Phone Number ID que ya están en `.env`, puedes probar la conexión con
la plantilla `hello_world` que Meta da por default (no requiere crear nada):

```bash
curl -X POST "https://graph.facebook.com/v19.0/1135287829664264/messages" \
  -H "Authorization: Bearer <META_WA_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "521XXXXXXXXXX",
    "type": "template",
    "template": { "name": "hello_world", "language": { "code": "en_US" } }
  }'
```

Mientras la app esté en modo Desarrollo, `to` **debe ser un número que agregaste como
destinatario de prueba** (WhatsApp → API Setup → sección "To" → *Manage phone number
list*, hasta 5 números, verificados con un código que te llega por WhatsApp).

---

## 6) Producción (checklist, para más adelante)

- [ ] Negocio verificado en Meta (para mandar a cualquier cliente, no solo a números de prueba).
- [ ] `META_WA_TOKEN` **permanente** (Usuario del Sistema, no el de 24h).
- [ ] Las 5 plantillas **aprobadas** (no solo "en revisión").
- [ ] Webhook verificado en Meta apuntando a `https://api.cocinabruma.com.mx/api/whatsapp/webhook`.
- [ ] Mismo `.env` (con el token permanente) en el api-server de producción.
