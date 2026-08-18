-- Estados nuevos para captura manual de Stripe (autorizar ahora, cobrar
-- después al marcar "ready"). IMPORTANTE: los ALTER TYPE ... ADD VALUE deben
-- correrse FUERA de una transacción (limitación de Postgres) — pégalos uno
-- por uno en el SQL editor de Neon si tu cliente los envuelve en una
-- transacción automáticamente.
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'authorized';
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'canceled';
