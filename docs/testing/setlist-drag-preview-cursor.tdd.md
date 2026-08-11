# Setlist drag preview cursor alignment — TDD evidence

## Source and user journey

No source plan was provided. The journey was derived from the reported setlist editor behavior:

> As a setlist editor, I want the song preview to remain under my pointer while I drag from the song library, so I can place the song naturally in the setlist drop zone.

## Task report

### RED

- Added `src/components/setlist-form.test.tsx` to require the preview to render outside the form layout container.
- Command: `npm run test:website -- src/components/setlist-form.test.tsx`
- Result: **FAIL**, 1 test failed because the form container contained the drag overlay.
- Checkpoint: `9499191 test: add reproducer for setlist drag preview offset`

- Added the cursor-centering coordinate guarantee.
- Command: `npm run test:website -- src/components/setlist-form.test.tsx`
- Result: **FAIL**, 2 tests failed: the cursor modifier was missing and the overlay remained inside the form container.
- Checkpoint: `008bbd6 test: specify cursor-centered setlist drag preview`

### GREEN

- Added a cursor-centering drag modifier, portaled the `DragOverlay` to `document.body`, and made the preview use the measured source width.
- Command: `npm run test:website -- src/components/setlist-form.test.tsx`
- Result: **PASS**, 1 file and 2 tests passed.
- Command: `npm run lint -- src/components/setlist-form.tsx src/components/setlist-form.test.tsx --max-warnings 0`
- Result: **PASS**, no errors or warnings.
- Command: `npm run typecheck`
- Result: **PASS**.
- Checkpoint: `6a5453f fix: align setlist drag preview with cursor`

## Test specification

| # | What is guaranteed | Test target | Type | Result | Evidence |
|---|---|---|---|---|---|
| 1 | The drag preview is centered on the pointer instead of appearing to its side. | `src/components/setlist-form.test.tsx: centers the preview on the pointer instead of offsetting it to the side` | Unit | PASS | `npm run test:website -- src/components/setlist-form.test.tsx` |
| 2 | The active preview is rendered outside the form layout and directly under `document.body`. | `src/components/setlist-form.test.tsx: renders the active song preview outside the animated form layout` | Component integration | PASS | `npm run test:website -- src/components/setlist-form.test.tsx` |
| 3 | Existing setlist routes and create/edit journeys still render and navigate in Chromium. | `e2e/app.spec.ts` setlist grep | E2E | PASS (4/4) | `E2E_FORCE_DEMO=1 npm run test:e2e -- e2e/app.spec.ts --project=chromium --grep "setlist"` |
| 4 | The production website compiles, typechecks, and generates all routes. | Production build | Build | PASS | `npm run build` |

## Coverage and known gaps

- `npm run test:coverage:website` ran 322 tests: 321 passed and 1 unrelated source-format contract failed in `src/components/dialog-contracts.test.ts`. Because the run stopped on that pre-existing failure, it did not produce a passing coverage-threshold result.
- `npm run lint:website` found no errors but failed its zero-warning gate on two pre-existing `no-explicit-any` warnings in `src/app/setlists/[id]/edit/page.tsx` (lines 93 and 104 at verification time).
- The focused drag-preview files pass strict zero-warning lint, and the repository-wide TypeScript and production build checks pass.
- No test is skipped or disabled for this fix.

## Operational impact

- Route affected: `/setlists/[id]/edit` and any setlist form supplied with a song library.
- No authorization, team-scope, schema, storage, caching, offline, migration, credential, or environment-variable changes.
