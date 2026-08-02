# Media embeds and song-section keys — TDD evidence

Date: 2026-08-02

## User journeys

- As a worship-team member, I can open Spotify and YouTube players inside a song page without the website's security policy blocking them.
- As a keyboard or touch user, I can reveal a Spotify search-result player using a real, labeled control.
- As a song viewer, I can render repeated Chorus, Bridge, and Instrumental sections without React duplicate-key warnings.
- If a provider refuses a particular embed, I can open the original track or video directly.

## RED evidence

Command:

`npm run test:website -- src/lib/supabase/proxy-security.test.ts src/components/song-viewer.test.tsx src/components/spotify-search.test.tsx`

Result: **FAIL**, 3 failed / 3 passed. The failures proved that `frame-src` was absent, React reported duplicate `Chorus` and `Bridge` keys, and Spotify preview had no accessible button.

Command:

`npm run test:website -- src/components/song-viewer.test.tsx`

Result: **FAIL**, 2 failed / 1 passed. The saved Spotify player was unlabeled and an untrusted `javascript:` URL reached an iframe.

## GREEN evidence

| Guarantee | Test | Type | Result |
|---|---|---|---|
| CSP allows only the approved Spotify and YouTube frame origins | `src/lib/supabase/proxy-security.test.ts` | Unit | PASS |
| Repeated arrangement labels do not create duplicate React keys | `src/components/song-viewer.test.tsx` | Component | PASS |
| Saved players are labeled and retain direct provider links | `src/components/song-viewer.test.tsx` | Component | PASS |
| Untrusted Spotify URLs are not embedded | `src/components/song-viewer.test.tsx` | Component/security | PASS |
| Spotify search preview is a keyboard-accessible button | `src/components/spotify-search.test.tsx` | Component/accessibility | PASS |
| Both approved frame requests pass the browser CSP | `e2e/security-accessibility.spec.ts` | Playwright E2E | PASS on desktop and mobile |

Targeted GREEN command: `npm run test:website -- src/components/song-viewer.test.tsx src/components/spotify-search.test.tsx src/lib/supabase/proxy-security.test.ts`

Result: **PASS**, 3 files / 8 tests.

## Verification

- Production build: PASS (`npm run build`)
- Typecheck: PASS (`npm run typecheck`)
- Website lint: PASS with zero warnings (`npm run lint:website`)
- Website coverage: PASS, 51 files / 260 tests; 84.84% statements, 81.32% branches, 89.47% functions, 87.85% lines
- Playwright: PASS, 41 passed / 3 intentional skips across desktop Chromium and Pixel 7 mobile
- Secret scan: PASS, 0 findings across 1,254 history blobs and 416 working files
- Dependency audit: PASS, 0 production or development vulnerabilities
- Live local health: PASS at `http://127.0.0.1:3100/api/health`; Supabase reachable
- Direct provider reachability: Spotify embed HTTP 200; YouTube embed HTTP 200

## Known gaps and merge evidence

The Browser QA connector could not attach because its Chrome extension is not installed. The repository's Playwright runner supplied the browser evidence instead. Provider-specific restrictions can still prevent an individual track or video from playing; direct Spotify and YouTube links now preserve that user journey.

No TDD checkpoint commits were created because the task began on `main` with an extensive pre-existing dirty working tree, including overlapping files. Committing would have mixed unrelated user work. RED and GREEN commands and outcomes are preserved above for later review or squash-merge evidence.
