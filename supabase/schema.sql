-- =====================================================
-- Outplex Project — Schema completo para Supabase
-- Pega TODO este contenido en SQL Editor y presiona Run
-- =====================================================
--
-- ADVERTENCIA: Este script ejecuta DROP TABLE en TODAS las tablas.
-- DESTRUYE todos los datos existentes. Úsalo SOLO en entornos
-- locales/dev desechables. Para producción usa EXCLUSIVAMENTE
-- supabase/migrations/ — NUNCA este archivo.
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- LIMPIEZA PREVIA: Ejecutar esto borra TODO para empezar en limpio y evitar errores 42710
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.broadcast_notifications CASCADE;
DROP TABLE IF EXISTS public.company_announcements CASCADE;
DROP TABLE IF EXISTS public.app_settings CASCADE;
DROP TABLE IF EXISTS public.store_orders CASCADE;
DROP TABLE IF EXISTS public.store_items CASCADE;
DROP TABLE IF EXISTS public.raffle_entries CASCADE;
DROP TABLE IF EXISTS public.raffles CASCADE;
DROP TABLE IF EXISTS public.ot_slots CASCADE;
DROP TABLE IF EXISTS public.ot_batches CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;

DROP TABLE IF EXISTS public.support_tickets CASCADE;
DROP TABLE IF EXISTS public.points_ledger CASCADE;

DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS slot_status CASCADE;
DROP TYPE IF EXISTS batch_status CASCADE;
DROP TYPE IF EXISTS raffle_status CASCADE;
DROP TYPE IF EXISTS order_status CASCADE;

-- CREACIÓN DE TIPOS
CREATE TYPE user_role AS ENUM ('employee', 'moderator', 'admin');
CREATE TYPE slot_status AS ENUM ('available', 'claimed', 'cancelled');
CREATE TYPE batch_status AS ENUM ('draft', 'scheduled', 'published');
CREATE TYPE raffle_status AS ENUM ('upcoming', 'live', 'completed');
CREATE TYPE order_status AS ENUM ('pending', 'approved', 'ready_for_pickup', 'rejected', 'completed', 'cancelled');

-- USERS
CREATE TABLE public.users (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  slack_id      TEXT UNIQUE,
  name          TEXT NOT NULL DEFAULT 'Employee',
  email         TEXT,
  avatar_url    TEXT,
  role          user_role NOT NULL DEFAULT 'employee',
  employee_id   TEXT,
  supervisor    TEXT,
  department    TEXT,
  points        INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_select" ON public.users FOR SELECT USING (true);
CREATE POLICY "users_update_own" ON public.users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "users_insert" ON public.users FOR INSERT WITH CHECK (true);

-- OT BATCHES
CREATE TABLE public.ot_batches (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  status        batch_status NOT NULL DEFAULT 'draft',
  csv_data      JSONB,
  uploaded_by   UUID REFERENCES public.users(id),
  published_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.ot_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "batches_mod_all" ON public.ot_batches FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('moderator', 'admin')));

-- OT SLOTS
CREATE TABLE public.ot_slots (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  spot_id       TEXT,
  lob           TEXT DEFAULT 'NYT Universal Voice',
  date          DATE NOT NULL,
  start_time    TIME NOT NULL,
  end_time      TIME NOT NULL,
  duration_hrs  NUMERIC(4,1),
  shift_label   TEXT,
  status        slot_status NOT NULL DEFAULT 'available',
  csv_status    TEXT DEFAULT 'Pending',
  claimed_by    UUID REFERENCES public.users(id),
  claimed_at    TIMESTAMPTZ,
  published_by  UUID REFERENCES public.users(id),
  batch_id      UUID REFERENCES public.ot_batches(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_ot_slots_date ON public.ot_slots(date);
CREATE INDEX idx_ot_slots_status ON public.ot_slots(status);
CREATE INDEX idx_ot_slots_claimed_by ON public.ot_slots(claimed_by);
ALTER TABLE public.ot_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "slots_select_all" ON public.ot_slots FOR SELECT USING (true);
CREATE POLICY "slots_service_all" ON public.ot_slots FOR ALL USING (true) WITH CHECK (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.ot_slots;

-- RAFFLES
CREATE TABLE public.raffles (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title         TEXT NOT NULL,
  description   TEXT,
  prize_image   TEXT,
  draw_date     TIMESTAMPTZ,
  status        raffle_status NOT NULL DEFAULT 'upcoming',
  winner_id     UUID REFERENCES public.users(id),
  created_by    UUID REFERENCES public.users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.raffles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "raffles_select_all" ON public.raffles FOR SELECT USING (true);
CREATE POLICY "raffles_mod_all" ON public.raffles FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('moderator', 'admin')));

-- RAFFLE ENTRIES
CREATE TABLE public.raffle_entries (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  raffle_id     UUID NOT NULL REFERENCES public.raffles(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(raffle_id, user_id)
);
ALTER TABLE public.raffle_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "raf_ent_select" ON public.raffle_entries FOR SELECT USING (true);
CREATE POLICY "raf_ent_insert" ON public.raffle_entries FOR INSERT WITH CHECK (auth.uid() = user_id);

-- STORE ITEMS
CREATE TABLE public.store_items (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  description   TEXT,
  points_cost   INTEGER NOT NULL,
  image_url     TEXT,
  stock         INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.store_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "store_items_select" ON public.store_items FOR SELECT USING (true);
CREATE POLICY "store_items_mod" ON public.store_items FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('moderator', 'admin')));

-- STORE ORDERS
CREATE TABLE public.store_orders (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id       UUID NOT NULL REFERENCES public.store_items(id),
  user_id       UUID NOT NULL REFERENCES public.users(id),
  points_spent  INTEGER NOT NULL,
  status        order_status NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.store_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders_own_select" ON public.store_orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "orders_admin_select" ON public.store_orders FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('moderator', 'admin')));
CREATE POLICY "orders_insert" ON public.store_orders FOR INSERT WITH CHECK (auth.uid() = user_id);

-- DEMO DATA: Slots basados en el CSV real de OutPLEX
INSERT INTO public.ot_slots (spot_id, lob, date, start_time, end_time, duration_hrs, shift_label, status) VALUES
  ('17594', 'NYT Universal Voice', CURRENT_DATE + 1, '16:00', '18:00', 2, 'Evening Shift', 'available'),
  ('17595', 'NYT Universal Voice', CURRENT_DATE + 1, '16:00', '18:00', 2, 'Evening Shift', 'available'),
  ('17596', 'NYT Universal Voice', CURRENT_DATE + 1, '16:00', '18:00', 2, 'Evening Shift', 'available'),
  ('17597', 'NYT Universal Voice', CURRENT_DATE + 2, '08:30', '16:30', 8, 'Morning Shift', 'available'),
  ('17598', 'NYT Universal Voice', CURRENT_DATE + 2, '08:30', '16:30', 8, 'Morning Shift', 'available'),
  ('17599', 'NYT Universal Voice', CURRENT_DATE + 2, '11:00', '17:00', 6, 'Afternoon Shift', 'available'),
  ('17600', 'NYT Universal Voice', CURRENT_DATE + 2, '15:00', '17:00', 2, 'Afternoon Shift', 'available'),
  ('17601', 'NYT Universal Voice', CURRENT_DATE + 2, '16:00', '18:00', 2, 'Evening Shift', 'available'),
  ('17602', 'NYT Universal Voice', CURRENT_DATE + 3, '11:00', '17:00', 6, 'Afternoon Shift', 'available'),
  ('17603', 'NYT Universal Voice', CURRENT_DATE + 3, '15:00', '17:00', 2, 'Afternoon Shift', 'available'),
  ('17604', 'NYT Universal Voice', CURRENT_DATE + 3, '16:00', '18:00', 2, 'Evening Shift', 'available'),
  ('17605', 'NYT Universal Voice', CURRENT_DATE + 4, '16:00', '18:00', 2, 'Evening Shift', 'available'),
  ('17606', 'NYT Universal Voice', CURRENT_DATE + 4, '16:00', '18:00', 2, 'Evening Shift', 'available'),
  ('17607', 'NYT Universal Voice', CURRENT_DATE + 5, '08:30', '16:30', 8, 'Morning Shift', 'available'),
  ('17608', 'NYT Universal Voice', CURRENT_DATE + 5, '11:00', '17:00', 6, 'Afternoon Shift', 'available');

-- APP SETTINGS
CREATE TABLE public.app_settings (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key           TEXT UNIQUE NOT NULL,
  value         JSONB,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings_select" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "settings_mod_all" ON public.app_settings FOR ALL 
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('moderator', 'admin')));

-- NOTIFICATIONS
CREATE TABLE public.notifications (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  sender_id     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  broadcast_notification_id UUID,
  title         TEXT NOT NULL,
  message       TEXT,
  type          TEXT DEFAULT 'system',
  is_read       BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif_own_select" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "notif_own_update" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "notif_insert_mod" ON public.notifications FOR INSERT 
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('moderator', 'admin')));

-- POINTS LEDGER
CREATE TABLE public.points_ledger (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  points_added  INTEGER NOT NULL,
  granted_by    UUID REFERENCES public.users(id),
  reason        TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.points_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ledger_select" ON public.points_ledger FOR SELECT USING (true);
CREATE POLICY "ledger_insert_mod" ON public.points_ledger FOR INSERT 
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('moderator', 'admin')));

-- SUPPORT TICKETS
CREATE TABLE public.support_tickets (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  department    TEXT NOT NULL, -- 'it' or 'moderator'
  message       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open', -- 'open', 'closed'
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tickets_own_select" ON public.support_tickets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "tickets_mod_select" ON public.support_tickets FOR SELECT 
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('moderator', 'admin')));
CREATE POLICY "tickets_insert" ON public.support_tickets FOR INSERT WITH CHECK (auth.uid() = user_id);

-- BROADCAST NOTIFICATIONS
CREATE TABLE public.broadcast_notifications (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title         TEXT NOT NULL,
  message       TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'general',
  status        TEXT NOT NULL DEFAULT 'draft',
  publish_at    TIMESTAMPTZ,
  sent_at       TIMESTAMPTZ,
  created_by    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT broadcast_notifications_category_check CHECK (category IN ('availability', 'stock', 'site_visit', 'general')),
  CONSTRAINT broadcast_notifications_status_check CHECK (status IN ('draft', 'scheduled', 'published'))
);
CREATE INDEX idx_broadcast_notifications_publish_at ON public.broadcast_notifications(publish_at DESC);
CREATE INDEX idx_broadcast_notifications_status ON public.broadcast_notifications(status);
ALTER TABLE public.broadcast_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "broadcast_notifications_select_all" ON public.broadcast_notifications FOR SELECT USING (true);
CREATE POLICY "broadcast_notifications_mod_all" ON public.broadcast_notifications FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('moderator', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('moderator', 'admin')));

-- COMPANY ANNOUNCEMENTS
CREATE TABLE public.company_announcements (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title            TEXT NOT NULL,
  excerpt          TEXT,
  cover_image_url  TEXT,
  content          JSONB NOT NULL DEFAULT '[]'::jsonb,
  duration_days    INTEGER NOT NULL DEFAULT 7,
  status           TEXT NOT NULL DEFAULT 'draft',
  publish_at       TIMESTAMPTZ,
  expires_at       TIMESTAMPTZ,
  created_by       UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by       UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT company_announcements_duration_days_check CHECK (duration_days IN (1, 3, 5, 7, 15, 30, 60)),
  CONSTRAINT company_announcements_status_check CHECK (status IN ('draft', 'scheduled', 'published'))
);
CREATE INDEX idx_company_announcements_publish_at ON public.company_announcements(publish_at DESC);
CREATE INDEX idx_company_announcements_status ON public.company_announcements(status);
CREATE INDEX idx_company_announcements_expires_at ON public.company_announcements(expires_at);
ALTER TABLE public.company_announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_announcements_select_all" ON public.company_announcements FOR SELECT USING (true);
CREATE POLICY "company_announcements_mod_all" ON public.company_announcements FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('moderator', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('moderator', 'admin')));
