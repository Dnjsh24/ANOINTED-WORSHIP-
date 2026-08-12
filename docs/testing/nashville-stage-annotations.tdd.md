# Nashville notation and Stage annotations TDD evidence

## Source and user journeys

No external plan file was used. The journeys were derived from the request:

1. A musician can switch a song chart between chord names and Nashville numbers.
2. A musician can use the same notation switch in Stage Mode, based on the displayed song key.
3. A musician can select an annotation color in Stage Mode and have the completed drawing restored for that setlist song on the same device.
4. A guitarist can choose Open or capo fret 1–11 in Stage Mode while the selected concert key remains unchanged and the displayed chord shapes move down by the selected fret.

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

### Manual capo fret selection

RED command:

```text
npm exec vitest run -- src/app/setlists/[id]/stage/stage-mode-client.test.tsx
```

Result: 1 intended failure and 2 existing passes. The failure reported that the accessible `Capo fret` selector did not exist.

RED checkpoint: `5862633 test(stage): require manual capo fret selection`

GREEN command:

```text
npm exec vitest run -- src/lib/domain/chords.test.ts src/components/song-viewer.test.tsx src/app/setlists/[id]/stage/stage-mode-client.test.tsx
```

Result: 3 test files passed, 13 tests passed. Key G with capo 2 displayed `F C Dm Bb`, retained G as the concert key, and exposed Open through Capo 11.

GREEN checkpoint: `132e413 feat(stage): allow manual capo fret selection`

## Test specification

| # | Guarantee | Test | Type | Result |
|---|---|---|---|---|
| 1 | Song detail switches `C G Am F` to `1 5 6m 4` and back | `song-viewer.test.tsx` | Component integration | PASS |
| 2 | Stage Mode switches `G D Em C` to `1 5 6m 4` | `stage-mode-client.test.tsx` | Component integration | PASS |
| 3 | Red ink is applied and the canvas image is saved when a stroke ends | `stage-mode-client.test.tsx` | Component integration | PASS |
| 4 | Existing chord transposition and Nashville helpers remain valid | `chords.test.ts` | Unit | PASS |
| 5 | Guitar Mode offers Open and capo fret 1–11 while preserving the concert key | `stage-mode-client.test.tsx` | Component integration | PASS |
| 6 | F chord shapes use conventional `Bb` spelling instead of `A#` | `chords.test.ts` | Unit | PASS |

## Coverage and known gaps

`npm run test:coverage:website` passed after the capo work: 79 files and 362 tests. Coverage was 87.12% statements, 82.55% branches, 91.52% functions, and 90.20% lines.

Annotations are intentionally saved in browser storage per setlist slot and restored on the same device. Older song-keyed drawings still load as a compatibility fallback. Cross-device annotation synchronization is not included and would require an explicit database/storage design.
