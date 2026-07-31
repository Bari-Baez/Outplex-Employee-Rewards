# Performance Ops Notes

## Shared cache windows

- `mandatory forms`: `45s`
- `tool/section availability + maintenance banner`: `45s`
- `dashboard raffle summary`: `45s`
- `top-nav shared live snapshot`: `30s`
- `store catalog + public employee stores + store review summary`: `60s`

These reads are cached with `next/cache` read-model helpers under `backend/modules/*/application`.

## SWR client deduplication

Global SWR config lives in `frontend/shared/providers/SWRProvider.tsx`.

- `dedupingInterval`: `15s`
- `focusThrottleInterval`: `10s`
- `revalidateOnFocus`: enabled
- `revalidateOnReconnect`: enabled
- retries on error: disabled

## User-scoped routes that should stay dynamic

Do not put shared edge caching in front of these routes because they contain user-scoped data:

- `/api/dashboard/shell`
- `/api/store/client-data`
- cart, checkout, favorites, notifications, support tickets
- OT claims / OT mutations
- raffle mutations / moderator actions

## Shared reads that are safe to cache

- store catalog
- store review summary
- public employee stores
- forms published for everyone
- availability / maintenance state
- dashboard raffle/live snapshot

## Supabase / Vercel runtime notes

- `backend/platform/supabase/server-fetch.ts` uses HTTP keep-alive agents to reduce connection churn per lambda/container.
- If the project uses direct Postgres URLs outside `supabase-js`, point Vercel serverless traffic to the `Supavisor` pooled connection string, not the direct session connection.
- Keep auth/user-scoped traffic on `supabase-js` unless there is a measured hotspot that justifies a server-side pooled SQL client.

## Invalidation guidance

When adding new mutations, revalidate or refetch the smallest surface that changed:

- store favorites or review mutations: revalidate `/api/store/client-data`
- shell-affecting writes (notifications/tickets): revalidate `/api/dashboard/shell`
- store catalog/admin inventory writes: invalidate `store-catalog:v1`
- raffle/admin live changes: invalidate `dashboard-raffles:v1` and `shell-live-snapshot:v1`

If tag-based invalidation is added later, keep the current cache keys aligned with the same functional boundaries.
