# RELEASE-29 — Publish rehearsal page, timer, and Stage notes

User explicitly authorized pushing the rehearsal update as a branch and merging into main, with no secrets. Coordinator owns release; Laura independently reviews the final candidate. Standard lane. Requested model/effort and usage telemetry are unexposed; configured Laura gpt-6.1-sol medium is unverified.

Fetched main: 36e5760a2cadea054555cbb2ed852530632a7dc8. Clean checkout: codex/team-rehearsal-plan-release, created from current main. Only reviewed commits 2b6212d, 4fff0a2, and 6159416 were ported. The original dirty workspace and local preview checkout remain preserved. Canonical Git source comparison to 6159416 is empty for src/, e2e/, and both Vitest configs. Physical checkout hashes can differ due Git line endings.

## Resulting behavior

Each setlist has a Team rehearsal plan button opening a dedicated page. Tools show immediately. Song notes/minutes align on desktop and stack on mobile. Run-through timer shows current musical cues and next song. Download is removed. Saving rehearsal notes makes the notes visible on setlist song cards and in Stage for the active song. Shared notes use existing plan allocations by slot, unchanged manager/member approval permissions, and current-team scoped reads. Demo notes explicitly save on the local device. No migrations, environment variables, dependencies, hosted data, credential changes, or new settings.

## Exact owned paths (35)

- docs/testing/rehearsal-notes-stage-2026-10-13.md
- docs/testing/rehearsal-tools-2026-10-13.md
- docs/testing/team-rehearsal-page-2026-10-13.md
- e2e/rehearsal-plan.spec.ts
- e2e/requested-fixes.spec.ts
- src/app/setlists/[id]/page.tsx
- src/app/setlists/[id]/practice/page.tsx
- src/app/setlists/[id]/practice/practice-mode-client.tsx
- src/app/setlists/[id]/practice/practice-tools-panel.tsx
- src/app/setlists/[id]/rehearsal/page.test.tsx
- src/app/setlists/[id]/rehearsal/page.tsx
- src/app/setlists/[id]/stage/page.test.tsx
- src/app/setlists/[id]/stage/page.tsx
- src/app/setlists/[id]/stage/stage-mode-client.test.tsx
- src/app/setlists/[id]/stage/stage-mode-client.tsx
- src/app/setlists/setlist-loaders.test.tsx
- src/app/workflow-actions.test.ts
- src/app/workflow-actions.ts
- src/components/rehearsal-note.tsx
- src/components/rehearsal-run-through.test.tsx
- src/components/rehearsal-run-through.tsx
- src/components/rehearsal-song-fields.tsx
- src/components/service-preparation.test.tsx
- src/components/service-preparation.tsx
- src/components/setlist-song-order.tsx
- src/components/shared-preparation.tsx
- src/components/team-workspace.test.tsx
- src/lib/supabase/rehearsal-notes.test.ts
- src/lib/supabase/workflow-data.ts
- src/lib/use-demo-rehearsal-plan.ts
- vitest.config.ts
- vitest.website.config.ts
- scripts/check-change-scope.mjs
- scripts/check-change-scope.test.mjs
- docs/testing/rehearsal-release-2026-10-14.md

The release adds a narrow correction to the required change-scope tool: Next's literal [id] route paths were being rejected as globs. Square brackets are now allowed in literal declarations; changed files still use exact string equality and no glob expansion. New tests accept dynamic/catch-all/optional-catch-all route paths and reject treating [f]ix.txt as a pattern for fix.txt. Existing broad declarations, stale ancestry, dirty tree, unrelated changes, and rename checks remain.

## Preservation and security

Git comparisons confirm Analytics, AppShell, global CSS, all public assets, schema/migrations, workflows, package manifests and lock unchanged from current main. Only the listed paths may ship. Required protection was read before publishing: main requires strict up-to-date quality, browser, and local-database checks; applies to admins; allows neither force pushes nor deletion. Zero mandatory GitHub approvals is the configured owner workflow; independent agent review remains required.

Existing signed-in owner Dnjsh24 is used through the normal credential helper for this authorized release. Original active CLI selection Dn-Jsh will be restored after remote mutations. No tokens are printed, written to files, or committed. No .env/private key files are in the change set. Independent and coordinator repository scanners report zero findings and pass their detector self-tests. Five oversized historical blobs are skipped by the existing scanner; they are unchanged base history already on main. No oversized working files or new binary feature assets.

## Local verification checkpoint

- Full website tests/coverage: 125 files / 696 tests passed with two workers. Statements 87.63%, branches 83.96%, functions 92.68%, lines 90.62%; all 80% gates passed.
- Narrow checker tests: coordinator and Laura each passed 17/17.
- Independent combined source review: no actionable findings; application committed bytes match the previously reviewed feature candidate. Final clean committed scope/document approval pending.
- Coordinator and Laura secret scanner: zero findings, self-test passed; no oversized working files.
- Production dependency audit: zero vulnerabilities. Full audit retains five known development-only ESLint-chain high advisories; no dependency changes or force downgrade.
- Prior unchanged feature proof: 692 full tests, build/types/full lint, six desktop/mobile rehearsal-to-Stage/Practice journeys, and independent 63 tests.
- Fresh release build: E2E_FORCE_DEMO=1 npm run build passed; the rehearsal route is present.
- Fresh full website lint and standalone npx tsc --noEmit passed.
- Fresh release production-build browser checks on port 3188: six desktop/mobile rehearsal, timer/layout, saved-note-to-Stage, and Practice journeys passed.
- Final secret scan, clean committed 35-path scope gate and exact-commit independent settlement are required before push; required GitHub checks before merge.

## Completion gates

Engineering-gates and completion-mandate apply. Current-main ancestry, exact scope, unchanged unrelated features, final independent review, secret/dependency checks, relevant local build/types/lint/unit/coverage/browser checks, required protected CI, merge SHA, and automatic deployment identity must be evidenced. Schema/data mutation gates are N/A: no new migration or permission policy. Hosted authenticated rehearsal save is not claimed from demo browser tests; existing action/RLS contracts are unchanged and route/data wiring is locally tested.

No manual deployment, protection bypass, forced push, main reset, branch deletion, hosted migration, or credential modification. Required CI and protected merge are pending until final-head checks pass. Final settlement is recorded in the coordinator's original tickets.md to avoid modifying the published candidate merely to add merge metadata.
