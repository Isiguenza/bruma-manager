# Flujos v2 — cómo probar

> Migración de datos **ya aplicada** en la Neon de producción (2026-10-02).
> Nada está commiteado: todo vive en el working tree de `newDispatch`.

## 0. Estado del catálogo después de la migración

**Café** pasó de 15 productos a 9. Los 6 duplicados se consolidaron en variantes
Frío/Caliente con los precios exactos de antes:

| Producto | Variantes | Tag |
|---|---|---|
| Americano | Frío $39 · Caliente $40 | — |
| Capuccino | Frío $40 · Caliente $45 | `con-leche` |
| Caramel | Frío $45 · Caliente $50 | `con-leche` |
| Chocolate | Frío $45 · Caliente $50 | `con-leche` |
| Moka | Frío $45 · Caliente $50 | `con-leche` |
| Latte | Frío $40 · Caliente $45 | `con-leche` |
| Coffee tonic | sin variantes (solo frío) | — |
| Tissana Frutal | sin variantes (solo caliente) | — |
| Espresso | Sencillo $30 · Doble $39 (sin cambios) | — |

Las subcategorías `Fríos` y `Calientes` quedaron **inactivas** (no borradas: los
productos soft-deleteados las referencian). El `modifier_steps` viejo de
"Tipo de Leche" quedó **desactivado** — era el que preguntaba leche a Americano
y a Tissana.

Los 3 productos `Paquete *` están **soft-deleteados** y la categoría `Paquetes`
inactiva. El histórico de órdenes se preserva: `order_items` guarda
`product_name` plano.

**7 flujos creados:**

| Flujo | Scope | Aplica a |
|---|---|---|
| Paquete | global, priority 100 | Aguachiles, Camarones, Caldos, Ceviches, Pescado, Especiales |
| Café | categoría | Café |
| Bebidas — Bebida Preparada | categoría | Bebidas |
| Coctel mixto / Tostada mixta / Ceviche mixto / Tenders de pollo | producto | cada uno su producto |

## 1. Levantar el backend en local

```bash
cd api-server
STRIPE_SECRET_KEY=sk_test_dummy_local_only npm run dev
```

**La variable dummy es obligatoria.** `api-server/.env` **no** tiene
`STRIPE_SECRET_KEY`, y `src/routes/online-orders.ts:12` construye el cliente de
Stripe en tiempo de carga del módulo: sin la key lanza
`Neither apiKey nor config.authenticator provided` y **mata el proceso entero**
antes de que el servidor escuche. No es un problema de flujos, es un papercut de
entorno local que ya existía.

Verificar: `curl http://localhost:4000/health`

## 2. Probar el editor de flujos (dashboard)

```bash
npm run dev    # en la raíz
```

- `/flows` — lista de flujos, crear, duplicar, activar/desactivar, targets
- Abre el flujo **Café** y revisa que se vea: el nodo de paso `__router Café`
  (invisible para el mesero), el nodo `Tipo de leche`, y **la arista
  condicionada** con `variantNameIn: ["Caliente"]` + `productHasTag: "con-leche"`.
- Abre **Paquete** y revisa los tres `flow_option_price_overrides`
  (Aguachiles +61, Camarones +49, Caldos +64) y que el nodo `Bebida` apunte a la
  **categoría Bebidas completa** — por eso una bebida nueva aparece sola.
- **El simulador** es lo que más rápido te da señal: elige producto y variante y
  recorre el grafo sin tocar un iPad.

**Lo que hay que ver en el canvas:** las aristas ahora **mandan**. Conectar dos
nodos define el siguiente paso, y el orden de las aristas que salen de un nodo
decide cuál gana (la primera que cumple, por `sortOrder`). La de `sortOrder`
menor es además el camino que se usa para aplanar el grafo hacia los clientes
viejos.

## 3. Probar el POS (iPad y iPhone)

```bash
# los dos targets compilan; usa XcodeBuildMCP o Xcode directo
xcodebuild build -scheme "Bruma POS"        -destination "generic/platform=iOS Simulator"
xcodebuild build -scheme "Bruma POS Mobile" -destination "generic/platform=iOS Simulator"
```

Casos a probar, en este orden:

1. **Capuccino → Caliente** → debe preguntar *Tipo de leche* (Deslactosada,
   Avena +$6).
2. **Capuccino → Frío** → **no** debe preguntar leche.
3. **Americano → Caliente** → **no** debe preguntar leche (no tiene el tag).
   Esto es el bug viejo que se arregló.
4. **Coffee tonic** → no pide variante ni leche.
5. **Aguachile Verde** → pregunta *¿Paquete?*. Con "Hacer paquete" el total debe
   quedar en **$280** (219 + 61) y pedir Entrada y Bebida.
6. **Pepsi** → **no** debe ofrecer paquete.

En el flujo, verifica la UX: breadcrumb del camino tappable, precio en vivo en
el header, pantalla de resumen antes de confirmar, y que "Atrás" **recupere** lo
que ya habías elegido.

## 4. Probar el paquete de punta a punta

Al mandar un paquete a cocina debe pasar esto:

- **Carrito**: el plato fuerte como padre con badge de paquete, y la entrada y la
  bebida **anidadas** debajo. Borrar el padre borra el grupo.
- **Orden**: 3 `order_items` — el padre con el precio del paquete, los hijos a
  $0 con `parent_item_id`. `orders.subtotal` = **solo el padre**.
- **Comanda**: el padre con `[PAQUETE]`, los hijos de comida indentados debajo,
  y la bebida en la sección **BEBIDAS** (no hay impresora de barra; es una
  sección de la misma comanda).
- **Pase (BRUMA_Dispatch)**: la entrada, el plato y el extra como **renglones
  independientes, cada uno con su propio tap**. Marcar el padre **no** marca a
  los hijos — eso es a propósito, es el control que pediste.

## 5. Lo que falta decidir: 3 deltas de paquete

El flujo global `Paquete` incluye **Ceviches, Pescado y Especiales**, pero esas
tres **no tienen delta definido** (quedaron en $0, porque no existía un producto
"Paquete" de esas categorías del cual deducirlo). Hoy, hacer paquete de un
ceviche no cobra nada extra.

Se arregla en el editor: flujo `Paquete` → nodo `¿Paquete?` → opción
`Hacer paquete` → agregar un override por categoría. O quita esas tres de los
targets si no van a tener paquete.

## 6. Verificación rápida de que todo sigue sano

```bash
npx tsc --noEmit                                              # raíz: limpio
cd api-server && npx tsc --noEmit | grep -c "error TS"        # 14 (preexistentes)
./api-server/node_modules/.bin/tsx lib/flows/__tests__/engine.test.ts
./api-server/node_modules/.bin/tsx lib/flows/__tests__/compose.test.ts
./api-server/node_modules/.bin/tsx api-server/src/lib/__tests__/flowCompose.test.ts
```

Los 14 errores de `api-server` son **preexistentes** y ajenos a los flujos
(`inventory.ts`, `loyalty.ts`, `orders.ts`, `promotions.ts`, `reservations.ts`:
drift entre el schema y las rutas). Dos de ellos, en `orders.ts` 2040 y 2072,
escriben un campo `status` que `order_items` **no tiene** — es un bug latente
aparte que hay que decidir por separado.

## 7. Si algo sale mal

- **Un producto no muestra el flujo que esperabas** → pide el grafo directo y
  mira qué flujos compuso:
  `curl "http://localhost:4000/api/products/<id>/flow?format=graph"`
  El campo `flows[]` dice exactamente qué flujos aplicaron y por qué scope.
- **El formato viejo** (lo que consumen la web pública y las apps en TestFlight)
  se obtiene sin el parámetro: `curl ".../flow"`. Debe devolver
  `{ productId, useDefaultFlow, steps[], source }` con el camino default
  aplanado. Si eso se rompe, el menú en línea se queda sin modificadores **en
  silencio**.
- **Un producto sin grafo** responde 404 en `?format=graph`. El POS lo trata
  como "sin flujo" y agrega el producto directo: es el comportamiento correcto.
