ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "menu_images" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "menu_video" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "menu_web_visible" boolean NOT NULL DEFAULT true;
