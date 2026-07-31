# Database

This directory owns database lifecycle artifacts that are not executed automatically by the Supabase deployment integration.

```text
database/
  baseline/   # production bootstrap evidence and reconciliation guidance
  tests/      # destructive QA-only RLS and concurrency contracts
  dev/        # local-development notes and helpers
  archive/    # historical SQL; never executed as a migration
```

The only deployable, forward-only migration history remains in
`supabase/migrations/`. Supabase requires that path for GitHub Preview Branches,
so it is intentionally kept as the database deployment adapter rather than
duplicated here.

Rules:

- Never execute files in `archive/` against an environment.
- Create every production schema change under `supabase/migrations/`.
- Run `npm run test:supabase` only against an isolated QA project with the
  explicit destructive-test confirmation variables.
- Reconcile production schema history before promoting a new migration.
