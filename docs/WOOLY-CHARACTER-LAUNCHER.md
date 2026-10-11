# Wooly character launcher — WOOLY-15

2026-10-11. Local implementation complete; final visual/independent acceptance remains in Review.

The launcher is now the complete Wooly character, standing and gently listening/nodding. The question-mark icon, text label, pill border and background are removed. Click or keyboard-activate Wooly to open the existing help/tutorial panel. Its accessible button name remains **Wooly**, with an “Open Wooly” tooltip and visible keyboard focus. The character occupies 96px on desktop and 80px on phones; the existing bottom offsets keep the launcher above navigation and the bug-report button.

The launcher reuses the approved whole-image listening loop and neutral fallback. No artwork, frame timing or renderer changes are included. The existing reduced-motion setting displays the static whole character, background tabs suspend playback, and opening the panel pauses the launcher while the larger tutorial companion remains available. No nested buttons, mascot Pause button or typing controls are introduced.

Open [the actual local dashboard](http://127.0.0.1:3100/dashboard) and click Wooly. The existing server and isolated preview were preserved. This is the local website selected by the user; the [WOOLY-13 sample-data/account limitations](WOOLY-MAIN-WEBSITE.md) remain. No deployment, remote service, schema, permissions, data, credential, environment, dependency or separate desktop changes occurred.

## Scope and verification

Application changes are limited to `wooly-provider.tsx` and `wooly.css`. The existing provider focus/opening regression now also covers the listening launcher and pause/resume across panel opening/closing. An old global pointing-image selector was scoped to the tutorial companion because two mascot instances now exist. Baselines, final hashes and logs are in `output/wooly-character-launcher/`.

| Check | Result |
| --- | --- |
| Focused regressions | Pass: 13 files, 95 tests, 21.84s. Covers accessible launcher activation, focus trap/restoration, panel pause/resume, reduced motion, renderer lifecycle, typing and existing navigation/progress/permission behavior. |
| Existing aggregate coverage thresholds | Pass unchanged: statements 91.69%, branches 87.68%, functions 88.77%, lines 97.44%. |
| Current-source TypeScript | Pass with `.tmp/wooly/tsconfig.json`. The final selector-only test repair changes no TypeScript contract. |
| Strict provider/test lint | Pass, zero warnings; repeated after the test selector correction. |
| CSS parsing and baseline whitespace checks | Pass. Three baseline comparisons have no whitespace diagnostics. |
| Isolated preview production build | Pass: 48 modules, 511ms; CSS 10.28kB, JavaScript 251.03kB before gzip. No full Next production build claim. |
| Local website | Existing server logs show hot compilation and dashboard HTTP200 after the source changes. This is application-log evidence, not an agent browser test. |
| Coordinator review | Final three-file delta reviewed against baseline. Existing whole-character assets and renderer are untouched; the launcher passes no interactive mascot callback, preventing nested buttons. |
| Visual/device and independent review | Unverified under the existing browser policy restriction and QA account usage limit. No alternate browser access or substitute agent was used. |

The initial run passed 94 tests and failed one obsolete global mascot selector: it found the new neutral launcher instead of the pointing tutorial companion. Scoping that selector repaired the test; the complete focused repeat passes. Initial evidence is retained in `initial-tests.log`. No production repair or three-failure loop occurred.

Exact scoped checks:

```powershell
$env:TEMP = Join-Path (Get-Location) '.tmp'
$env:TMP = $env:TEMP
npx vitest run --config vitest.website.config.ts src/components/wooly src/lib/domain/wooly.test.ts src/lib/domain/wooly-page-guides.test.ts src/app/wooly-actions.test.ts src/lib/supabase/wooly-migration.test.ts --exclude 'output/**' --exclude '.tmp/**' --maxWorkers=2 --coverage '--coverage.include=src/components/wooly/*.ts*' --coverage.include=src/lib/domain/wooly.ts --coverage.include=src/lib/domain/wooly-page-guides.ts --coverage.include=src/app/wooly-actions.ts --coverage.reportsDirectory=output/wooly-character-launcher/coverage
npx tsc --noEmit --project .tmp/wooly/tsconfig.json
npx eslint src/components/wooly/wooly-provider.tsx src/components/wooly/wooly-provider.test.tsx --max-warnings=0
node output/wooly-animation/build.mjs
```

## Gate settlement

Existing clean TypeScript, accessibility, minimal-change, engineering-gates and completion-mandate guidance was reused. Standard lane, one implementer. Gates01–12 and14–22 pass within the scoped source review and checks; gate13 is N/A. Gates23–29 are N/A because there are no database changes. Gates30–33 pass for the scoped bundle/types/lint/tests; earlier full-root build/lint/type limitations remain in WOOLY-11 and were not rerun for this small UI change. Gate34 remains unverified. Gate35 passes source scope without new dependencies, services or data boundaries. Gate36 has local semantic button/focus, decorative-image and reduced-motion evidence; real device/screen-reader acceptance remains open. Gate37 has coordinator diff review and candidate evidence but no final independent approval.

Status Review, completed0/1 final acceptance. Next: allowed desktop/mobile and screen-reader confirmation, then independent review of the recorded candidate. Effective model/effort/usage telemetry is unavailable, not zero. No migration, paid media job, push or deployment was performed.
