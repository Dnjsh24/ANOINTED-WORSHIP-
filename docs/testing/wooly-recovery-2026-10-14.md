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

The current main scope checker rejects literal Next.js `[id]` paths before checking Git scope. Its already-reviewed bracket correction is present in the separate rehearsal release candidate, not yet main. Do not silently weaken or bypass this guard. Before publication, integrate current main if that prerequisite has merged, or seek a narrowly reviewed prerequisite correction. Local exact-path/main-preservation checks are still recorded as an alternative; the required release CLI gate is not claimed passed.

Engineering gates 01–22: intake, isolation, ownership, source integration, type/style, visibility, errors and validated IDs verified. Gates 23–29: existing additive feature migrations retained; live schema/RLS acceptance is pending, with source security tests and previous CI as partial evidence. Gates 30–37: final local build/types/lint/tests/browser/review results below; production acceptance and release gate remain pending. No issue reached three failed repair attempts. One cleanup repair and one visibility repair; CRLF portability is a separate test-only correction.
