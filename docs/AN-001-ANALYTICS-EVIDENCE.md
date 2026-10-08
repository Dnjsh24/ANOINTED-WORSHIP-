# AN-001 — Analytics implementation evidence

## Scope and candidate

User approved the Analytics screenshot and requested changes only to `/analytics`: modest rounded boxes, subtle animations, and available website analytics. Other pages and the shared shell/theme are outside scope.

Baseline commit: `96615d3e0d1e1cdff28feb4c34a1fb286d8c79d9`. Working tree was clean before the ticket was created. No deployment, migration, or credential change is authorized or performed. After implementation acceptance, the user explicitly requested push, authorizing commit and push to the current `Dn-Jsh/UI-improvements` feature branch. The delivery response records the actual result.

## Data audit — Josh

Read-only audit accepted. Required Caveman, Ponytail full, migration discipline, Supabase RLS boundaries, PostgreSQL best practices, TypeScript discipline, and engineering gates loaded. No missing role skills reported. `PROJECT-BRIEF.md` absent. No files or external resources changed by this audit.

- Keep the existing authenticated team guard and owner/admin Analytics access.
- Song usage measures nondeleted setlist-song placements on nondeleted, team-scoped setlists, using `setlist_date`; it does not measure proven performances.
- Availability uses flat attendance rows joined to approved, nondeleted past events; current-day events are conservatively excluded from historical trends. Weighted rate is available responses divided by all recorded statuses, including pending. No responses means no measured rate, not zero.
- Message RLS restricts reads to the viewer's active channels, including admins/owners. Label this scope. `scheduled_for ?? created_at` is the available publication-time proxy; no actual delivery timestamp exists.
- Activity uses actual team-scoped activity logs. Only two website log writers currently exist (song and setlist creation); do not fabricate member, message, or announcement update records.
- Current totals use exact counts for existing team sources: active members, nondeleted songs/setlists, approved nondeleted events, channels, announcements, dance notes, and pending join requests. These are current inventory, separate from the selected historical period.
- Paginate aggregate sources with stable ordering, including flat attendance. Query failures must make their source unavailable instead of exposing partial results as exact or replacing them with demo data.
- Normalize nullable joins and validate activity JSON before displaying labels. Reuse generated database types and event labels.
- Analytics calendar dates use explicit Asia/Manila (UTC+8) day boundaries, with equal-length previous-period comparisons. Current recorded availability for historical events is not an attendance audit history.
- No database migration or permission change needed. Existing RLS SQL inspected, not executed.

## Validation

Maya's read-only UI preparation was accepted before implementation: required UI skills, project navigation, existing Analytics component/tests, authentication and AppShell boundaries, installed Next.js page/searchParams and client-component guides, and targeted UI UX Pro Max chart/focus guidance inspected. Josh's data implementation and Maya's sequential UI implementation are now accepted after coordinator validation and independent Laura review.

| Check | Result |
| --- | --- |
| Baseline `npm run typecheck` | Passed; exit 0 |
| Baseline `npm audit --omit=dev --audit-level=high` | Failed; exit 1. Six existing vulnerabilities: one moderate, four high, one critical. No dependency files changed. |
| Local Chromium installation | Available at the installed Playwright executable path |
| Analytics data tests | Passed: `npx vitest run --config vitest.website.config.ts src/lib/domain/analytics.test.ts src/lib/server/analytics.test.ts`, 25/25 tests, exit 0. Initial exact floating-point assertion failed; corrected to numerical tolerance and rerun passed. |
| Analytics data lint | Passed: `npx eslint src/lib/domain/analytics.ts src/lib/domain/analytics.test.ts src/lib/server/analytics.ts src/lib/server/analytics.test.ts --max-warnings 0`, exit 0. Final whole-website lint remains pending. |
| Focused Analytics data coverage | Passed: targeted Vitest with `--coverage --coverage.include=src/lib/domain/analytics.ts --coverage.include=src/lib/server/analytics.ts --coverage.reportsDirectory=coverage/analytics-data`, exit 0. Statements 98.54%, branches 87.73%, functions 97.72%, lines 98.28%; all configured 80% thresholds exceeded. |
| Focused UI and route tests | Maya reports passed: 2 files, 8 tests, exit 0. Owner/admin allowed and member denied before analytics reads; demo separation, metrics, filters, empty/error states and date bounds covered. Full candidate tests remain pending. |
| Final scoped Analytics lint | Passed, exit 0: `npx eslint src/app/analytics src/components/analytics-dashboard.tsx src/components/analytics-dashboard.test.tsx src/lib/domain/analytics.ts src/lib/domain/analytics.test.ts src/lib/server/analytics.ts src/lib/server/analytics.test.ts e2e/analytics.spec.ts --max-warnings 0`. |
| Candidate typecheck | `npm run typecheck` passed, exit 0. |
| Candidate full website lint | `npm run lint:website` failed, exit 1, with four pre-existing `no-explicit-any` warnings in Setlist edit page and setlist-form. Analytics scoped lint passed; unrelated files unchanged. |
| Candidate full website units/coverage | `npm run test:coverage:website` failed, exit 1: 327/328 tests passed; unchanged dialog-contracts template-picker test expects LF source while Windows checkout uses CRLF. No source regression in the picker. |
| Candidate available unit/coverage alternative | `npx vitest run --config vitest.website.config.ts --coverage --exclude src/components/dialog-contracts.test.ts` passed, exit 0: 62 files, 319 tests; excludes the entire nine-test unchanged dialog-contracts file. Statements 85.10%, branches 81.70%, functions 89.87%, lines 88.10%; configured thresholds passed. |
| Candidate production demo build | Passed, exit 0: `npm run build`, with `E2E_FORCE_DEMO=1` and `NEXT_PUBLIC_E2E_FORCE_DEMO=1`. Production environment preflight skipped outside Vercel production. No deployment. |
| Analytics desktop/mobile/reduced-motion E2E | Passed, exit 0: `npx playwright test e2e/analytics.spec.ts --reporter=line`, 4/4 (Chromium and mobile), using both demo variables and `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3107`. Real date-count changes, quick-range reset, channel filtering, trend data/interval, keyboard disclosure, finite/reduced motion with visible bar/line static states, 320px/375px overflow, and no console/server errors or remote Supabase calls verified. Two initial runs exposed broad test selectors; exact labels/headings and the metric-value selector corrected, final run passed. No app source changed after build. |
| Existing website smoke E2E | Passed, exit 0: `npx playwright test e2e/website-smoke.spec.ts --reporter=line`, 4/4, same demo/base URL. Existing route-render and health journeys passed on both projects. |
| Final secret scan | `npm run security:secrets` passed, exit 0; detector self-test passed, no findings. Three oversized history blobs skipped as reported by the scanner. |
| Independent Laura review | Accepted scoped candidate; no unresolved blocking finding. Independent data 25/25, UI/route 8/8, team-context 5/5 tests passed; reference and four final rendered screenshots inspected. |
| Final diff | `git diff --check` passed; final status contains only Analytics source/tests plus coordinator ticket/evidence files. HEAD remains baseline. Shared shell/styles, other pages, schemas, dependencies and configs unchanged. |

The engineering-gates skill folder has no global-check script. Actual project npm scripts will be used; no unavailable script is claimed to have passed.

## Independent review checkpoint

Laura completed read-only data/access and final UI reviews: all required review skills and the 37 gates were read; independent data Vitest passed 25/25, UI/route Vitest passed 8/8, and team-context Vitest passed 5/5 (all exit 0). No blocking backend finding. Owner/admin route guard, authenticated publishable client, team/source filters, publication bounds, weighted recorded availability, pagination, partial-failure discard, exact totals, and explicit demo separation were inspected. Live Supabase/RLS execution was not performed; evidence consists of policy inspection and query mocks. Laura accepted the approved reference comparison and final desktop, 375px, 320px, and reduced-motion screenshots, with no unresolved blocking finding.

Laura identified one blocking UI finding before browser validation: disabling animation for reduced motion left the song bars scaled to zero and the current line's stroke offset at its hidden starting value. Maya corrected the static visible states (`scaleY(1)` and dash offset zero) and added computed-style browser assertions. Scoped lint, browser visibility checks, and independent rendered review passed; finding resolved. The first standalone reduced-motion capture showed a loading skeleton; the capture helper was corrected to await rendered Analytics and visible charts. The settled screenshot was inspected and accepted.

The full-site lint/test failures above involve files verified unchanged against the baseline with `git diff --exit-code -- src/app/setlists/[id]/edit/page.tsx src/components/setlist-form.tsx src/components/setlist-template-picker.tsx src/components/dialog-contracts.test.ts` (exit 0). These remain outside the user's Analytics-only scope; no lint waiver, shared component edit, or test configuration change was applied.

## Final candidate and visual evidence

Reviewed candidate identity is the baseline plus this scoped working tree, with source hashes below. Effective specialist runtime model/effort settings remain unverified; configured roles were used without separate Orca terminals. The user subsequently authorized committing and pushing this candidate.

SHA256 identities:

| File | SHA256 |
| --- | --- |
| Analytics page | `970F3E47E139575A30DDD9F15BC5554E5F217D11BF25D3CA18CD9AD8D717EC18` |
| Dashboard | `669AF74B96F5B31564CC393A8E4AB08DDA450AE387F14761D1884B548061E72B` |
| Scoped CSS | `2679EECD59F869A440B2A013DB94D5CC04C28034702A294DC8CE784684E93997` |
| Domain helper | `8A423A1F275C57419296A4508B4AC165A6143351ADCB8FA29C797D4EEF8C809D` |
| Server helper | `5BE36BACC69964156AAF21D4EF61E901809D5317DC5093273AFE7F254E55AB4F` |
| Analytics E2E | `DABD74CEF3CAD9E03B9DC47990E2C8BC371CE4144B4AFB58F9DF635EA5B40DF7` |

Local rendered evidence: [desktop](../test-results/analytics-review/desktop.png), [375px](../test-results/analytics-review/375px.png), [320px](../test-results/analytics-review/320px.png), [reduced motion](../test-results/analytics-review/reduced-motion.png). These demo screenshots and their temporary capture helper live in ignored test-results and may be replaced by future test runs. Source files contain the implementation.

## Acceptance and engineering gates

All seven ticket criteria are satisfied for the scoped implementation: approved layout/radius; working date and chart/channel filters; available team metrics with accurate units and states; accessible alternatives/focus/reduced motion/mobile layout; preserved permissions and other pages; actual validation results including limitations; independent QA and final diff review. This is local implementation completion, not production readiness or deployment approval.

| Gate | Scoped outcome and evidence |
| --- | --- |
| 01 Intake outcome | Passed: Analytics-only selected layout implemented. |
| 02 Acceptance criteria | Passed: seven measurable criteria recorded and assessed. |
| 03 Constraints/actions | Passed: other pages/theme preserved; no external writes. |
| 04 Risk/lane | Passed: standard lane, read-only data and scoped UI. |
| 05 Dependencies | Passed: data audit, sequential data/UI, independent QA. |
| 06 Owner | Passed: Maya accountable; coordinator owns status records. |
| 07 Conventions | Passed: navigation, existing React/Next/auth/theme inspected. |
| 08 Blast radius | Passed: dedicated Analytics files only. |
| 09 Interfaces | Passed: typed domain/source states shared with route/UI. |
| 10 Ownership | Passed: data/UI/status files assigned; no parallel implementation. |
| 11 Data/auth flow | Passed scoped review: authenticated client, team filters and owner/admin guard preserved. |
| 12 Verification plan | Passed: targeted units, site checks, demo build/browser, independent QA. |
| 13 Parallel worktree | N/A: implementation sequential; review read-only. |
| 14 Skills | Passed: required installed role skills read; no missing skill gate claimed. |
| 15 Style | Passed: TypeScript/React conventions and scoped CSS, no new dependencies. |
| 16 Types | Passed: generated database enums, explicit source types; typecheck/build. |
| 17 Names | Passed: descriptive domain/UI names reviewed. |
| 18 Duplication | Passed: shared domain aggregations and compact local UI helpers. |
| 19 Splitting | Passed: server data separate from client dashboard; route scoped. |
| 20 SSR/hydration | Passed: installed Next guides, async searchParams, keyed date controls; browser no errors. |
| 21 Validation | Passed: dates bounded/normalized, nullable joins and JSON details handled. |
| 22 Errors | Passed: whole-source unavailable after any failed page, no fabricated live fallback. |
| 23 Migration compatibility | N/A: no migration. |
| 24 Migration recovery | N/A: no migration; reversible source change. |
| 25 Volume/indexes | Passed scoped review: stable 500-row cursor pages, exact counts, flat attendance; no index/schema changes. |
| 26 RLS SELECT | Limited evidence: existing policies inspected, authenticated/team reads and route denied cases covered by mocks; live RLS execution untested. No policy change. |
| 27 RLS INSERT | N/A: no inserts. |
| 28 RLS UPDATE | N/A: no updates. |
| 29 RLS DELETE | N/A: no deletes. |
| 30 Build | Passed: production demo build. |
| 31 Typecheck | Passed: standalone and build typecheck. |
| 32 Lint | Scoped passed; full-site failed on four unchanged Setlist warnings, documented. |
| 33 Units/integration | Changed tests passed; available full alternative 319 passed with coverage above thresholds. Unchanged CRLF-sensitive source test failure documented. |
| 34 E2E | Passed: Analytics 4/4 and existing website smoke 4/4. |
| 35 Security/dependencies | Review and secret scan completed; dependency audit failed on six baseline vulnerabilities, recorded for separate maintenance. No universal security-pass claim. |
| 36 Accessibility | Passed scoped QA: labels, keyboard focus/disclosures, table alternatives, contrast review, 320/375 overflow, reduced-motion chart visibility. |
| 37 Completion evidence | Passed: final scoped diff, candidate identities, actual results, independent acceptance, and remaining baseline limitations recorded. |

## Existing dependency risk

The read-only npm audit reported existing advisories in `baseline-browser-mapping`, `nanoid`, `next`, `sharp`, `source-map-js`, and `undici`. The installed Next.js version is 16.2.12 and audit reports critical advisories, including [Windows-hosted server remote code execution](https://github.com/advisories/GHSA-p293-qw3h-jr36). This finding predates Analytics source edits. Before the requested commit/push, `npm audit --omit=dev --audit-level=high` was rerun and again failed (exit 1) with six vulnerabilities: one moderate, four high, one critical. No automatic audit fix or site-wide dependency upgrade was run: the user authorized an Analytics-only change. The dependency audit is not claimed to have passed, and these advisories require separate maintenance before deployment.
