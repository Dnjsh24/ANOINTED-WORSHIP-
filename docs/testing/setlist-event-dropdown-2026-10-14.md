# SETLIST-29 — New Setlist Timeline dropdown

User request: add a dropdown below Notes in New Setlist to link the setlist to a Timeline event, with a standalone option.

Candidate: `codex/setlist-event-dropdown`, isolated checkout based on fetched `origin/main` `36e5760a2cadea054555cbb2ed852530632a7dc8`. Original dirty workspace preserved. Website scope only. No external publication, hosted data/settings, credentials, dependencies, or schema changes.

## Acceptance and ownership

Coordinator owns these exact application/test paths plus this evidence file:

- `src/components/setlist-form.tsx`
- `src/components/setlist-form.test.tsx`
- `src/app/setlists/new/page.tsx`
- `src/app/setlists/new/page.test.tsx`
- `src/app/actions.ts` (successful create cache invalidation only)
- `src/app/actions.workspaces.test.ts`
- `e2e/setlist-event-dropdown.spec.ts`

Ticket source remains the original workspace `tickets.md`, owned by coordinator.

Dropdown appears immediately below Notes on `/setlists/new`. Standalone is default. Options contain event name, date, and type. Active-team approved, non-deleted events with no active setlist are eligible. Valid `eventId` URL preselection is retained; foreign, occupied, and unavailable preselection is dropped. Changing event or returning to standalone retains name, notes, songs, and template. Standalone submits no `eventId`; selected events submit one identity. Empty and failed loads have distinct help text. Editing existing setlists keeps its existing content workflow.

Existing atomic `save_setlist_workspace` RPC validates UUID input, permission, same-team approved/non-deleted event, and songs. `update_event:false` preserves event schedule. Successful linking now invalidates `/events`, selected event detail, and `/dashboard`. No offline, storage, schema, or environment-variable contract changes.

## Verification

- Focused baseline: `npm run test:website -- src/components/setlist-form.test.tsx src/app/setlists/new/page.test.tsx src/app/actions.workspaces.test.ts` — 3 files, 23 tests passed.
- Independent Laura repeat of focused baseline — 23 tests passed.
- `npm run lint:website` — passed, zero warnings.
- `npm run typecheck` — passed.
- `git diff --check` — passed.
- `npm audit --omit=dev --json` — zero vulnerabilities.
- `node scripts/scan-secrets.mjs` — detector self-test passed, zero findings.
- Full `npm audit --json` — five existing high development ESLint-chain advisories. Dependency files unchanged.
- `npm run test:coverage:website -- --maxWorkers=2` — all 123 files / 670 tests passed; statements 87.63%, branches 83.96%, functions 92.68%, lines 90.62%. Every configured 80% threshold passed.
- `E2E_FORCE_DEMO=1 NEXT_PUBLIC_E2E_FORCE_DEMO=1 npm run build` (PowerShell environment syntax) — optimized Next.js 16.3.8 webpack production build passed, including TypeScript and all 45 generated pages.
- Against that production build on local port 3190: `npx playwright test e2e/setlist-event-dropdown.spec.ts --reporter=list` with `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3190` and forced-demo variables — 4/4 passed across Desktop Chrome and Pixel 7. Verified placement below Notes, native focus, event selection, preselection, standalone reset, name/notes retention, and no horizontal overflow. Remote Supabase requests blocked; none observed in switch workflow.
- Desktop/mobile screenshots in ignored `.tmp/setlist-event-dropdown-desktop.png` and `.tmp/setlist-event-dropdown-mobile.png`; visual layout inspected.
- Local review preview: http://127.0.0.1:3190/setlists/new (demo only).

## Independent review

Laura approved all changed application/test lines. Native dropdown has associated label/help, polite status updates, keyboard operation, visible focus, and 44px minimum height. No blocking findings. Existing limitation: unchanged RPC does not enforce event occupancy against concurrent stale selections; UI filters occupied options, and same-team/approval guards remain authoritative. No new migration requested or required for this scoped UI change. Hosted authenticated mutation was not executed; local mocked action tests verify guarded RPC input and failure behavior.

Reviewed SHA256 identities:

| File | SHA256 |
| --- | --- |
| src/components/setlist-form.tsx | 3EC8D2B46BB8FC1FB84D2C8E1AAF8F4FE5D20DA42805B3EE6752D0A19F99034C |
| src/components/setlist-form.test.tsx | 9E19816954B12EFC9ADFC87FB2B32F224C3A7B886586F26190058EFD3F0C1E08 |
| src/app/setlists/new/page.tsx | C624EEFD1D4CA39EA66AE3EC5CA869956E93F0F017DED60548A694661B422313 |
| src/app/setlists/new/page.test.tsx | 415CC9518692529F67FD05527544B37065CD419D1B6029125D4F901065159680 |
| src/app/actions.ts | 2257EE5ED18CBF0E9A4F715CF634BC3B0922A0F8EAB8BF325705CDC3E52EF9B6 |
| src/app/actions.workspaces.test.ts | 90F980DF34B6B44E02FC24DC6403825311FF3A92177F5A30567CE97D3F4DBF95 |
| e2e/setlist-event-dropdown.spec.ts | 428353F5914D378FAB079957D67A4DA1CC4FEB833A253972D161E10F61AC7F29 |

Coordinator model/effort/usage telemetry unavailable. Laura configured `gpt-6.1-sol medium`, effective receipt unverified; native worker has no terminal. No repair attempts.

## Engineering gates

Gates 01–22: passed through scoped intake/ownership, existing Next.js and form conventions, minimal native select, serializable props, isolation, readable typed code, event identity validation, failure help, and draft preservation. Gate 19 route/bundle splitting: unchanged existing route and no new dependency. Gates 23–24 migration/recovery: N/A, no schema changes. Gate 25: reviewed existing event/setlist relation; one team-scoped read, existing indexes unchanged. Gates 26–29: unchanged RLS/RPC boundary inspected; mocked team filter and denied save paths verified; hosted DB integration unavailable and not claimed. Gates 30–37: passed through production build, typecheck, lint, full website coverage, affected browser checks, security, native accessibility checks, and independent final diff review. Pre-existing development advisories recorded. All acceptance criteria verified locally. No source changed after independent review.
