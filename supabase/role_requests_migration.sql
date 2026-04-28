-- =====================================================
-- Role Requests Migration v2
-- Ejecutar en Supabase SQL Editor (actualización)
-- =====================================================

-- Paso 1: Agregar columna notes si no existe
ALTER TABLE public.role_requests
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Paso 2: Agregar el status 'reviewing' al CHECK constraint
-- Primero eliminamos el constraint viejo y lo recreamos con el nuevo valor
ALTER TABLE public.role_requests
DROP CONSTRAINT IF EXISTS role_requests_status_check;

ALTER TABLE public.role_requests
ADD CONSTRAINT role_requests_status_check
CHECK (status IN ('pending', 'reviewing', 'approved', 'rejected'));

-- Paso 3: El índice único solo bloquea 'pending', permitir 'reviewing' simultáneo
DROP INDEX IF EXISTS role_requests_user_pending_idx;

CREATE UNIQUE INDEX IF NOT EXISTS role_requests_user_active_idx
  ON public.role_requests (user_id)
  WHERE status IN ('pending', 'reviewing');

-- Paso 4: Refrescar el schema cache de PostgREST
NOTIFY pgrst, 'reload schema';
