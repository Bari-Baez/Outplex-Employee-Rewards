-- ============================================================
-- Google Forms Import — run in Supabase SQL Editor
-- Adds: google_form_id column, form-images storage bucket,
--       and corrected RLS policies that include moderator_a1
-- ============================================================

-- 1. Add google_form_id column for deduplication
ALTER TABLE public.forms ADD COLUMN IF NOT EXISTS google_form_id TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS idx_forms_google_form_id ON public.forms (google_form_id);

-- ============================================================
-- 2. Fix forms table RLS — include moderator_a1
-- ============================================================
DROP POLICY IF EXISTS "forms_mod_all" ON public.forms;

CREATE POLICY "forms_mod_all" ON public.forms
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND role IN ('moderator', 'moderator_a1', 'admin')
    )
  );

-- Ensure employees can still read published forms
DROP POLICY IF EXISTS "forms_employee_read_published" ON public.forms;

CREATE POLICY "forms_employee_read_published" ON public.forms
  FOR SELECT USING (status = 'published');

-- ============================================================
-- 3. Fix form_responses RLS — include moderator_a1
-- ============================================================
DROP POLICY IF EXISTS "responses_mod_read" ON public.form_responses;

CREATE POLICY "responses_mod_read" ON public.form_responses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND role IN ('moderator', 'moderator_a1', 'admin')
    )
  );

-- ============================================================
-- 4. Storage bucket for form images (public read)
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'form-images',
  'form-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Allow moderator_a1 and admin to upload images
CREATE POLICY "form_images_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'form-images'
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND role IN ('moderator_a1', 'admin')
    )
  );

-- Public read for all form images
CREATE POLICY "form_images_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'form-images');
