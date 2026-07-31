# Registro de retiro de legado

Fecha de revisión: 2026-07-31.

La eliminación requiere búsqueda estática sin consumidores, reemplazo identificado y recuperación conocida. El historial Git es el mecanismo de rollback hasta que el release sea estable.

| Elemento retirado | Evidencia de no uso | Reemplazo mantenible | Rollback |
|---|---|---|---|
| `outplex_diagrams.html` | Sin referencias en código, scripts o documentación. Cargaba CDN sin SRI y generaba HTML dinámico. | `docs/architecture/c2-context.md` y ADR versionados. | Recuperar el archivo desde el commit anterior. |
| `public/docs/index.html` | Sin enlaces ni rutas consumidoras; era un bundle Swagger estático de aproximadamente 449 KB. | `docs/openapi.yaml`, validado en CI. | Regenerar desde OpenAPI aprobado, no restaurar una copia divergente. |
| `database_migration_employee_stores.sql` | Sus columnas existen en `supabase/migrations/2026-04-26_production_consolidation.sql` y scripts SQL posteriores. | Historia forward-only de `supabase/migrations`. | Recuperar solo para análisis; no ejecutar fuera de la historia aprobada. |
| `check_status.js` y `debug_b1.js` | Sin invocaciones, imports ni scripts de paquete. Usaban `service_role` para consultas manuales. | Consultas auditables en un entorno Supabase autorizado. | Recuperar desde Git únicamente en una rama aislada. |
| `reset_b1.js` y `reset_db.js` | Sin invocaciones; ejecutaban borrados/actualizaciones privilegiadas sin confirmación ni control de entorno. | Seed/reset de entorno efímero bajo `scripts/` y migraciones aprobadas. | No restaurar en producción; recuperar desde Git solo para forense. |
| Assets plantilla `file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg` | Búsqueda estática sin consumidores. | Activos oficiales de Outplex conservados en `public/`. | Recuperar desde Git. |

No se retiraron librerías o componentes funcionales basándose solo en tamaño. La telemetría y el canary siguen siendo necesarios antes de retirar rutas o fallbacks utilizados por producción.
