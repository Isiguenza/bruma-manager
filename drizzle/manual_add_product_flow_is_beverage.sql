-- Feature: rutear bebidas de flujo personalizado a la barra en Dispatch.
-- Agrega el flag "es bebida" al flujo por producto.
-- Aplicar en la BD (Neon) una sola vez. Idempotente.
ALTER TABLE product_flows
  ADD COLUMN IF NOT EXISTS is_beverage boolean NOT NULL DEFAULT false;
