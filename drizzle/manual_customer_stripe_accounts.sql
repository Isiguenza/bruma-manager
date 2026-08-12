-- Mapeo 1:1 cuenta de Clerk ↔ Stripe Customer (para tarjetas guardadas vía SetupIntent).
CREATE TABLE IF NOT EXISTS customer_stripe_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id varchar(255) NOT NULL UNIQUE,
  stripe_customer_id varchar(255) NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
