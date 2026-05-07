-- ============================================================
-- Employee Store Products - Moderation System
-- Adds product-level suspension and review queue
-- ============================================================

DO $$ BEGIN
  CREATE TYPE employee_store_product_status AS ENUM ('active', 'suspended', 'pending_review');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.employee_store_products 
  ADD COLUMN IF NOT EXISTS status employee_store_product_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS moderation_note TEXT;

-- Update RLS policies to reflect new status rules
-- Drop old select policy to recreate it
DROP POLICY IF EXISTS "esp_select" ON public.employee_store_products;

CREATE POLICY "esp_select" ON public.employee_store_products FOR SELECT
  USING (
    (is_active AND status = 'active')
    OR EXISTS (SELECT 1 FROM public.employee_stores s WHERE s.id = store_id AND s.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('moderator', 'admin'))
  );
