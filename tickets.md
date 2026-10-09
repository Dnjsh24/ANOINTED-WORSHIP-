# Website tickets

| ID | Task | Owner | Status |
| --- | --- | --- | --- |
| AN-001 | Implement the approved Analytics page design and complete its available team analytics | Maya | Done |

Completed: 1/1. Next ready task: none in the authorized Analytics scope. Blockers: none for this change. Separate maintenance findings: existing dependency advisories, unrelated Setlist lint warnings, and a Windows line-ending-sensitive template test; see evidence.

## AN-001 — Analytics page

- Baseline: `96615d3e0d1e1cdff28feb4c34a1fb286d8c79d9`; initial working tree clean.
- Scope: `/analytics` and its dedicated components, data helpers, styles, and tests only. Preserve all other pages and shared theme/navigation.
- Design reference: the user's approved Analytics screenshot. Charcoal backgrounds, restrained violet, three summary cards, song usage bars, attendance trend with period comparison, activity table, and modest rounded corners (approximately 12px). No glow, gradients, or decorative visual effects.
- Motion: subtle finite entrances/chart transitions; respect reduced motion; no repeated decorative motion.
- Data: retain song rotation, event-type availability, and channel message volume; show real date-filtered history, recent team activity, and available website team totals. Do not fabricate production statistics, lines, or activity. Demo data must be identified.
- Accuracy: attendance is confirmed availability, not verified physical presence. Compute weighted percentages and label denominators; handle absent data, query errors, and database row limits honestly.
- Authorization: preserve owner/admin access and authenticated, team-scoped reads. No changes to RLS, schema, credentials, or external services are planned.
- Risk: standard lane; read-only analytics expansion and scoped visual change. After implementation acceptance, the user explicitly authorized committing and pushing the current feature branch. No deployment is authorized.
- Dependencies: read-only data audit by Josh; sequential data implementation by Josh and UI implementation by Maya; independent review by Laura. No parallel implementation.
- File ownership: Josh owns dedicated Analytics domain/server helpers and data tests. Maya owns the Analytics route presentation, dedicated Analytics components/styles/component tests and Analytics E2E tests. Coordinator alone edits this ticket source and evidence report.

### Acceptance and validation

1. The page follows the selected layout with modest rounding and stays usable on desktop and mobile.
2. Date controls and chart/channel filters operate on the displayed data consistently.
3. All available analytics described above appear with honest units, periods, and empty/error states.
4. Reduced-motion, keyboard access, chart text alternatives, readable labels, and responsive overflow checks pass.
5. Existing website permissions and other pages remain intact.
6. Relevant unit/data/component tests, website lint, typecheck, website tests/coverage, production demo build, and Analytics desktop/mobile E2E checks run; exact results and limitations are recorded.
7. Independent QA review passes with no unresolved blocking findings; final diff and engineering gates are recorded in [the evidence report](docs/AN-001-ANALYTICS-EVIDENCE.md).

### Progress

- Intake: inspected route, dedicated component/tests, project navigation guide, validation configuration, and installed Next.js Server/Client Components guidance.
- Skills: coordinator loaded UI UX Pro Max, Caveman, Ponytail full, engineering-gates (including its 37 gates), and completion-mandate. Specialist skills are recorded with worker results.
- Data audit: Josh complete (read-only). Verified team-scoped sources, soft-delete/approval filters, message RLS restrictions, date semantics, exact totals, and pagination/error requirements. No migrations needed. Worker configuration: gpt-6.1-sol/high; effective runtime settings unverified. No separate Orca terminal was launched.
- UI preparation: Maya complete (read-only): required skills, existing dashboard/tests, AppShell/auth boundary, E2E setup, installed Next.js page/searchParams and Server/Client Components docs, and targeted UI UX Pro Max chart/focus searches. No source edits. Waiting for the data contract before UI implementation. An earlier escalated read was canceled before returning after approximately 144 seconds. Configuration: gpt-6-luna/max; effective runtime settings unverified. No separate Orca terminal was launched.
- Data implementation: Josh's four dedicated data files accepted after coordinator review. Targeted Vitest passed (25/25); owned-file ESLint passed. Coordinator corrected a floating-point test assertion with a numerical tolerance after the resumed worker session remained pending. No parallel implementation or separate Orca terminals.
- Baseline validation: `npm run typecheck` passed (exit 0). Installed Chromium available for local browser validation.
- Candidate validation and independent QA review: complete for the scoped change; exact results and existing project-wide limitations are recorded in the evidence report.
- Independent data review: Laura accepted the backend/access checkpoint with no blocking findings; independently passed all 25 targeted tests. UI review and rendered checks remain pending. Required review/security/accessibility skills loaded; effective runtime settings unverified.
- UI implementation: Maya delivered the scoped route/dashboard/CSS/component and route tests/Analytics E2E candidate. Targeted Vitest passed 8/8 across two files; owned-file ESLint passed with zero warnings. Source held stable for coordinator build and browser checks. The ticket remains Testing pending all acceptance evidence and independent UI review.
- QA correction: Maya added visible static song-bar and current-line states for reduced motion, with browser assertions. Scoped lint passed; rendered validation pending. This is the first correction of Laura's P1 finding.
- Final acceptance: Laura independently accepted the source and desktop/375px/320px/reduced-motion renders, with no unresolved blocking finding. Production demo build and typecheck passed. Final scoped lint passed. Analytics E2E 4/4 and existing website smoke E2E 4/4 passed. Alternative coverage passed 319 tests and all configured thresholds; full-site baseline failures remain explicitly recorded. No other page or shared style was edited. No deployment, commit, push, migration, or dependency upgrade performed.
- Delivery: user subsequently requested push. Commit and push target is the current `Dn-Jsh/UI-improvements` feature branch; deployment, dependency maintenance, and hosted Supabase testing remain outside this delivery action. The final delivery response records the actual push result.

## ANALYTICS-02 — Analytics visual enhancement (2026-10-08)

| ID | Task | Owner | Status |
| --- | --- | --- | --- |
| ANALYTICS-02 | Match the website theme/fonts, improve charts and add accessible animations | Coordinator; independent QA Laura | Done |

Acceptance: preserve date/source/filter behavior; inherit shared sans and mono font tokens; improve violet dark surfaces and mobile readability; add truthful availability and recent activity graphs; disable motion for reduced-motion users; scoped regression, lint, typecheck, build and desktop/mobile browser checks; independent review. Low-risk UI lane, no dependencies. Owner files: Analytics dashboard/CSS, new insight charts, existing Analytics tests and local evidence. No backend, authorization, schema, storage, caching, offline, dependency or environment changes. No publishing authorized. Baseline f5250bd clean. Required clean-code-typescript, accessibility-wcag, Caveman, Ponytail, engineering-gates and completion-mandate loaded. Coordinator runtime model/effort telemetry unavailable; native Laura role gpt-6.1-sol/medium configured, effective receipt unverified. Implementation complete; initial 29 targeted tests, scoped lint, root typecheck and whitespace pass. Completed 0/1. Next: final regressions, browser/build checks, independent review.

ANALYTICS-02 final settlement: 31 targeted tests pass, zero-warning scoped lint and root typecheck pass, final production-demo build passes, desktop/mobile Analytics E2E passes 4/4 including 320px/375px overflow, shared fonts, dates/filters, keyboard tables and reduced motion. Laura independently passed 6 component tests and approved final source and rendered screenshots. Unavailable badge and hover contrast findings fixed. Completed 1/1; no local blocker. Evidence: docs/ANALYTICS-ENHANCEMENT-2026-10-08.md. Local preview http://localhost:3232/analytics uses labelled demo data. No commit/push/deploy. Broad coverage and manual screen-reader/live-Supabase checks not claimed.

## ANALYTICS-03 — Simplify analytics controls (2026-10-09)

| ID | Task | Owner | Status |
| --- | --- | --- | --- |
| ANALYTICS-03 | From/To/Apply only, no enclosing date box or purple card glow | Coordinator; QA Laura | Done |

Criteria: preserve GET date filtering, remove 7/30/90 presets and enclosing date surface, use flat dark cards without shadows or purple gradients, retain chart accents and keyboard/mobile usability. Low-risk UI lane; no dependencies or backend/auth/schema/config changes. Files: analytics dashboard, CSS, existing E2E test. Completed 0/1. Next: scoped checks and independent review. No commit/push/deploy authorized. Skills: clean-code-typescript, Ponytail, accessibility-wcag, Caveman, engineering-gates, completion-mandate. Runtime model/effort telemetry unavailable.

ANALYTICS-03 final settlement: completed 1/1; no blockers. Strict scoped lint, fresh typecheck, 31 targeted tests, production-demo build and 4/4 desktop/mobile E2E pass. Laura independently approved the same final candidate and passed 23 tests; coordinator visually inspected desktop render. Evidence: docs/ANALYTICS-SIMPLIFICATION-2026-10-09.md. Next: user review of local preview at http://127.0.0.1:3232/analytics. No push/deploy performed.
