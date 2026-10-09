# Application migration replay — 2026-10-07

Native PostgreSQL 18.4 successfully applied all 76 repository migration files in chronological order. A second database applied the same 65 prerequisites followed by the exact eleven-migration SQL Editor bundle in one transaction. Both databases passed the authenticated application smoke checks. The harness verifies every applied filename and hashes all source bodies, the script and the manual bundle.

```powershell
node scripts/test-migration-chain-postgres.mjs
```

Exit status: 0. Both temporary databases ran in a private loopback-only cluster, which was stopped and removed after the run. The [raw evidence](T21-MIGRATION-CHAIN-2026-10-07.json) records source identities and results. Bundle SHA-256: `e28dbc07fd2d710651457ce819a75126a8621b3b47c5b4e8edcbea8e3d0f7931`.

Smoke checks cover the profile trigger and team bootstrap, event/setlist transactions, shared edit snapshots, literal song/setlist/event search, sync mutation under the final privileges, saved presentation JSON and revision, event cascade deletion, protected workflow table RLS, and denied raw table/column writes including truncation. Independent concurrency and tenant/role denial suites provide separate behavioral evidence; applying migrations alone does not prove every function branch.

Local prerequisites explicitly provide Auth, Storage and Realtime schemas/functions, Supabase-style default grants and a publication. `pgcrypto` is the actual installed extension. The sole source adaptation replaces `create extension if not exists pg_net with schema extensions;` in memory with a comment; a local `net.http_post` stub performs no network request. Every other migration body runs unchanged. No historical migration or globally installed extension was modified.

This validates integration of application DDL and the manual transaction against those prerequisites. It does not validate Supabase Auth/Storage/Realtime/pg_net services, the provider linter, live data or target migration history. The connector still cannot inspect project `xvrndwkghxkqsvxxtqym`. These remain release verification requirements. No live migration or deployment occurred.

The earlier run applied all 76 files but failed a smoke call because the harness used an incorrect snapshot function name. That call was corrected to `get_shared_edit_target`; the successful final run includes the full chronological and manual-bundle smoke checks. The failed attempt is not counted as a complete pass.


Publication refresh ? 2026-10-08: eight whitespace-only lines were removed from the unapplied shared-edit migration and its exact manual-bundle copy. No SQL tokens changed. A fresh `node scripts/test-migration-chain-postgres.mjs` passed both all-76 chronological application and 65-prerequisite-plus-11-file manual-bundle replay with authenticated smoke/privilege assertions on PostgreSQL 18.4. The current raw replay evidence contains the refreshed source/bundle hashes and the old/new formatting identities. Application source and prior website validation remain unchanged. Provider/live release checks remain separate.
