# Wooly Quick Report and cloud greeting — WOOLY-16

2026-10-11. Local implementation complete; final visual and independent acceptance remains in Review, completed0/1.

On the [actual local website](http://127.0.0.1:3100/dashboard), the standing listening/nodding launcher faces left. An ivory cloud with lavender edging says **Need help?** while the panel is closed. The cloud disappears while help or a tour is open; reduced motion removes its entrance transition. Only the launcher artwork is mirrored, so text and target-specific tutorial pointing remain correct.

Click Wooly, then **Quick Report**, to open the existing Bug Report / Improvement form. The standalone violet bug launcher is hidden when Wooly is enabled. The form stays mounted in AppShell while help closes, preventing its state from disappearing during the handoff. Only one dialog remains open. Escape, Cancel, and Close return keyboard focus to the newly mounted Wooly launcher. When Wooly is disabled or absent, the original floating report trigger and its focus restoration remain available. Report access is registered only where the existing form is mounted; guest/preview pages do not gain a nonworking report option.

The existing report action, validation, verified account/team context, database insert, fields, replies, and automatic success dismissal are preserved. No report was sent to a real service during verification. The animation atlas, poses, full-character renderer, frame timing and tutorial progress logic are unchanged. No new dependency, image-generation job, backend, schema, migration, credential, persistent configuration, remote, deployment or separate desktop changes are included. Existing servers and unrelated workspace changes were preserved. The local website's existing sample-data/account limitations remain documented in [WOOLY-13](WOOLY-MAIN-WEBSITE.md).

## Verification

Baselines, candidate/artwork hashes, coverage and command logs: `output/wooly-report-cloud/`. Application scope: `src/components/wooly/wooly-provider.tsx`, `src/components/wooly/wooly.css`, and `src/components/quick-report-button.tsx`. Added eight DOM integration cases in `wooly-report.test.tsx`; updated the existing mobile E2E selectors for the report handoff, without running browser automation.

| Check | Result |
| --- | --- |
| Focused unit/integration suite | Pass: 14 files, 103 tests, 35.01s. Eight new cases cover one-dialog handoff, decorative idle greeting, keyboard wrapping, Escape/Cancel/Close focus restoration, original body scroll restoration, no automatic report submission, report payload/error reply, disabled-feature fallback, callback cleanup, paused-tour continuation, and enabled/disabled server hydration. |
| Existing aggregate 80% coverage thresholds | Pass unchanged: statements92.54%, branches88.46%, functions90.52%, lines97.23%. Coverage includes the report component. |
| Current-source TypeScript | Pass: `.tmp/wooly/tsconfig.json`. One callback annotation corrected after the initial typecheck; no runtime behavior changed after the full test pass. |
| Strict changed TypeScript/E2E lint | Pass: zero warnings, repeated for the final annotation. |
| CSS parser and baseline whitespace review | Pass. Four changed baseline comparisons and one unchanged regression snapshot have no whitespace diagnostics. Git no-index exit1 means a content difference, not a whitespace failure. |
| Isolated preview production build | Pass: 49 modules, 694ms; CSS11.32kB and JavaScript252.70kB before gzip. This build covers Wooly, not the actual report form or a full Next production build. |
| Actual local website | Existing Next server hot-compiles and dashboard requests log HTTP200. No agent browser session or HTTP UI inspection was performed. |
| Server rendering | Enabled and disabled React server-render/hydration integration cases pass with no recoverable hydration error. Development logs recorded a hydration mismatch/full-refresh warning while the component exports were changing; final browser confirmation is still pending. |
| Source/security review | Coordinator reviewed all application/E2E deltas against baseline and traced the unchanged `submitFeedbackAction` validation and verified team/profile insert. No new data authority or service access. |
| Artwork integrity | Atlas SHA256 `a188ec1a1179edb7cb90bcd04ed9bc47a9cc7c65f86728f1caa8595465559cb1`; pointing SHA256 `c3217db8cc3c744bc07f60619b94bf40150478d984247d323ee57a35011da382`, unchanged from the previous candidate. |
| Device/browser/screen-reader and independent review | Unverified under the existing browser restriction and reviewer account usage limit. No substitute browser route or replacement agent was used. |

The first report test run exposed an incomplete test save-action fixture; the second exposed an incorrect test-only resume label. Both were corrected, and the report suite then passed8/8 before the full103-test pass. The initial typecheck required an explicit nullable callback annotation and passed on repeat. No issue reached three failed repair attempts. Effective model, effort and usage telemetry is unavailable, not zero.

Exact scoped commands:

```powershell
$env:TEMP = Join-Path (Get-Location) '.tmp'
$env:TMP = $env:TEMP
npx vitest run --config vitest.website.config.ts src/components/wooly src/lib/domain/wooly.test.ts src/lib/domain/wooly-page-guides.test.ts src/app/wooly-actions.test.ts src/lib/supabase/wooly-migration.test.ts --exclude 'output/**' --exclude '.tmp/**' --maxWorkers=2 --coverage '--coverage.include=src/components/wooly/*.ts*' --coverage.include=src/components/quick-report-button.tsx --coverage.include=src/lib/domain/wooly.ts --coverage.include=src/lib/domain/wooly-page-guides.ts --coverage.include=src/app/wooly-actions.ts --coverage.reportsDirectory=output/wooly-report-cloud/coverage
npx tsc --noEmit --project .tmp/wooly/tsconfig.json
npx eslint src/components/wooly/wooly-provider.tsx src/components/wooly/wooly-report.test.tsx src/components/quick-report-button.tsx e2e/wooly.spec.ts --max-warnings=0
node output/wooly-animation/build.mjs
node -e 'const fs = require("fs"); require("lightningcss").transform({filename:"wooly.css", code:fs.readFileSync("src/components/wooly/wooly.css")}); console.log("Wooly CSS parsed successfully");'
```

## Gate settlement

Existing clean TypeScript, accessibility, engineering-gates and completion-mandate guidance reused. Standard lane, one implementer. The unchanged full-root lint/type/build and local database limitations are documented in [WOOLY-11](WOOLY-PAGE-GUIDES.md); no new full-root pass is claimed.

| Gates | Status and evidence |
| --- | --- |
| 01–06 | Pass: outcome, criteria, website/local-only constraints, modal/focus risk, dependencies and accountable owner recorded in tickets.md. |
| 07–12 | Pass: provider/AppShell/report/action conventions inspected; callback contract, retained form lifetime, stable callback registration cleanup, focus handoff and meaningful checks defined. |
| 13 | N/A: no parallel implementation or new worktree. |
| 14–18 | Pass: existing required skills reused; typed nullable handler, descriptive report naming, existing form/action and controller reused rather than duplicated. |
| 19 | Pass for scope: no routes or dependencies added; provider already hosted globally, preview bundle verified and actual website compiles. |
| 20 | Pass for source/DOM: matching enabled/disabled server hydration tested. Final browser acceptance remains open. |
| 21–22 | Pass: unchanged server validation/account scope inspected; existing form error reply tested and no report submission occurs on opening. |
| 23–29 | N/A: no schema or database authority changes. No remote database or migration operation performed. |
| 30 | Scoped preview build and actual website hot compilation pass. Full Next production build not repeated; earlier root blockers retained. |
| 31–33 | Pass: final current-source types/lint and103 tests with unchanged coverage gates. |
| 34 | Unverified: existing E2E scenario updated but browser automation remains restricted. |
| 35 | Pass for scoped source review: unchanged authenticated report action, no new dependencies or external services, decorative SVG contains no user content. |
| 36 | DOM/source checks pass for semantic names, description, decorative cloud/artwork, visible focus, trap/restoration, and reduced-motion styling. Real device and screen-reader checks remain open. |
| 37 | Coordinator final delta review and candidate evidence recorded; independent approval remains unavailable. Final acceptance stays Review. |

Next: allowed desktop/mobile and screen-reader confirmation, then independent review of the recorded candidate. No rollout or remote change is authorized by this ticket.
