# Wooly disappearance investigation and recovery — WOOLY-26

Status: Testing. Local recovery only; live publication and activation remain separate approvals.

## Confirmed cause

The production alias `anointed-worship-app.vercel.app` resolves to READY deployment `dpl_DQ88KLgVxKAniFj2aKy77RGXZTag`, built from main `36e5760a2cadea054555cbb2ed852530632a7dc8`. That commit has no Wooly provider, registrations or character assets. PR [#11](https://github.com/Dnjsh24/ANOINTED-WORSHIP-/pull/11) remains OPEN, head `0675c983be623df44429b813c6c0eac25515d164`, with `mergedAt=null`. The latest safeguards push did not delete Wooly: its six-file diff contains no application changes. Wooly never merged into the current production main lineage.

Read-only Vercel project environment metadata also contains no `WOOLY_TUTORIAL_ENABLED` key. The existing implementation requires that server flag equal `1`; default-off remains intentional until operators verify installation and activate it.

CI run [38161764880](https://github.com/Dnjsh24/ANOINTED-WORSHIP-/actions/runs/38161764880) passed quality and browser. Both Wooly local security scripts reported success, but support fixture cleanup failed: deleting a fixture team cascaded into songs; the song BEFORE DELETE trigger inserted a tombstone into `worship_sync_changes` after the team no longer existed, violating `worship_sync_changes_team_id_fkey`. This is a test cleanup failure, not evidence of lost hosted songs or account data.

A new browser check of the recovered production build exposed a second source bug: the always-mounted closed mobile navigation drawer has `role=dialog`, `aria-hidden=true`, and `inert`. Wooly's unfiltered dialog lookup treated it as open and hid the launcher on desktop and mobile. This would prevent successful activation even after merging the old feature unchanged.

## Local recovery and boundaries

Isolated managed checkout: `C:/Users/danje/.codex/worktrees/wooly-recovery/Anointed worship setlist - Copy`, branch `codex/wooly-recovery`, started from fetched current main. The reviewed Wooly feature was merged locally; the original dirty checkout is preserved. The sole setlist-form merge conflict retained main's standalone/Timeline explanation and added only Wooly targets. Current main's actions, standalone tests, Analytics, icons, PWA, release safeguards, policy migrations and dependency files are retained.

Cleanup deletes validated test-team setlists, events and songs before deleting their teams, within the existing transaction. It retains all database triggers and constraints, exact UUID validation, same-run scoping, owner guard and failure reporting. No hosted cleanup is run.

Dialog detection excludes hidden/inert/aria-hidden elements and CSS-hidden ancestors. Its observer tracks visibility attributes so opening/closing an already-mounted drawer is recognized. Visible external dialogs still suppress the launcher. No permission, team scope, schema or support role changes are introduced by this repair.

Added dedicated desktop/mobile CI smoke for launcher availability, Help keyboard dismissal/focus return, current standalone setlist copy and viewport fit. The generic flag-off suite remains separate. A migration-source assertion accepts CRLF and LF without changing SQL/security requirements.

Coordinator owns the inherited, previously reviewed Wooly integration plus cleanup helper/test, provider/test, migration test portability, dedicated browser smoke/CI and this evidence. Laura owns read-only independent review. Standard lane; integration, modal visibility and local fixture ordering risks. No gold lane. Skills used: caveman, ponytail, clean-code-typescript, db-migration-discipline, engineering-gates, completion-mandate; reviewer code-review/security-review/accessibility-wcag. Effective model/effort/usage unavailable; configured Laura gpt-6.1-sol medium.

## Acceptance and verification

- Identify missing production code and configuration: passed through fetched Git, PR metadata and deployment/environment APIs.
- Preserve current main and unrelated workspace work: source/tree comparison passed; full final manifest and scope checks recorded below.
- Reproduce and repair local cleanup contract: regression failed before the fix; corrected tests pass. Full PostgreSQL runtime still unavailable because Docker Linux engine is not running.
- Reproduce and repair hidden-drawer launcher failure: first production browser run failed 2/2; both unit regressions failed before the visibility fix. Final affected and browser results recorded below.
- Initial full website run: 150 files / 1,140 tests passed. Coverage statements 87.63%, branches 84.08%, functions 92.68%, lines 90.62%, meeting all existing 80% gates. Coverage surface is the configured deterministic website business/security logic; it does not measure every Wooly component.
- Initial full website lint, typecheck and enabled demo production build passed. Final provider checks/build recorded below.
- `npm audit --omit=dev --audit-level=high`: 0 vulnerabilities. Full audit: 5 pre-existing high findings in the development ESLint/micromatch/braces chain; no dependency edits or forced downgrade.
- Secret scan: 0 findings, detector self-test passed, 2,749 history blobs / 389 messages / 790 working files scanned. Existing oversized classification/skips remain reported by the scanner.
- Initial Laura review: 81 unique targeted tests passed, no source findings; final provider amendment requires renewed approval below.

Read-only metadata of the connected active `ANOINTED WORSHIP 2` Supabase project shows all five `wooly_*` tables exist with RLS enabled. This establishes presence only. It does not establish full schema parity, live two-account authorization, or the Vercel database linkage. No migrations or support grants were applied.

## Remaining deployment work

After explicit authorization: refresh main, publish the focused updated PR, require successful current-head quality/browser/local-database checks, merge through protected main, verify hosted Wooly schema and authorization, activate the production flag, and deploy only the merged main SHA. Confirm the production alias SHA and authenticated dashboard launcher. Never promote the historical feature preview.

During final verification main advanced to `e719b245605668685a16aa18008dcb1f021183a0` through PR #15. This recovery merged that updated main and resolved three conflicts individually, preserving rehearsal demo persistence, saved Stage notes and error handling. The same main update includes the independently reviewed literal Next.js path correction, so no release-guard source change belongs to the Wooly diff. Final required scope CLI result is recorded below.

Engineering gates 01–22: intake, isolation, ownership, source integration, type/style, visibility, errors and validated IDs verified. Gates 23–29: existing additive feature migrations retained; live schema/RLS acceptance is pending, with source security tests and previous CI as partial evidence. Gates 30–37: final local build/types/lint/tests/browser/review results below; production acceptance and release gate remain pending. No issue reached three failed repair attempts. One cleanup repair and one visibility repair; CRLF portability is a separate test-only correction.

## Frozen task ownership against current main

```text
.env.example
.github/workflows/website-ci.yml
docs/WOOLY-ANIMATION.md
docs/WOOLY-ARTICULATED-RIG.md
docs/WOOLY-CHARACTER-LAUNCHER.md
docs/WOOLY-CHAT-SUPPORT.md
docs/WOOLY-CLEAR-TUTORIALS.md
docs/WOOLY-EXPANDED-HELP.md
docs/WOOLY-FEATURE-COVERAGE.md
docs/WOOLY-FREE-FRAME-ANIMATION.md
docs/WOOLY-GREETING.md
docs/WOOLY-HIGHLIGHT-ALIGNMENT.md
docs/WOOLY-LARGE-DIALOGUE.md
docs/WOOLY-MAIN-WEBSITE.md
docs/WOOLY-MAYBE-LATER.md
docs/WOOLY-NOD-AND-WALK.md
docs/WOOLY-ORIGINAL-FRAMES.md
docs/WOOLY-PAGE-GUIDES.md
docs/WOOLY-PUSH-REVIEW.md
docs/WOOLY-PUSH.md
docs/WOOLY-REPORT-CLOUD.md
docs/WOOLY-SIMPLE-CONTROLS.md
docs/WOOLY-SMOOTH-MOTION.md
docs/WOOLY-SQL-REVIEW.md
docs/WOOLY-STANDING-TALK.md
docs/WOOLY-STATIONARY-60FPS.md
docs/WOOLY-SUPABASE-SETUP.md
docs/WOOLY-TUTORIAL.md
docs/WOOLY-WHOLE-CHARACTER-FRAMES.md
docs/testing/wooly-recovery-2026-10-14.md
e2e/wooly-availability.spec.ts
public/brand/wooly/four-leg-reference-v1.png
public/brand/wooly/whole-frames-v2.json
public/brand/wooly/whole-frames-v2.webp
public/brand/wooly/whole-frames-v3.json
public/brand/wooly/whole-frames-v3.webp
public/brand/wooly/whole-neutral-v2.webp
public/brand/wooly/whole-pointing-v1.webp
public/brand/wooly/whole-wave-closed-v2.webp
scripts/local-team-fixture-cleanup.mjs
scripts/local-team-fixture-cleanup.test.mjs
scripts/test-wooly-security.mjs
scripts/test-wooly-support-security.mjs
src/app/dance/[id]/page.tsx
src/app/events/[id]/page.tsx
src/app/layout.tsx
src/app/login/page.tsx
src/app/members/[id]/page.tsx
src/app/page.tsx
src/app/pending/page.tsx
src/app/reminders/page.tsx
src/app/setlists/[id]/confidence/confidence-client.tsx
src/app/setlists/[id]/confidence/page.tsx
src/app/setlists/[id]/page.tsx
src/app/setlists/[id]/practice/page.test.tsx
src/app/setlists/[id]/practice/page.tsx
src/app/setlists/[id]/practice/practice-tools-panel.tsx
src/app/setlists/[id]/projector/page.tsx
src/app/setlists/[id]/projector/projector-client.tsx
src/app/setlists/[id]/projector/wooly-registration.test.tsx
src/app/setlists/[id]/remote/remote-client.tsx
src/app/setlists/[id]/stage/page.test.tsx
src/app/setlists/[id]/stage/page.tsx
src/app/setlists/[id]/stage/stage-mode-client.tsx
src/app/setlists/templates/page.tsx
src/app/support/wooly/page.tsx
src/app/teams/layout.tsx
src/app/teams/new/page.tsx
src/app/teams/page.tsx
src/app/wooly-actions.test.ts
src/app/wooly-actions.ts
src/app/wooly-chat-actions.test.ts
src/app/wooly-chat-actions.ts
src/app/wooly-support-actions.test.ts
src/app/wooly-support-actions.ts
src/app/worship-remote/layout.tsx
src/app/worship-remote/session/[sessionId]/page.tsx
src/app/worship-remote/worship-remote-client.tsx
src/components/action-form.tsx
src/components/announcements-feed.tsx
src/components/app-shell.tsx
src/components/arrangement-editor.tsx
src/components/dance-chart-form.tsx
src/components/dance-library-list.tsx
src/components/edit-band-notes-button.tsx
src/components/event-delete-button.tsx
src/components/event-form.tsx
src/components/events-client.tsx
src/components/invite-member-form.tsx
src/components/join-requests-client.tsx
src/components/join-team-form.tsx
src/components/members-client.tsx
src/components/messages-client.tsx
src/components/mobile-icon-rail.tsx
src/components/notice-composer.tsx
src/components/pending-client.tsx
src/components/profile-form.tsx
src/components/quick-report-button.tsx
src/components/save-as-template-button.tsx
src/components/search-box.tsx
src/components/setlist-form.tsx
src/components/setlist-song-picker.tsx
src/components/setlist-template-picker.tsx
src/components/setlists-client.tsx
src/components/settings-client-view.tsx
src/components/song-form.tsx
src/components/song-library-grid.tsx
src/components/song-trash-list.tsx
src/components/song-viewer.tsx
src/components/wooly/use-wooly-chat.ts
src/components/wooly/use-wooly-greeting.test.tsx
src/components/wooly/use-wooly-greeting.ts
src/components/wooly/use-wooly-questions.ts
src/components/wooly/wooly-article-editor.tsx
src/components/wooly/wooly-chat-view.tsx
src/components/wooly/wooly-chat.css
src/components/wooly/wooly-chat.test.tsx
src/components/wooly/wooly-frames.test.ts
src/components/wooly/wooly-frames.ts
src/components/wooly/wooly-help-views.tsx
src/components/wooly/wooly-instructions.test.tsx
src/components/wooly/wooly-instructions.tsx
src/components/wooly/wooly-mascot.css
src/components/wooly/wooly-mascot.test.tsx
src/components/wooly/wooly-mascot.tsx
src/components/wooly/wooly-motion-assets.ts
src/components/wooly/wooly-motion.test.ts
src/components/wooly/wooly-motion.ts
src/components/wooly/wooly-provider.test.tsx
src/components/wooly/wooly-provider.tsx
src/components/wooly/wooly-public-screen.tsx
src/components/wooly/wooly-questions-view.tsx
src/components/wooly/wooly-renderer.test.ts
src/components/wooly/wooly-renderer.ts
src/components/wooly/wooly-report.test.tsx
src/components/wooly/wooly-screen-context.test.tsx
src/components/wooly/wooly-screen.tsx
src/components/wooly/wooly-support-inbox.tsx
src/components/wooly/wooly-support-ui.test.tsx
src/components/wooly/wooly-target-pointer-ui.test.tsx
src/components/wooly/wooly-target-pointer.test.ts
src/components/wooly/wooly-target-pointer.tsx
src/components/wooly/wooly-target.test.ts
src/components/wooly/wooly-target.ts
src/components/wooly/wooly-task-list.tsx
src/components/wooly/wooly-team-screen.tsx
src/components/wooly/wooly-thread.tsx
src/components/wooly/wooly.css
src/lib/domain/wooly-chat.test.ts
src/lib/domain/wooly-chat.ts
src/lib/domain/wooly-expanded.test.ts
src/lib/domain/wooly-knowledge.ts
src/lib/domain/wooly-matching.test.ts
src/lib/domain/wooly-matching.ts
src/lib/domain/wooly-page-guides.test.ts
src/lib/domain/wooly-page-guides.ts
src/lib/domain/wooly-permissions.ts
src/lib/domain/wooly-surfaces.ts
src/lib/domain/wooly-task-details.ts
src/lib/domain/wooly-task-step-ids.ts
src/lib/domain/wooly-tasks.ts
src/lib/domain/wooly.test.ts
src/lib/domain/wooly.ts
src/lib/server/wooly-context.test.ts
src/lib/server/wooly-context.ts
src/lib/server/wooly-records.test.ts
src/lib/server/wooly-records.ts
src/lib/supabase/database.types.ts
src/lib/supabase/wooly-migration.test.ts
src/lib/supabase/wooly-support-migration.test.ts
supabase/migrations/20261009010000_wooly_tutorial_progress.sql
supabase/migrations/20261011010000_wooly_page_guides.sql
supabase/migrations/20261011020000_wooly_chat_support.sql
supabase/migrations/20261011030000_wooly_feature_tasks.sql
supabase/wooly-sql-editor-setup.sql
supabase/wooly-support-account.sql
tickets.md
```
## Final local verification and review

- Final current-main full website lint and enabled demo production build: passed. Build includes TypeScript and the new rehearsal route. A temporary test-only build failure from an unsupported Testing Library `exact` option was corrected; string role-name matching remains exact.
- Current-main affected integration: 15 files / 106 tests passed. After visibility fix: 4 files / 61 tests passed. Strict changed-source ESLint, final full typecheck, helper syntax and secrets scan passed.
- Final production-build Playwright: 2/2 desktop/mobile Wooly availability tests passed in 6 seconds. Home/new-setlist launcher, Help open/Escape/focus return, viewport fit, standalone explanation and no hosted Supabase requests verified. Screenshot visually inspected at `.tmp/wooly-recovery-dashboard.png`; local demo preview is http://127.0.0.1:3195/dashboard.
- Laura renewed approval of application candidate547e03f against maine719b24 after 4 files / 50 independent tests. Provider source blob f8b20029ac6574799400d51179c41f18b8de8399; final provider test5d13595ec4bce64008c6b9e7831f3ca7494bc250; practice502bcf0692cc20990fee11c916ec8fbec6b19b5d; stage8516ca8ac844694ab1995e814b922440293927f5; stage test2f37bd3703aeec82d0b4f3949cb7771e4e6c7a48. Previous cleanup/CI/E2E identities remain unchanged.
- The broad current-main run initially passed1,174tests and failed one catalog-completeness assertion for the new rehearsal route. Explicitly classified that route as unsupported help until real guide/checkpoints are verified, without changing runtime eligibility, permissions, persisted checkpoints or migrations. Three affected files/245tests pass; Laura independently passes5catalog tests and approves metadata bloba9db35a2681c03bc74e6308695c9310d0fbb94e2. `woolyOperationalRoutes` is referenced only by the catalog test, so the final build/browser's application behavior is unchanged by this metadata correction.
- Unchanged main comparisons: Analytics, all public assets outside Wooly, actions/standalone regressions, new rehearsal implementation apart from Wooly registrations/targets, release guard, dependency manifests and lock are preserved. Original dirty workspace is untouched apart from this task's appended ticket record.

Local Docker SQL runtime is unavailable. Previous CI establishes positive security assertions, and the corrected cleanup has contract/source review evidence; a new successful protected local-database check remains required before merge. Hosted authenticated visual acceptance is pending authorized publication/activation. No live writes, push, remote merge or deployment occurred. Final full coverage and clean exact-path CLI result follow below.
