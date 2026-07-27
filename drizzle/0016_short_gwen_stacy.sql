CREATE TABLE "map_fixtures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" varchar(30) DEFAULT 'wall' NOT NULL,
	"label" varchar(100),
	"position_x" integer NOT NULL,
	"position_y" integer NOT NULL,
	"width_cells" integer DEFAULT 1 NOT NULL,
	"height_cells" integer DEFAULT 1 NOT NULL,
	"rotation" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
