# Website fixes — 2026-10-05

Baseline: `96615d3e0d1e1cdff28feb4c34a1fb286d8c79d9`. Coordinator owns status updates. Remote deployment and database migration application require approval. No project brief exists. Rob completed planning; Juan is reviewing usage architecture. Website scope excludes desktop application files.

| ID | Task | Accountable owner | Status | Risk / lane | Dependencies |
| --- | --- | --- | --- | --- | --- |
| T01 | Phone song dragging in new/edit setlists | Coordinator (frontend) | Done | Medium / standard | None |
| T02 | Remove Quick Access icon backgrounds | Coordinator (frontend) | Done | Low / standard | None |
| T03 | Member last seen and persistent usage analytics | Josh | Done | High / gold | Independent Juan/Laura reviews and scoped checks passed |
| T04 | Messages opens a chat list, then chosen conversation | Coordinator (frontend) | Done | Medium / standard | Final independent QA and production browser checks passed |
| T05 | Audit routes and fix incorrect back navigation | Coordinator (frontend) | Done | High / gold | Final independent Juan/Laura and production browser checks passed |
| T06 | Keep held song preview aligned with the finger on phone | Coordinator (frontend) | Done | Medium / standard | Reproduced offset; independent Laura QA and six production browser checks passed |
| T07 | Add usage charts below Team Management | Coordinator (frontend) | Done | Medium / standard | Independent QA passed; exact minutes and nonempty responsive chart checks passed |
| T08 | Apply member usage migration to the live Supabase project | Coordinator (database deployment) | Testing | High / existing gold-reviewed migration | User reports SQL Editor success; live verification and migration history remain pending |
| T09 | Show usage automatically and update on date changes | Coordinator (frontend) | Done | Medium / standard | Independent QA and scoped checks passed |
| T10 | Speed up page and conversation navigation | Coordinator / Josh | Done | Medium / standard | Trace server waterfalls; preserve history, realtime state and authorization |
| T11 | Add setlist Practice Mode beside Stage | Maya | Done | Medium / standard | Reuse SongViewer rehearsal tools, scoped loading and accessible song navigation |
| T12 | Improve overall website loading and interaction feedback | Coordinator | Done | Medium / standard | Audit existing navigation/loading/error states; implement evidence-based improvements |
| T13 | Audit core website workflows and fix reproducible defects | Coordinator | Done | Medium / standard | Full website checks and independent review |
| T14 | Band rehearsal plan and service preparation tools | Coordinator | Done | Medium / standard | Session checklist, song focus/time allocation and download; scoped QA |
| T15 | Apply compatible security updates for audited dependencies | Coordinator | Done | High / gold | Critical Next advisory, compatible patched versions, independent Juan/Laura and full validation |

## Website enhancement plan — 2026-10-06

1. Finish automatic usage/date filtering and retain honest unavailable states (T09).
2. Measure slow chat navigation. Open already loaded conversations without another full server render, retain browser history and realtime data, and reduce independent query waterfalls where safe (T10).
3. Add Practice beside Stage with the ordered songs, assigned-key transposition, lyrics/chords, metronome and tap tempo, auto-scroll, reference tracks, arrangement notes and session rehearsal progress. Reuse existing SongViewer controls without adding dependencies (T11).
4. Audit navigation feedback, loading boundaries and recoverable errors across the primary pages. Implement small shared improvements that address observed gaps; preserve existing design, accessibility and permissions (T12).
5. Independently review each candidate, run affected unit tests and phone/desktop production browser checks, plus lint, typecheck and build. Record limits and the final before/after behavior. Push reviewed changes under the user's existing authorization after secret scanning.

Current scope: 14/15 completed. T08 remains Testing on user-reported SQL success pending independent live verification and migration-history reconciliation. Website features and compatible security updates are validated locally; no remote deployment, credential or desktop changes were performed.

Completed: 14/15. T01–T07 and T09–T15 are Done after their applicable checks and independent reviews. T08 requires access to the confirmed Supabase project for live verification. Five high development-tool advisories remain an explicit upstream limitation; production dependency audit is zero. The latest feature overview and verification packet is docs/WEBSITE-ENHANCEMENTS-2026-10-06.md.

## T09 acceptance

- Usage loads on opening the panel; no Load usage button or submission is needed.
- Valid From/Through date changes automatically request the selected UTC range.
- Invalid/empty/reversed/overlong ranges never query; the previous valid range is explained.
- Successful empty results show charts with zero recorded activity and a clear empty message. Unavailable/demo/error states never invent data; errors retain a Retry action.
- Stale responses cannot replace the latest date selection. Existing permissions and member filtering remain intact.
- Independent Laura review, focused unit/lint/typecheck/build and affected phone/desktop browser checks pass before closure.

## T08 authorized deployment checkpoint — 2026-10-06

The user authorized applying the existing member-usage migration and confirmed target project `xvrndwkghxkqsvxxtqym` at https://supabase.com/dashboard/project/xvrndwkghxkqsvxxtqym. Apply only `supabase/migrations/20261005010000_member_usage_tracking.sql` after reading target migration history and verifying prerequisites (`public.team_members`, `public.team_role`, and `private.has_team_role`). Check live table constraints, RLS, denied writes, RPC permissions, and migration recording afterward. Do not apply unrelated pending migrations or rewrite existing data.

The connected Supabase MCP account lists only project `key` (`rulhhrtnhhoxxizobqzg`), which has no worship-app tables. Supabase CLI credentials list Portfolio and REDCROSS BLOODBANK LARAVEL, neither the confirmed target. Both read-only target checks (migration history and schema prerequisites) returned “You do not have permission to perform this action.” No target mutation was attempted. Next ready task: reconnect the Supabase app with an account authorized for the confirmed target, then repeat the read-only checks and apply the already-authorized migration.

Validation: migration-discipline and RLS-boundary skills loaded; SQL reviewed as additive. `node scripts/test-member-usage-postgres.mjs "$env:TEMP/anointed-usage-postgres/node_modules/@electric-sql/pglite/dist/index.js"` passed real PostgreSQL accounting, UTC, minute deduplication, gap/session logic, anonymous/ordinary/inactive/two-tenant read denials, direct write denials, foreign keys and cascades. Live Supabase compatibility and post-migration checks remain pending because credentials do not grant project access. No keys or passwords were recorded.

User-reported execution: the coordinator provided the exact reviewed migration wrapped in BEGIN/COMMIT for manual SQL Editor execution. The user reported “success no error.” This is user-provided evidence of successful application, not an independently inspected live schema. Next: reload the deployed authenticated app (the tracker stops after a missing-RPC response until remounted), interact, then inspect Team Management as owner/admin and check live metadata/recorded counts. SQL Editor execution does not automatically reconcile CLI migration history; do not rerun the original migration blindly. Status is Testing until the remaining checks are recorded.

## T07 acceptance

- The manager-only usage panel below Team Management shows daily approximate active hours and a comparison by member.
- Reuse the existing date range and tracked rows; choosing a member filters the daily chart without another network request.
- Missing dates in a successfully loaded range have zero recorded minutes; unavailable, demo and empty states never invent usage.
- Date labels are UTC, exact values have an accessible data table, and controls work with keyboard and on phone layouts.
- Reuse existing authorization/data loading and dependencies. No schema, credential, cache, offline or environment changes.
- Independent Laura review and scoped unit, lint, typecheck, build and browser checks must pass before closure.

T07 independent Laura review accepted with one finding: rounded hours alone did not provide exact recorded values in the daily table. Coordinator added a recorded-minutes column and one-minute regression test. Laura independently passed aggregation, gaps, member filtering, ranking, and single-day/zero scale review; three focused files/eleven tests, strict affected-file lint and diff checks passed. Existing owner/admin checks and loaded-row filtering remain intact. The earlier coordinator three-file/nine-test suite, typecheck and demo build passed. Final focused rerun and nonempty native chart browser fixtures at 320/393/1280 pixels are pending. No new application dependencies or data boundaries were introduced.

T07 final settlement: Laura independently closed the exact-minute finding, passed chart four tests, inspected the 320-pixel screenshot and accepted the 320/393/1280 fixture evidence. Coordinator final `npx vitest run --config vitest.website.config.ts src/components/member-usage-charts.test.tsx src/components/member-usage-analytics.test.tsx src/components/members-client.usage.test.tsx` passed three files/ten tests; strict lint on the chart/analytics source and tests, `npm run typecheck`, final optimized forced-demo `npm run build`, and `git diff --check` passed. Production Playwright `e2e/requested-fixes.spec.ts --project=mobile --project=chromium --grep 'team usage shows honest' --reporter=line` passed two tests for unavailable states and date validation on `/members` and `/analytics`. The chart also appears on Analytics because both pages already share the usage panel. Nonempty browser fixtures used the actual component and production CSS with a local stub loader; checks passed filtered totals, keyboard-opened data details, long names, and no page overflow at all three widths. The temporary fixture compiler was installed only in OS temp; app dependencies and lockfile were unchanged. No live authenticated chart evidence is claimed. Native SVG/CSS charts need existing deployed usage data; no migration was applied. Secret scan had no findings (three oversized historical blobs excluded). Applicable implementation, hydration, accessibility and verification gates passed; data/schema/RLS and parallel implementation gates are N/A because those boundaries did not change. Existing dependency advisories remain a release limitation. No scoped blockers remain; ticket is Done.

## T06 acceptance

- On new and edit forms, holding a phone drag handle displays the preview at the source row within three pixels.
- Dragging and page auto-scroll preserve the preview's offset from the finger.
- Dropping adds once and retains prior selections; cancellation clears the preview.
- Mouse and keyboard selection, SSR, and hydration remain supported.
- Independent Laura review and scoped validation pass before closure.

T06 baseline reproduction: production CDP touch tests failed on both forms. Preview vertical displacement was 416.3 pixels on new and 573 pixels on edit. The preview was mounted inside the page's containing contexts; fixed positioning did not stay relative to the viewport. Coordinator moved the existing DragOverlay into a React portal on document.body, retaining sensors, collision logic, no drop animation, and SSR-safe browser guarding. Required Caveman, Ponytail full, engineering-gates and completion-mandate guidance loaded; installed Next.js client/server guide read. Independent Laura review queued; optimized demo build and affected browser checks pending. No schema, authorization, storage, environment, or offline changes.

T06 final evidence: Laura independently passed the current candidate (`b6e25ac` plus the scoped changes), SetlistForm two unit tests, focused strict ESLint, and diff whitespace checks. She confirmed global `main` animation retains `transform: translateY(0)`, changing the fixed-position containing block, and that body portaling resolves it. The initial empty overlay renders no DOM, so the browser guard preserves SSR/hydration. All required QA skills were available and loaded. Coordinator ran `npm run typecheck`, `npx eslint src/components/setlist-form.tsx e2e/requested-fixes.spec.ts --max-warnings 0`, `npx vitest run --config vitest.website.config.ts src/components/setlist-form.test.tsx` (two tests), and optimized `npm run build` with `E2E_FORCE_DEMO=1 NEXT_PUBLIC_E2E_FORCE_DEMO=1`: all passed. Production command `E2E_FORCE_DEMO=1 E2E_PRODUCTION_BUILD=1 npx playwright test e2e/requested-fixes.spec.ts --project=mobile --project=chromium --grep 'touch and mouse dragging|song selection supports cancellation' --reporter=line` passed six tests. The same previously failing new/edit checks now assert source alignment within three pixels, finger offset after auto-scroll, preview cleanup, duplicate prevention and retained selections; desktop mouse and cancellation/keyboard Add also pass. Secret scan returned no findings, with three historical oversized blobs excluded; changed files were scanned. `npm audit --json` still reports the unchanged sixteen baseline dependency advisories (four moderate, eleven high, one critical). Relevant gates 01–12, 14–22 and 30–37 passed for this scoped UI correction except the baseline dependency release gate remains failed. Gate 13 is N/A: single implementer and read-only reviewer. Data/schema/RLS gates 23–29 are N/A: no data boundary change. No tests against a live authenticated deployment are claimed; rebuild without demo mode before deployment. Standard lane independent QA passed; no scoped blocker remains.

## T01 acceptance

- Actual touch drag adds library songs on new and edit screens; mouse drag remains supported.
- Library scrolling remains usable; keyboard-accessible Add fallback works.
- Duplicates are prevented; existing edit selections and submitted song IDs remain intact.
- Cancellation clears the drag overlay.

## T02 acceptance

- Small Quick Access icons have no purple background, including hover.
- Preserve card layout, icon color, labels, focus and link targets; inspect phone and desktop.

## T03 acceptance

- Durable last activity shows Online, elapsed minutes/days, or an honest no-data state.
- Managers can compare tracked hours, frequency and dates in a selected date range.
- Define time as active foreground usage, record timezone, and do not invent historical data.
- Hidden/idle/offline time earns no credit; overlapping tabs/devices do not double-count.
- Authenticated server derives identity, validates membership, bounds intervals and protects team data with RLS.
- Missing schema/configuration shows unavailable status.
- Prepare append-only local migration and deployment instructions; independently review final candidate with Juan and Laura.

## T04 acceptance

- `/messages` opens the chat list without selecting or reading any conversation.
- Choosing a channel or direct chat opens it; phone control and browser Back return to the list.
- Explicit channel URLs work; invalid/inaccessible/deleted channels do not select an unrelated chat.
- Refresh and realtime updates preserve the explicit selection; empty states remain usable.

## T05 acceptance

- Audit reachable website navigation, back/cancel controls, action/auth/legacy redirects, and query state.
- A to B then browser Back returns to A; direct entry has a safe fallback.
- Specific Back-to-parent labels keep their stated destination; generic back returns to safe internal history.
- Preserve authorization and prevent external return URLs.
- Record a route matrix, representative desktop/mobile journeys, and evidence gaps.
- Independent Juan and Laura review the final candidate.

## Evidence

Planning: Rob inspected clean baseline, `setlist-form.tsx`, `messages-client.tsx`, existing presence and activity logs. No duration history exists. Required skills loaded: caveman, engineering-gates, completion-mandate. Installed Next.js navigation guide read. Dnd-kit touch/handle guidance verified through Context7.

Juan architecture assignment accepted: server UTC minute deduplication with member-row locking, bounded foreground heartbeats, five-minute session gap, no backfill, auth-derived membership and manager-only reads. Approximate active minutes must be labeled. No architecture tests were claimed. Existing member UI incorrectly treats active membership as online when presence is empty; T03 will fix this.

Frontend checkpoint: touch/mouse/keyboard sensors and handle plus Add fallback implemented; Messages now chooses channels explicitly by URL; hardcoded demo setlist link removed; QR hash cleanup preserves Next.js history state. `npx vitest run --config vitest.website.config.ts src/components/setlist-form.test.tsx src/components/messages-client.test.tsx src/app/worship-remote/worship-remote-client.test.tsx`: 3 files, 9 tests passed. Focused frontend ESLint passed. Browser validation and final reviews remain.

Implementation and validation evidence will be added here at each settlement.

Laura frontend review assignment accepted with a finding: inbox action failures were hidden inside the conversation panel. Feedback now renders in the inbox; regression checks pending. Keyed channel views clear private drafts/attachments on navigation. Laura requested normal-height phone drag and cancellation/scroll evidence; tests are being strengthened. Initial browser run passed inbox/history on both viewport projects and desktop new-setlist drag; test harness issues (streaming wait and already-selected demo songs) prevent drawing other conclusions. Two existing edit-page `any` warnings will be removed on the touched surface.

T02 completed: independent Laura styling review and computed transparent-background checks passed for desktop and phone, including hover; targets/layout preserved. Website strict lint passed.

Latest phone browser suite: `E2E_FORCE_DEMO=1 npx playwright test e2e/requested-fixes.spec.ts --project=mobile --reporter=line` — 5/5 passed at normal Pixel 7 height, including real CDP touch drag with page auto-scroll on new and edit screens, inbox history and 12 Back/Forward journeys. Pointer collision detection resolves touch drop alignment after scroll. Responsive setlist song actions fix horizontal overflow blocking phone links. Latest focused unit suite: 3 files / 12 tests passed, including inbox errors, draft reset and attachment preview cleanup. Full website coverage first run: 304 passed / 1 failed due an existing CRLF-sensitive source assertion; assertion now normalizes line endings, rerun pending.

Josh implementation assignment accepted: isolated candidate `b8f9ccd43d8499f06558bcdccf08a695c1a2fd00`, 17 focused tests, strict focused lint/typecheck and isolated PostgreSQL accounting/security harness passed. Integrated for independent review. Evidence: [T03-USAGE-EVIDENCE.md](docs/T03-USAGE-EVIDENCE.md), deployment: [MEMBER-USAGE-TRACKING.md](docs/MEMBER-USAGE-TRACKING.md). Docker/native Supabase and concurrent-connection verification unavailable; no remote schema change performed. Baseline dependency audit reports 16 advisories, including Next.js critical; dependencies were not changed and this is not a passed security gate.

Laura final frontend assignment accepted: T01/T02/T04 pass, no remaining scoped defects; independent 3-file/12-test suite and strict affected-file ESLint passed. Normal-height phone five-test browser evidence accepted. Cancellation/library scroll reviewed in code; authenticated realtime remains unexercised. Integrated build and T03/T05 gold reviews remain pending.

Laura gold QA assignment accepted for integrated candidate `830c37a` plus reviewed frontend changes: T03/T05 scoped pass, no blocking introduced defects. Independent usage 5-file/17-test suite and real PostgreSQL harness passed; post-login/remote/messages 3-file/14-test suite passed; diff whitespace check passed. Route matrix: [WEBSITE-ROUTE-AUDIT-2026-10-05.md](docs/WEBSITE-ROUTE-AUDIT-2026-10-05.md). Native Supabase and true concurrent connections remain unverified; baseline audit is a release limitation. Build/browser final checks and Juan review remain pending.

Integrated checks passed: `npm run typecheck`; `npm run lint:website`; `npm run security:secrets` (no findings); forced-demo optimized `npm run build` (webpack, Next 16.2.12); `npm run test:coverage:website -- --maxWorkers=2` (67 files / 322 tests, statements 85.21%, branches 81.81%, functions 89.87%, lines 88.23%, configured thresholds passed). Coverage percentages cover the existing configured deterministic website surface; new usage behavior also has 17 passing focused tests. T01/T04 completed locally after independent QA and integrated checks. Final production-mode browser run is queued for T03/T05 evidence.

Juan final review assignment accepted: T03 passes with no implementation blocker; membership row locking serializes concurrent calls by construction, while native multi-connection verification remains an explicit operator follow-up. Laura independently passed the same integrated usage candidate. Production desktop/phone usage browser checks also passed, so T03 is Done locally; live migration remains unapplied. T05/T04 reopened for one finding: pushing the inbox from Back to chats allows browser Back to reopen the closed chat. Replace the current conversation entry when returning to the inbox, and test the following browser Back step.

Laura resolve-only review accepted: closing a chat now replaces the current history entry with the inbox; chat selection still pushes its encoded URL. Independent Messages 6/6 tests and whitespace check passed. Prior gold review stands. Production 28-test run had 27 passes (including both route smoke and all security/accessibility checks), with one test timing issue: keyboard Add immediately after touch cancellation was inside dnd-kit's short click suppression period. Test now waits 100 ms before the next action; implementation unchanged. Final rebuild and affected browser rerun pending.

Juan resolve-only review accepted: chat history replacement and regression assertions pass, no blocker. Juan ran no tests; independent Laura tests and coordinator evidence are recorded separately. Final optimized rebuild and typecheck passed after the history change. Remaining work is the affected production browser rerun.

Final affected production browser run: `E2E_FORCE_DEMO=1 E2E_PRODUCTION_BUILD=1 npx playwright test e2e/requested-fixes.spec.ts e2e/app.spec.ts --project=chromium --project=mobile --grep 'messages opens chats|song selection supports cancellation|messages controls switch channel' --reporter=line` — 6/6 passed. This verifies the final Back-to-chats correction, touch/keyboard cancellation and Add fallback, plus existing attachment/search/emoji/send flows in both viewport projects. All failing cases from the preceding 28-test suite now pass; its unchanged 27 passing cases include both 39-route smoke journeys, usage UI, pointer drag, route Back/Forward, CSP, cache isolation, focus and 320-pixel reflow checks. T04/T05 completed after independent reviews and these final checks.

Final packet: [WEBSITE-FIXES-2026-10-05.md](docs/WEBSITE-FIXES-2026-10-05.md). Database deployment instructions: [MEMBER-USAGE-TRACKING.md](docs/MEMBER-USAGE-TRACKING.md). The usage migration has not been applied remotely; live collection and historical last-seen data therefore are not claimed. Team: Rob (`gpt-6.1-sol high`) planning complete; Josh (`gpt-6.1-sol high`) implementation complete; Juan (`gpt-6-luna max`) review complete; Laura (`gpt-6.1-sol high`) review complete. Settings are verified from role metadata, not separate Orca terminal settings.

T09 settlement: independent Laura review found no blockers; strengthened stale-response test with awaited act and added retry-to-success coverage. Coordinator final focused suite passed three files/12 tests; strict lint, typecheck and optimized demo build passed. Production phone/desktop automatic usage and invalid-date checks passed two tests. Permissions, unavailable states and date bounds remain intact. No schema/dependency changes. Existing dependency audit and T08 live verification limits remain.

T10 Juan investigation accepted: known chat selection triggers redundant dynamic server render; all-history queries and attachment signing increase that cost. Native Next-integrated history for loaded channels, scoped persistent client channel state, parallel membership/pending-request reads and independent message metadata reads are approved approaches. AppShell unread count is a blocking optional RPC; isolate under Suspense with the same server authorization. Existing loading boundaries already cover primary routes. No tests or speed measurements were claimed by Juan. Coordinator controlled-delay baseline reproduced one server render and 1,253 ms chat opening with 800 ms injected server latency. Full cursor pagination is a separate larger change; this enhancement preserves current loaded history.

## T10 acceptance

- Loaded chat selection updates the explicit URL immediately without Messages RSC fetch; Back/Forward and Back to chats retain prior semantics.
- Drafts/attachments clear when switching; loaded realtime/local channel data survives switches and resets across user/team scope. New chats still obtain server data.
- Independent membership/request and receipt/file reads run in parallel; attachment signing is batched without broader access. Optional unread badge does not delay page content.
- Existing auth checks, storage policies and loaded history are preserved; no global private-data cache or schema changes.
- Independent QA and affected tests/build/browser checks pass; controlled latency evidence is labeled separately from real deployment speed.

## T11 acceptance

- Practice button sits beside Stage and opens a team-scoped route for the selected setlist.
- Ordered song selection and previous/next controls work on phone and keyboard; assigned keys, arrangements and lead notes are visible.
- Reuse chord/lyric display, transposition, chord diagrams, tempo/volume/tap controls, auto-scroll and existing reference tracks. Stop timers/audio on song change or exit.
- Practice progress is clearly session-only, empty sets are usable, and unknown/other-team IDs never show another setlist.
- Independent review plus meaningful unit, authorization, production phone/desktop and build checks pass.

## T12 acceptance

- Main phone/desktop links show pending feedback without layout shift and expose the current page.
- Existing loading fallbacks announce their state; recovery errors announce failure and keep retry/dashboard actions.
- Reuse Next navigation status and existing route skeletons; add no unnecessary dependencies, duplicate skeletons or auth caches.
- Accessibility, routing regressions and independent review pass.

T10 Josh completion accepted for review: isolated candidate 2e40e9d integrated; six owned files, four focused files/10 tests, strict lint, typecheck and diff check passed. Request-local unread promise suspends badges only, keeping page and mobile menu mounted. Receipt/file and member/request queries overlap; storage signing batches paths while preserving unavailable files and full loaded history. Coordinator added desktop pending feedback. Independent QA/build/browser remain. Baseline dependency advisories unchanged.

Scope update: user requested broader bug fixing and helpful worship-team features, prioritizing band rehearsal and service preparation. T13 covers reproducible core-workflow defects, not an unverifiable claim of a bug-free app. T14 adds an editable session rehearsal plan with per-song focus/minutes, band/vocal/production readiness checklists and a downloadable text plan. It does not represent shared persisted team completion or usage statistics. New remote schema work is excluded.

Laura T10/T12 review accepted with blocker: keyed MessagesView reconnects INSERT subscription while native navigation no longer refetches, risking missing messages. Coordinator moved global subscription to stable team/profile session, kept per-conversation presence/draft cleanup, deduplicates received messages and ignores late callbacks after identity cleanup. New mocked realtime tests cover inbox/channel switches, duplicate events, identity reset/unsubscribe and attachment lookup rejection while retaining the message; two files/10 tests pass. Stray question marks in loading announcements corrected. Resolve-only review queued. T12 also scopes the existing 14-family presentation stylesheet to presenter/projector layouts, preserving default workspace system font and font choices. New production request test queued.

T11 Maya completion accepted for review: candidate 1588130 integrated. Practice route scopes to active team, preserves order/assigned keys/notes, skips missing song joins and rejects unknown demo IDs. Session navigation/progress reuses SongViewer; metronome respects meter and offers clearly labeled practice tempo for missing BPM. Named audio/autoscroll controls, lazy YouTube and timer cleanup added. Three files/12 tests, strict scoped lint/typecheck/diff passed. Coordinator connected service-preparation tools and added lazy, titled reference embeds on detail page. Independent review and combined production checks pending.

T13 reproduced defect: Stage route returned NOT_FOUND for every demo setlist, despite its visible Stage link. Added exact-ID demo mapping using existing lyric serialization and assigned order/key; unknown IDs still 404. Live errors propagate a generic retry error while team-scoped loading stays intact. Baseline regression failed as expected; final two Stage route tests and strict lint pass. Unit audit prior to final integration passed 69 files/331 tests.

Laura resolve-only review accepted: stable realtime subscription and late-event cleanup close T10 blocker. Independent four-file/14-test run, strict 14-file lint/diff passed. T12 font scoping retains exact stylesheet and installed React supports SSR resource precedence; production request evidence pending. T14 standalone checks passed; coordinator keyed ServicePreparation by setlist ID and PracticeModeClient is also route-keyed. Final integrated rehearsal download/reset tests pending.

Laura T11/T13/T14 review accepted with findings: inherited Time Sig control was disconnected and displayed 4/4 for other meters; scroll/instrument/key/transpose controls lacked names. Coordinator wired a normalized session meter to header and metronome, added control labels and regression assertions. Stage connected errors, ID/team filtering and no-data 404 now have a third test. Focused three files/11 tests and lint pass. Resolve-only review pending. Integrated production Playwright eight tests passed on desktop/phone: practice selection/progress/audio reset, downloadable plan content, checklist reset across setlists, 320-pixel reflow, history, fonts and no Messages RSC. Controlled phone chat opening dropped from 1,253 ms/one redundant render to 451 ms/zero renders; desktop 444 ms. These timings use an injected 800 ms server delay and are local test evidence, not deployed latency guarantees. Final rebuild and broader route checks pending after meter fixes.

T15 added under the broad bug-fix request: npm audit reported 16 advisories, including critical Next.js remote-code-execution advisories. Verified the official Windows hosting advisory GHSA-p293-qw3h-jr36 (patched in 16.3.3) and current registry release 16.3.8. Apply compatible Next.js 16 updates, matching ESLint configuration, the patched Sharp override and non-major audit fixes. Avoid forced downgrades and a Vitest 5 major upgrade. Read the installed Next.js guides and repeat lint, type checks, coverage, production build and browser checks. Document remaining development-tool advisories. Remote deployment and desktop packaging are outside this change.
Laura final resolve-only review accepted: all T11/T13 findings closed. Independent three-file/11-test suite, strict source/test lint and diff check passed. Meter/header state, accessible labels and connected Stage scope/error/absence behavior were verified. Prior T10/T12/T14 review stands; broader browser and build acceptance remains with the coordinator.

Juan final T11/T13/T14 review accepted: no blocking introduced defect. Independently ran six files/19 tests and strict lint on 11 files. Route authorization, order, keys, notes, cleanup and preparation export were verified. The optional six-beat regression suggestion was added and passed. Laura independently closed meter and accessibility findings. Final integrated checks remain with the coordinator.
T15 intermediate checkpoint: compatible lockfile updates reduced 16 audit findings to five high development-tool findings; the production audit was zero. Installed Next.js, ESLint and undici files did not yet match lock metadata. A fresh registry Next.js 16.3.8 archive verified the correct release, so a clean npm ci was required before final security or build claims. No forced downgrade was applied.

T15 clean install completed: npm ci verified installed Next.js/ESLint 16.3.8, Vitest/coverage 4.1.11, Sharp 0.35.5 and undici 7.30.0. Production audit reports zero findings; full audit reports five high development-tool records through unpatched braces 3.0.3. Registry latest is also 3.0.3, and the suggested forced Next.js ESLint 14 downgrade is incompatible. Installed Next.js guides were inspected. Two focused files/17 tests and scoped lint passed; integrated checks and independent gold review followed.
T13 media fix: the existing YouTube regex accepted unsupported schemes with a video-like suffix, and SongViewer rendered the original external href. Dance fallback links also lacked an HTTP(S) boundary. The shared helper rejects unsupported schemes and credentials, restricts YouTube hosts and video IDs, supports valid watch/share/shorts/live/embed links, and canonicalizes SongViewer external links. Setlist embeds and dance references reuse it; invalid references do not render players. Tests cover accepted formats, hostile hosts/schemes and the actual component. Added a six-beat metronome cycle and cleanup regression; 17 focused tests passed.

## Independent review settlement — 2026-10-06

Laura accepted T15 dependency and T13 media/login changes after 26 focused tests, strict scoped lint and a clean diff check. Juan accepted T15 compatibility and architecture after inspecting the installed Next.js guides, 17 focused tests and scoped lint. Both independently confirmed zero production dependency vulnerabilities and five remaining high development-tool findings with no compatible upstream fix. The full security gate is limited by those findings; an incompatible forced downgrade was not applied.

Juan found a remaining unvalidated reference link in the dance library. The coordinator applied the shared HTTP(S) validator to both its badge and link, and five focused regression cases passed with strict lint. The delta awaits independent review. Full production browser checks remain required before ticket closure.

Juan accepted the dance-library resolve delta after independently running five regression tests and strict scoped lint. No remaining finding was reported in the two changed files. T13 moves to Testing; final integrated production browser checks are running.

Laura accepted the test-only status locator correction after strict scoped lint and diff review. The assertion is scoped to the active conversation and still requires the actual send result or explicit sign-in refusal; navigation announcements cannot satisfy it. The original browser run loaded both viewport cases before the edit, so both used the old locator. A fresh desktop/phone rerun will validate the correction without changing product behavior.

## Final website settlement — 2026-10-06

T10–T15 are Done for their recorded scope. T10 preserves chat history, private draft cleanup and team/profile-scoped realtime state while eliminating loaded-chat server renders; server metadata reads overlap and signing is batched. T11 adds Practice beside Stage with ordered songs, assigned keys, notes, working meter/tempo and session progress. T12 improves loading announcements, pending links and presentation-only font loading. T13 fixes the reproduced Stage demo failure, unsafe reference schemes, inactive time-signature controls and login error navigation. T14 adds the session rehearsal allocation/focus plan, ten preparation checks and a downloadable team snapshot. T15 applies the compatible available patches with independent gold review; it does not assert the entire development dependency tree is vulnerability-free.

Final commands and results:

- `npm run test:coverage:website -- --maxWorkers=2`: 80 files, 371 tests passed. Configured coverage thresholds passed: 87.08% statements, 82.75% branches, 92.4% functions and 90.2% lines.
- `npm run lint:website`: strict lint passed after the final test and dance-link changes.
- `npm run typecheck`: passed. The final production build also performed its TypeScript check.
- `E2E_FORCE_DEMO=1 NEXT_PUBLIC_E2E_FORCE_DEMO=1 npm run build`: optimized Next.js 16.3.8 build passed after the final source change.
- `E2E_FORCE_DEMO=1 E2E_PRODUCTION_BUILD=1 npx playwright test --project=chromium --project=mobile --reporter=line`: 63 passed, three viewport-specific skips; two old global status locators failed. After the independently reviewed test-only correction, the affected two-project `messages controls switch channel` rerun passed 2/2. All 65 applicable cases now pass; the unchanged suite includes both 40-route scans.
- `npm run security:secrets`: no findings across 1,921 history blobs, 327 commit messages and 473 working files; three oversized historical blobs skipped, no oversized working file skipped.
- `npm audit --omit=dev --audit-level=high`: zero vulnerabilities. Full `npm audit` retains five high development-tool findings through unpatched braces. These are documented risk findings, not a clean full-audit claim.
- `git diff --check`: passed. Final source, tests, dependency lock and documentation were reviewed before commit and push.

Applicable engineering gates:

| Gates | Result | Evidence |
| --- | --- | --- |
| 01–06: intake, criteria, constraints, risk, dependencies, ownership | Passed | Ticket table, acceptance criteria and scope checkpoints; band rehearsal/service preparation priority confirmed by user |
| 07–12: conventions, architecture, interfaces, ownership, authorization and verification design | Passed | Existing modules inspected; installed Next.js guides checked; Juan architecture and Laura QA reviews recorded |
| 13: isolated parallel implementation | Passed | Separate Practice-worker and Performance-worker worktrees, explicit owned files, reviewed commits integrated |
| 14–18: skills, code style, TypeScript, naming and reuse | Passed for applicable guidance | Caveman/Ponytail and role guidance loaded; shared existing SongViewer reused, small media/preparation helpers, strict lint/type checks |
| 19–22: route splitting, SSR/hydration, validation and errors | Passed | Request-local Suspense badges, presentation layouts, stable client history/realtime state, safe media URLs, error/retry and race regressions |
| 23–29: new schema, migration recovery, constraints and changed RLS operations | N/A for T10–T15 | No schema or policy changes; existing team guards preserved and scoped loader tests passed. T08 live verification remains a separate open ticket |
| 30–34: build, typecheck, lint, unit/integration and browser checks | Passed | Exact commands and final results above |
| 35: security and dependency risk review | Passed with documented residual risk | Independent Juan/Laura gold review; production audit zero, full audit five unpatched development-tool findings; no forced incompatible downgrade |
| 36: accessibility | Passed on affected paths | Named controls, pending/loading announcements, browser focus/320-pixel/zoom checks, keyboard and phone interactions |
| 37: final diff and criterion evidence | Passed | Source/lock review, independent resolve reviews, final test packet and this settlement |

The new preparation controls are session-only and reset on refresh or switching setlists. Export keeps a text snapshot; it does not write shared completion data. Controlled chat latency is local regression evidence, not a deployed latency guarantee. Live authenticated speed, collection, schema and migration history remain unverified. T08 stays Testing until the connected account can inspect the confirmed project. No new migration was applied during this website enhancement work.

Team settlement: Maya and Josh implementation complete; Juan and Laura review complete; Rob planning complete. Effective specialist model settings remain those verified from role metadata. Next ready task is independent T08 live verification once project access is available. Source is ready for the user's previously authorized push; deployment is not claimed.
