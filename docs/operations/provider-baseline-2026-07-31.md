# Provider baseline — 2026-07-31

This is read-only evidence gathered before any release. It contains no tokens, cookies, environment values, or user data.

## Supabase

- Project: `Outplex-OT` (`pdebyqbtmnqpvepvrmiw`), region `us-east-2`, PostgreSQL 17.
- Provider status at inspection time: `INACTIVE`.
- The configured application URL matched this project reference.
- Table, migration, policy, advisor, backup, restore, and RLS verification could not be completed because database connections timed out while the project was inactive.
- The project was not resumed: resuming can change external state and cost and requires the service owner's authorization.

Consequently, no database gate is green from provider evidence. The forward-only migration and `npm run test:supabase` must run first against an authorized disposable clone or QA project, never directly against this inactive production project.

## Vercel

- Project: `outplex-employee-rewards`.
- Latest production deployment inspected: `dpl_Cz6kaNMFdvxogdkgzzUYsyMbG2uL`, state `READY`, Git commit `427253b`.
- Active canonical alias: `https://outplexemplyeerewards.vercel.app` (the existing spelling is part of the current contract).
- `https://outplex-employee-rewards.vercel.app` returned `404` and is not the production alias.
- Runtime inspection found no recorded errors in the previous seven days and four `200` responses in the previous 24 hours. This sample is too small to establish SLOs or functional equivalence.

Unauthenticated smoke against the active alias:

| Request | Result |
|---|---:|
| `GET /login` | `200` |
| `GET /api/dashboard/shell` | `401` |
| `GET /api/store/client-data` | `401` |
| `GET /api/dev/demo` | `401` |
| `GET /api/media/proxy?url=http://127.0.0.1/latest/meta-data` | `400` on the deployed baseline |

The inspected production deployment predates the changes in this modernization branch. It is useful as a baseline only; it is not evidence that the new migration, RLS, checkout, OT, outbox, CSP, accessibility, or observability controls work in production.

## Required next evidence

1. Security owner closes credential rotation and Git history remediation.
2. DBA validates schema diff and the migration on a disposable production-like clone.
3. QA runs RLS/concurrency, authenticated journeys, visual baselines, and reconciliation.
4. Release owner deploys by canary and records error-rate/p95 abort thresholds.
5. Operations exercises alerting, backup/restore, degradation, and rollback within approved RTO/RPO.
