-- Link per-user notifications back to their originating broadcast
-- Required for: deleting a broadcast removes delivered notifications for everyone.
--
-- Prerequisite: run `supabase/communications_migration.sql` first (creates `public.broadcast_notifications`).

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS broadcast_notification_id UUID
    REFERENCES public.broadcast_notifications(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notifications_broadcast_notification_id
  ON public.notifications(broadcast_notification_id);

