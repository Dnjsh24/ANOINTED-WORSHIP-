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

Completed locally: 7/7. T07 is complete and ready for the project branch. T06 was pushed to `origin/Dn-Jsh/Manager` at `fd7f8c8`. No deployment or remote migration was performed. Release limitations: existing dependency audit findings, native Supabase compatibility/concurrency verification, and authenticated fixtures not available in this session.

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
