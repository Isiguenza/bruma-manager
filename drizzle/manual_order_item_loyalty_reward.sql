-- Premio de lealtad canjeado sobre un platillo de la orden. Va junto con
-- is_guest = true (sale a $0); esta columna solo distingue "premio" de
-- "cortesía" para que el POS lo pinte dorado con su chip "Premio".
-- Aplicar a mano en Neon (nunca `npm run db:migrate`).
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS loyalty_reward boolean NOT NULL DEFAULT false;

-- Platillos que se pueden canjear como premio de lealtad (switch "Premio de
-- lealtad" en el detalle del platillo del dashboard). El POS solo deja canjear
-- estos y el endpoint de canje rechaza los demás.
ALTER TABLE products ADD COLUMN IF NOT EXISTS loyalty_eligible boolean NOT NULL DEFAULT false;
