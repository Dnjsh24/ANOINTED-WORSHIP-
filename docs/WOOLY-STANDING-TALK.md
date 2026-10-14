# Wooly standing speech — WOOLY-10

2026-10-11. Status: Review. Local implementation, coordinator checks and independent source/native-artifact review accepted. Device visual acceptance remains pending.

## Outcome and scope

Added a fourth animation mode, `standing-talking`: Wooly stands with all four hooves down and speaks without waving. The preview has a **Standing & talking** button and selects it on a fresh load. Existing talking/waving, listening/nodding and walking modes retain their original decoded pixels and timelines. The new mode uses a neutral four-leg still when paused before loading, reduced motion is requested, or graphics fail.

One coordinator implements; Laura independently reviews. Standard lane, visual/animation selection risk. Website/PWA scope only. No account, schema, authorization, route, permission, dependency, activation, paid video service, deployment or desktop change. Existing dirty workspace is preserved. The separate tutorial rollout remains disabled pending its existing migration/authorization requirements.

## Whole-picture artwork

The accepted full-body neutral picture is the closed-mouth endpoint. One new complete open-mouth picture was generated with the built-in image tool, preserving the original character, proportions, four legs and planted hooves. No joint, limb or mouth region was cut out and animated separately. The full prompt and original generated PNG are retained under `output/wooly-animation/standing-talk-v1`.

Source: `standing-talk-open-source.png`, copied from `exec-c5b819b6-de16-49bb-a37d-c3ef262fd11c.png`. Alpha-connected inspection found 2,157 isolated background pixels with opacity at most 2/255, including one 720-pixel cluster. `clean.cjs` removes only these negligible disconnected alpha specks; any disconnected component containing opacity above 8/255 stops for review. The complete connected figure contains 679,247 pixels. A size-only guard initially stopped the build; inspecting alpha established the correct cleanup rule. No anatomical part is removed.

`build.cjs` uses the existing free local RIFE v4.6 workflow from [WOOLY-09](WOOLY-FREE-FRAME-ANIMATION.md). It creates 29 whole-image intermediates between the two endpoints. The 31 pictures play forward and back over 60 ticks, yielding a gentle 2-second loop at 30fps. Reverse frames are reused, not claimed as separately drawn pictures. Existing pause, hidden-tab suspension and reduced-motion behavior remain unchanged.

The version 3 atlas contains 155 tiles of 256px, 3072×3328 pixels, 5,847,148 bytes (39MiB decoded). Its first 124 tiles are copied as decoded RGBA from version 2 without canvas premultiplication changes. This was corrected after a strict regression test detected edge-channel rounding; all 124 existing tiles now compare byte-for-byte after native decoding. Previous version 2 files remain untouched.

Reproduce from repository root:

```powershell
node output/wooly-animation/standing-talk-v1/clean.cjs
node output/wooly-animation/standing-talk-v1/build.cjs
node output/wooly-animation/standing-talk-v1/capture.cjs
```

The reusable transparency helper in `free-frames/assemble.cjs` is exported without running its build on import. Running that original script directly still produces the same version 2 workflow. Static version 2 fallbacks remain valid; standing speech selects its planted neutral image.

## Final candidate

| File | SHA256 |
| --- | --- |
| public/brand/wooly/whole-frames-v3.webp |a188ec1a1179edb7cb90bcd04ed9bc47a9cc7c65f86728f1caa8595465559cb1 |
| public/brand/wooly/whole-frames-v3.json |6698e930028a44060fcc96e0445fd7e915cf7e2cf0c0abbe7799064d3112b6df |
| src/components/wooly/wooly-frames.ts |32b5036cf597620d2879ed4cd42c3ac049a5b89e472433fa16a94db5950e5239 |
| src/components/wooly/wooly-motion-assets.ts |ed76243d879ed676a9da57ee5d0584ee0dd4d774c6d7c2bb72dddc3e19802c79 |

## Verification

- 70/70 tests across 8 Wooly suites pass. Existing 80% coverage gates pass: 96.89% statements, 92.94% branches, 96.96% functions, 100% lines. Includes frame selection, motion, motion assets, mascot and renderer.
- New mode is covered by full-loop attached-hoof and transparent-border tests at 180px/72px, frame-transition checks including the loop join, four independent hoof-centroid checks under 0.75px displacement at 180px, and a changed-mouth pixel check. All 124 existing atlas tiles remain byte-identical after native decoding. A new UI test covers switching to standing speech with pause retained, correct neutral fallback and reduced-motion resource disposal.
- `npx eslint src/components/wooly --max-warnings=0`: pass.
- `npx tsc --noEmit --project .tmp/wooly/tsconfig.json`: pass. Existing scoped configuration; not a root-wide typecheck claim.
- `node output/wooly-animation/build.mjs`: pass, 44 modules; 224.98kB JS/71.72kB gzip, 7.16kB CSS/2.12kB gzip. Isolated preview production bundle, not a full repository build/deployment.
- `node --check` on clean/build/capture authoring scripts: pass. Task-scoped diff whitespace check: pass.
- `capture.cjs` uses the actual production selector/painter and final atlas to record 180 frames over 6 seconds at 30fps. Contact sheet compares four speaking positions on charcoal, white and lavender at 180px and 72px. This is authored-frame evidence, not measured browser refresh/presentation performance.
- Local preview listener remains 127.0.0.1:3194, existing process 17016. Browser automation remains unavailable under the prior policy restriction. No browser workaround attempted; live-device smoothness remains unverified.

Test command uses workspace `.tmp` for TEMP/TMP:

```powershell
npx vitest run --config vitest.website.config.ts src/components/wooly src/lib/domain/wooly.test.ts src/app/wooly-actions.test.ts src/lib/supabase/wooly-migration.test.ts --exclude 'output/**' --exclude '.tmp/**' --maxWorkers=2 --coverage --coverage.include=src/components/wooly/wooly-renderer.ts --coverage.include=src/components/wooly/wooly-mascot.tsx --coverage.include=src/components/wooly/wooly-frames.ts --coverage.include=src/components/wooly/wooly-motion.ts --coverage.include=src/components/wooly/wooly-motion-assets.ts --coverage.reportsDirectory=output/wooly-animation/standing-talk-v1/coverage
```

Visual evidence: `standing-talk-contact.png`, `standing-talk-30fps.mp4`, complete transparent samples 00–30, original and cleaned full-body endpoints. Coverage details are under `standing-talk-v1/coverage`.

## Gates and remaining acceptance

Engineering gates 01–12 recorded: requested extra mode, complete anatomy, stationary hooves, existing-mode preservation, accountable owner, unchanged data boundaries and independent review. Gate 13 N/A: one implementer, read-only reviewer. Gate 14: retained imagegen, clean-code-typescript, ponytail, accessibility/review, engineering-gates and completion-mandate guidance. Gates 15–22: existing typed client interface, additive local pose, explicit timeline, error fallback and resource reuse. Gates 23–29 N/A: no schema/data changes. Gates 30–33 pass within the scoped checks above. Gate 34 unavailable: browser policy; native capture/UI tests are alternatives, not E2E. Gate 35 pass: no new application dependency or paid service. Gate 36 pass: pause, keyboard, decorative images and reduced-motion retained/tested. Gate 37: final source/native-artifact review accepted; device visual acceptance remains open.

Requested Laura gpt-6.1-sol medium; effective model/effort/usage receipt unavailable. One source-alpha guard refinement and one old-tile preservation repair resolved; no issue reached three failed repair attempts.

## Independent review settlement

Laura approved the final matching candidate: four planted naturally attached limbs, mouth-only speech, identity and matting. Independent 39/39 focused animation tests and strict scoped lint passed. Source checks confirm the neutral fallback, pause-preserving pose switch and existing resource/reduced-motion behavior. All 124 earlier tiles are unchanged. Coordinator final 70/70 regression tests, focused coverage gates, types, strict lint and preview production build passed on that same candidate. No remaining local code or artwork blocker was found; physical-browser/phone smoothness remains unverified.
