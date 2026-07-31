-- Notifications + Employee announcements enhancements
-- - Adds sender_id to notifications (for muting by sender)
-- - Adds notification_mutes table (per-user muted senders)
-- - Adds employee_announcements table (store-owner announcements)

-- 1) Notifications: track sender
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS sender_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_sender_id
  ON public.notifications(sender_id);

-- 2) Notification mutes: users can mute employee senders
CREATE TABLE IF NOT EXISTS public.notification_mutes (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  sender_id  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, sender_id)
);

ALTER TABLE public.notification_mutes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_mutes_own_select" ON public.notification_mutes;
CREATE POLICY "notification_mutes_own_select"
  ON public.notification_mutes
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notification_mutes_own_insert" ON public.notification_mutes;
CREATE POLICY "notification_mutes_own_insert"
  ON public.notification_mutes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notification_mutes_own_delete" ON public.notification_mutes;
CREATE POLICY "notification_mutes_own_delete"
  ON public.notification_mutes
  FOR DELETE
  USING (auth.uid() = user_id);

-- 3) Employee announcements (store owners): same schema as company_announcements
CREATE TABLE IF NOT EXISTS public.employee_announcements (
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

CREATE INDEX IF NOT EXISTS idx_employee_announcements_publish_at
  ON public.employee_announcements (publish_at DESC);

CREATE INDEX IF NOT EXISTS idx_employee_announcements_status
  ON public.employee_announcements (status);

CREATE INDEX IF NOT EXISTS idx_employee_announcements_expires_at
  ON public.employee_announcements (expires_at);

ALTER TABLE public.employee_announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employee_announcements_select_all" ON public.employee_announcements;
CREATE POLICY "employee_announcements_select_all"
  ON public.employee_announcements
  FOR SELECT
  USING (true);

-- Store owners can manage their own employee announcements
DROP POLICY IF EXISTS "employee_announcements_owner_all" ON public.employee_announcements;
CREATE POLICY "employee_announcements_owner_all"
  ON public.employee_announcements
  FOR ALL
  USING (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1
      FROM public.employee_stores
      WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1
      FROM public.employee_stores
      WHERE owner_id = auth.uid()
    )
  );

-- Moderators/admins can manage any employee announcements
DROP POLICY IF EXISTS "employee_announcements_mod_all" ON public.employee_announcements;
CREATE POLICY "employee_announcements_mod_all"
  ON public.employee_announcements
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.users
      WHERE id = auth.uid()
      AND role IN ('moderator', 'moderator_a1', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users
      WHERE id = auth.uid()
      AND role IN ('moderator', 'moderator_a1', 'admin')
    )
  );

