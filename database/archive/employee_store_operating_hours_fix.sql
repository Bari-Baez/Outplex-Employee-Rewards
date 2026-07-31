-- ============================================================
-- Employee Store — Operating Hours & Status Fix
-- Adds missing columns and 'scheduled' status value.
-- ============================================================

-- 1. Add missing operation columns to the employee_stores table
ALTER TABLE public.employee_stores 
  ADD COLUMN IF NOT EXISTS is_open BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS operating_hours JSONB;

-- 2. Safely add 'scheduled' status to the store status enum
-- This ensures the new automatic scheduling logic works correctly in the DB
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t 
    JOIN pg_enum e ON t.oid = e.enumtypid 
    WHERE t.typname = 'employee_store_status' AND e.enumlabel = 'scheduled'
  ) THEN
    ALTER TYPE employee_store_status ADD VALUE 'scheduled';
  END IF;
END $$;

COMMENT ON COLUMN public.employee_stores.is_open IS 'Overrides operating_hours to force close a store manually.';
COMMENT ON COLUMN public.employee_stores.operating_hours IS 'JSON configuration for weekly opening/closing times.';
