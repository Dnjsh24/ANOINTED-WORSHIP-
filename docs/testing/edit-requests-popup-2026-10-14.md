# REQ-01 — Header edit requests popup

Status: Done locally, completed 1/1. Owner: coordinator; independent reviewer: Laura. Standard lane, scoped UI/read-only query risk. Base: fetched origin/main `36e5760a2cadea054555cbb2ed852530632a7dc8`. The original dirty workspace is preserved.

## Acceptance and ownership

Clicking the header clipboard button opens a popup without navigation. Show the five newest visible pending requests, their content type and reason, with a footer linking to `/requests`. Count all visible pending requests, hiding zero and displaying `9+` above nine while exposing the exact count to assistive technology. Escape, outside interaction and leaving focus close the popup; Escape restores trigger focus. Notifications and requests are mutually exclusive. Opening, window focus, a 60-second fallback and realtime changes refresh the data. Errors have a retry action, distinct from an empty queue.

Coordinator owns only `src/components/app-shell-actions.tsx`, `src/components/edit-requests-menu.tsx`, `src/components/edit-requests-menu.test.tsx`, `e2e/edit-requests-popup.spec.ts`, this evidence file and the appended `tickets.md` entry. No desktop sources, remote writes, credentials, migrations, dependencies, environment configuration, push, merge or deployment are changed. The shared header is used across signed-in website routes; existing mobile navigation remains as implemented.

## Data and authorization

The browser client queries the existing `shared_edit_requests` table with explicit `team_id` and `status=pending`, exact count, deterministic descending timestamp/ID order, and a five-row limit. Only ID/type/reason/timestamp are selected, and the existing Zod row schema validates the preview. Existing SELECT RLS restricts data to active team membership, target visibility and the request author or eligible reviewer. The popup does not add authorization or mutation paths. The keyed team/user component resets state when context changes; active and sequence guards discard old query results. Polling covers deployments where this table is absent from the realtime publication. No offline storage or cache policy changes.

## Independent review

Laura independently inspected the final source, request SELECT policies (20261006050000 and 20261012020000), affected callers, component tests and browser journeys. One P2 finding was fixed: an inline callback could refocus the first preview on header rerenders. `useCallback` stabilizes the callback, with an integration regression test preserving footer focus. Laura approved the revised candidate and independently ran eight popup tests successfully. Effective model/effort and usage telemetry were unavailable; requested reviewer setting was gpt-6.1-sol medium.

Approved source SHA256:

- App shell: `1B9EDC0899D5C1703161770362F9A5806FBEEB7EFE0CF50A528D50D2F90E2B3E`
- Popup: `B772AC203011D58DBDB059377349CD1D58647923D632C54B012E02F4FC8EFB37`
- Component tests: `A72C1EEE3D0F61A8816C3EA397A7F6ABA0CE842BB645337DE724E67DFADEBD2B`
- Browser tests: `C1C29E57C1800B9CBAEC88D72DB5966448464EBFF746EEE8319A77CFD1429690`

## Verification

- Focused integration/domain/action tests: `npx vitest run --config vitest.website.config.ts src/components/edit-requests-menu.test.tsx src/components/edit-requests.test.tsx src/app/edit-request-actions.test.ts src/lib/domain/shared-edit-requests.test.ts` — 4 files, 33 tests pass.
- New popup coverage: `npx vitest run --config vitest.website.config.ts src/components/edit-requests-menu.test.tsx --coverage --coverage.include=src/components/edit-requests-menu.tsx --coverage.reportsDirectory=output/edit-requests-popup-coverage` — 8 tests pass; statements 92.30%, branches 82.75%, functions 94.73%, lines 96.92%, all configured 80% thresholds pass. This is the new component's coverage, not a full-repository coverage claim.
- Scoped ESLint for all four code/test paths, zero warnings: pass.
- Full `npm run lint:website` and fresh `npx tsc --noEmit`: pass, exit 0.
- `E2E_FORCE_DEMO=1 NEXT_PUBLIC_E2E_FORCE_DEMO=1 npm run build` (process-local PowerShell environment assignment): final production webpack build pass, exit 0, Next.js 16.3.8. The final build includes the independently reviewed focus fix.
- `npm audit --omit=dev --audit-level=high`: zero production vulnerabilities; no dependency edits.
- `npm run security:secrets`: detector self-test passes; no findings across 689 working files and 2,738 history blobs; scanner reports five oversized historical blobs skipped.
- `git diff --check`: pass. Final four code/test hashes exactly match Laura's approved candidate; tracked changes are only the shell and appended ticket entry, with the remaining four owned source/evidence files newly added. Generated local coverage and screenshot artifacts remain outside source ownership and are not staged.
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3191 E2E_FORCE_DEMO=1 npx playwright test e2e/edit-requests-popup.spec.ts e2e/app.spec.ts --project=chromium --grep 'header request popup|request popup closes|global shell opens notifications' --reporter=line` (process-local PowerShell environment assignment): three tests pass, exit 0. Actual browser navigation to `/requests`, Escape and focus restoration, outside-click dismissal, switching both popup directions and original notification/settings navigation pass. Remote Supabase requests are blocked and asserted absent.
- Screenshot `output/edit-requests-popup-demo.png` visually inspected after finite animations settle: opaque popup aligns beneath clipboard icon, text and footer are visible, header controls and surrounding dashboard retain their layout. Preview is a forced-demo guest state; it intentionally contains no invented saved requests.

The benign jsdom navigation-not-implemented message arises from exercising a real Link in a component test; actual route navigation is covered separately in Playwright. No live authenticated hosted query was executed, so mocked count/error/race tests and existing-policy review do not claim runtime database verification.

## Engineering gates

Gates 01–12: acceptance, boundaries, owner, risk, dependencies, conventions, contracts, ownership and verification above. Gate 13: isolated main-based checkout. Gate 14: required skills loaded (caveman, clean-code-typescript, ponytail, accessibility-wcag, code-review, engineering-gates, completion-mandate); bundled Next use-client guide read. Gates 15–22: existing patterns, typed schema, descriptive names, isolated component, no new route or server/client contract, validation/error handling covered. Gates 23–29: schema/write/migration/rollback gates N/A because no data writes or schema changes; SELECT policy statically reviewed, hosted runtime unavailable. Gates 30–37: checks above and final settlement below. No release scope checker run is claimed; that clean-committed-tree release gate applies before a separately authorized publication.

Attempts: one test expectation correction (first preview receives focus rather than footer), one independently identified focus repair. No repeated failing repair loop. All local acceptance criteria/checks pass and independent review approves the same source candidate. No remaining local blocker. Preview: http://127.0.0.1:3191/dashboard, production server session 9982. No commit, push, merge, deployment or remote changes. Next action is user inspection of the local preview; publication requires separately scoped authorization and the clean-candidate release gates.
