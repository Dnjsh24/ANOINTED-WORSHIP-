# Website Operations Runbook

This runbook covers the Next.js website and its Supabase backend. It does not cover the Electron desktop application.

Vercel is the only supported website deployment target. The former Render
manifest has been removed so production preflight and rollback behavior cannot
silently diverge between providers.

## Release gates

Before deploying, use Node 22 and run these commands sequentially:

```bash
npm ci
npm run security:secrets
npm audit --omit=dev --audit-level=high
npm run lint:website
npm run typecheck
npm run test:website
npm run test:coverage:website
npm run build
E2E_FORCE_DEMO=1 npm run test:e2e -- --reporter=line
```

The `prebuild` hook automatically runs the production environment preflight
when Vercel sets `VERCEL_ENV=production`. To verify an injected production
environment manually, run:

```bash
npm run check:production-env
```

The check prints only variable names and validation reasons; it never prints
their values.

Start local Supabase, apply all migrations from an empty database, and run its linter:

```bash
npx supabase start
npx supabase db reset
npm run lint:database:website
npm run test:supabase:website
```

Do not deploy while any command fails. Visual regression remains a manual review until an approved screenshot baseline is committed.

## Required production configuration

- `NEXT_PUBLIC_SITE_URL`: canonical HTTPS origin used for auth redirects.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: public Supabase connection.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only key for authenticated maintenance jobs.
- `CRON_SECRET`: long random bearer secret shared only with the cron caller.
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`: shared serverless rate-limit store.
- Spotify and VAPID pairs from `.env.example` only when their features are enabled.

Never expose `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, the Upstash token, or the VAPID private key through `NEXT_PUBLIC_*` variables.

## Deployment and migration

1. Create a database backup or verify the latest Supabase point-in-time recovery checkpoint.
2. Apply forward migrations to a non-production branch or local database first.
3. Run the RLS policy matrix with two users in different teams.
4. Deploy the website from a reviewed commit.
5. Run `npm run smoke:production -- --base-url https://your-production-origin.example`. It checks readiness, security headers, login protection, the service worker, and the manifest without mutating data.
6. Production is ready only when the smoke command passes and `/api/health` returns `200`, `status: "ok"`, and `dependencies.supabase: "reachable"`.
7. Exercise authenticated login, team selection, setlists, messages, uploads, cron authorization rejection, offline shell, and reconnect.
8. Review Supabase security advisors after every schema change.

### Worship Remote release order

The secure internet Worship Remote is additive and does not require a new
environment variable or paid service. Release it in this order:

1. Apply `supabase/migrations/20260802040000_secure_worship_remote_pairing.sql`
   in the Supabase SQL editor. Copy only the SQL file contents—do not include
   any Markdown triple-backtick code-fence lines.
2. Deploy the backward-compatible website release.
3. Build and distribute the updated Windows desktop application.
4. Open Presenter on the PC, choose **Pair Phone**, and verify both QR and
   six-digit PIN pairing from a signed-in same-team phone.
5. Test once over the same Wi-Fi and once with the phone on mobile data.

The migration keeps legacy remote topics temporarily so older installed
desktop builds continue to work. Remove those compatibility policies only in a
later migration after the updated desktop release is broadly installed.

## Rollback

Application rollback:

1. Roll back to the last known-good saved deployment.
2. Verify `/api/health`, login, and one read-only team page.
3. Keep the database at the newest compatible schema. Prefer a corrective forward migration over destructive down migrations.

Database recovery:

1. Stop write traffic when data integrity is uncertain.
2. Record the incident time, affected team IDs, migration version, and deployment commit.
3. Restore to a new Supabase project or recovery branch first; never overwrite production during diagnosis.
4. Validate row counts, foreign keys, RLS, grants, and critical user journeys.
5. Switch production only after owner approval and a documented recovery point.

## Incident checks

- `503 /api/health`: verify Supabase availability and public environment variables.
- Repeated `401` on cron routes: verify the bearer value and `CRON_SECRET`; never bypass authentication.
- Rate-limit fallback logs: verify both Upstash variables and service health. Local fallback is for development and short outages, not normal production.
- Stale PWA UI: close all tabs, reopen the app, and inspect the active service-worker version. Authenticated HTML is intentionally not stored in Cache API.
- Permission or blank-data reports: inspect active team membership and RLS before using service-role access.

Logs must not contain authorization headers, cookies, service keys, message bodies, private lyrics, or uploaded-file contents.

## Production monitoring and ownership

`.github/workflows/production-website-monitor.yml` runs the read-only production
smoke check every 15 minutes and can also be started manually. On the first
failure it opens one GitHub issue, assigns repository owner `Dnjsh24`, and links
the failed workflow run. Repeated failures reuse the open incident; recovery
adds a timestamped comment and closes it.

The repository owner is the first responder. Acknowledgement target is 30
minutes, and the restore-or-rollback target for a confirmed user-facing outage
is two hours. GitHub Actions notification delivery must remain enabled for the
repository owner. The monitor becomes active only after its workflow exists on
the default branch.

The monitor is deliberately read-only. It never signs in, runs a cron job,
writes Supabase data, changes a deployment, or includes credentials in its issue
body. Use the authenticated release checklist after every deployment because a
public synthetic check cannot prove team-scoped workflows.
