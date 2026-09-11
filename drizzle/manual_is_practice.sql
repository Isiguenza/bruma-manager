-- Modo Práctica (Bruma POS Mobile): órdenes reales (imprimen, aparecen en el
-- Pase) pero excluidas de caja/reportes/dashboard, y una mesa oculta
-- dedicada para que esas órdenes tengan un tableId real en vez de caer en
-- el bucket de "para llevar" (que sí es visible en las pantallas reales).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_practice boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_orders_is_practice ON orders(is_practice) WHERE is_practice = true;

INSERT INTO tables (number, name, capacity, status, active)
VALUES ('PRACTICA', 'Mesa de Práctica (Modo Práctica)', 4, 'available', false)
ON CONFLICT (number) DO NOTHING;
