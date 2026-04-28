# Outplex

Outplex is a Next.js 16 + Supabase platform for employee rewards, OT management, employee stores, announcements, forms and moderation workflows.

## Core Commands

```bash
npm run dev
npm run lint:src
npm run typecheck
npm run build
npm run verify:predeploy
```

## Environment Setup

1. Copy `.env.example` to `.env.local`.
2. Fill Supabase, Slack, Google and optional Microsoft Graph values.
3. Set `ALLOWED_EMAIL_DOMAINS` explicitly per environment.
4. Keep demo/dev flags disabled in production.

## Production Notes

- Production auth defaults are strict. If `ALLOWED_EMAIL_DOMAINS` is not set, production falls back to `outplex.com`.
- Public demo bootstrap/promote routes should stay disabled in production.
- `supabase/schema.sql` is legacy and should not be used as a production reset script.
- Use `docs/PRODUCTION_CHECKLIST.md` before every deployment.

## Supabase Structure

- `supabase/baseline/`: production bootstrap guidance
- `supabase/migrations/`: forward-only production SQL
- `supabase/dev/`: demo/dev-only helpers
- `supabase/README.md`: rollout rules and migration inventory

## Deployment Order

1. Configure environment variables.
2. Run `npm run verify:predeploy`.
3. Apply approved Supabase migrations.
4. Deploy the app.
5. Execute the smoke test from `docs/PRODUCTION_CHECKLIST.md`.
