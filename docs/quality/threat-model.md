# Threat model

## Método y alcance

Modelo STRIDE para navegador, aplicación Next.js, Supabase, proveedores OAuth y cadena CI/CD. Es un modelo preventivo basado en evidencia del repositorio; no certifica controles externos no observables.

## Activos

- Identidad, sesión, roles, employee IDs y perfiles.
- Puntos, inventario, órdenes, reclamos OT, formularios y contenido interno.
- Tokens OAuth, `SUPABASE_SERVICE_ROLE_KEY` y credenciales de proveedores.
- Archivos importados/exportados y datos de reportes.
- Integridad de migraciones, artefactos de build y despliegues.

## Amenazas y controles

| ID | STRIDE | Escenario | Control requerido | Evidencia/gate |
|---|---|---|---|---|
| TM-01 | Spoofing | Sesión o callback OAuth falsificado. | Callback con state, sesión Supabase, allowlist de dominio y validación server-side. | Pruebas de auth en staging; revisión de callback. |
| TM-02 | Tampering | Usuario modifica rol, puntos, orden o estado OT llamando API directamente. | Autorización por acción, RLS, validación runtime y service role mínimo. | Matriz API/rol + tests de RLS pendientes. |
| TM-03 | Repudiation | Acción administrativa sin rastro suficiente. | Eventos auditables con actor, acción, recurso y correlation ID, sin secretos. | Evidencia de logs/retención externa pendiente. |
| TM-04 | Information disclosure | Secreto llega al bundle/log o dato por usuario se comparte en caché. | Frontera cliente/servidor, secret scan, redacción y `private/no-store` donde aplique. | Architecture test, secret scan y revisión de caché. |
| TM-05 | Denial of service | Upload, OCR, Excel, imports o endpoints costosos agotan recursos. | Límites de tamaño/tiempo, rate limiting y procesamiento acotado. | Pruebas negativas y configuración edge pendientes. |
| TM-06 | Elevation of privilege | Ruta usa `service_role` sin comprobar rol/ownership. | Autorización previa centralizada y revisión de todo uso privilegiado. | Gate de revisión; inventario de rutas. |
| TM-07 | Tampering / disclosure | Archivo activo o URL externa maliciosa provoca XSS/SSRF. | Allowlist de tipo/protocolo/host, tamaño, storage fuera de webroot y descarga segura. | Tests de upload/media proxy pendientes. |
| TM-08 | Spoofing / tampering | CSRF contra mutaciones autenticadas por cookie. | Token u Origin/Referer estricto + SameSite; nunca confiar solo en UI. | Test de mutaciones cross-origin pendiente. |
| TM-09 | Supply chain | Paquete o script de instalación comprometido. | Lockfile, `npm ci`, audit limpio/baseline cero y smoke de ExcelJS. | CI + `tests/smoke/exceljs-roundtrip.test.mjs`. |
| TM-10 | Tampering | Contrato API queda desalineado de implementación. | Inventario generado y gate de drift en cada PR. | `scripts/api-route-inventory.mjs`. |

## Casos de abuso prioritarios

1. Empleado invoca una ruta moderadora sin pasar por la UI.
2. Atacante envía una mutación desde otro origen usando cookies existentes.
3. Entrada de Google Forms/media induce fetch a host privado o contenido activo.
4. Un Client Component importa accidentalmente el cliente privilegiado de Supabase.
5. Archivo masivo causa memoria/CPU excesiva durante OCR o exportación.
6. Operador despliega sin confirmar migraciones, RLS o posibilidad de rollback.

## Criterio de cierre

Una amenaza solo se marca mitigada cuando hay evidencia reproducible: test automatizado, configuración exportada o captura/registro de staging. “Configurado en producción” sin evidencia y owner no cierra el riesgo.
