-- Communications module: company-wide notifications and announcements

CREATE TABLE IF NOT EXISTS public.broadcast_notifications (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title         TEXT NOT NULL,
  message       TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('availability', 'stock', 'site_visit', 'general')),
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'published')),
  publish_at    TIMESTAMPTZ,
  sent_at       TIMESTAMPTZ,
  created_by    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_broadcast_notifications_publish_at
  ON public.broadcast_notifications (publish_at DESC);

CREATE INDEX IF NOT EXISTS idx_broadcast_notifications_status
  ON public.broadcast_notifications (status);

ALTER TABLE public.broadcast_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "broadcast_notifications_select_all" ON public.broadcast_notifications;
CREATE POLICY "broadcast_notifications_select_all"
  ON public.broadcast_notifications
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "broadcast_notifications_mod_all" ON public.broadcast_notifications;
CREATE POLICY "broadcast_notifications_mod_all"
  ON public.broadcast_notifications
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.users
      WHERE id = auth.uid()
      AND role IN ('moderator', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users
      WHERE id = auth.uid()
      AND role IN ('moderator', 'admin')
    )
  );

CREATE TABLE IF NOT EXISTS public.company_announcements (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title            TEXT NOT NULL,
  excerpt          TEXT,
  cover_image_url  TEXT,
  content          JSONB NOT NULL DEFAULT '[]'::jsonb,
  duration_days    INTEGER NOT NULL DEFAULT 7 CHECK (duration_days IN (1, 3, 5, 7, 15, 30, 60)),
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'published')),
  publish_at       TIMESTAMPTZ,
  expires_at       TIMESTAMPTZ,
  created_by       UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by       UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_announcements_publish_at
  ON public.company_announcements (publish_at DESC);

CREATE INDEX IF NOT EXISTS idx_company_announcements_status
  ON public.company_announcements (status);

CREATE INDEX IF NOT EXISTS idx_company_announcements_expires_at
  ON public.company_announcements (expires_at);

ALTER TABLE public.company_announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_announcements_select_all" ON public.company_announcements;
CREATE POLICY "company_announcements_select_all"
  ON public.company_announcements
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "company_announcements_mod_all" ON public.company_announcements;
CREATE POLICY "company_announcements_mod_all"
  ON public.company_announcements
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.users
      WHERE id = auth.uid()
      AND role IN ('moderator', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users
      WHERE id = auth.uid()
      AND role IN ('moderator', 'admin')
    )
  );
