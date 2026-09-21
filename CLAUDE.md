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
  tap de nuevo → `batch-unready`. **Unidad del board = la RONDA (batch), no la
  orden**: `convertOrdersToBatches` parte cada orden por gaps de 30s entre
  `createdAt` de los items, así que dos rondas de la misma mesa son dos
  tarjetas independientes. Una tarjeta se va del board cuando SUS platillos
  están entregados, sin esperar a las otras rondas de esa mesa. La detección de
  completadas y las "fotos" (`batchSnapshots`) son a nivel batch; el board
  filtra las rondas 100% entregadas en `fetchOrders` (no en
  `convertOrdersToBatches`, que devuelve todas). El backend pasa la orden a
  `ready` solo cuando TODOS sus items están entregados. Franja de "recién
  completadas" con Deshacer (60s); estado optimista en `deliveredOverride`.
  Cada tarjeta tiene botón "Reimprimir" → `POST /api/orders/:id/reprint-comanda`
  con `itemIds` de esa ronda (el endpoint acepta `itemIds` opcional: con él
  reimprime solo esos items, sin él toda la orden).
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

**Gotcha del `.pbxproj` — `membershipExceptions` es opt-in, no opt-out:** la
lista en `PBXFileSystemSynchronizedBuildFileExceptionSet` ("Exceptions for
'Bruma POS' folder in 'Bruma POS Mobile' target") es la ÚNICA fuente de qué
archivos de la carpeta compartida (`Models/`, `Services/`, `Styles/`, etc.)
también compilan en Mobile — un archivo nuevo en esas carpetas NO se comparte
solo, hay que agregarlo a mano a `membershipExceptions`. Ya pasó: se agregó
`Services/LocalNotifications.swift` (feature de notificaciones locales de
pedidos en línea) y `POSViewModel.swift` (compartido) lo referencia, pero
nadie lo sumó a la lista → Mobile dejó de compilar (`cannot find
'LocalNotificationManager' in scope`) sin que nadie tocara código de Mobile.
Si Mobile no compila después de agregar algo a `Services/`/`Models/`/`Styles/`
en el target POS, este archivo es sospechoso #1 antes de buscar el bug en
otro lado.

**Gate de admin en Mobile:** `POSViewModel.employeeRole == "admin"` (mismo
patrón que `canEditLayout` en POS) gatea el botón "Imprimir Cuenta" del
carrito (`ComandasCartView.footer`) y el tab "Empleados" completo
(`ComandasRootView.tabsContainer`, con un `onChange(of: vm.employeeRole)` que
regresa a la tab de Mesas si el rol deja de ser admin en la misma sesión de
la app — incluye el caso del auto-relock, si otro empleado sin admin
desbloquea la sesión). "Lealtad" es visible para cualquier rol. El tab de
Empleados de Mobile (`ComandasEmployeesView.swift`, propio
de Mobile, no reusa `EmployeeSelectionView` de iPad) es una lista simple en
vez del grid de iPad, con historial de órdenes por empleado vía
`APIService.fetchEmployeeOrders(userId:)` en una hoja aparte — ese endpoint
filtra `source=employee` (consumos internos), no todas las órdenes de mesa
que el empleado atendió como mesero.

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

## Modo Práctica (Bruma POS Mobile)

Deja que cualquier empleado practique comandar con el flujo REAL (mismo
catálogo, asientos, tiempos, impresión y Pase) sin afectar caja. Botón
"🎓 Práctica" en el header de `ComandasTableGridView.swift` (Mobile). Diseño
clave: la orden usa una **mesa oculta real** (`tables.number = 'PRACTICA'`,
`active = false`, creada una sola vez por `scripts/add-is-practice.ts` /
`drizzle/manual_is_practice.sql`) en vez de un `tableId` inventado — un id
falso truena por FK real a `tables`, y omitir `tableId` por completo hace que
la orden caiga en el bucket de "para llevar" y aparezca como fantasma en las
pantallas reales de todos los dispositivos. Al ser `active = false` nunca
sale en el grid de Mesas (ahí y en TableMapView el filtro ya es
`.filter { $0.active }`), pero como es una fila real de verdad, el resto del
flujo (`handleSendToKitchen`, impresión, Pase) no necesita ningún caso
especial.

`POSViewModel.isPracticeMode` (compartido, default `false`, inofensivo en
iPad) es el único flag: en `handleSendToKitchen` agrega `isPractice: true` al
body de `createOrder`; `handleBackToTables` lo resetea a `false` (red de
seguridad para que no se cuele en una orden real después). `orders.is_practice`
(boolean, default false) viaja desde ahí hasta impresión (`kitchenPrint.ts` →
`print-server/server.js`, letrero "MODO PRACTICA" arriba de todo en la
comanda física) y hasta BRUMA_Dispatch (`Order.isPractice` → `OrderBatch.isPractice`
→ franja morada en `BatchCardView`). Pagar una orden de práctica está
bloqueado server-side (`POST /orders/:id/pay` en `orders.ts`) como defensa
extra, además de excluirse de las queries de corte/`dashboard/stats` (ver
gotcha de "dos copias de schema" abajo). Se auto-borran solas
(`cleanupPracticeOrders` en `orders.ts`, cron cada 30 min en `index.ts`,
retención de 2h) — `order_items` se va con `onDelete: cascade`.

**Gotcha — `orders` tiene DOS copias de schema que hay que mantener en
sync a mano:** `lib/db/schema.ts` (la usa el panel Next.js `app/`) y
`api-server/src/schema.ts` (la usa el backend Express, conexión a Neon
separada). No hay una sola fuente de verdad — cualquier columna nueva en
`orders` se agrega a los dos archivos o el panel y el backend divergen en
silencio. Mismo patrón aplica a las queries de caja/reportes: existen
copias espejo entre `api-server/src/routes/cash-register.ts` y
`app/api/cash-register/[id]/{corte,close}/route.ts` — un filtro nuevo (como
`is_practice`) hay que replicarlo en ambos lados.

## Login, numpad compartido, gate de caja y auto-relock (Bruma POS/Mobile)

**Numpad único:** `Styles/PinNumpadView.swift` (compartido, en
`membershipExceptions` de Mobile) es el único numpad de PIN de toda la app —
círculos `.flatCircleNeutral` 80x80, el mismo look que ya tenía el acceso a
Caja. Reemplazó 3 implementaciones independientes (`NumpadView` en
`LoginView.swift`, `ComandasNumpad` privado en `ComandasLoginView.swift`,
`pinNumpadButton` inline en `CashRegisterView.swift`). Cualquier pantalla de
PIN nueva debe reusar este componente, no reinventar el numpad.

**Gate de caja movido de login a "enviar a cocina":** `handleOpenComanda()`
ya NO bloquea el login si la caja está cerrada (solo informa via banner) —
antes cortaba el flujo antes de llegar al PIN. El bloqueo real está en
`handleSendToKitchen` (`guard cashRegisterOpen || isPracticeMode`), y como
vive en código compartido aplica a POS y Mobile por igual. Hay un espejo
defensivo en el backend (`POST /api/orders` con `status:"preparing"` y
`POST /orders/:id/send-to-kitchen`, ambos en `orders.ts`) que devuelve 409
si no hay caja abierta, salvo `isPractice`. **Gotcha:** `cashRegisterOpen`
solo se seedea en `handleOpenComanda()` (login manual) o vía eventos de
socket (`onCashRegisterOpened`/`Closed`) — una sesión restaurada al
relanzar la app (`restoreSession()`) NO pasaba por ninguno de los dos, así
que quedaba en `false` para siempre tras un relaunch con sesión guardada;
`restoreSession()` ahora también llama `checkCashRegister()`.

**Auto-relock por inactividad (3 min), separado del dim de pantalla:**
`Styles/SessionLockMonitor.swift` (compartido) bloquea la pantalla actual
con un overlay de PIN tras 3 min sin tocar nada — a diferencia de un
logout, NO navega ni toca `currentScreen`/carrito/mesa seleccionada, así
que una comanda a medio armar sobrevive. Cualquier PIN de empleado válido
desbloquea (no tiene que ser el mismo que estaba activo) vía
`POSViewModel.handleRelockPinSuccess`, y ese empleado queda como operador
actual — el objetivo es puramente de trazabilidad: evitar que una sesión
abierta por horas le atribuya a un solo empleado todo lo que pasó en Caja.
Wireado en `ContentView.swift` (POS, excluye `customerDisplay`) y
`ComandasRootView.swift` (Mobile). Es un mecanismo aparte de `IdleMonitor`
(`IdleDimmer.swift`, dim de pantalla + reposo, exclusivo de POS/iPad) —
comparten la técnica de detección de toques a nivel ventana pero están
duplicados a propósito porque son features con alcance distinto.

**Bug de brillo pegado en bajo — causa real:** `IdleMonitor.savedBrightness`
se inicializaba leyendo `UIScreen.main.brightness` tal cual. En un iPad de
kiosko (una sola app corriendo, nada más resetea el brillo del sistema),
matar/relanzar la app mientras la pantalla ya estaba atenuada hace que el
siguiente arranque lea el brillo ya en ~0, y ese valor queda congelado como
objetivo de restauración — `wake()` "restauraba" fielmente a ese 0. Fix:
`IdleMonitor.sanitize(_:)` aplica un piso (`> 0.15 ? valor : 1.0`) en toda
lectura de `UIScreen.main.brightness` que se vaya a usar como restauración.

**Auditoría de "quién comandó/cobró qué":** reusa la tabla `auditLog` ya
existente (sin columnas nuevas en `orders`/`order_items`) con dos acciones
nuevas — `order.sent_to_kitchen` (`orders.ts`, tanto en `POST /api/orders`
para la primera ronda como en `POST /orders/:id/send-to-kitchen` para
rondas siguientes de una orden existente) y `order.paid` (en `pay` y
`pay-split`). `POST /orders/:id/send-to-kitchen` ahora acepta
`employeeId`/`itemNames`/`itemCount`/`course` en el body porque
`order_items` no tiene timestamp de "cuándo se mandó esta ronda" — es la
misma limitación que ya tenía `printComanda`. Lectura desde el dashboard:
`GET /api/audit-log` (Next.js, `app/api/audit-log/route.ts`, lee
directo de `lib/db/schema.ts` — no tiene espejo en `api-server` porque nada
más lo consume), panel "Auditoría" en `/cash-register`.

## Proveedores (dashboard Next.js) — quién nos vende qué y cuánto le debemos

Tab "Proveedores" (`app/(dashboard)/suppliers/`), 100% en el dashboard Next.js
— no toca `api-server` ni las apps iOS. Tablas `suppliers` y `supplier_items`
(`lib/db/schema.ts`, migradas a mano con `scripts/add-suppliers.ts`, mismo
patrón de `db:push` manual que el resto de la DB). `supplier_items` es SIEMPRE
a nivel producto/variante concreto (`productId` + `variantName` nullable +
`costPrice`) — asignar "categoría completa" desde la UI (reusa
`components/promotion-product-picker.tsx`, el mismo picker de promociones) es
solo una forma de captura masiva que EXPANDE la categoría a una fila por
producto/variante en el momento (`sourceCategoryId` queda solo como
trazabilidad/agrupación visual, nunca se lee para el cálculo). Si después se
agrega un producto nuevo a esa categoría, NO aparece solo — hay que tocar
"Resincronizar categoría" en el detalle del proveedor.

**No-traslape es a nivel aplicación, no constraint de DB**
(`lib/suppliers/overlap.ts`, `findSupplierItemConflict`): un producto/variante
no puede estar asignado a más de un proveedor activo. Asignar el producto
completo (`variantName: null`) choca contra CUALQUIER fila existente de ese
`productId` (sea variante específica o el producto completo de otro
proveedor) — evita traslapes parciales. Verificado en producción: al asignar
una categoría dos veces (o a dos proveedores) el segundo intento se salta
correctamente y reporta a quién ya pertenece cada producto.

**El calculador confirma en producción que `order_items.productName` de una
variante es exactamente `"${product.name} - ${variantName}"`** (sin invertir,
sin prefijo de categoría — la inversión de `comandaItemName()` en
`kitchenPrint.ts` es solo cosmética para la comanda impresa). El join de
ventas por rango de fechas (`lib/suppliers/calculate.ts`, función pura
`calculateSupplierTotals` — NO vive en la route handler para poder llamarse
directo desde dos endpoints distintos, ver gotcha de self-fetch abajo) usa
siempre `orderItems.productId` y, si hay `variantName`, además filtra por ese
string exacto — probado contra ventas reales de "Espresso - Doble/Sencillo".

**Dos modelos de pricing por línea** (`supplierItems.pricingType`:
`"fixed_cost"` | `"percentage"`): el original es costo fijo por unidad
(`costPrice`); el segundo es para productos donde el proveedor no vende un
insumo a costo fijo sino que se reparte lo vendido (ej. "los cafés de Bruma:
nosotros nos quedamos 10%, el proveedor se lleva el resto") —
`businessCutPercent` guarda el % que se queda EL NEGOCIO, y
`calculateSupplierTotals` calcula `lineTotal = revenue * (100 -
businessCutPercent) / 100` usando `SUM(order_items.subtotal)` del rango en
vez de `quantitySold * costPrice`. Configurable por línea individual (select
+ input en el detalle del proveedor) o de un jalón para todo un grupo/categoría
con "Aplicar % a todos".

Impresión: ticket térmico vía print-server (`POST /print-supplier`, calcado
de `/print-corte`) Y PDF con `jsPDF` puro (`components/supplier-invoice-pdf.ts`,
sin `jspdf-autotable`, tabla dibujada a mano) — ambos alimentados por el mismo
endpoint `app/api/suppliers/print-data/route.ts` para que ticket y PDF nunca
diverjan en las cifras. Alcance: proveedor completo, una categoría dentro de
un proveedor, o consolidado de todos los proveedores (`/suppliers/all`).

**Gotcha ya corregido — nunca pegar un blob base64 grande a mano dentro de un
archivo de código:** la primera versión traía el logo BRUMA incrustado como
literal base64 (~15KB) directo en `components/supplier-invoice-pdf.ts`. Al
transcribirlo se corrompió a la mitad (quedó en ~10KB, un PNG inválido) sin
que ningún linter/build lo detectara — compila perfecto porque sigue siendo
un string JS válido, solo truena en runtime al llamar `jsPDF.addImage()`, y
como el catch de la UI no logueaba el error, se veía como "no pasa nada".
Fix definitivo: el logo se subió una sola vez a R2
(`assets/bruma-logo.png`, público en `https://cdn.cocinabruma.com.mx/assets/bruma-logo.png`,
mismo bucket/CDN que ya usa `app/api/menu/upload/route.ts`) y
`app/api/suppliers/print-data/route.ts` lo trae con `fetch()` **server-side**
(sin problema de CORS/canvas-tainting, a diferencia de hacerlo desde el
browser) y lo manda como `logoBase64` en el payload — `generateSupplierInvoicePDF`
ya no tiene NINGÚN base64 hardcodeado, y su `doc.addImage` está en un
try/catch que si falla el logo, no tumba el PDF completo. Regla general: un
asset binario (logo, ícono) siempre se sube a R2 y se referencia por URL,
nunca se pega como base64 en un archivo `.ts`/`.tsx`.

**Gotcha ya corregido — self-fetch entre route handlers de Next.js es
frágil:** la primera versión de `print-data` llamaba a
`fetch(new URL("/api/suppliers/calculate", request.url))` para reusar el
cálculo. En producción eso murió con `ERR_SSL_WRONG_VERSION_NUMBER` (un
route handler haciéndose fetch a sí mismo por HTTP(S) depende de cómo esté
desplegado el server, y no es confiable). Fix: la lógica se movió a
`lib/suppliers/calculate.ts` como función pura (`calculateSupplierTotals`),
llamada directo (sin red) tanto desde `calculate/route.ts` como desde
`print-data/route.ts`. Regla general: si dos route handlers de Next.js
necesitan la misma lógica, extraerla a una función en `lib/`, nunca hacer que
un handler le pegue por HTTP a otro handler del mismo proceso.

**Gotcha del entorno: `scripts/*.ts` que usan `import { config } from
"dotenv"` no corren tal cual con `npx tsx`/`pnpm exec tsx` en este repo** —
pnpm con node_modules estricto no expone `dotenv` (es dependencia transitiva
de otro paquete, no está declarada directo), así que `Cannot find module
'dotenv'` truena incluso para scripts viejos que ya usaban ese patrón. Para
correr una migración manual: o se lee `DATABASE_URL` de `.env` a mano con
`fs.readFileSync`+regex en un `.mjs` temporal (sin pasar por `dotenv`), o se
soluciona el phantom-dependency de raíz agregando `dotenv` como dependencia
real del proyecto — no asumir que `npx tsx scripts/x.ts` simplemente funciona.

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

## WhatsApp (notificaciones de pedidos + auto-respuesta)

`api-server/src/lib/whatsapp.ts` manda plantillas aprobadas de Meta Cloud API en
5 momentos del pedido en línea: `notifyOrderReceived`/`Confirmed`/`Ready`/
`OutForDelivery`/`Cancelled` → plantillas `pedido_recibido` / `pedido_confirmado`
/ `pedido_listo` / `pedido_en_camino` / `pedido_cancelado` (nombres exactos,
idioma código **`es`** NO `es_MX`). Se disparan desde `online-orders.ts` (webhook
de Stripe, accept/reject) y `orders.ts` (marcar listo/en camino). Guía completa
de plantillas y variables: `docs/WHATSAPP_SETUP.md`.

Credenciales (env): `META_WA_PHONE_ID`, `META_WA_TOKEN` (las MISMAS que usa
`reservations.ts` para `reservacion_confirmada` — cambiarlas afecta ambos flujos),
`META_WA_VERIFY_TOKEN` (handshake del webhook). Si falta phone id o token,
`sendTemplate` hace **no-op silencioso**; el error de Meta queda en logs
(`❌ WhatsApp error (...)`). El envío es un POST nuestro hacia Meta — el webhook
NO interviene ahí.

**Auto-respuesta "este chat es solo para avisos":** `handleInboundWhatsApp` en
`whatsapp.ts`, llamado desde `routes/whatsapp.ts` por cada mensaje ENTRANTE real
del cliente. Manda texto libre (permitido dentro de la ventana de 24h que abre
el cliente al escribir — no necesita plantilla), con rate-limit de 6h por número
(Map en memoria, se pierde al reiniciar). Texto configurable con
`WHATSAPP_AUTO_REPLY` (acepta `\n` literal → salto de línea real). **Requiere
suscribir el webhook al campo `messages` en Meta** (Meta → app → WhatsApp →
Configuración → Webhook fields).

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

## Caja: el corte se calcula EN VIVO desde `orders`

`GET /api/cash-register/:id/corte` (y `/report`) recalculan ventas por método,
propinas por método, efectivo esperado y comisiones **en cada llamada**, leyendo
`orders` (where `cashRegisterId` + `paymentStatus='paid'`) y `order_payments`
para splits. Las columnas `cash_registers.cash_sales`/`terminal_sales`/etc. se
escriben al cerrar pero **nunca se leen**; `sales_history` está definida en el
schema pero **no se usa** (legacy del backend Next viejo). Consecuencia: para
corregir una venta basta con actualizar la fila de `orders` — todo lo que
depende se recalcula solo, en caja abierta o cerrada.

`POST /api/orders/:id/payment-details` hace justo eso: corrige `paymentMethod`,
`tip`, `tipPaymentMethod`, recalcula `total = subtotal + tip`, sincroniza la
transacción `type:'sale'` ligada y deja audit log. No aplica a órdenes con pago
dividido (`order_payments`), web/online ni plataforma. Emite `order:updated` +
`order:paid`. (`POST /api/orders/:id/tip` es el hermano viejo, solo propina —
sigue existiendo.)

UI: en el dashboard, botón "Editar pago" en el modal de historial de
`/cash-register`. En el POS, al tocar una orden en la tab de Caja se abre
`CashRegisterView.orderDetailSheet` (NO `OrdersHistoryModal.swift`, que es
**código muerto** — no se presenta en ningún lado) → botón "Editar método de
pago y propina" → `EditOrderPaymentSheet` (archivo propio, reusable).

## Promociones en `app/bar` (venta web/POS de bar)

`lib/utils/promotions.ts` (`applyPromotions`) **muta `item.unitPrice` al precio
YA con descuento aplicado** y deja el precio original en `item.originalPrice`.
**Gotcha ya corregido una vez, cuidado si se toca de nuevo:** cualquier cálculo
de subtotal en `app/bar/page.tsx` que sume `unitPrice * quantity` y LUEGO reste
`promotionDiscount` otra vez está descontando dos veces (afecta caja real —
sobrescribe `orders.subtotal` vía `POST /api/orders/:id/pay`). El subtotal
"antes de descuentos" debe sumar `item.originalPrice ?? item.unitPrice` (fallback
al precio actual solo si el item nunca tuvo promoción), y restar
`totalPromotionDiscount` una sola vez sobre eso.

`applyPromotions(cartItems, promotions, products)` recibe `products` (tercer
parámetro, antes no existía) porque necesita `categoryId` para
`applyTo:"category"` y para resolver el id de variante puntual — el creador de
promociones guarda ids de variante como `${productId}::${variantName}` en
`productIds` (estable aunque se reordenen); el motor también lee el formato
por índice heredado para promociones ya guardadas. El `CartItem` de
`app/bar/page.tsx` NUNCA guarda ese id compuesto (solo el `productId` base +
`productName` tipo `"Producto - Variante"`), así que `applyPromotions` compara
ese nombre contra las variantes para reconstruir el id — si se cambia ese
formato al armar variantes (`handleAddVariant`), el matching se rompe en silencio.
Las promos antiguas que todavía guardan `${productId}-variant-${idx}` no pueden
reconstruirse de forma determinista si alguien ya reordenó las variantes: ejecutar
una vez `npx tsx scripts/migrate-promotion-variant-ids.ts --apply` contra la DB
real las convierte usando el orden actual (sin `--apply` solo muestra el plan).

**Tiempo real de promociones:** el CRUD del dashboard vive en rutas Next.js y
Socket.IO vive en el proceso `api-server`, por lo que las rutas Next notifican
`POST /internal/promotions/notify` y esperan a que termine antes de responder
(sin propagar el error). No convertirlo en fire-and-forget: un runtime
serverless puede terminar la invocación antes de despachar ese fetch.
`API_SERVER_URL` debe estar configurada en el deployment del dashboard para
apuntar al api-server; una falla de esa notificación nunca revierte una
escritura ya confirmada.

`app/bar` no es cliente de Socket.IO: para que una promoción creada en otra
sesión alcance un carrito ya abierto, refresca `/api/promotions/active` con
`cache: "no-store"` al volver a enfocar/visibilizar la página y cada minuto.
No volver a depender solo del fetch de montaje, o el carrito seguirá usando la
lista anterior hasta una recarga manual.

## Pedidos en línea: que nunca quede uno "en el aire"

Un pedido web con pago confirmado (`paymentStatus` `authorized`/`paid`) y
`status='pending'` = esperando que el POS lo acepte o rechace en la pantalla
verde. Antes, si el POS se perdía el evento de socket `order:online` (reconexión,
app en background), el pedido quedaba pendiente sin forma de atenderlo. Ahora
hay 4 capas, todas independientes:

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
