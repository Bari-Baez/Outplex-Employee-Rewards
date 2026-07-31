# Outplex — contexto C2

Estado: vigente para la modernización iniciada el 2026-07-31.

## Alcance

Outplex es un hub interno para recompensas, horas extra, tiendas de empleados, anuncios, formularios, sorteos, soporte y moderación. El límite del sistema incluye la aplicación Next.js y su código de acceso a datos; la identidad, persistencia, almacenamiento y proveedores de colaboración son sistemas externos.

```mermaid
flowchart LR
  employee["Empleado\nUsa beneficios, OT, tienda, formularios y soporte"]
  moderator["Moderador o administrador\nAprueba acceso y opera flujos privilegiados"]
  operator["IT / Operaciones\nConfigura, despliega y responde a incidentes"]

  subgraph outplex["Sistema Outplex"]
    web["Aplicación web Next.js 16\nUI, Route Handlers y monolito modular"]
  end

  supabase["Supabase\nAuth, PostgreSQL, RLS y Storage"]
  slack["Slack\nOIDC, perfiles y notificaciones"]
  google["Google APIs\nOAuth, Forms, Drive y Sheets"]
  graph["Microsoft Graph\nSincronización opcional configurada por entorno"]
  vercel["Vercel / plataforma de ejecución\nBuild, edge y runtime"]

  employee -->|"HTTPS / sesión"| web
  moderator -->|"HTTPS / sesión y roles"| web
  operator -->|"CI/CD y configuración"| vercel
  vercel -->|"Ejecuta"| web
  web -->|"Auth y datos con políticas"| supabase
  web -->|"OAuth y API"| slack
  web -->|"OAuth y API"| google
  web -.->|"Integración opcional; verificar antes de habilitar"| graph
```

## Contenedores lógicos

Aunque el despliegue es uno, se distinguen cuatro responsabilidades internas:

1. **Presentación:** `src/app`, `src/components` y `src/hooks`.
2. **Aplicación/API:** Route Handlers en `src/app/api` y controles de disponibilidad/autorización.
3. **Dominio y lecturas:** módulos funcionales en `src/lib`, incluidos formularios, OT, sorteos, tienda y comunicaciones.
4. **Adaptadores:** Supabase, Slack, Google y transferencias de archivos.

La división es lógica, no una afirmación de aislamiento físico. Las reglas ejecutables están en [dependency-rules.md](dependency-rules.md).

## Límites de confianza

- Navegador → aplicación: todo parámetro, cuerpo, archivo, URL y estado del navegador es no confiable.
- Aplicación → Supabase: el `service_role` evade RLS; su uso requiere autorización explícita en servidor.
- Aplicación → proveedores OAuth: tokens y callbacks son secretos o entradas no confiables según la dirección.
- CI/CD → producción: secretos, migraciones y despliegues son acciones externas con evidencia obligatoria.
- Datos compartidos → caché: contenido por usuario no debe entrar en cachés compartidas.

## Evidencia y límites

Este diagrama se deriva de `README.md`, `.env.example`, `src/app/api`, `src/lib` y `docs/performance-ops.md`. No confirma configuración activa de Vercel, backups, alertas, rotación de secretos ni restauración de Supabase; esos puntos permanecen como gates externos.
