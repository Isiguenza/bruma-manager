# Reglas de performance y concurrencia para endpoints y consumibles

Este documento nace del diagnóstico del 27-28 sept 2026: el sistema se trababa en
rush con 2 iPads y comandas simultáneas. Causa raíz combinada: queries sin límite
+ cliente de DB sin timeout + clientes que re-piden todo el estado en cada evento
de socket. Estas reglas son para que un endpoint o consumidor NUEVO no repita el
mismo patrón. No es teoría — cada regla está anclada a un bug real que ya pasó
en este repo.

Aplica a: `api-server/` (backend real que consumen todas las apps), `app/api/`
(rutas Next.js del dashboard), `Bruma POS/` (iPad + Mobile), `BRUMA_Dispatch/`.

## 1. Backend: cualquier endpoint nuevo que liste filas

**Regla:** un endpoint de listado (`GET /api/algo`) nunca regresa "todo lo que
matchee" sin límite. Por default debe acotar por fecha/rango razonable (turno
actual, caja abierta, últimos N días) y llevar un `LIMIT`. Si un caller
específico necesita historial completo, que lo pida explícito con sus propios
filtros — el default nunca es "sin filtro".

**Por qué:** `GET /api/orders` no tenía límite y lo hacían polling ~5 clientes
concurrentes (2 iPads, Mobile, Dispatch, dashboard) cada 10-25s, con un join
anidado pesado (items → producto → categoría) por cada orden. En rush, más
órdenes activas = query más pesada, multiplicada por N dispositivos contra el
mismo compute de Neon.

**Checklist antes de mergear un endpoint de listado:**
- [ ] ¿Tiene `LIMIT` o paginación?
- [ ] ¿Tiene un filtro de fecha/estado por default, no solo cuando el caller lo pide?
- [ ] ¿Cuántos clientes distintos lo van a hacer polling, y cada cuánto? Si es
      más de uno, el costo real es `costo_query × N_clientes × frecuencia`, no
      el costo de una sola llamada.

## 2. Backend: toda llamada a la DB externa debe tener timeout + retry acotado

**Regla:** ninguna query a Neon (o cualquier servicio externo) puede quedarse
esperando indefinidamente. Usar `AbortController`/timeout (~8-10s) y máximo 1-2
reintentos con backoff corto. Que falle rápido y visible, no que cuelgue la
request.

**Por qué:** el driver `neon-http` (`@neondatabase/serverless`) es HTTP puro,
sin pool ni timeout propio. Un blip de conectividad hacía que `await db.x` se
quedara colgado sin límite — eso convirtió un error transitorio de segundos en
6-18 minutos de silencio TOTAL del servidor (ni un solo request procesado).

## 3. Backend: nunca generar "el siguiente número" con `SELECT MAX(x) + 1`

**Regla:** cualquier columna tipo folio/número secuencial (`order_number`, o
lo que sea análogo en el futuro) se genera con una `SEQUENCE` de Postgres
(`nextval`) o con un `UNIQUE` + retry-on-conflict. Nunca con
`SELECT MAX(campo)` seguido de `+1` en código de aplicación, sin transacción.

**Por qué:** con 2 iPads mandando una orden en el mismo instante, ambos podían
leer el mismo `MAX(order_number)` y generar el mismo folio — corrompe datos
justo en el momento de más presión (rush), no truena la app pero confunde a
cocina/caja.

## 4. Backend: colapsar round-trips secuenciales que no dependen entre sí

**Regla:** si un handler hace varios `await` seguidos a la DB y esas llamadas
no dependen del resultado de la anterior, usar `Promise.all`. Si sí son
secuenciales por necesidad de atomicidad (insertar orden + insertar items +
actualizar subtotal), usar una sola `db.transaction()` en vez de varios
round-trips sueltos.

**Por qué:** `send-to-kitchen`/`POST /orders` hacían 4-8 round-trips
secuenciales, cada uno pagando latencia completa de red a Neon. Bajo carga,
cada retraso de Neon se multiplica por el número de `await`s en cadena.

## 5. Backend: el logger global no debe volcar payloads completos en rutas calientes

**Regla:** el middleware de logging puede imprimir `MÉTODO path`, pero no debe
hacer `JSON.stringify(req.body)`/dict completo en cada `GET` de alta frecuencia
(polling). Reservar el detalle completo para mutaciones (`POST`/`PATCH`) donde
de verdad ayuda a debuggear, y aun ahí evitar volcar payloads gigantes.

## 6. Dashboard Next.js: nunca dupliques lógica de negocio en dos route handlers

**Regla (ya documentada en CLAUDE.md, repetida aquí porque aplica a
"endpoints nuevos"):** si dos rutas de Next.js necesitan la misma lógica,
extraerla a una función pura en `lib/`, nunca hacer que un route handler le
pegue por HTTP a otro (`fetch(new URL(...))`) — es fràgil en producción
(`ERR_SSL_WRONG_VERSION_NUMBER` ya pasó una vez con `/api/suppliers/calculate`).

**Regla nueva:** si el endpoint toca una tabla que también lee/escribe
`api-server` (p.ej. `orders`), recuerda que este repo mantiene DOS copias de
schema (`lib/db/schema.ts` y `api-server/src/schema.ts`) sin una sola fuente de
verdad — cualquier columna/constraint nueva se agrega a los dos archivos en el
mismo cambio, o divergen en silencio.

## 7. iOS: un handler de evento de socket nunca hace un refetch completo "por si acaso"

**Regla:** cuando llega un evento de socket (`order:updated`, `order:rush`,
`order:hold`, o cualquiera nuevo), el handler debe aplicar los datos que YA
vienen en el payload directo al estado local (`@Published`). Un refetch de red
(`GET` completo) solo se justifica cuando el payload de verdad no trae lo
necesario — nunca como comportamiento default "para estar seguros".

**Por qué:** con `room:pos` haciendo broadcast a ambos iPads, cada acción de un
mesero disparaba 2-3 GETs completos en el OTRO iPad también — el volumen de
requests crecía linealmente con el número de comandas simultáneas, no con
cambios reales. Esto se sumaba al polling de respaldo que ya corre en paralelo
(cada 25-60s) — un evento de socket nunca debe duplicar lo que el polling ya
cubre.

**Checklist para un evento de socket nuevo:**
- [ ] ¿El payload que emite el backend ya trae todo lo que la vista necesita?
      Si no, ¿se puede ampliar el payload en vez de forzar un refetch?
- [ ] Si de plano hace falta un refetch, ¿hay ya un polling corriendo que lo
      vaya a cubrir en los próximos segundos? Si sí, probablemente no hace
      falta el refetch inmediato.
- [ ] Si hay que pedir 2+ cosas por red en el mismo handler, ¿están en
      `async let` (paralelo) o en `await` secuencial (lento)?

## 8. iOS: no metas más estado a `POSViewModel` sin pensar en el radio de re-render

**Regla:** `POSViewModel` ya es un solo `ObservableObject` con ~150+
`@Published`. Cualquier mutación de CUALQUIERA de esas properties fuerza a
SwiftUI a recomputar el `body` de toda vista que sostenga `vm` (el mapa de
mesas completo, por ejemplo). Antes de agregar un `@Published` nuevo:
- Si el dato es de verdad global (sesión, empleado actual, caja abierta), va
  en `POSViewModel` como siempre.
- Si el dato es local a una pantalla/feature específica (un modal, un flujo de
  captura), considera un `ObservableObject` propio de esa vista en vez de
  crecer más el view model compartido.
- Las celdas de listas/grids (mesas, órdenes) deben recibir el valor puntual
  que necesitan (`Table`, `Order`) como parámetro de su propia subvista con
  identidad estable (`Identifiable`/`Equatable`), no todo `vm` — así SwiftUI
  puede saltarse el re-render de celdas que no cambiaron.

## 9. iOS: nunca imprimir el payload completo en un hot path

**Regla:** `print()` de un diccionario/payload completo en un handler que se
dispara varias veces por segundo (eventos de socket, ticks de timer) es jank
medible bajo alta frecuencia. Loggear solo el id/tipo relevante, y si se
necesita el detalle completo para debug, envolverlo en `#if DEBUG`.

## 10. iOS: `POSViewModel.swift`, `Models/`, `Services/`, `Styles/` son compartidos con Mobile

**Regla (ya documentada en CLAUDE.md, repetida porque aplica directo a
"endpoints/consumibles nuevos"):** si agregas manejo de un evento de socket o
una llamada de API nueva en un archivo compartido, no referencies un tipo que
solo existe en `Views/` exclusivo de iPad — duplica la definición mínima en
`Bruma POS/Bruma POS Mobile/POSViewModelTypeShims.swift`. Y si el archivo nuevo
vive en `Services/`/`Models/`/`Styles/`, no olvides agregarlo a
`membershipExceptions` en el `.pbxproj` o Mobile deja de compilar en silencio.

**Verificación obligatoria:** después de tocar cualquier archivo compartido,
compilar AMBOS schemes ("Bruma POS" y "Bruma POS Mobile") con XcodeBuildMCP
(`build_sim`), nunca confiar solo en los diagnósticos de SourceKit (son
ruidosos/incorrectos en este proyecto multi-target).

## 11. Regla transversal: cuenta cuántos clientes concurrentes tocan lo que estás creando

Antes de dar por bueno un endpoint o un consumidor nuevo, pregúntate: ¿cuántos
dispositivos/clientes distintos lo van a llamar, y cada cuánto? Este sistema
hoy tiene 2 iPads de POS + Mobile (varios celulares) + BRUMA_Dispatch + el
dashboard, todos potencialmente activos al mismo tiempo. Un costo que parece
trivial en desarrollo (una query, un refetch) se multiplica por N dispositivos
en producción durante rush. Diseña asumiendo que se va a llamar desde varios
lados a la vez, no desde uno solo.
