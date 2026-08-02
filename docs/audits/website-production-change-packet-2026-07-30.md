# Website Production Change Packet

**Target:** Supabase project `ANOINTED WORSHIP 2` and the linked Vercel website

**Scope:** Website only. Electron/desktop deployment is excluded.

**Execution status:** The user approved the original three named migrations plus generated cron and existing VAPID variables. Those changes were completed and verified on 2026-07-30. The three 2026-08-02 migrations, remaining environment values, GitHub push/monitor activation, and redeployment are a new production mutation set and still require explicit approval.

## Execution record

| Change | Production receipt/status |
|---|---|
| `harden_website_boundaries` | Applied as `20260730063024` |
| `fix_website_remote_pairing_digest` | Applied as `20260730063102` |
| `add_profile_birthday` | Applied as `20260730063114` |
| `CRON_SECRET` | Added to Vercel Production as sensitive; securely rotated to a 32-byte CSPRNG value |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Added to Vercel Production from the existing local pair |
| `VAPID_PRIVATE_KEY` | Added to Vercel Production as sensitive from the existing local pair |

Production catalog verification passed for every expected invariant below. Supabase security advisors now report two remaining warnings: the intentional authenticated remote-pairing `SECURITY DEFINER` RPC and disabled leaked-password protection.

## Change set

Apply these migrations in order:

| Order | Migration | SHA-256 |
|---|---|---|
| 1 | `20260729000002_harden_website_boundaries.sql` | `6E846BD1D3D1B38F4D3076C52E92CB8D0F3A9606D29270CA9CE591BFC52B4044` |
| 2 | `20260730000000_fix_website_remote_pairing_digest.sql` | `80654910BA52E2FE872F6AE255FB738F46B91D1524920947036E3F5FAA2DC604` |
| 3 | `20260730010000_add_profile_birthday.sql` | `34581328814115DC8B8093AD40FFBEB4FF898E0533803211BCD048CB6315309E` |

The first migration:

- Grants authenticated CRUD privileges on `setlist_templates`, then enforces team/role RLS.
- Scopes presentation-media writes to the active team and authenticated user's folder.
- Creates an atomic, service-role-only scheduled-message delivery RPC.
- Removes broad avatar listing.
- Changes unread-count execution to security-invoker with caller identity checks.

The second migration pins the remote-pairing claim RPC search path and resolves `digest` from Supabase's `extensions` schema.

The third migration adds the missing nullable `profiles.birthday date` column repeatably.

## Pending 2026-08-02 website migration set

Apply only after separate approval, in this order:

| Order | Migration | SHA-256 |
|---|---|---|
| 1 | `20260802000000_optimize_website_rls_and_indexes.sql` | `9BE0224F3F6CB120453AA8519C3BA281DD0D10B4649A44EB7D068FF956F8C251` |
| 2 | `20260802010000_harden_attendance_notifications.sql` | `76E0E1B78517884B8C7818F9DE850857371C7572E5072FEB469646935B2F7AC8` |
| 3 | `20260802020000_consolidate_website_rls_policies.sql` | `6D4371648E64AB79C0E35ED2FF0287F3B113DA6A72F9D13F8A0E193108B7D6A8` |

This set adds missing website foreign-key indexes, aligns authenticated/anonymous grants, removes stale and per-row-auth RLS patterns, enforces same-team attendance integrity, creates leader notifications through trigger-only functions, and consolidates equivalent permissive policy groups. A clean local catalog reports zero website `auth.uid()` init-plan warnings, zero website multiple-permissive groups, and no missing website foreign-key index.

Do not apply these SQL files to production based on the earlier three-migration approval; they were authored later and require a new explicit authorization.

## Local proof

- All 61 migrations replayed from an empty local Supabase database.
- The replay was repeated after each migration-order correction.
- `supabase db lint` reports no website-function errors.
- `supabase/tests/website_security_regression.sql` passes and rolls back its test data.
- Website unit, coverage, build, and desktop/mobile Playwright gates pass.

## Production preflight

Before applying:

1. Confirm project status is `ACTIVE_HEALTHY`.
2. Confirm a current database backup/restore point exists under the project's retention plan.
3. Recompute the three SHA-256 values and compare them with this packet.
4. Confirm `messages.scheduled_for` and `messages.is_delivered` exist.
5. Confirm no production DDL maintenance is already running.
6. Record the deployment operator and start time.

Read-only preflight SQL:

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('messages', 'profiles')
order by table_name, ordinal_position;

select schemaname, tablename, policyname, roles, cmd
from pg_policies
where (schemaname = 'public' and tablename = 'setlist_templates')
   or (schemaname = 'storage' and tablename = 'objects'
       and (policyname ilike '%presentation media%' or policyname ilike '%avatar%'))
order by schemaname, tablename, policyname;
```

## Post-migration verification

Run immediately after applying:

```sql
select c.relname, c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'setlist_templates';

select schemaname, tablename, policyname, roles, cmd
from pg_policies
where (schemaname = 'public' and tablename = 'setlist_templates')
   or (schemaname = 'storage' and tablename = 'objects'
       and policyname like 'Team members can % presentation media')
order by schemaname, tablename, policyname;

select p.proname, p.prosecdef, p.proconfig, p.proacl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'claim_worship_remote_pairing',
    'deliver_scheduled_messages',
    'get_unread_message_count'
  )
order by p.proname;

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'profiles'
  and column_name = 'birthday';

select count(*) as public_avatar_select_policies
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and cmd = 'SELECT'
  and (qual ilike '%profile-avatars%' or policyname ilike '%avatar%');
```

Expected invariants:

- `setlist_templates.relrowsecurity = true`.
- Four authenticated template policies exist: select, insert, update, and delete.
- Three authenticated presentation-media policies exist with the new names.
- `deliver_scheduled_messages(integer)` is executable only by `service_role`.
- `get_unread_message_count(uuid)` is security-invoker with an empty search path.
- `claim_worship_remote_pairing(uuid,text)` is security-definer with an empty search path and no anonymous execute grant.
- `profiles.birthday` exists as `date`.
- The avatar-listing policy count is zero.

After SQL verification:

1. Rerun Supabase security advisors.
2. Smoke-test signed-in dashboard and profile pages.
3. Save and reload a birthday value.
4. Verify a member can see only their team's templates.
5. Verify an authenticated user cannot write presentation media under another user/team path.
6. Check PostgreSQL/API logs for new authorization or missing-column errors.

## Vercel production variables

Current production state:

- Present: `CRON_SECRET`
- Present: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- Present: `VAPID_PRIVATE_KEY`
- Missing: `SUPABASE_SERVICE_ROLE_KEY`
- Missing: `UPSTASH_REDIS_REST_URL`
- Missing: `UPSTASH_REDIS_REST_TOKEN`

Rules:

- `CRON_SECRET` was generated from 32 cryptographically random bytes and stored without exposing its value.
- Retrieve the service-role key from the target Supabase project; never use the publishable key.
- Store service-role, cron, Upstash token, and VAPID private values only as server-side encrypted variables.
- Add the existing local VAPID pair only after confirming it is the intended production pair.
- Redeploy after environment changes; existing deployments do not automatically gain changed values.

Before a production build, run `npm run check:production-env`. Vercel production
builds execute the same redacting preflight automatically and will fail while
any required variable is absent or invalid.

After deployment, run:

```bash
npm run smoke:production -- --base-url https://anointed-worship-app.vercel.app
```

The 2026-08-01 read-only check against the current 2026-07-29 deployment fails:
health redirects instead of returning readiness, CSP is missing, the public-v2
service worker is absent, and the old worker precaches `/dashboard`. Treat the
current alias as stale until the command passes against a reviewed deployment.

## Rollback and recovery

Prefer roll-forward correction for policy/function mistakes because restoring the broad policies would reintroduce the security findings.

- The birthday column is nullable and additive; leave it in place during application rollback.
- If the website fails after migration, roll the Vercel deployment back first and keep the hardened database boundaries.
- If a new policy blocks legitimate access, capture the failing user/team/action, reproduce it in the rollback-only SQL test, and deploy a narrowly corrected forward policy.
- If the scheduled-delivery RPC fails, disable the Vercel cron invocation while retaining its service-role-only grant.
- Record migration names, timestamps, advisor results, log evidence, and any follow-up migration.

## Approval boundary

The original three migrations and three named Vercel variables were explicitly approved and completed. Applying the three 2026-08-02 migrations, adding the remaining credentials, pushing to GitHub, activating issue-writing monitoring, and redeploying are separate external production mutations and still require explicit approval.
