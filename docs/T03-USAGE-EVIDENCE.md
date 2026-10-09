# T03 implementation evidence

Owner: Josh, effective role metadata `gpt-6.1-sol` with high reasoning. Isolated branch: `codex/member-usage-20261005`, baseline `96615d3`. This is an implementation handoff, not a Done ticket declaration. The coordinator owns ticket status and final integration.

## Acceptance evidence

- Relative last-seen minutes, hours, and days: domain tests cover each format; member UI tests prove empty presence no longer makes active memberships Online.
- Member usage rankings, hours, session frequency, dates, and daily minutes: analytics UI tests verify ranking, totals, dates, and UTC date filtering. `/members` and `/analytics` both render the new panel for owner/admin roles.
- No hidden or idle credit: tracker tests exercise trusted recent input, one-minute throttling, idle cutoff, hidden/offline windows, synthetic input, idle-tab return, and cleanup.
- Multi-tab accounting and no invented history: PostgreSQL tests verify repeated-minute deduplication, no elapsed-gap credit, server UTC dates, and a session after five minutes of inactivity. The SQL locks the membership row before accounting.
- Authorization: real PostgreSQL tests prove same-team owner/admin reads; anonymous, ordinary-member, inactive-member, and other-team restrictions; direct write denial; composite foreign keys; and deletion cascades.
- Compatibility: missing schema/RPC and network errors are handled separately from an empty history. The migration is additive, not applied remotely, and deployment/recovery are documented in `docs/MEMBER-USAGE-TRACKING.md`.

## Checks run

1. `node node_modules/typescript/bin/tsc --noEmit --incremental false`: passed, exit 0.
2. `node node_modules/vitest/vitest.mjs run --config vitest.website.config.ts src/lib/domain/member-usage.test.ts src/components/member-usage-tracker.test.tsx src/components/member-usage-analytics.test.tsx src/components/members-client.usage.test.tsx src/lib/supabase/member-usage.test.ts`: 5 files, 17 tests passed, exit 0.
3. `node node_modules/eslint/bin/eslint.js src/components/member-usage-tracker.tsx src/components/member-usage-tracker.test.tsx src/components/member-last-seen.tsx src/components/member-usage-analytics.tsx src/components/member-usage-analytics.test.tsx src/components/members-client.tsx src/components/members-client.usage.test.tsx src/components/app-shell.tsx src/app/analytics/page.tsx src/lib/domain/member-usage.ts src/lib/domain/member-usage.test.ts src/lib/supabase/member-usage.ts src/lib/supabase/member-usage.test.ts src/lib/supabase/database.types.ts scripts/test-member-usage-postgres.mjs --max-warnings 0`: passed, exit 0.
4. `node scripts/test-member-usage-postgres.mjs 'C:/Users/danje/AppData/Local/Temp/anointed-usage-postgres/node_modules/@electric-sql/pglite/dist/index.js'`: PostgreSQL accounting/security checks passed, exit 0. See deployment documentation for a portable reproduction command.
5. `git diff --check`: passed, exit 0. Git reports its normal LF-to-CRLF conversion notice.
6. `npm audit --json`: failed, exit 1. Existing dependencies report 16 advisories: 4 moderate, 11 high, 1 critical. `next` is the critical advisory entry. Other reported packages include `sharp`, `undici`, ESLint-related packages, and Vitest-related packages. This ticket does not modify a dependency or lockfile. Dependency remediation requires a separate scoped review; this gate is not passed.

## Engineering gates

| Gate | Result | Evidence or limit |
| --- | --- | --- |
| 01 | Passed | Member last-seen and usage analytics are the user-visible outcome. |
| 02 | Passed | Acceptance criteria and tests above. |
| 03 | Passed | Local-only implementation; no remote mutations or credentials changed. |
| 04 | Passed | Database/privacy change requires independent reviews; final ticket settlement is coordinator-owned. |
| 05 | Passed | RPC/table deployment precedes usable usage history. |
| 06 | Passed | Josh owns the T03 implementation. |
| 07 | Passed | Existing member UI, typed Supabase clients, team guard, RLS helper, and navigation guide inspected. |
| 08 | Passed for design | Juan's provided design approved before this assignment. Final review remains pending. |
| 09 | Passed | Migration, RPC, generated-shape entries, and usage helpers define the interfaces. |
| 10 | Passed | Only T03 member/analytics/tracker/schema/test/documentation files changed. |
| 11 | Passed | RPC derives active caller membership; SELECT policies scope owner/admin reads. |
| 12 | Passed | Accounting, access-denial, tracker, and analytics tests selected before completion. |
| 13 | Passed | Isolated worktree and branch stated above. |
| 14 | Passed | Caveman, migration discipline, RLS boundaries, Postgres best practices, TypeScript discipline, engineering gates, and completion mandate loaded. |
| 15 | Passed | Existing component/client patterns and strict ESLint pass. |
| 16 | Passed | Strict typecheck; database-derived domain row types. |
| 17 | Passed | Domain names describe usage, dates, state, minutes, and sessions. |
| 18 | Passed | Shared loaders and summary helpers serve both member and analytics panels. |
| 19 | Passed | AppShell adds only an invisible browser tracker; analytics components remain on the affected pages. |
| 20 | Passed by inspection | Browser listeners and RPC live in effects; no browser APIs run during server rendering. |
| 21 | Passed | Team/member identity checked in RPC; dates bounded; presence payload validated. |
| 22 | Passed | Missing deployment, errors, and empty history are distinct. |
| 23 | Passed | Additive migration and old-deployment fallback. |
| 24 | Passed | Application rollback and forward recovery documented. |
| 25 | Passed | Counter constraints, composite FKs, team/date indexes, and growth documented. |
| 26 | Passed in isolated PostgreSQL | Owner/admin allowed; two-team/ordinary/inactive/anonymous denial. |
| 27 | Passed in isolated PostgreSQL | Direct INSERT denied; authenticated active-member RPC is allowed. |
| 28 | Passed in isolated PostgreSQL | Direct UPDATE denied, including owner/admin. |
| 29 | Passed in isolated PostgreSQL | Direct DELETE denied, including owner/admin. |
| 30 | Pending coordinator | Heavy production build was explicitly reserved for coordinator. |
| 31 | Passed | Exact typecheck command above. |
| 32 | Passed | Exact strict ESLint command above. |
| 33 | Passed with stated limit | 17 focused tests plus real SQL harness. Full Supabase environment was unavailable. |
| 34 | Pending coordinator | Real mobile/browser suite reserved for coordinator. |
| 35 | Failed baseline dependency check | npm audit advisories above; no dependency changes in this ticket. SQL authorization checks passed. |
| 36 | Passed by component checks/inspection | Labeled controls, live error/loading messages, table caption/headers, keyboard-accessible daily details. Real browser accessibility review pending. |
| 37 | Implementation reviewed | Diff and criteria reviewed; final candidate reviews/settlement remain coordinator-owned. |

Full native Supabase migration compatibility, true multi-connection concurrency, production build, browser/mobile behavior, and independent Juan/Laura reviews remain required follow-up checks. Docker reported that the `dockerDesktopLinuxEngine` pipe does not exist. No service was started and no remote database was touched.
