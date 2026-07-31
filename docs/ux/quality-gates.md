# Gates UX

## Heurísticas obligatorias

- Estados loading, empty, error, success y permiso denegado explícitos.
- Acciones destructivas explican objeto e impacto y permiten cancelar.
- Teclado, foco visible, nombre accesible y orden lógico en diálogos/menus.
- Contraste, zoom y reflow móvil se verifican en vistas críticas.
- Validación explica cómo corregir; no depende solo de color.
- Mutaciones evitan doble envío y comunican progreso/resultado.
- La UI no se presenta como control de autorización; el servidor decide.

## Matriz mínima por cambio

| Cambio | Desktop | Mobile | Teclado/foco | Lectura de error | Estado lento/offline | Permisos |
|---|---:|---:|---:|---:|---:|---:|
| Flujo P0 nuevo | Sí | Sí | Sí | Sí | Sí | Sí |
| Diálogo/formulario | Sí | Sí | Sí | Sí | Sí | Si aplica |
| Tabla/datos densos | Sí | Sí | Sí | Sí | Sí | Si aplica |
| Ajuste visual aislado | Sí | Si afecta | Si afecta | N/A | N/A | N/A |

La evidencia puede ser test automatizado, captura/video de staging o checklist de QA enlazado al PR. La aprobación visual no sustituye pruebas de accesibilidad o autorización.
