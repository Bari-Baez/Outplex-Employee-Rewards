# ADR-0001: Mantener un monolito modular

- Estado: aceptado
- Fecha: 2026-07-31
- Decisores: Engineering, QA y Operaciones

## Contexto

Outplex contiene múltiples capacidades de negocio en una aplicación Next.js con Supabase y proveedores externos. La base actual comparte autenticación, tipos, despliegue y datos. Separar servicios ahora añadiría coordinación distribuida, observabilidad, contratos y operación sin evidencia de que el escalado lo requiera. No establecer límites, en cambio, aumenta el riesgo de acoplar UI, rutas, privilegios y persistencia.

## Decisión

Conservar un único artefacto desplegable y establecer módulos lógicos por capacidad. La dirección de dependencia será presentación → aplicación → dominio → adaptadores. Las fronteras críticas cliente/servidor y API/UI se validan en CI; el inventario API hace visible el contrato real y su deuda OpenAPI.

La persistencia continúa compartida, pero cada cambio SQL de producción es forward-only, revisado y promovido con evidencia. RLS y autorización de servidor son controles complementarios, no intercambiables.

## Consecuencias

### Positivas

- Despliegue, debugging y transacciones siguen siendo simples.
- Se puede modularizar incrementalmente sin migración distribuida.
- Los límites de seguridad se convierten en pruebas, no solo convenciones.

### Costos

- El aislamiento entre dominios es lógico y requiere disciplina.
- Una regresión puede afectar el único despliegue.
- OpenAPI y pruebas necesitan mantenerse junto con las rutas.

## Alternativas descartadas

- **Microservicios inmediatos:** costo operativo y contractual mayor que la evidencia actual.
- **Monolito sin fronteras:** menor costo inicial, pero no controla imports, privilegios ni ownership.
- **Reescritura total:** concentra riesgo y retrasa valor sin validar primero los límites.

## Señales para reconsiderar

Revisar esta decisión si existe evidencia sostenida de escalado independiente, ownership de equipos realmente separado, requerimientos de aislamiento regulatorio o fallos de disponibilidad causados por el despliegue conjunto.
