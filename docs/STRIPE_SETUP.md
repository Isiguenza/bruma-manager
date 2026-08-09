# Pedidos en línea con Stripe — Guía de setup

Esta guía cubre TODO lo que hay que crear/configurar para que funcionen los pedidos
en línea (web → Stripe → POS pantalla verde).

---

## 0) Migración de base de datos (Neon)

Corre una sola vez el archivo `drizzle/manual_online_orders.sql`. Resumen:

```sql
-- Fuera de transacción:
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'online';

-- Columnas de pedido en línea:
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone           varchar(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_type            varchar(20);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address         text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_lat             numeric(10,7);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_lng             numeric(10,7);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee             numeric(10,2) DEFAULT '0';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_payment_intent_id varchar(255);

-- Tabla de ajustes (coords, tarifas, horario, toggle):
CREATE TABLE IF NOT EXISTS restaurant_settings ( ... );  -- ver el .sql completo
```

> Nota: en Neon corre los `ALTER TYPE ... ADD VALUE` **por separado** (no dentro de una
> transacción con otras sentencias).

Después de correrlo, entra al **dashboard → Ajustes** y captura:
- **Coordenadas del restaurante** (lat/lng) — con el mapa.
- **Tarifas de envío** (por defecto ≤600 m = $25, 600–1200 m = $40).
- **Horario de servicio** y el **toggle** de pedidos en línea (ON).

---

## 1) Cuenta y llaves de Stripe

1. Crea cuenta en https://stripe.com (usa **modo test** primero).
2. Dashboard de Stripe → **Developers → API keys**:
   - **Publishable key** (`pk_test_...`) → va en la **web**.
   - **Secret key** (`sk_test_...`) → va en el **api-server**.
3. Moneda: **MXN**. Los montos se manejan en **centavos** (el código ya multiplica ×100).

---

## 2) Variables de entorno

### api-server (`api-server/.env`)
```
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx        # (del paso 3)
```
Instala la dependencia:
```
cd api-server && npm install    # instala stripe (ya está en package.json)
```

### BRUMA Web (`BRUMA Web/bruma-nextjs/.env.local`)
```
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx
NEXT_PUBLIC_ORDERS_API_URL=https://api.cocinabruma.com.mx   # api-server
```

---

## 3) Webhook de Stripe

El pago se **confirma por webhook** (no confíes solo en el front).

1. Stripe Dashboard → **Developers → Webhooks → Add endpoint**.
2. Endpoint URL: `https://api.cocinabruma.com.mx/api/webhooks/stripe`
3. Evento a escuchar: **`payment_intent.succeeded`**.
4. Copia el **Signing secret** (`whsec_...`) → ponlo en `STRIPE_WEBHOOK_SECRET`.

> Importante: el webhook usa el **body RAW** para verificar la firma. Ya está montado
> con `express.raw` **antes** de `express.json` en `api-server/src/index.ts`. No cambies
> ese orden.

### Probar el webhook en local
```
stripe login
stripe listen --forward-to localhost:3001/api/webhooks/stripe
# copia el whsec_... que imprime a tu .env local
```
(ajusta el puerto al del api-server)

---

## 4) Tarjetas de prueba

| Caso | Número |
|---|---|
| Pago exitoso | `4242 4242 4242 4242` |
| Requiere 3DS | `4000 0025 0000 3155` |
| Rechazada | `4000 0000 0000 0002` |

Cualquier fecha futura, CVC de 3 dígitos, CP cualquiera.

---

## 5) Flujo completo (para verificar)

1. Cliente ordena en la web (`/menu` → carrito → `/checkout`), elige recoger o envío
   (marca ubicación en el mapa; el fee se calcula por distancia), paga con Stripe.
2. `payment_intent.succeeded` → el api-server marca la orden **pagada**, la engancha a la
   **caja abierta** y emite `order:online` → **pantalla verde** en el POS.
3. En el POS: **Aceptar** (entra a cocina + comanda) o **Rechazar** (reembolso automático
   por Stripe + orden cancelada).
4. En el **Corte**: la venta aparece en el bucket **`online`** y el envío en **propinas
   online** (sin la comisión del 3.5% de la terminal).

---

## 6) Producción (checklist)

- [ ] Migración corrida en la BD de producción.
- [ ] Llaves **live** (`pk_live_`, `sk_live_`) en las envs de prod.
- [ ] Webhook de prod apuntando a `https://api.cocinabruma.com.mx/api/webhooks/stripe`
      con su propio `whsec_...` (los secrets de test y live son distintos).
- [ ] Coordenadas/tarifas/horario capturados en Ajustes.
- [ ] `npm install` en api-server y en la web; redeploys; POS recompilado.
