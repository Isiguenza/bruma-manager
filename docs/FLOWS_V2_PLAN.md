# Flujos v2 — grafo con ramas, paquetes y referencias dinámicas

> **Este documento es el CONTRATO.** Todo agente que toque flujos lee esto
> primero y no inventa nombres, formas de JSON ni semántica. Si algo aquí está
> mal o incompleto, se corrige AQUÍ antes de escribir código — no se "arregla"
> divergiendo en un archivo.
>
> Fecha: 2026-10-02 · Rama base: `newDispatch`
> Fase 2 (web pública): ver `docs/FLOWS_FASE2_WEB_PUBLICA.md`

---

## 1. Por qué

### Lo que duele hoy

**El motor es lineal y no hay forma de que no lo sea.** `steps[]` +
`currentStepIndex++`. Las aristas que dibujas en el canvas de React Flow son
decorativas: el POS las ignora y recorre por `sortOrder`. Consecuencia directa:

- **Café está duplicado.** 15 productos en subcategorías `Fríos` (7) y
  `Calientes` (8). Seis nombres aparecen dos veces con **precios distintos**:
  Americano 39/40, Capuccino 40/45, Caramel 45/50, Chocolate 45/50, Moka 45/50,
  Latte 40/45. Exclusivos: Espresso y Tissana solo caliente, Coffee tonic solo
  frío. Y "Tipo de Leche" cuelga de la subcategoría `Calientes`, así que
  **también se le pregunta a Americano y a Tissana**, que no llevan leche.
- **Los paquetes son productos falsos con opciones escritas a mano.**
  `Paquete aguachile` $280, `Paquete camarones` $235, `Paquete caldo camarón`
  $169. Las 15 bebidas y las 7 entradas están **tecleadas como texto** en cada
  uno de los 3 flujos. Agregar una bebida nueva al menú = editar 3 flujos a
  mano. Y solo existen paquetes para 3 platos de los ~25 que podrían tenerlo.
- **Un paquete es UN solo `order_item`.** El detalle vive dentro de
  `custom_modifiers` como texto. En el Pase eso significa que la entrada y la
  bebida **no se pueden marcar como entregadas por separado** — solo se marca
  el paquete completo de un golpe. La bebida tampoco se rutea a la sección de
  barra de la comanda.
- **Hay dos almacenamientos distintos para lo mismo.** Categoría/subcategoría
  → normalizado en `modifier_steps`/`modifier_options`, solo 4 tipos de paso.
  Producto → JSON en `product_flows.steps`, 6 tipos. No hay una verdad.
- **No existe "flujo global".** Un flujo pertenece a exactamente un producto,
  subcategoría o categoría. No hay dónde vivir un "Paquete" que aplique a
  varias categorías.

### Decisiones tomadas

| Tema | Decisión |
|---|---|
| Motor | **Grafo real**: nodos + aristas con condiciones. Las aristas mandan |
| Café | **Frío/Caliente = variantes del producto** (precio exacto, reusa lo que ya funciona). El grafo ramifica según la variante elegida |
| Precio de paquete | **Precio del plato + delta configurable** por categoría, con override por producto |
| Salida del paquete | **Item padre + items hijos** (`order_items` reales). La bebida llega a barra, el Pase marca cada componente |
| Composición | **Concatenar**: primero el grafo propio/de categoría, luego el global de Paquete (auto-splice) |
| Almacenamiento | **Tablas nuevas unificadas** + migración. `modifier_steps`/`product_flows` quedan solo-lectura |
| Selecciones | **Tabla `order_item_selections`**. `frosting_id`/`dry_topping_id` dejan de escribirse |
| Web pública | **Fase 2.** El endpoint público sigue sirviendo el formato lineal, aplanado al camino default |
| Paqueteables | Flujo global con **categorías incluidas** + override por producto |
| Precio de opciones que apuntan a productos | 3 modos por opción: `free` / `product_price` / `delta` |
| Variantes de opción | **Sí** ("Pepsi → Black", "Quesadilla → Pieza/Orden") |
| Productos `Paquete *` legacy | Migrar y **soft-delete** (`deleted_at`), el histórico se preserva |
| Mín/máx por nodo | **Sí**, `min_selections`/`max_selections` |
| Cantidad > 1 | Cada corrida del grafo = **1 item padre**. 2 paquetes = correr el flujo 2 veces |
| Editor | **Canvas React Flow de verdad** + validación + simulador |
| Evaluación | Backend resuelve y manda el grafo **completo**; el cliente evalúa en memoria, **sin red entre nodos** |

### Decisión derivada que hay que conocer: `flow_tags`

Para que "Tipo de leche" aplique solo a los cafés con leche **sin tener que
editar el flujo cada vez que entra un café nuevo**, hace falta un predicado
sobre el producto que no sea su categoría. Se agrega
**`products.flow_tags`** (JSON array de strings, p.ej. `["con-leche"]`),
editable como chips en el formulario de producto, y las condiciones de arista
soportan `productHasTag`.

Se evaluó y se descartó:
- *Listar los product ids en la condición* → rompe justo el objetivo (producto
  nuevo = editar el flujo).
- *Reusar subcategorías como "Con leche"/"Sin leche"* → `kitchenPrint`
  prefija el nombre de la subcategoría en la comanda, imprimiría
  "Con leche - Capuccino". Mal para cocina.

---

## 2. Modelo de datos

**Las dos copias de schema se mantienen a mano** (`lib/db/schema.ts` para el
panel Next.js y `api-server/src/schema.ts` para el backend Express). Toda tabla
y columna nueva va **en las dos**, o panel y backend divergen en silencio. Ver
`CLAUDE.md`.

### 2.1 Definición del flujo

```sql
-- Un grafo. Puede ser global, o colgar de categoría/subcategoría/producto.
CREATE TABLE flow_definitions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        varchar(255) NOT NULL,          -- "Café", "Paquete", "Proteínas mixtas"
  description text,
  scope_kind  flow_scope_kind NOT NULL,       -- 'global'|'category'|'subcategory'|'product'
  priority    integer NOT NULL DEFAULT 0,     -- desempate dentro del mismo scope_kind
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamp NOT NULL DEFAULT now(),
  updated_at  timestamp NOT NULL DEFAULT now()
);

-- A qué aplica. include = entra; exclude = se saca aunque un include lo tome.
CREATE TABLE flow_targets (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id        uuid NOT NULL REFERENCES flow_definitions(id) ON DELETE CASCADE,
  mode           flow_target_mode NOT NULL,   -- 'include'|'exclude'
  category_id    uuid REFERENCES categories(id)    ON DELETE CASCADE,
  subcategory_id uuid REFERENCES subcategories(id) ON DELETE CASCADE,
  product_id     uuid REFERENCES products(id)      ON DELETE CASCADE
  -- INVARIANTE (aplicación, no constraint): exactamente uno de los 3 seteado
);

CREATE TABLE flow_nodes (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id              uuid NOT NULL REFERENCES flow_definitions(id) ON DELETE CASCADE,
  title                varchar(255) NOT NULL,  -- "Temperatura", "¿Paquete?", "Bebida"
  subtitle             text,
  select_mode          flow_select_mode NOT NULL DEFAULT 'single', -- 'single'|'multi'
  min_selections       integer NOT NULL DEFAULT 0,
  max_selections       integer,                -- null = sin límite
  include_none_option  boolean NOT NULL DEFAULT true,
  none_label           varchar(255),           -- override de "Sin <title>"
  is_entry             boolean NOT NULL DEFAULT false,  -- exactamente 1 por flow
  pos_x                integer NOT NULL DEFAULT 0,      -- canvas del editor
  pos_y                integer NOT NULL DEFAULT 0,
  sort_order           integer NOT NULL DEFAULT 0,
  active               boolean NOT NULL DEFAULT true,
  created_at           timestamp NOT NULL DEFAULT now()
);

CREATE TABLE flow_node_options (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id              uuid NOT NULL REFERENCES flow_nodes(id) ON DELETE CASCADE,
  source               flow_option_source NOT NULL, -- 'manual'|'product'|'category'
  label                varchar(255),           -- manual: el texto. product/category: override opcional
  ref_product_id       uuid REFERENCES products(id)   ON DELETE SET NULL,
  ref_category_id      uuid REFERENCES categories(id) ON DELETE SET NULL,
  ref_variant_name     varchar(255),           -- variante concreta ("Black")
  allow_variant_choice boolean NOT NULL DEFAULT false, -- deja elegir la variante en el POS
  price_mode           flow_price_mode NOT NULL DEFAULT 'delta', -- 'free'|'product_price'|'delta'
  price_delta          decimal(10,2) NOT NULL DEFAULT 0,
  emits_child_item     boolean NOT NULL DEFAULT false,  -- genera order_item hijo
  sort_order           integer NOT NULL DEFAULT 0,
  active               boolean NOT NULL DEFAULT true,
  created_at           timestamp NOT NULL DEFAULT now()
);

-- "Esta opción cuesta X si el producto BASE es de la categoría Y".
-- Es lo que permite un solo nodo "¿Paquete?" con delta distinto por categoría.
CREATE TABLE flow_option_price_overrides (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  option_id      uuid NOT NULL REFERENCES flow_node_options(id) ON DELETE CASCADE,
  category_id    uuid REFERENCES categories(id)    ON DELETE CASCADE,
  subcategory_id uuid REFERENCES subcategories(id) ON DELETE CASCADE,
  product_id     uuid REFERENCES products(id)      ON DELETE CASCADE,
  price_delta    decimal(10,2) NOT NULL
  -- INVARIANTE: exactamente uno de los 3 seteado.
  -- Precedencia al resolver: product > subcategory > category > price_delta de la opción
);

CREATE TABLE flow_edges (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id        uuid NOT NULL REFERENCES flow_definitions(id) ON DELETE CASCADE,
  from_node_id   uuid NOT NULL REFERENCES flow_nodes(id) ON DELETE CASCADE,
  from_option_id uuid REFERENCES flow_node_options(id) ON DELETE CASCADE, -- null = cualquier opción
  to_node_id     uuid REFERENCES flow_nodes(id) ON DELETE CASCADE,        -- null = fin del grafo
  condition      jsonb,                        -- null = sin condición
  sort_order     integer NOT NULL DEFAULT 0,   -- la menor = camino default (para el aplanado)
  created_at     timestamp NOT NULL DEFAULT now()
);
```

Enums nuevos: `flow_scope_kind`, `flow_target_mode`, `flow_select_mode`,
`flow_option_source`, `flow_price_mode`.

### 2.2 Condición de arista (`flow_edges.condition`)

JSON, todas las claves presentes se combinan con **AND**:

```jsonc
{
  "variantNameIn":  ["Caliente"],         // variante del producto base
  "productHasTag":  "con-leche",          // products.flow_tags
  "productIdIn":    ["uuid", "..."],
  "categoryIdIn":   ["uuid"],
  "optionSelected": "uuid-de-opcion"      // alguna opción ya elegida en el path
}
```

### 2.3 Salida en la orden

```sql
ALTER TABLE order_items
  ADD COLUMN parent_item_id uuid REFERENCES order_items(id) ON DELETE CASCADE,
  ADD COLUMN package_label  varchar(255);   -- "Paquete" en el padre; null en lo demás

ALTER TABLE products
  ADD COLUMN flow_tags jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE order_item_selections (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id    uuid NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  flow_id          uuid REFERENCES flow_definitions(id) ON DELETE SET NULL,
  node_id          uuid REFERENCES flow_nodes(id)       ON DELETE SET NULL,
  option_id        uuid REFERENCES flow_node_options(id) ON DELETE SET NULL,
  node_title       varchar(255) NOT NULL,   -- SNAPSHOT
  option_label     varchar(255) NOT NULL,   -- SNAPSHOT
  price_delta      decimal(10,2) NOT NULL DEFAULT 0,
  ref_product_id   uuid REFERENCES products(id) ON DELETE SET NULL,
  ref_variant_name varchar(255),
  ref_list_price   decimal(10,2),           -- precio de menú del producto referenciado, para reportes
  child_item_id    uuid REFERENCES order_items(id) ON DELETE SET NULL,
  sort_order       integer NOT NULL DEFAULT 0,
  created_at       timestamp NOT NULL DEFAULT now()
);
```

**`node_title` y `option_label` son snapshots a propósito.** Renombrar una
opción en el editor no debe reescribir el histórico ni los tickets ya impresos.

**Hijos a $0:** `unit_price = 0`, `subtotal = 0`. El precio real de menú del
componente vive en `order_item_selections.ref_list_price`, **no** en
`original_price` (esa columna la usa el motor de promociones y mezclarlas
causaría descuentos fantasma).

---

## 3. Resolución y formato de cable

### 3.1 Qué flujos aplican a un producto

1. Juntar todos los `flow_definitions` activos con un `flow_targets` que haga
   match con el producto: por `product_id`, por su `subcategory_id`, por su
   `category_id`, o `scope_kind='global'` (los globales aplican según sus
   propios targets; un global **sin** targets `include` aplica a todo).
2. Quitar los que tengan un `flow_targets` con `mode='exclude'` que haga match.
   **`exclude` gana siempre sobre `include`.**
3. Ordenar: `scope_kind` (`product`=0, `subcategory`=1, `category`=2,
   `global`=3), luego `priority` asc, luego `name` asc.

### 3.2 Concatenación (auto-splice)

Al componer la lista ordenada de grafos: toda arista de `flujo[N]` con
`to_node_id = null` se reescribe para apuntar al nodo `is_entry` de
`flujo[N+1]`. Las de `flujo[último]` se quedan en `null` = fin.

El splice ocurre **en el resolver (servidor)**. El cliente recibe un solo grafo
ya compuesto y no sabe que venía de varios flujos.

### 3.3 Expansión dinámica (servidor)

Una opción `source='category'` se expande a **una opción por producto activo**
de esa categoría (y una por variante si el producto tiene variantes). Hereda
`price_mode`/`price_delta`/`emits_child_item` de la opción madre.

**Regla de override:** si en el **mismo nodo** existe otra opción con
`source='product'` y el mismo `ref_product_id` (+ `ref_variant_name` si
aplica), esa opción explícita **reemplaza** a la expandida. Eso es lo que
permite "todas las bebidas incluidas, pero Limonada Mineral +$10" sin
enumerar las 15 bebidas.

El servidor también resuelve, por opción:
- `effectivePrice`: `free`→0, `product_price`→precio real (o de la variante),
  `delta`→`price_delta` tras aplicar `flow_option_price_overrides` con
  precedencia `product > subcategory > category > base`.
- `isBeverage` del producto referenciado (para que el hijo se rutee a barra).
- `variantChoices` cuando `allow_variant_choice = true`.

### 3.4 Formato de cable

`GET /api/products/:id/flow?format=graph`

```jsonc
{
  "productId": "...",
  "format": "graph",
  "source": "composed",
  "flows": [{ "id": "...", "name": "Café", "scopeKind": "category", "priority": 0 }],
  "entryNodeId": "...",
  "nodes": [{
    "id": "...", "flowId": "...", "title": "Tipo de leche", "subtitle": null,
    "selectMode": "single", "minSelections": 0, "maxSelections": null,
    "includeNoneOption": true, "noneLabel": null,
    "options": [{
      "id": "...", "label": "Avena", "source": "manual",
      "priceMode": "delta", "effectivePrice": 6,
      "refProductId": null, "refVariantName": null,
      "variantChoices": null, "emitsChildItem": false, "isBeverage": false
    }]
  }],
  "edges": [{ "fromNodeId": "...", "fromOptionId": null, "toNodeId": null,
              "condition": null, "sortOrder": 0 }]
}
```

**Sin `?format=graph`** el endpoint sigue devolviendo el formato lineal viejo
(`{ productId, useDefaultFlow, steps[], source }`), aplanando el grafo por su
camino default: desde `entryNodeId`, en cada nodo se sigue la arista de menor
`sortOrder`, y los nodos de ese camino se emiten como `steps[]`. Eso es lo que
mantiene vivas la web pública y cualquier app vieja en TestFlight.

### 3.5 Semántica del motor (idéntica en TS y en Swift)

```
nextNode(graph, currentNodeId, selectedOptionIds, ctx) -> nodeId | null
```
De las aristas que salen de `currentNodeId`, ordenadas por `sortOrder`, se toma
**la primera** que cumpla las dos cosas:
- `fromOptionId` es `null`, **o** está en `selectedOptionIds`;
- `condition` es `null`, **o** evalúa true contra `ctx`
  (`{ productId, categoryId, subcategoryId, variantName, flowTags, pathOptionIds }`).

Si ninguna cumple → `null` (fin del grafo).

```
canAdvance(node, selectedOptionIds) -> bool
```
`selected.count >= minSelections` y (`maxSelections == null` o
`selected.count <= maxSelections`). Un nodo `single` avanza solo al elegir; un
nodo `multi` avanza con botón "Siguiente".

```
computeTotal(graph, path, basePrice) -> Double
```
`basePrice` (precio de la variante elegida, o del producto) **+** la suma de
`effectivePrice` de **todas** las opciones del path. Los hijos NO suman: su
precio ya está dentro del `effectivePrice` de su opción.

```
buildItems(graph, path, product, variant, ctx) -> (parent, children[], selections[])
```
- **padre**: `productId` del producto base, `productName` = `"Producto - Variante"`
  si hay variante, `unitPrice` = `computeTotal`, `packageLabel` = nombre del
  `flow_definition` que emitió hijos (o `null`).
- **hijos**: uno por opción seleccionada con `emitsChildItem = true`.
  `productId = refProductId`, `productName` = snapshot (+ variante),
  `unitPrice = 0`, `subtotal = 0`, `parentItemId` = el padre,
  `seat`/`course` heredados del padre, `isBeverage` del servidor.
- **selections**: una por opción del path, con sus snapshots.

```
validateGraph(graph) -> Problem[]
```
Exactamente un `is_entry`; sin ciclos; sin nodos inalcanzables desde la entrada;
`minSelections <= maxSelections`; `minSelections <= #opciones`; en un nodo
`single` con `includeNoneOption=false` y `minSelections>=1`, toda opción debe
tener arista propia o existir una arista default; referencias a
productos/categorías que sigan existiendo y activas.

> **Las dos implementaciones del motor (TS y Swift) comparten un archivo de
> vectores de prueba**: `lib/flows/fixtures/engine-vectors.json`. Ambos test
> suites lo cargan y corren los mismos casos. Es el único seguro contra que las
> dos copias se separen. Si agregas un caso, se agrega al JSON, no al test.

---

## 4. Diseño concreto de los dos casos reales

### 4.1 Café

**Migración de catálogo** (6 pares duplicados → 1 producto con variantes,
precios exactos de hoy, el duplicado se soft-deletea):

| Producto | Variantes | `flow_tags` |
|---|---|---|
| Americano | Frío $39 · Caliente $40 | `[]` |
| Capuccino | Frío $40 · Caliente $45 | `["con-leche"]` |
| Caramel | Frío $45 · Caliente $50 | `["con-leche"]` |
| Chocolate | Frío $45 · Caliente $50 | `["con-leche"]` |
| Moka | Frío $45 · Caliente $50 | `["con-leche"]` |
| Latte | Frío $40 · Caliente $45 | `["con-leche"]` |
| Coffee tonic | Frío $45 (única) | `[]` |
| Tissana Frutal | Caliente $50 (única) | `[]` |
| Espresso | **se queda como está** (Sencillo $30 / Doble $39) | `[]` |

Las subcategorías `Fríos`/`Calientes` quedan vacías y se desactivan
(`active = false`), no se borran: `order_items` históricos no las referencian
(guardan `product_name` plano), pero los productos soft-deleteados sí.

**Grafo "Café"** — `scope_kind='category'`, target include categoría Café:

```
[Tipo de leche]  (single, none=true, label "Entera")
   opciones: Deslactosada (+0) · Avena (+6)
   aristas de entrada: condicionadas
   arista salida → null
```
La arista que **entra** al grafo viene del splice; el nodo es `is_entry`. Para
que solo se pregunte cuando aplica, el grafo arranca en un nodo **router**:

```
[__router Café] (single, sin opciones visibles → nodo de paso)
   ├─ edge sortOrder 0 → [Tipo de leche]   si { variantNameIn:["Caliente"], productHasTag:"con-leche" }
   └─ edge sortOrder 1 → null              (sin condición: default)
```

> **Nodo de paso:** un `flow_node` sin opciones no se le muestra al mesero; el
> motor lo atraviesa evaluando sus aristas. Es lo que permite ramificar sobre
> el producto/variante **antes** de preguntar nada. `validateGraph` lo acepta
> solo si tiene al menos una arista de salida.

Resultado: Capuccino Caliente pregunta leche. Capuccino Frío no. Americano
Caliente no. Coffee tonic no. Un café nuevo con leche: se le pone el tag y ya.

### 4.2 Paquete

**Grafo "Paquete"** — `scope_kind='global'`, `priority = 100` (va al final):

`flow_targets` include: Aguachiles, Camarones, Caldos, Ceviches, Pescado,
Especiales. (Bebidas, Café, Extras y Postres quedan fuera por omisión — no
hace falta `exclude`.)

```
[¿Paquete?]  single, none=false, is_entry
   ├─ "Solo el plato"  free            → null (fin)
   └─ "Hacer paquete"  delta, overrides por categoría:
                       Aguachiles +61 · Camarones +49 · Caldos +64
                                                       → [Entrada]

[Entrada]  single, none=false, min=1
   opciones source='product', emits_child_item=true:
     Pescadito                free
     Empanada de camarón      delta +20
     Empanada de pulpo        delta +20
     Empanada Mixta           delta +20
     Quesadilla de camarón    free   (allow_variant_choice=true → Pieza/Orden)
     Quesadilla pulpo         free   (allow_variant_choice=true)
     Quesadilla de Pescado    free   (allow_variant_choice=true)
                                                       → [Bebida]

[Bebida]  single, none=false, min=1
   opción madre: source='category' → Bebidas, free, emits_child_item=true
                 (expande sola: producto nuevo en Bebidas aparece sin tocar nada)
   overrides explícitos en el mismo nodo (source='product', delta +10):
     Limonada - Mineral · Naranjada - Mineral · Sangría (prep) · Agua mineral (prep)
                                                       → null (fin)
```

**Verificación contra los precios de hoy:**

| Hoy | Nuevo | |
|---|---|---|
| Paquete aguachile $280 | Aguachile Verde $219 + 61 = **$280** | ✓ |
| Paquete camarones $235 | Camarones Coco $186 + 49 = **$235** | ✓ |
| Paquete caldo camarón $169 | Caldo de camarón $105 + 64 = **$169** | ✓ |
| — | En crema chipotle $169 + 49 = **$218** | ⚠️ hoy habría sido $235. **Es el cambio aceptado** al pasar a delta |

Los 3 productos `Paquete *` se soft-deletean (`deleted_at`) y la categoría
`Paquetes` se desactiva. El histórico los sigue resolviendo por
`order_items.product_name`.

---

## 5. Radio de impacto de los items hijos

Un `order_item` a $0 colgado de un padre **toca muchas cosas que hoy asumen que
todo item es independiente y cobrable**. Cada punto de esta lista es trabajo
real, no una nota de precaución:

| Dónde | Qué pasa si no se toca | Qué hacer |
|---|---|---|
| `lib/utils/promotions.ts` (`applyPromotions`) | Una promo de categoría se aplicaría a un hijo de $0 y, peor, el motor **muta `unitPrice`** — ya causó un doble descuento una vez | **Ignorar** items con `parentItemId != null` |
| `lib/suppliers/calculate.ts` | Un hijo "Empanada $0" cuenta como empanada vendida. En `fixed_cost` eso es **correcto** (el insumo se consumió). En `percentage` **diluye** el revenue a 0 | `fixed_cost`: contar hijos. `percentage`: excluirlos (el revenue vive en el padre). Documentarlo en el archivo |
| Corte de caja (`api-server/src/routes/cash-register.ts` **y** su espejo `app/api/cash-register/[id]/{corte,close}`) | Las sumas de `subtotal` no cambian (hijos = 0) ✓ pero los **conteos de platillos** se duplican | Contar solo padres donde se cuenten "platillos vendidos" |
| `app/api/dashboard/stats/route.ts` (L87-102) | El query de top-productos agrupa por `productName` sumando `quantity`: una Pepsi hija aparece con cantidad N y revenue 0, contaminando el ranking | Filtrar `parent_item_id IS NULL` en el mismo `and()` que ya excluye `CUSTOM_MODIFIER_PRODUCT_ID`. Las sumas de dinero no lo necesitan; los **conteos** sí |
| Split de cuenta (`SplitBillViews.swift`) | Un hijo de $0 asignable a otro asiento = paquete partido a la mitad | Los hijos **no son asignables**; siguen a su padre |
| Anulación (`voided`) | Anular el padre deja hijos vivos | Anular padre ⇒ anular hijos (misma transacción) |
| Edición de item (`POST /api/orders/:id/items/:itemId`) | Se puede editar un hijo a un precio | Rechazar edición directa de hijos |
| `kitchenPrint.ts` + `print-server/server.js` | Los hijos salen como líneas sueltas sin relación visual con el plato | Imprimir hijos **indentados** bajo el padre; el hijo-bebida ya cae solo en la sección BEBIDAS por `isBeverage` |
| Pase (`BRUMA_Dispatch`) | — | Los hijos ya son `order_items`, así que ya son filas marcables individualmente. Falta el **anidado visual** en `BatchCardView` y que marcar el padre NO marque a los hijos |
| `convertOrdersToBatches` | Un hijo y su padre podrían caer en batches distintos si el gap de 30s los separa | Un hijo hereda el batch de su padre |
| Órdenes en línea (`online-orders.ts`) | La web pública manda `customModifiers` plano, sin hijos | Se **mantiene** el camino viejo de escritura hasta la fase 2 |

---

## 6. Inventario de archivos

### Se reescriben
- `api-server/src/routes/flows.ts` — resolver de grafo + aplanado legacy
- `components/flow-editor/{FlowEditor,StepNode,StepEditPanel,AddStepPanel}.tsx`
- `Bruma POS/Bruma POS/Models/CategoryFlow.swift` → `Models/FlowGraph.swift`
- `lib/flows/resolveProductFlow.ts` → envoltorio del nuevo resolver

### Se modifican quirúrgicamente
- `lib/db/schema.ts` · `api-server/src/schema.ts` (las dos copias)
- `api-server/src/routes/orders.ts` (insert de items, líneas ~250-310 y ~400-440)
- `api-server/src/lib/kitchenPrint.ts` · `print-server/server.js`
- `Bruma POS/Bruma POS/ViewModels/POSViewModel.swift` (motor de flujo, ~2280-2660)
- `Bruma POS/Bruma POS/Views/ProductGridView.swift` (UI de paso, ~133-200)
- `Bruma POS/Bruma POS Mobile/Views/ComandasOrderTakingView.swift` (~468-600)
- `Bruma POS/Bruma POS.xcodeproj/project.pbxproj` (`membershipExceptions`)
- `app/bar/page.tsx` (motor lineal propio, ~1340-1660 y ~4770-4800)
- `lib/utils/promotions.ts` · `lib/suppliers/calculate.ts`
- `BRUMA_Dispatch/BRUMA_Dispatch/{Models,BatchCardView,OrdersViewModel}.swift`

### Nuevos
- `lib/flows/{types,engine,resolve,validate}.ts` + `fixtures/engine-vectors.json`
- `Bruma POS/Bruma POS/Services/FlowEngine.swift` ⚠️ **hay que agregarlo a
  `membershipExceptions`** o Mobile deja de compilar (ver `CLAUDE.md`)
- `app/api/flows/**` — CRUD del editor
- `app/(dashboard)/flows/**` — lista de flujos + editor + simulador
- `scripts/flows-v2-schema.mjs` — DDL
- `scripts/flows-v2-migrate-data.mjs` — migración de datos
- `scripts/flows-v2-migrate-cafe.mjs` — consolidación de Café

### Quedan solo-lectura (legacy, se borran al final)
- `modifier_steps`, `modifier_options`, `product_flows`
- `app/api/modifier-steps/**`, `app/api/modifier-options/**`

---

## 7. UX: que el flujo se sienta mantequilla

Requisito explícito del usuario, aplica a **iPad POS y POS Mobile por igual**
(código compartido). No es decoración: hoy cada paso puede disparar red.

1. **Cero red entre nodos.** El grafo completo se trae **una vez** al tocar el
   producto (o al elegir variante) y se evalúa en memoria. Hoy
   `fetchProductFlow` se llama al entrar y punto — eso se conserva, pero ahora
   el grafo trae TODO (opciones expandidas, precios efectivos, variantes), así
   que ningún nodo intermedio necesita pedir nada.
2. **Prefetch.** Al abrir una categoría se precargan en background los grafos
   de sus productos visibles, con cache en memoria por `productId` invalidado
   por el evento de socket de flujos.
3. **Navegación con pila, no con índice.** `currentStepIndex: Int` muere. Entra
   `flowPath: [FlowVisit]` (nodo + selecciones). "Atrás" hace `pop` y **recupera
   las selecciones** de ese nodo — hoy el back pierde lo elegido.
4. **Breadcrumb del camino.** El header muestra las decisiones tomadas
   ("Caliente › Avena") y cada una es tappable para volver a ese punto.
5. **Transición sin parpadeo.** Mismo patrón que ya usa el salto
   variantes→notas en `POSViewModel` (~línea 2395): apagar y prender en el
   **mismo tick** para que el contenedor del sheet nunca pase por "cerrado".
6. **Nodos de paso son invisibles.** El motor los atraviesa sin render. El
   mesero nunca ve una pantalla vacía.
7. **El precio se actualiza en vivo** en el header conforme se elige.
8. **Haptics en cada selección** (`Haptics.tap()`, ya existe).
9. **Resumen antes de confirmar.** Último paso = tarjeta con padre + hijos +
   precio desglosado, con cada línea editable.
10. **El carrito anida los hijos** bajo su padre, con el `packageLabel` como
    badge. Borrar el padre borra el grupo; los hijos no se borran solos.

**Regla dura de rendimiento (ver `CLAUDE.md`):** ninguna celda/chip nueva de
estas vistas recibe `@ObservedObject var vm: POSViewModel`. Reciben el nodo/la
opción + primitivos + callbacks. Con `vm` completo, cualquiera de sus ~150
`@Published` re-renderiza cada celda.

---

## 8. Plan de ejecución — 6 workers, 4 olas

Agentes **Codex**, en el worktree actual. La frontera entre workers es
**propiedad de archivos**: dos workers nunca editan el mismo archivo.

### Ola 1 — arranca sin dependencias

**W1 · `schema`** → Tarea A
- **Target:** `lib/db/schema.ts`, `api-server/src/schema.ts`,
  `scripts/flows-v2-schema.mjs`
- **Change:** los 5 enums, las 6 tablas nuevas de §2.1, `order_item_selections`,
  `order_items.parent_item_id`, `order_items.package_label`,
  `products.flow_tags` — **en las dos copias de schema**, con sus `relations()`
  de Drizzle. Más un script `.mjs` que aplica el DDL contra `DATABASE_URL`.
- **Constraints:** `npm run db:migrate` **no se usa nunca** (la tabla de
  tracking está desincronizada; reproduce desde la 0000 y truena). El script lee
  `DATABASE_URL` de `.env` con `fs.readFileSync` + regex, **sin `dotenv`** (es
  phantom dependency en este pnpm). Se ejecuta **desde la raíz del repo** o
  `@neondatabase/serverless` no resuelve. Todo statement es `IF NOT EXISTS` /
  idempotente. No se borra ni altera ninguna tabla existente.
- **Ownership:** solo esos 3 archivos.
- **Acceptance:** `npx tsc --noEmit` pasa en raíz y en `api-server/`; el script
  corre dos veces seguidas sin error; un `SELECT` de prueba a cada tabla nueva
  responde.

**W2 · `engine-ts`** → Tarea B
- **Target:** `lib/flows/types.ts`, `engine.ts`, `validate.ts`,
  `fixtures/engine-vectors.json`, tests
- **Change:** motor puro de §3.5 — `nextNode`, `canAdvance`, `computeTotal`,
  `buildItems`, `validateGraph`. Sin tocar DB, red ni React. Y el JSON de
  vectores, que debe cubrir: Café (4 ramas: Caliente+leche, Caliente sin leche,
  Frío, variante única), Paquete (las 3 categorías con su delta + los overrides
  de bebida +$10), nodo de paso, min/max, override de opción explícita sobre
  expansión de categoría, ciclo, nodo inalcanzable, dos entries.
- **Constraints:** funciones **puras**, sin `Date.now()` ni azar. Los vectores
  son el contrato con Swift: cada caso lleva `input` + `expected` y se nombran
  en kebab-case estable — **W4 los va a consumir y no los puede cambiar**.
- **Acceptance:** todos los vectores pasan; `npx tsc --noEmit` limpio.

### Ola 2 — depende de A y B

**W2 (reusa terminal)** → Tarea D: resolver + CRUD
- **Target:** `api-server/src/routes/flows.ts`, `lib/flows/resolve.ts`,
  `lib/flows/resolveProductFlow.ts`, `app/api/flows/**`,
  `app/api/products/[id]/flow`, `app/api/categories/[id]/flow`,
  `app/api/subcategories/[id]/flow`, `app/api/public/menu/[id]/flow`
- **Change:** resolución §3.1, splice §3.2, expansión §3.3, formato §3.4, y el
  **aplanado legacy** sin `?format=graph`. CRUD del editor (crear/editar/borrar
  flujos, nodos, opciones, aristas, targets, overrides) con `validateGraph` en
  el guardado. Emitir el evento de socket de invalidación de flujos.
- **Constraints:** `GET /api/products/:id/flow` **sin** `format=graph` tiene que
  devolver exactamente la misma forma que hoy — es lo que mantiene vivas la web
  pública y las apps viejas. Nada de self-fetch entre route handlers de Next.js
  (ya murió una vez con `ERR_SSL_WRONG_VERSION_NUMBER`): la lógica vive en
  `lib/` y se llama directo. Las rutas de Next.js y las de `api-server` **leen
  de su propia copia de schema**.
- **Acceptance:** contra la DB real, `?format=graph` de un café devuelve el
  router + el nodo de leche; sin el flag devuelve el formato viejo; un grafo con
  ciclo es rechazado por el POST con 400.

**W3 · `orders`** → Tarea E: padre/hijo + selecciones + radio de impacto
- **Target:** `api-server/src/routes/orders.ts`, `online-orders.ts`,
  `lib/utils/promotions.ts`, `lib/suppliers/calculate.ts`,
  `api-server/src/routes/cash-register.ts`,
  `app/api/cash-register/[id]/{corte,close}/route.ts`
- **Change:** aceptar items con `parentIndex` (posición del padre en el array
  entrante) y `selections[]`; insertar padre, luego hijos con
  `parent_item_id`, luego `order_item_selections` — **en el mismo `db.batch`**.
  Resolver `isBeverage` de los hijos server-side. Más los **12 puntos de §5**.
- **Rutas exactas** (verificadas en el archivo, no asumidas):
  `POST /orders` (L218) y `POST /orders/:id/items` (L393) son las que reciben
  items. `POST /orders/:id/send-to-kitchen` (L980) **no recibe items** — solo
  cambia status e imprime, no se toca. La cascada de anulación va en **dos**
  rutas: `PATCH /order-items/:id/void` (L1869) y
  `PATCH /orders/:id/items/:itemId/void` (L1903). El rechazo de edición de un
  hijo va en `PATCH /order-items/:id` (L1937). Las rutas de entrega
  (`/deliver`, `batch-ready`, `batch-unready`) **no cascadean a propósito**:
  marcar el padre no marca a los hijos, que es el control granular que se
  busca en el Pase.
- **Constraints:** Neon HTTP no soporta la API de transacción por callback de
  Drizzle; se usa `db.batch` (ya es el patrón del archivo). Los hijos nunca
  suman a `orders.subtotal`. Cada filtro nuevo de caja/reportes se replica en
  **las dos copias espejo** (`api-server` y `app/api/cash-register`). No se
  cambia la forma del body que mandan los clientes viejos: sin `parentIndex`
  todo sigue funcionando igual que hoy.
- **Acceptance:** `POST /api/orders` con un paquete crea 1 padre + 2 hijos +
  N selecciones, `orders.subtotal` = solo el padre; anular el padre anula los
  hijos; un corte con un paquete pagado cuadra al centavo contra el cálculo a
  mano; `calculateSupplierTotals` sobre un rango con paquetes da el mismo
  número que antes para `percentage`.

**W4 · `ios`** → Tarea C: motor Swift
- **Target:** `Bruma POS/Bruma POS/Models/FlowGraph.swift` (nuevo),
  `Services/FlowEngine.swift` (nuevo), `project.pbxproj`
- **Change:** `Codable` del formato §3.4 y puerto 1:1 de la semántica §3.5, con
  un test suite que **carga `lib/flows/fixtures/engine-vectors.json`** y corre
  los mismos casos.
- **Constraints:** ⚠️ los dos archivos nuevos se agregan a
  `membershipExceptions` en `project.pbxproj` ("Exceptions for 'Bruma POS'
  folder in 'Bruma POS Mobile' target") — esa lista es **opt-in**: un archivo
  nuevo en `Models/`/`Services/` NO se comparte solo y Mobile deja de compilar
  con `cannot find 'X' in scope`. Decodificar con
  `.convertFromSnakeCase`, igual que `APIService`. **Los diagnósticos de
  SourceKit en este proyecto son frecuentemente falsos** — la única señal de
  verdad es la salida de `xcodebuild`.
- **Acceptance:** `xcodebuild build -scheme "Bruma POS"` y
  `-scheme "Bruma POS Mobile"` compilan; los vectores pasan en Swift con los
  mismos `expected` que en TS.

### Ola 3 — depende de D y E

**W4 (reusa terminal)** → Tarea H: `POSViewModel` + carrito
- **Target:** `POSViewModel.swift`, `Models/CartItem` (en `Product.swift`),
  vistas de carrito de los dos targets
- **Change:** sacar `currentStepIndex`/`categoryFlow`/`stepSelections` y meter
  `flowGraph` + `flowPath: [FlowVisit]`. `buildFlowCartItem` → `FlowEngine.buildItems`
  devolviendo padre + hijos + selecciones. `addToCart` acepta el grupo atómico.
  Cache + prefetch de grafos (§7.1-7.2).
- **Constraints:** `POSViewModel.swift` es **compartido** por los dos targets —
  si referencia un tipo que vive solo en `Views/` de iPad, ese tipo se duplica
  en `Bruma POS Mobile/POSViewModelTypeShims.swift`, **nunca** se comparte la
  vista completa. Borrar el padre borra el grupo. No se rompe `isPracticeMode`
  ni el gate de caja de `handleSendToKitchen`.
- **Acceptance:** los dos schemes compilan; en simulador, un paquete entra al
  carrito como padre + 2 hijos anidados y al enviar a cocina el backend recibe
  `parentIndex`.

**W4 (reusa terminal)** → Tarea I: UI de los dos targets
- **Target:** `Views/ProductGridView.swift` (iPad),
  `Bruma POS Mobile/Views/ComandasOrderTakingView.swift`
- **Change:** render genérico de nodo (título, subtítulo, grid de opciones,
  min/max, "Siguiente" en multi), breadcrumb tappable, precio en vivo, pantalla
  de resumen, y los 10 puntos de §7.
- **Constraints:** cada archivo sirve a **un solo** target; nunca se tocan los
  archivos de `Bruma POS` para cambiarle algo a Mobile. `FlatCard`/`FlatPill`
  son `ViewModifier`, se usan como `.modifier(FlatCard(cornerRadius: 12))` —
  **no existe** `.flatCard(...)`. Ninguna celda recibe el `vm` completo.
- **Acceptance:** los dos schemes compilan; capturas de los 4 caminos de Café y
  de un paquete completo en simulador.

**W5 · `dashboard`** → Tarea F: editor + simulador
- **Target:** `components/flow-editor/**`, `app/(dashboard)/flows/**`,
  entradas en `app/(dashboard)/inventory/**`, UI de `flow_tags` en el formulario
  de producto
- **Change:** canvas donde **las aristas sí mandan**: conectar define el
  siguiente nodo, cada arista tiene su condición editable (§2.2), panel de nodo
  con min/max y modos de precio, picker de productos/categorías que reusa
  `components/promotion-product-picker.tsx`, panel de validación en vivo con los
  problemas de `validateGraph`, y un **simulador** que recorre el grafo como lo
  haría el POS sin salir del navegador.
- **Constraints:** quitar los `@ts-nocheck` de los archivos que se reescriban.
  El simulador usa `lib/flows/engine.ts`, **no** una copia. Guardar llama al
  CRUD de W2, no escribe DB directo.
- **Acceptance:** se puede construir el grafo de Café y el de Paquete completos
  desde cero en la UI; el simulador da los mismos resultados que los vectores;
  un ciclo se marca en rojo y el guardado se bloquea.

**W5 (reusa terminal)** → Tarea G: `app/bar`
- **Target:** `app/bar/page.tsx`
- **Change:** tirar el motor lineal propio (~1340-1660, ~4770-4800) y usar el
  grafo por producto + `lib/flows/engine.ts`.
- **Constraints:** hoy el bar pide flujo **de categoría**; pasa a pedir el del
  producto. Cuidado con el doble descuento de promociones: el subtotal "antes de
  descuentos" suma `originalPrice ?? unitPrice` y resta
  `totalPromotionDiscount` **una sola vez** — ya rompió caja una vez.
- **Acceptance:** vender un café y un paquete desde `app/bar` produce los mismos
  `order_items` que el POS.

**W6 · `print-pase`** → Tarea J: impresión
- **Target:** `api-server/src/lib/kitchenPrint.ts`, `print-server/server.js`
- **Change:** `PrintableItem` gana `parentName`/`isPackageChild`; los hijos se
  imprimen **indentados** bajo su padre; las selecciones salen de
  `order_item_selections` y no de parsear `custom_modifiers`.
- **Constraints:** `buildFlowSteps` (parseo de `custom_modifiers`) se **conserva**
  como fallback para órdenes viejas y para la web pública de fase 2.
  `comandaItemName` invierte "Producto - Variante" → "Variante - Producto" y
  prefija subcategoría; el ticket de cuenta **no** invierte ni prefija — eso no
  cambia. El hijo-bebida ya cae en la sección BEBIDAS por `isBeverage`: no se
  inventa una impresora de barra, no existe.
- **Acceptance:** una comanda de prueba con paquete sale con la jerarquía
  legible y la bebida en su sección.

**W6 (reusa terminal)** → Tarea K: Pase
- **Target:** `BRUMA_Dispatch/BRUMA_Dispatch/{Models,OrdersViewModel,BatchCardView}.swift`
- **Change:** `OrderItem` decodifica `parentItemId`/`packageLabel`; `BatchCardView`
  anida visualmente los hijos bajo su padre, **cada uno con su propio tap**;
  un hijo hereda el batch de su padre en `convertOrdersToBatches`.
- **Constraints:** marcar el padre **no** marca a los hijos — es justo el control
  que se busca. La tarjeta se va del board solo cuando todas sus filas están
  entregadas (eso ya funciona, no se toca). `deliveredOverride` sigue siendo el
  estado optimista.
- **Acceptance:** `xcodebuild build -scheme BRUMA_Dispatch` compila; en un
  paquete se pueden marcar entrada, plato y extra por separado.

### Ola 4 — migración de datos (al final, con todo verde)

**W1 (reusa terminal)** → Tarea L
- **Target:** `scripts/flows-v2-migrate-data.mjs`, `scripts/flows-v2-migrate-cafe.mjs`
- **Change:** (1) los 7 `product_flows` y los 2 grupos de `modifier_steps` →
  `flow_definitions`; (2) los 3 productos `Paquete *` → el grafo global de §4.2
  + soft-delete + desactivar la categoría `Paquetes`; (3) consolidación de Café
  de §4.1 con los precios exactos de la tabla.
- **Constraints:** **`--dry-run` por default**, `--apply` explícito para escribir
  (mismo patrón que `scripts/migrate-promotion-variant-ids.ts`). Nada de
  `DELETE` de productos: `deleted_at`. Imprimir un diff legible antes de aplicar.
- **Acceptance:** el dry-run imprime el plan completo; tras `--apply`, los
  precios de los 4 casos de verificación de §4.2 cuadran y ningún
  `order_items` histórico queda huérfano.

### Dependencias

```
Ola 1:  W1·A ────┐        W2·B ────┐
                 │                 │
Ola 2:           ├──→ W3·E         ├──→ W2·D ──┐
                 │                 └──→ W4·C   │
Ola 3:           │                      W4·H → W4·I
                 │                      W5·F → W5·G   (necesitan D)
                 └──────────────────────→ W6·J → W6·K (necesitan E)
Ola 4:  W1·L  (necesita todo verde)
```

---

## 9. Orden de despliegue

El backend tiene que ser **compatible hacia atrás todo el tiempo**: hay apps en
TestFlight y la web pública en Vercel que no se actualizan al mismo ritmo.

1. **Schema** (A + script). Tablas nuevas, nadie las lee todavía. Cero riesgo.
2. **Backend** (D + E). `?format=graph` es nuevo; sin el flag todo responde
   como siempre. Los clientes viejos no notan nada.
3. **Dashboard** (F + G). Ya se pueden construir grafos, todavía nadie los corre
   en producción.
4. **Migración de datos** (L) con `--dry-run` revisado a mano, luego `--apply`.
5. **Impresión y Pase** (J + K).
6. **Apps iOS** (C + H + I) a TestFlight. Hasta aquí el POS viejo sigue
   funcionando con el aplanado legacy.
7. **Fase 2**: web pública (`docs/FLOWS_FASE2_WEB_PUBLICA.md`), y recién
   entonces borrar `modifier_steps`/`modifier_options`/`product_flows`.

## 10. Precondiciones

- `xcode-select -p` tiene que apuntar a un Xcode.app completo. Si
  `xcodebuild -version` falla, correr
  `! sudo xcode-select -s /Applications/Xcode.app`.
- `DATABASE_URL` en `.env` apunta a la **Neon de producción**. Los scripts de
  migración son `--dry-run` por default justamente por eso.
- Rama: salir de `newDispatch` a una rama propia antes del primer commit.
