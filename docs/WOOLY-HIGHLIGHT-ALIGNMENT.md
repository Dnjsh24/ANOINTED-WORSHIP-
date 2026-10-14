# WOOLY-20: tutorial highlight alignment

Local implementation and independent source review are complete; visual acceptance remains unverified. Open Setlists, select Wooly → Tutorials → Show me this page. The first highlight should surround the Search setlists field with its existing six-pixel padding.

## Cause and correction

The search input already has the correct stable `setlist-search` target. Its containing page uses a moving entrance animation, but the old tracker only measured initially and on scroll/resize. CSS motion, font loading or another layout shift could leave the stored rectangle at an earlier position. A separate 200ms spotlight transition could also make the border lag behind a moving control.

The shared tracker now measures the active control on animation frames while its tour is open, keeping the spotlight and pointer target synchronized with its viewport bounds. It updates React only when those bounds or viewport dimensions change. It caches the control, checks missing/replaced/hidden controls at bounded lookup intervals, and scrolls a newly found control into view once. Cleanup cancels tracking when the step or route changes or the tour closes. Pending target-clear timers are also canceled on effect cleanup. The spotlight's independent geometry transition was removed.

The DOM regression test reproduces a field moving from y=130 to y=100 without dispatching scroll or resize and verifies the padded spotlight moves from y=124 to y=94. Additional checks cover resized controls, stable frames, viewport resize, late targets, desktop/mobile visibility, removal/replacement, zero-size targets, reduced motion, and cleanup.

## Scope

Runtime changes: `wooly-provider.tsx`, `wooly-target.ts`, and one declaration removed from `wooly.css`. Tests: `wooly-target.test.ts` and one regression added to `wooly-provider.test.tsx`. No tutorial content, target identifier, route, permission, progress/storage contract, mascot asset, chat/report workflow, database, dependency, credential or desktop behavior changed. Existing unrelated workspace changes are preserved.

Baseline snapshots, candidate SHA256 values and logs are in `output/wooly-highlight/`. The source audit proves the provider delta is confined to target tracking and the CSS delta is confined to the transition removal. Whole-file Git diffs are unsuitable because the existing Wooly feature is untracked.

## Verification

| Check | Result / evidence |
| --- | --- |
| Focused tests and coverage | 46/46 tests in 5 files pass; statements 91.58%, branches 86.34%, functions 87.9%, lines 98.17%. New tracker: 100% statements/lines/functions and 91.66% branches. Existing 80% thresholds unchanged. `tests.log`, `coverage/`. |
| Initial test attempt | New DOM fixture omitted `matchMedia`, producing one fixture failure; added the browser API mock and repeated successfully. `tests-first.log`. No production defect was suppressed. |
| Scoped lint | Zero-warning ESLint passed; final fixture edit also checked. `lint.log`. |
| Current-source types | Passed `.tmp/wooly/tsconfig.json`. `types.log`. |
| Preview production build | Passed. This is the animation preview build, not the full website release build. `preview-build.log`. |
| CSS / preservation / candidate audit | `audit.cjs` and `audit.log`. |
| Independent review | Laura approved the final five-file candidate with no actionable findings and verified candidate/baseline hashes. `independent-review.md`. |
| Browser / mobile / screen reader / installed PWA | Not run under the existing browser restriction. Source and simulated DOM geometry do not establish actual device acceptance. |

The ticket remains Review, completed 0/1 final acceptance, while allowed visual checks remain outstanding. Required source/scoped verification gates have the evidence above; the affected integration run after independent approval passed 46/46 tests (`integration-tests.log`). Full website build/types/lint limitations remain documented in `docs/WOOLY-CHAT-SUPPORT.md`; unrelated full suites were not repeated. Database, RLS, remote activation, dependencies, gold-lane dual approval and parallel worktree gates are N/A to this sequential geometry fix. There was one fixture correction and no repeated repair failures. Effective model/effort and usage telemetry are unavailable.
