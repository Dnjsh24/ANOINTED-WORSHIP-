# Wooly: smooth motion at a 30 fps target

The later [nodding, walking and slower pace update](WOOLY-NOD-AND-WALK.md) retains this 30 Hz renderer but changes gesture loops to six seconds and adds a 2.8-second walking cycle. Consult that record for current source hashes and verification.

WOOLY-03 implements the user's requested smoother animation. The browser interpolates between the approved drawings, moving the eye, mouth and hoof pixels toward the next pose before blending. The four-second loop and original PNG are preserved. It produces intermediate poses rather than playing sixteen drawings faster.

The local preview remains <http://127.0.0.1:3194/> (including `/profile`). Refresh an already-open preview. Restart its server with `node output/wooly-animation/serve.mjs` if needed. Website activation is still off; no deployment, database, authentication, desktop or dependency changes were made.

## Implementation

- `src/components/wooly/wooly-motion.ts`: continuous pose timelines, a 30 Hz elapsed-time clock, and shared validated motion-data loading. Display refresh rates do not change the loop speed.
- `wooly-renderer.ts` and `wooly-shaders.ts`: a small WebGL renderer warps both adjacent poses toward their intermediate position and blends premultiplied alpha. The canvas is bounded to 512px. Atlas samples stay inside the selected cell.
- `wooly-mascot.tsx` and `wooly-mascot.css`: preserve the still until rendering is ready; retain pause/play, current-pose fallback, and decorative semantics. Reduced motion creates no renderer or motion-data request. Pausing or hiding the document cancels animation scheduling; resuming does not skip ahead. Closing releases graphics resources. Unsupported graphics, context loss, failed assets or malformed data fall back to the original still.
- `scripts/analyze-wooly-motion.py`: local analysis of correspondence between the unchanged sprite poses. It writes numeric vectors, never edits or exports artwork. Uses already-installed NumPy, Pillow and scikit-image; there is no new application package or remote service. The two new public files are `motion-vectors.bin` (311,296 bytes) and its provenance manifest.

The optical-flow analysis uses the installed scikit-image 0.26.0 TV-L1 implementation, whose API describes motion correspondence between grayscale images. [scikit-image registration documentation](https://scikit-image.org/docs/stable/api/skimage.registration.html#skimage.registration.optical_flow_tvl1). The renderer uses a timestamp-driven animation loop and explicit graphics cleanup. [MDN animation-frame API](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame), [WebGL practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices).

## Evidence and limitations

| Check | Result |
| --- | --- |
| Wooly regression suite | **54/54 pass, seven files.** `npx vitest run --config vitest.website.config.ts src/components/wooly src/lib/domain/wooly.test.ts src/app/wooly-actions.test.ts src/lib/supabase/wooly-migration.test.ts --exclude 'output/**' --exclude '.tmp/**' --maxWorkers=2` |
| Timing | Tests count 30 updates per second against 60/90/120/144 Hz clocks. Real renderer logic, using a controlled graphics/RAF adapter, executes 30 draws during a simulated second and suspends work during pause/hidden states. This is deterministic scheduling evidence, not a measurement of physical-device frame times. |
| Lifecycle | Tests execute graphics allocation/cleanup, pause/no-jump resume, listening changes, context loss, partial initialization failure and unavailable graphics. Component checks include async unmount, failed motion load, keyboard pause/play, reduced motion and current-pose fallback. |
| Coverage | Focused coverage run: 40/40 UI/motion tests pass; reported mascot/renderer coverage 100% lines, 96.94% statements, 85.71% branches, 97.61% functions; existing aggregate 80% gates pass. The report omits the motion module because it is mocked in the component suite; its timing/data tests pass separately. Evidence `output/wooly-animation/coverage-30fps`. |
| Lint | `npx eslint src/components/wooly --max-warnings 0` passes. |
| Current-source TypeScript | `npx tsc --noEmit --project .tmp/wooly/tsconfig.json` passes. |
| Scoped production bundle | `node output/wooly-animation/build.mjs` passes: 43 modules, JS 226.28kB / 71.84kB gzip, CSS 6.85kB / 2.06kB gzip. Uses the existing preview adapters, not authenticated Next production. |
| Initial real rendering | New GLSL compiled and rendered in isolated Chromium with explicit SwiftShader. `output/wooly-animation/smooth-initial.png` inspected: approved colors, clean transparency and an intermediate mouth pose. Default Windows headless GPU lost its context after two draws; the component correctly returned to a still. |
| Open user tab | Direct access to the open in-app browser was rejected by the app's browser URL policy. No alternate route into that tab or policy workaround was attempted. User was asked to refresh and report whether movement is smoother. No reply at this checkpoint. |
| Performance/browser acceptance | **Pending:** actual frame-time measurement and the final desktop/phone browser rerun. Do not claim a guaranteed observed 30 fps on the user's device. Previous WOOLY-02 screenshots/browser logs validate the previous sprite version, not this renderer. |
| Independent review | Laura approved current source, independently passed 18 motion/mascot tests, then separately reviewed and passed all five real-renderer lifecycle tests. No actionable findings. Approval excludes unmeasured frame-time performance. Requested model/effort gpt-6.1-sol medium; effective settings/usage unavailable. |
| Full website/database release | Existing unrelated global type/build and local Supabase blockers remain in WOOLY-TUTORIAL.md. This request changes neither schema nor release activation. |

One shader repair replaced a reserved GLSL variable name. Initial tool approval failed due to the approval system's usage limit; the authorized retry after the user said continue succeeded. A later browser-access rejection remains a verification limitation. No remote actions or workspace cleanup were performed. The original PNG SHA-256 remains `620B4F9C03675B497AFC842A949C68B5D0F07B81E76BFB41C14A27E4DE5AC8D2`.

## Reviewed candidate hashes

| File | SHA-256 |
| --- | --- |
| wooly-motion.ts | FE08BF5E7A58DF56C0D0B80D35F5E087BAC8A97CC6273898D0957189EC692798 |
| wooly-renderer.ts | 9A41AEDB78EA2D1D2CFE0050F1785EBFDA38A7AF5E04B5498001C2820D85606F |
| wooly-shaders.ts | E051324CE7DA6BB53DE5E144F42DB5A14E3904BCD5CE4EB13CFACB09193BB225 |
| wooly-mascot.tsx | CC1F00687FF9DE19AEF98419510A1B04EBDA8D3AE0863F964033B7BEC659C334 |
| wooly-mascot.css | 4E9A377BCD023E7DB892735B72179E7F4D7B79C0D084B2D33D0E0DFD67EA1004 |
| motion-vectors.bin | F8644CF728F1DC540646310F8673A8D15B03555D72D66F13582A03860CD3CD4B |
| wooly-renderer.test.ts | BAE7712502118C705E39183E1526FF21E151B40A553A3683242C5771C3568D96 |

## Gate checkpoint

Gates 01–12: criteria, owner, conventions, typed interfaces, narrow scope and verification recorded. Gate 13 N/A (one implementer, independent read-only reviewer). Gates 14–22 pass relevant TypeScript, code style, reduced-motion/SSR, resource lifecycle and error checks. Gates 23–29 N/A (no data changes). Gates 30–33 pass scoped bundle, typecheck, lint, regression and coverage checks. Gate 34 remains partially verified: one real rendering pass, no final browser/performance acceptance. Gate 35 passes unchanged dependencies and public static-asset boundaries. Gate 36 has passing keyboard/motion/fallback tests; actual user-device confirmation remains pending. Gate 37 source review passes and limitations are recorded; final acceptance is not marked Done.

Status **Review, 0/1 final acceptance**. Implementation complete; next confirm smoothness on the user's preview and run frame-time/phone checks when permitted. Do not repeat all unchanged checks or apply the database migration as part of this visual request.
