-- Add new columns to employee_stores for store schedule & suspension
ALTER TABLE public.employee_stores ADD COLUMN IF NOT EXISTS is_open BOOLEAN DEFAULT true;
ALTER TABLE public.employee_stores ADD COLUMN IF NOT EXISTS operating_hours JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.employee_stores ADD COLUMN IF NOT EXISTS suspend_reason TEXT;

-- Add new columns to employee_store_products for product suspension
ALTER TABLE public.employee_store_products ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT false;
ALTER TABLE public.employee_store_products ADD COLUMN IF NOT EXISTS suspend_reason TEXT;
