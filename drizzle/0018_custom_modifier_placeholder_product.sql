-- Placeholder product used as the FK anchor for ad-hoc "Modificador Personalizado" charges
-- (custom price additions typed by the cashier for items outside the menu, applied either to
-- the whole account or merged into a specific cart item's customModifiers). It is never sold
-- directly: active = false keeps it out of the POS product grid and the public web menu.
-- Each order_items row using this product keeps its own free-text productName snapshot.
INSERT INTO "products" ("id", "name", "price", "category_id", "active", "has_variants", "menu_web_visible")
VALUES ('00000000-0000-0000-0000-000000000001', 'Modificador Personalizado', '0.00', NULL, false, false, false)
ON CONFLICT ("id") DO NOTHING;
