-- Script para eliminar el step duplicado de "Bebida" viejo del Paquete Aguachile
-- Step viejo: a52a887b-0759-4438-acab-407c387703d1 (sortOrder: 1)
-- Step nuevo: step-1778298452707 (sortOrder: 3)

-- Ver el flujo actual
SELECT 
  pf.product_id,
  p.name as product_name,
  jsonb_array_length(pf.steps::jsonb) as steps_count,
  jsonb_pretty(pf.steps::jsonb) as steps_json
FROM product_flows pf
JOIN products p ON p.id = pf.product_id
WHERE pf.product_id = 'b3f71dde-affb-43fb-9119-bb672fb67415';

-- Actualizar el flujo eliminando el step viejo (índice 1)
-- Esto mantiene: Entrada (0), Plato Fuerte (2 -> 1), Bebidas (3 -> 2)
UPDATE product_flows
SET steps = (
  SELECT jsonb_agg(
    CASE 
      WHEN (elem->>'sortOrder')::int = 0 THEN elem
      WHEN (elem->>'sortOrder')::int = 2 THEN jsonb_set(elem, '{sortOrder}', '1')
      WHEN (elem->>'sortOrder')::int = 3 THEN jsonb_set(elem, '{sortOrder}', '2')
      ELSE NULL
    END
  )
  FROM jsonb_array_elements(steps::jsonb) elem
  WHERE (elem->>'sortOrder')::int != 1
)::text
WHERE product_id = 'b3f71dde-affb-43fb-9119-bb672fb67415';

-- Verificar el resultado
SELECT 
  pf.product_id,
  p.name as product_name,
  jsonb_array_length(pf.steps::jsonb) as steps_count,
  jsonb_pretty(pf.steps::jsonb) as steps_json
FROM product_flows pf
JOIN products p ON p.id = pf.product_id
WHERE pf.product_id = 'b3f71dde-affb-43fb-9119-bb672fb67415';
