-- ============================================================
-- Raffles + Store performance helpers (optional)
-- Run in Supabase SQL Editor. Safe to re-run.
-- ============================================================

-- --------------------
-- Indexes: Raffles
-- --------------------
CREATE INDEX IF NOT EXISTS idx_raffles_status_created_at ON public.raffles (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_raffles_draw_date ON public.raffles (draw_date);
CREATE INDEX IF NOT EXISTS idx_raffles_winner_id ON public.raffles (winner_id);

CREATE INDEX IF NOT EXISTS idx_raffle_entries_raffle_id ON public.raffle_entries (raffle_id);
CREATE INDEX IF NOT EXISTS idx_raffle_entries_user_id ON public.raffle_entries (user_id);

-- --------------------
-- Indexes: Store
-- --------------------
CREATE INDEX IF NOT EXISTS idx_store_items_is_active_points_cost ON public.store_items (is_active, points_cost);
CREATE INDEX IF NOT EXISTS idx_store_items_created_at ON public.store_items (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_store_orders_created_at ON public.store_orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_store_orders_status_created_at ON public.store_orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_store_orders_user_id_created_at ON public.store_orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_store_orders_item_id ON public.store_orders (item_id);

-- Notifications are frequently queried per user
CREATE INDEX IF NOT EXISTS idx_notifications_user_created_at ON public.notifications (user_id, created_at DESC);

-- --------------------
-- RPC: broadcast notifications (set-based insert)
-- --------------------
CREATE OR REPLACE FUNCTION public.notify_users_by_role(
  n_title text,
  n_message text,
  n_type text,
  roles text[]
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, title, message, type)
  SELECT u.id, n_title, n_message, n_type
  FROM public.users u
  WHERE u.role = ANY(roles);
END;
$$;

-- --------------------
-- RLS policy alignment (include moderator_a1 / moderator_b1)
-- --------------------
DROP POLICY IF EXISTS "raffles_mod_all" ON public.raffles;
CREATE POLICY "raffles_mod_all" ON public.raffles FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('moderator', 'moderator_a1', 'moderator_b1', 'admin')));

DROP POLICY IF EXISTS "store_items_mod" ON public.store_items;
CREATE POLICY "store_items_mod" ON public.store_items FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('moderator', 'moderator_a1', 'moderator_b1', 'admin')));

DROP POLICY IF EXISTS "orders_admin_select" ON public.store_orders;
CREATE POLICY "orders_admin_select" ON public.store_orders FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('moderator', 'moderator_a1', 'moderator_b1', 'admin')));

DROP POLICY IF EXISTS "notif_insert_mod" ON public.notifications;
CREATE POLICY "notif_insert_mod" ON public.notifications FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('moderator', 'moderator_a1', 'moderator_b1', 'admin')));

DROP POLICY IF EXISTS "ledger_insert_mod" ON public.points_ledger;
CREATE POLICY "ledger_insert_mod" ON public.points_ledger FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('moderator', 'moderator_a1', 'moderator_b1', 'admin')));

DROP POLICY IF EXISTS "batches_mod_all" ON public.ot_batches;
CREATE POLICY "batches_mod_all" ON public.ot_batches FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('moderator', 'moderator_a1', 'moderator_b1', 'admin')));

