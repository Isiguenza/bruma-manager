-- Migration: Add Corte fields, tipPaymentMethod, and Split Payments support
-- Run this manually or use: npm run db:push

-- Add tipPaymentMethod to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tip_payment_method payment_method;

-- Add new fields to cash_registers for corte
ALTER TABLE cash_registers ADD COLUMN IF NOT EXISTS total_tips DECIMAL(10,2) DEFAULT 0;
ALTER TABLE cash_registers ADD COLUMN IF NOT EXISTS cash_tips DECIMAL(10,2) DEFAULT 0;
ALTER TABLE cash_registers ADD COLUMN IF NOT EXISTS card_tips DECIMAL(10,2) DEFAULT 0;
ALTER TABLE cash_registers ADD COLUMN IF NOT EXISTS transfer_tips DECIMAL(10,2) DEFAULT 0;
ALTER TABLE cash_registers ADD COLUMN IF NOT EXISTS card_commission DECIMAL(10,2) DEFAULT 0;
ALTER TABLE cash_registers ADD COLUMN IF NOT EXISTS net_card_sales DECIMAL(10,2) DEFAULT 0;
ALTER TABLE cash_registers ADD COLUMN IF NOT EXISTS net_card_tips DECIMAL(10,2) DEFAULT 0;

-- Add split payment fields to order_payments
ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS tip DECIMAL(10,2) DEFAULT 0;
ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS tip_payment_method payment_method;
ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS sequence_number INTEGER DEFAULT 1;
