# Lyrics Reflow Preview Sync — TDD Evidence

## Source and user journey

No source plan was provided. The journey was derived from the reported regression:

> As a presenter editor, I want a block text edit to appear immediately in the Lyrics Reflow card so the sidebar matches the canvas, timeline, and eventual block output.

## RED and GREEN evidence

| Stage | Command | Result | Evidence |
|---|---|---|---|
| RED | `npm test -- src/lib/presentation/lyrics-reflow.test.ts` | Expected failure | Vitest executed the new test target and failed to resolve the not-yet-implemented `./lyrics-reflow` module. |
| GREEN | `npm test -- src/lib/presentation/lyrics-reflow.test.ts` | PASS | 1 file and 3 tests passed after the resolver was implemented and connected to the sidebar. |
| Coverage | `npm run test:coverage -- src/lib/presentation/lyrics-reflow.test.ts` | PASS | 4 tests passed; statements, branches, functions, and lines were all 100%. |

## Test specification

| # | What is guaranteed | Test type | Result |
|---|---|---|---|
| 1 | An edited block displays its effective text instead of the stale generated lyric line. | Unit | PASS |
| 2 | Slides without overrides continue to display their generated lyric lines. | Unit | PASS |
| 3 | Word-level blocks are combined into visual row and left-to-right reading order. | Unit | PASS |
| 4 | Equal-position blocks remain stable and blank block text does not add visual noise. | Unit | PASS |

## Verification

| Check | Command | Result |
|---|---|---|
| Changed-file lint | `npx eslint src/app/presenter/presenter-client.tsx src/lib/presentation/lyrics-reflow.ts src/lib/presentation/lyrics-reflow.test.ts --max-warnings 0` | PASS |
| Full lint | `npm run lint` | PASS with four pre-existing `no-explicit-any` warnings outside this change |
| TypeScript | `npm run typecheck` | PASS |
| Production build | `npm run build` | PASS with Next.js 16.2.12 |
| Secret scan | `npm run security:secrets` | PASS, zero findings |
| Full unit suite | `npm test` | 336 passed, 1 skipped, and 1 unrelated existing formatting-contract failure in `src/components/dialog-contracts.test.ts` |
| Dependency audit | `npm audit --audit-level=high` | Four existing high-severity transitive dependency advisories; no dependency changes were made in this fix |

## Merge evidence and known gaps

- RED checkpoint: `90fa1c0 test: reproduce stale Lyrics Reflow preview`
- GREEN checkpoint: `e17358c fix: sync Lyrics Reflow preview with block edits`
- Coverage checkpoint: `b302171 test: cover Lyrics Reflow preview ordering`
- No schema, authorization, storage, caching, offline, migration, or environment-variable behavior changed.
- No dedicated browser E2E was added; the behavior is covered through the pure preview resolver, and the production build passed.
