ALTER TYPE "public"."order_status" ADD VALUE 'completed' BEFORE 'cancelled';--> statement-breakpoint
CREATE TABLE "product_flows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"use_default_flow" boolean DEFAULT true NOT NULL,
	"steps" text DEFAULT '[]' NOT NULL,
	"nodes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "product_flows_product_id_unique" UNIQUE("product_id")
);
--> statement-breakpoint
CREATE TABLE "quick_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" varchar(100) NOT NULL,
	"product_ids" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "table_merges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"primary_table_id" uuid NOT NULL,
	"merged_table_id" uuid NOT NULL,
	"order_id" uuid,
	"reservation_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_promotions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message" text NOT NULL,
	"target_type" varchar(20) DEFAULT 'all' NOT NULL,
	"target_card_ids" text,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reservations" DROP CONSTRAINT "reservations_table_id_tables_id_fk";
--> statement-breakpoint
ALTER TABLE "loyalty_cards" ALTER COLUMN "customer_email" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ALTER COLUMN "table_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_registers" ADD COLUMN "total_tips" numeric(10, 2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "cash_registers" ADD COLUMN "cash_tips" numeric(10, 2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "cash_registers" ADD COLUMN "card_tips" numeric(10, 2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "cash_registers" ADD COLUMN "transfer_tips" numeric(10, 2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "cash_registers" ADD COLUMN "card_commission" numeric(10, 2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "cash_registers" ADD COLUMN "net_card_sales" numeric(10, 2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "cash_registers" ADD COLUMN "net_card_tips" numeric(10, 2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "loyalty_cards" ADD COLUMN "customer_last_name" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "loyalty_cards" ADD COLUMN "birth_date" date;--> statement-breakpoint
ALTER TABLE "loyalty_cards" ADD COLUMN "latest_message" text;--> statement-breakpoint
ALTER TABLE "order_payments" ADD COLUMN "tip" numeric(10, 2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "order_payments" ADD COLUMN "tip_payment_method" "payment_method";--> statement-breakpoint
ALTER TABLE "order_payments" ADD COLUMN "sequence_number" integer DEFAULT 1;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "guest_count" integer DEFAULT 1;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tip_payment_method" "payment_method";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "priority" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "on_hold" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "hold_started_at" timestamp;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "hold_accumulated_seconds" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "menu_images" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "menu_video" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "menu_web_visible" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "combo_rules" text;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "customer_email" varchar(255);--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "occasion" varchar(100);--> statement-breakpoint
ALTER TABLE "tables" ADD COLUMN "width_cells" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "tables" ADD COLUMN "height_cells" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "product_flows" ADD CONSTRAINT "product_flows_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_merges" ADD CONSTRAINT "table_merges_primary_table_id_tables_id_fk" FOREIGN KEY ("primary_table_id") REFERENCES "public"."tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_merges" ADD CONSTRAINT "table_merges_merged_table_id_tables_id_fk" FOREIGN KEY ("merged_table_id") REFERENCES "public"."tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_merges" ADD CONSTRAINT "table_merges_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_merges" ADD CONSTRAINT "table_merges_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_promotions" ADD CONSTRAINT "wallet_promotions_created_by_user_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_table_id_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE set null ON UPDATE no action;