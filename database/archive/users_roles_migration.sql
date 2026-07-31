-- =====================================================
-- Users Roles Enhancement Migration
-- Ejecutar en Supabase SQL Editor
-- =====================================================

-- 1. Agregar rol 'staff' al enum user_role
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'staff'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
  ) THEN
    ALTER TYPE user_role ADD VALUE 'staff';
  END IF;
END $$;

-- 2. Agregar columna role_revoked_at para rastrear revocaciones de rol
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS role_revoked_at TIMESTAMPTZ DEFAULT NULL;

-- 3. Asegurar que is_approved existe (por si acaso)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT false;

-- 4. RLS: moderator_a1 también puede actualizar usuarios (excepto admins — protegido en app layer)
DROP POLICY IF EXISTS "admins_update_any" ON public.users;
CREATE POLICY "admins_update_any" ON public.users
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users AS actor
      WHERE actor.id = auth.uid()
        AND actor.role IN ('admin', 'moderator_a1')
    )
  );

-- 5. RLS: solo admin puede eliminar usuarios
DROP POLICY IF EXISTS "admin_delete_any" ON public.users;
CREATE POLICY "admin_delete_any" ON public.users
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.users AS actor
      WHERE actor.id = auth.uid()
        AND actor.role = 'admin'
    )
  );
