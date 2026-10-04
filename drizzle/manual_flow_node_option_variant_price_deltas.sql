-- Flow v2: per-variant deltas for an option that asks the server-spliced variant node.
-- REVIEW AND APPLY MANUALLY against Neon; do NOT run npm run db:migrate.
ALTER TABLE flow_node_options
  ADD COLUMN IF NOT EXISTS variant_price_deltas jsonb DEFAULT NULL;
