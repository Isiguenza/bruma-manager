# Notificaciones de WhatsApp — Guía de credenciales (pruebas)

Vamos a mandar un WhatsApp automático cuando cambie el status de un pedido en línea:

1. **Recibido** (se pagó / cayó al POS)
2. **Confirmado** (el POS aceptó el pedido)
3. **Listo** (para recoger o listo para salir)
4. **En camino** (solo si es a domicilio)
5. **Cancelado** (rechazado / reembolsado)

Esto usa la **WhatsApp Cloud API de Meta** directo (sin Twilio ni terceros). Como ya
tienes la app creada en Meta for Developers, esta guía es solo para **sacar las
credenciales** que necesito del lado del código. No hace falta que instales nada tú —
yo integro el envío en el `api-server`; tú solo me pasas los valores de abajo (o los
metes directo en el `.env`, como prefieras).

---

## 1) Dónde sacar cada credencial

Entra a **[developers.facebook.com/apps](https://developers.facebook.com/apps)** →
selecciona tu app → menú lateral **WhatsApp → Configuración de la API** (*API Setup*).
Ahí vas a ver casi todo lo que necesito:

| Credencial | Dónde está | Para qué sirve |
|---|---|---|
| **Phone number ID** | WhatsApp → API Setup, bajo "From" (el número de prueba que Meta te dio, o tu número de negocio si ya lo agregaste) | Identifica desde qué número se manda el mensaje |
| **WhatsApp Business Account ID (WABA ID)** | WhatsApp → API Setup, arriba a la derecha, o en **Configuración del negocio → Cuentas de WhatsApp** | Identifica la cuenta de WhatsApp Business dueña del número y las plantillas |
| **Token temporal (24h)** | WhatsApp → API Setup, botón "Generar token" / ya aparece uno generado | Sirve **solo para probar ya mismo** por curl/Postman — expira en 24h |
| **App ID** | Configuración → Básica (menú lateral de la app, no de WhatsApp) | Identifica la app en Meta |
| **App Secret** | Configuración → Básica, botón "Mostrar" junto a *Clave secreta* | Solo si vamos a verificar la firma del webhook (opcional para v1, ver abajo) |

### Token permanente (para que no se caiga cada 24h)

El token de arriba expira en 24 horas — sirve para probar hoy, pero no para producción.
Para uno que no expire:

1. Ve a **[business.facebook.com/settings](https://business.facebook.com/settings)**
   (Configuración del negocio) → **Usuarios → Usuarios del sistema**.
2. Crea un **Usuario del sistema** (rol *Admin*) si no tienes uno, o usa uno existente.
3. **Añadir activos** → selecciona tu **app** de WhatsApp → dale permiso *Control total*.
4. Botón **Generar nuevo token**:
   - App: la tuya.
   - Permisos: marca **`whatsapp_business_messaging`** y **`whatsapp_business_management`**.
   - Duración: **"Nunca expira"**.
5. Copia ese token — **este es el que va a producción** (`WHATSAPP_ACCESS_TOKEN`).

> Para probar HOY mismo puedes usar el token temporal de 24h; cuando quieras dejarlo
> corriendo en serio, cambia el valor por el permanente. No hay que tocar código, solo
> el `.env`.

---

## 2) Números de prueba (sandbox)

Mientras tu app esté en modo **Desarrollo** (antes de que Meta verifique tu negocio),
**solo puedes mandar mensajes a números que agregues como "destinatario de prueba"**:

1. WhatsApp → API Setup → sección **"To"**.
2. **Manage phone number list** → agrega tu celular (y hasta 4 más).
3. Te llega un código por WhatsApp a ese número — lo capturas para verificarlo.
4. Listo, ya puedes mandarte mensajes de prueba a ese número desde el número de prueba
   de Meta.

Para mandar a **cualquier cliente real** (no solo a tus números verificados), Meta pide
**verificar el negocio** (Business Verification) — esto normalmente ya lo tienes o lo
puedes iniciar en Configuración del negocio → Centro de seguridad → Verificación.
No es bloqueante para probar el flujo completo con tu propio número mientras tanto.

---

## 3) Plantillas de mensaje (importante)

WhatsApp **no deja mandar texto libre** cuando el negocio inicia la conversación (que es
justo nuestro caso: le avisamos al cliente sin que él nos haya escrito primero). Hay que
crear una **plantilla aprobada** por cada tipo de mensaje.

1. Ve a **[business.facebook.com/wa/manage/message-templates](https://business.facebook.com/wa/manage/message-templates)**
   (o WhatsApp Manager → Plantillas de mensaje).
2. Crea una plantilla por cada status, categoría **"Utilidad"** (*Utility* — son
   actualizaciones de un pedido ya hecho, no marketing):

| Nombre sugerido | Texto sugerido (variables entre `{{ }}`) |
|---|---|
| `pedido_recibido` | Hola {{1}}, recibimos tu pedido #{{2}} por {{3}}. Te avisamos cuando lo confirmemos. |
| `pedido_confirmado` | ¡Tu pedido #{{1}} en Bruma fue confirmado! Estará listo aprox. a las {{2}}. |
| `pedido_listo` | Tu pedido #{{1}} ya está listo {{2}}. |
| `pedido_en_camino` | Tu pedido #{{1}} va en camino 🛵. Llega en aprox. {{2}}. |
| `pedido_cancelado` | Tu pedido #{{1}} fue cancelado y ya emitimos tu reembolso. |

- El **idioma** debe ser `Español (MX)`.
- Cada plantilla tarda de minutos a ~24h en aprobarse (verás el status en el mismo
  panel: *En revisión → Aprobada*).
- **Los nombres exactos que uses** (`pedido_recibido`, etc.) son los que voy a poner en
  el código — avísame si les pones otros nombres, o dime cuáles usaste.

---

## 4) Lo que necesito que me pases

Copia estos 4 valores (o pégalos tú mismo en `api-server/.env` si prefieres):

```bash
WHATSAPP_ACCESS_TOKEN=EAAxxxxxxxxxxxxx        # el temporal para probar, o el permanente
WHATSAPP_PHONE_NUMBER_ID=1234567890123456     # "Phone number ID" del paso 1
WHATSAPP_BUSINESS_ACCOUNT_ID=1234567890123456 # "WABA ID" del paso 1
WHATSAPP_WEBHOOK_VERIFY_TOKEN=cualquier-palabra-secreta-que-inventes
```

El último (`WHATSAPP_WEBHOOK_VERIFY_TOKEN`) **no lo sacas de Meta** — te lo inventas tú
(ej. una contraseña random). Solo es necesario si más adelante queremos recibir
confirmaciones de entrega/lectura desde Meta (webhook). Para la primera versión (solo
mandar mensajes) no es indispensable, pero no cuesta nada tenerlo listo.

---

## 5) Probar que ya jala (antes de integrarlo al código)

Con el token temporal y el Phone Number ID puedes probar ya mismo por terminal:

```bash
curl -X POST "https://graph.facebook.com/v21.0/<PHONE_NUMBER_ID>/messages" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "521XXXXXXXXXX",
    "type": "template",
    "template": {
      "name": "hello_world",
      "language": { "code": "en_US" }
    }
  }'
```

(`hello_world` es una plantilla que Meta te da por default para probar, sin necesidad de
crear ninguna). Si te llega el WhatsApp, las credenciales están bien y ya puedo integrar
el envío real con las plantillas de la tabla de arriba.

> El número `to` va en formato internacional **sin `+` ni espacios**: código de país +
> número. Para México celular: `521` + 10 dígitos (ej. `5215544332211`).

---

## 6) Producción (checklist, para más adelante)

- [ ] Negocio verificado en Meta (para mandar a cualquier cliente, no solo a números de prueba).
- [ ] Token **permanente** de Usuario del Sistema (no el de 24h).
- [ ] Las 5 plantillas **aprobadas** (no solo "en revisión").
- [ ] Número de WhatsApp Business real conectado (no el número de prueba de Meta).
- [ ] Variables en el `.env` de producción del `api-server`.
