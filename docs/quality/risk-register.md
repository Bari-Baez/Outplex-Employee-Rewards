# Registro de riesgos

Escala: probabilidad e impacto de 1 (bajo) a 5 (crítico). Prioridad = P × I. El owner es un rol responsable, no una afirmación de asignación personal.

| ID | Riesgo | P | I | Prioridad | Estado | Owner | Evidencia para cerrar | Gate |
|---|---|---:|---:|---:|---|---|---|---|
| R-01 | Uso de `service_role` permite elevar privilegios si falta authz. | 3 | 5 | 15 | Abierto | Backend/Security | Inventario de usos + tests por rol/ownership. | Bloquea release si una ruta privilegiada nueva no tiene test. |
| R-02 | Políticas RLS divergen entre SQL y entorno desplegado. | 3 | 5 | 15 | Abierto | DBA/Backend | Resultado de tests RLS en staging y diff aprobado. | Bloquea migración productiva. |
| R-03 | Mutaciones cookie-auth quedan expuestas a CSRF. | 2 | 4 | 8 | Mitigación automatizada | Backend/Security | Helper same-origin y smoke cross-site verdes; ampliar matriz autenticada. | Bloquea exposición si una mutación evade el control. |
| R-04 | Rutas demo/dev se habilitan por configuración incorrecta. | 2 | 5 | 10 | Mitigación parcial | Operations | Variables de producción redactadas + smoke negativo. | Bloquea deploy si flags no son `false`. |
| R-05 | Secreto se confirma en Git, bundle o log. | 5 | 5 | 25 | Confirmado; bloqueante | Security/Operations | Scanner histórico verde en clon limpio + rotación/revocación documentada y revisión de logs. | SEC-00/SEC-01 bloquean promoción. |
| R-06 | Upload/OCR/importación permite DoS, XSS o SSRF. | 2 | 4 | 8 | Mitigación automatizada parcial | Backend/Security | Negativos de tamaño/MIME/firma/host/timeout y verificación controlada en staging. | Bloquea feature externa sin límites verificados. |
| R-07 | Token OAuth queda expuesto o no se rota/revoca. | 2 | 5 | 10 | Abierto | Backend/Operations | Prueba de almacenamiento, revocación y redacción. | Bloquea integración productiva. |
| R-08 | Vulnerabilidad conocida reaparece en dependencias de producción. | 2 | 4 | 8 | Controlado | Engineering | `npm audit --omit=dev` con 0 vulnerabilidades y smoke ExcelJS. | Baseline cero bloqueante en CI. |
| R-09 | OpenAPI no representa todas las rutas/métodos reales. | 1 | 3 | 3 | Controlado | API Owner/QA | Drift cero bajo contrato e inventario `--strict-openapi`. | Cualquier drift nuevo falla CI. |
| R-10 | Backup/restore de producción no está verificado. | 3 | 5 | 15 | Pendiente externo | Operations/DBA | Restore aislado, RTO/RPO medidos y acta. | Bloquea go-live. |
| R-11 | Alertas, headers o rate limits existen solo como supuesto. | 3 | 4 | 12 | Pendiente externo | Operations/Security | Configuración exportada y pruebas HTTP/alerta en staging. | Bloquea go-live según checklist. |
| R-12 | Tooling conserva 10 advisories high y 1 low en 11 paquetes, sin hallazgos productivos. | 2 | 3 | 6 | Baseline exacta; pendiente de decisión | Engineering/Security | Upgrade compatible o excepción temporal aprobada con expiración. | Audit completo bloquea regresiones; supply chain no está completa. |

## Cadencia

- Revisar en cada release y tras incidentes/cambios de proveedor.
- Riesgos ≥ 12 requieren aceptación explícita del owner o evidencia de mitigación antes de producción.
- La aceptación incluye fecha de expiración; no convierte una suposición en control.
