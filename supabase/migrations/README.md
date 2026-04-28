# Incremental Migrations

Place every new forward-only production SQL change here.

Guidelines:

- Make migrations idempotent when practical.
- Prefer `IF EXISTS` / `IF NOT EXISTS` safeguards.
- Document query/index impact in the migration header.
- Never hide destructive rewrites behind ambiguous filenames.

Recommended next migration bundle:

1. Consolidate employee-store product statuses and moderation metadata.
2. Normalize role request states and review notes.
3. Add/verify indexes for dashboard, queues, notifications and orders.
4. Audit RLS for employee store, notifications, forms and file access.
