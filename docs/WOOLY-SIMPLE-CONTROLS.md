# Wooly controls — WOOLY-14

2026-10-11. Local implementation complete; final visual/independent acceptance remains in Review.

The actual local website now labels the launcher **Wooly**, including its accessible name. The mascot in its speech-bubble panel has no Pause/Play button. Both instruction controls are removed entirely, including their “Typing complete” and “Full text shown” states. Text types automatically, and the essentials finish instruction now says “Open Wooly.”

The shared mascot defaults to playback without a control; its existing pause callback remains optional for the separate animation-preview tools. The website no longer owns mascot-pause state or supplies that callback. Whole-character assets, renderer timing, reduced-motion stills, automatic typing, complete-text screen-reader announcement, Close/Escape, focus restoration and Back/Next/Skip remain. Closing the panel hides the character and disposes its renderer. No extra hidden or replacement buttons were added.

See the change at [the actual local dashboard](http://127.0.0.1:3100/dashboard), then choose **Wooly → Show me this page**. The existing Next.js server and isolated animation-preview server were preserved. Sample-data/account limitations from [WOOLY-13](WOOLY-MAIN-WEBSITE.md) remain. No data, authentication, permissions, schema, dependency, credential, environment, deployment or separate desktop changes are included.

## Scope and checks

Five application files changed: the provider, instructions, mascot, panel CSS and essentials catalog wording. Three existing unit files and the existing browser-test launcher selectors were updated for the new UI. Baseline copies, final nine-file hashes, logs and coverage are under `output/wooly-simple-controls/`. No new tests mirror CSS or implementation details.

| Check | Result |
| --- | --- |
| Focused unit/integration regressions | Pass: 13 files, 95 tests, 31.80s. Updated existing cases verify whole-character autoplay with no website control, automatic complete typing without buttons, timer cleanup and reduced motion. Existing keyboard/focus, navigation, checkpoint, permission and failure cases pass. |
| Existing aggregate coverage thresholds | Pass unchanged: statements 91.69%, branches 87.68%, functions 88.77%, lines 97.44%. |
| Current-source TypeScript | Pass using `.tmp/wooly/tsconfig.json`, excluding archived output and the separate mobile project. |
| Strict changed TypeScript/E2E-source lint | Pass: zero warnings. |
| CSS parser | Pass with installed Lightning CSS. |
| Isolated preview production bundle | Pass: 49 modules, 988ms. CSS 10.22kB; JavaScript 251.20kB before gzip. |
| Actual local Next.js server | Existing server logs show successful hot compilation followed by dashboard HTTP200 responses. These are observed application logs, not agent browser tests. Existing non-fatal Next Image LCP/eager-loading warnings remain. |
| Coordinator diff/whitespace review | Reviewed changes against this ticket's baseline; no unrelated edits or whitespace diagnostics. Existing artwork/renderer source is untouched. |
| Browser/device and independent review | Unverified: existing browser policy restriction and independent QA account usage limit persist. No substitute agent or alternate browser access was used. E2E launcher selectors were updated and type/lint checked; the browser suite was not run. |

Exact scoped commands:

```powershell
$env:TEMP = Join-Path (Get-Location) '.tmp'
$env:TMP = $env:TEMP
npx vitest run --config vitest.website.config.ts src/components/wooly src/lib/domain/wooly.test.ts src/lib/domain/wooly-page-guides.test.ts src/app/wooly-actions.test.ts src/lib/supabase/wooly-migration.test.ts --exclude 'output/**' --exclude '.tmp/**' --maxWorkers=2 --coverage '--coverage.include=src/components/wooly/*.ts*' --coverage.include=src/lib/domain/wooly.ts --coverage.include=src/lib/domain/wooly-page-guides.ts --coverage.include=src/app/wooly-actions.ts --coverage.reportsDirectory=output/wooly-simple-controls/coverage
npx tsc --noEmit --project .tmp/wooly/tsconfig.json
npx eslint src/components/wooly/wooly-provider.tsx src/components/wooly/wooly-instructions.tsx src/components/wooly/wooly-mascot.tsx src/components/wooly/wooly-provider.test.tsx src/components/wooly/wooly-instructions.test.tsx src/components/wooly/wooly-mascot.test.tsx src/lib/domain/wooly.ts e2e/wooly.spec.ts --max-warnings=0
node output/wooly-animation/build.mjs
```

## Gate settlement

Existing clean TypeScript, minimal-change, accessibility, engineering-gates and completion-mandate guidance was reused. The explicit user request supersedes the earlier plan's visible pause/reveal controls. Standard lane; one implementer. Gates 01–12 and 14–22 pass locally: criteria/scope/ownership recorded, existing component and validated catalog boundaries reused, source types and failure handling preserved. Gate13 is N/A to one implementer. Gates23–29 are N/A to this UI delta; no database contract changes. Gates30–33 pass for the scoped bundle/types/lint/tests. Existing full-root build/type/lint limitations remain as recorded in WOOLY-11 and were not rerun for this small UI change. Gate34 remains unverified. Gate35 passes source scope with no service/dependency/data-boundary changes. Gate36 has passing local reduced-motion, decorative-image, screen-reader and keyboard behavior evidence; device acceptance is outstanding. Gate37 has coordinator review and candidate evidence but no final independent approval.

Status Review, completed0/1 final acceptance. Next: allowed visual/screen-reader confirmation and independent review of the recorded candidate. No repair attempt failed. Effective model/effort/usage telemetry is unavailable, not zero. No push, deployment or remote changes occurred.
