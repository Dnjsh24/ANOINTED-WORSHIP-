# Nashville notation and Stage annotations TDD evidence

## Source and user journeys

No external plan file was used. The journeys were derived from the request:

1. A musician can switch a song chart between chord names and Nashville numbers.
2. A musician can use the same notation switch in Stage Mode, based on the displayed song key.
3. A musician can select an annotation color in Stage Mode and have the completed drawing restored for that setlist song on the same device.

## RED evidence

Command:

```text
npm exec vitest run -- src/components/song-viewer.test.tsx src/app/setlists/[id]/stage/stage-mode-client.test.tsx
```

Result: 3 intended failures and 3 existing passes. The failures reported that the accessible `Nashville` and `Draw annotations` controls did not exist.

Checkpoint: `3747b94 test(stage): add Nashville and annotation journeys`

## GREEN evidence

Command:

```text
npm exec vitest run -- src/lib/domain/chords.test.ts src/components/song-viewer.test.tsx src/app/setlists/[id]/stage/stage-mode-client.test.tsx
```

Result: 3 test files passed, 11 tests passed.

Additional checks:

```text
npm exec eslint -- --max-warnings 0 src/components/chord-notation-toggle.tsx src/components/song-viewer.tsx src/components/song-viewer.test.tsx src/app/setlists/[id]/stage/stage-mode-client.tsx src/app/setlists/[id]/stage/stage-mode-client.test.tsx
npm run typecheck
```

Result: both passed with no warnings or type errors.

`npm run build` also passed. Next.js compiled successfully, completed TypeScript validation, and generated all 43 static-page steps.

Checkpoint: `45efd59 feat(stage): add Nashville notation and saved ink colors`

## Test specification

| # | Guarantee | Test | Type | Result |
|---|---|---|---|---|
| 1 | Song detail switches `C G Am F` to `1 5 6m 4` and back | `song-viewer.test.tsx` | Component integration | PASS |
| 2 | Stage Mode switches `G D Em C` to `1 5 6m 4` | `stage-mode-client.test.tsx` | Component integration | PASS |
| 3 | Red ink is applied and the canvas image is saved when a stroke ends | `stage-mode-client.test.tsx` | Component integration | PASS |
| 4 | Existing chord transposition and Nashville helpers remain valid | `chords.test.ts` | Unit | PASS |

## Coverage and known gaps

`npm run test:coverage:website` passed: 79 files and 360 tests. Coverage was 87.09% statements, 82.51% branches, 91.52% functions, and 90.18% lines.

Annotations are intentionally saved in browser storage per setlist slot and restored on the same device. Older song-keyed drawings still load as a compatibility fallback. Cross-device annotation synchronization is not included and would require an explicit database/storage design.
