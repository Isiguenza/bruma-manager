-- Flujos v2: ramas configurables. Aplicado a mano en Neon (nunca `npm run db:migrate`).
-- Todo es aditivo y con default neutro: el composer viejo ignora estas columnas.

-- Subflujo propio de un flujo general: nunca aplica por targets, solo por referencia.
ALTER TABLE flow_definitions ADD COLUMN IF NOT EXISTS parent_flow_id uuid REFERENCES flow_definitions(id) ON DELETE CASCADE;

-- Excluir una variante puntual de un producto ("Pieza" no lleva paquete). Solo con product_id.
ALTER TABLE flow_targets ADD COLUMN IF NOT EXISTS variant_name varchar(255);

-- Lista de OCULTOS (un producto nuevo de la categoría aparece solo):
-- ["<productId>", "<productId>::<variante>"].
ALTER TABLE flow_node_options ADD COLUMN IF NOT EXISTS hidden_refs jsonb;
-- 'inherit' = el flujo que le toque al producto hijo (comportamiento previo),
-- 'none' = sin subflujo, 'custom' = child_flow_id.
ALTER TABLE flow_node_options ADD COLUMN IF NOT EXISTS child_flow_mode varchar(16) NOT NULL DEFAULT 'inherit';
ALTER TABLE flow_node_options ADD COLUMN IF NOT EXISTS child_flow_id uuid REFERENCES flow_definitions(id) ON DELETE SET NULL;
-- Productos de una opción de categoría que NO abren subflujo: ["<productId>"].
ALTER TABLE flow_node_options ADD COLUMN IF NOT EXISTS subflow_hidden_refs jsonb;
