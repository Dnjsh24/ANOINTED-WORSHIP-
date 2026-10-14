# Larger Wooly dialogue — WOOLY-12

2026-10-11. Local implementation complete; final acceptance remains in Review.

Wooly now stands outside a rounded charcoal speech bubble. The full-character area increases from 72px to 216px on desktop and 144px on phones. Short phone viewports use 112px beside the bubble to preserve room for instructions. The lavender border and decorative tail connect the dialogue visually to Wooly, while violet tutorial buttons retain the website theme.

Typed instructions remain inside the bubble. Its content scrolls independently, its close header stays reachable, and the existing typing, animation pause, Back, Next, Skip, help, resume and keyboard behavior remain. The phone layout puts Wooly above the bubble, with the animation pause control beside the character rather than over the feet. The desktop controller's positioning calculation uses the same 616px width as the new layout.

Only `src/components/wooly/wooly-provider.tsx` and `src/components/wooly/wooly.css` change application behavior in this ticket. Existing animation frames, rendering, timing and artwork are preserved. There are no new dependencies, authentication or permission changes, schema changes, remote writes, feature activation or separate desktop changes. Earlier workspace work is preserved.

## View locally

Open [the existing preview](http://127.0.0.1:3194/profile), refresh if needed, and choose **Try tutorial panel**, then **Show me this page**. This is the isolated Wooly preview with sample controls, not the fully enabled production website. The existing server is preserved. The website's feature flag remains off pending the previously recorded migration and acceptance work.

## Verification

Checks below ran against the final two-file implementation. Logs and coverage are in `output/wooly-dialogue/`. Baseline copies in its `baseline/` directory isolate this ticket from the earlier dirty tree. File hashes are recorded in `candidate.json`.

| Check | Result |
| --- | --- |
| Focused Wooly regression tests | Pass: 13 files, 95 tests. Existing keyboard/focus, typing/reveal/pause, reduced motion, route/progress, permissions, failure handling, pointer and mascot lifecycle cases pass. |
| Existing aggregate coverage thresholds | Pass: statements 91.77%, branches 87.53%, functions 88.94%, lines 97.46%. No threshold changed. |
| Current-source TypeScript | Pass using `.tmp/wooly/tsconfig.json`; excludes archived output and the separate mobile project. |
| Strict provider lint | Pass, zero warnings. |
| CSS parsing | Pass with the installed Lightning CSS parser. |
| Isolated preview production bundle | Pass: 49 modules; CSS 10.82kB, JavaScript 251.63kB before gzip. This is not a full Next.js production build. |
| Coordinator diff review | Provider change moves the mascot outside the header into a companion/bubble layout and updates positioning width. Existing content/actions remain intact. Baseline comparisons report no whitespace errors; Git emits existing line-ending notices. |
| Artwork preservation | Existing animation atlas and pointing asset SHA-256 values match the earlier accepted local artwork record. |
| Browser/device and independent review | Unverified. The existing browser automation policy restriction persists. Laura's final review is unavailable because of the account usage limit; no replacement agent was launched to bypass it. DOM checks do not establish visual, physical frame-rate or screen-reader device acceptance. |

Reproduce the scoped checks from the repository root:

```powershell
$env:TEMP = Join-Path (Get-Location) '.tmp'
$env:TMP = $env:TEMP
npx vitest run --config vitest.website.config.ts src/components/wooly src/lib/domain/wooly.test.ts src/lib/domain/wooly-page-guides.test.ts src/app/wooly-actions.test.ts src/lib/supabase/wooly-migration.test.ts --exclude 'output/**' --exclude '.tmp/**' --maxWorkers=2 --coverage '--coverage.include=src/components/wooly/*.ts*' --coverage.include=src/lib/domain/wooly.ts --coverage.include=src/lib/domain/wooly-page-guides.ts --coverage.include=src/app/wooly-actions.ts --coverage.reportsDirectory=output/wooly-dialogue/coverage
npx tsc --noEmit --project .tmp/wooly/tsconfig.json
npx eslint src/components/wooly/wooly-provider.tsx --max-warnings=0
node output/wooly-animation/build.mjs
```

No new tests mirror the CSS declarations. Existing behavioral regressions are the meaningful local checks for this reversible layout change. Desktop/mobile visual acceptance remains required, especially at narrow widths, short heights and browser zoom.

## Gate settlement

The engineering-gates and completion-mandate guidance is reused. This is a Standard-lane UI change. Gates 01–12 and 14–22 pass within the local scope: criteria and ownership are recorded, existing controller and typed content are reused, the two-file blast radius is reviewed, and failure/permission behavior is unchanged. Gate 13 is N/A because there is one implementer. Gates 23–29 are N/A to this layout delta because it changes no database contract; earlier tutorial migration/security acceptance remains open separately.

Gates 30–33 pass for the scoped preview build, current-source types, provider lint and focused tests. Full root build/typecheck/lint limitations from [WOOLY-11](WOOLY-PAGE-GUIDES.md) remain; this ticket does not claim to repair archived desktop declaration conflicts or the existing lint-plugin configuration. Gate 34 remains unverified under the browser restriction. Gate 35 passes source scope: no package, service, secret, permission or data-write changes. Gate 36 has passing local behavior checks and preserved semantics, but device/screen-reader visual checks remain open. Gate 37 has coordinator diff review and candidate evidence; independent approval remains unavailable.

No implementation repair failed three times. Effective model/effort and usage telemetry are unavailable, not zero. Next: allowed desktop/mobile visual and screen-reader checks, followed by independent review of the recorded candidate. The ticket stays Review until those checks pass. No push, deployment or remote migration was performed.
