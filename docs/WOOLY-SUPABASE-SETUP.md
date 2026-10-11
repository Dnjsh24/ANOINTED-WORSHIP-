# Wooly: manual Supabase setup

These scripts target the implementation pushed as `ad50f67` on `codex/wooly-help-20261012`. They prepare database support; they do not deploy the website or enable Wooly.

## First-time database setup

1. Open the Supabase project used by the real Sunday Setlist website.
2. Open `supabase/wooly-sql-editor-setup.sql` and copy its entire contents into **SQL Editor → New query**. Run the whole query as the administrative SQL Editor role.
3. A successful run ends with **Wooly database setup complete. Website activation is still separate.**

The file combines these original migration bodies, without changing their statements, in timestamp order and one transaction:

- `20261009010000_wooly_tutorial_progress.sql`
- `20261011010000_wooly_page_guides.sql`
- `20261011020000_wooly_chat_support.sql`
- `20261011030000_wooly_feature_tasks.sql`

It creates five Wooly tables, access policies, support functions, and the valid overview/task checkpoint constraints. Saved answers and question variations ship in the website code: no answer seed, model training, paid AI account or AI API key is required.

The preflight requires the existing profiles, teams, private schema and approved-membership helper. It stops if any Wooly table already exists. For an existing or partially installed Wooly schema, inspect its state and apply only the missing migrations; do not delete tables or rerun a first-time install. If any statement fails, run `ROLLBACK;` before any further query and retain the exact error for diagnosis. No remote execution has been performed by Codex.

## Optional private support inbox

Use `supabase/wooly-support-account.sql` only if you want your account to answer submitted questions. In Supabase **Authentication → Users**, identify your own verified account and copy its UID. Replace the one `PASTE_YOUR_AUTH_USER_UID_HERE` value in the SQL file, then run the whole file. The script checks that both the Authentication user and website profile exist. It grants only that profile and can safely repeat the same grant. No account is chosen automatically.

After the matching Wooly website version is deployed and enabled, sign in as that account and open `/support/wooly`. This support grant does not grant access to other teams' underlying records.

## Website activation

Deploy the reviewed Wooly implementation, set the **website hosting** environment variable `WOOLY_TUTORIAL_ENABLED=1`, and rebuild/redeploy. This variable is not SQL and is not a Supabase Edge Function secret. The feature branch alone does not update production. Remote deployment and environment changes remain separate actions; none was performed here.

## Migration history and verification limits

Manual SQL Editor execution bypasses Supabase CLI migration history. Before a future `supabase db push`, verify that all four migrations actually succeeded, then reconcile these four versions with the CLI's documented `migration repair --status applied <version>` workflow on the intended linked project. Do not mark migrations applied merely because a table exists. No migration-history changes are included in this bundle.

Sources: [Supabase database SQL Editor](https://supabase.com/docs/guides/database/overview), [migration history and repair](https://supabase.com/docs/guides/deployment/database-migrations).

The original migration/catalog source tests passed during release preparation. Packaging is checked against the pushed migration bodies, including the single outer transaction and no automatic support grant. Real database execution and two-account RLS verification remain untested because the local Docker database runtime is unavailable. Structural success alone is not an account-isolation test. Browser acceptance is also still pending.
