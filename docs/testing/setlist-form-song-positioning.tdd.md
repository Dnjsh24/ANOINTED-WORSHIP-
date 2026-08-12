# Setlist form song positioning — TDD evidence

## Source and journey

No plan file was provided. The journey came from the reported editor behavior:

> As a setlist editor, I can reorder selected songs and drop a new library song at an exact position so later songs shift down automatically.

## RED

- Test: `src/components/setlist-form.test.tsx: reorders selected songs and inserts a library song at the dropped position`
- Command: `npm run test:website -- src/components/setlist-form.test.tsx`
- Result: **FAIL** — the selected songs had no accessible sortable list and drag-end events left their original order unchanged.
- Commit: `bcee633 test: reproduce setlist form song positioning`

## GREEN

- Reused the installed dnd-kit sortable pattern for selected songs.
- Existing selected songs can move to any position.
- A library song dropped before or after a selected row is inserted at that index; following rows and submitted `songIds` shift with it.
- Command: `npm run test:website -- src/components/setlist-form.test.tsx`
- Result: **PASS** — 3/3 tests.
- Command: `npm run lint -- src/components/setlist-form.tsx src/components/setlist-form.test.tsx --max-warnings 0`
- Result: **PASS**.
- Command: `npm run typecheck`
- Result: **PASS**.
- Commit: `8884b02 feat: position songs while editing setlists`

## Additional verification

| Check | Result |
|---|---|
| `npm run build` | PASS; 43 static pages generated and `/setlists/[id]/edit` built |
| `E2E_FORCE_DEMO=1 npm run test:e2e -- e2e/app.spec.ts --project=chromium --grep "setlist"` | PASS; 4/4 setlist journeys |
| `npm run test:coverage:website` | 322/323 tests passed; blocked by the unrelated whitespace assertion in `src/components/dialog-contracts.test.ts` |
| `npm run lint:website` | No errors; blocked by two existing `no-explicit-any` warnings in `src/app/setlists/[id]/edit/page.tsx` |
| `npm audit --audit-level=high` | Existing high-severity advisories in `brace-expansion`, `js-yaml`, `nanoid`, and `undici`; no dependency was added by this change |
| `npm run security:secrets` | PASS; zero findings |

## Operational impact

- Affected route: `/setlists/[id]/edit` and new-setlist forms with a song library.
- No authorization, team scope, schema, storage, caching, offline, migration, dependency, credential, or environment-variable changes.

## Selected-row overlay regression

- RED: `fdddfbc test: reproduce selected song overlay offset`; the selected row incorrectly rendered the wide library preview.
- GREEN: `aa65bb6 fix: keep selected song drag preview in list`; only `library-*` drags now use the custom overlay.
- Focused result: 4/4 tests passed; strict focused lint and typecheck passed.
- Website result: production build and 4/4 Chromium setlist journeys passed. Coverage remained blocked by the unrelated dialog whitespace assertion (326/327 passed), and website lint remained blocked by the same two existing `no-explicit-any` warnings.

## Animated insertion and reorder feedback (2026-08-13)

### Journey

> As a setlist editor, I can see a gap open between two songs before I drop a library song, and I can clearly see which selected song is moving while I rearrange the order.

### RED

- Test: `src/components/setlist-form.test.tsx: opens an animated insertion gap between the two songs around the drop position`
- Test: `src/components/setlist-form.test.tsx: visually lifts the selected song while the other rows animate around it`
- Command: `npm run test:website -- src/components/setlist-form.test.tsx`
- Result: **FAIL as expected** - 2 new tests failed and 4 existing tests passed because no insertion status/gap or selected-row reorder state existed.
- Commit: `71c0b9d test: reproduce setlist drag insertion feedback`

### GREEN

- The form keeps collapsed slots between every selected song and animates the active slot open as the pointer crosses a row midpoint.
- The slot names the exact new position (for example, `Drop as song 2`) and disappears after drop or cancellation.
- A selected row receives a visible violet lift, border, ring, and shadow while dnd-kit applies a 220 ms transform transition to moving rows.
- Command: `npm run test:website -- src/components/setlist-form.test.tsx`
- Result: **PASS** - 6/6 tests.
- Command: `npm run lint -- src/components/setlist-form.tsx src/components/setlist-form.test.tsx --max-warnings 0`
- Result: **PASS**.
- Command: `npm run typecheck`
- Result: **PASS**.
- Commit: `c6e3968 feat: animate setlist drag placement`

### Broader verification

| Check | Result |
|---|---|
| `npm run build` | PASS; Next.js 16.2.12 compiled, typechecked, and generated 43 static pages |
| `E2E_FORCE_DEMO=1 npm run test:e2e -- e2e/app.spec.ts --project=chromium --grep "setlist" --reporter=line` | PASS; 4/4 Chromium setlist smoke journeys |
| `npm run test:coverage:website` | 328/329 tests passed; blocked by the unrelated CRLF-sensitive assertion in `src/components/dialog-contracts.test.ts` |
| `npm run lint:website` | No errors; blocked by the two existing `no-explicit-any` warnings in `src/app/setlists/[id]/edit/page.tsx` |
| `npm audit --audit-level=high` | Existing high-severity advisories in `brace-expansion`, `js-yaml`, `nanoid`, and `undici`; no dependency changed in this task |
| `npm run security:secrets` | PASS; detector self-test passed and findings were empty |

The forced-demo edit route does not seed a song library, so browser automation could smoke-test the setlist routes but could not capture the transient insertion gap. Exact gap placement, cancellation, reorder highlighting, final order, and submitted `songIds` are covered by the focused component tests.

### Operational impact

- Affected routes: `/setlists/new` and `/setlists/[id]/edit` when a song library is available.
- No authorization, team-scope, schema, storage, caching, offline, migration, dependency, credential, or environment-variable changes.
