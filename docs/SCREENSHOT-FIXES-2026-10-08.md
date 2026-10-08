# Screenshot fixes - 2026-10-08

All eleven changes are implemented and accepted locally against baseline `8df7356c1380e4de2ec05923f17cd34dc7907101`. Existing work was preserved when the checkout fast-forwarded from `96615d3` to this screenshot baseline. Maya and Josh used separate worktrees with explicit ownership; the coordinator integrated their changes and maintained tickets. The user subsequently approved database rollout; the thirteen prepared migration sources are now applied. Website deployment remains separate and unperformed.

## Acceptance behavior

| ID | Result and affected surface | Evidence |
| --- | --- | --- |
| F01 | Dashboard service/reminder summary and count have no purple fill. | Computed browser styles and component checks. |
| F02 | Practice renders the actual full-screen Stage client. Practice & edit opens preparation, song progress/order, lead/setlist/band notes, arrangement and song/lyrics/chords editing. Authorized Stage key changes persist with error feedback, rollback and stale-slot protection. Practice meter/progress remain session controls. | Practice page/client/tools tests, key failure/race regressions and keyboard/mobile journey. |
| F03 | Navigation has no pulsing strip. Static current-page underline and accessible loading announcement remain. | Component and browser checks. |
| F04 | Pending cards/page query actual pending rows only. Demo requests and canned authenticated notifications are removed. Realtime, focus/visibility refresh and visible-page 30-second polling update both surfaces. | Actual Supabase query serialization, simulated realtime/cleanup and browser checks. |
| F05 | Owners open Review queue and have no My requests tab or proposal link. Members keep their request view. Missing schema produces a specific unavailable message. | Owner/member inbox/action tests and browser checks. |
| F06 | Analytics uses bare icons, restrained entrance/chart motion, simpler spacing and the dark/violet theme. Reduced-motion preferences are respected. | Computed icon styles, responsive checks and review. |
| F07 | Daily hours show separately colored member segments, named legend/totals, member filtering and exact daily data table. Zero-usage roster members remain visible. | Multi-member/totals/filter/zero-usage tests and usage journey. |
| F08 | Owner can allow, deny or inherit each existing editable capability by role/person. Person overrides win. Actions, UI, RPCs and RLS enforce permissions, team scope and owner protection. | Domain/action/UI tests, native SQL matrix and independent Juan/Laura gold acceptance. |
| F09 | Activity Log displays actual team audit rows and available event/member history, with visible-tab 15-second refresh and empty/error feedback. Canned Casey/Alex/Worship Bot rows are removed. | Settings data/UI/polling tests and browser checks. |
| F10 | Ministry Defaults can generate and persist a different team code. Successful saves audit/refresh; failures/conflicts retain the old code with feedback. | Action success/conflict tests, settings UI and SQL authorization checks. |
| F11 | Setlist toolbar has no Newest first dropdown. Search, filters and existing ordering remain. | Toolbar browser check. |

## Authorization and implementation

Editable capabilities: setlists.manage, songs.create, songs.edit, files.upload, members.manage, events.manage and team.manage. Join-request review maps to effective member management. Owners alone change overrides and custom roles; owner access is protected. Delegated managers invite/approve plain members, while owners/admins assign higher roles. Delegates cannot modify privileged owner/admin memberships or bypass these limits through direct writes.

Team settings follow existing RBAC owner-only defaults; owners can explicitly grant access. Code rotation separately requires effective members.manage. Delegating settings does not delegate billing, team deletion, ownership transfer or permission editing. Direct song editing retains owner/admin/creator defaults; overrides take precedence. Upload grants/denials cover storage and practice-file metadata, including inherited custom-role access.

Absent additive permission schema retains existing defaults; other permission-read failures deny editable capabilities. Scoped owner RPCs serialize and audit permission edits. Foreign keys, checks, indexes and triggers protect targets, owner invariants and raw DML. Append-only migrations and existing transactional workspace APIs are retained.

Practice reuses Stage and dynamically loaded SongForm. Note parsing preserves JSON metadata and legacy lead/template notes. Actions validate UUIDs/lengths and authenticated parent team scope. Dialog focus excludes hidden, inert and closed-details controls; Escape restores focus and Stage shortcuts pause during editing. No new dependencies, environment variables or desktop changes.

## Hosted findings before approved rollout

Supabase project `xvrndwkghxkqsvxxtqym` contains 11 approved, one canceled and one rejected join request, no pending requests and no unnamed profiles. The old pending card queried rejected rows too; requester profile visibility covers pending rows. Filtering correctly removes the misleading Unknown rejected entry without deleting history.

Before rollout, the project had 14 actual activity_logs rows and member-usage tables. Shared edit requests, shared preparation/service-order tables, team_permission_overrides and transactional workspace/preparation/analytics RPC prerequisites were missing. This explained the request load and shared-planning errors. Those missing database features are now installed; existing content and record counts are preserved.

## Validation

Commands ran with Node 22.23.3. npm ci synchronized the existing lockfile and installed Next 16.3.8; package manifests and lockfile remain unchanged.

| Check | Command/result |
| --- | --- |
| Coverage | `npx --yes --package=node@22 node node_modules/vitest/vitest.mjs run --config vitest.website.config.ts --coverage --maxWorkers=2`: 114 files/561 tests passed. Statements 87.63%, branches 83.96%, functions 92.68%, lines 90.62%. Configured website coverage scope, not all components. |
| Typecheck | `npx --yes --package=node@22 node node_modules/typescript/bin/tsc --noEmit`: passed; final build reran TypeScript successfully. |
| Strict lint | `npm run lint:website` under Node 22: passed, zero warnings. Final UI delta also passed `npx --yes --package=node@22 node node_modules/eslint/bin/eslint.js src/components/join-requests-client.tsx src/components/song-form.tsx --max-warnings 0`. |
| Build | `E2E_FORCE_DEMO=1 NEXT_PUBLIC_E2E_FORCE_DEMO=1 npx --yes --package=node@22 node node_modules/next/dist/bin/next build --webpack`: passed, all routes compiled/generated. |
| Focused browser | Screenshot checks: 8 passed on desktop Chrome/Pixel 7. Practice/usage checks: 4 passed on both devices. |
| Four-device browser | 48 passed in 2.2 minutes across desktop Chrome, Android Chrome, tablet Chrome and iPhone WebKit. Each device swept all 42 listed website routes without server/console errors. |
| SQL | `npx --yes --package=node@22 node scripts/test-migration-chain-postgres.mjs supabase/tests/owner_permission_overrides.sql`: PostgreSQL 18.4, 78 migrations passed in chronological/manual-bundle order with DDL/bootstrap/RPC smoke and permission regressions. |
| Audit | `npm audit --omit=dev --audit-level=high`: zero production vulnerabilities. |
| Secrets | `npm run security:secrets`: passed, no findings in 581 files/2,177 blobs/343 commits. Existing scanner skipped three oversized historical blobs. |
| Diff | `git -c core.safecrlf=false diff --check`: passed. |

Browser environment: PLAYWRIGHT_BASE_URL=http://127.0.0.1:3107, E2E_FORCE_DEMO=1, final production build, one worker. Exact selections:

```text
npx --yes --package=node@22 node node_modules/@playwright/test/cli.js test e2e/screenshot-fixes.spec.ts e2e/requested-fixes.spec.ts --project=chromium --project=mobile --grep 'service summary|owner sees|setlist toolbar|analytics icons|practice mode|daily active hours' --reporter=line
npx --yes --package=node@22 node node_modules/@playwright/test/cli.js test e2e/requested-fixes.spec.ts --project=chromium --project=mobile --grep 'Practice reuses|team usage shows' --reporter=line
npx --yes --package=node@22 node node_modules/@playwright/test/cli.js test e2e/responsive.spec.ts e2e/website-smoke.spec.ts e2e/security-accessibility.spec.ts --reporter=line
```

The first selection ran all eight screenshot checks; the second ran four practice/usage checks. Playwright MCP lacked its Chrome extension; existing CLI supplied the alternative. Forced-demo tests block remote Supabase and prove local UI/accessibility, not hosted authentication/provider behavior. Native PostgreSQL uses local Auth/Storage/Realtime/pg_net prerequisite adapters, not actual Supabase services.

## Independent review and identity

| Reviewer | Effective model/effort | Final result |
| --- | --- | --- |
| Juan, Tech Lead | gpt-6-luna / max | Gold F08 accepted: precedence, owner/team protection, role caps, settings/code and storage/song parity. No confirmed blocker. |
| Laura, QA | gpt-6.1-sol / high | Gold F08 accepted; independent five-file/24-test Node 22 regression passed. Earlier broader review executed 62 checks, 59 unique. No confirmed blocker. |

Migration SHA256: `1F7F5F0970667A4B88A9EC52D9D9DFAA5548B100D203CF000E125AC336E3CC19`.

Executed SQL test SHA256: `8E6C069A03ED4DF5F7CEA7911B7CC558D85CE20951EB2A5F5E69382E7659C00C`. Coordinator confirmed this test ran in final A85Yjq replay; no SQL edits followed. [Raw database evidence](SCREENSHOT-FIXES-DATABASE-2026-10-08.json) records migration hashes/pass statuses but omits test-file hash. Final source manifest records it separately. Earlier reported test hash was a stale checkpoint.

The [source manifest](SCREENSHOT-FIXES-SOURCE-2026-10-08.json) identifies the final uncommitted candidate. Coordinator also inspected final analytics, full-screen practice and editor screenshots in ignored test-results artifacts; layout and theme matched the requested direction.

Nonblocking follow-up from Juan: SQL matrix does not directly invoke review_shared_edit_request. Its changed permission wrapper was reviewed against the tested TypeScript inbox mapping; a direct RPC integration test is not claimed.

## Engineering gates

| Gates | Status/evidence |
| --- | --- |
| 01-06 | Passed: eleven outcomes/criteria, owners/dependencies, F08 gold and external boundaries in tickets.md. |
| 07-12 | Passed: conventions/Next guides inspected, blast radius/contracts/auth flow reviewed, meaningful checks selected. |
| 13 | Passed: separate Maya/Josh implementation worktrees; read-only integrated reviews. |
| 14 | Installed skill guidance loaded. Earlier catalog/path availability limitations disclosed; unavailable skill gates are not claimed as passed. |
| 15-22 | Passed: conventions, strict TS/lint, domain names, reuse/splitting, server/client boundaries, validation and error/rollback/race tests. |
| 23-25 | Passed locally: additive migration, prerequisite/recovery plan, constraints/indexes/serialization and two-order replay. Hosted compatibility remains release verification. |
| 26-29 | Passed locally: SELECT/INSERT/UPDATE/DELETE grants/denials, owner/team protection, storage/metadata/delegation regressions. Provider behavior unverified. |
| 30-33 | Passed: build, typecheck, lint and configured website coverage. |
| 34 | Passed: 12 focused desktop/Android checks plus 48 four-device responsive/security/smoke checks. |
| 35-36 | Passed locally: independent security review, audit/secrets, keyboard/dialog/reflow/zoom/reduced motion. Physical-device testing not claimed. |
| 37 | Passed: all eleven local criteria accepted; final diff reviewed, source identity and evidence recorded, no desktop scope changes. Hosted rollout remains separate. |

## Prepared release sequence

1. Verify actual target migration history/definitions. Apply only missing prerequisites in timestamp order.
2. Existing supabase/manual/20261006_team_workflows.sql bundles eleven workflow prerequisites. Use only if every included migration is absent and earlier prerequisites exist. SQL Editor does not register CLI versions; reconcile history explicitly.
3. Apply missing 20261008010000_team_analytics_summary.sql, then 20261008020000_owner_permission_overrides.sql after prerequisites.
4. Deploy matching reviewed website using existing release procedure. Verify authenticated owner/member requests, grant/deny/cross-team checks, saved practice edits, real usage/audit updates and code rotation.
5. Recover website by restoring prior accepted revision. Database permission recovery needs a reviewed forward migration; preserve authorization data and historical migrations.

New tracking cannot reconstruct historical usage. Database migration and branch push received explicit user approval; direct website deployment has not. The [navigation guide](CODEX-NAVIGATION-GUIDE.md) states: "Do not apply migrations, deploy, push, or change credentials without explicit approval."

## Approved hosted database rollout

On 2026-10-08 the user approved database migration. The project-scoped Supabase connector confirmed `https://xvrndwkghxkqsvxxtqym.supabase.co`; the broad connector denied access, so the working scoped connector was used. Josh independently checked actual tables, columns, RPC signatures, legacy private wrappers and prerequisites. All thirteen sources were accepted; earlier already-present changes were not replayed.

The eleven 20261006 workflow sources plus analytics and owner permissions were applied atomically with five-second lock timeout and sixty-second statement timeout. Supabase recorded aggregate migration `20261008124033_screenshot_workflows_analytics_owner_permissions`. [Hosted evidence and source mapping](SCREENSHOT-FIXES-HOSTED-2026-10-08.json) identifies every applied source and its SHA256. Earlier manually-applied schema changes still lack migration-history rows; this operation did not rewrite history. Future CLI pushes must reconcile that historical drift and this aggregate mapping before replaying any source.

All seven new protected tables exist with RLS, no anonymous reads and no authenticated raw DML. Required RPCs are available to authenticated callers and denied to anonymous callers. Raw workspace table/column writes remain revoked. Counts stayed at two teams, eleven members, 126 songs, five events, seven setlists and fourteen audit rows. No demo requests or permission overrides were inserted permanently.

[Hosted runtime checks](SCREENSHOT-FIXES-HOSTED-CHECKS-2026-10-08.sql) passed owner protection, grants and person denials for all seven capabilities, inheritance, owner-only editing, cross-team denial, real owner analytics/preparation reads and unrelated-actor denial. These tests used actual hosted PostgreSQL roles/JWT claims and rolled back all temporary permission/audit writes; final override count is zero. Browser sign-in and website deployment remain separate checks.

Security advisors identify 23 intentionally authenticated SECURITY DEFINER APIs after rollout (one beforehand). Their scoped authorization and anonymous denials were reviewed/tested; changing them to invoker would defeat the RPC-only write contract. Existing private pairing-attempt no-policy INFO and disabled leaked-password protection WARN remain unchanged. References: [definer advisor](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [private-table advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [password setting](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No auth setting was changed. A provider backup/PITR checkpoint was not independently verified before application; this limitation is recorded rather than counted as a passed release check.

Laura independently accepted hosted R01 QA: correct target/history, all protected table/column grants, enabled permission/owner/join triggers, eight critical function bodies matching reviewed SQL, legacy wrapper guards, unchanged counts and the recorded advisor delta. No confirmed authorization blocker remains. Josh independently accepted prerequisite compatibility before application. R01 is complete for the approved database scope. Website deployment and authenticated browser acceptance remain unperformed and outside the database-only approval.

## Approved branch publication

The user approved pushing all changes while excluding secrets. Laura independently accepted staged tree `63dd8b4cd5195bf41be306a3ddb343de914516fb`: 88 files, zero detected secrets, evidence without emails/private row exports, and all 81 source hashes matching the validated manifest. Staged sources match working files after Git line-ending normalization; the manifest records working-file bytes. The subsequent delta only corrects push-authorization wording and records publication status. Root will scan the final commit and verify its remote identity before declaring publication complete. Production dependency audit is zero; no environment/credential file, local database or ignored test artifact is staged.
