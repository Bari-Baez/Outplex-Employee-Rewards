# Outplex

Outplex is a Next.js 16 + Supabase platform for employee rewards, OT management, employee stores, announcements, forms and moderation workflows.

## Physical Architecture

```text
frontend/                     # browser UI, hooks, state and shared visual primitives
backend/                      # domain, application, infrastructure and server platform
database/                     # baseline, QA contracts, dev guidance and archived SQL
src/app/                      # thin Next.js routing and HTTP composition adapters
supabase/migrations/          # only deployable forward-only database history
tests/                        # architecture, contract, smoke, accessibility and E2E gates
```

Next.js requires `page.tsx`, `layout.tsx` and `route.ts` entrypoints under
`src/app`; those files compose `frontend/` and `backend/` but do not define a
fourth business layer. Supabase likewise requires deployable migrations under
`supabase/migrations`, while all other database lifecycle assets live under
`database/`.

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
- `database/archive/schema.sql` is legacy and must never be used as a production reset script.
- Use `docs/PRODUCTION_CHECKLIST.md` before every deployment.

## Supabase Structure

- `supabase/migrations/`: forward-only production SQL
- `database/baseline/`: production bootstrap guidance
- `database/tests/`: QA-only RLS and concurrency contracts
- `database/dev/`: demo/dev-only helpers
- `database/archive/`: non-executable historical SQL
- `supabase/README.md`: deployment-adapter rules

## Deployment Order

1. Configure environment variables.
2. Run `npm run verify:predeploy`.
3. Apply approved Supabase migrations.
4. Deploy the app.
5. Execute the smoke test from `docs/PRODUCTION_CHECKLIST.md`.
