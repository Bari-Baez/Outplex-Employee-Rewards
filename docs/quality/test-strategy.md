# Estrategia de pruebas

## Objetivos

Detectar regresiones temprano, proteger límites cliente/servidor y comprobar los flujos de mayor impacto antes de producción. Las pruebas siguen la pirámide: muchas pruebas puras/contrato, menos integraciones reales y un conjunto pequeño de E2E críticos.

## Capas

| Capa | Alcance | Ejecución | Estado actual |
|---|---|---|---|
| Estática | TypeScript, ESLint, imports prohibidos y secretos. | Cada PR. | Automatizada. |
| Smoke de librería | Compatibilidad binaria/serialización de ExcelJS. | Cada PR. | Automatizada en memoria. |
| Unitarias/negativas | Soporte, capacidades, CSRF, redirect, SSRF, uploads y cuerpos HTTP. | Cada PR. | Automatizadas; cobertura de dominios a ampliar. |
| Contrato | Rutas implementadas vs inventario/OpenAPI. | Cada PR. | Gate estricto automatizado: cero drift. |
| Integración | Supabase QA: auth, RLS, concurrencia, storage y proveedores simulados. | PR sensible y pre-release. | Harness protegido listo; ejecución autorizada pendiente. |
| E2E | Shell público, accesibilidad y smokes negativos HTTP; progresivamente flujos autenticados. | Cada PR para smoke; staging para flujos de negocio. | 6 smokes Chromium automatizados; cobertura autenticada a ampliar. |
| Operacional | Build, migración, health, logs, alertas y restore. | Pre/post deploy. | Acciones externas con gate. |

## Datos y entornos

- Usar datos sintéticos sin PII ni tokens reales.
- Separar identidades employee, supervisor/moderator y admin.
- Las pruebas destructivas se ejecutan solo en proyecto efímero/local o QA autorizado.
- Cada integración externa usa mocks para PR y una prueba controlada en staging.
- Nunca ejecutar reset, restore o migración contra producción desde la suite automática.

## Criterios de PR

1. Secret scan, typecheck, lint baseline y reglas de arquitectura verdes.
2. Inventario API regenerado si cambian rutas y OpenAPI estricto en cero drift.
3. `npm test` y `npm run test:e2e` verdes.
4. Build productivo verde.
5. Audit productivo en cero y audit completo dentro de su conjunto exacto de tooling.
6. SBOM CycloneDX generado y validado.

## Criterios de release

- Todos los criterios de PR.
- Flujos E2E P0/P1 autenticados ejecutados en staging.
- Migraciones y RLS validadas con evidencia.
- SEC-00/SEC-01 y gates externos aprobados.
- Rollback de aplicación definido; restore de datos probado por Operations/DBA, no simulado.

## Política de flakes

Un test flaky es un defecto: se asigna owner y fecha. Puede aislarse temporalmente solo con issue, evidencia y gate alterno; no se reintenta indefinidamente para ocultar fallos.
