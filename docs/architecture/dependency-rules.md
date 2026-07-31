# Reglas de dependencia

## Objetivo

Mantener Outplex como monolito modular: un despliegue y una base de código, con dependencias dirigidas y límites de seguridad verificables.

## Dirección permitida

```text
presentación (app/components/hooks)
        ↓
aplicación (Route Handlers y orquestación)
        ↓
dominio / casos de uso (lib por capacidad)
        ↓
adaptadores (supabase, slack, google, archivos)
        ↓
sistemas externos
```

Los tipos y utilidades puras pueden ser consumidos por capas superiores. Una capa inferior no importa UI para completar su trabajo.

## Reglas ejecutables

| ID | Regla | Gate |
|---|---|---|
| DEP-001 | Un archivo con `use client` no importa módulos Supabase de servidor, `*-server`, `platform`, infraestructura de módulos, read models ni built-ins de Node. | `tests/architecture/dependency-boundaries.test.mjs` |
| DEP-002 | Los módulos de servidor/datos, `platform` e infraestructura no importan `app`, `components` ni `hooks`. | Test de arquitectura |
| DEP-003 | Un Route Handler no importa componentes ni hooks de navegador. | Test de arquitectura |
| DEP-004 | Toda ruta o método API nuevo actualiza el inventario generado; no puede añadir drift OpenAPI fuera de la baseline explícita. | `scripts/api-route-inventory.mjs` |
| DEP-005 | Los secretos permanecen en servidor; `NEXT_PUBLIC_*` se considera público. | Secret scan + revisión |
| DEP-006 | Dominio/contratos no dependen de application/infrastructure; application no depende de infrastructure. | Test de arquitectura |
| DEP-007 | `platform` contiene primitivas compartidas y no depende de módulos de producto ni UI. | Test de arquitectura |

## Reglas de diseño revisadas por PR

- Organizar nuevas capacidades bajo un nombre de dominio estable; evitar un `utils` genérico como punto de acoplamiento.
- Mantener validación y autorización cerca de la entrada del caso de uso, no solo en la UI.
- El acceso con `createServiceClient` debe estar precedido por una decisión de autorización auditable.
- No reutilizar respuestas o cachés entre usuarios salvo que el dato esté clasificado como público/compartido.
- Los adaptadores externos traducen errores y aplican timeouts/allowlists; el dominio no depende de SDKs de UI.
- Los cambios de límites requieren actualizar esta página y, si cambian una decisión, crear un ADR.

## Evolución

El test inicial protege violaciones de alto impacto sin exigir una reestructuración masiva. Cuando un módulo se extraiga a una carpeta de dominio propia, se agrega primero una regla que describa la dirección deseada y después se mueve el código en cambios pequeños.
