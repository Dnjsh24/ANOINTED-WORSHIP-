# Wooly character animation

**Current playback:** the later [30 fps motion update](WOOLY-SMOOTH-MOTION.md) replaces the step-based sprite player described below. This document retains the original asset prompt and WOOLY-02 evidence; consult the newer record for current source hashes and verification limits.

WOOLY-02 is complete locally. User selected full character movement on 2026-10-09, replacing the original static-only requirement. Wooly now blinks, changes mouth shape and waves a raised hoof using sixteen transparent frames. The listening state uses closed-mouth frames and a short blink. The five original poses remain the reduced-motion/loading/error fallback. This is a silent frame animation, with no voice or speech synchronization.

## View and scope

Open <http://127.0.0.1:3194/> while the local preview server is running. Restart with `node output/wooly-animation/serve.mjs` from the repository root. The preview imports the actual mascot, tutorial provider and CSS. Only Next navigation/image and account actions use local adapters; account progress in this preview is memory-only. No authentication or database credentials are used.

Production source is `src/components/wooly/wooly-mascot.tsx` and `wooly-mascot.css`. The provider adds the component and retains the user's pause choice while its panel closes, reopens or changes steps. The source sheet is `public/brand/wooly/talking-sprite.png` (1254 × 1254, transparent RGBA, 4 × 4 cells). Existing route, permission and persistence logic is unchanged. The header now reserves 72px for Wooly and a separate 44px close target.

The user can pause/resume with a keyboard. Images are decorative and never announced as changing content. Reduced motion starts with the existing still, avoids requesting the sheet, reacts to preference changes and has a CSS safeguard. Failed loading retains the still and removes the unavailable control. The sheet only mounts when a Wooly panel mounts.

**The main website feature remains disabled.** WOOLY-01's migration/runtime acceptance and activation are separate. This ticket adds no database, dependency, auth, desktop, deployment or remote-service changes.

## Verification

| Check | Result |
| --- | --- |
| Wooly regression tests | 36/36 across five files pass. `npx vitest run --config vitest.website.config.ts src/components/wooly src/lib/domain/wooly.test.ts src/app/wooly-actions.test.ts src/lib/supabase/wooly-migration.test.ts --exclude 'output/**' --exclude '.tmp/**' --maxWorkers=2` |
| Strict lint | `npx eslint src/components/wooly/wooly-mascot.tsx src/components/wooly/wooly-mascot.test.tsx src/components/wooly/wooly-provider.tsx --max-warnings 0` passes. Independent review also linted the whole Wooly component directory. |
| TypeScript | `npx tsc --noEmit --project .tmp/wooly/tsconfig.json` passes for current source; excludes unrelated backup checkouts. |
| Browser | `node output/wooly-animation/verify.mjs` passes at 1280, 390 and 320px: animation frames, listening mode, keyboard pause/play, retained pause on reopen, panel overflow, Escape/focus restoration, live reduced motion. Separate checks pass for reduced motion at first load (zero sprite requests) and failed image (still visible; tutorial usable). No page errors. |
| Visual | All sixteen frames inspected over charcoal in `output/wooly-animation/frames-on-charcoal.png`; actual 72px panel inspected at 320px. No visible alpha debris or adjacent-frame bleeding. Raw image-viewer speckles did not appear in browser rendering. |
| Scoped production bundle | `node output/wooly-animation/build.mjs` passes: 39 modules, 218.93kB JS / 69.04kB gzip, 7.74kB CSS / 2.24kB gzip. This compiles the real components with the documented preview adapters. |
| Independent Laura review | Source approved; independently ran 22/22 mascot/provider tests and strict scoped lint. Keyboard control, loading/failure fallback and motion subscription cleanup reviewed. |
| Full website acceptance | Not repeated for this isolated visual change. Prior global build/type issues and Supabase runtime blockers remain documented in WOOLY-TUTORIAL.md. The preview does not establish authenticated Next production or database behavior. |

Browser evidence: `output/wooly-animation/browser-results.json`, `panel-1280.png`, `panel-390.png`, `panel-320.png`, `frames-on-charcoal.png`. Test repair attempt 1 fixed asynchronous Next Image load assertions. Browser fixture correction 1 replaced the joining welcome title with the essentials welcome title. No product test failures remain. One image cleanup attempt produced an unused alternative; the original sheet was retained after actual browser rendering proved clean.

Requested reviewer: Laura, gpt-6.1-sol medium; effective settings/usage receipt unavailable. One coordinator implementation and one independent read-only reviewer; no parallel implementation or worktree required. Existing dirty workspace changes preserved.

## Final reviewed candidate

| File | SHA-256 |
| --- | --- |
| wooly-mascot.tsx | AA82D99327A4143200CF66D548E0AE7176026C56D515BA4DCE0423C64992712C |
| wooly-mascot.css | 71D240CB8FCCB4B0CAE5A2E9BC3309296D59205ECE3117AE2285CEBB1D4F9116 |
| wooly-mascot.test.tsx | 736829A3EACD3FF72425E86C50481324AB2EF89B0C69EE05A49A41291BB1AF19 |
| wooly-provider.tsx | F7516D9B8E5CE38680BDBA4E007F008ED9D3A4A1E986701A5A8EC32F58071725 |
| wooly.css | 23D4124D2B084B4D6429FCB9215D1ACBE75D948C9C581E304C692EE35AFB0A74 |
| talking-sprite.png | 620B4F9C03675B497AFC842A949C68B5D0F07B81E76BFB41C14A27E4DE5AC8D2 |

## Engineering gates

| Gates | Result / evidence |
| --- | --- |
| 01–06 intake/owner/risk | Pass: WOOLY-02 criteria and boundaries in tickets.md; standard lane, visual/accessibility risk. |
| 07–12 architecture/contracts/verification | Pass: isolated typed mascot; provider holds pause; no progress/auth contract changes. Existing Next CSS guide and controller conventions inspected; tests chosen for fallback, keyboard and motion. |
| 13 parallel worktree | N/A: one implementer, read-only reviewer. |
| 14–18 skills/style/types/names/extraction | Pass: imagegen, retained TypeScript/ponytail/accessibility and completion guidance. Focused component; lint/types/review pass. |
| 19–20 bundle/SSR | Pass: no new dependencies, sheet mounted in open panel only, static server snapshot, useSyncExternalStore for media subscription, scoped bundle and Next Image unit tests. |
| 21 input validation | N/A: typed internal pose/boolean props; no new external data input. |
| 22 errors | Pass: load error preserves still and tutorial controls; browser/unit evidence. |
| 23–29 schema/RLS | N/A: no animation database changes. Earlier WOOLY-01 gates remain open. |
| 30 build | Pass scoped bundle; full Next acceptance remains limited as disclosed above. |
| 31–34 types/lint/tests/browser | Pass scoped commands and browser results above. |
| 35 security/dependencies | Pass review: local static asset, no new package/service or data authority, no external actions. |
| 36 accessibility | Pass: keyboard pause/play, focus, decorative images, reduced motion, narrow layout, failed-image usability. No live speech/screen-reader audio session performed. |
| 37 final review/evidence | Pass: independent approval and exact hashes, scoped source reviewed, evidence recorded. No push or deploy. |

## Asset provenance and prompt

Mode: built-in `image_gen`, identity-preserving edit with `transparent_background: true`. Reference: `public/brand/wooly/greeting.png`. Original generated result remains at `C:/Users/danje/.codex/generated_images/01a11fbd-ce46-7a93-9d74-3053d4b41f65/exec-c626bff0-b9b0-4737-ae18-cc956e322351.png`; copied into the public brand directory without raster modification.

Prompt used for the installed sheet:

> Create a production animation sprite sheet of the EXACT approved Wooly lamb in the reference. Identity preservation is essential: same plush 3D ivory wool clusters, big violet eyes with dark pupils and white highlights, lavender floppy ears, violet nose and cloven hooves, cute small body and large head. TRANSPARENT BACKGROUND. Output a precise 4-column by 4-row grid of 16 equal square animation cells, reading left-to-right then top-to-bottom. NO captions, NO numbers, NO visible grid, NO background, NO ground shadows. Every cell must show the SAME front-facing full-body Wooly at the EXACT same camera angle, scale, position and foot baseline, with generous transparent margin to avoid clipping. Keep head, ears, torso and feet registered perfectly between cells. This is ONE coherent looping character animation, NOT a collection of concept variations. Animate facial features and raised arm only. Wooly has one foreleg raised on viewer's left for a gentle wave; the other down. Frames: 1 eyes open closed friendly smile hoof centered; 2 eyes open small talking mouth hoof inward; 3 eyes open wide happy talking mouth hoof center; 4 eyes half closed small mouth hoof outward; 5 eyes fully closed blink smiling hoof outward; 6 eyes half open small mouth hoof center; 7 eyes open round O talking mouth hoof inward; 8 eyes open happy wide talking mouth hoof center; 9 eyes open small talking mouth hoof outward; 10 eyes open closed smile hoof outward; 11 eyes open small talking mouth hoof center; 12 eyes open round O mouth hoof inward; 13 eyes open happy talking mouth hoof center; 14 eyes half closed small mouth hoof outward; 15 eyes fully closed blink closed smile hoof center; 16 eyes open closed friendly smile hoof centered exactly matching frame 1. Wave arc small and natural, hinged at shoulder, visible limb movement; actual open/closed mouth shapes, actual blink, no detached body parts. Soft studio light exactly matches reference. All sixteen characters centered consistently inside their equal cells, square overall image, generous consistent margin. This sheet will be played as sequential frames in a website tutorial.
