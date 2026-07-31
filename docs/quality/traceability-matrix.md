# Matriz de trazabilidad

| Req. | Capacidad / riesgo | Evidencia de código/contrato | Prueba o gate | Nivel | Owner | Estado |
|---|---|---|---|---|---|---|
| Q-01 | Frontera cliente/servidor | `src/lib/supabase/*`, Client Components | `dependency-boundaries.test.mjs` | P0 | Backend | Automatizado |
| Q-02 | Contrato de rutas | `src/app/api/**/route.ts`, `docs/openapi.yaml` | `openapi-contract.test.mjs` + inventario estricto | P1 | API/QA | Automatizado; cero drift |
| Q-03 | Compatibilidad Excel | `exceljs` y exportadores | `exceljs-roundtrip.test.mjs` | P1 | Backend/QA | Automatizado |
| Q-04 | Supply chain | `package-lock.json` | audit productivo cero + tooling exacto + SBOM | P0 | Engineering/Security | Automatizado; deuda tooling explícita |
| Q-05 | Calidad estática | `src/**/*.ts(x)` | typecheck + lint baseline | P1 | Engineering | Automatizado; deuda decreciente |
| F-00 | Política modular de soporte | `src/modules/support/domain/ticket-policy.ts` | `support-ticket-policy.test.mjs` | P1 | Support Owner/QA | Automatizado |
| F-01 | Login/logout y dominio permitido | auth callback y sesión | E2E approved/denied/new + logout | P0 | Backend/QA | Pendiente staging |
| F-02 | Onboarding y roles | rutas `/api/onboarding` y `/api/user` | integración por rol + aprobación/rechazo/revoke | P0 | Backend/QA | Parcial; concurrencia en harness |
| F-03 | Tienda y puntos | RPCs checkout/cancel, outbox y clientes con clave estable | tests de contrato/idempotencia + harness de concurrencia | P0 | Store Owner/QA | Implementado local; QA/staging pendiente |
| F-04 | OT | RPCs claim/unclaim y metadata privada tipada | tests de frontera + concurrencia/RLS en QA | P0 | OT Owner/QA | Implementado local; QA/staging pendiente |
| F-05 | Formularios/import/export | rutas `/api/forms` y `/api/google` | validación, permisos, límites y round-trip | P1 | Forms Owner/QA | Parcial |
| F-06 | Comunicaciones/notificaciones | rutas `/api/communications`, `/api/notifications`, Slack | authz, sanitización, mute/dismiss y proveedor simulado | P1 | Comms Owner/QA | Pendiente |
| F-07 | Upload/OCR/media | `/api/upload`, `/api/ocr`, `/api/media/proxy` | `security-negative.test.mjs` + E2E metadata target | P0 | Backend/Security | Negativos automatizados; staging pendiente |
| S-00 | CSRF, redirect y cuerpos HTTP | `src/proxy.ts`, `src/platform/http/*` | unitarias negativas + E2E cross-site | P0 | Backend/Security | Automatizado |
| S-01 | RLS y service role | SQL Supabase + `createServiceClient` | `supabase/tests/run-contracts.mjs` | P0 | DBA/Backend | Harness protegido listo; ejecución pendiente |
| S-02 | Secretos en árbol e historial | tracked files + Git history | scanners actual e histórico | P0 | Security/Repository Owner | Árbol verde; historial bloqueado |
| X-01 | Shell público y accesibilidad | login, not-found y headers | Playwright + axe en Chromium | P1 | Frontend/QA | 6 smokes automatizados; visual pendiente |
| O-01 | Restore y continuidad | proveedor Supabase | ensayo restore con RTO/RPO | P0 | Operations/DBA | Pendiente externo, bloqueante |
| O-02 | Headers/rate limit/alertas | CSP report, rate limits, instrumentation y proveedor | prueba HTTP y alerta sintética | P0 | Operations/Security | Instrumentado local; evidencia externa pendiente |

Todo “pendiente” necesita issue o evidencia antes de considerarse cubierto. Esta matriz no afirma que una prueba manual haya ocurrido.
