# Backend runtime controls

## Promotion order

1. Validate the forward-only migration against a disposable clone of the target schema.
2. Apply `supabase/migrations/2026-07-31_integrity_platform_primitives.sql` in staging.
3. Confirm the new private metadata table, RPC grants, indexes, and RLS state with the queries below.
4. Deploy the application only after the migration succeeds. The OT adapters fail closed with `503` while the RPCs are absent.
5. Exercise claim/unclaim concurrency, CSP ingestion, upload/OCR limits, media proxy policy, and the maintenance job in staging.

The repository migration history is not an empty-database bootstrap: its consolidated migration does not create core tables such as `users` and `ot_slots`. This migration intentionally depends on those deployed baseline tables. Do not claim empty-database reproducibility until a schema bootstrap has been generated and tested separately.

## Staging verification

```sql
select schemaname, tablename, rowsecurity
from pg_tables
where (schemaname, tablename) in (
  ('private', 'ot_claim_metadata'),
  ('public', 'api_rate_limit_buckets'),
  ('public', 'api_idempotency_keys'),
  ('public', 'integration_outbox')
);

select routine_schema, routine_name
from information_schema.routines
where routine_name in (
  'claim_ot_slot_transactional',
  'unclaim_ot_slot_transactional',
  'consume_api_rate_limit',
  'begin_api_idempotency',
  'claim_integration_outbox_jobs',
  'cleanup_platform_runtime_data'
)
order by routine_name;
```

Run two concurrent claims by the same approved user for different slots on the same date. Exactly one must succeed. Confirm its `ot_slots` row and `private.ot_claim_metadata` row agree. Unclaim within and beyond 20 minutes to verify that the database clock, not the application clock, enforces the window.

## Runtime behavior

- Distributed rate limiting uses `consume_api_rate_limit`. Before promotion, a bounded per-process fallback protects a single instance only; it is not a production distributed limit.
- Media proxy requests require an approved session, are limited per user, cap bodies at 10 MiB, use private browser caching, and restrict every redirect hop to `MEDIA_PROXY_ALLOWED_HOSTS` plus the built-in image/Supabase hosts.
- Media retrieval resolves every allowlisted hostname, rejects the target if any DNS answer is non-public, and connects directly to one validated address while preserving the original HTTP `Host` and TLS SNI. Each redirect is resolved and validated again before a new connection is opened.
- CSP reports are capped at 32 KiB and globally rate-limited. Logs retain only directive, disposition, and status code. The active CSP keeps its current compatibility directives and sends `report-uri /api/observability/csp-report`.
- `POST /api/moderator/maintenance/cleanup-logs` now performs only bounded runtime-data cleanup. It accepts an approved admin session or `Authorization: Bearer $CRON_SECRET`; it no longer deletes business orders, raffles, or requests.
- Outbox claiming uses `FOR UPDATE SKIP LOCKED`, stale-lock recovery, capped exponential retry, and a terminal dead state. Register handlers explicitly in the worker; unknown event types fail with a stable code and never log payloads.

## External gates

- Rotate every credential that appeared in source or Git history and invalidate the old value at the provider.
- Rewrite and independently verify Git history before treating the repository as secret-clean.
- Validate this migration, RLS/grants, query plans, and concurrency on a disposable staging clone.
- Configure `CRON_SECRET`, `MEDIA_PROXY_ALLOWED_HOSTS`, provider credentials, and the platform scheduler outside the repository.
- Configure log-based alerts and retention for request failures, CSP violations, outbox dead jobs, and repeated rate-limit fallback events.
- Perform backup/restore evidence, staging smoke tests, and rollback rehearsal. This migration is forward-only; rollback is a new compensating migration plus application rollback, never a remote down migration from this change.
- Validate CSP and media behavior in real browsers. Local tests establish address pinning behavior; staging must still confirm provider compatibility, TLS/SNI handling, and network behavior in the deployed runtime.
