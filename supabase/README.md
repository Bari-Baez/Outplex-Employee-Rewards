# Supabase deployment adapter

Supabase GitHub integration and the CLI discover production migrations under
`supabase/migrations/`. This directory therefore contains only the deployable,
forward-only history and integration metadata.

Database lifecycle material is organized separately:

- `database/baseline/`: bootstrap and reconciliation evidence.
- `database/tests/`: QA-only RLS and concurrency contracts.
- `database/dev/`: local-development guidance.
- `database/archive/`: historical SQL that must not be executed.

Rules:

- `supabase/migrations/` is the only production migration source.
- Never copy archived SQL back into the deployable history without DBA review.
- Promotion order is migration validation, RLS/concurrency tests, backup/restore
  evidence, application deployment, reconciliation, and smoke tests.
