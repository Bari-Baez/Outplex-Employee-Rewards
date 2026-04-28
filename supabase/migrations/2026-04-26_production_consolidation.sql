-- ============================================================
-- Outplex production consolidation
-- Safe to run on an existing Supabase project.
-- Do NOT replace your baseline with supabase/schema.sql.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------
-- Helpers
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- Roles + users hardening
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE public.user_role AS ENUM ('employee', 'staff', 'moderator', 'moderator_a1', 'moderator_b1', 'admin');
  ELSE
    ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'staff';
    ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'moderator';
    ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'moderator_a1';
    ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'moderator_b1';
    ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'admin';
  END IF;
END $$;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role_revoked_at TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS supervisor_id UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS employee_id TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS supervisor TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS department TEXT;

CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_approved_role ON public.users(is_approved, role);
CREATE INDEX IF NOT EXISTS idx_users_supervisor_id ON public.users(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_users_department ON public.users(department);
CREATE INDEX IF NOT EXISTS idx_users_employee_id ON public.users(employee_id);

UPDATE public.users
SET is_approved = true
WHERE role IN ('admin', 'moderator', 'moderator_a1', 'moderator_b1')
  AND COALESCE(is_approved, false) = false;

DROP POLICY IF EXISTS "admins_update_any" ON public.users;
CREATE POLICY "admins_update_any" ON public.users
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.users actor
      WHERE actor.id = auth.uid()
        AND actor.role IN ('admin', 'moderator_a1')
    )
  );

DROP POLICY IF EXISTS "admin_delete_any" ON public.users;
CREATE POLICY "admin_delete_any" ON public.users
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.users actor
      WHERE actor.id = auth.uid()
        AND actor.role = 'admin'
    )
  );

-- ------------------------------------------------------------
-- Role requests
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.role_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  requested_role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT role_requests_status_check CHECK (status IN ('pending', 'reviewing', 'approved', 'rejected'))
);

ALTER TABLE public.role_requests ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.role_requests ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.role_requests ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE public.role_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.role_requests DROP CONSTRAINT IF EXISTS role_requests_status_check;
ALTER TABLE public.role_requests
  ADD CONSTRAINT role_requests_status_check
  CHECK (status IN ('pending', 'reviewing', 'approved', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_role_requests_user_created_at ON public.role_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_role_requests_status_created_at ON public.role_requests(status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS role_requests_user_active_idx
  ON public.role_requests (user_id)
  WHERE status IN ('pending', 'reviewing');

ALTER TABLE public.role_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "role_requests_own_select" ON public.role_requests;
CREATE POLICY "role_requests_own_select" ON public.role_requests
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.users actor
      WHERE actor.id = auth.uid()
        AND actor.role IN ('admin', 'moderator_a1')
    )
  );

DROP POLICY IF EXISTS "role_requests_own_insert" ON public.role_requests;
CREATE POLICY "role_requests_own_insert" ON public.role_requests
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "role_requests_mod_all" ON public.role_requests;
CREATE POLICY "role_requests_mod_all" ON public.role_requests
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.users actor
      WHERE actor.id = auth.uid()
        AND actor.role IN ('admin', 'moderator_a1')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users actor
      WHERE actor.id = auth.uid()
        AND actor.role IN ('admin', 'moderator_a1')
    )
  );

DROP TRIGGER IF EXISTS trg_role_requests_updated_at ON public.role_requests;
CREATE TRIGGER trg_role_requests_updated_at
  BEFORE UPDATE ON public.role_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

-- ------------------------------------------------------------
-- Employee store enum normalization
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'employee_store_status') THEN
    CREATE TYPE public.employee_store_status AS ENUM ('active', 'paused', 'closed', 'scheduled', 'suspended');
  ELSE
    ALTER TYPE public.employee_store_status ADD VALUE IF NOT EXISTS 'scheduled';
    ALTER TYPE public.employee_store_status ADD VALUE IF NOT EXISTS 'suspended';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'employee_store_order_status') THEN
    CREATE TYPE public.employee_store_order_status AS ENUM ('pending', 'ready_for_pickup', 'completed', 'cancelled');
  ELSE
    ALTER TYPE public.employee_store_order_status ADD VALUE IF NOT EXISTS 'completed';
  END IF;
END $$;

ALTER TABLE public.employee_stores ADD COLUMN IF NOT EXISTS is_open BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.employee_stores ADD COLUMN IF NOT EXISTS operating_hours JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.employee_stores ADD COLUMN IF NOT EXISTS suspend_reason TEXT;
ALTER TABLE public.employee_stores ADD COLUMN IF NOT EXISTS first_product_published_at TIMESTAMPTZ;

ALTER TABLE public.employee_store_products ADD COLUMN IF NOT EXISTS cost_dop INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.employee_store_products ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.employee_store_products ADD COLUMN IF NOT EXISTS suspend_reason TEXT;
ALTER TABLE public.employee_store_products ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE public.employee_store_orders ADD COLUMN IF NOT EXISTS pickup_deadline TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_employee_stores_owner_status ON public.employee_stores(owner_id, status);
CREATE INDEX IF NOT EXISTS idx_employee_store_products_store_status ON public.employee_store_products(store_id, status);
CREATE INDEX IF NOT EXISTS idx_employee_store_products_store_suspended ON public.employee_store_products(store_id, is_suspended);
CREATE INDEX IF NOT EXISTS idx_employee_store_orders_store_created_at ON public.employee_store_orders(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_employee_store_orders_seller_created_at ON public.employee_store_orders(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_employee_store_orders_buyer_created_at ON public.employee_store_orders(buyer_id, created_at DESC);

ALTER TABLE public.employee_store_products DROP CONSTRAINT IF EXISTS employee_store_products_status_check;
ALTER TABLE public.employee_store_products
  ADD CONSTRAINT employee_store_products_status_check
  CHECK (status IN ('pending', 'active', 'rejected', 'out_of_stock', 'draft'));

UPDATE public.employee_store_products
SET status = CASE
  WHEN COALESCE(is_suspended, false) THEN 'rejected'
  WHEN COALESCE(is_active, false) AND COALESCE(stock, 0) <= 0 THEN 'out_of_stock'
  WHEN COALESCE(is_active, false) THEN 'active'
  ELSE 'draft'
END
WHERE status IS NULL
   OR status NOT IN ('pending', 'active', 'rejected', 'out_of_stock', 'draft');

UPDATE public.employee_stores s
SET first_product_published_at = p.first_product_created_at
FROM (
  SELECT store_id, MIN(created_at) AS first_product_created_at
  FROM public.employee_store_products
  GROUP BY store_id
) p
WHERE s.id = p.store_id
  AND s.first_product_published_at IS NULL;

-- ------------------------------------------------------------
-- Notifications + audit + departments
-- ------------------------------------------------------------
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS sender_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_sender_id
  ON public.notifications(sender_id);

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS broadcast_notification_id UUID;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'broadcast_notifications'
  ) THEN
    ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_broadcast_notification_id_fkey;
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_broadcast_notification_id_fkey
      FOREIGN KEY (broadcast_notification_id)
      REFERENCES public.broadcast_notifications(id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notifications_broadcast_notification_id
  ON public.notifications(broadcast_notification_id);

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON public.activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_created_at ON public.activity_logs(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.custom_departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  group_name TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.custom_departments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "custom_departments_read_authenticated" ON public.custom_departments;
CREATE POLICY "custom_departments_read_authenticated" ON public.custom_departments
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "custom_departments_admin_all" ON public.custom_departments;
CREATE POLICY "custom_departments_admin_all" ON public.custom_departments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.users actor
      WHERE actor.id = auth.uid()
        AND actor.role IN ('admin', 'moderator_a1')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users actor
      WHERE actor.id = auth.uid()
        AND actor.role IN ('admin', 'moderator_a1')
    )
  );

-- ------------------------------------------------------------
-- Breaks manager
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.schedule_upload_batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  schedule_date DATE NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'csv',
  status TEXT NOT NULL DEFAULT 'draft',
  scheduled_publish_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  uploaded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  file_hash TEXT,
  employee_count INTEGER NOT NULL DEFAULT 0,
  pending_review JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT schedule_upload_batches_source_type_check CHECK (source_type IN ('csv', 'manual', 'live', 'live_excel')),
  CONSTRAINT schedule_upload_batches_status_check CHECK (status IN ('draft', 'scheduled', 'published'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_upload_batches_file_hash
  ON public.schedule_upload_batches(file_hash)
  WHERE file_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_schedule_upload_batches_schedule_date_status
  ON public.schedule_upload_batches(schedule_date DESC, status);

CREATE TABLE IF NOT EXISTS public.daily_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id UUID REFERENCES public.schedule_upload_batches(id) ON DELETE SET NULL,
  employee_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  schedule_date DATE NOT NULL,
  shift_start TEXT,
  shift_end TEXT,
  shift_length_hrs NUMERIC(6,2),
  first_break_start TEXT,
  first_break_end TEXT,
  lunch_start TEXT,
  lunch_end TEXT,
  second_break_start TEXT,
  second_break_end TEXT,
  third_break_start TEXT,
  third_break_end TEXT,
  is_ot_day BOOLEAN NOT NULL DEFAULT false,
  hour_type TEXT NOT NULL DEFAULT 'regular',
  lob TEXT,
  supervisor_name TEXT,
  supervisor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT daily_schedules_hour_type_check CHECK (hour_type IN ('regular', 'ot'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_schedules_employee_date
  ON public.daily_schedules(employee_id, schedule_date);
CREATE INDEX IF NOT EXISTS idx_daily_schedules_batch_shift
  ON public.daily_schedules(batch_id, shift_start);
CREATE INDEX IF NOT EXISTS idx_daily_schedules_supervisor_date
  ON public.daily_schedules(supervisor_id, schedule_date DESC);

CREATE TABLE IF NOT EXISTS public.time_logs_audit (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  daily_schedule_id UUID REFERENCES public.daily_schedules(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  scheduled_start TEXT,
  actual_start TIMESTAMPTZ,
  actual_end TIMESTAMPTZ,
  variance_minutes INTEGER,
  delay_reason TEXT,
  is_open BOOLEAN NOT NULL DEFAULT true,
  is_unpaid BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT time_logs_audit_event_type_check CHECK (event_type IN ('first_break', 'lunch', 'second_break', 'third_break', 'bath_time')),
  CONSTRAINT time_logs_audit_delay_reason_check CHECK (delay_reason IS NULL OR delay_reason IN ('due_a_call', 'due_a_meeting', 'other'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_time_logs_audit_one_open_log
  ON public.time_logs_audit(daily_schedule_id, employee_id, event_type)
  WHERE is_open = true;
CREATE INDEX IF NOT EXISTS idx_time_logs_audit_employee_created_at
  ON public.time_logs_audit(employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_time_logs_audit_schedule_event
  ON public.time_logs_audit(daily_schedule_id, event_type);

ALTER TABLE public.schedule_upload_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_logs_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "schedule_batches_mod_all" ON public.schedule_upload_batches;
CREATE POLICY "schedule_batches_mod_all" ON public.schedule_upload_batches
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.users actor
      WHERE actor.id = auth.uid()
        AND actor.role IN ('admin', 'moderator_a1', 'moderator_b1')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users actor
      WHERE actor.id = auth.uid()
        AND actor.role IN ('admin', 'moderator_a1', 'moderator_b1')
    )
  );

DROP POLICY IF EXISTS "daily_schedules_employee_select" ON public.daily_schedules;
CREATE POLICY "daily_schedules_employee_select" ON public.daily_schedules
  FOR SELECT
  USING (
    auth.uid() = employee_id
    OR EXISTS (
      SELECT 1
      FROM public.users actor
      WHERE actor.id = auth.uid()
        AND actor.role IN ('admin', 'moderator_a1', 'moderator_b1')
    )
  );

DROP POLICY IF EXISTS "daily_schedules_mod_all" ON public.daily_schedules;
CREATE POLICY "daily_schedules_mod_all" ON public.daily_schedules
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.users actor
      WHERE actor.id = auth.uid()
        AND actor.role IN ('admin', 'moderator_a1', 'moderator_b1')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users actor
      WHERE actor.id = auth.uid()
        AND actor.role IN ('admin', 'moderator_a1', 'moderator_b1')
    )
  );

DROP POLICY IF EXISTS "time_logs_employee_select" ON public.time_logs_audit;
CREATE POLICY "time_logs_employee_select" ON public.time_logs_audit
  FOR SELECT
  USING (
    auth.uid() = employee_id
    OR EXISTS (
      SELECT 1
      FROM public.users actor
      WHERE actor.id = auth.uid()
        AND actor.role IN ('admin', 'moderator_a1', 'moderator_b1')
    )
  );

DROP POLICY IF EXISTS "time_logs_employee_insert" ON public.time_logs_audit;
CREATE POLICY "time_logs_employee_insert" ON public.time_logs_audit
  FOR INSERT
  WITH CHECK (auth.uid() = employee_id);

DROP POLICY IF EXISTS "time_logs_employee_update" ON public.time_logs_audit;
CREATE POLICY "time_logs_employee_update" ON public.time_logs_audit
  FOR UPDATE
  USING (
    auth.uid() = employee_id
    OR EXISTS (
      SELECT 1
      FROM public.users actor
      WHERE actor.id = auth.uid()
        AND actor.role IN ('admin', 'moderator_a1', 'moderator_b1')
    )
  )
  WITH CHECK (
    auth.uid() = employee_id
    OR EXISTS (
      SELECT 1
      FROM public.users actor
      WHERE actor.id = auth.uid()
        AND actor.role IN ('admin', 'moderator_a1', 'moderator_b1')
    )
  );

DROP TRIGGER IF EXISTS trg_schedule_upload_batches_updated_at ON public.schedule_upload_batches;
CREATE TRIGGER trg_schedule_upload_batches_updated_at
  BEFORE UPDATE ON public.schedule_upload_batches
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_daily_schedules_updated_at ON public.daily_schedules;
CREATE TRIGGER trg_daily_schedules_updated_at
  BEFORE UPDATE ON public.daily_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_time_logs_audit_updated_at ON public.time_logs_audit;
CREATE TRIGGER trg_time_logs_audit_updated_at
  BEFORE UPDATE ON public.time_logs_audit
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

DROP FUNCTION IF EXISTS public.increment_batch_employee_count(UUID);
CREATE OR REPLACE FUNCTION public.increment_batch_employee_count(batch_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  new_count INTEGER;
BEGIN
  SELECT COUNT(DISTINCT employee_id)
  INTO new_count
  FROM public.daily_schedules
  WHERE public.daily_schedules.batch_id = increment_batch_employee_count.batch_id;

  UPDATE public.schedule_upload_batches
  SET employee_count = COALESCE(new_count, 0)
  WHERE id = increment_batch_employee_count.batch_id;

  RETURN COALESCE(new_count, 0);
END;
$$;

CREATE OR REPLACE VIEW public.v_schedule_variance AS
SELECT
  ds.employee_id,
  COALESCE(u.name, 'Employee') AS employee_name,
  u.employee_id AS opx_id,
  ds.lob,
  ds.supervisor_name,
  ds.supervisor_id,
  ds.schedule_date,
  ds.shift_start,
  ds.shift_end,
  ds.hour_type,
  tla.id AS log_id,
  tla.event_type,
  tla.scheduled_start,
  tla.actual_start,
  tla.actual_end,
  tla.variance_minutes,
  tla.delay_reason,
  tla.is_unpaid,
  (tla.actual_start AT TIME ZONE 'America/Santo_Domingo') AS actual_start_local,
  (tla.actual_end AT TIME ZONE 'America/Santo_Domingo') AS actual_end_local
FROM public.time_logs_audit tla
JOIN public.daily_schedules ds ON ds.id = tla.daily_schedule_id
LEFT JOIN public.users u ON u.id = ds.employee_id;

-- ------------------------------------------------------------
-- Storage bucket used by product/uploads
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'assets',
  'assets',
  true,
  10485760,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/svg+xml',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "assets_public_read" ON storage.objects;
CREATE POLICY "assets_public_read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'assets');
