# Wooly articulated animation repair

Ticket WOOLY-06, 2026-10-10. Local implementation and independent source review accepted; final device acceptance remains unverified. Website/PWA mascot and isolated preview only. No deployment, remote migration, feature activation, dependency installation, or separate desktop application changes.

## Problem and replacement

The user rejected the previous animation after recording `C:/Users/danje/Videos/2026-10-10 08-31-28.mp4` (1280×720, 30 fps, 47.47 seconds). Talking and nodding distorted the character, and listening/walking lost a visible foot. Earlier shader-reference tests measured borders and stationary roots but did not prove coherent anatomy through complete cycles. WOOLY-05's checks are historical evidence, not acceptance of the current request.

Whole-character optical-flow morphing has been replaced by a Canvas2D puppet with separate textured head, torso, tail and four complete limb instances. Each limb rotates as a whole at its joint; no image warping, pose crossfades, or neighboring sprite-frame sampling remains in the live animation. Eyes and mouth are drawn as smooth vector features on a blank face. The regenerated parts retain Wooly's ivory wool, lavender ears and violet hooves, although the facial artwork is newly assembled rather than pixel-identical to the original still.

Standing gestures keep the body and planted feet fixed. Waving draws the complete raised hoof in front of the head so an ear cannot conceal it. Listening moves the head gently down and up. Walking uses four separate limbs with opposing rotations and a small vertical body bounce. Slow six-second gestures and a 2.8-second stride remain; the clock targets 60 updates/second.

All modes share one atlas, canvas and renderer. Changing mode no longer reloads the animation image or replaces the canvas. Pause, background suspension, resize, context failure, image failure, reduced-motion stills and disposal remain supported. Tutorial navigation, permissions and saved account progress are unchanged. Original still PNGs remain available for fallback.

## Verification

| Check | Final result |
| --- | --- |
| Wooly component/domain/action/migration regression suite | 8 files, 61 tests passed |
| Focused animation coverage, existing 80% thresholds | Statements 98.25%, branches 95.38%, functions 97.5%, lines 100%; passed |
| Strict `src/components/wooly` ESLint | Passed |
| Current-source scoped TypeScript, `.tmp/wooly/tsconfig.json` | Passed |
| Isolated preview production bundle | Passed; 44 modules, JS 225.15 kB / 71.49 kB gzip, CSS 6.88 kB / 2.07 kB gzip |
| Actual production painter, 180px complete-cycle pixel checks | Two cycles of each mode at 60Hz; all four hoof neighborhoods contain visible opaque violet pixels; borders remain transparent; standing lower-body pixels remain identical |
| Actual production painter at 72px tutorial size | Listening and walking retain four visible hoof neighborhoods across sampled complete cycles |
| Continuous capture of actual painter | 1,776 frames, 60 fps, 29.6 seconds; two full cycles each of talking/waving, listening/nodding and walking |
| Independent Laura review | Approved matching final hashes, no actionable findings; independently repeated 26 renderer/mascot/motion tests and strict lint |

The coverage report includes mascot, clock, renderer, rig and painter. The native-canvas tests execute the real painter and actual PNG, rather than a second implementation of rendering equations. Contact sheets were visually inspected for missing limbs, doubled silhouettes, detached parts and border contamination. These checks materially improve the earlier evidence but cannot guarantee every physical browser's frame rate or subjective smoothness.

Evidence under `output/wooly-animation/second-video-review/`: `wooly-complete-cycles.mp4`, `full-cycle-results.json`, `full-cycle-contact.png`, `rig-first-check.png`, `capture-cycles.cjs`, and `render-rig.cjs`. Coverage is under `output/wooly-animation/coverage-rig/`. Native paint median was 0.63ms and p95 1.15ms; these are native-canvas measurements, not browser performance claims.

Reproduction commands:

```text
npx vitest run --config vitest.website.config.ts src/components/wooly src/lib/domain/wooly.test.ts src/app/wooly-actions.test.ts src/lib/supabase/wooly-migration.test.ts --exclude "output/**" --exclude ".tmp/**" --maxWorkers=2 --coverage --coverage.include=src/components/wooly/wooly-renderer.ts --coverage.include=src/components/wooly/wooly-mascot.tsx --coverage.include=src/components/wooly/wooly-rig.ts --coverage.include=src/components/wooly/wooly-rig-painter.ts --coverage.include=src/components/wooly/wooly-motion.ts --coverage.reportsDirectory=output/wooly-animation/coverage-rig
npx eslint src/components/wooly --max-warnings 0
npx tsc --noEmit --project .tmp/wooly/tsconfig.json
node output/wooly-animation/build.mjs
node output/wooly-animation/second-video-review/capture-cycles.cjs
```

Direct browser inspection remains unavailable under the previously reported browser policy denial. No alternate browser, raw CDP, shell Playwright or other browser workaround was used. The supplied recording and native rendering are permitted evidence. Desktop/phone browser performance and final user-device acceptance are outstanding. The existing localhost preview on port 3194, process 40632, was preserved. Existing unrelated root type/build issues were not repaired or represented as passing; the focused build above is the isolated preview, not the authenticated Next production build.

## Review and gates

Independent Laura reviewed rigid part drawing, four persistent limbs, standing root stability, vector facial animation, wave layering, mode changes on the same canvas, pose-local clock reset, pause, visibility, error fallback and disposal. She inspected both final contact sheets and the full-cycle test assertions. Her source approval and independent 26-test/lint results match the hashes below. The coordinator owns full native-cycle and combined-suite execution.

Engineering gates 01–12: scoped criteria, ownership, constraints and evidence recorded. Gate 13: N/A, one implementer and read-only reviewer. Gates 14–22: typed small modules, existing client boundary, accessible pause/reduced-motion/fallback and graceful failure preserved. Gates 23–29: N/A, no database or account-boundary changes. Gates 30–33: scoped build, typecheck, lint, regression and coverage results above. Gate 34: browser/device acceptance unavailable; native full-cycle rendering is an explicit alternative, not a browser pass. Gate 35: no new dependencies, secrets, network services or permission changes. Gate 36: keyboard pause and motion/failure behavior regressions pass. Gate 37: independent review accepted; final physical-device acceptance remains open, so the ticket remains Review.

Repair notes: the first test iteration corrected a test's expected nod peak from 750ms to 1500ms; actual intended pacing was unchanged. An initialization lint finding was resolved by starting the renderer in the image-load callback. Assembly adjustments to body height, eyes, tail position and raised-hoof draw order preceded the final pixel suite. Final thresholds were not relaxed. No issue reached three failed repair attempts. Coordinator effective model/effort and usage telemetry are unavailable; Laura requested gpt-6.1-sol medium, effective runtime settings unverified.

| Final candidate | SHA-256 |
| --- | --- |
| `src/components/wooly/wooly-rig.ts` | `50734DBBC60F989EECBDC9C8E07469D6E70CE4D07214616A5B72AAA1CF72BD42` |
| `src/components/wooly/wooly-rig-painter.ts` | `F7239DAD731B2B3A040CA46FFC9256FCE43DF81DF45D8F55FEEAF5D35561D2C5` |
| `src/components/wooly/wooly-renderer.ts` | `81DFBBA37E368318CCC290C82385D43DD68840B8A784F40059BA4555B146F6C6` |
| `src/components/wooly/wooly-mascot.tsx` | `BDF209D3656B8207CC2C3A8D4403D8CDC5F58E61323CFF2FE0A22A4315D6D699` |
| `public/brand/wooly/rig-parts-v1.png` | `E96ECDACA71580B84270AC7976DEC4B4D840E6BA8AE38A0FC7EFA75A9AC162B3` |

## Asset provenance

Used the built-in `image_gen.imagegen` tool, not a CLI or external paid job. Transparent output was generated using the approved `public/brand/wooly/greeting.png` as reference. Saved unchanged to `public/brand/wooly/rig-parts-v1.png` (1536×1024 RGBA). Original generated file: `C:/Users/danje/.codex/generated_images/01a11fbd-ce46-7a93-9d74-3053d4b41f65/exec-faed97eb-c7bb-45fd-afbc-dbcc25800f8e.png`. Actual isolated-part pixel bounds were measured and declared in the typed rig catalog; nominal grid placement is not assumed.

Final generation prompt:

> Create a production 2D puppet RIG PARTS ATLAS of exactly the reference character Wooly. This is an animation engineering asset, NOT full poses. Keep his plush ivory wool, realistic soft toy texture, lavender ears, cream face, violet cloven hooves and cute baby-lamb proportions. Transparent alpha background. ONE image arranged in a strict THREE COLUMNS by TWO ROWS, six equal cells with at least 12% empty transparent margin in each cell. Parts never touch another cell. No text, numbers, frame lines, ground, shadow planes, duplicate parts or complete characters. Row 1 left: Wooly's FRONT VIEW HEAD ONLY, symmetrical, upright, with his original puffy forelock and both attached long lavender floppy ears. Face is smooth BLANK IVORY: absolutely NO eyes, nose, mouth or eyebrows, because these will be rigged as separate graphics. Keep face shape faithful to reference. No neck or body. Row1 center: SAME HEAD ONLY in THREE-QUARTER view looking to viewer's right, attached lavender ears, puffy forelock, same BLANK IVORY face without eyes/nose/mouth/brows, no neck/body. Row1 right: FRONT VIEW TORSO ONLY, a round vertical pear-shaped lamb body fully covered in separate plush ivory wool tufts, no head, face, ears, arms, legs, hooves or tail. A complete softly rounded silhouette with room for limb attachment. Row2 left: THREE-QUARTER SIDE VIEW TORSO ONLY facing right, round horizontal oval lamb body covered in identical ivory wool tufts, NO HEAD OR LIMBS OR TAIL. Row2 center: ONE COMPLETE STRAIGHT LOWER LIMB ONLY, cream plush cylinder with rounded complete shoulder/hip cap at its top and a solid violet cloven hoof at its bottom. Straight vertical neutral orientation, no waving bend, isolated whole part. This single part will be instanced four times with rotations; thick enough to remain attached under torso, no cut ends. Row2 right: ONE small puffy IVORY TAIL BALL ONLY, isolated round clustered wool pompom with no body. All six parts lit identically from upper left in the same high-quality soft 3D toy illustration as the reference. Complete parts, crisp alpha silhouettes, transparent spaces between them, no clipped edges. The head and body should be parts of precisely the original lamb, not another mascot. No animation frames or pose variants beyond specified front/three-quarter parts.
