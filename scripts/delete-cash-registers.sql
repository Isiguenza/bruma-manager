-- ============================================================
-- BORRAR CAJAS Y TODAS SUS ORDENES ASOCIADAS
-- ============================================================
-- IMPORTANTE: Ejecutar todo este bloque como una sola transacción.
-- IDs a borrar: 3f61131d-5b16-42a1-aca4-bbc6f29c84e9, 26e3b401-4867-47f3-bc79-6ebf15b1be22

BEGIN;

-- 1) Identificar órdenes asociadas a esas cajas
-- (Solo informativo; no se borran todavía)
-- SELECT id, order_number, cash_register_id FROM orders WHERE cash_register_id IN (
--   '3f61131d-5b16-42a1-aca4-bbc6f29c84e9',
--   '26e3b401-4867-47f3-bc79-6ebf15b1be22'
-- );

-- 2) Borrar historial de ventas (sales_history) asociado a esas cajas
DELETE FROM sales_history
WHERE cash_register_id IN (
  '3f61131d-5b16-42a1-aca4-bbc6f29c84e9',
  '26e3b401-4867-47f3-bc79-6ebf15b1be22'
);

-- 3) Borrar transacciones de lealtad (loyalty_transactions) de esas órdenes
DELETE FROM loyalty_transactions
WHERE order_id IN (
  SELECT id FROM orders
  WHERE cash_register_id IN (
    '3f61131d-5b16-42a1-aca4-bbc6f29c84e9',
    '26e3b401-4867-47f3-bc79-6ebf15b1be22'
  )
);

-- 4) Borrar órdenes de delivery (delivery_orders) vinculadas a esas órdenes
DELETE FROM delivery_orders
WHERE order_id IN (
  SELECT id FROM orders
  WHERE cash_register_id IN (
    '3f61131d-5b16-42a1-aca4-bbc6f29c84e9',
    '26e3b401-4867-47f3-bc79-6ebf15b1be22'
  )
);

-- 5) Borrar transacciones de caja (cash_register_transactions) vinculadas a esas órdenes
-- (Las que solo tengan registerId se borrarán en cascade al borrar la caja al final)
DELETE FROM cash_register_transactions
WHERE order_id IN (
  SELECT id FROM orders
  WHERE cash_register_id IN (
    '3f61131d-5b16-42a1-aca4-bbc6f29c84e9',
    '26e3b401-4867-47f3-bc79-6ebf15b1be22'
  )
);

-- 6) Borrar las órdenes. 
--    orderItems y orderPayments se borran en cascade automáticamente
DELETE FROM orders
WHERE cash_register_id IN (
  '3f61131d-5b16-42a1-aca4-bbc6f29c84e9',
  '26e3b401-4867-47f3-bc79-6ebf15b1be22'
);

-- 7) Borrar transacciones restantes de esas cajas (las que no tenían order_id)
DELETE FROM cash_register_transactions
WHERE register_id IN (
  '3f61131d-5b16-42a1-aca4-bbc6f29c84e9',
  '26e3b401-4867-47f3-bc79-6ebf15b1be22'
);

-- 8) Finalmente borrar las cajas
DELETE FROM cash_registers
WHERE id IN (
  '3f61131d-5b16-42a1-aca4-bbc6f29c84e9',
  '26e3b401-4867-47f3-bc79-6ebf15b1be22'
);

COMMIT;
