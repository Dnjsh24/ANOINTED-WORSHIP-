# WOOLY-08: whole-character animation drafts

2026-10-10. Owner: coordinator. Independent reviewer: Laura. Status: Blocked; 0/1 acceptance complete. The website renderer and live artwork were not changed during this attempt.

## Required outcome

The user rejected the detached-looking walking legs and shortened listening hooves in WOOLY-07. They explicitly require new complete pictures of Wooly for each animation frame, not separated limbs or joints, even when that technique is baked offline. Target60fps, original identity, gentle motion, full hooves, no crop or jumps. Preserve website/PWA scope, existing accessibility and unrelated changes. No deployment, remote data change or paid external generation job was authorized.

## Work and findings

Used the built-in image_gen tool, with actual alpha transparency requested, and the approved original `public/brand/wooly/actions-sprite.png` and `talking-sprite.png` as identity references. No API fallback, paid remote service, code-drawn replacement face, cutout rig, body-part transforms, or runtime morphing was used. Full prompts are saved in `output/wooly-animation/whole-character-drafts/prompts.json` and `listening-attempt-2-prompt.txt`. All five generated draft sheets were copied into that workspace directory; original generated files remain in the Codex image directory.

| Draft | Requested / observed | Acceptance |
| --- | --- | --- |
| walking-attempt-1.png |120 sequential poses /120 figures,1374x1145 |Rejected: bottom-row hooves clipped. Laura counted72 opaque pixels on bottom edge; no reliable regular-cell gutters. |
| walking-attempt-2.png |120 sequential poses /12x9 figures |Rejected: count/grid mismatch, repeated gait states and inconsistent framing. |
| walking-attempt-3.png |60 sequential poses /12x5 figures,1619x971 |Attached anatomy and complete figures improve, but repeated/reset gait poses do not form a coherent smooth sequence. Not approved after third walking attempt. |
| listening-attempt-1.png |60 sequential poses /12x5 figures,1942x809 |Rejected: final row squats, body shrinks and leg shafts shorten. Bowed-to-upright transition jumps between rows. |
| listening-attempt-2.png |60 sequential poses /10x5 figures |Rejected: count mismatch; adjacent ears meet and exterior ears touch the sheet boundary. No accepted fixed-size, gentle nod sequence. |

Laura independently reviewed the original, first walking candidate, third walking candidate and first listening candidate. She rejected the candidate, explicitly distinguishing organic attachment from temporal continuity. Her review did not approve runtime replacement. Requested role settings remained Laura gpt-6.1-sol medium; effective model/effort and usage receipt unavailable.

## Verification and limitations

`node --check output/wooly-animation/whole-character-drafts/inspect.cjs`: passed.

`node output/wooly-animation/whole-character-drafts/inspect.cjs`: passed as an inspection operation. Produced `draft-quality-check-60fps.mp4` (3seconds,60fps,360draws across two modes) and `draft-boundary-contact.png`. It crops complete illustrations from measured row bands, applies one common scale per sheet and aligns the baseline. It does not cut anatomy, transform limbs, interpolate or conceal varying body sizes. Some sheet-boundary/neighbor crop defects remain visible in the contact. It is evidence of rejected artwork, not a successful60fps character animation or browser performance proof.

Production files, atlas, clock, tests, dependencies, routes, database and deployment configuration are unchanged. Consequently, website lint/typecheck/build/unit/security/accessibility suites were not rerun for these draft-only files; earlier65tests are historical and do not validate these new drafts. No browser automation or workaround was attempted under the existing browser policy restriction.

Engineering gates01–12: scope, criteria, ownership, visual risk and verification recorded; no new runtime interface. Gate13N/A: one implementer and read-only review. Gate14: imagegen, clean-code-typescript (inspection), completion-mandate and engineering-gates reviewed; retained role guidance. Gates15–22: local inspect-only script, failures propagate, no changed application inputs/SSR. Gates23–29N/A: no database or authorization changes. Gates30–33N/A for unchanged production; script syntax and actual artifact rendering checked. Gate34unavailable: prior browser policy; native artifact review is not E2E. Gates35–36: no dependencies/secrets/remote job/accessibility changes. Gate37FAILED: artwork and temporal consistency remain unacceptable.

## Historical video-service investigation (superseded)

Runway is now installed and authenticated. A read-only `whoami` confirmed that the connected workspace uses the Free plan and has no available video models. Displayed its plan requirement through the connector; no purchase, upload, trial enrollment, credit spend or generation job occurred. The user subsequently required free-only work and explicitly approved local whole-image in-betweens. That active replacement is recorded in [WOOLY-09](WOOLY-FREE-FRAME-ANIMATION.md); no paid service is required or planned. This paragraph records the earlier investigation, not the current next step.

## Four-leg reference correction

The user then specifically reported that the pictures appeared to show only three legs. Created a single complete-character reference with naturally staggered legs and four clearly separated hooves, rather than another sequence or a body-part rig. Built-in image_gen preserved the approved actions-sheet identity. Prompt: `output/wooly-animation/whole-character-drafts/four-leg-reference-prompt.txt`. Saved asset: `public/brand/wooly/four-leg-reference-v1.png`, SHA256 `5028375A60E7BB7534342BCAC69813BF68953AEB04B88453E48EBD80969B3399`.

Laura independently approved this specific still: four distinct ivory leg shafts naturally attached to the torso, four separated violet hooves with gaps, no cropped anatomy and original identity recognizable. She noted minor color fringes and sparse stray pixels at high magnification, without detached/cropped-leg defects. This approval does not cover animation.

The isolated local preview now opens on this corrected picture by default, labeled "Four-leg reference · still image". Accessible alternative text describes all four legs/hooves. Original animation modes remain available and explicitly labeled unfinished; production renderer and tutorial behavior remain unchanged. Preview CSS keeps the image contained at270px desktop/210px narrow-screen size. `node output/wooly-animation/build.mjs` passes:44modules,223.03kBJS/70.64kBgzip and7.16kBCSS/2.12kBgzip. This is the isolated preview build, not a full authenticated website build. Browser verification remains unavailable under the existing restriction.

### Prepared animation brief

Two silent short clips, original Wooly reference only, fixed camera, charcoal-compatible transparent output if supported. No text or voice. Keep original identity, ivory fleece, lavender ears and full violet hooves. Entire body inside safe margins.

Walking: gentle two-to-three-second cyclic four-legged walk in place in the original three-quarter view. All limbs organically connected; weight transfer naturally drawn, no lateral drift, camera movement, detached pieces, missing feet, size changes or face redesign. Seamless initial/end stride.

Listening: upright frontal stance, all legs and full-sized hooves planted and unchanged; gentle nod and attentive face. No squat, shrunken shins, body compression, horizontal drift or crop. Three-to-four-second relaxed loop.

Require an actual temporally consistent complete-image sequence. Verify supplied frame rate and unique-frame content. Merely encoding duplicates at60fps is not fulfillment. Any interpolation must be disclosed and accepted, not represented as newly drawn60fps artwork. Inspect every frame and loop boundary before integrating. Preserve pause/reduced-motion/fallback and same-canvas lifecycle. No production change until the visual candidate passes.

The project Completion Mandate says, "Stop after three repair attempts on the same failure." Walking reached that limit. The blocker is coherent full-character animation artwork, not the ability to change a playback constant. No completion or glitch-free claim is made.
