# Wooly: restore the original character and complete-frame playback

WOOLY-07, 2026-10-10. Owner: coordinator; independent review: Laura. Ordinary lane, visual identity and animation risk. Local implementation and source/artifact review accepted; physical browser/device acceptance remains open.

## User outcome and scope

The user rejected the WOOLY-06 replacement face and proportions. Their second screenshot identifies the original `public/brand/wooly/talking-sprite.png` as Wooly. The new animation reuses that actual textured face, eyes, wool, body and hooves, plus the original actions sheet for the walking view. Original source images remain unchanged. No character regeneration, newly drawn vector eyes, new image-generation prompt, or external media service was used for this repair.

The website now displays finished frames at a 30fps target, within the requested 30–60fps range. Talking/waving and listening/nodding retain six-second cycles; walking retains a 2.8-second cycle. Non-walking torso and planted feet stay still. The original three floor hooves remain visible while the fourth limb waves or rests at Wooly's side; four walking hooves remain visible throughout the stride.

Scope is the website/PWA mascot and isolated localhost preview. No account, authorization, schema, migration, environment, deployment, remote service, separate desktop application or dependency change was made. Tutorial help, progress and permissions are unchanged. Feature rollout remains subject to WOOLY-01's existing migration/activation boundary. Unrelated workspace changes were preserved.

## Implementation

- `scripts/wooly-frame-art.cjs` authors frames from measured original-art regions. It keeps the original face intact, uses original closed-eye artwork with a soft eyelid reveal, applies small bounded mouth closure, and moves complete limbs/head at their joints. Connected-part isolation removes neighboring-cell fragments. This authoring code never runs in the browser.
- `scripts/build-wooly-frames.cjs` writes 225 complete 180px frames into one 2700×2700 transparent WebP, approximately 2.36MB, plus a manifest with source/atlas hashes. Each clip's forward half and turnaround frame are stored, then played forward/back without duplicated turnaround frames.
- `wooly-frames.ts` chooses a complete tile and draws it once. No runtime body morphing, facial drawing, atlas-part assembly or crossfade remains. Medium image smoothing preserves native-size baked details while smoothing scaled frames.
- The same atlas and canvas serve every mode. Asset revisions get a cache query and remount only when the artwork revision changes; changing pose retains the canvas and the user's pause choice. Pause, background suspension, resize, disposal, image/context failure, reduced-motion stills and keyboard control remain supported.
- Removed the rejected runtime `wooly-rig.ts` and `wooly-rig-painter.ts` modules and their obsolete tests. Historical assets/evidence remain for traceability and have no live consumer.

The preview server was no longer running when the user asked where to see Wooly. Confirmed no listener/process, then restarted the same local Vite preview hidden on `http://127.0.0.1:3194/`, PID18360. Startup log is clean; listener confirmed. No browser tool or alternative browser connection was used.

## Evidence

| Check | Result |
| --- | --- |
| Wooly component/domain/action/migration regressions | Passed: 8 files, 65 tests; `output/wooly-animation/original-frames/final-tests.log` |
| Existing 80% focused coverage gates | Passed: statements96.87%, branches92.59%, functions96.87%, lines100% across frame selector, clock, renderer and mascot |
| Strict component ESLint and authoring script syntax | Passed |
| Current-source scoped TypeScript | Passed, `.tmp/wooly/tsconfig.json` |
| Isolated preview production build | Passed;44 modules, approximately222.35kB JS /70.39kB gzip,6.88kB CSS /2.07kB gzip |
| Original face preservation | Pixel comparison against pinned original source, mean channel error below3/255; rejects replacement facial drawings/proportions |
| Closed-eye preservation | Original curved closed-eye pixels compared directly to fully closed frame; unchanged error threshold below3/255 passes |
| Frame integrity at180px and72px | All frames checked for nonempty artwork, clear borders and four visible hoof cores/components; standing floor-hoof alpha remains exact across loops |
| Timing/lifecycle |30 frame updates/second at simulated30/60/90/120/144Hz; complete cycles and both turnarounds; pause/resume, visibility, mode changes, unavailable context and disposal |
| Native full-cycle capture |12 seconds,360 video frames at30fps, three modes simultaneously;1,080 actual production frame draws |
| Independent Laura review | Approved final source/artwork hashes;34/34 independent animation tests and strict lint pass; original identity, partial/full blink and four walking hooves visually accepted |

The actual production selector/painter and decoded WebP generated `output/wooly-animation/original-frames/wooly-original-30fps.mp4`. Contacts: `original-art-check.png`, `decoded-frames-contact.png`. `capture-results.json` records native median0.0603ms/p950.1352ms per draw. These are native-canvas measurements, not physical browser FPS.

Browser access remains restricted by the previously reported tool-policy denial. No browser automation, shell Playwright, CDP, or alternate browser workaround was attempted. Desktop/phone browser smoothness and final user-device acceptance remain unverified. Existing unrelated root build/type limitations were not repaired; the build above is the isolated preview, not a full authenticated Next production build. Database runtime checks are unchanged from WOOLY-01 and not claimed as passing here.

## Repair record and review

Early assembly inspection found a stray hoof fragment inside the head clipping path and a clipped walking joint. Explicit part boundaries, connected-art isolation, rounded covered limb roots and foot spacing corrected these before final acceptance. An initial foot-count test incorrectly treated the original touching right hooves as one missing hoof; standing checks now inspect each original visible core, while walking still requires four distinct colored components.

Full-cycle inspection caught an unattractive compressed blink that earlier contacts missed. Replaced it with the original closed-eye texture. A new reference regression then identified additional native-size cubic filtering: high smoothing measured5.6128/255 mean error, whereas medium measured1.2986/255 for the same eye. Changed the painter's smoothing setting, retaining the original comparison region and threshold. Independent rerun passes. No repeated issue reached three failed repair attempts; test thresholds were not weakened.

Initial sandboxed Vitest attempts failed before running tests because temporary-cache renames returned EPERM. Coordinator repeated scoped tests with approved local execution; reviewer used workspace TEMP/TMP. No browser restrictions were bypassed. Reviewer launch was initially interrupted before initialization and explicitly restarted; only completed independent results are counted.

Required skills/gates: retained clean-code-typescript, ponytail, accessibility-wcag and code-review guidance; reviewed engineering-gates and completion-mandate. Gates01–12: scoped outcome, criteria, ownership, contracts and boundaries recorded. Gate13:N/A, one implementer/read-only reviewer. Gates14–22: typed small runtime modules, existing client/SSR boundary, trusted build-time manifest, error fallback and existing accessibility preserved. Gates23–29:N/A, no data boundary changes. Gates30–33: scoped checks above. Gate34: browser/device verification unavailable; actual native full-cycle rendering is the alternative, not an E2E pass. Gate35: public static artwork only, no new dependencies/secrets/network services. Gate36: keyboard pause/focus, reduced motion and fallback regressions pass. Gate37: independent source/native-artifact approval, with device acceptance still open.

Coordinator effective settings/usage unavailable. Requested Laura gpt-6.1-sol medium; effective model/effort receipt was not exposed. This record makes no usage-cost claim.

## Final source/artwork hashes

| File | SHA-256 |
| --- | --- |
| `wooly-frames.ts` | `B036A4EAE56D83D38477AF949C27330C96954A5B7A0E950A97FCB769C3183FEA` |
| `wooly-renderer.ts` | `B8DED8F14D95661FD50C39D32BF9A9585285C189EF2F695A54DCEE24A22AF899` |
| `wooly-mascot.tsx` | `B0165DB1EC00B43AF3E449D07FFE19AE728CD9A6059027FB34BBD930391C0B30` |
| `wooly-motion.ts` | `5E1C04EA5A97E98C90C22577E883C5153AA6375B32F32F9C515612D26F6A191C` |
| `scripts/wooly-frame-art.cjs` | `3FB888B481B17A1BA597E7642CB5A17C901ADAC4CE2ADE0188F3C40DE7C8B6F6` |
| `scripts/build-wooly-frames.cjs` | `74F5C6C797B89DAAC926E36D2210E8BBF4BC7024E4A28801D3FBFDA8A10BA6F9` |
| `original-frames-v1.webp` | `43AC4B66E3852649759350B4DEA2E8626604B9AFA88E41885DB9D17E18F21BC9` |
| `original-frames-v1.json` | `5B039EB21A2962B1928459DF5803E07E23CA450FBAEED965BDD50C9B5B731AF1` |

Approved talking source: `620b4f9c03675b497afc842a949c68b5d0f07b81e76bfb41c14a27e4de5ac8d2`. Approved actions source: `b2638fd09906db2c281c68bbee83eb663d383bf459988d795a21e979dc652b5c`. Rebuild with `node scripts/build-wooly-frames.cjs`; capture with `node output/wooly-animation/original-frames/capture.cjs`.
