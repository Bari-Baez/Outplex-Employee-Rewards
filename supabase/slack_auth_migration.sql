-- =====================================================
-- Slack Auth Migration
-- Ejecutar en Supabase SQL Editor
-- =====================================================

-- 1. Agregar columna is_approved si no existe
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT false;

-- Aprobar usuarios ya existentes con rol admin o moderador automáticamente
UPDATE public.users
  SET is_approved = true
  WHERE role IN ('admin', 'moderator', 'moderator_a1', 'moderator_b1')
    AND is_approved = false;

-- 2. Actualizar el enum user_role para incluir moderator_a1 y moderator_b1
-- (Supabase no permite ALTER TYPE ADD VALUE dentro de una transacción,
--  ejecuta cada línea por separado si falla)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'moderator_a1'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
  ) THEN
    ALTER TYPE user_role ADD VALUE 'moderator_a1';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'moderator_b1'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
  ) THEN
    ALTER TYPE user_role ADD VALUE 'moderator_b1';
  END IF;
END $$;

-- 3. RLS policy para que admins puedan actualizar cualquier usuario
DROP POLICY IF EXISTS "admins_update_any" ON public.users;
CREATE POLICY "admins_update_any" ON public.users
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND role = 'admin'
    )
  );
