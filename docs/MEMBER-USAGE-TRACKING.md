# Member usage tracking (T03)

Team Management now shows realtime Online only for active members present in the team's presence channel. Otherwise it shows relative last-seen time from usage heartbeats, or “Last seen unavailable” when no recorded history exists. Team Management and Analytics include owner/admin-only usage rankings, approximate hours, sessions, days used, and expandable daily UTC dates and minutes.

## Measurement and privacy

An active minute is one distinct UTC minute containing a successful heartbeat from a visible browser window with input within the last 60 seconds. The initial foreground visit is eligible once; later heartbeats require recent trusted pointer, touch, keyboard, or scrolling input. Heartbeats are attempted at most once per 60 seconds. Hidden, idle, and offline windows are excluded. Approximate hours are recorded minutes divided by 60. Short visits may count one minute, and reading without interaction is not measured. These figures are activity estimates, not exact elapsed time or attendance.

The database uses its own clock, serializes each member's requests with a row lock, and credits each minute only once across tabs and devices. It does not fill gaps between heartbeats. At least five minutes without recorded activity starts a new session. Dates use UTC, including the daily detail view. Tracking starts after deployment; historical usage is not inferred. Data stores daily counts and the current last-seen/accounting cursor, not browsing paths or individual input events. Member deletion cascades to their usage rows.

The only write interface is `record_member_usage(p_team_id uuid)`. It derives the caller from `auth.uid()` and requires active membership in that team. Clients cannot submit a member ID, timestamp, duration, or counter. A qualified security-definer function with an empty search path performs the update. Anonymous execution is revoked. Authenticated direct INSERT, UPDATE, and DELETE are denied. SELECT is restricted to the same team's active owner/admin using the existing `private.has_team_role` helper. Ordinary members, including custom roles that can manage members, cannot read these activity analytics.

## Deployment and recovery

No remote database has been changed. Obtain explicit operator authorization before applying `supabase/migrations/20261005010000_member_usage_tracking.sql` through the normal migration deployment process. Deploy this additive migration before, or with, the application. It adds two tables, indexes, two SELECT policies, and one RPC. The additional team/member unique index supports composite foreign keys that prohibit mismatched team references. No existing data is rewritten. There is no historical backfill and no new environment variable.

Database TypeScript entries are aligned manually to this migration because the local Supabase Docker environment is unavailable. Regenerate with the existing `npm run supabase:types` command after applying migrations to a local Supabase instance, and review the resulting diff before committing it. Do not generate types by mutating a remote database.

The application remains usable before migration deployment: the tracker stops calls when the RPC is missing, analytics explains that the migration is unavailable, and unrecorded last-seen data is shown as unavailable. On connection errors, users can retry analytics without seeing a false zero-hours report.

If the feature must be withdrawn, roll back application code first and leave the additive schema in place. For forward recovery, revoke the RPC's authenticated EXECUTE grant to stop new collection, repair with a new append-only migration, and restore EXECUTE afterward. Do not drop collected data without separate authorization. Table growth is one row per member/date with activity plus one current state row per member. Queries are scoped by indexed team/date and paginate rather than silently truncating at the PostgREST default row limit. Date selection is capped at 366 inclusive days. Retention beyond member deletion is not automated by this change.

## Verification

The focused test command is:

```powershell
node node_modules/vitest/vitest.mjs run --config vitest.website.config.ts src/lib/domain/member-usage.test.ts src/components/member-usage-tracker.test.tsx src/components/member-usage-analytics.test.tsx src/components/members-client.usage.test.tsx src/lib/supabase/member-usage.test.ts
```

The PostgreSQL harness applies the actual migration and the repository's actual authorization helper to an isolated in-memory PostgreSQL instance. It does not create a network client or connect to a service. PGlite is a temporary verification dependency and is not an application dependency. To reproduce without modifying the repository package manifest:

```powershell
npm install --prefix "$env:TEMP/anointed-usage-postgres" --no-save --package-lock=false @electric-sql/pglite
node scripts/test-member-usage-postgres.mjs "$env:TEMP/anointed-usage-postgres/node_modules/@electric-sql/pglite/dist/index.js"
```

This checks real SQL accounting, repeated-minute deduplication, no gap credit, the five-minute session threshold, server UTC dates, allowed owner/admin reads, denied anonymous/ordinary/inactive/two-tenant access, denied direct INSERT/UPDATE/DELETE, composite foreign keys, and deletion cascades. The fixture contains only the team-members table and auth-role interface needed by this migration; it does not represent a full Supabase deployment.

The Docker daemon was unavailable during implementation. Full local Supabase migration/deployment compatibility, actual concurrent database connections, production build, and real browser/mobile tests remain coordinator/operator checks. Independent Juan and Laura reviews remain required before the engineering ticket is marked Done.
