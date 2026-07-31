-- Migration: Internal File Sharing
-- This creates the files table and storage bucket Configuration.

CREATE TABLE IF NOT EXISTS public.files (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  description   TEXT,
  url           TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'General',
  size          INTEGER, -- in bytes
  uploaded_by   UUID REFERENCES public.users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

-- Everyone can read files
CREATE POLICY "files_read_all" ON public.files
  FOR SELECT USING (true);

-- Only moderators and admins can manage files
CREATE POLICY "files_mod_all" ON public.files
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
      AND role IN ('moderator', 'admin')
    )
  );
