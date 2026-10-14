# SETLIST-27 — Rehearsal tools open immediately

User request: show the Team rehearsal plan tools immediately, align each song's focus and minutes fields, and add a useful band/worship-team rehearsal feature.

Owner: coordinator implementation, Laura independent review. Standard lane. Candidate continues SETLIST-26 in the same isolated codex/team-rehearsal-page checkout from local commit 2b6212d504dcb582a69bc7bf17f198369632ba75. The original dirty workspace remains preserved. Local implementation only; no external publication/data/settings changes authorized.

## Criteria and design

- No Open preparation tools disclosure; song inputs, checklist, and download are visible immediately.
- Song heading spans the row above the fields. Short visible Focus and Minutes labels share the same desktop input baseline; mobile stacks them.
- The same field component serves demo and shared plans, preserving per-song accessible names, range/length validation, draft callbacks, and disabled controls.
- Rehearsal run-through uses current allocated minutes and shows current song key/BPM/lead/arrangement/focus plus the next song cue.
- Timer supports start, pause, resume, reset, next song, and direct song selection. Clock elapsed time catches up after delayed browser ticks; overtime remains visible until the operator pauses or moves on.
- Timer is local to this device/page. It never saves shared plans, sends readiness/check responses, or changes song selection in the separate Practice stage.
- A zero-minute song requires a time allocation to start. Empty plans keep the checklist/download available; timer has no song to show. Leaving the component cleans its interval.
- Existing save/check/reload/proposal/download contracts remain covered; desktop/mobile alignment, navigation, download, timer, and existing Practice workflow pass.

Design follows the existing page: zinc background #18181b, dark panel #111014, white text #ffffff, violet #8b5cf6, amber #fde68a for elapsed allocation. Existing fonts and button styles remain. A single timer panel sits before the always-open song fields. Clear numeric time and current/next musical cues are the only new emphasis. No animation, audio, new dependencies, schema or environment variables.

## Ownership

1. src/components/service-preparation.tsx
2. src/components/service-preparation.test.tsx
3. src/components/shared-preparation.tsx
4. src/components/rehearsal-song-fields.tsx
5. src/components/rehearsal-run-through.tsx
6. src/components/rehearsal-run-through.test.tsx
7. e2e/rehearsal-plan.spec.ts
8. e2e/requested-fixes.spec.ts
9. This evidence document.

The two preparation components are also used in Practice's existing modal, so the same open layout and timer appear there. Stage's song selection/playback remains separate. The existing Practice E2E test loses only its obsolete disclosure clicks; all existing behavior assertions remain.

## Evidence checkpoint

- Initial coordinator focused checks: 5 files / 29 tests pass (timer 7, local preparation 2, shared workspace 8, route 9, Practice panel 3).
- Laura independently reran 29 tests across 5 files. Review found a visible/accessible focus label mismatch; changing visible Rehearsal focus to Focus preserves the existing accessible Focus for song title name and fixes WCAG Label in Name.
- Laura approved final source with no remaining actionable findings. Post-fix independent local/shared preparation checks: 2 files / 10 tests pass. Final reviewed SHA256:
  - rehearsal-run-through.tsx: 02BDB607FC4093757F8CB883CFED597D5122493142782902A38659A5F4534460
  - rehearsal-song-fields.tsx: 0977CFF0630B5671CEA7BBB780994DFD7809E59DC68F9D481D640626F498DBBF
  - shared-preparation.tsx: 37035E4C16AE7CA7AD6DB0606B31287F181D9B616C397001F18DEE3034A3B5EE
  - service-preparation.tsx: 719B48C97A77A94B7376F2FDC72B149E72DADFC3A86AA9819C93C42501C3A323
- Initial scoped ESLint passed. A standalone typecheck overlapped the build's rewrite of .next generated types and reported missing generated files; rerun sequentially after the final build. No source workaround.
- Final production build: E2E_FORCE_DEMO=1 npm run build passed after the label fix.
- Final standalone typecheck: npx tsc --noEmit passed after build completed.
- Full lint: npm run lint:website passed with zero warnings.
- Full unit/coverage: npm run test:coverage:website passed 124 files / 681 tests. Statements 87.63%, branches 83.96%, functions 92.68%, lines 90.62%; existing 80% thresholds passed.
- Browser integration: E2E_FORCE_DEMO=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3187 npx playwright test e2e/rehearsal-plan.spec.ts e2e/requested-fixes.spec.ts --project=chromium --project=mobile --reporter=line passed 26/26 against the final production build. New checks assert immediate visibility, removed disclosure, equal desktop input Y coordinates/heights, mobile stacking, draft focus/time reflected in timer, start/pause/next, no horizontal overflow, and download/back navigation. Existing Practice modal, checklist/download, meter/progress, stage controls and surrounding journeys passed.
- Desktop/mobile full-page screenshots were inspected from ignored test-results folders; fields align on desktop and stack on mobile.
- Production audit: npm audit --omit=dev --audit-level=high reports zero vulnerabilities. Full npm audit reports the same pre-existing 5 high development-only braces/micromatch/fast-glob/ESLint-chain advisories. Dependencies unchanged; no force-fix or downgrade.
- Secrets scan: detector self-test passed, zero findings. Final git diff --check clean; application hashes match Laura's reviewed bytes.

## Gates and limits

Engineering/completion gates reused from this session. Intake/architecture/implementation 01–22 pass: explicit criteria and ownership, existing contracts/reused field and timer components, client-only state, no new data interfaces, permission controls and bounded values retained. Schema/index/migration/write-policy changes 23–29 are N/A. Shared authorization is checked through existing component/action tests; no new writes. Verification 30–37 passes for local implementation with the build/types/lint/unit/coverage/browser/security/accessibility/independent-review evidence above. Release CI/merge/deployment is N/A for local-only implementation. Browser tests run in forced demo and cannot establish hosted authenticated persistence; the unchanged shared actions and permission interfaces are exercised locally.

One review correction, no repeated failed source repairs. Requested Laura configured gpt-6.1-sol medium; effective model/effort/usage not exposed. Coordinator telemetry unavailable. No monetary claim.

## Settlement

Done for local implementation, 1/1. All criteria pass; only evidence text changed after final application review and verification. Exactly nine files belong to this follow-up, recorded above. No source edits outside ownership, remote data, schema, credentials, settings, push, merge or deployment changes. The local preview server was restarted on port 3187 with the final production build. Preview: http://127.0.0.1:3187/setlists/youth-night/rehearsal?preview=rehearsal-tools.
