# Website enhancements — 2026-10-06

The requested work prioritizes band rehearsal and service preparation, fixes observed workflow defects, and reduces unnecessary navigation work. The implementation reuses the existing song, setlist, authorization, messaging, and presentation modules.

## Feature overview

| Feature | Where to use it | What it does |
| --- | --- | --- |
| Setlist Practice Mode | Setlist details → Practice, beside Stage | Opens the selected setlist's songs in order, with previous/next controls, an accessible song picker, assigned keys, lead vocals, arrangements and band notes. |
| Rehearsal controls | Practice Mode → current song | Reuses chord and lyric views, transposition, instrument chord diagrams, reference tracks, metronome tempo/volume, tap tempo and adjustable auto-scroll. Meter selection now actually controls the metronome. Missing stored BPM has a clearly labeled practice default. Changing songs stops practice timers. |
| Practice progress | Practice Mode → Mark as practiced | Tracks which songs have been practiced during the open session. It does not record a shared team attendance or historical usage metric. |
| Rehearsal plan | Practice Mode → Open preparation tools | Sets rehearsal minutes and a focus for each song, such as intros, harmonies or transitions. The total is a planning allocation, not a calculated music duration. |
| Service preparation | Preparation tools → Band, Vocals, Service & production | Provides ten checks covering tuning, monitors/clicks, transitions, vocal warm-up/harmonies, microphone handoffs, assigned roles/attendance, lyrics, backing tracks and prayer/media/dance cues. |
| Team plan download | Preparation tools → Download rehearsal plan | Downloads a plain-text snapshot containing ordered songs, assigned keys, recorded BPM availability, leads, arrangements, planned minutes, focus and checklist state. Send the file through your existing team communication workflow. |
| Automatic usage charts | Team Management and Analytics → Member app usage | Loads tracked data when opening the panel; changing a valid UTC date range updates it automatically. Invalid ranges retain and explain the previous valid range. Unavailable states do not fabricate records. |
| Faster messaging | Messages → a loaded conversation | Opens an already loaded chat without another Messages server render. URL selection, browser history, draft/attachment cleanup, local messages and a stable realtime subscription are preserved. New conversations still obtain server data. |
| Navigation feedback | Main desktop and phone navigation | Shows a small pending indicator and an accessible loading announcement. Current-page links are identified. Existing loading and retry screens have clearer announcements. |

Progress, rehearsal allocations, focus and preparation checks last while the page is open. They reset on refresh or a different setlist; download the plan to retain a snapshot. These controls do not change saved setlist keys or write shared team completion records.

## Observed defects fixed

- Loaded-chat selection previously repeated authentication, channel/history queries, receipts and attachment signing. Native Next-integrated history removes that redundant server render.
- A stable team/profile-scoped realtime subscription now survives chat switches; events are deduplicated and callbacks from a departed identity are ignored. Attachment lookup failure retains the received message and explains the missing attachment.
- Optional unread badges no longer delay page content or remount the mobile menu. Independent member/request and receipt/file reads run together, and loaded attachment paths are signed in one batch.
- Stage Mode now opens the exact demo setlist instead of returning Not Found. Connected lookup errors show a generic retry error; team and ID filters remain enforced.
- The Time Sig selector previously displayed 4/4 and changed no playback behavior. Its local selected meter now drives the metronome; ambiguous or unnamed practice controls have accessible names.
- Video references now use shared URL validation. Executable schemes, credential-bearing links and impersonated YouTube hosts are excluded. Supported watch/share/shorts/live/embed links work; song links use a canonical HTTPS YouTube destination.
- Regular workspace pages no longer request fourteen presentation font families. Presenter/projector layouts retain the original stylesheet. Reference embeds load lazily and have titles.

## Performance evidence

A local production phone test inserted an 800 ms delay into redundant conversation server requests. Before the fix, opening a loaded chat took 1,253 ms and made one server render. After the fix, it took 451 ms and made zero such renders; the desktop check took 444 ms with zero renders. This is controlled regression evidence, not a measurement or guarantee of deployed network latency.

The initial Messages page still loads the existing history window. Cursor pagination and bounded inbox summaries are possible later improvements; this change does not silently discard older loaded messages. Authentication and proxy rate limiting remain active, and private data is not cached globally.

## Security and operational boundaries

Compatible updates target Next.js and its ESLint configuration 16.3.8, Vitest/coverage 4.1.11, Sharp 0.35.5 and patched transitive dependencies. A clean install verifies actual installed versions. The production dependency audit reports no vulnerabilities. Five high development-only audit records remain in the unpatched braces dependency chain; a forced downgrade to incompatible Next.js 14 tooling was not applied.

The Next.js update addresses the verified [Windows hosting advisory](https://github.com/advisories/GHSA-p293-qw3h-jr36) and incorporates the fixes in the [16.3.8 release](https://github.com/vercel/next.js/releases/tag/v16.3.8). Full audit is therefore not represented as completely clean.

No new schema, credentials, private-data cache, offline behavior or desktop packaging change is required for these website features. The user reports success applying the earlier member-usage SQL in the confirmed Supabase project. Independent live database verification and migration-history reconciliation remain pending because the connected account lacks access. No live authenticated speed or data-collection evidence is claimed.

## Verification

Independent Juan and Laura reviews accepted the scoped practice, stage, preparation, navigation, messaging and compatible dependency updates after the findings were resolved. Final acceptance and remaining operational limits are recorded in [tickets.md](../tickets.md).

The final integrated suite passed 80 files / 371 tests. Coverage thresholds passed with 87.08% statements, 82.75% branches, 92.4% functions and 90.2% lines on the repository's configured deterministic website surface. Strict website lint, TypeScript checks and the optimized Next.js 16.3.8 production build passed.

The production desktop/phone suite passed 63 cases with three viewport-specific skips. Two send-status tests initially matched the new navigation live regions; an independently reviewed locator correction scopes the same result assertion to its conversation. Both affected cases then passed in a fresh run, giving 65 passing browser cases across the suite. The unchanged passing cases include both 40-route smoke journeys, real phone dragging, Back/Forward, Practice Mode, meter/timer reset, downloaded plan contents, preparation reset, 320-pixel reflow, font requests, CSP, cache isolation and focus handling. No application change was made to satisfy the locator correction.

The final secret scan reported no findings in 1,921 history blobs, 327 commit messages and 473 working files; three oversized historical blobs were skipped. The production dependency audit reports zero vulnerabilities. The full development dependency audit retains the five high findings described above and is not claimed clean. These checks used a local demo production build; authenticated live database collection and deployment behavior remain outside this evidence.
