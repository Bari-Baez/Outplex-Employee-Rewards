# Gates externos de producción

Estas acciones no se implementan ni se simulan desde el repositorio. Requieren acceso autorizado al proveedor y evidencia revisable.

| Gate | Acción externa | Owner | Evidencia mínima | Resultado de gate |
|---|---|---|---|---|
| OPS-01 | Verificar backups, retención, RPO/RTO y ejecutar restore en entorno aislado. | Operations + DBA | ID/fecha del backup, log del restore, checks de integridad y RTO/RPO medidos. | Bloquea go-live hasta aprobado. |
| OPS-02 | Confirmar variables y flags de producción sin revelar valores. | Operations + Security | Lista de nombres, estado set/unset, `ALLOW_PUBLIC_DEMO_*=false` y revisión de dos personas. | Bloquea deploy. |
| SEC-00 | Rotar/revocar la `service_role` y la contraseña retiradas del árbol actual; revisar logs y sesiones relacionadas. | Security + Systems Owner | ID de rotación, fecha, sistemas afectados, revisión de accesos y prueba posterior; nunca el secreto. | Bloquea cualquier promoción. |
| SEC-01 | Sanear el historial Git en una ventana coordinada: respaldo bare, pausa de colaboradores, reescritura, force-push autorizado y clon limpio verificado. | Repository Owner + Security | Acta de coordinación, referencias antiguas revocadas y scanner de historial verde; nunca el secreto. | Bloquea SEC-0. |
| OPS-03 | Rotar/revocar credenciales ante sospecha o cambio de personal. | Security + Systems Owner | ID de rotación, fecha, sistemas afectados y prueba posterior; nunca el secreto. | Bloquea integración afectada. |
| OPS-04 | Validar RLS e índices en staging contra migraciones aprobadas. | DBA + Backend | Diff, resultado de suite RLS, plan de rollback y aprobación. | Bloquea promoción SQL. |
| OPS-05 | Verificar CSP/headers, rate limits y tamaño máximo en URL de staging. | Security + Operations | Salida HTTP redactada y casos positivos/negativos. | Bloquea exposición pública. |
| OPS-06 | Configurar alertas de errores, latencia, auth y operaciones críticas. | Operations | Regla exportada/captura + alerta sintética recibida y acknowledged. | Bloquea go-live. |
| OPS-07 | Ejecutar smoke post-deploy y confirmar rollback de aplicación. | Release Manager + QA | Build/commit, resultados por paso, timestamps y decisión go/no-go. | Rollback si falla P0. |

## Registro de evidencia

Cada release debe enlazar la evidencia desde el ticket/change record. No guardar tokens, cookies, dumps de entorno o PII en Git. Si un gate no aplica, el owner documenta motivo, alcance y fecha de revisión; omitirlo silenciosamente no es aprobación.
