# Flujos con ramas — Fase 2: web pública de pedidos en línea

> **Estado:** PENDIENTE. Decisión tomada el 2026-10-02: la web pública queda
> fuera de la primera tanda del rediseño de flujos. Esta nota existe para
> retomarlo sin volver a investigar.

La fase 1 (grafo real con ramas, paquetes padre/hijo, editor nuevo) cubre
`api-server`, el dashboard Next.js, iPad POS, POS Mobile, `app/bar`, impresión
y Pase. La web pública vive en **otro repo** y **otro deploy** (Vercel), así
que se migra aparte.

Repo: `/Users/inakisiguenza/Desktop/Dev/BRUMA Web/bruma-nextjs`

---

## Qué hace la web pública hoy

Todo el consumo de flujos está en **un solo archivo**:
`src/app/menu/page.tsx`.

| Qué | Dónde | Detalle |
|---|---|---|
| Tipos locales | `FlowOption`, `FlowStep`, `ProductFlow` (~líneas 34-53) | Copia propia del contrato, no compartida con el monorepo |
| Fetch | `fetch(\`${process.env.NEXT_PUBLIC_API_URL}/api/public/menu/${selectedItem.id}/flow\`)` (~línea 289) | Se dispara al abrir la hoja de producto |
| Estado | `flow`, `flowLoading`, `selectedFlowOptions: Record<stepId, FlowOption[]>` (~263-266) | |
| Render | `flowSteps.map(...)` (~658) | **Pinta TODOS los pasos a la vez** en la hoja, no paso-por-paso como el POS |
| Precio | `flowExtra = suma de price de las opciones elegidas` (~570) | Se suma al precio de la variante o del producto |
| Validación | `missingRequiredStep` = algún paso `isRequired` sin selección (~576) | Bloquea el botón de agregar |
| Salida | `customModifiers: JSON.stringify(modifiersObj)` (~746-762) | Mismo JSON que escribía el POS antes de la fase 1 |

El endpoint que consume vive **en este monorepo**:
`app/api/public/menu/[id]/flow/route.ts` → llama a
`lib/flows/resolveProductFlow.ts` (CORS `*`, cache `s-maxage=60`).

### Lo que la web NO sabe hacer hoy

- **Cero ramas.** No existe el concepto de condición ni de siguiente-nodo.
  Pinta la lista completa de pasos de un jalón.
- **No distingue tipos de paso.** `frosting`/`topping`/`extra`/`custom`/
  `products`/`category` se renderizan todos igual: lista de opciones con precio.
- **Los pasos tipo `category` llegan con `price: "0"`**, porque
  `resolveProductFlow` fuerza ese valor al expandir la categoría a productos.
  Hoy nadie lo nota porque en la web no hay paquetes.
- **No sabe de paquetes.** No hay padre/hijo; un pedido en línea nunca
  genera `order_items` hijos.
- **No conoce variantes de opción** (ej. "Pepsi → Black").

---

## Contrato de compatibilidad que deja la fase 1

Para que la web pública **no se rompa** mientras no se migra, la fase 1 debe
mantener `GET /api/public/menu/:id/flow` devolviendo el **formato lineal viejo**
(`{ productId, useDefaultFlow, steps[], source }`), aplanando el grafo nuevo
por su **camino default**: desde el nodo inicial se sigue, en cada bifurcación,
la primera arista (la de menor `sortOrder`), y se emiten como `steps[]` los
nodos de ese camino.

**Esto es una muleta, no una traducción fiel.** Consecuencias aceptadas:

- Un producto cuyo grafo ramifique (ej. Café: Frío/Caliente → Tipo de leche)
  mostrará en la web **solo los pasos del camino default**. El cliente web no
  verá "Tipo de leche" si el default es Frío.
- El flujo global de **Paquete nunca se aplana** hacia la web: los pedidos en
  línea no ofrecen paquetes hasta la fase 2.
- Los pedidos en línea siguen escribiendo `customModifiers` (JSON), **no**
  `order_item_selections`. El backend tiene que seguir aceptando ese camino
  de escritura — ver pendiente de doble escritura abajo.

> ⚠️ Si al terminar la fase 1 este aplanado no existe, la web pública se
> queda sin modificadores en silencio (`steps: []` → la hoja de producto solo
> muestra variantes). Es el primer smoke test a correr después del deploy.

---

## Trabajo de la fase 2

### 1. Cliente del grafo en la web
- Reemplazar `FlowOption`/`FlowStep`/`ProductFlow` por el contrato de grafo
  (nodos + aristas + condiciones) que defina la fase 1.
- Portar el evaluador de ramas. **No reimplementarlo a mano**: la fase 1
  deja el motor en una función pura del monorepo — extraerlo a un paquete
  compartido o copiarlo como un solo archivo con una nota de origen, nunca
  reescribir la lógica de condiciones por segunda vez.
- Cambiar el render de "todos los pasos a la vez" a **paso-por-paso**, porque
  con ramas el paso N+1 depende de lo elegido en el N. Es un cambio de UX de
  la hoja de producto, no solo de datos.

### 2. Endpoint público
- Agregar el formato nuevo. Sugerencia: `?format=graph` en
  `app/api/public/menu/[id]/flow/route.ts`, conservando el lineal como default
  hasta que la web esté desplegada, y recién entonces invertir el default.
  Así el deploy de Vercel y el del dashboard no tienen que ser simultáneos.
- Revisar la cache: `s-maxage=60` está bien para el grafo, pero un cambio en
  el editor tarda hasta 1 min en verse en la web. Si molesta, invalidar al
  guardar el flujo.

### 3. Paquetes en pedidos en línea
- Decidir si el pedido en línea puede armar paquetes. Si sí:
  - El checkout tiene que mandar **items hijos**, no un JSON plano.
  - Revisar `api-server/src/routes/online-orders.ts` (webhook de Stripe,
    accept/reject) para que los hijos se creen igual que en el POS.
  - El total que cobra Stripe tiene que incluir el delta de paquete y los
    recargos por opción — se cobra **antes** de que cocina lo vea, así que un
    error de precio aquí es un cobro mal hecho, no un ticket mal impreso.

### 4. Escritura de selecciones
- Mientras la web mande `customModifiers`, el backend mantiene los dos caminos
  de escritura. Al migrar la web, pasar a `order_item_selections` y **recién
  entonces** quitar la escritura vieja.
- Ojo con reportes/impresión que ya lean de la tabla nueva: un pedido web
  viejo no tendrá filas ahí.

---

## Gotchas a no olvidar

- `NEXT_PUBLIC_API_URL` se inyecta en **build time** en Vercel. Cambiar a qué
  backend apunta la web **requiere redeploy**, no basta con guardar la env var.
  Mismo patrón que la publishable key de Stripe (ver `CLAUDE.md`).
- La web es un sitio Next.js **estático**, sin servidor Next corriendo; todo
  lo dinámico sale del `api-server` / de las rutas públicas del dashboard.
- La web **no es cliente de Socket.IO**. Un flujo editado en el dashboard llega
  a la web por el fetch de la hoja de producto + la cache de 60s, nada más.
- Los tipos están **duplicados a mano** en el repo de la web. Si el contrato
  del grafo cambia en la fase 1, nada avisa: compila igual y truena en runtime.

---

## Definición de terminado

- [ ] La hoja de producto de la web recorre el grafo paso-por-paso y respeta ramas
- [ ] Un café en la web pide Frío/Caliente y solo pregunta leche cuando aplica
- [ ] El endpoint público sirve el grafo y el lineal queda borrado
- [ ] Decidido (y si aplica, implementado) si hay paquetes en pedidos en línea
- [ ] La web escribe `order_item_selections` y se quita la escritura legacy de `customModifiers`
- [ ] Un pedido en línea con modificadores imprime correcto y se marca bien en Pase
