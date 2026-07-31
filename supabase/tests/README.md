# Supabase test contract

Este directorio define la suite que debe ejecutarse contra una instancia local/efímera o staging autorizado. No contiene resets ni afirma que producción pueda restaurarse.

## Casos P0

1. Usuario anónimo no lee tablas internas ni invoca mutaciones.
2. Employee solo lee/modifica recursos permitidos y propios.
3. Moderator accede únicamente a capacidades de su rol.
4. Admin autorizado completa operaciones privilegiadas.
5. Policies impiden cambiar rol, puntos, owner o estado mediante payload manipulable.
6. Dos reclamos OT concurrentes no adjudican el mismo slot.
7. Checkout concurrente no crea stock/saldo negativo ni doble cargo.
8. Storage rechaza tipo, tamaño, bucket o path no permitidos.
9. Migración forward y rollback de aplicación preservan invariantes.

## Harness ejecutable

`run-contracts.mjs` crea dos identidades sintéticas, verifica aislamiento RLS de tickets, rechazo de ownership falsificado y la carrera del índice único de role requests. Siempre intenta limpiar filas y usuarios creados.

Local Supabase:

```powershell
$env:SUPABASE_TEST_URL='http://127.0.0.1:54321'
$env:SUPABASE_TEST_ANON_KEY='<local anon key>'
$env:SUPABASE_TEST_SERVICE_ROLE_KEY='<local service role key>'
$env:SUPABASE_TEST_CONFIRM='RUN_DESTRUCTIVE_SUPABASE_TESTS'
node supabase/tests/run-contracts.mjs
```

Un proyecto remoto requiere además `SUPABASE_TEST_PROJECT_REF` coincidente y `SUPABASE_TEST_ALLOW_REMOTE=QA_REMOTE_ONLY`. El script rechaza un target igual a `NEXT_PUBLIC_SUPABASE_URL`. GitHub solo lo ejecuta manualmente bajo el environment protegido `qa-supabase`; no existe ejecución automática contra producción.

Evidencia requerida para cerrar el gate: URL/ref redactada, versión de migración, salida con conteos, timestamp y aprobación DBA/Backend.
