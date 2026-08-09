-- ============================================================================
-- Pedidos en línea (web + Stripe). Idempotente, seguro de re-correr en Neon.
-- Nota: los ALTER TYPE ... ADD VALUE deben correrse FUERA de una transacción.
-- ============================================================================

-- 1) Nuevo método de pago 'online'
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'online';

-- 2) Columnas de pedido en línea en orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone            varchar(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_type             varchar(20);   -- 'pickup' | 'delivery'
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address          text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_lat              numeric(10,7);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_lng              numeric(10,7);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee              numeric(10,2) DEFAULT '0';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_payment_intent_id  varchar(255);

-- 3) Ajustes del restaurante (una sola fila)
CREATE TABLE IF NOT EXISTS restaurant_settings (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  online_ordering_enabled  boolean NOT NULL DEFAULT false,
  service_hours            text,
  restaurant_lat           numeric(10,7),
  restaurant_lng           numeric(10,7),
  delivery_tiers           text,
  updated_at               timestamp NOT NULL DEFAULT now()
);

-- Fila inicial con tramos de envío por defecto (≤600m=$25, 600–1200m=$40).
INSERT INTO restaurant_settings (online_ordering_enabled, delivery_tiers)
SELECT false, '[{"maxMeters":600,"fee":25},{"maxMeters":1200,"fee":40}]'
WHERE NOT EXISTS (SELECT 1 FROM restaurant_settings);
