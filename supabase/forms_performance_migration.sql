-- ============================================================
-- Forms performance helpers (optional) — run in Supabase SQL Editor
-- Adds indexes and an RPC to fetch response counts in one query.
-- Safe to run multiple times.
-- ============================================================

-- Indexes for common filters/sorts
CREATE INDEX IF NOT EXISTS idx_forms_status_created_at ON public.forms (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_forms_updated_at ON public.forms (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_forms_created_by ON public.forms (created_by);

-- Responses lookup/indexes (moderator views + exports)
CREATE INDEX IF NOT EXISTS idx_form_responses_form_id_submitted_at ON public.form_responses (form_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_form_responses_user_id ON public.form_responses (user_id);

-- ============================================================
-- RPC: Aggregate response counts for a list of forms (one round-trip)
-- Used by `GET /api/forms` for moderators when available.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_form_response_counts(form_ids uuid[])
RETURNS TABLE(form_id uuid, response_count bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT fr.form_id, COUNT(*)::bigint AS response_count
  FROM public.form_responses fr
  WHERE fr.form_id = ANY(form_ids)
  GROUP BY fr.form_id;
$$;

