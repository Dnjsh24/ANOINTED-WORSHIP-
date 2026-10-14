# Wooly: listening nod, walking, and a slower pace

Implemented locally on 2026-10-10 after the user requested a listening nod and walking, then asked to slow the movements down. Refresh <http://127.0.0.1:3194/> and select **Listening & nodding** or **Walking**. The existing preview server was already listening on port 3194 and was preserved.

Talking and listening now use six-second loops (previously four). The walking cycle takes 2.8 seconds. Rendering still targets 30 updates per second, so slower motion does not mean fewer intermediate frames. Walking is a cycle in place within the mascot's existing footprint. No roaming overlay or navigation action was added.

## What changed

- A new transparent 1254 × 1254 sheet provides eight listening/nod drawings and eight articulated walking drawings. The head dips independently of the torso; the walk uses distinct hoof positions and a three-quarter side view. Ivory wool, lavender ears and violet hooves remain consistent with the approved Wooly reference.
- `wooly-motion-assets.ts` maps listening/walking to the new actions artwork while the existing talking poses retain their original artwork. Walking uses the existing greeting still for loading, error or reduced-motion fallback.
- `wooly-motion.ts` contains the slower timelines and separate cached, length-validated vector requests per artwork. The 30 Hz clock is unchanged.
- The mascot recreates graphics only when changing artwork sets. Listening-to-walking switches reuse the actions texture, preserve pause, and apply the requested pose before showing the canvas. The renderer ignores commands for frames in a different artwork set.
- `scripts/analyze-wooly-motion.py --actions` generates numeric correspondence for the two eight-frame loops. It does not edit the raster artwork. Original talking artwork and vectors are unchanged.
- Preview controls demonstrate all three modes. Existing tutorial listening steps automatically use the new nod. Walking is available to the shared mascot and selectable in the preview; no tour/progress workflow was changed.

The website feature remains disabled pending the original migration/rollout requirements. No database, credentials, remote services, desktop application, dependencies or deployment were changed.

## Verification

| Check | Evidence |
| --- | --- |
| Wooly regressions | **59/59 pass, seven files.** `npx vitest run --config vitest.website.config.ts src/components/wooly src/lib/domain/wooly.test.ts src/app/wooly-actions.test.ts src/lib/supabase/wooly-migration.test.ts --exclude 'output/**' --exclude '.tmp/**' --maxWorkers=2` |
| Changed behavior | Tests cover six-second gestures; a 2.8-second walking loop; nod/walk frame ranges and seamless loop pair coverage; both source hashes and vector sizes; per-artwork caching; pause preservation through artwork changes; listening/walking resource reuse; reduced-motion walking fallback; rejection of wrong-artwork frame commands. Existing 30 Hz, hidden-tab, failed-load/context and disposal tests remain passing. |
| Coverage | 45/45 focused tests pass with the existing aggregate 80% gates. Reported mascot/renderer coverage: 100% lines, 96.78% statements, 88.07% branches, 97.87% functions. `output/wooly-animation/coverage-actions`. Motion modules are mocked in the component suite and omitted from its coverage report; their dedicated behavior tests pass. |
| Lint | `npx eslint src/components/wooly --max-warnings 0` passes. |
| Current-source types | `npx tsc --noEmit --project .tmp/wooly/tsconfig.json` passes. |
| Scoped bundle | `node output/wooly-animation/build.mjs` passes: 45 modules; JS 227.77kB / 72.30kB gzip; CSS 6.85kB / 2.06kB gzip. Existing preview adapters remain in use. |
| Independent review | Laura approved matching final source hashes and reviewed the new sheet. Independent changed-risk tests: 28/28; scoped lint passes. No actionable findings. Requested gpt-6.1-sol medium; effective settings/usage unavailable. |
| Browser/device | Direct access to the user's open preview remains blocked by the app's browser policy from WOOLY-03. No alternate browser access or workaround was attempted. No final rendered nod/walk screenshot, device frame-time measurement or desktop/phone rerun is claimed. Generated artwork was visually inspected. |
| Existing release limits | Global unrelated website type/build issues and Supabase runtime/activation limits remain documented in WOOLY-TUTORIAL.md. This visual change does not resolve or worsen those gates. |

One test-only correction accounted for Next Image normalizing its source URL to an absolute URL after loading. No product repair loop was needed. One attempted preview-server start reported the port was already occupied; the existing server was left running.

Gate checkpoint: relevant intake, architecture, type safety, narrow scope, asset-boundary validation, lifecycle/fallback, bundle, unit/coverage and independent source-review gates pass. Database/RLS gates are N/A for this change. Browser/perceived-motion acceptance remains pending. **WOOLY-04 is Review, 0/1 final visual acceptance**, with implementation complete. Next: user checks the preview and final browser/device checks when access is permitted.

## Reviewed hashes

| File | SHA-256 |
| --- | --- |
| wooly-motion-assets.ts | BE88FC327FAA81310ADED8F10D8742468CF4A9DC89FC4BE6CDDA6ED64D4824F6 |
| wooly-motion.ts | 6CB54C061034570681EA71F60A607BCBB52F5A1A7480EDBEA6D66C40318B6271 |
| wooly-mascot.tsx | B44982A2DCA29DA4C97606E76A5662E41EE0275943D4B00681D33FFB7C24D8D3 |
| wooly-renderer.ts | 7159E98BDF791A574B7B2826CC95FE7390EE0F780918FA511D84A3A12A1B01B2 |
| analyze-wooly-motion.py | 3206281ABF6F019EC01B1C79ECCE0B8DE95A13B4CC4837EB78A52780052229BB |
| actions-sprite.png | B2638FD09906DB2C281C68BBEE83EB663D383BF459988D795A21E979DC652B5C |
| actions-motion-vectors.bin | 9A17C6BC49942F07841DEBA2C74D566F6DA412C0FEF80EBDEC354F33F0809A32 |
| actions-motion-vectors.json | 6D4F5F88B631C7172563B03BAD1D1805492844D222B15CE82BCA6701EBE541E1 |

## Asset provenance and generation prompt

Built-in imagegen, transparent background enabled, identity-preserving references `public/brand/wooly/greeting.png` and `talking-sprite.png`. Generated original retained at `C:/Users/danje/.codex/generated_images/01a11fbd-ce46-7a93-9d74-3053d4b41f65/exec-b2154b46-08dd-491c-8ea0-1fe947d4d059.png`; copied to `public/brand/wooly/actions-sprite.png` without raster changes. Numeric motion data is 262,144 bytes.

Prompt:

> Create an animation sprite sheet of EXACTLY this approved Wooly lamb. Preserve his identity: plush ivory wool clusters, violet eyes, lavender floppy ears, violet nose and cloven hooves, soft 3D toy rendering. Reference 1 is character identity, reference 2 shows desired sprite rendering. Transparent alpha background. Output a precise 4-column x 4-row grid, 16 equal square cells reading left-to-right then top-to-bottom. No text, numbers, borders, visible grid, ground, scenery or shadows. Every frame must fit COMPLETELY inside its own cell with at least 5% transparent margin on all four edges; consistent full-body size and foot baseline. Two actions, each EIGHT consecutive frames. ROWS 1–2 (frames 1–8): attentive LISTENING NOD. Wooly faces front, all hooves down, relaxed body, closed gentle smile throughout. Body, feet and camera stay fixed; articulate his HEAD at the neck so the chin genuinely dips toward chest, forehead angles toward viewer, ears follow head, eyes look attentive. Frame1 neutral upright;2 head halfway down;3 chin fully down in clear yes-nod;4 head halfway back up;5 upright;6 brief closed-eye blink upright;7 small second chin dip;8 upright matching frame1. DO NOT merely move entire character up/down; head changes angle independently from torso. ROWS 3–4 (frames 9–16): natural WALK CYCLE in place, facing viewer's right in a three-quarter SIDE VIEW. Same exact Wooly character proportions/fur/colors as nod. Walk on FOUR small cloven hooves; forelegs and hindlegs clearly articulate independently, no raised waving arm. Frame9 first contact with near foreleg forward and near hindleg back;10 down/weight-taking;11 passing with near foreleg under chest, near hindleg passing forward;12 up;13 opposite contact with near foreleg back and near hindleg forward;14 down;15 passing;16 up leading seamlessly into frame9. Opposite-side limbs follow the complementary walking phase. Visible subtle torso rise/fall, soft ear follow-through, mouth closed friendly smile. Feet stay above a consistent invisible ground baseline; root position stays centered in the cell, camera never moves. Render coherent consecutive movement, not random concepts or viewpoints. Each action's eight images must have matching scale, registration and orientation. Clean antialiased cutouts, no floating artifacts. Square overall sheet.
