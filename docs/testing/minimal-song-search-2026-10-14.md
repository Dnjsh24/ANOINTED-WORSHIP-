# UI-32 — Minimal song search and team code width

The Generate new code button now fills its container, matching Copy Code on Team Controls. The shared button also fills the code panel in Ministry Defaults.

Song Library uses one compact search input with a search icon and adjacent Filters button, following Setlists/Timeline styling. Enter or the icon submits the existing native GET search. Filters expands the real sort/favorites controls; closing the panel retains their values and includes them in subsequent searches. Full-library server search, pagination, favorite actions and regeneration confirmation/error handling remain unchanged.

## Candidate and ownership

Branch codex/minimal-song-search, based on fetched origin/main 167f3af2d2d0818fe0fd224b550e2e2a388ad408. Original dirty workspace preserved except the coordinator's appended tickets.md entry.

Exact five candidate paths:

- src/components/team-code-actions.tsx: width class only.
- src/components/song-library-grid.tsx: search/filter controls only.
- e2e/app.spec.ts: affected song search/filter interaction steps only.
- e2e/minimal-song-search.spec.ts: responsive layout and query persistence checks.
- This evidence record.

## Verification

- Forced-demo production build: E2E_FORCE_DEMO=1 NEXT_PUBLIC_E2E_FORCE_DEMO=1 npm run build — passed, including TypeScript.
- npm run lint:website — passed, zero warnings.
- npx vitest run --config vitest.website.config.ts src/components/settings-access.test.tsx src/app/actions.songs.test.ts src/lib/domain/team-code.test.ts src/lib/domain/listing-pagination.test.ts — 4 files, 20 tests passed.
- PLAYWRIGHT_BASE_URL=http://127.0.0.1:3216 npx playwright test e2e/minimal-song-search.spec.ts e2e/app.spec.ts --grep 'song search stays compact|generate code matches|team/profile/song/settings controls' --reporter=line — 6/6 passed, Chromium and Pixel 7.
- Final dedicated browser rerun after screenshot centering: 4/4 passed.
- npm audit --omit=dev --json — zero vulnerabilities.
- git diff --check — passed.
- Screenshots visually inspected on desktop/mobile. Search and Filters share one row; sort/favorites are initially hidden. Generate and Copy have equal x/width. Native Enter/icon submissions, collapsed filter persistence, result query and no mobile overflow passed.
- Independent Laura review approved exact source/test candidate; independently ran settings and pagination 10/10 tests. Product blob hashes: team-code-actions 62fdd15579ce278e7d09a4b1f2046d0fb7b48045; song-library-grid 6e967e56ba6ed3e5dc06b99830b1b10b84e1a2ef; app.spec 702f6bee3e5b530662296d8aef5a95cdaf4b2675.

One initial test measured each control during different animation frames. Fixed by measuring both bounding rectangles synchronously; exact source unchanged. No product repair attempts. Screenshot animation/centering changes affect artifacts only.

Full unit coverage and unrelated browser suites were not repeated: this change affects markup/layout, with no new business logic; targeted behavior tests, production build, website lint and affected browser paths cover its risk. Hosted authenticated mutations were not performed. No schema, authorization, storage, cache, offline, environment or dependency changes. No migrations/environment variables to deploy.

## Engineering gates

| Gates | Result and evidence |
| --- | --- |
| 01–12 | Passed: scoped criteria, owner, standard lane, boundaries, conventions, unchanged GET/server contracts and exact ownership above. No dependencies. |
| 13–18 | Passed: isolated managed checkout, required skills loaded, narrow readable diff, types preserved, existing Input/Button reused. |
| 19–20 | N/A route splitting; existing client boundary preserved, SSR production build and hydrated browser controls pass. |
| 21–22 | Passed: existing maxLength/server sanitization and action error handling preserved; query/action tests pass. |
| 23–29 | N/A: no database/schema/RLS changes or remote mutations. |
| 30–37 | Passed: build/types/lint/targeted tests/browser/audit/accessibility and independent review above; final scope check recorded in tickets.md. |

Accessibility: labeled input and submit icon, decorative icons hidden, disclosure aria-expanded/aria-controls, hidden controls excluded from focus/accessibility tree, visible focus rings and native form semantics.

Local preview: http://127.0.0.1:3216/songs and http://127.0.0.1:3216/admin/settings. No push, merge, deployment, credentials or third-party settings/data changes. Laura assigned gpt-6.1-sol medium; effective effort and usage telemetry unavailable.
