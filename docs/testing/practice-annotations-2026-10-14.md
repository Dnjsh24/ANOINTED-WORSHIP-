# SETLIST-30: Practice annotations and song timer

## Scope and behavior

Base: current fetched `origin/main` at `167f3af2d2d0818fe0fd224b550e2e2a388ad408`. Isolated managed checkout: `C:/Users/danje/.codex/worktrees/practice-notes-timer/Anointed worship setlist - Copy`. Original dirty workspace remains untouched except its coordinator-owned ticket record. No external publication or remote mutation is authorized or performed.

Practice (`/setlists/[id]/practice`) has pen/eraser and text notes. Text supports Arial, Georgia or monospace, sizes 12–72px, bold, italic, underline and strikethrough. Move by dragging the handle with mouse/touch or using arrow keys. Notes and drawings save on this browser/device and display without editing controls in Stage (`/setlists/[id]/stage`). New storage keys isolate setlist slots, including repeated songs. Existing `scribbles_<setlist>_<song>` drawings are read as a fallback, with new edits saved by slot. Notes render as escaped React text; stored formatting and coordinates are validated. Storage write failures preserve the open draft and show an error.

The active song's saved rehearsal allocation appears as a countdown at the bottom of the right Practice & edit panel. Start/pause/resume/reset and overtime use the real clock. Closing the panel preserves the running timer. Selecting a different song resets to that song's allocation. Shared plan save/reload updates the allocation only on successful saves by managers or successful reloads, preserves it on failure, and clears it when no saved plan exists. Proposals and unsaved drafts do not change the timer. Updated allocation rows survive song switches; per-song editors remain keyed separately. Demo allocations use the existing explicitly enabled demo store. No schema, server authorization, environment, credentials, dependency, cache or hosted database changes.

## Ownership and exact file scope

Coordinator: `src/app/setlists/[id]/stage/stage-mode-client.tsx`, its test, `src/app/setlists/[id]/practice/practice-mode-client.tsx`, `src/components/chart-annotations.tsx`, its test, `src/lib/domain/chart-annotations.ts`, its test, `e2e/practice-annotations.spec.ts`, and this record.

Maya: `src/app/setlists/[id]/practice/practice-tools-panel.tsx`, its test, `src/components/practice-song-timer.tsx`, its test, `src/components/shared-preparation.tsx`, `src/components/team-workspace.test.tsx`.

Fifteen candidate files total. Root `tickets.md` is tracking only, outside the release candidate.

## Independent review

Laura identified three P2 issues during baseline review: timer unmounted on panel close, canvas resize clipped its backing bitmap, and shared plan reload left the timer stale. Each was repaired on the first attempt. Final review approves the source and tests, including grow-only backing dimensions, loaded-image generation guard, lazy hidden mounted panel, saved-allocation callbacks, null-plan clearing, and persistence across song changes. Independent Vitest: 6 files / 29 tests pass. Independent scoped ESLint over 14 source/test paths with `--max-warnings 0` and `git diff --check` pass. Native workers have no terminals. Requested Maya `gpt-6-luna medium`, Laura `gpt-6.1-sol medium`; effective runtime settings and usage telemetry unavailable.

## Verification

- Production build: `E2E_FORCE_DEMO=1 NEXT_PUBLIC_E2E_FORCE_DEMO=1 npm run build` passes (Next.js 16.3.8 webpack). Initial test-only type error (`exact` in Testing Library role options) corrected; subsequent build passes.
- Full typecheck: `npm run typecheck` passes after final production build.
- Full website lint: `npm run lint:website` passes; affected source/test/E2E lint also passes after repairs.
- Production dependency audit: `npm audit --omit=dev --json` reports zero vulnerabilities. Full audit reports five existing high development advisories in the ESLint/fast-glob/micromatch/braces chain; dependency manifests unchanged.
- Full website coverage: `npm run test:coverage:website -- --maxWorkers=2` passes 158 files / 1205 tests. Statements 87.63%, branches 84.08%, functions 92.68%, lines 90.62%; all existing 80% gates pass. Initial unconstrained run had one unrelated Wooly 5-second timeout; isolated rerun passed and the complete final two-worker run passed without retries.
- Production browser: ten unique desktop/mobile journeys pass: eight tests from `practice-annotations.spec.ts` and existing `rehearsal-plan.spec.ts`, plus two existing `requested-fixes.spec.ts` Practice integration journeys. Verifies persisted keyboard/mouse/native-touch movement, drawing pixels in live Practice after resize and after Stage navigation, formatting, per-song isolation/reload, saved minutes, running timer close/reopen, countdown/pause/reset, dialog focus containment/restoration, meter/metronome/auto-scroll and no overflow. Annotation tests repeated 4/4 to preserve screenshots after the separate integration run replaced Playwright output. Screenshots under `.tmp/final-browser/` visually inspected: Stage drawings/text and mobile bottom-panel timer render correctly. No page errors in the annotation journey.
- Secret scan: `node scripts/scan-secrets.mjs` passes detector self-test with zero findings across history/working files. Exact 15-file scope independently reviewed; clean local commit/scope gate recorded after commit below.

## Engineering gates

Gates 01–22: pass through scoped intake, source/ownership/data-flow review, existing local storage conventions, extracted annotation component, typed validated notes, hydration-safe client mount, draft-preserving failures and focused regressions. Gates 23–29: N/A; no migrations, indexes, database mutations or changes to RLS boundaries. Existing team-filtered preparation loader and manager/proposal distinction remain unchanged. Gates 30–36: build/types/lint/full coverage/browser/dependency/accessibility review pass with the evidence above. Gate 37: final source/test review approved and clean committed scope gate passes. Standard lane; gold-specific Juan approval N/A. No issue reached the three-attempt repair limit.

Live authenticated hosted saves and cross-device annotation sharing are not claimed; annotations remain device-local. Local production preview: `http://127.0.0.1:3213/setlists/sunday-service/practice`.

## Local settlement

Exact 15-file clean scope and fetched-main ancestry gate passed on local candidate `6e703331e56ec9b32fca9f7b4b39195e7f3af435`; this documentation-only settlement is included in the amended final local commit. Source/test hashes remain the independently approved candidate. Gate 37 passes; all acceptance criteria and applicable gates pass. Final commit identity and reviewer settlement are recorded in the coordinator's root ticket record. No push, merge, deployment, hosted write or credential/config change performed. Local preview remains running on port 3213.
