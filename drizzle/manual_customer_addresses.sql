-- Direcciones guardadas de clientes de BRUMA Web (ligadas por clerk_user_id,
-- no hay tabla de usuarios propia — Clerk es el store de identidad).
CREATE TABLE IF NOT EXISTS customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id varchar(255) NOT NULL,
  label varchar(20) NOT NULL DEFAULT 'other',
  address_text text NOT NULL,
  street varchar(255),
  apartment varchar(100),
  postal_code varchar(20),
  lat decimal(10,7) NOT NULL,
  lng decimal(10,7) NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_addresses_clerk_user_id_idx
  ON customer_addresses (clerk_user_id);
