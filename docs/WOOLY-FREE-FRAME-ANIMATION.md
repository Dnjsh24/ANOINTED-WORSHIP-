# Wooly complete-frame animation — WOOLY-09

Updated 2026-10-11. Status: Review; local implementation, coordinator checks and independent final source/native-artifact review accepted. Physical-device visual acceptance remains pending.

## User request and scope

Use the accepted four-leg Wooly for talking/waving, listening/nodding and walking. The user explicitly approved free local whole-image in-between generation at 30fps. Preserve the entire character in every picture; no separated joints, limb cutouts or puppet rig. Keep movements gentle and standing gestures in place.

Website/PWA only. Root owns implementation; Laura independently reviews. Standard lane, visual/anatomy and playback risk. Existing dirty workspace preserved. No paid video job, app dependency installation, database change, tutorial activation, push, deployment or desktop application change. `WOOLY_TUTORIAL_ENABLED=0` remains unchanged. Earlier rejected WOOLY-07/08 methods are historical, superseded by this user-approved method.

## Artwork and reproducible generation

Accepted master: `public/brand/wooly/four-leg-reference-v1.png`, SHA256 `5028375a60e7bb7534342bcac69813bf68953aeb04b88453e48ebd80969b3399`.

Six full-character images are in `output/wooly-animation/free-frames/keyframes`: neutral, wave-closed, wave-open, nod, step-a, step-b. The accepted master was copied; five individually edited complete pictures were generated with the built-in image tool. Prompts are preserved in `prompts.json`. Laura approved all six endpoints before interpolation: four attached limbs, original face/wool/ears/proportions, no cropping; three planted legs plus one raised foreleg during the wave.

Free offline interpolation uses [rife-ncnn-vulkan](https://github.com/nihui/rife-ncnn-vulkan), [official 20221029 Windows release](https://github.com/nihui/rife-ncnn-vulkan/releases/tag/20221029), model `rife-v4.6`, GPU 1. The portable executable, model and MIT license remain in the workspace's `free-frames/tools` directory. Executable SHA256 `4b970319db2814c82b15fceed8193151560a676a9eb63f20d4877be77b98f44f`. No paid endpoint or remote rendering is used.

Reproduction commands from repository root:

```powershell
node output/wooly-animation/free-frames/prepare.cjs
node output/wooly-animation/free-frames/interpolate.cjs
node output/wooly-animation/free-frames/assemble.cjs
node output/wooly-animation/free-frames/capture.cjs
```

Prepare composites each complete picture at 512px onto a temporary green matte and encodes packed RGB. RIFE interpolates four pairs: wave-closed→wave-open, neutral→nod, neutral→step-a, neutral→step-b. There are 29 new whole-image in-betweens per pair. The authoring pipeline restores transparency using local foreground color, preserving neutral highlights. It clears only the 8px empty exterior gutter; any source opacity above 8 there fails the build. No character section is extracted or articulated.

The final lossless WebP atlas has 124 tiles of 256px tiles, including three copies of neutral: 122 distinct pictures in total, comprising six endpoints and 116 generated intermediates. Timelines reuse reverse frames and intentional listening holds; reused frames are not claimed as new drawings. Atlas dimensions 3072×2816, 4,679,460bytes, approximately 33MiB decoded. A single atlas and canvas are retained across pose changes.

| Mode | Playback | Loop |
| --- | --- | --- |
| Talking and waving | 30fps; closed/open smile and gentle raised-hoof movement | 60 ticks / 2 seconds |
| Listening and nodding | 30fps; neutral hold, gentle head dip/softened eyes, return | 120 ticks / 4 seconds |
| Walking | 30fps; alternate diagonal steps through neutral, fixed canvas position | 120 ticks / 4 seconds |

`src/components/wooly/wooly-frames.ts` selects complete tiles from explicit timelines. Runtime performs one image draw per frame. `wooly-motion-assets.ts` supplies corrected full-character stills for every tutorial pose and walking. Pause, reduced motion, hidden-tab suspension, resource reuse/disposal and failure fallback remain intact. Preview defaults to talking and provides all three modes plus the accepted reference.

## Candidate identity

| File | SHA256 |
| --- | --- |
| whole-frames-v2.webp |544be2fcfb836279d66918f8fef1ee432e34f56052c16d436bd7e221e30e99af |
| whole-frames-v2.json |c6f2200f19051be8fe60326b1a7ee2f16a22776e744c3ffa941286c16faf381c |
| wooly-frames.ts |ef39a62b7ffb216b7a21797f581ff1f019d9d19226892458af46db0204aa008c |
| wooly-mascot.tsx |e6e57187dac8dad9471bed33b6ff8c3fcb0ab63752750880606ff7d87313e921 |
| wooly-motion-assets.ts |689d03bb4c7b3876e307a7411556428d9c526001b0b1ea77e47d7dc9865e2851 |

## Verification

- 64/64 tests across 8 Wooly suites pass. Complete loops at 180px and 72px verify four distinct anatomical hoof regions connected to the body and completely clear exterior borders. Premultiplied pixel differences cover every adjacent frame including loop joins. These measurable checks supplement visual review; they cannot prove every perceptual quality.
- Clock tests simulate 30/60/90/120/144Hz displays and confirm 30 updates per second. Lifecycle/keyboard pause, reduced motion, pose changes and failed-artwork fallback tests pass.
- Focused coverage: 96.85% statements, 92.4% branches, 96.87% functions, 100% lines. `coverage-free-frames/coverage-summary.json` includes frames, motion, renderer and mascot modules; existing 80% thresholds pass.
- `npx eslint src/components/wooly --max-warnings=0`: pass.
- `npx tsc --noEmit --project .tmp/wooly/tsconfig.json`: pass. This existing scoped config excludes output/mobile backup conflicts; it is not a claimed root-wide type pass.
- `node output/wooly-animation/build.mjs`: pass, 44 modules, 224.29kB JS / 71.42kB gzip, 7.16kB CSS / 2.12kB gzip. This is the isolated preview production bundle, not deployment or a full repository build.
- Syntax checks pass for interpolation, assembly and capture scripts. Task-scoped diff whitespace check passes.
- Native capture of the actual production selector/painter: 12 seconds, 360 encoded frames at 30fps, 1,080 draws across all three modes. Native median 0.0663ms / P95 0.1378ms per draw. This is not browser, GPU presentation or physical-device frame-rate evidence.

Relevant test command (workspace `.tmp` used for TEMP/TMP):

```powershell
npx vitest run --config vitest.website.config.ts src/components/wooly src/lib/domain/wooly.test.ts src/app/wooly-actions.test.ts src/lib/supabase/wooly-migration.test.ts --exclude 'output/**' --exclude '.tmp/**' --maxWorkers=2 --coverage --coverage.include=src/components/wooly/wooly-renderer.ts --coverage.include=src/components/wooly/wooly-mascot.tsx --coverage.include=src/components/wooly/wooly-frames.ts --coverage.include=src/components/wooly/wooly-motion.ts --coverage.reportsDirectory=output/wooly-animation/coverage-free-frames
```

Visual evidence under `output/wooly-animation/free-frames`: `interpolation-contact.png`, `background-contact.png` (charcoal/white/lavender at 144px and 72px), `decoded-frames-contact.png`, `wooly-whole-30fps.mp4`, `capture-results.json`. Original six keyframes, all 124 transparent samples, prompts and local tools are retained.

Repair history: one packed-RGB input correction resolved corrupted RIFE output. First visual review accepted anatomy but found green residue. Two matting refinements removed residue while retaining neutral eye highlights. A separate alpha 1 source speck failed the strict border test; the guarded empty-gutter cleanup resolved it. No issue reached three failed repair attempts. Old sheet-generation repair limits remain recorded under WOOLY-08 and were not reset.

## Acceptance limits and gates

Browser automation remains unavailable under the earlier browser policy restriction. No alternate browser automation, raw CDP or shell workaround was attempted. Final live-browser/phone smoothness and user visual acceptance remain unverified; do not promise glitch-free motion on every device. The tutorial remains disabled pending its separate migration/rollout authorization. Schema and account behavior did not change; live database isolation checks are N/A to this animation patch, not newly passed.

Engineering gates 01–12: scope, criteria, constraints, standard risk, ownership, unchanged account boundaries and verification recorded. Gate 13 N/A: single implementer/read-only reviewer. Gate 14: imagegen, clean-code-typescript, ponytail, accessibility/review guidance, engineering-gates and completion-mandate applied. Gates 15–22: typed existing client boundary, single tile draw, no new runtime dependency/input, safe fallback retained. Gates 23–29 N/A: no data/schema change. Gates 30–33 pass at the explicitly scoped surfaces above. Gate 34 unavailable: browser policy; native capture and UI unit checks are alternatives, not E2E. Gate 35: official MIT portable local tool, no new application package or external service. Gate 36: existing pause/reduced-motion/focus/decorative-image behavior tested. Gate 37: final source/native-artifact review accepted; physical-device visual acceptance remains open.

Requested Laura settings: gpt-6.1-sol medium. Effective model/effort and usage receipt unavailable; unavailable telemetry is not zero.

## Independent final review and handoff

Laura approved the matching final candidate after inspecting complete frames, repaired close-ups, eye highlights, dark/white/lavender backgrounds, loop contacts, runtime selection and lifecycle/accessibility. Independent 33/33 targeted tests and strict scoped lint passed. No remaining anatomy, identity, matting, source or accessibility blocker was found. Atlas/manifest/renderer-selection/mascot hashes in the table remained unchanged after review; the existing clock and renderer were not modified. Coordinator coverage, scoped types/build and all 64 regressions passed on that same candidate.

Preview restarted hidden at http://127.0.0.1:3194/, process17016, TCP listener independently confirmed. FFmpeg metadata confirms the review recording is900×350 H264,12seconds at30fps. Opening the recording in Codex was queued successfully. Browser/phone performance is the only remaining visual acceptance limitation; no browser workaround was attempted.
