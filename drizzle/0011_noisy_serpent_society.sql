CREATE TYPE "public"."delivery_order_status" AS ENUM('pending', 'accepted', 'preparing', 'ready', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."delivery_platform" AS ENUM('uber_eats', 'rappi', 'didi_food');--> statement-breakpoint
CREATE TABLE "delivery_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" "delivery_platform" NOT NULL,
	"external_id" varchar(255) NOT NULL,
	"status" "delivery_order_status" DEFAULT 'pending' NOT NULL,
	"customer_name" varchar(255) NOT NULL,
	"customer_phone" varchar(50),
	"delivery_address" text,
	"delivery_instructions" text,
	"subtotal" numeric(10, 2) NOT NULL,
	"delivery_fee" numeric(10, 2) DEFAULT '0',
	"platform_fee" numeric(10, 2) DEFAULT '0',
	"total" numeric(10, 2) NOT NULL,
	"estimated_pickup_time" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"accepted_at" timestamp,
	"ready_at" timestamp,
	"completed_at" timestamp,
	"cancelled_at" timestamp,
	"order_id" uuid,
	"raw_data" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_orders_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "source" varchar(50) DEFAULT 'pos';--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_order_id" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "delivery_orders" ADD CONSTRAINT "delivery_orders_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;