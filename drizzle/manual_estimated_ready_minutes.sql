-- Tiempo de preparación (minutos) que el POS le confirma al cliente al
-- aceptar un pedido en línea. Si está definido, la web lo muestra en vez de
-- calcular un estimado con la carga de cocina.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_ready_minutes integer;
