# UI-34: Floating section navigation release

User authorized pushing a scoped branch and merging it into main on October 15, 2026 (Asia/Manila), with no secrets published.

## Current-main implementation

Base: fetched `origin/main` at `3f58005a7e32c18a7bf1b3e313692c9102ced319`. Branch: `codex/floating-section-navigation`. The original dirty workspace is preserved.

Current main shares `StageModeClient` between Stage and Practice. The scoped release updates that shared component: the desktop header and mobile right section controls become one floating bottom navigation bar. Buttons retain full section names and existing colors, original section indexes and broadcast callbacks, with 44px height and visible keyboard focus. The bar scrolls horizontally when necessary and respects the bottom safe area. Practice positions it above its annotation dock; annotation settings and the Practice panel retain their existing overlay behavior.

Current annotations, saved rehearsal allocations/timer, Practice tools, key saving, metronome, auto-scroll and song navigation remain intact. The earlier local preview used an older branch with additional double-view controls; those unrelated features and old files are not ported into this release.

Exactly five owned paths:

- `src/app/setlists/[id]/stage/stage-mode-client.tsx`
- `src/app/setlists/[id]/stage/stage-mode-client.test.tsx`
- `e2e/practice-annotations.spec.ts` (320px chart width assertion replaces the former 256px sidebar allocation)
- `e2e/floating-section-navigation.spec.ts`
- This document.

No dependency, environment, auth, schema, storage format, cache/offline policy, credential, account selection or remote settings changes. No historical branch tree replacement or manual deployment.

## Verification before publication

PASS: `npm ci --no-audit --no-fund` using main's unchanged lockfile.

PASS: `npm run lint:website`, `npm run typecheck`, `E2E_FORCE_DEMO=1 npm run build` (Next.js 16.3.8 production application), and `npm audit --omit=dev --audit-level=high` (zero vulnerabilities).

PASS: independent Laura review of the current-main diff and 15 tests across Stage, Practice and chart annotations. Commands use `npx vitest run --config vitest.website.config.ts` with `src/app/setlists/[id]/stage/stage-mode-client.test.tsx`, `src/app/setlists/[id]/practice/practice-mode-client.test.tsx` and `src/components/chart-annotations.test.tsx`. The new regression verifies full labels, a jump to the actual original section after unlabeled content, and shared Stage/Practice rendering. Initial JSDOM-only missing `scrollIntoView` setup was corrected by stubbing the actual section element; no application behavior repair was required.

PASS: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3240 E2E_FORCE_DEMO=1 npx playwright test e2e/floating-section-navigation.spec.ts e2e/practice-annotations.spec.ts --project=chromium --project=mobile --reporter=line`: 12 production browser cases. Both modes at 320px/1440px verify floating placement, viewport bounds, restored full chart width, full labels, 44px buttons, section jumps and focus. Practice annotation dock clearance, custom-color hit testing, saved drawings/formatted notes into read-only Stage, resize and saved rehearsal timer behavior pass. Screenshots visually inspected.

PASS: `node scripts/scan-secrets.mjs` self-test and zero findings, scanning Git history, commit messages and candidate working files. Existing oversized historical blobs are classified/skipped by the scanner; no new binary or private/config files are included. The final committed candidate is rescanned before push.

PASS: scoped diff review and whitespace check. The clean committed candidate must pass `node scripts/check-change-scope.mjs --files` with exactly the five paths above and fetched main ancestry immediately before publication. Required protected-main checks `quality`, `browser` and `local-database` must pass on the final PR head before merge. Protection is strict, applies to administrators, disallows force pushes/deletion and is not bypassed. Full website coverage and broader browser/database suites are enforced by those checks; final run IDs/results and merged SHA are recorded in the PR and coordinator ticket record.

## Engineering gates

Gates 01–12 and 14–18 pass: scope, risk, ownership, current-main callers, data boundaries, local Next guidance, skills, typed code and relevant validation. Gate 13 is N/A: one implementer and read-only independent reviewer. Gates 19–29 are N/A: no route, SSR/data-boundary, migration or authorization changes. Gates 30–36 pass for actual production build/types/lint, independent unit review and production desktop/mobile checks, no dependency changes, secret scan and affected accessibility. Gate 37 requires the final clean exact-scope/ancestry and independent candidate checks before push, followed by required CI before merge. Final settlement remains in the PR/ticket record to avoid altering the reviewed source candidate only for release metadata.

Effective model/effort and usage telemetry unavailable; Laura requested medium per project instructions. No issue reached three failed repairs.
