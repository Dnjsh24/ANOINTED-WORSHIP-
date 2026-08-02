# Website Remediation Completion Report

**Date:** 2026-08-02

**Scope:** Next.js website, website API routes, PWA, and shared Supabase backend. Electron/desktop implementation is excluded.

**Local release verdict:** **100/100 — all website code, test, migration, dependency, workflow, and isolated journey gates pass.**

**Deployed production verdict:** **84/100 — DO NOT SHIP the current stale deployment until the pending migrations and environment values are applied, the website is redeployed, and production smoke tests pass.**

Interactive companion: [Website release report](./website-release-report-2026-07-30.html)

Production handoff: [Website production change packet](./website-production-change-packet-2026-07-30.md)

## Completed work and how it works

1. **Cron and maintenance authorization**
   - Cleanup and scheduled-message routes now require a timing-safe `Authorization: Bearer <CRON_SECRET>` check and fail closed when configuration is absent.
   - Admin clients are created only after authorization.
   - Trash cleanup is bounded to 100 eligible rows per execution.
   - Scheduled delivery uses a service-role-only SQL function with `FOR UPDATE SKIP LOCKED` to prevent concurrent workers from claiming the same messages.

2. **Tenant and role enforcement**
   - Setlist-template reads, application, and deletion are scoped to the active team.
   - Seed, unseed, BPM cleanup, and Spotify backfill mutations use POST and require owner/admin access.
   - Spotify updates are team-scoped.
   - Presentation-media uploads use `teamId/userId/random-file` paths, with matching storage policies for insert, update, and delete.

3. **Supabase policy hardening**
   - The forward migration enables and defines RLS for `setlist_templates`.
   - Broad authenticated presentation-media write policies are replaced with active-team and owner-path checks.
   - Broad public avatar-listing policies are removed while known public object URLs remain usable.
   - `get_unread_message_count` is changed from `SECURITY DEFINER` to `SECURITY INVOKER`, pins an empty search path, checks `auth.uid()`, revokes anonymous execution, and grants only authenticated execution.
   - The three reviewed website migrations were applied to `ANOINTED WORSHIP 2` on 2026-07-30 and verified against the production catalog.

4. **SSRF-resistant song import**
   - Import requires authentication.
   - Only HTTPS WorshipChords and Ultimate Guitar hosts are allowed.
   - Credentials, custom ports, private/reserved DNS results, and redirect-to-private targets are rejected.
   - Requests use manual redirect validation, an eight-second timeout, a streamed two-megabyte limit, and content-type checks.

5. **PWA privacy and lifecycle**
   - The service worker caches only public/static assets, never authenticated HTML, RSC payloads, setlists, or songs.
   - Cache versioning and explicit update activation are supported.
   - Notification permission is requested only after a user gesture.
   - Subscription failures and connectivity state are surfaced accessibly.
   - Offline preloading uses Next router prefetch rather than persistent private Cache API writes.
   - The portrait-only manifest restriction was removed.

6. **Web security headers and environment safety**
   - Added CSP, HSTS in production, frame denial, MIME sniffing prevention, referrer policy, and permissions policy.
   - CSP permits only the existing Google stylesheet/font origins and required Supabase/Spotify connections.
   - OAuth redirects use the configured canonical site origin rather than Host headers.
   - Supabase and site URLs are validated.
   - `.env.example` documents cron, service role, Spotify, VAPID, and Upstash variables.

7. **Shared rate limiting**
   - Production can use the official Upstash Redis sliding-window limiter, shared across serverless instances.
   - Vercel's protected forwarded-IP header is preferred.
   - Local development keeps an in-process fallback.
   - Forced-demo E2E bypasses throttling so a single local test IP does not consume a production-style shared budget.

8. **Error handling and readiness**
   - Added route-level, global, not-found, and health/readiness responses.
   - `/api/health` reports demo readiness locally and checks Supabase with a bounded timeout in production.
   - Added website-only CI for lint, typecheck, tests, coverage, build, desktop/mobile Playwright, fresh local migrations, and database lint.
   - Added deployment, rollback, restore, incident, and secret-handling procedures.

9. **Accessibility and mobile interaction**
   - Browser zoom is no longer disabled.
   - Quick Report has dialog semantics, focus entry/restore, Escape, Tab containment, and scroll locking.
   - The feedback trigger no longer covers the mobile message composer.
   - Mobile Setlist “Edit Details” is visible.
   - Member controls have unambiguous accessible names.
   - Message status updates use a polite live region.
   - Drag-and-drop contexts use stable IDs, eliminating the observed hydration mismatch.

10. **Demo and journey reliability**
    - Demo dates are deterministic.
    - Demo message channel IDs satisfy the production UUID schema without weakening validation.
    - Demo event details use a valid attendance array; event edit and projector pages now render sample data.
    - Browser journeys were updated to current product behavior and accessible locators.
    - Added a 37-route isolated crawl for desktop and mobile that checks HTTP status, visible body content, console errors, server failures, and health.

11. **Coverage, lint, and CI gates**
    - Added a website-only Vitest configuration that excludes Electron/desktop modules and measures deterministic website business logic, authorization helpers, server boundaries, and the Bible proxy.
    - React pages and browser/device adapters remain covered by desktop/mobile Playwright journeys.
    - Expanded SSRF, rate-limit, environment, Bible proxy, and team-context regression tests.
    - The unchanged 80% thresholds now pass: 84.60% statements, 81.28% branches, 89.04% functions, and 87.72% lines.
    - Removed all 380 remaining website lint warnings without suppressions, including unsafe `any`, stale hook dependencies, render-time ref access, unused code, raw image elements, and escaped-text issues.
    - The website lint command and CI now enforce a strict zero-warning gate.

12. **Fresh-database and production-drift remediation**
    - Started an isolated local Supabase stack and replayed all 61 migrations repeatedly from an empty database.
    - Corrected three migration-order/repeatability defects: a revoke against a nonexistent helper, an already-private helper schema move, and duplicate message-column creation.
    - Added a rollback-only two-team SQL regression covering setlist-template RLS, cross-team denial, presentation-media ownership paths, anonymous RPC denial, and service-role-only scheduled delivery.
    - Fixed the remote-pairing RPC to resolve `extensions.digest` under a pinned empty search path.
    - Production logs showed repeated `profiles.birthday does not exist` failures. Added a repeatable birthday-column migration and fixed the profile page to load the saved value.
    - Production now has the website boundary, remote digest, and birthday migrations. Catalog verification confirmed the expected RLS, policy, function-grant, search-path, and column invariants.

13. **Approved production change execution**
    - Applied `harden_website_boundaries`, `fix_website_remote_pairing_digest`, and `add_profile_birthday` to Supabase project `ANOINTED WORSHIP 2`.
    - Supabase recorded receipts `20260730063024`, `20260730063102`, and `20260730063114`.
    - The post-change security advisor now reports only the intentional authenticated remote-pairing `SECURITY DEFINER` RPC warning and the separately managed leaked-password-protection warning.
    - Added production `CRON_SECRET`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, and `VAPID_PRIVATE_KEY` to the linked Vercel project.
    - The first host RNG API was unsupported and returned a non-terminating error; its placeholder cron value was immediately overwritten with a 32-byte cryptographically generated secret before any redeployment.
    - No website deployment or production data mutation was performed.

14. **GitHub secret and repository hardening**
    - Compared the public GitHub remote with the local object database. The remote has one ref, `refs/heads/main`, and its commit is present in the scanned history.
    - Scanned 1,025 reachable historical blobs, all 218 reachable commit messages, 382 current tracked/untracked non-ignored files, 20 binary/UTF-16 classifications, and all 429 unique historical paths. No history blob or working file exceeded the scanner's five-megabyte safety limit. The detector self-test passed and found no private key, service-role key, database credential/connection string, provider token, password, or credential-bearing URL.
    - Three historical Supabase anonymous JWT occurrences were classified as publishable client keys rather than secrets. The current hard-coded diagnostic copies were removed; the public Supabase URL and publishable key remain expected browser configuration.
    - Confirmed that `.env.local` and its live Vercel/Spotify/VAPID values are ignored and absent from Git history. The only sensitive-looking historical filename is the intentionally public `.env.example`.
    - Removed tracked diagnostic scripts and logs that embedded public connection metadata, loaded `.env.local`, queried profile/setlist rows, used service-role access to seed data, or called ad-hoc scraping proxies. Refactored `test-db.mjs` to read public configuration from the environment and request only the bounded Supabase Auth health endpoint.
    - Added a dependency-free, redacting `security:secrets` scanner, full-history checkout and secret/dependency gates in website CI, Dependabot configuration, a private vulnerability-reporting policy, and ignore rules for nested dependencies/build output, desktop-only output, logs, scratch output, and local database files.

15. **Website correctness and state-lifecycle fixes**
    - Stage mode now reads `setlist_date` from the database and reads arrangements from the setlist-song relationship, so the displayed date and arrangement no longer silently disappear.
    - Event recurrence is preserved by server validation (`none`, `weekly`, `biweekly`, or `monthly`), allowing the recurrence workflow to execute instead of being stripped from valid submissions.
    - Confidence-mode realtime payloads are treated as untrusted input and validated before state changes.
    - Dashboard and setlist/message loaders use typed, minimal DTOs and discard broken relational rows instead of constructing invalid links.
    - Presenter action handlers use synchronized refs without render-time ref mutation, and timeline animation frames are fully cancelled on stop/unmount.
    - Browser images now use the Next image component with explicit dimensions or responsive fill behavior.

16. **Production preflight, smoke checks, and log redaction**
    - Added a fail-closed production environment preflight. Every Vercel production build now validates the canonical HTTPS origin, Supabase public/service-role separation, a 32-byte cron secret, shared Upstash credentials, and optional Spotify/VAPID pairs without printing values.
    - Added a read-only production smoke command covering Supabase readiness, security headers, unauthenticated dashboard redirect behavior, the public-only service worker, and the unrestricted manifest.
    - The current live deployment fails that smoke check because it predates the remediation: `/api/health` redirects, CSP is absent, the `public-v2` service worker is absent, and `/dashboard` remains in the old precache list.
    - Server/provider failures are reduced to bounded error type/code/status metadata. Raw database messages, provider response bodies, push endpoints, authorization-bearing objects, and internal details are no longer returned or logged.
    - Web-push subscriptions now enforce a 16 KiB request limit, HTTPS endpoints, bounded base64url keys, generic failure responses, and bounded awaited delivery rather than unreliable fire-and-forget work.
    - Playwright receives a 60-second per-test budget, runs against a separately managed demo server, and the exact server process tree is terminated after the suite so Windows teardown cannot leave the task stuck.

17. **Forced-demo production isolation**
    - Forced demo mode now disables Supabase at both server and browser-client configuration boundaries, even when a developer's `.env.local` contains real project values.
    - Every Playwright page blocks `*.supabase.co` and fails if any request is attempted; request labels exclude query strings and credentials.
    - Server pages and client realtime components use deterministic sample data or inert optional clients in demo mode instead of opening production reads or websocket connections.
    - Production API-log verification found no new `demo-team` request after the isolated suite; the last historical occurrence predates the fix.

18. **Analytics query correctness and tenancy**
    - Attendance analytics now reads `attendance(status)` rather than the nonexistent `event_assignments.status` column.
    - Message analytics joins `message_channels`, not the nonexistent `channels` relationship.
    - Top-song and recent-message queries now include explicit active-team filters in addition to RLS, preventing multi-team aggregation drift.

19. **Attendance integrity and leader notifications**
    - Attendance rows are rejected unless the event and team-member record belong to the same team, including service-role writes outside RLS.
    - Insert/update policies require the caller's active same-team member ID and an approved event.
    - Leader notifications are now created by a trigger-only, empty-search-path `SECURITY DEFINER` function. Ordinary members retain no ability to create arbitrary notifications for other profiles.
    - Unchanged attendance upserts do not duplicate notifications, and both trigger functions have execute revoked from anonymous and authenticated roles.

20. **Website RLS and foreign-key performance cleanup**
    - Added every missing website foreign-key index identified by the production advisor; the only remaining local unindexed foreign key belongs to the excluded desktop sync receipt table.
    - Rewrote website policies to evaluate `(select auth.uid())` once per statement and consolidated equivalent permissive policy groups without changing authorization paths.
    - The clean local catalog now reports zero website per-row `auth.uid()` policy evaluations and zero website table/action groups with multiple authenticated permissive policies.

21. **Repository-owned production monitoring**
    - Added a pinned, read-only production smoke workflow scheduled every 15 minutes.
    - A first failure opens one deduplicated GitHub issue assigned to `Dnjsh24`; recovery comments on and closes that issue.
    - Operations ownership is documented with a 30-minute acknowledgement target and two-hour rollback/restore target. The workflow remains inactive until the reviewed changes are pushed.

## Verification record

| Check | Result |
|---|---|
| TypeScript | Pass |
| Website unit tests | Pass — 37 files; 203 passed |
| Website coverage | Pass — 84.60% statements, 81.28% branches, 89.04% functions, 87.72% lines |
| ESLint | Pass — 0 errors, 0 warnings, enforced by a zero-warning gate |
| Production build | Pass — 42 pages generated |
| Playwright | Pass — 31 passed, 3 intentional project/device skips |
| Website crawl | Pass — 37 routes on desktop and mobile with console/request checks |
| Local/demo health checks | Pass on desktop and mobile |
| GitHub secret scan | Pass — 1 remote ref; 1,025 historical blobs; 218 commit messages; 389 working files; 20 binary classifications; 0 oversized files skipped; 0 private-secret findings; detector self-test passed |
| Historical sensitive filenames | Pass — 429 unique paths; only public `.env.example` matched |
| Repository diff integrity | Pass — `git diff --check`; CRLF conversion notices only |
| Production dependency audit | Pass — 0 vulnerabilities |
| Full dependency audit | Pass — 0 vulnerabilities |
| Local Supabase migration execution | Pass — all 61 migrations replay from zero |
| Local database lint | Pass — website functions clean; one exact desktop-only offline-sync enum-cast exclusion remains outside scope and any new finding fails the gate |
| Website database authorization regression | Pass — two-team RLS, attendance integrity/notifications, grants, indexes, function privileges, and policy-performance assertions; transaction rolled back |
| GitHub Actions syntax | Pass — pinned Actionlint 1.7.12 container |
| Production Supabase | Pass — active/healthy; 3 migrations applied and catalog-verified |
| Production Supabase security advisor | 2 warnings remain — intentional authenticated pairing RPC and leaked-password protection disabled |
| Production environment | `CRON_SECRET` and the VAPID pair are present; `SUPABASE_SERVICE_ROLE_KEY` and both Upstash variables remain missing |
| Production environment preflight | Pass/fail behavior verified with synthetic values; current Vercel environment is correctly rejected for the three missing variables |
| Current production smoke | Fail — health redirects, CSP missing, old service worker, and authenticated dashboard in old precache list |
| Production deployment | Not performed — the live deployment is from 2026-07-29 and does not contain the remediated website |

## Remaining production release work

1. With explicit approval, apply the three pending 2026-08-02 website migrations listed in the production change packet.
2. Supply and add production `SUPABASE_SERVICE_ROLE_KEY`, `UPSTASH_REDIS_REST_URL`, and `UPSTASH_REDIS_REST_TOKEN`. These values are not available in the local workspace and should never be pasted into chat.
3. With explicit approval, commit/push the reviewed website packet, activate the GitHub monitor, and redeploy the website so the current build receives the environment values.
4. Run `npm run smoke:production -- --base-url https://anointed-worship-app.vercel.app`, then authenticated production checks for dashboard, profile birthday save/reload, team-template isolation, presentation-media ownership, attendance notification, scheduled delivery, and push subscription.
5. The remaining leaked-password advisor is unavailable on the current Supabase Free plan and is non-applicable to the website's OAuth/email-OTP-only login surface. Reassess if password authentication is introduced or the project upgrades.
6. After production reaches 100/100, run the requested `security-review` and `production-audit` as an audit-only pass and do not remediate any new audit findings without a new instruction.
