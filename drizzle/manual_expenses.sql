-- Compras y gastos (Hermes vía WhatsApp + captura manual). Aplicar a mano en
-- Neon; NO con `npm run db:migrate` (ver CLAUDE.md).
CREATE TABLE IF NOT EXISTS "expenses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "concept" text NOT NULL,
  "amount" numeric(12, 2) NOT NULL,
  "currency" varchar(3) DEFAULT 'MXN' NOT NULL,
  "category" varchar(30) DEFAULT 'otros' NOT NULL,
  "source" varchar(20) DEFAULT 'whatsapp' NOT NULL,
  "source_message_id" varchar(255),
  "chat_id" varchar(255),
  "sender_name" varchar(255),
  "notes" text,
  "expense_date" timestamp DEFAULT now() NOT NULL,
  "deleted_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "expenses_source_message_id_unique" UNIQUE("source_message_id")
);
CREATE INDEX IF NOT EXISTS "expenses_expense_date_idx" ON "expenses" ("expense_date") WHERE "deleted_at" IS NULL;
