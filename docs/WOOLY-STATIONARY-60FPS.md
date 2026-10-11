# Wooly stationary gestures and 60 fps target

Ticket WOOLY-05, 2026-10-10. Website/PWA animation and isolated local preview only. No deployment, migration, feature activation, desktop application change, or dependency installation.

## Recording and diagnosis

Inspected the user-supplied `C:/Users/danje/Videos/2026-10-10 04-41-53.mp4` locally with the already-installed FFmpeg decoder. The recording is 1280×720, 30 fps, 21.5 seconds. It establishes visual defects but cannot measure a 60 Hz renderer. Analysis contact sheets are under `output/wooly-animation/video-review/`.

The generated sheets do not have uniform pose placement. Bodies shift across nominal columns; walking ears extend beyond nominal columns, and the final walking row begins above the nominal row boundary. The old sampler included neighboring wool/ears. Optical-flow crossfades also produced ghosted heads and feet when substantially different drawings could not be matched. Per-drawing easing introduced repeated acceleration/deceleration.

The default WebGL drawing buffer was considered, but there is no evidence it caused whole-canvas disappearance. The [Khronos specification](https://registry.khronos.org/webgl/specs/latest/1.0/) presents the buffer when modified; this change does not add expensive drawing-buffer preservation based on an unproven diagnosis.

## Implementation

- Explicit measured pixel bounds replace uniform sprite-cell sampling. Per-pose registration aligns the feet or walking torso in a padded 360-unit frame. Source PNGs are unchanged.
- Talking/waving uses aligned optical-flow interpolation with a fixed lower torso and planted feet. Intermediate alpha coverage is preserved. Sampling advances continuously between consecutive drawings instead of easing every drawing separately.
- Blinks use one intact registered eye drawing at a time, feathered only into the surrounding ivory skin. This avoids double pupils/highlights from incompatible open/closed eyes; mouth and wave motion still interpolate continuously.
- Listening/nodding and walking articulate one clean drawing with continuous deformations, avoiding crossfades between incompatible heads or feet. Listening moves only the head region. Walking uses opposing leg motion with a broad, monotonic deformation, plus a small body bounce; it does not translate across the screen.
- Clock target is 60 updates/second. Talking/listening retain the six-second cycle; walking retains 2.8 seconds. A refresh-rate target is not a guaranteed physical-device frame rate.
- Preview bubble width is fixed so changing its text does not recenter Wooly sideways.
- Existing pause, background suspension, reduced-motion still image, keyboard control, error fallback and renderer disposal remain intact. Tutorial progress and permissions are untouched.

## Verification

Initial regression suite: 7 files / 60 tests passed. Current-source scoped TypeScript and strict component ESLint passed. Final repeat, coverage, bundle and independent review are pending below.

`python output/wooly-animation/video-review/verify-sampling.py` runs an independent CPU reference of the shader equations against the actual PNGs and motion data. All 160 samples pass: zero border alpha, zero detached components, no disappearance, and exactly unchanged lower-body pixels for standing gestures. It generates midpoint contact sheets for visual inspection. This verifies geometry/sampling behavior; it does not execute the browser GPU or measure device performance. Two pixel-check repair iterations addressed residual row leakage and a folding walking deformation; the final check passes without relaxed assertions.

Direct preview browser inspection remains blocked by the previously reported browser policy denial. No alternate browser, raw CDP or shell browser workaround was used. Supplied recording and local numeric/pixel checks are the available visual evidence. Final user-device smoothness/phone acceptance remains unverified. Existing unrelated global website build/type issues remain outside this ticket; the focused preview bundle is the relevant build.

## Gates and review baseline

Engineering gates 01–12: scoped outcome, criteria, constraints, ownership, conventions and verification recorded here and in `tickets.md`. Gates 14–22: existing loaded TypeScript/accessibility/code-quality guidance applies; typed renderer contract, bounded shader sampling and existing graceful failure retained. Gate 13: N/A, one implementer and read-only reviewer. Gates 23–29: N/A, no schema/account boundary changes. Gates 30–33: final results below. Gate 34: browser/device acceptance unavailable due policy, no pass claimed. Gate 35: no new dependencies/network services, no sensitive data or authorization changes. Gate 36: pause/reduced-motion/fallback regressions retained. Gate 37: pending final independent review and candidate hashes.

Coordinator effective model/effort and usage telemetry unavailable. Laura requested gpt-6.1-sol medium; effective launch settings unverified. Original feature rollout remains off until its separately authorized migration and acceptance.

## Final settlement

Local implementation and independent source review are accepted. **WOOLY-05 remains Review, completed 0/1 final device acceptance** because direct browser/GPU/phone checks are unavailable. No further local code blocker. Next: inspect the updated preview on the user's device; no measured physical 60 fps claim is made.

| Check | Final result |
| --- | --- |
| Wooly regressions and coverage | 7 files / 60 tests pass. `npx vitest run --config vitest.website.config.ts src/components/wooly src/lib/domain/wooly.test.ts src/app/wooly-actions.test.ts src/lib/supabase/wooly-migration.test.ts --exclude 'output/**' --exclude '.tmp/**' --maxWorkers=2 --coverage --coverage.include=src/components/wooly/wooly-renderer.ts --coverage.include=src/components/wooly/wooly-mascot.tsx --coverage.include=src/components/wooly/wooly-motion.ts --coverage.reportsDirectory=output/wooly-animation/coverage-stationary-60fps` |
| Coverage result | Existing 80% thresholds pass: 96.87% statements, 88.69% branches, 97.82% functions, 100% lines for reported mascot/renderer. The mocked motion module is omitted by V8; its dedicated behavior tests pass. Shader pixels are checked separately, not covered by V8. |
| Final eye repair affected rerun | `npx vitest run --config vitest.website.config.ts src/components/wooly/wooly-motion.test.ts src/components/wooly/wooly-renderer.test.ts --exclude 'output/**' --exclude '.tmp/**' --maxWorkers=2`: 18/18 pass. Full suite was already green; the subsequent change is confined to the shader eye sampling and reference check. |
| Types | `npx tsc --noEmit --project .tmp/wooly/tsconfig.json` passes. Existing current-source config excludes unrelated copied checkouts. No global typecheck/build pass claimed. |
| Lint | `npx eslint src/components/wooly --max-warnings 0` passes, repeated after final eye repair. |
| Build | `node output/wooly-animation/build.mjs` passes after final eye repair: 45 modules, JS 232.62 kB / 74.15 kB gzip, CSS 6.88 kB / 2.07 kB gzip. This uses existing local preview adapters. |
| Pixel checks | Final 160 samples pass, no relaxed thresholds. Border alpha, detached components, standing-root difference and single-source talking-eye difference all zero. Output `output/wooly-animation/video-review/pixel-results.json`; final midpoint sheets visually inspected. |
| Independent review | Laura independently passed 18/18 timing/renderer tests and lint, checked matching hashes, and caught one residual blink-overlap issue. After the local eye repair, she inspected the final source and regenerated midpoint image and approved without remaining findings. |
| Preview | Existing process 40632 still listens on 127.0.0.1:3194. No server replacement or live browser interaction performed. |

Final source SHA-256:

| File | SHA-256 |
| --- | --- |
| wooly-motion.ts | 36F786605ADC84BFDF1B189D084198437E662252CAF122755632319097A5E07D |
| wooly-renderer.ts | 18732E2D52620D846766907FFA2E1A31EFAE6B87D1B1DA1558B38016DA26ED2B |
| wooly-shaders.ts | C0685F0BC5B58BA2BD48D73D93AD017EB507845BB54053D9343E81993F832BC8 |
| analyze-wooly-motion.py | E51DED7DE58257DD810CCA6B279240012DE33263265E194A66752F116B4589A6 |
| motion-vectors.json | B7E5DD216FFFC70644505E056E12931168E296CBE532345F32FA611BB152D4DE |
| actions-motion-vectors.json | E5F0B99DEC7EC68A7A3AC5EAC9E061D1F0CD1398CA90354E9087520B9B1F1639 |

Original talking/action PNG hashes remain respectively `620B4F9C03675B497AFC842A949C68B5D0F07B81E76BFB41C14A27E4DE5AC8D2` and `B2638FD09906DB2C281C68BBEE83EB663D383BF459988D795A21E979DC652B5C`.
