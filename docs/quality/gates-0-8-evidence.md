# Matriz de cumplimiento de gates 0–8

Fecha de corte: 2026-07-31. Resultados obtenidos en el checkout local; no sustituyen evidencia del proveedor, staging o producción.

| Gate | Veredicto | Evidencia reproducible | Condición que falta |
|---|---|---|---|
| 0 — Secretos | **FAIL / bloqueante** | `npm run quality:secrets` pasa sobre archivos tracked. `npm run quality:history` falla con 8 hallazgos redactados: 3 JWT `service_role` y 5 asignaciones sensibles que requieren triage. | Rotación/revocación, investigación, saneamiento coordinado y clon limpio verde. |
| 1 — Baseline | **PARCIAL** | `api-route-inventory.mjs --strict-openapi`: 114 rutas, 149 operaciones, 0 gaps y 0 operaciones stale. Arquitectura, ADR, amenazas, riesgos y trazabilidad versionados. | Snapshots/export/diff/restore/golden masters de entornos autorizados. |
| 2 — Seguridad | **PARCIAL** | Pruebas negativas cubren capacidades, escalación de usuario, CSRF, redirects, SSRF, allowlist del proxy, uploads y cuerpos. La migración revoca mutaciones directas de `users`. Audit de producción: 0 critical/high/moderate/low. | Ejecutar RLS real, revisar policies con DBA, verificar CSP/rate limit en staging y resolver/aceptar temporalmente los advisories de tooling. |
| 3 — Integridad | **IMPLEMENTADA; ejecución externa pendiente** | OT y checkout/cancelación usan RPCs transaccionales con locking ordenado, idempotencia persistente y outbox. 21/21 pruebas locales pasan y el harness Supabase está protegido contra producción. | Aplicar la migración en QA autorizado, ejecutar concurrencia real de 20 solicitudes y reconciliar snapshot de datos. |
| 4 — Plataforma/CI | **PASS en repositorio** | `npm ci`, predeploy, TypeScript, ESLint 0 errores/71 warnings, 25/25 tests, build Next.js 16.2.12, OpenAPI estricto, 6/6 Playwright, CodeQL, dependency review, audits y SBOM. | Branch protection y ejecución verde del proveedor son controles externos. |
| 5 — Modularización | **PARCIAL** | `support`, `ot` y `store` tienen contratos/casos de uso/repositorios reales; las reglas de arquitectura impiden acoplamientos inversos. | Equivalencia/canary y extracción incremental de los dominios restantes. |
| 6 — UX/a11y | **PARCIAL** | `npm run test:e2e`: 6/6 Chromium, incluyendo 2 pruebas de accesibilidad/shell y 4 smokes HTTP/seguridad. | Golden masters, roles/viewports adicionales y aprobación de producto. |
| 7 — Operación | **PARCIAL local / FAIL externo** | `instrumentation.ts`, logs redactados, correlation IDs, CSP reporting, mantenimiento acotado y outbox con worker protegido. Owners y runbook están versionados. | No hay evidencia de SLI/SLO medidos, restore, alertas, degradación, canary ni rollback en proveedor. |
| 8 — Limpieza | **PARCIAL** | Se retiraron scripts con secretos, documentación Swagger generada, SVGs plantilla, HTML de diagramas, SQL raíz duplicado y dependencias sin consumidores; hay registro de evidencia y rollback. SBOM: 662 componentes. | Bundle analysis, telemetría de uso y retiro adicional sólo tras observar consumidores reales. |

## Ejecución local registrada

```powershell
npm run typecheck
npm run lint:src
npm test
node scripts/api-route-inventory.mjs --strict-openapi
npm run build
npm run test:e2e
npm run quality:audit
npm run quality:audit:tooling
npm run quality:secrets
npm run quality:sbom -- --output artifacts/qa-sbom.cdx.json
npm run quality:history -- --report artifacts/history-secret-report.local.json
```

El último comando debe permanecer rojo hasta que SEC-00 y SEC-01 se cierren con evidencia; su reporte no contiene valores de secretos.

## Gates deliberadamente no ejecutados

- `npm run test:supabase`: no se proporcionó un proyecto QA autorizado ni sus credenciales efímeras.
- Rotación/revocación, reescritura del historial, restore, migraciones, canary y despliegues: requieren autoridad y coordinación externas.
- Branch protection, alertas y SLI/SLO: requieren configuración/evidencia del proveedor.
