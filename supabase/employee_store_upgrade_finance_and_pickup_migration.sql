-- Employee store finance + pickup enhancements
-- Adds production cost tracking and pickup deadline support.

ALTER TABLE public.employee_store_products
  ADD COLUMN IF NOT EXISTS cost_dop INTEGER NOT NULL DEFAULT 0 CHECK (cost_dop >= 0);

ALTER TABLE public.employee_store_orders
  ADD COLUMN IF NOT EXISTS pickup_deadline TIMESTAMPTZ;

