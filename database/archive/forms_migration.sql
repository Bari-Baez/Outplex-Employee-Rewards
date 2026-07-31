-- ============================================================
-- Forms & Form Responses tables — run in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.forms (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  fields       JSONB NOT NULL DEFAULT '[]',
  settings     JSONB NOT NULL DEFAULT '{"submitButtonLabel":"Enviar respuesta","successMessage":"¡Gracias! Tu respuesta fue registrada.","allowMultipleSubmissions":false}',
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed')),
  created_by   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  published_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.forms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "forms_mod_all" ON public.forms
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('moderator', 'admin'))
  );

CREATE POLICY "forms_employee_read_published" ON public.forms
  FOR SELECT USING (status = 'published');

-- ============================================================

CREATE TABLE IF NOT EXISTS public.form_responses (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  form_id      UUID NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  answers      JSONB NOT NULL DEFAULT '{}',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(form_id, user_id)
);

ALTER TABLE public.form_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "responses_own_all" ON public.form_responses
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "responses_mod_read" ON public.form_responses
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('moderator', 'admin'))
  );

-- Auto-update updated_at on forms
CREATE OR REPLACE FUNCTION update_forms_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS forms_updated_at ON public.forms;
CREATE TRIGGER forms_updated_at
  BEFORE UPDATE ON public.forms
  FOR EACH ROW EXECUTE FUNCTION update_forms_updated_at();
