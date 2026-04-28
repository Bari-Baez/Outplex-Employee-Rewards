# Production Baseline

Use this folder for clean production bootstrap assets.

Current status:

- `../schema.sql` is legacy and destructive.
- Production deployments should not run `DROP TABLE` workflows.
- Before the first real production cut, generate a reviewed baseline from the live schema after applying the approved migrations.

Expected contents for a final production rollout:

1. `production_schema.sql`
2. `seed_reference_data.sql`
3. `rls_policies.sql`
4. `indexes.sql`
