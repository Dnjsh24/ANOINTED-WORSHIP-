# SETLIST-26 — Dedicated team rehearsal page

User request: move the pictured team rehearsal plan to a new page inside each setlist and add a button to open it.

Owner: coordinator implementation, Laura independent review. Standard lane; routing, authorization, and stale-cache risks. Baseline: fetched origin/main 36e5760a2cadea054555cbb2ed852530632a7dc8. Candidate branch: codex/team-rehearsal-page. Original dirty workspace is preserved. No push, deployment, remote data, or credential changes are authorized for this task.

## Acceptance criteria

- Setlist detail has a Team rehearsal plan button linking to /setlists/[id]/rehearsal; the inline form moves off that detail screen.
- Dedicated page identifies its setlist, includes Back to setlist, and reuses the existing shared preparation form.
- Saved song allocations, focus, assignees, checks, revisions, download, reload, direct manager saves, and member change proposals retain their contracts.
- Team-scoped loading, effective permissions, song slot IDs/order/keys, standalone/empty lists, and explicit failure behavior are preserved.
- Demo plans are explicitly local and never substitute for unavailable production data.
- Targeted regression checks, relevant lint/types/build, desktop/mobile navigation, and independent review pass.

## Exact ownership

1. src/app/setlists/[id]/page.tsx — remove inline preparation load/form; add button.
2. src/app/setlists/[id]/rehearsal/page.tsx — guarded new route and existing form composition.
3. src/app/setlists/[id]/rehearsal/page.test.tsx — team isolation, ordered songs, permissions, proposals, errors, empty/standalone/demo.
4. src/app/setlists/setlist-loaders.test.tsx — button and removal regression.
5. src/app/workflow-actions.ts — invalidate the new route after successful plan/check saves.
6. src/app/workflow-actions.test.ts — new-route invalidation regression.
7. e2e/rehearsal-plan.spec.ts — desktop/mobile button, local editing/check/download, overflow, return navigation.
8. This evidence file.

Practice mode retains its existing preparation access. The new page uses the same SharedPreparation component, actions, and workflow loader as before. Approval actions already invalidate the setlists layout. No schema, storage, offline, dependency, environment, or authorization policy changes. The guarded server route filters both setlist ID and current team ID before loading its existing workspace. Missing production rows return notFound; database query failures are explicit; unavailable shared plans display the loader's status. Demo uses the existing local ServicePreparation component with a local-only notice.

## Validation checkpoint

- Focused Vitest: 5 files / 26 tests passed, including 9 new route cases, button/removal regression, invalidation regression, existing workflow boundaries and local preparation/download tests.
- Scoped ESLint: passed with zero warnings.
- TypeScript: npx tsc --noEmit passed.
- Production dependency audit: zero vulnerabilities.
- Secret scanner: zero findings; detector self-test passed.
- Production build: E2E_FORCE_DEMO=1 npm run build passed; /setlists/[id]/rehearsal is listed as a dynamic route.
- Full website lint: npm run lint:website passed with zero warnings.
- Full website tests/coverage: npm run test:coverage:website passed, 123 files / 674 tests. Statements 87.63%, branches 83.96%, functions 92.68%, lines 90.62%; all existing 80% thresholds passed.
- Desktop and mobile browser: E2E_FORCE_DEMO=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3187 npx playwright test e2e/rehearsal-plan.spec.ts --project=chromium --project=mobile --reporter=line passed 2/2 against the production build. Button, heading, labeled editing, check, download filename, viewport overflow, and back navigation passed; no remote Supabase requests.
- Independent Laura review approved with no actionable findings. Independent focused checks passed 32 tests across 6 files; whitespace clean.
- Full npm audit reports the same 5 high development-only braces/micromatch/fast-glob/ESLint-chain advisories already documented by GIT-03. Production audit is clean; no dependencies changed. No force-fix or framework downgrade performed.

## Engineering gates

Intake/architecture/implementation gates 01–22: criteria, ownership, current-main isolated checkout, existing component/action reuse, server/client boundaries, strict types, readable names, permission and query error checks covered above. No new abstraction/dependency. Schema and migration gates 23–25 are N/A because the change only composes existing read/action interfaces. Policy modification gates 26–29 are N/A because no RLS or write authorization changes; route denied/missing-team rows and existing action permission tests are the relevant local boundary checks. Verification gates 30–37 pass for the local implementation with the evidence above: build, types, full lint, full unit/coverage, affected browser paths, unchanged dependency/security interfaces, semantic links/labels, responsive browser checks, and independent final review. Hosted authenticated persistence cannot be claimed from demo browser tests; existing component/action contracts are retained and their route wiring is verified by unit tests. Release-only protected CI/merge/deployment gates are N/A: no external publication was requested.

Model/effort: coordinator telemetry unavailable; Laura requested gpt-6.1-sol medium via configured role, effective model/effort/usage unexposed. No monetary claim. Repair attempts: zero.

## Final candidate

Done for local implementation, 1/1. All acceptance criteria above pass. Laura reviewed the final application bytes; SHA256:

- rehearsal/page.tsx: 732B27F75B3D11062D3EF173B84B53BBF1829DCBF77BD958E08E428A05726A04
- setlist detail page.tsx: 2CFC98E93D38981AC06E78B5465E0B0BF748CF51E13F5B2DCCF7E5FD23BF194C
- workflow-actions.ts: 25686E41096610D3D508EC166095C74FFFF1355001E3773DA94D90B3AF79D1D2

Only this evidence document changed after application verification/review. The eight owned paths are the complete local candidate. Local preview is at http://127.0.0.1:3187/setlists/sunday-service/rehearsal while its server runs. No publish, merge, deployment, hosted SQL, credential, configuration, or unrelated feature edits performed.
