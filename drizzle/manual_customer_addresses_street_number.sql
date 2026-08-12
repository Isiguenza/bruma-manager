-- Número exterior, separado del nombre de calle y del interior/depto (opcional).
ALTER TABLE customer_addresses ADD COLUMN IF NOT EXISTS street_number varchar(20);
