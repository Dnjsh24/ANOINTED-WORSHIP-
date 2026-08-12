# Stage section label colors TDD evidence

## Source and user journey

No external plan file was used. The journey was derived from the request: a Stage Mode musician can distinguish song sections quickly because only the section-name badges are color-coded, while chords and lyrics retain their existing colors.

## RED evidence

Command:

```text
npm exec vitest run -- src/app/setlists/[id]/stage/stage-mode-client.test.tsx
```

Result: 1 intended failure and 3 existing passes. The new test found the `Intro` chart badge still used the generic `text-zinc-300` class instead of the expected section color.

Checkpoint: `ef63a4b test(stage): require color-coded section labels`

## GREEN evidence

The Stage chart and its desktop/mobile section navigation now share one label-color mapping. Pre-Chorus is matched before Chorus so it keeps its own color. Lyrics and chords were not included in the mapping.

Command:

```text
npm exec vitest run -- src/app/setlists/[id]/stage/stage-mode-client.test.tsx
```

Result: 1 test file passed, 4 tests passed.

Checkpoint: `a2c43dd feat(stage): color-code song section labels`

## Test specification

| # | Guarantee | Test | Type | Result |
|---|---|---|---|---|
| 1 | Intro, Verse, Pre-Chorus, Chorus, Bridge, Instrumental, Tag, and Outro labels use distinct colors | `stage-mode-client.test.tsx: color-codes section labels without changing lyric colors` | Component integration | PASS |
| 2 | Verse and Chorus lyric lines keep their existing `text-zinc-100` styling | `stage-mode-client.test.tsx: color-codes section labels without changing lyric colors` | Component integration | PASS |
| 3 | Existing Nashville, capo, and saved-annotation Stage journeys still pass | `stage-mode-client.test.tsx` | Component integration | PASS |

## Verification and known gaps

- `npm exec eslint -- --max-warnings 0 ...` passed with no warnings.
- `npm run typecheck` passed.
- `npm run test:coverage:website` passed: 79 files and 363 tests. Coverage was 87.12% statements, 82.55% branches, 91.52% functions, and 90.20% lines.
- `npm run build` passed and generated all 43 static-page steps.
- No schema, authorization, storage, caching, environment-variable, or offline behavior changed.
- Browser E2E was not run; the focused component test verifies the user-visible class behavior at the Stage route boundary.
- `npm audit --omit=dev` reports two existing high-severity dependency advisories in `nanoid` and `undici`; no dependency was changed for this UI task.
