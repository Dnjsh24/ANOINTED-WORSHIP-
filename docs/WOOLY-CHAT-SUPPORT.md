# WOOLY-17: prepared chat and private website support

Status: **Review**, final acceptance 0/4. Implementation is local. No migration, support-account activation, push or deployment has been performed.

## Behavior and scope

The real local website at `http://127.0.0.1:3100/dashboard` hosts the feature. Open Wooly for **Chat**, **Tutorials** and **My questions**. Quick Report still hands over to the existing form, with one modal open at a time. The animation preview at port 3194 is a separate demonstration and cannot submit real questions.

The idle launcher sits 24px above the desktop bottom and 72px plus safe-area inset below 768px, including the 640–767px navigation range. The left-facing artwork, listening/nodding loop, cloud and reduced-motion handling are preserved. Target-relative guided tours retain their positioning. While writing, Wooly listens; while the prepared answer types, Wooly uses the standing talking loop. Answer text remains available to screen readers after typing ends.

Chat uses a typed prepared catalog, curated aliases and deterministic topic choices. Unknown questions offer a reviewed submission to website support. Record questions can find events, setlists and songs, list songs in a selected setlist, and read stored song key/BPM. Ambiguous names offer record choices. Dates use YYYY-MM-DD, today or tomorrow based on the browser's calendar date; answers display exact stored dates and times. This version does not infer a team time zone or parse ambiguous natural-language dates.

Record reads use a fresh cookie-authenticated Supabase client, verified active membership, explicit team predicates, deleted-record filters and existing RLS. All active members have the existing record-reading access; action-specific editing help continues to use effective permissions. No service-role client is used for records. Events are restricted to approved entries. A revoked or forged selection cannot escape the current team query. Private messages, member details, announcements and reminders are excluded. No record-changing chat actions exist.

Ordinary chat stays in provider memory across supported website routes and panel closes. It is not written to local storage or the database. Reload, sign-out, team/account changes and changed permissions clear it. Server identity is checked when answering and refreshing personal questions, including browser refocus; mismatches clear old data and refresh page context. Screens which omit Wooly also clear its registration. Only submitted questions and support replies persist across devices.

In sample mode, record answers and the UI identify sample data. Guests can use public prepared help. Guests and demos cannot submit real support requests. The current local website has no configured Supabase connection, so it cannot demonstrate a saved real queue entry. Existing hosting/database and rate-limit quotas still apply; no AI provider, training, email service or paid job was added.

## Storage and access boundaries

Forward migration: `supabase/migrations/20261011020000_wooly_chat_support.sql`.

| Storage | Access |
|---|---|
| `wooly_support_accounts` | Administrative grants only; no client table privileges or automatic seed. |
| `wooly_support_requests` | Requesters see their own submissions; dedicated support accounts see submitted requests. Optional team context permits pre-team requests. |
| `wooly_support_messages` | Requester or dedicated support can read a permitted thread; replies use authorized RPCs. |
| `wooly_help_articles` | Drafts are private to support. Published articles contain general website instructions. Anonymous readers see only published everyone-audience articles. Application answers also filter audience and page permissions. |

Clients have no direct INSERT/UPDATE/DELETE table privileges. Authenticated RPCs validate ownership or the support grant. Support has no additional access to songs, setlists, events or other teams' underlying records. Fixed function search paths, row locks, conflict comparisons and stable client request/message IDs protect retries. Database write limits supplement the existing server rate limiter, including callers invoking RPCs directly. No account becomes support simply by being an owner, admin, demo user or first visitor.

Only the question, optional details and sanitized page path are shared as submission content. Neither chat history nor retrieved records is attached. The client also sends a request ID and expected profile ID for retry and account-change checks; the server derives actual ownership from verified authentication. Submission and requester-reply actions reject a draft from a previous account before writing. Failed submissions retain the form and offer **Retry sending to support**. Queue confirmation appears only after the save succeeds. Support replies mark Answered; closing marks Closed; a requester follow-up reopens the request. Unread counts include all personal threads. Reading marks only the fetched snapshot, so concurrent newer replies remain unread. Personal lists have older-question loading; the support queue has pages in oldest-first order. Conversations show the latest 200 replies; the prepared article library currently fetches up to 200 articles per request.

`/support/wooly` is guarded by the verified dedicated support role and returns not-found without it. It has a separate reply/close workflow and reusable-answer editor. **Create reusable answer** copies a private reply into an editable unpublished draft. **Publish** is a separate explicit action. Saving a published answer as a draft or choosing **Unpublish** removes it from Wooly's answers. Only static website pages can be linked from the editor. Support should remove names and team facts before publishing.

The PWA's existing service worker excludes authenticated documents/RSC and all POST requests from caching; no offline queue or personal-data cache was introduced. A missing migration or failed network request leaves tutorials/static help and normal website use available.

## Candidate and verification

One coordinator implemented the website feature sequentially. No parallel implementation or separate desktop application changes were made. Existing dirty-tree work is preserved. Baselines, command logs, coverage and final hashes are under `output/wooly-chat/`; artwork hashes are checked against the approved assets. Database types were updated from the local migration contract; generation from a running migrated database is still required when local Supabase is available.

Final source checks are recorded below. No missing gate is treated as a pass.

| Check | Evidence / result |
|---|---|
| Focused unit/integration and coverage | Final: 203/203 tests in 22 files; statements 90.69%, branches 87.34%, functions 87.79%, lines 96.34%. Includes refocus, identity, account-change write rejection, pagination, privacy, retry and editor-focus cases. |
| Current-source typecheck | Pass, exit 0: `npx tsc --noEmit --project .tmp/wooly/tsconfig.json`; `types.log`. |
| Scoped strict lint | Pass, exit 0 with zero warnings: changed website TypeScript, Wooly components, E2E and local security harness; `lint.log`. |
| Full website unit/coverage | Pass, 126/126 files and 709/709 tests outside the sandbox; statements 88.62%, branches 84.45%, functions 93.84%, lines 91.27%. Final parser, accessibility and account-change refinements were then covered by the affected 203-test suite, current-source types and strict lint. Initial sandbox EPERM and a new test-file parenthesis typo were repaired before the accepted repeat. `website-tests.log`, `website-coverage/`. |
| Website compilation | Compile mode passed including `/support/wooly`. Final standard `npm run build` compilation also passes (16.7 seconds), then its global type phase fails. Sandbox SWC path denial resolved by the approved local outside-sandbox run. |
| Complete root typecheck/build | Root types and standard `npm run build` fail on unrelated archived candidates and desktop declarations; `root-types.log`, `full-build.log`. Baseline copies for this task were renamed to `.snapshot` to keep them out of TypeScript inputs; the final build confirms remaining failures are outside the implementation for this task. No unrelated files were changed to suppress errors. |
| Full website lint | Existing configuration fails to resolve `react-hooks/immutability`'s plugin. Scoped changed-code lint is a separate check. |
| CSS and animation preview build | Pass: both CSS files parse with Lightning CSS; Vite animation-preview production build passes (137 modules). Approved whole-frame and pointing atlas SHA256 hashes match their baselines. |
| Local database security | `scripts/test-wooly-support-security.mjs` rejects remote URLs and only creates disposable local fixtures. It covers pre-team requests, two accounts/teams, forged IDs, anonymous access, grants, retries, unread races, publishing and reopening. Execution cannot reach the database because Docker's Linux engine is unavailable. Static migration tests are not runtime RLS proof. |
| Browser/device/screen-reader | Not run under the existing browser restriction. No alternate browser/HTTP UI route was used. E2E scenarios were updated for Chat/Tutorials, 700px navigation clearance and sample support behavior. |
| Independent review | Pending the existing reviewer's account usage limit; no substitute agent was launched to bypass it. |

Final process verification outside the sandbox confirms the original website listener PID 3232 on port 3100 and animation preview PID 17016 on port 3194 remain active. A sandbox process check hid those listeners; a duplicate launch exited safely with EADDRINUSE. No existing server was stopped or replaced. Process evidence confirms availability, not browser acceptance.

Full website commands use workspace-local `TEMP`/`TMP`, `--exclude output/** --exclude .tmp/**`, `--maxWorkers=2` and `vitest.website.config.ts`. Coverage thresholds remain at 80%; none were reduced. There were no repeated three-attempt repairs on one defect. Effective model/effort and usage telemetry are unavailable, not zero.

## Activation and recovery (separate authorization)

Before real support use: run the migration in a local test database, regenerate/compare types, run the local security harness and database lint, finish independent and allowed desktop/mobile/keyboard/screen-reader checks, then resolve release gate failures. Do not use the unrelated connected Supabase project or restore archived credentials to make this local preview appear connected.

Remote migration, support activation and deployment each require separate authorization. After approval, verify the intended profile against the website's real authentication account before administratively adding precisely that profile to `wooly_support_accounts`. No support profile has been selected or granted here. Test the dedicated account and an ordinary account after activation.

For rollback, disable the existing Wooly feature flag to restore the standalone Quick Report launcher. Leave stored submissions intact. Remove a particular support grant administratively if access must be revoked; repair schema issues with a forward migration. Do not drop the queue tables or erase private support history as a routine rollback.

## Engineering gates

| Gates | Status and evidence |
|---|---|
| 01–06: scope, criteria, boundaries, risk, dependencies, owner | Pass: approved plan and WOOLY-17, account/data risk, standard lane, local-only boundaries. |
| 07–12: conventions, blast radius, contracts, ownership, data flow, verification | Source review by coordinator; typed catalog, separate read service/actions/hooks/inbox, additive storage. Independent review remains pending. |
| 13: parallel worktree | N/A: one sequential implementer; baseline snapshots preserve unrelated work. |
| 14–18: skills, style, types, naming, duplication | Required migration/RLS, TypeScript, accessibility and completion guidance loaded; shared thread/editor/catalog boundaries and scoped checks. |
| 19–22: routing, SSR, validation, errors | Shared layout host retained; private route guarded; dialog hydration tests retained; all server inputs validated; failure/retry and stale-response cases covered. |
| 23–25: migration compatibility, recovery, constraints/indexes/volume | Additive local migration; no automatic grants; bounded queries and indexed ownership/status/message-time paths. Recovery described above. |
| 26–29: RLS SELECT/INSERT/UPDATE/DELETE | Source contracts and mocked server denials covered. **Runtime unverified** because local Docker is unavailable. |
| 30–33: build, types, lint, tests | Scoped evidence above; global build/types/lint have separately recorded limitations. |
| 34: end-to-end | **Unverified** under the existing browser restriction; updated scenarios are not a claimed pass. |
| 35: security/dependencies | No dependency, credentials or AI service changes. Record queries stay on the cookie client. Dedicated grants and publishing remain explicit. Independent security review and runtime isolation pending. |
| 36: accessibility | Source/DOM keyboard, focus restoration, dialog separation, reduced motion and complete screen-reader text checked. Physical/browser/assistive-technology acceptance pending. |
| 37: final diff and acceptance | Candidate/hash packet recorded; **Review**, not Done, while independent, browser and database acceptance remain outstanding. |
