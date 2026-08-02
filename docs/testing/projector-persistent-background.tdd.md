# Projector Persistent Background TDD Evidence

## Source

The user reported that changing lyric slides also made the selected projector
background turn black before reappearing with the next lyrics.

The background image/video was rendered inside `SlideRenderer`, which is keyed
by the lyric slide ID. Each lyric change therefore destroyed and recreated the
media element.

## User journey

As a worship operator, I can change lyric slides while the selected background
continues uninterrupted behind them.

## RED and GREEN

| Stage | Command | Result |
| --- | --- | --- |
| RED | `npm test -- "src/app/setlists/[id]/projector/projector-client.background.test.tsx"` | Failed because the background video after the lyric change was a different DOM element. |
| GREEN | Same targeted command after the fix | Passed; the exact background video element survived the slide change. |
| Background cases | Targeted projector background and integration tests | 2 files and 5 tests passed. |
| Coverage | `npm run test:coverage -- --coverage.include="src/app/setlists/**/projector/projector-background.tsx" "src/app/setlists/[id]/projector/projector-background.test.tsx"` | 100% statements, branches, functions, and lines. |
| Suite | `npm test` | 31 files and 127 tests passed. |
| Types | `npm run typecheck` | Passed. |
| Lint | Targeted projector files | Passed with no errors; existing projector warnings remain. |
| Windows package | `npm run dist` from `desktop/` | NSIS installer `Anointed Worship Setup 0.2.14.exe` built successfully. |
| Release scan | Scan `desktop/server` for `.env` files and configured secret values | No `.env` file and no configured private credential value found. |
| Packaged interaction | Final standalone projector received two real BroadcastChannel slide messages | HTTP 200, second lyric visible, same background video node retained, and no page exceptions. |

## Guarantees

| What is guaranteed | Test | Type | Result |
| --- | --- | --- | --- |
| A lyric-only slide change does not remount the background video. | `projector-client.background.test.tsx` | Component integration | PASS |
| Global image and video backgrounds render through the persistent output layer. | `projector-background.test.tsx` | Component unit | PASS |
| Slide-specific images replace global media correctly. | `projector-background.test.tsx` | Component unit | PASS |
| Slide colors and gradients are not mistaken for image URLs. | `projector-background.test.tsx` | Component unit | PASS |
| Clear removes lyrics while retaining the selected background; Black and Logo still cover it intentionally. | Projector render-path review | Integration review | PASS |

## Known gaps

The packaged interaction test validates DOM continuity in Chromium. Final
visual smoothness for a specific high-resolution video still depends on the
workstation GPU and should be confirmed on the church projector before service.
