-- MASTER PRODUCTION READINESS MIGRATION
-- Run this in your Supabase SQL Editor

-- 1. Enum Expansions
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('employee', 'staff', 'moderator_a1', 'moderator_b1', 'admin');
    ELSE
        ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'staff';
        ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'moderator_a1';
        ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'moderator_b1';
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'employee_store_status') THEN
        CREATE TYPE employee_store_status AS ENUM ('active', 'paused', 'closed', 'suspended');
    ELSE
        ALTER TYPE employee_store_status ADD VALUE IF NOT EXISTS 'suspended';
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'employee_store_order_status') THEN
        CREATE TYPE employee_store_order_status AS ENUM ('pending', 'ready_for_pickup', 'completed', 'cancelled');
    ELSE
        ALTER TYPE employee_store_order_status ADD VALUE IF NOT EXISTS 'completed';
    END IF;
END $$;

-- 2. New Tables for Production Features
CREATE TABLE IF NOT EXISTS public.employee_store_order_items (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  order_id uuid NOT NULL REFERENCES public.employee_store_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.employee_store_products(id) ON DELETE SET NULL,
  name_snapshot text NOT NULL,
  image_snapshot text,
  unit_price_dop integer NOT NULL CHECK (unit_price_dop >= 0),
  quantity integer NOT NULL CHECK (quantity > 0),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT employee_store_order_items_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES public.users(id),
  event_type text NOT NULL,
  description text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT activity_logs_pkey PRIMARY KEY (id)
);

-- 3. Column Consolidation
ALTER TABLE public.employee_stores ADD COLUMN IF NOT EXISTS is_open boolean NOT NULL DEFAULT true;
ALTER TABLE public.employee_stores ADD COLUMN IF NOT EXISTS operating_hours jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.employee_stores ADD COLUMN IF NOT EXISTS suspend_reason text;

ALTER TABLE public.employee_store_products ADD COLUMN IF NOT EXISTS cost_dop integer NOT NULL DEFAULT 0;
ALTER TABLE public.employee_store_products ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false;
ALTER TABLE public.employee_store_products ADD COLUMN IF NOT EXISTS suspend_reason text;

ALTER TABLE public.employee_store_orders ADD COLUMN IF NOT EXISTS pickup_deadline timestamp with time zone;

-- 4. Audit Indexing
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON public.activity_logs(created_at);
