# Estado de la modernización segura

Fecha de corte: 2026-07-31. Este documento separa la evidencia verificable en el repositorio de los gates que requieren datos, proveedores o aprobación humana. Ningún elemento pendiente se considera aprobado por existir en esta lista.

| Fase | Estado de este corte | Evidencia | Pendiente bloqueante |
|---|---|---|---|
| 0. Secretos | **Bloqueada** | El scanner del árbol actual pasa. El scanner histórico produce solo hallazgos redactados y detecta 8 adiciones sensibles, incluidas 3 JWT `service_role`. | Rotar/revocar las credenciales expuestas, investigar uso, sanear el historial coordinadamente y validar mediante clon limpio. |
| 1. Baseline | **Parcial** | Contexto C2, ADR, threat model, riesgos, trazabilidad e inventario estricto de 114 rutas/149 operaciones, sin drift OpenAPI. | Export de producción, diff de esquema/RLS, dataset anonimizado, restore y golden masters por rol/resolución. |
| 2. Seguridad | **Parcial** | Capacidades, revocación de mutaciones directas de `users`, CSRF, redirect, SSRF/allowlist, uploads/OCR, rate limits y cuerpos acotados; auditoría productiva en cero. | Ejecutar matriz RLS aislada, revisar policies reales, validar controles distribuidos/CSP y resolver o aceptar con expiración los advisories de tooling. |
| 3. Integridad | **Implementada; ejecución externa pendiente** | OT y store usan RPCs atómicas, locking ordenado, idempotencia persistente y outbox; tests estáticos verifican el contrato cliente/servidor. | Aplicar en QA autorizado, ejecutar 20 solicitudes concurrentes y reconciliar puntos, stock, órdenes, claims y outbox con datos representativos. |
| 4. Plataforma/CI | **Automatizada en repositorio** | `npm ci`, predeploy, typecheck, lint, 21 tests, OpenAPI estricto, build, 6 Playwright, audits, SBOM, dependency review y CodeQL. | Hacer obligatorios los checks mediante branch protection y conservar artefactos/evidencia en el proveedor CI. |
| 5. Modularización | **Tres cortes reales** | `support`, `ot` y `store` contienen contratos, casos de uso y repositorios; adapters HTTP delgados y pruebas de arquitectura mantienen límites. | Canary/equivalencia y extracción incremental de comunicaciones, formularios, marketplace, breaks, raffles, identidad y administración. |
| 6. UX/a11y | **Parcial** | 6/6 pruebas Chromium pasan localmente: dos de shell público/accesibilidad y cuatro smokes de seguridad/HTTP. | Baseline visual aprobado, paridad por viewport/rol y aceptación del Product Owner. |
| 7. Operación | **Parcial local; bloqueada externamente** | Instrumentación, logs redactados, request IDs, CSP reporting, outbox, mantenimiento acotado y runbook operativo están versionados. | Alertas verificadas, SLI/SLO medidos, restore, degradación, smoke post-deploy y rollback ensayado. |
| 8. Limpieza | **Parcial** | Dependencias y artefactos sin consumidores fueron retirados con registro; auditorías, SBOM y compatibilidad ExcelJS están verificadas. | Telemetría de uso, bundle analysis y retiro adicional sólo con evidencia y rollback. |

## Regla de promoción

Los gates ejecutables de repositorio están verdes salvo el scanner histórico, que falla de forma deliberadamente bloqueante por hallazgos reales. Este corte no debe promoverse a producción hasta cerrar SEC-00/SEC-01 y los gates externos aplicables. No se ejecutó ninguna migración, rotación, reescritura de historial, restore, canary ni despliegue remoto desde esta implementación.

La matriz detallada y los comandos reproducibles están en `gates-0-8-evidence.md`.
