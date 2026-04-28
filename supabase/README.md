# Supabase Deployment Layout

This directory now has a production-oriented contract:

- `baseline/`: production bootstrap references and non-destructive guidance.
- `migrations/`: incremental SQL that can be applied to existing environments.
- `dev/`: demo/dev-only SQL and operational notes.
- root `*.sql`: legacy migrations kept for compatibility while rollout is in progress.

Rules:

- Do not use `schema.sql` as a production reset script.
- Treat `schema.sql` as a legacy local bootstrap artifact only.
- New production SQL should go into `migrations/`.
- Demo-only helpers and unsafe reset workflows should go into `dev/`.
- Production rollout should always be: baseline review, migrations, policy/index verification, smoke tests.

Current migration files that should be reviewed for production promotion:

- `users_roles_migration.sql`
- `role_requests_migration.sql`
- `employee_store_migration.sql`
- `employee_store_ratings_and_first_publish_migration.sql`
- `employee_store_upgrade_finance_and_pickup_migration.sql`
- `notifications_announcements_v2_migration.sql`
- `forms_migration.sql`
- `forms_upgrade_migration.sql`
- `forms_performance_migration.sql`
- `files_migration.sql`
- `raffles_store_performance_migration.sql`
- `google_oauth_migration.sql`
- `google_forms_import_migration.sql`
- `slack_auth_migration.sql`
- `production_readiness.sql`
