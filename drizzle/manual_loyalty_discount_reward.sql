-- Premio de lealtad como % de descuento (además de "platillo gratis").
-- restaurant_settings.loyalty_discount_pct: el % configurable desde /loyalty
--   (se lee con SQL crudo, fuera del schema de Drizzle, igual que wallet_season).
-- orders.loyalty_discount_pct: el % canjeado en esa cuenta (null = sin canje),
--   para que el descuento persista al salir y volver a la mesa.
-- Correr ANTES de desplegar api-server/dashboard (Drizzle lee todas las columnas de orders).
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS loyalty_discount_pct numeric(5,2) NOT NULL DEFAULT 6;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS loyalty_discount_pct numeric(5,2);
