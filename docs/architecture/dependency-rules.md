# Reglas de dependencia

## Estructura física

```text
frontend/                    # presentación, estado y adaptadores de navegador
backend/                     # dominio, aplicación, infraestructura y plataforma servidor
database/                    # baseline, pruebas, desarrollo y archivo SQL
shared/                      # contratos y utilidades puras
src/app/                     # entrypoints obligatorios de Next.js
supabase/migrations/         # historia forward-only desplegable
```

`src/app` no es una cuarta capa de negocio. Next.js exige que páginas, layouts y
Route Handlers permanezcan allí; estos archivos actúan como composition roots y
delegan en frontend o backend.

## Dirección permitida

```text
src/app/page|layout  -> frontend -> shared
        |                  |
        +-------------> backend/domain|contracts

src/app/api|auth|proxy -> backend -> shared -> proveedores

supabase/migrations -> PostgreSQL/Supabase
database -> evidencia y pruebas, nunca runtime
```

## Reglas ejecutables

| ID | Regla | Gate |
|---|---|---|
| DEP-001 | Un Client Component no importa plataforma, aplicación o infraestructura backend ni built-ins de Node. | `dependency-boundaries.test.mjs` |
| DEP-002 | Backend no importa frontend ni entrypoints de `src/app`. | Test de arquitectura |
| DEP-003 | Shared no depende de frontend ni backend. | Test de arquitectura |
| DEP-004 | Route Handlers no importan frontend ni adaptadores de navegador. | Test de arquitectura |
| DEP-005 | Los aliases retirados no reaparecen. | Test de arquitectura |
| DEP-006 | Todo SQL vive en `database/` o en `supabase/migrations/`. | Test de arquitectura |
| DEP-007 | Toda ruta o método API nuevo mantiene OpenAPI e inventario sin drift. | `api-route-inventory.mjs` |
| DEP-008 | `SUPABASE_SERVICE_ROLE_KEY` pertenece exclusivamente al backend servidor. | Secret scan + test de frontera |

## Criterios de revisión

- `frontend/` contiene UI, hooks, estado, proveedores y adaptadores browser-only.
- `backend/modules/<capacidad>` usa `domain`, `contracts`, `application` e
  `infrastructure` sólo cuando existe una responsabilidad real.
- `backend/platform` contiene capacidades transversales de servidor y no UI.
- `shared/` sólo contiene hojas puras que ambos lados pueden consumir.
- `database/archive/` nunca se ejecuta; la única historia promovible está en
  `supabase/migrations/` por requisito de Supabase GitHub Integration.
- Los cambios de frontera requieren actualizar este documento, las pruebas y,
  cuando cambien una decisión duradera, un ADR.
