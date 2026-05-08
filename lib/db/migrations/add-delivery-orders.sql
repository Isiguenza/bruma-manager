-- Add delivery platform enum
CREATE TYPE delivery_platform AS ENUM ('uber_eats', 'rappi', 'didi_food');

-- Add delivery order status enum
CREATE TYPE delivery_order_status AS ENUM ('pending', 'accepted', 'preparing', 'ready', 'completed', 'cancelled');

-- Create delivery_orders table
CREATE TABLE delivery_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform delivery_platform NOT NULL,
  external_id VARCHAR(255) NOT NULL UNIQUE,
  status delivery_order_status NOT NULL DEFAULT 'pending',
  
  -- Customer info
  customer_name VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(50),
  delivery_address TEXT,
  delivery_instructions TEXT,
  
  -- Order details
  subtotal DECIMAL(10, 2) NOT NULL,
  delivery_fee DECIMAL(10, 2) DEFAULT 0,
  platform_fee DECIMAL(10, 2) DEFAULT 0,
  total DECIMAL(10, 2) NOT NULL,
  
  -- Timing
  estimated_pickup_time TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  accepted_at TIMESTAMP,
  ready_at TIMESTAMP,
  completed_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  
  -- Related order (when accepted and created in system)
  order_id UUID REFERENCES orders(id),
  
  -- Raw data from platform
  raw_data JSONB,
  
  -- Metadata
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX idx_delivery_orders_platform ON delivery_orders(platform);
CREATE INDEX idx_delivery_orders_status ON delivery_orders(status);
CREATE INDEX idx_delivery_orders_external_id ON delivery_orders(external_id);
CREATE INDEX idx_delivery_orders_created_at ON delivery_orders(created_at DESC);

-- Add source column to orders table to track origin
ALTER TABLE orders ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'pos';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_order_id UUID REFERENCES delivery_orders(id);

-- Create index
CREATE INDEX idx_orders_source ON orders(source);
CREATE INDEX idx_orders_delivery_order_id ON orders(delivery_order_id);
