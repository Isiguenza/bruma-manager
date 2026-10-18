-- Temporada activa del diseño de tarjetas de lealtad (Apple/Google Wallet).
-- NULL = diseño original (api-server/public/pass-assets/). Si no, el nombre de
-- una carpeta en api-server/public/pass-assets/seasons/<nombre>/.
-- Se lee con SQL crudo en api-server/src/lib/pass-assets.ts (no está en el
-- schema de Drizzle a propósito). Aplicar a mano en Neon; nunca db:migrate.
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS wallet_season varchar(64);
