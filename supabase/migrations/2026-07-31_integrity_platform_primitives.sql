-- Integrity and platform primitives (forward-only; not executed by this change).
-- Query impact: bounded primary-key/partial-index lookups; cleanup functions are
-- intended for an authenticated maintenance job and delete in capped batches.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.current_user_is_approved_moderator()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
      AND is_approved = TRUE
      AND role::TEXT IN ('moderator', 'moderator_a1', 'moderator_b1', 'admin')
  );
$$;

REVOKE ALL ON FUNCTION private.current_user_is_approved_moderator() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.current_user_is_approved_moderator() TO authenticated;

-- Replace only known legacy policies. Unknown policies stop promotion for DBA
-- review instead of being deleted from a schema that may have drifted.
DROP POLICY IF EXISTS users_select ON public.users;
DROP POLICY IF EXISTS users_update_own ON public.users;
DROP POLICY IF EXISTS users_insert ON public.users;
DROP POLICY IF EXISTS admins_update_any ON public.users;
DROP POLICY IF EXISTS admin_delete_any ON public.users;

DO $$
DECLARE
  v_unknown TEXT;
BEGIN
  SELECT string_agg(policyname || ':' || cmd, ', ' ORDER BY policyname)
  INTO v_unknown
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'public' AND tablename = 'users'
    AND policyname NOT IN ('users_select_self', 'users_select_approved_moderators');

  IF v_unknown IS NOT NULL THEN
    RAISE EXCEPTION 'Unknown users policies require DBA review: %', v_unknown;
  END IF;
END;
$$;

CREATE POLICY users_select_self ON public.users
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY users_select_approved_moderators ON public.users
  FOR SELECT TO authenticated
  USING (private.current_user_is_approved_moderator());

REVOKE ALL ON public.users FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.users FROM authenticated;
GRANT SELECT ON public.users TO authenticated;

CREATE TABLE IF NOT EXISTS private.ot_claim_metadata (
  slot_id UUID PRIMARY KEY REFERENCES public.ot_slots(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  claim_kind TEXT NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ot_claim_metadata_claim_kind_check
    CHECK (claim_kind IN ('day_off', 'scheduled_extension', 'recovery'))
);

CREATE INDEX IF NOT EXISTS idx_ot_claim_metadata_user_claimed_at
  ON private.ot_claim_metadata(user_id, claimed_at DESC);

ALTER TABLE private.ot_claim_metadata ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.ot_claim_metadata FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS private.store_order_lines (
  order_id UUID NOT NULL REFERENCES public.store_orders(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.store_items(id),
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 100),
  unit_points INTEGER NOT NULL CHECK (unit_points >= 0),
  name_snapshot TEXT NOT NULL CHECK (char_length(name_snapshot) BETWEEN 1 AND 240),
  image_snapshot TEXT,
  description_snapshot TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (order_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_store_order_lines_item_id
  ON private.store_order_lines(item_id);
ALTER TABLE private.store_order_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.store_order_lines FROM PUBLIC, anon, authenticated;

-- Expand step for legacy grouped orders. Valid line arrays are preferred; a
-- primary-item fallback preserves cancellability for older single-item rows.
INSERT INTO private.store_order_lines (
  order_id, item_id, quantity, unit_points, name_snapshot,
  image_snapshot, description_snapshot
)
SELECT
  orders.id,
  CASE WHEN line.value->>'itemId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    THEN (line.value->>'itemId')::UUID END,
  CASE WHEN line.value->>'quantity' ~ '^[0-9]{1,3}$'
    THEN LEAST(100, GREATEST(1, (line.value->>'quantity')::INTEGER)) END,
  CASE WHEN line.value->>'unitPoints' ~ '^[0-9]{1,10}$'
    THEN GREATEST(0, (line.value->>'unitPoints')::INTEGER) END,
  left(COALESCE(NULLIF(line.value->>'name', ''), items.name, 'Store Item'), 240),
  NULLIF(line.value->>'imageUrl', ''),
  NULLIF(line.value->>'description', '')
FROM public.store_orders orders
JOIN public.app_settings settings ON settings.key = 'store_order_meta_' || orders.id::TEXT
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(settings.value->'lineItems') = 'array'
    THEN settings.value->'lineItems' ELSE '[]'::JSONB END
) AS line(value)
JOIN public.store_items items ON items.id = CASE
  WHEN line.value->>'itemId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN (line.value->>'itemId')::UUID END
WHERE line.value->>'itemId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND line.value->>'quantity' ~ '^[0-9]{1,3}$'
  AND line.value->>'unitPoints' ~ '^[0-9]{1,10}$'
ON CONFLICT (order_id, item_id) DO NOTHING;

INSERT INTO private.store_order_lines (
  order_id, item_id, quantity, unit_points, name_snapshot,
  image_snapshot, description_snapshot
)
SELECT
  orders.id,
  orders.item_id,
  1,
  GREATEST(0, orders.points_spent),
  left(items.name, 240),
  items.image_url,
  items.description
FROM public.store_orders orders
JOIN public.store_items items ON items.id = orders.item_id
WHERE NOT EXISTS (
  SELECT 1 FROM private.store_order_lines lines WHERE lines.order_id = orders.id
)
ON CONFLICT (order_id, item_id) DO NOTHING;

-- Migration-time assertion: do not silently accept a pre-existing table that
-- lacks the domain constraint required by the application contract.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'private.ot_claim_metadata'::regclass
      AND conname = 'ot_claim_metadata_claim_kind_check'
  ) THEN
    RAISE EXCEPTION 'ot_claim_metadata_claim_kind_check is required';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.api_rate_limit_buckets (
  scope TEXT NOT NULL CHECK (char_length(scope) BETWEEN 1 AND 100),
  subject TEXT NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 200),
  bucket_started_at TIMESTAMPTZ NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 0 CHECK (hit_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (scope, subject, bucket_started_at)
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limit_buckets_updated_at
  ON public.api_rate_limit_buckets(updated_at);

ALTER TABLE public.api_rate_limit_buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.api_rate_limit_buckets FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.api_idempotency_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (char_length(scope) BETWEEN 1 AND 100),
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 16 AND 128),
  request_hash TEXT NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  state TEXT NOT NULL DEFAULT 'processing' CHECK (state IN ('processing', 'completed', 'failed')),
  response_status INTEGER CHECK (response_status BETWEEN 100 AND 599),
  response_body JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  UNIQUE (actor_id, scope, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_api_idempotency_keys_expires_at
  ON public.api_idempotency_keys(expires_at);

ALTER TABLE public.api_idempotency_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.api_idempotency_keys FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.integration_outbox (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type TEXT NOT NULL CHECK (char_length(event_type) BETWEEN 1 AND 120),
  aggregate_type TEXT NOT NULL CHECK (char_length(aggregate_type) BETWEEN 1 AND 80),
  aggregate_id TEXT NOT NULL CHECK (char_length(aggregate_id) BETWEEN 1 AND 160),
  payload JSONB NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'processing', 'processed', 'dead')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  processed_at TIMESTAMPTZ,
  last_error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_type, aggregate_type, aggregate_id)
);

CREATE INDEX IF NOT EXISTS idx_integration_outbox_dispatch
  ON public.integration_outbox(state, available_at, created_at)
  WHERE state IN ('pending', 'processing');

ALTER TABLE public.integration_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.integration_outbox FROM anon, authenticated;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS outbox_event_id UUID REFERENCES public.integration_outbox(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS notifications_outbox_event_user_idx
  ON public.notifications(outbox_event_id, user_id);

CREATE OR REPLACE FUNCTION public.consume_api_rate_limit(
  p_scope TEXT,
  p_subject TEXT,
  p_limit INTEGER,
  p_window_seconds INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_bucket TIMESTAMPTZ;
  v_count INTEGER;
  v_retry_after INTEGER;
BEGIN
  IF p_scope IS NULL OR char_length(p_scope) NOT BETWEEN 1 AND 100
    OR p_subject IS NULL OR char_length(p_subject) NOT BETWEEN 1 AND 200
    OR p_limit NOT BETWEEN 1 AND 10000
    OR p_window_seconds NOT BETWEEN 1 AND 86400 THEN
    RAISE EXCEPTION 'invalid_rate_limit_arguments' USING ERRCODE = '22023';
  END IF;

  v_bucket := to_timestamp(
    floor(extract(epoch FROM clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  INSERT INTO public.api_rate_limit_buckets (
    scope, subject, bucket_started_at, hit_count, updated_at
  ) VALUES (
    p_scope, p_subject, v_bucket, 1, NOW()
  )
  ON CONFLICT (scope, subject, bucket_started_at)
  DO UPDATE SET
    hit_count = LEAST(public.api_rate_limit_buckets.hit_count + 1, p_limit + 1),
    updated_at = NOW()
  RETURNING hit_count INTO v_count;

  v_retry_after := GREATEST(
    1,
    CEIL(EXTRACT(EPOCH FROM (v_bucket + make_interval(secs => p_window_seconds) - clock_timestamp())))::INTEGER
  );

  RETURN jsonb_build_object(
    'allowed', v_count <= p_limit,
    'remaining', GREATEST(0, p_limit - v_count),
    'retryAfterSeconds', v_retry_after
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_ot_slot_transactional(
  p_user_id UUID,
  p_slot_id UUID,
  p_claim_kind TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_slot public.ot_slots%ROWTYPE;
  v_claimed_at TIMESTAMPTZ := NOW();
  v_user_is_approved BOOLEAN;
BEGIN
  IF p_claim_kind NOT IN ('day_off', 'scheduled_extension', 'recovery') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_claim_kind');
  END IF;

  SELECT is_approved INTO v_user_is_approved
  FROM public.users
  WHERE id = p_user_id;
  IF NOT FOUND OR v_user_is_approved IS DISTINCT FROM TRUE THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;

  SELECT * INTO v_slot
  FROM public.ot_slots
  WHERE id = p_slot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'slot_not_found');
  END IF;
  IF v_slot.status::TEXT <> 'available' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'slot_unavailable');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::TEXT || ':' || v_slot.date::TEXT, 0));

  IF EXISTS (
    SELECT 1
    FROM public.ot_slots existing
    WHERE existing.claimed_by = p_user_id
      AND existing.status::TEXT = 'claimed'
      AND existing.date = v_slot.date
      AND existing.id <> p_slot_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'daily_claim_exists');
  END IF;

  UPDATE public.ot_slots
  SET status = 'claimed', claimed_by = p_user_id, claimed_at = v_claimed_at
  WHERE id = p_slot_id AND status::TEXT = 'available'
  RETURNING * INTO v_slot;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'slot_unavailable');
  END IF;

  INSERT INTO private.ot_claim_metadata (
    slot_id, user_id, claim_kind, claimed_at, created_at, updated_at
  ) VALUES (
    p_slot_id, p_user_id, p_claim_kind, v_claimed_at, NOW(), NOW()
  )
  ON CONFLICT (slot_id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    claim_kind = EXCLUDED.claim_kind,
    claimed_at = EXCLUDED.claimed_at,
    updated_at = NOW();

  RETURN jsonb_build_object('ok', true, 'slot', to_jsonb(v_slot));
END;
$$;

CREATE OR REPLACE FUNCTION public.unclaim_ot_slot_transactional(
  p_user_id UUID,
  p_slot_id UUID,
  p_window_seconds INTEGER DEFAULT 1200
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_slot public.ot_slots%ROWTYPE;
  v_user_is_approved BOOLEAN;
BEGIN
  IF p_window_seconds NOT BETWEEN 60 AND 86400 THEN
    RAISE EXCEPTION 'invalid_unclaim_window' USING ERRCODE = '22023';
  END IF;

  SELECT is_approved INTO v_user_is_approved
  FROM public.users
  WHERE id = p_user_id;
  IF NOT FOUND OR v_user_is_approved IS DISTINCT FROM TRUE THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;

  SELECT * INTO v_slot
  FROM public.ot_slots
  WHERE id = p_slot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'slot_not_found');
  END IF;
  IF v_slot.claimed_by IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_owner');
  END IF;
  IF v_slot.status::TEXT <> 'claimed' OR v_slot.claimed_at IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_claimed');
  END IF;
  IF v_slot.claimed_at < NOW() - make_interval(secs => p_window_seconds) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'unclaim_window_expired');
  END IF;

  UPDATE public.ot_slots
  SET status = 'available', claimed_by = NULL, claimed_at = NULL
  WHERE id = p_slot_id AND claimed_by = p_user_id AND status::TEXT = 'claimed'
  RETURNING * INTO v_slot;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'claim_changed');
  END IF;

  DELETE FROM private.ot_claim_metadata WHERE slot_id = p_slot_id;
  RETURN jsonb_build_object('ok', true, 'slot', to_jsonb(v_slot));
END;
$$;

CREATE OR REPLACE FUNCTION public.set_ot_claim_metadata(
  p_slot_id UUID,
  p_user_id UUID,
  p_claim_kind TEXT,
  p_claimed_at TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_claim_kind NOT IN ('day_off', 'scheduled_extension', 'recovery') THEN
    RAISE EXCEPTION 'invalid_claim_kind' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ot_slots
    WHERE id = p_slot_id
      AND claimed_by = p_user_id
      AND status::TEXT = 'claimed'
  ) THEN
    RETURN FALSE;
  END IF;

  INSERT INTO private.ot_claim_metadata (
    slot_id, user_id, claim_kind, claimed_at, created_at, updated_at
  ) VALUES (
    p_slot_id, p_user_id, p_claim_kind, p_claimed_at, NOW(), NOW()
  )
  ON CONFLICT (slot_id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    claim_kind = EXCLUDED.claim_kind,
    claimed_at = EXCLUDED.claimed_at,
    updated_at = NOW();
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_ot_claim_metadata(p_slot_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM private.ot_claim_metadata WHERE slot_id = p_slot_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted <= 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_ot_claim_metadata(p_slot_ids UUID[])
RETURNS TABLE(slot_id UUID, claim_kind TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT metadata.slot_id, metadata.claim_kind
  FROM private.ot_claim_metadata metadata
  INNER JOIN public.ot_slots slots ON slots.id = metadata.slot_id
  WHERE metadata.slot_id = ANY(p_slot_ids)
    AND slots.claimed_by = auth.uid()
    AND metadata.user_id = auth.uid()
  LIMIT 500;
$$;

CREATE OR REPLACE FUNCTION public.claim_integration_outbox_jobs(
  p_worker_id TEXT,
  p_limit INTEGER DEFAULT 25
)
RETURNS SETOF public.integration_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_worker_id IS NULL OR char_length(p_worker_id) NOT BETWEEN 1 AND 120
    OR p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'invalid_outbox_claim_arguments' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT id
    FROM public.integration_outbox
    WHERE available_at <= NOW()
      AND (
        state = 'pending'
        OR (state = 'processing' AND locked_at < NOW() - INTERVAL '10 minutes')
      )
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  )
  UPDATE public.integration_outbox jobs
  SET state = 'processing',
      attempts = jobs.attempts + 1,
      locked_at = NOW(),
      locked_by = p_worker_id,
      updated_at = NOW()
  FROM candidates
  WHERE jobs.id = candidates.id
  RETURNING jobs.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_integration_outbox_job(
  p_job_id UUID,
  p_worker_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE public.integration_outbox
  SET state = 'processed',
      processed_at = NOW(),
      locked_at = NULL,
      locked_by = NULL,
      last_error_code = NULL,
      updated_at = NOW()
  WHERE id = p_job_id
    AND state = 'processing'
    AND locked_by = p_worker_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_integration_outbox_job(
  p_job_id UUID,
  p_worker_id TEXT,
  p_error_code TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  IF p_error_code IS NULL OR p_error_code !~ '^[a-z0-9_.-]{1,80}$' THEN
    RAISE EXCEPTION 'invalid_outbox_error_code' USING ERRCODE = '22023';
  END IF;

  UPDATE public.integration_outbox
  SET state = CASE WHEN attempts >= 10 THEN 'dead' ELSE 'pending' END,
      available_at = CASE
        WHEN attempts >= 10 THEN available_at
        ELSE NOW() + make_interval(secs => LEAST(3600, (POWER(2, LEAST(attempts, 8)) * 15)::INTEGER))
      END,
      locked_at = NULL,
      locked_by = NULL,
      last_error_code = p_error_code,
      updated_at = NOW()
  WHERE id = p_job_id
    AND state = 'processing'
    AND locked_by = p_worker_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.begin_api_idempotency(
  p_actor_id UUID,
  p_scope TEXT,
  p_idempotency_key TEXT,
  p_request_hash TEXT,
  p_ttl_seconds INTEGER DEFAULT 86400
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_record public.api_idempotency_keys%ROWTYPE;
  v_inserted INTEGER := 0;
BEGIN
  IF p_scope IS NULL OR char_length(p_scope) NOT BETWEEN 1 AND 100
    OR p_idempotency_key IS NULL OR char_length(p_idempotency_key) NOT BETWEEN 16 AND 128
    OR p_request_hash IS NULL OR p_request_hash !~ '^[a-f0-9]{64}$'
    OR p_ttl_seconds NOT BETWEEN 60 AND 86400 THEN
    RAISE EXCEPTION 'invalid_idempotency_arguments' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.api_idempotency_keys (
    actor_id, scope, idempotency_key, request_hash, expires_at
  ) VALUES (
    p_actor_id, p_scope, p_idempotency_key, p_request_hash,
    NOW() + make_interval(secs => p_ttl_seconds)
  )
  ON CONFLICT (actor_id, scope, idempotency_key) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  SELECT * INTO v_record
  FROM public.api_idempotency_keys
  WHERE actor_id = p_actor_id
    AND scope = p_scope
    AND idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF v_record.request_hash <> p_request_hash THEN
    RETURN jsonb_build_object('state', 'conflict');
  END IF;
  IF v_inserted = 1 THEN
    RETURN jsonb_build_object('state', 'acquired');
  END IF;
  IF v_record.state = 'completed' THEN
    RETURN jsonb_build_object(
      'state', 'replay',
      'responseStatus', v_record.response_status,
      'responseBody', v_record.response_body
    );
  END IF;
  IF v_record.state = 'failed' THEN
    UPDATE public.api_idempotency_keys
    SET state = 'processing', response_status = NULL, response_body = NULL,
        updated_at = NOW(), expires_at = NOW() + make_interval(secs => p_ttl_seconds)
    WHERE id = v_record.id;
    RETURN jsonb_build_object('state', 'acquired');
  END IF;
  IF v_record.state = 'processing' AND v_record.updated_at < NOW() - INTERVAL '10 minutes' THEN
    UPDATE public.api_idempotency_keys
    SET updated_at = NOW(), expires_at = NOW() + make_interval(secs => p_ttl_seconds)
    WHERE id = v_record.id;
    RETURN jsonb_build_object('state', 'acquired');
  END IF;
  RETURN jsonb_build_object('state', 'in_progress');
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_api_idempotency(
  p_actor_id UUID,
  p_scope TEXT,
  p_idempotency_key TEXT,
  p_request_hash TEXT,
  p_response_status INTEGER,
  p_response_body JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  IF p_response_status NOT BETWEEN 200 AND 599 THEN
    RAISE EXCEPTION 'invalid_idempotency_response_status' USING ERRCODE = '22023';
  END IF;

  UPDATE public.api_idempotency_keys
  SET state = 'completed',
      response_status = p_response_status,
      response_body = p_response_body,
      updated_at = NOW()
  WHERE actor_id = p_actor_id
    AND scope = p_scope
    AND idempotency_key = p_idempotency_key
    AND request_hash = p_request_hash
    AND state = 'processing';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_api_idempotency(
  p_actor_id UUID,
  p_scope TEXT,
  p_idempotency_key TEXT,
  p_request_hash TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE public.api_idempotency_keys
  SET state = 'failed', updated_at = NOW()
  WHERE actor_id = p_actor_id
    AND scope = p_scope
    AND idempotency_key = p_idempotency_key
    AND request_hash = p_request_hash
    AND state = 'processing';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.checkout_store_order_transactional(
  p_user_id UUID,
  p_cart JSONB,
  p_idempotency_key TEXT,
  p_request_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_guard JSONB;
  v_profile public.users%ROWTYPE;
  v_order public.store_orders%ROWTYPE;
  v_total_points INTEGER;
  v_total_units INTEGER;
  v_product_count INTEGER;
  v_lines JSONB;
  v_meta JSONB;
  v_response JSONB;
BEGIN
  IF jsonb_typeof(p_cart) <> 'array' OR jsonb_array_length(p_cart) NOT BETWEEN 1 AND 50 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_cart');
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_cart) AS requested("itemId" TEXT, quantity INTEGER)
    WHERE requested."itemId" IS NULL
      OR requested."itemId" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR requested.quantity NOT BETWEEN 1 AND 100
  ) OR (
    SELECT count(*) <> count(DISTINCT requested."itemId")
    FROM jsonb_to_recordset(p_cart) AS requested("itemId" TEXT, quantity INTEGER)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_cart');
  END IF;

  v_guard := public.begin_api_idempotency(
    p_user_id, 'store:checkout', p_idempotency_key, p_request_hash, 86400
  );
  IF v_guard->>'state' = 'replay' THEN
    RETURN v_guard->'responseBody';
  ELSIF v_guard->>'state' <> 'acquired' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'idempotency_' || (v_guard->>'state'));
  END IF;

  SELECT * INTO v_profile FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND OR v_profile.is_approved IS DISTINCT FROM TRUE THEN
    PERFORM public.fail_api_idempotency(p_user_id, 'store:checkout', p_idempotency_key, p_request_hash);
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;

  PERFORM items.id
  FROM public.store_items items
  JOIN jsonb_to_recordset(p_cart) AS requested("itemId" UUID, quantity INTEGER)
    ON requested."itemId" = items.id
  ORDER BY items.id
  FOR UPDATE;

  IF (SELECT count(*) FROM jsonb_to_recordset(p_cart) AS requested("itemId" UUID, quantity INTEGER)) <>
     (SELECT count(*) FROM public.store_items items
      JOIN jsonb_to_recordset(p_cart) AS requested("itemId" UUID, quantity INTEGER)
        ON requested."itemId" = items.id) THEN
    PERFORM public.fail_api_idempotency(p_user_id, 'store:checkout', p_idempotency_key, p_request_hash);
    RETURN jsonb_build_object('ok', false, 'code', 'item_not_found');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.store_items items
    JOIN jsonb_to_recordset(p_cart) AS requested("itemId" UUID, quantity INTEGER)
      ON requested."itemId" = items.id
    WHERE items.is_active IS DISTINCT FROM TRUE
  ) THEN
    PERFORM public.fail_api_idempotency(p_user_id, 'store:checkout', p_idempotency_key, p_request_hash);
    RETURN jsonb_build_object('ok', false, 'code', 'item_unavailable');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.store_items items
    JOIN jsonb_to_recordset(p_cart) AS requested("itemId" UUID, quantity INTEGER)
      ON requested."itemId" = items.id
    WHERE items.stock <> -1 AND items.stock < requested.quantity
  ) THEN
    PERFORM public.fail_api_idempotency(p_user_id, 'store:checkout', p_idempotency_key, p_request_hash);
    RETURN jsonb_build_object('ok', false, 'code', 'insufficient_stock');
  END IF;

  SELECT
    sum(items.points_cost * requested.quantity)::INTEGER,
    sum(requested.quantity)::INTEGER,
    count(*)::INTEGER,
    jsonb_agg(jsonb_build_object(
      'itemId', items.id,
      'name', items.name,
      'quantity', requested.quantity,
      'unitPoints', items.points_cost,
      'imageUrl', items.image_url,
      'description', items.description,
      'category', NULL
    ) ORDER BY items.id)
  INTO v_total_points, v_total_units, v_product_count, v_lines
  FROM public.store_items items
  JOIN jsonb_to_recordset(p_cart) AS requested("itemId" UUID, quantity INTEGER)
    ON requested."itemId" = items.id;

  IF v_total_points IS NULL OR v_total_points < 0 OR v_profile.points < v_total_points THEN
    PERFORM public.fail_api_idempotency(p_user_id, 'store:checkout', p_idempotency_key, p_request_hash);
    RETURN jsonb_build_object('ok', false, 'code', 'insufficient_points');
  END IF;

  INSERT INTO public.store_orders (item_id, user_id, points_spent, status)
  VALUES (((v_lines->0->>'itemId')::UUID), p_user_id, v_total_points, 'pending')
  RETURNING * INTO v_order;

  INSERT INTO private.store_order_lines (
    order_id, item_id, quantity, unit_points, name_snapshot, image_snapshot, description_snapshot
  )
  SELECT v_order.id, items.id, requested.quantity, items.points_cost,
         left(items.name, 240), items.image_url, items.description
  FROM public.store_items items
  JOIN jsonb_to_recordset(p_cart) AS requested("itemId" UUID, quantity INTEGER)
    ON requested."itemId" = items.id;

  UPDATE public.store_items items
  SET stock = CASE WHEN items.stock = -1 THEN -1 ELSE items.stock - requested.quantity END
  FROM jsonb_to_recordset(p_cart) AS requested("itemId" UUID, quantity INTEGER)
  WHERE items.id = requested."itemId";

  UPDATE public.users SET points = points - v_total_points WHERE id = p_user_id;
  INSERT INTO public.points_ledger (user_id, points_added, reason)
  VALUES (
    p_user_id,
    -v_total_points,
    'Store checkout (1 grouped order, ' || v_product_count ||
      CASE WHEN v_product_count = 1 THEN ' product)' ELSE ' products)' END
  );

  v_meta := jsonb_build_object(
    'quantity', v_total_units,
    'unitPoints', (v_lines->0->>'unitPoints')::INTEGER,
    'itemName', v_lines->0->>'name',
    'itemImageUrl', v_lines->0->'imageUrl',
    'itemDescription', v_lines->0->'description',
    'lineItems', v_lines,
    'buyerName', v_profile.name,
    'buyerEmail', v_profile.email,
    'buyerEmployeeId', v_profile.employee_id,
    'orderLabel', CASE
      WHEN v_total_units = 1 AND v_product_count = 1 THEN v_lines->0->>'name'
      ELSE v_total_units || CASE WHEN v_total_units = 1 THEN ' item across ' ELSE ' items across ' END ||
        v_product_count || CASE WHEN v_product_count = 1 THEN ' product' ELSE ' products' END
    END,
    'pickupMode', NULL,
    'pickupDate', NULL,
    'pickupTime', NULL,
    'pickupDeadline', NULL,
    'pickupNote', NULL,
    'denialReason', NULL,
    'hiddenFromModerators', FALSE,
    'moderatorArchivedAt', NULL,
    'statusHistory', jsonb_build_array(jsonb_build_object(
      'status', 'pending', 'at', v_order.created_at, 'note', 'Order submitted'
    ))
  );
  INSERT INTO public.app_settings (key, value, updated_at)
  VALUES ('store_order_meta_' || v_order.id::TEXT, v_meta, NOW())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

  INSERT INTO public.integration_outbox (event_type, aggregate_type, aggregate_id, payload)
  VALUES (
    'store.order_created', 'store_order', v_order.id::TEXT,
    jsonb_build_object(
      'orderId', v_order.id, 'userId', p_user_id, 'totalUnits', v_total_units,
      'productCount', v_product_count
    )
  ) ON CONFLICT (event_type, aggregate_type, aggregate_id) DO NOTHING;

  INSERT INTO public.integration_outbox (event_type, aggregate_type, aggregate_id, payload)
  SELECT
    'store.low_stock', 'store_item', v_order.id::TEXT || ':' || items.id::TEXT,
    jsonb_build_object('orderId', v_order.id, 'itemId', items.id)
  FROM public.store_items items
  JOIN jsonb_to_recordset(p_cart) AS requested("itemId" UUID, quantity INTEGER)
    ON requested."itemId" = items.id
  WHERE items.stock BETWEEN 0 AND 2
  ON CONFLICT (event_type, aggregate_type, aggregate_id) DO NOTHING;

  v_response := jsonb_build_object(
    'ok', TRUE,
    'data', jsonb_build_object(
      'success', TRUE, 'totalPoints', v_total_points, 'orderCount', 1, 'orderId', v_order.id
    )
  );
  PERFORM public.complete_api_idempotency(
    p_user_id, 'store:checkout', p_idempotency_key, p_request_hash, 200, v_response
  );
  RETURN v_response;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_store_order_transactional(
  p_user_id UUID,
  p_order_id UUID,
  p_idempotency_key TEXT,
  p_request_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_guard JSONB;
  v_order public.store_orders%ROWTYPE;
  v_response JSONB;
  v_user_is_approved BOOLEAN;
BEGIN
  v_guard := public.begin_api_idempotency(
    p_user_id, 'store:cancel', p_idempotency_key, p_request_hash, 86400
  );
  IF v_guard->>'state' = 'replay' THEN
    RETURN v_guard->'responseBody';
  ELSIF v_guard->>'state' <> 'acquired' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'idempotency_' || (v_guard->>'state'));
  END IF;

  SELECT * INTO v_order FROM public.store_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM public.fail_api_idempotency(p_user_id, 'store:cancel', p_idempotency_key, p_request_hash);
    RETURN jsonb_build_object('ok', false, 'code', 'order_not_found');
  END IF;
  IF v_order.user_id <> p_user_id THEN
    PERFORM public.fail_api_idempotency(p_user_id, 'store:cancel', p_idempotency_key, p_request_hash);
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  IF v_order.status::TEXT <> 'pending' THEN
    PERFORM public.fail_api_idempotency(p_user_id, 'store:cancel', p_idempotency_key, p_request_hash);
    RETURN jsonb_build_object('ok', false, 'code', 'not_pending');
  END IF;
  IF v_order.created_at < NOW() - INTERVAL '5 minutes' THEN
    PERFORM public.fail_api_idempotency(p_user_id, 'store:cancel', p_idempotency_key, p_request_hash);
    RETURN jsonb_build_object('ok', false, 'code', 'window_expired');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM private.store_order_lines WHERE order_id = p_order_id) THEN
    PERFORM public.fail_api_idempotency(p_user_id, 'store:cancel', p_idempotency_key, p_request_hash);
    RETURN jsonb_build_object('ok', false, 'code', 'lines_unavailable');
  END IF;

  SELECT is_approved INTO v_user_is_approved
  FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND OR v_user_is_approved IS DISTINCT FROM TRUE THEN
    PERFORM public.fail_api_idempotency(p_user_id, 'store:cancel', p_idempotency_key, p_request_hash);
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;

  PERFORM items.id
  FROM public.store_items items
  JOIN private.store_order_lines lines ON lines.item_id = items.id
  WHERE lines.order_id = p_order_id
  ORDER BY items.id
  FOR UPDATE;

  UPDATE public.store_items items
  SET stock = CASE WHEN items.stock = -1 THEN -1 ELSE items.stock + lines.quantity END
  FROM private.store_order_lines lines
  WHERE lines.order_id = p_order_id AND items.id = lines.item_id;
  UPDATE public.users SET points = points + v_order.points_spent WHERE id = p_user_id;
  UPDATE public.store_orders SET status = 'cancelled' WHERE id = p_order_id;
  INSERT INTO public.points_ledger (user_id, points_added, reason)
  VALUES (p_user_id, v_order.points_spent, 'Store order cancelled (' || p_order_id::TEXT || ')');

  UPDATE public.app_settings
  SET value = jsonb_set(
        COALESCE(value, '{}'::JSONB),
        '{statusHistory}',
        COALESCE(value->'statusHistory', '[]'::JSONB) || jsonb_build_array(jsonb_build_object(
          'status', 'cancelled', 'at', NOW(), 'note', 'Cancelled by employee'
        )),
        TRUE
      ),
      updated_at = NOW()
  WHERE key = 'store_order_meta_' || p_order_id::TEXT;

  INSERT INTO public.integration_outbox (event_type, aggregate_type, aggregate_id, payload)
  VALUES (
    'store.order_cancelled', 'store_order', p_order_id::TEXT,
    jsonb_build_object('orderId', p_order_id, 'userId', p_user_id, 'pointsRefunded', v_order.points_spent)
  ) ON CONFLICT (event_type, aggregate_type, aggregate_id) DO NOTHING;

  v_response := jsonb_build_object('ok', TRUE, 'data', jsonb_build_object('success', TRUE));
  PERFORM public.complete_api_idempotency(
    p_user_id, 'store:cancel', p_idempotency_key, p_request_hash, 200, v_response
  );
  RETURN v_response;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_platform_runtime_data(p_limit INTEGER DEFAULT 1000)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rate_deleted INTEGER := 0;
  v_idempotency_deleted INTEGER := 0;
  v_outbox_deleted INTEGER := 0;
BEGIN
  IF p_limit NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION 'invalid_cleanup_limit' USING ERRCODE = '22023';
  END IF;

  WITH doomed AS (
    SELECT ctid FROM public.api_rate_limit_buckets
    WHERE updated_at < NOW() - INTERVAL '2 days'
    LIMIT p_limit
  )
  DELETE FROM public.api_rate_limit_buckets target USING doomed
  WHERE target.ctid = doomed.ctid;
  GET DIAGNOSTICS v_rate_deleted = ROW_COUNT;

  WITH doomed AS (
    SELECT id FROM public.api_idempotency_keys WHERE expires_at < NOW() LIMIT p_limit
  )
  DELETE FROM public.api_idempotency_keys target USING doomed
  WHERE target.id = doomed.id;
  GET DIAGNOSTICS v_idempotency_deleted = ROW_COUNT;

  WITH doomed AS (
    SELECT id FROM public.integration_outbox
    WHERE state IN ('processed', 'dead') AND updated_at < NOW() - INTERVAL '30 days'
    LIMIT p_limit
  )
  DELETE FROM public.integration_outbox target USING doomed
  WHERE target.id = doomed.id;
  GET DIAGNOSTICS v_outbox_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'rateLimitBuckets', v_rate_deleted,
    'idempotencyKeys', v_idempotency_deleted,
    'outboxJobs', v_outbox_deleted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_api_rate_limit(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_ot_slot_transactional(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.unclaim_ot_slot_transactional(UUID, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_ot_claim_metadata(UUID, UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_ot_claim_metadata(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_ot_claim_metadata(UUID[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_integration_outbox_jobs(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_integration_outbox_job(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_integration_outbox_job(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.begin_api_idempotency(UUID, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_api_idempotency(UUID, TEXT, TEXT, TEXT, INTEGER, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_api_idempotency(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.checkout_store_order_transactional(UUID, JSONB, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_store_order_transactional(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_platform_runtime_data(INTEGER) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.consume_api_rate_limit(TEXT, TEXT, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_ot_slot_transactional(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.unclaim_ot_slot_transactional(UUID, UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_ot_claim_metadata(UUID, UUID, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_ot_claim_metadata(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_my_ot_claim_metadata(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_integration_outbox_jobs(TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_integration_outbox_job(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_integration_outbox_job(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.begin_api_idempotency(UUID, TEXT, TEXT, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_api_idempotency(UUID, TEXT, TEXT, TEXT, INTEGER, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_api_idempotency(UUID, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.checkout_store_order_transactional(UUID, JSONB, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_store_order_transactional(UUID, UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_platform_runtime_data(INTEGER) TO service_role;
