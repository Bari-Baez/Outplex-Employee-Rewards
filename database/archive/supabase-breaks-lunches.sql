-- ============================================================
-- NYT Breaks & Lunches System — Database Migration
-- Run this in Supabase SQL Editor
-- Additive only: no existing tables are modified
-- ============================================================

-- 1. SCHEDULE UPLOAD BATCHES
CREATE TABLE IF NOT EXISTS schedule_upload_batches (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  schedule_date         DATE NOT NULL,
  source_type           TEXT NOT NULL DEFAULT 'csv'
                        CHECK (source_type IN ('csv', 'manual', 'live_excel')),
  status                TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'scheduled', 'published')),
  scheduled_publish_at  TIMESTAMPTZ,
  published_at          TIMESTAMPTZ,
  uploaded_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  file_hash             TEXT,
  employee_count        INT NOT NULL DEFAULT 0,
  pending_review        JSONB DEFAULT '[]'::JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schedule_batches_date   ON schedule_upload_batches(schedule_date DESC);
CREATE INDEX IF NOT EXISTS idx_schedule_batches_status ON schedule_upload_batches(status);
CREATE INDEX IF NOT EXISTS idx_schedule_batches_hash   ON schedule_upload_batches(file_hash) WHERE file_hash IS NOT NULL;

-- 2. DAILY SCHEDULES
CREATE TABLE IF NOT EXISTS daily_schedules (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id              UUID REFERENCES schedule_upload_batches(id) ON DELETE CASCADE,
  employee_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  schedule_date         DATE NOT NULL,

  shift_start           TIME,
  shift_end             TIME,
  shift_length_hrs      NUMERIC(4,2),

  first_break_start     TIME,
  first_break_end       TIME,
  lunch_start           TIME,
  lunch_end             TIME,
  second_break_start    TIME,
  second_break_end      TIME,
  third_break_start     TIME,
  third_break_end       TIME,

  is_ot_day             BOOLEAN NOT NULL DEFAULT FALSE,
  hour_type             TEXT NOT NULL DEFAULT 'regular'
                        CHECK (hour_type IN ('regular', 'ot')),

  lob                   TEXT,
  supervisor_name       TEXT,
  supervisor_id         UUID REFERENCES users(id) ON DELETE SET NULL,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (employee_id, schedule_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_schedules_employee_date ON daily_schedules(employee_id, schedule_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_schedules_date          ON daily_schedules(schedule_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_schedules_batch         ON daily_schedules(batch_id);
CREATE INDEX IF NOT EXISTS idx_daily_schedules_supervisor    ON daily_schedules(supervisor_id);

-- 3. TIME LOGS AUDIT
CREATE TABLE IF NOT EXISTS time_logs_audit (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_schedule_id     UUID REFERENCES daily_schedules(id) ON DELETE CASCADE,
  employee_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  event_type            TEXT NOT NULL
                        CHECK (event_type IN ('first_break', 'lunch', 'second_break', 'third_break', 'bath_time')),

  scheduled_start       TIME,
  actual_start          TIMESTAMPTZ,
  actual_end            TIMESTAMPTZ,

  variance_minutes      NUMERIC(6,2),

  delay_reason          TEXT
                        CHECK (delay_reason IN ('due_a_call', 'due_a_meeting', 'other', NULL)),

  is_open               BOOLEAN NOT NULL DEFAULT TRUE,
  is_unpaid             BOOLEAN NOT NULL DEFAULT FALSE,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_time_logs_employee     ON time_logs_audit(employee_id);
CREATE INDEX IF NOT EXISTS idx_time_logs_schedule     ON time_logs_audit(daily_schedule_id);
CREATE INDEX IF NOT EXISTS idx_time_logs_event_type   ON time_logs_audit(event_type);
CREATE INDEX IF NOT EXISTS idx_time_logs_open         ON time_logs_audit(is_open) WHERE is_open = TRUE;
CREATE INDEX IF NOT EXISTS idx_time_logs_date         ON time_logs_audit(actual_start DESC);

-- 4. VARIANCE VIEW
CREATE OR REPLACE VIEW v_schedule_variance AS
SELECT
  u.id                    AS employee_id,
  u.name                  AS employee_name,
  u.employee_id           AS opx_id,
  ds.lob,
  ds.supervisor_name,
  ds.schedule_date,
  ds.shift_start,
  ds.shift_end,
  ds.hour_type,
  tl.id                   AS log_id,
  tl.event_type,
  tl.scheduled_start,
  tl.actual_start,
  tl.actual_end,
  tl.variance_minutes,
  tl.delay_reason,
  tl.is_unpaid,
  (tl.actual_start AT TIME ZONE 'America/Santo_Domingo') AS actual_start_local,
  (tl.actual_end   AT TIME ZONE 'America/Santo_Domingo') AS actual_end_local
FROM time_logs_audit tl
JOIN users u            ON tl.employee_id       = u.id
JOIN daily_schedules ds ON tl.daily_schedule_id = ds.id;

-- 5. TRIGGERS
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_schedule_batches_updated_at ON schedule_upload_batches;
CREATE TRIGGER set_schedule_batches_updated_at
  BEFORE UPDATE ON schedule_upload_batches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_daily_schedules_updated_at ON daily_schedules;
CREATE TRIGGER set_daily_schedules_updated_at
  BEFORE UPDATE ON daily_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_time_logs_updated_at ON time_logs_audit;
CREATE TRIGGER set_time_logs_updated_at
  BEFORE UPDATE ON time_logs_audit
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. ROW LEVEL SECURITY
ALTER TABLE schedule_upload_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_schedules         ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_logs_audit         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employees_view_own_schedule"     ON daily_schedules;
DROP POLICY IF EXISTS "employees_view_own_logs"         ON time_logs_audit;
DROP POLICY IF EXISTS "employees_insert_own_logs"       ON time_logs_audit;
DROP POLICY IF EXISTS "employees_update_own_open_logs"  ON time_logs_audit;
DROP POLICY IF EXISTS "no_employee_access_batches"      ON schedule_upload_batches;

CREATE POLICY "employees_view_own_schedule"
  ON daily_schedules FOR SELECT
  USING (employee_id = auth.uid());

CREATE POLICY "employees_view_own_logs"
  ON time_logs_audit FOR SELECT
  USING (employee_id = auth.uid());

CREATE POLICY "employees_insert_own_logs"
  ON time_logs_audit FOR INSERT
  WITH CHECK (employee_id = auth.uid());

CREATE POLICY "employees_update_own_open_logs"
  ON time_logs_audit FOR UPDATE
  USING (employee_id = auth.uid() AND is_open = TRUE);

CREATE POLICY "no_employee_access_batches"
  ON schedule_upload_batches FOR ALL
  USING (FALSE);
