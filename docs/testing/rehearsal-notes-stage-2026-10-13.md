# SETLIST-28 — Rehearsal notes in the setlist and Stage

User request: remove Download rehearsal plan and make per-song rehearsal notes available with the songs in the setlist and Stage mode.

Owner: coordinator implementation, Laura independent review. Standard lane; team isolation, draft persistence, cache freshness, and song-slot matching risks. Candidate continues the isolated codex/team-rehearsal-page branch from 4fff0a27875c4b93bac9a7209eb6b15057eedfed. Original dirty workspace preserved. Local implementation only; no push, merge, deployment, hosted database or credential/settings changes authorized.

## Acceptance and data flow

- Remove the download button and handler from both demo and shared preparation forms.
- Label per-song fields Rehearsal notes; retain the 500-character limit and existing minutes validation.
- Shared plan allocations.focus remains the canonical saved note for each setlist song slot. The existing manager save and member proposal/approval paths retain their permissions, revisions, and error handling. No duplicated write or overwrite of existing band notes, arrangement, lead, or lyrics.
- After saving, the setlist song card displays its rehearsal note. Stage displays the active slot's saved note in a wrapped, scrollable panel, switching it on song navigation.
- Stage's Practice workflow also receives the saved shared notes. The rehearsal page has an Open Stage mode link.
- Loader reads only allocations for the selected setlist and current team, validates stored rows with the existing schema, and includes only current slot IDs. Missing plans yield no notes. Failures are explicit while songs remain usable.
- Manager plan saves invalidate detail/rehearsal/Stage/Practice routes. Accepted member proposals already invalidate the setlists layout.
- Demo save is explicit and local to this device, keyed by setlist ID in localStorage. It persists notes and allocations through navigation/reload, not shared checklist responses. Invalid storage is ignored; blocked writes keep the draft and report failure. Connected pages never use demo notes.

No schema, database migration, environment variable, dependency, remote settings or offline service-worker changes. Existing authenticated active-membership RLS on rehearsal_plans in 20261006040000_shared_preparation_service_order.sql remains authoritative. Text is rendered as React text, never HTML.

## Exact ownership (28 paths)

- src/components/service-preparation.tsx and service-preparation.test.tsx
- src/components/shared-preparation.tsx and team-workspace.test.tsx
- src/components/rehearsal-song-fields.tsx
- src/components/rehearsal-note.tsx (new)
- src/components/setlist-song-order.tsx
- src/lib/use-demo-rehearsal-plan.ts (new)
- src/lib/supabase/workflow-data.ts and rehearsal-notes.test.ts (new test)
- src/app/workflow-actions.ts and workflow-actions.test.ts
- src/app/setlists/[id]/page.tsx and src/app/setlists/setlist-loaders.test.tsx
- src/app/setlists/[id]/rehearsal/page.tsx and page.test.tsx
- src/app/setlists/[id]/stage/page.tsx and page.test.tsx
- src/app/setlists/[id]/stage/stage-mode-client.tsx and stage-mode-client.test.tsx
- src/app/setlists/[id]/practice/page.tsx, practice-mode-client.tsx, practice-tools-panel.tsx
- e2e/rehearsal-plan.spec.ts and requested-fixes.spec.ts
- vitest.config.ts and vitest.website.config.ts
- This evidence document

The Vitest aliases bind server-only to Next's bundled empty server-condition module so unit tests can exercise the actual server loader without adding a dependency. Production retains the server-only import and Next's guard; the real production build checks that boundary. Both test configs use the same alias. The initial loader test identified the missing test-runner resolution; after the alias, it passes under both configs.

## Review and verification checkpoint

- Coordinator focused: 11 files / 60 tests pass. General Vitest config additionally passes the five loader tests.
- Laura independently inspected all 24 tracked diffs and three new source/test files, and ran 11 files / 63 tests including the timer and Practice tools. Source review approved without actionable findings.
- Reviewed 27-path manifest aggregate: 7be07c9c9150e66a2a5c2619b126316902d1f2934716382e2a6b4ab4d2b5862c. Manifest is sorted [path, SHA256(file bytes)] pairs for tracked differences from 4fff0a2 plus new files, excluding docs; aggregate is SHA256(JSON.stringify(entries)).
- Full website lint passed. Initial standalone typecheck passed before build.
- Initial full coverage run overlapped compilation and independent tests and hit two existing Git scope-fixture 5-second timeouts plus three worker startup timeouts. Those assertions/config timeouts are unchanged. The sequential final run with two workers passes.
- Final build: E2E_FORCE_DEMO=1 npm run build passed.
- Final standalone types: npx tsc --noEmit passed after build.
- Final full unit/coverage: npm run test:coverage:website -- --maxWorkers=2 passed 125 files / 692 tests. Statements 87.63%, branches 83.96%, functions 92.68%, lines 90.62%; all existing 80% thresholds passed.
- Affected browser integration: E2E_FORCE_DEMO=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3187 npx playwright test e2e/rehearsal-plan.spec.ts e2e/requested-fixes.spec.ts --grep 'setlist opens|rehearsal fields|Practice reuses' --project=chromium --project=mobile --reporter=line passed 6/6 against the production build. Saves a note, opens Stage, switches to a song with no note and back, verifies another setlist does not inherit it, revisits rehearsal and detail to confirm persistence, checks removal of download, maintains field alignment/timer and Practice controls. No remote Supabase requests in the rehearsal journey.
- Production audit: zero vulnerabilities. Full audit retains the same five known high development-only ESLint-chain advisories; no dependencies changed or downgraded.
- Secrets: zero findings, detector self-test passed. Diff whitespace clean. Coordinator recomputed the 27-path manifest and exactly matched Laura's reviewed bytes.

## Gates

Engineering-gates and completion-mandate reused from this session. Gates 01–22 pass for explicit criteria/ownership, existing canonical storage, guarded server reads, validated JSON/demo storage, per-slot matching, safe failures, hydration-safe useSyncExternalStore, accessible field names and full text. Schema/index/migration/policy changes 23–29 are N/A; unchanged RLS plus local team/slot filter and existing action permission tests are the relevant access evidence. Verification 30–37 passes for local implementation with the build/types/lint/unit/coverage/affected E2E/security/accessibility/independent-review evidence above. External publication gates are N/A. Hosted authenticated persistence is not claimed from demo browser tests; real action/RLS contracts are unchanged and wiring is tested locally.

Requested Laura configured gpt-6.1-sol medium; effective model/effort/usage receipt unavailable. Coordinator telemetry unavailable. No monetary claim. One loader test-harness resolution correction; one resource-contention coverage failure. No failed application repair loop.

## Settlement

Done for local implementation, 1/1. The 28 listed files are the complete follow-up scope. Only this document changed after final source verification/review. No push, merge, deployment, hosted data, credentials, configuration or unrelated feature edits. The local server on port 3187 runs the final production build. Preview: http://127.0.0.1:3187/setlists/youth-night/rehearsal?preview=stage-notes.
