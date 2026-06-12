ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "priority" integer DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "on_hold" boolean DEFAULT false;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "hold_started_at" timestamp;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "hold_accumulated_seconds" integer DEFAULT 0;
