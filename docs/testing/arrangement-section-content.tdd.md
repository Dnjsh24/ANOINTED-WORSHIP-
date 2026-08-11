# Arrangement Section Content TDD Evidence

## Source and user journey

No plan file was supplied. The journey was derived from the requested arrangement-editor behavior:

- As a worship setlist editor, I can select any sequence item and edit its name, chords, and lyrics so custom sections such as an Ending are preserved and shown during the setlist.
- Repeated sections are separate arrangement occurrences, so changing the second Chorus does not overwrite the first Chorus.

## Task report

| Behavior | RED evidence | GREEN evidence | Guarantee |
|---|---|---|---|
| Add and edit an Ending | `npm run test:website -- src/lib/domain/arrangements.test.ts src/components/arrangement-editor.test.tsx src/lib/supabase/arrangement-sections-migration.test.ts` failed because the add/edit controls and section persistence did not exist. | The same target passed: 3 files, 10 tests. | Adding Ending selects it, accepts chord/lyric text, and includes the content when saving. |
| Keep repeated sections independent | The component test could not find `Edit Chorus 2`. | `arrangement-editor.test.tsx` passed. | Each sequence occurrence retains its own content and stable ID. |
| Persist custom content | The migration test failed because `arrangement_sections` did not exist. | `arrangement-sections-migration.test.ts` passed. | A nullable JSONB field stores custom per-occurrence content without rewriting existing rows. |
| Render saved content | The domain module was missing during RED. | `arrangements.test.ts` passed. | Saved chord/lyric text is parsed into the same section structure used by song and stage views. |

## Test specification

| # | What is guaranteed | Test target | Type | Result |
|---|---|---|---|---|
| 1 | Existing section content is copied into a legacy arrangement and a new Ending starts empty | `src/lib/domain/arrangements.test.ts` | Unit | PASS |
| 2 | Inline and stacked chord formats survive arrangement editing | `src/lib/domain/arrangements.test.ts` | Unit | PASS |
| 3 | Malformed, oversized, or over-count persisted values are rejected | `src/lib/domain/arrangements.test.ts` | Unit/security boundary | PASS |
| 4 | Repeated section occurrences save independently | `src/components/arrangement-editor.test.tsx` | Component integration | PASS |
| 5 | The schema change is nullable JSONB and has no table-rewriting default | `src/lib/supabase/arrangement-sections-migration.test.ts` | Migration contract | PASS |
| 6 | Existing server-action integrity contracts remain green | `src/app/actions.integrity.test.ts` | Server boundary | PASS |

## Validation results

- Feature and action tests: `npm run test:website -- src/app/actions.integrity.test.ts src/lib/domain/arrangements.test.ts src/components/arrangement-editor.test.tsx src/lib/supabase/arrangement-sections-migration.test.ts` — 4 files and 22 tests passed.
- Focused lint: touched website TypeScript and test files passed ESLint with `--max-warnings 0`.
- Focused coverage: `arrangements.ts` reached 96.07% statements, 89.36% branches, 100% functions, and 97.77% lines.
- Production build: `npm run build` passed and generated all 43 static pages.
- Full website lint is currently blocked by four unrelated `no-explicit-any` warnings in `src/app/setlists/[id]/edit/page.tsx` and `src/components/setlist-form.tsx`.
- Full website tests are currently blocked by unrelated failures in `src/components/dialog-contracts.test.ts` and `src/components/setlist-form.test.tsx`.
- Standalone `npm run typecheck` is currently blocked by the unrelated `setlist-form.test.tsx` import of a missing `snapDragPreviewToCursor` export. The Next.js production build TypeScript phase passed.

## Deployment note

Apply `20260812000000_add_setlist_song_arrangement_sections.sql` before deploying the website code. No new environment variables are required. The migration was created but not applied from this workspace.
