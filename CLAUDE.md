# Bruma Manager

Monorepo para el sistema de restaurante de Cocina Bruma: backend, panel admin web,
apps de iOS (POS de iPad, comandas de iPhone, dispatch de delivery) y servidor de
impresión.

## Mantener este archivo actualizado

Al terminar una tarea no trivial (feature nueva, bug fix con causa no obvia,
cambio de arquitectura), agregar una nota breve aquí si el hallazgo es
durable y no es obvio con solo leer el código — mismo criterio que el resto
del archivo: gotchas, convenciones, decisiones de arquitectura. No convertir
esto en un changelog cronológico de tareas (para eso está `git log`); si algo
deja de aplicar, corregirlo o borrarlo en vez de apilar notas viejas.

## Mapa del repo

- **`app/`, `components/`, `lib/`** — panel admin/dashboard Next.js (App Router),
  Drizzle ORM + Neon Postgres (`drizzle/`, `drizzle.config.ts`). `package.json`
  name: `pos-espantapajaros`.
- **`api-server/`** — backend Express (REST + Socket.IO) que consumen TODOS los
  clientes (POS, Mobile, Dispatch, panel web). Producción:
  `https://api.cocinabruma.com.mx`. Rutas en `api-server/src/routes/*.ts`,
  eventos de socket en `api-server/src/sockets/events.ts`.
- **`Bruma POS/`** — proyecto Xcode (`Bruma POS.xcodeproj`) con DOS targets que
  comparten código real (ver sección de abajo):
  - `Bruma POS/Bruma POS/` — target "Bruma POS", iPad, POS completo (pagos,
    caja registradora, mapa de mesas, split de cuenta).
  - `Bruma POS/Bruma POS Mobile/` — target "Bruma POS Mobile", iPhone,
    solo-comandar (sin pagos/caja) para meseros.
- **`Bruma_waitress/`** — app de mesero VIEJA e independiente (su propio
  Models/Services/ViewModels, sin compartir código con POS). Se está
  retirando a favor de "Bruma POS Mobile" una vez validada en TestFlight —
  no seguir arreglando bugs ahí, el destino es Bruma POS Mobile.
- **`BRUMA_Dispatch/`** — proyecto Xcode. Nació como KDS de cocina; hoy cocina
  usa comanda impresa, así que se repurposó como **"Pase"** (expeditor): un
  iPad fijo en la ventana donde alguien marca cada platillo conforme sale.
  Tap por platillo → `POST /api/order-items/batch-ready` (`deliveredToTable`);
  tap de nuevo → `batch-unready`. Cuando todos los items de una orden dine-in
  están entregados, el backend la pasa sola a `ready` y sale del board. Los
  items entregados siguen visibles (tachados), no se ocultan. Hay una franja
  de "recién completadas" con Deshacer (60s) — el estado optimista y esa
  detección viven en `OrdersViewModel` (`deliveredOverride`, `recentlyCompleted`).
  El nombre de carpeta/target sigue siendo `BRUMA_Dispatch` (solo cambió el
  título en la UI).
- **`print-server/`** — servidor Node para impresión de comandas/tickets
  (Docker + túnel ngrok).
- Varios `.md` en la raíz (`WALLET_SETUP.md`, `WHATSAPP_BUSINESS_SETUP.md`,
  `RESERVATIONS_SETUP.md`, `FLUJOS_PERSONALIZADOS.md`, etc.) son notas de
  features específicas, mayormente históricas — no son la fuente de verdad
  del estado actual del código.
- **Web pública de pedidos en línea** (menú/checkout para clientes) vive en
  un repo aparte, fuera de este monorepo:
  `/Users/inakisiguenza/Desktop/Dev/BRUMA Web/bruma-nextjs`. Es un sitio
  Next.js estático (sin servidor Next.js corriendo) que consume el mismo
  `api-server`. Sus secrets `NEXT_PUBLIC_*` (p.ej. la publishable key de
  Stripe) se configuran en Vercel y se inyectan en build time — cambiarlos
  requiere un redeploy, no basta con guardarlos.

## Bruma POS Mobile: arquitectura de target compartido

"Bruma POS Mobile" NO es una copia de POS — comparte los archivos reales vía
membresía de target múltiple de Xcode (`PBXFileSystemSynchronizedRootGroup`,
formato de proyecto Xcode 16+). Esto es intencional: elimina la clase de bug
que tenía Waitress (dos copias de código que divergen).

**Compartido con "Bruma POS" (mismo archivo físico, doble Target Membership,
NUNCA se modifica para agregar comportamiento específico de Mobile):**
`ViewModels/POSViewModel.swift`, `Models/`, `Services/`, `Styles/`,
`Config/Environment.swift`.

**Regla dura:** si `POSViewModel.swift` (u otro archivo compartido) referencia
un tipo que vive en un archivo exclusivo de POS (p.ej. algo en `Views/` de
iPad), NO se comparte ese archivo completo con Mobile. Se duplica SOLO la
definición mínima del tipo/constante en
`Bruma POS/Bruma POS Mobile/POSViewModelTypeShims.swift` (vive dentro de la
carpeta ya sincronizada del target Mobile, sin pasos manuales de Xcode). Como
es un target/módulo distinto al de POS, no hay conflicto de nombres con la
definición real de POS. Ejemplos ya duplicados ahí: `MapGridMetrics`,
`PromotionGroup`, `CartRenderElement`, `POSConstants`.

**Gotcha de `Styles/FlatStyles.swift` (compartido):** `FlatCard`,
`FlatCardTinted`, `FlatPill`, `FlatSection` son `ViewModifier` structs, NO
tienen convenience `View extension` (`.flatCard(...)` no existe). Se usan
como `.modifier(FlatCard(cornerRadius: 12))`, igual que ya hace POS en
`PaymentView.swift`/`CartView.swift`/`SplitBillViews.swift`.

**Archivos propios de Mobile** viven en `Bruma POS/Bruma POS Mobile/` y su
`Views/` — nunca tocar los archivos del target "Bruma POS" para hacerle
cambios a Mobile.

**Gotcha de flujos personalizados por categoría:** en
`POSViewModel.buildFlowCartItem`, los pasos de flujo tipo `frosting`/`topping`
solo deben llenar `frostingId`/`dryToppingId` (columnas con FK a las tablas
`frostings`/`dry_toppings`) cuando la selección es una fila real de esas
tablas. Si el paso trae opciones propias del flujo personalizado
(`ModifierOption`, tabla `modifier_options`), su `id` NO existe en
`frostings`/`dry_toppings` — debe guardarse en `customModifiers` (JSON), igual
que ya hacía el caso `extra`. Guardar ese id en `frostingId`/`dryToppingId`
revienta el insert de `order_items` por violación de FK al mandar el pedido.

**Flujos por nivel — precedencia:** `modifier_steps` guarda pasos de flujo
para categoría O subcategoría (`category_id` y `subcategory_id`, ambos
nullable, exactamente uno seteado). La resolución del flujo efectivo de un
producto vive en `api-server/src/routes/flows.ts` (`GET /api/products/:id/flow`,
lo único que consume el POS) y su espejo en `app/api/products/[id]/flow`:
producto (`product_flows`) > subcategoría > categoría > default. Cada nivel
solo aplica si tiene pasos; si no, cae al siguiente. Los editores viven en
`/inventory/categories/[id]/flow` y `/inventory/subcategories/[id]/flow`, ambos
usan `<FlowEditor>` con `allowedStepTypes` limitado a los 4 tipos normalizados.
`GET /api/categories` marca `hasCustomFlow` tanto en la categoría como en cada
subcategoría.

**Comanda de cocina — nombre del item:** `api-server/src/lib/kitchenPrint.ts`
(`printKitchenComanda`, la ruta canónica de impresión) arma el nombre así:
`comandaItemName` invierte "Producto - Variante" → "Variante - Producto" (en
cocina se lee primero el tamaño), y si el producto tiene subcategoría se le
antepone: `"Frío - Capuccino"` (o `"Frío - Grande - Capuccino"` con variante).
El ticket de cuenta/pre-cuenta NO invierte ni prefija. OJO: Bruma POS tiene
copias client-side de `comandaItemName` (`POSViewModel.swift`) para el flujo
de pedidos en línea — ahí el prefijo de subcategoría todavía no está.

## Compilar/verificar la app de iOS

Usar las herramientas de XcodeBuildMCP en vez de `xcodebuild` a mano:
`session_show_defaults` primero, luego `build_sim` (compila sin correr) o
`build_run_sim` (compila + instala + corre en simulador). Requiere que
`xcode-select` apunte a un Xcode.app completo (no solo Command Line Tools) —
si falla `xcodebuild -version`, pedirle al usuario que corra
`sudo xcode-select -s /Applications/Xcode.app` con el prefijo `!`.

**Los diagnósticos de SourceKit que aparecen automáticamente tras cada
Edit/Write en este proyecto son frecuentemente ruido/incorrectos** (falsos
"Cannot find type X in scope" en archivos de un target multi-compartido,
antes de que el índice recompile). Solo confiar en la salida real de
`build_sim`/`xcodebuild` como señal de verdad.

## Base de datos: migraciones

Esta DB (Neon) se aprovisionó históricamente con `db:push`/SQL manual, no con
`drizzle-kit migrate` — la tabla de tracking `drizzle.__drizzle_migrations`
está vacía/desincronizada del historial real. Correr `npm run db:migrate` a
secas intenta reproducir TODO el historial de migraciones desde la 0000 y
falla en el primer statement ("type/relation already exists"). Para agregar
schema nuevo: `npm run db:generate`, revisar el SQL generado (puede traer
drift de columnas/tablas que ya existen en la DB real pero nunca se
"migraron" formalmente — hay que recortar esas líneas), y aplicar solo los
statements realmente nuevos directo contra `DATABASE_URL` (p.ej. un script
Node con `@neondatabase/serverless`), no con `db:migrate`.

## Stripe: test vs live

`customer_stripe_accounts.stripe_customer_id` no es válido entre modo test y
modo live de Stripe (son cuentas distintas) — si se cambia la llave (p.ej. al
pasar a producción), los customers guardados quedan huérfanos y cualquier uso
truena con `No such customer`. Ya hay auto-cura para esto:
`getOrCreateStripeCustomer` en `api-server/src/routes/payment-methods.ts`
valida el customer contra Stripe antes de usarlo y lo recrea (actualizando la
fila) si ya no existe. Si aparece ese error de nuevo, típicamente es porque
falta actualizar la publishable key del lado del frontend (ver nota de la web
pública arriba), no porque falte volver a aplicar este fix.

## Backend: rooms de socket

`api-server/src/sockets/events.ts` centraliza los `emit`. Rooms activos:
`room:pos`, `room:tables`, `room:dispatch`, `room:waitress`,
`room:customer_display`. Un cliente conectado a `room:pos` recibe updates de
cualquier cambio, sin importar qué cliente lo originó (POS, Mobile o el panel
web) — el broadcast es del backend, no punto-a-punto.

**Quirk conocido:** `GET /api/tables` (listado) siempre regresa
`itemCount: 0` — solo `GET /tables/:id` (detalle de una mesa) calcula el
`itemCount` real. Si algo necesita contar items por mesa desde el listado,
hay que pedir el detalle o ajustar el endpoint, no asumir que el campo del
listado es confiable.

## Pedidos en línea: que nunca quede uno "en el aire"

Un pedido web con pago confirmado (`paymentStatus` `authorized`/`paid`) y
`status='pending'` = esperando que el POS lo acepte o rechace en la pantalla
verde. Antes, si el POS se perdía el evento de socket `order:online` (reconexión,
app en background), el pedido quedaba pendiente sin forma de atenderlo. Ahora
hay 3 capas, todas independientes:

1. **Socket** `order:online` → pantalla verde + sonido en loop (como siempre).
   `emitOnlineOrder` se RE-emite cada 60s para los que llevan >90s sin atender
   (`remindPendingOnlineOrders` en `online-orders.ts`, corre desde `index.ts`).
2. **Poll de reconciliación** (POS): `POSViewModel.reconcilePendingOnlineOrders`
   consulta `GET /api/orders/pending-online` cada 25s, al reconectar el socket
   (`SocketService.onReconnect`), al volver del background (`scenePhase`), y al
   tocar la notificación local. Si hay uno y no se está mostrando → lo trae a
   la pantalla verde. Garantiza que aparezca sin importar dónde esté el POS.
3. **Notificación LOCAL** (no push del server — decisión explícita): la agenda
   el propio POS (`LocalNotificationManager`) al detectar el pendiente: una
   inmediata + una que se repite cada 2 min hasta atenderlo. `AppDelegate`
   (vía `@UIApplicationDelegateAdaptor`) solo existe para mostrarlas en
   foreground y manejar el tap. No requiere capability ni entitlement.
4. **Fallback manual**: si el pedido `pending` se abre en el cart (desde la
   lista de delivery), el botón grande deja de ser "Marcar listo" y muestra
   **Confirmar / Rechazar** apilados (`confirmOnlineOrderFromCart` /
   `rejectOnlineOrderFromCart`).
