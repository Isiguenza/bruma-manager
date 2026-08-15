-- Etiqueta órdenes hermanas creadas por "dividir en tickets separados", para
-- mostrarlas juntas en el POS (mismo tableId, mismo splitGroupId).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS split_group_id uuid;
CREATE INDEX IF NOT EXISTS idx_orders_split_group_id ON orders(split_group_id) WHERE split_group_id IS NOT NULL;
