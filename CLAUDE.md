# Bruma Manager

Monorepo para el sistema de restaurante de Cocina Bruma: backend, panel admin web,
apps de iOS (POS de iPad, comandas de iPhone, dispatch de delivery) y servidor de
impresión.

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
- **`BRUMA_Dispatch/`** — proyecto Xcode, app de dispatch de delivery.
- **`print-server/`** — servidor Node para impresión de comandas/tickets
  (Docker + túnel ngrok).
- Varios `.md` en la raíz (`WALLET_SETUP.md`, `WHATSAPP_BUSINESS_SETUP.md`,
  `RESERVATIONS_SETUP.md`, `FLUJOS_PERSONALIZADOS.md`, etc.) son notas de
  features específicas, mayormente históricas — no son la fuente de verdad
  del estado actual del código.

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
