# Sistema de calidad

## Secuencia local de gates

```powershell
npm ci
npm run quality:secrets
npm run typecheck
npm run lint:src
npm test
node scripts/api-route-inventory.mjs --strict-openapi
npm run build
npm run test:e2e
npm run quality:audit
npm run quality:audit:tooling
npm run quality:sbom
```

GitHub ejecuta la secuencia aplicable por etapas desde `.github/workflows/quality-gates.yml`; CodeQL, el scanner histórico y los contratos Supabase protegidos tienen workflows dedicados.

El avance real y los bloqueos externos se mantienen en `implementation-status.md`; una fase parcial no equivale a un gate aprobado.

## Baselines

- `eslint-warning-baseline.json`: deuda heredada por regla. Solo se reduce; una regla nueva tiene allowance cero.
- `openapi-drift-baseline.json`: debe permanecer vacío. Una operación nueva entra en OpenAPI, nunca en una allowance nueva.
- `npm-audit-baseline.json`: cero vulnerabilidades de producción en todas las severidades.
- `tooling-audit-baseline.json`: conjunto exacto y severidad máxima de advisories exclusivos del árbol completo; cualquier paquete, severidad o cantidad nueva falla.

Cuando cambian Route Handlers, actualizar `docs/openapi.yaml` y ejecutar `node scripts/api-route-inventory.mjs --write`. `--strict-openapi` es un gate activo y debe permanecer en cero drift.

El scanner del árbol actual se ejecuta en cada PR. El scanner del historial completo es bloqueante hasta que sus hallazgos se roten y saneen; sus salidas siempre están redactadas.

## Documentos de decisión y riesgo

- Arquitectura: `docs/architecture/c2-context.md` y `dependency-rules.md`.
- Decisión: `docs/adr/0001-modular-monolith.md`.
- Seguridad: `threat-model.md` y `risk-register.md`.
- Verificación: `test-strategy.md` y `traceability-matrix.md`.
- Evidencia del corte: `gates-0-8-evidence.md` e `implementation-status.md`.
- Producción externa: `docs/operations/external-production-gates.md`.
