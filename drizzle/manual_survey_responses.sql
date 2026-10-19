-- Encuesta de satisfacción pública (cocinabruma.com.mx/encuesta).
-- Aplicar a mano en Neon; nunca `npm run db:migrate` (ver CLAUDE.md).
CREATE TABLE IF NOT EXISTS survey_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  order_number integer,
  overall_rating integer NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
  best_aspects jsonb NOT NULL DEFAULT '[]'::jsonb,
  improvement text,
  staff_rating integer CHECK (staff_rating BETWEEN 1 AND 5),
  order_as_expected varchar(16) CHECK (order_as_expected IN ('si', 'parcialmente', 'no')),
  nps integer CHECK (nps BETWEEN 0 AND 10),
  would_return varchar(16) CHECK (would_return IN ('si', 'no', 'tal_vez')),
  dish text,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS survey_responses_created_at_idx ON survey_responses (created_at DESC);
CREATE INDEX IF NOT EXISTS survey_responses_order_id_idx ON survey_responses (order_id);
