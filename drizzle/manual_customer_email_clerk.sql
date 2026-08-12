-- Correo del cliente (pedidos en línea) + cuenta de Clerk ligada (BRUMA Web).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email varchar(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS clerk_user_id  varchar(255);
