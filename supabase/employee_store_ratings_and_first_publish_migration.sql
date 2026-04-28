-- ============================================================
-- Employee Store — Ratings + First Publish Timestamp
-- Safe to run multiple times (IF NOT EXISTS guards)
-- ============================================================

-- 1) Track when a store first publishes a product (used for "Lo Nuevo" + visibility)
ALTER TABLE public.employee_stores
  ADD COLUMN IF NOT EXISTS first_product_published_at TIMESTAMPTZ;

COMMENT ON COLUMN public.employee_stores.first_product_published_at IS
  'Timestamp of the first time the store published/added a product. Used for "Lo Nuevo" ordering.';

CREATE INDEX IF NOT EXISTS idx_employee_stores_first_product_published_at
  ON public.employee_stores(first_product_published_at);

-- 2) Product reviews (1–5 stars) for employee store products
CREATE TABLE IF NOT EXISTS public.employee_store_product_reviews (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES public.employee_store_products(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  rating     SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, user_id)
);

ALTER TABLE public.employee_store_product_reviews ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read reviews
DROP POLICY IF EXISTS "espr_select_all" ON public.employee_store_product_reviews;
CREATE POLICY "espr_select_all" ON public.employee_store_product_reviews FOR SELECT
  USING (true);

-- Users can create/update/delete their own review
DROP POLICY IF EXISTS "espr_own_insert" ON public.employee_store_product_reviews;
CREATE POLICY "espr_own_insert" ON public.employee_store_product_reviews FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "espr_own_update" ON public.employee_store_product_reviews;
CREATE POLICY "espr_own_update" ON public.employee_store_product_reviews FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "espr_own_delete" ON public.employee_store_product_reviews;
CREATE POLICY "espr_own_delete" ON public.employee_store_product_reviews FOR DELETE
  USING (auth.uid() = user_id);
