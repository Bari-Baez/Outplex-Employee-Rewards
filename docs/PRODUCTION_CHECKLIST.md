# Production Checklist

## App Validation

1. Run `npm run verify:predeploy`.
2. Confirm login with an approved user, a denied user and a brand-new unapproved user.
3. Confirm employee onboarding, role request approval/rejection and revoke flows.
4. Confirm store moderation, product suspension and re-review flows.

## Environment

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- `ALLOWED_EMAIL_DOMAINS`
- `SLACK_CLIENT_ID`
- `SLACK_CLIENT_SECRET`
- `SLACK_BOT_TOKEN`
- `SLACK_USER_TOKEN`
- `SLACK_OT_CHANNEL_ID`
- `SLACK_EMPLOYEE_ID_FIELD_ID`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `MS_GRAPH_TENANT_ID`
- `MS_GRAPH_CLIENT_ID`
- `MS_GRAPH_CLIENT_SECRET`
- `MS_GRAPH_SITE_ID`
- `MS_GRAPH_DRIVE_ID`
- `MS_GRAPH_ITEM_ID`

## Demo / Dev Guards

- Keep `ALLOW_PUBLIC_DEMO_BOOTSTRAP=false` in production.
- Keep `ALLOW_PUBLIC_DEMO_PROMOTE=false` in production.
- Set `DEV_BOOTSTRAP_TOKEN` and `DEV_PROMOTE_TOKEN` only for controlled non-prod environments.

## Supabase Rollout

1. Review `supabase/README.md`.
2. Apply approved SQL from `supabase/migrations/`.
3. Validate RLS and indexes in staging.
4. Promote only after app smoke tests pass.

## Post-Deploy Smoke Test

1. Login and logout.
2. Approve a pending employee.
3. Submit and review a role request.
4. Create, suspend and re-review an employee-store product.
5. Publish a moderator announcement.
6. Verify notifications render and can be dismissed.
