import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { neon } from "@neondatabase/serverless";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");

if (resolve(process.cwd()) !== repositoryRoot) {
  throw new Error("Run node scripts/flows-v2-schema.mjs from the repository root.");
}

const envContents = readFileSync(resolve(repositoryRoot, ".env"), "utf8");
const databaseUrlMatch = envContents.match(/^DATABASE_URL=(.+)$/m);

if (!databaseUrlMatch) {
  throw new Error("DATABASE_URL is missing from .env.");
}

const databaseUrl = databaseUrlMatch[1].trim().replace(/^['"]|['"]$/g, "");
const sql = neon(databaseUrl);

const statements = [
  `DO $$ BEGIN
    CREATE TYPE flow_scope_kind AS ENUM ('global', 'category', 'subcategory', 'product');
  EXCEPTION WHEN duplicate_object THEN null;
  END $$`,
  `DO $$ BEGIN
    CREATE TYPE flow_target_mode AS ENUM ('include', 'exclude');
  EXCEPTION WHEN duplicate_object THEN null;
  END $$`,
  `DO $$ BEGIN
    CREATE TYPE flow_select_mode AS ENUM ('single', 'multi');
  EXCEPTION WHEN duplicate_object THEN null;
  END $$`,
  `DO $$ BEGIN
    CREATE TYPE flow_option_source AS ENUM ('manual', 'product', 'category');
  EXCEPTION WHEN duplicate_object THEN null;
  END $$`,
  `DO $$ BEGIN
    CREATE TYPE flow_price_mode AS ENUM ('free', 'product_price', 'delta');
  EXCEPTION WHEN duplicate_object THEN null;
  END $$`,
  `CREATE TABLE IF NOT EXISTS flow_definitions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(255) NOT NULL,
    description text,
    scope_kind flow_scope_kind NOT NULL,
    priority integer NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS flow_targets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_id uuid NOT NULL REFERENCES flow_definitions(id) ON DELETE CASCADE,
    mode flow_target_mode NOT NULL,
    category_id uuid REFERENCES categories(id) ON DELETE CASCADE,
    subcategory_id uuid REFERENCES subcategories(id) ON DELETE CASCADE,
    product_id uuid REFERENCES products(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS flow_nodes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_id uuid NOT NULL REFERENCES flow_definitions(id) ON DELETE CASCADE,
    title varchar(255) NOT NULL,
    subtitle text,
    select_mode flow_select_mode NOT NULL DEFAULT 'single',
    min_selections integer NOT NULL DEFAULT 0,
    max_selections integer,
    include_none_option boolean NOT NULL DEFAULT true,
    none_label varchar(255),
    is_entry boolean NOT NULL DEFAULT false,
    pos_x integer NOT NULL DEFAULT 0,
    pos_y integer NOT NULL DEFAULT 0,
    sort_order integer NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true,
    created_at timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS flow_node_options (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id uuid NOT NULL REFERENCES flow_nodes(id) ON DELETE CASCADE,
    source flow_option_source NOT NULL,
    label varchar(255),
    ref_product_id uuid REFERENCES products(id) ON DELETE SET NULL,
    ref_category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
    ref_variant_name varchar(255),
    allow_variant_choice boolean NOT NULL DEFAULT false,
    price_mode flow_price_mode NOT NULL DEFAULT 'delta',
    price_delta decimal(10,2) NOT NULL DEFAULT 0,
    emits_child_item boolean NOT NULL DEFAULT false,
    sort_order integer NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true,
    created_at timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS flow_option_price_overrides (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    option_id uuid NOT NULL REFERENCES flow_node_options(id) ON DELETE CASCADE,
    category_id uuid REFERENCES categories(id) ON DELETE CASCADE,
    subcategory_id uuid REFERENCES subcategories(id) ON DELETE CASCADE,
    product_id uuid REFERENCES products(id) ON DELETE CASCADE,
    price_delta decimal(10,2) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS flow_edges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_id uuid NOT NULL REFERENCES flow_definitions(id) ON DELETE CASCADE,
    from_node_id uuid NOT NULL REFERENCES flow_nodes(id) ON DELETE CASCADE,
    from_option_id uuid REFERENCES flow_node_options(id) ON DELETE CASCADE,
    to_node_id uuid REFERENCES flow_nodes(id) ON DELETE CASCADE,
    condition jsonb,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamp NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE order_items
    ADD COLUMN IF NOT EXISTS parent_item_id uuid REFERENCES order_items(id) ON DELETE CASCADE`,
  `ALTER TABLE order_items
    ADD COLUMN IF NOT EXISTS package_label varchar(255)`,
  `ALTER TABLE products
    ADD COLUMN IF NOT EXISTS flow_tags jsonb NOT NULL DEFAULT '[]'::jsonb`,
  `CREATE TABLE IF NOT EXISTS order_item_selections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_item_id uuid NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    flow_id uuid REFERENCES flow_definitions(id) ON DELETE SET NULL,
    node_id uuid REFERENCES flow_nodes(id) ON DELETE SET NULL,
    option_id uuid REFERENCES flow_node_options(id) ON DELETE SET NULL,
    node_title varchar(255) NOT NULL,
    option_label varchar(255) NOT NULL,
    price_delta decimal(10,2) NOT NULL DEFAULT 0,
    ref_product_id uuid REFERENCES products(id) ON DELETE SET NULL,
    ref_variant_name varchar(255),
    ref_list_price decimal(10,2),
    child_item_id uuid REFERENCES order_items(id) ON DELETE SET NULL,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamp NOT NULL DEFAULT now()
  )`,
];

for (const statement of statements) {
  await sql.query(statement);
}

const verification = await sql.query(`
  SELECT 'table' AS kind, table_name AS name, NULL::text AS data_type
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN (
      'flow_definitions', 'flow_targets', 'flow_nodes', 'flow_node_options',
      'flow_option_price_overrides', 'flow_edges', 'order_item_selections'
    )
  UNION ALL
  SELECT 'column' AS kind, table_name || '.' || column_name AS name, data_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND (table_name, column_name) IN (
      ('order_items', 'parent_item_id'),
      ('order_items', 'package_label'),
      ('products', 'flow_tags')
    )
  ORDER BY kind, name
`);

console.log(`Applied ${statements.length} idempotent Flows v2 DDL statements.`);
console.table(verification);
