# Supabase SQL Editor deployment — website only

Linked project checked: **ANOINTED WORSHIP 2**

Checked: 2026-08-02

## Before running SQL

1. Confirm the Supabase Dashboard project name is **ANOINTED WORSHIP 2**.
2. Take or confirm a recent database backup.
3. Open **SQL Editor → New query**.
4. Run each migration below separately and in order. Stop immediately if one reports an error; do not continue to later files.
5. Do not paste API keys, database passwords, VAPID keys, Spotify secrets, service-role keys, or cron secrets into SQL Editor. These migrations contain schema and policy SQL only.

## Run these six website migrations in order

1. [`20260730063300_add_missing_messages_columns.sql`](../supabase/migrations/20260730063300_add_missing_messages_columns.sql)
   - Adds scheduled-message, delivery-state, and thread-parent columns and an index.
2. [`20260730063400_fix_notify_new_message_member_id.sql`](../supabase/migrations/20260730063400_fix_notify_new_message_member_id.sql)
   - Corrects the message notification trigger's channel-membership column.
3. [`20260802000000_optimize_website_rls_and_indexes.sql`](../supabase/migrations/20260802000000_optimize_website_rls_and_indexes.sql)
   - Adds missing indexes, tightens grants, removes anonymous table access, and consolidates website RLS boundaries.
4. [`20260802010000_harden_attendance_notifications.sql`](../supabase/migrations/20260802010000_harden_attendance_notifications.sql)
   - Enforces same-team attendance and creates leader notifications through a private trigger.
5. [`20260802020000_consolidate_website_rls_policies.sql`](../supabase/migrations/20260802020000_consolidate_website_rls_policies.sql)
   - Consolidates overlapping policies for receipts, events, join requests, notifications, profiles, teams, and members.
6. [`20260802030000_enforce_website_integrity.sql`](../supabase/migrations/20260802030000_enforce_website_integrity.sql)
   - Adds schema drift fixes, private presentation media, ownership transfer controls, join-request validation, cross-team integrity triggers, and transactional RPCs.

## Do not run for the website-only release

`20260730063200_setlist_presentation_sync.sql` is also pending on the linked project, but it changes the desktop Presenter's offline mutation contract. It is intentionally excluded from this website-only release.

The three earlier security migrations `20260730063024`, `20260730063102`, and `20260730063114` already appear as applied on the linked project and must not be pasted again.

## Verification query

Run this read-only query after all six scripts succeed:

```sql
select
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'messages' and column_name = 'scheduled_for'
  ) as scheduled_messages_ready,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'songs' and column_name = 'seed_source'
  ) as song_seed_provenance_ready,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'events' and column_name = 'recurrence_rule'
  ) as recurring_events_ready,
  exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'transfer_team_ownership'
  ) as ownership_transfer_ready,
  exists (
    select 1 from pg_trigger
    where tgname = 'attendance_validate_team' and not tgisinternal
  ) as attendance_integrity_ready,
  exists (
    select 1 from pg_trigger
    where tgname = 'join_requests_validate_transition' and not tgisinternal
  ) as join_request_integrity_ready,
  coalesce((select not public from storage.buckets where id = 'presentation-media'), false)
    as presentation_media_private;
```

Every returned value must be `true`.

## Migration-history note

Supabase SQL Editor changes the schema but does not necessarily record local migration files in CLI migration history. Keep a record that these six versions were applied manually before a future `supabase db push`. Prefer the Supabase CLI for later releases once the website-only and desktop migration streams are separated.

## Secrets belong in hosting settings, not SQL

The website expects these values in Vercel/environment settings, never in GitHub or SQL Editor:

- `NEXT_PUBLIC_SUPABASE_URL` — public project URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — public browser key
- `SUPABASE_SERVICE_ROLE_KEY` — server only
- `CRON_SECRET` — server only, randomly generated
- `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` — server only
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
