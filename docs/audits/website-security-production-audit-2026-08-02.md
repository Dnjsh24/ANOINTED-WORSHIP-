# Website Security and Production Audit

Date: 2026-08-02

Scope: Next.js website, website API routes and server actions, shared website Supabase schema, PWA, tests, scripts, configuration, GitHub state, and Vercel production state.

Explicit exclusion: Electron and desktop-only implementation, except where Next.js includes a desktop-prefixed route in the website build.

Mode: Read-only audit. No application, migration, secret, Supabase, Vercel, GitHub, or production data changes were made.

## Executive verdict

**Production-readiness score: 52/100 — DO NOT SHIP**

The current local website candidate builds and its local/demo automated suite is green, but it is not safe to deploy yet. Ownership can be reassigned or destroyed by an admin, machine-authenticated cron handlers are intercepted by the user-session proxy, production and local migration ledgers have diverged, and several destructive/bulk mutations lack transactional integrity. The deployed GitHub version is materially less safe and scores **31/100** because it also contains a service-role global delete path, a signed-in-user SSRF path, an authenticated-page service-worker cache, disabled zoom, no health route, and no CSP.

The repository secret scan was clean: no database passwords, service-role keys, API secrets, private keys, or credential-shaped values were found in the complete Git history, commit messages, or current working files. Both production and development dependency advisories reported zero known vulnerabilities. This does not offset the confirmed authorization and data-integrity defects.

## Scope and coverage

The working-tree inventory contains **400 files**:

| Classification | Files | Audit treatment |
|---|---:|---|
| Authored website text | 340 | Inventoried and line-scanned; security-sensitive and failure-prone paths manually reviewed |
| Desktop-only | 39 | Classified and excluded at the user's direction |
| Deleted from working tree | 11 | Classified; GitHub/deployed versions reviewed where production-relevant |
| Binary assets | 9 | Path, type, repository, and reference review; not decoded line by line |
| Generated source | 1 | Schema/type drift review; not treated as authored logic |

The authored website text totals approximately **58,011 lines**, including 61 SQL migrations, source, tests, E2E, scripts, configuration, documentation, and lockfiles. The complete path-by-path ledger is in [website-file-inventory-2026-08-02.md](website-file-inventory-2026-08-02.md).

Review techniques included full-tree pattern scans for secrets, unsafe dynamic execution, raw HTML sinks, unbounded fetches, service-role usage, authorization checks, public routes, unsafe redirects, destructive queries, object-storage policies, RLS boundaries, SECURITY DEFINER functions, environment access, logging, and accessibility primitives. Every authored file received an inventory status; manual semantic review concentrated on all APIs, server actions, auth/proxy code, RBAC, PWA, high-risk components, migrations, and deployment/CI scripts. Generated artifacts and binaries were classified rather than represented as manually interpreted source.

## Findings

### AW-001 — Critical — Deployed cleanup handler becomes a global destructive endpoint when the service-role key is configured

- **State:** Confirmed in origin/main and the deployed source; currently dormant because the Vercel Production environment does not contain SUPABASE_SERVICE_ROLE_KEY.
- **Evidence:** origin/main:src/app/api/songs/cleanup-trash/route.ts lines 4-9 reads Authorization but deliberately does not validate it; lines 17-26 creates a service-role client; lines 31-35 deletes every soft-deleted song older than 30 days without a team filter. origin/main:src/lib/supabase/proxy.ts lines 146-149 limits normal reachability to signed-in users, but any signed-in user would be enough.
- **Reproduction:** Do not invoke against production. In an isolated project with the service-role variable set, sign in as an ordinary member and request the handler. The route reaches a global RLS-bypassing delete rather than returning 401/403.
- **Impact:** Irreversible cross-tenant song deletion by a low-privilege authenticated user.
- **Confidence:** High; direct source evidence. Production exploitation was intentionally not attempted.
- **Root cause:** A maintenance job relies on an unverified header and embeds an RLS-bypassing global delete in a web route.
- **Recommended fix:** Replace the deployed route with the local constant-time cron authorization and bounded batch implementation; ensure the proxy admits only a cryptographically verified machine request; keep service-role credentials server-only; log counts, not rows.
- **Regression test:** Missing, malformed, or user-session-only authorization returns 401; correct cron bearer reaches the handler without a cookie; the isolated test deletes only eligible records in a bounded batch and cannot cross the intended maintenance scope.

### AW-002 — High — Admins can seize ownership, demote/remove the owner, or orphan a team

- **State:** Confirmed in local source and live production RLS.
- **Evidence:** src/lib/domain/rbac.ts lines 42-58 grants admins members.manage. src/app/actions.ts lines 2891-2914 accepts owner as a target role and updates any team member; lines 2924-2939 deletes any team member. src/components/members-client.tsx lines 389-397 exposes every team role. Live team_members UPDATE and DELETE policies allow owner or admin and contain no owner invariant. The separate self-delete policy also permits an owner to delete their own membership.
- **Reproduction:** In an isolated two-user team, authenticate as admin and update the admin membership to owner or delete/demote the existing owner. Direct PostgREST produces the same result under the live policies.
- **Impact:** Privilege escalation to team deletion/settings authority, loss of the legitimate owner, and permanently orphaned teams.
- **Confidence:** High; application and live-policy evidence agree.
- **Root cause:** Ownership is modeled as an ordinary mutable role without a protected transfer operation or last-owner invariant.
- **Recommended fix:** Add an owner-only transactional ownership-transfer RPC; reject owner assignment/demotion/deletion through generic member APIs; enforce at least one owner at the database boundary; prevent owner self-leave until ownership is transferred.
- **Regression test:** Admin cannot create/demote/delete an owner; owner cannot remove the final owner; a valid owner-to-member transfer is atomic and leaves exactly one or more valid owners.

### AW-003 — High — Scheduled delivery and trash cleanup are unreachable to Vercel Cron

- **State:** Confirmed by source and supported by live runtime behavior.
- **Evidence:** src/lib/supabase/proxy.ts lines 144-155 only makes root, login, auth, and local health public; both cron paths are redirected before their route-level CRON_SECRET validation. The deployed proxy has an even smaller public set at origin/main lines 138-149. The production smoke test received 307 for /api/health, demonstrating this interception pattern.
- **Reproduction:** Send a request with a correct cron bearer but no Supabase session cookie to /api/messages/send-scheduled or /api/songs/cleanup-trash in an isolated deployment. The proxy returns 307 to login instead of reaching the handler.
- **Impact:** Scheduled messages are not delivered and expired trash is not cleaned automatically. A future service-role configuration would not repair this.
- **Confidence:** High; deterministic middleware ordering and live 307 evidence.
- **Root cause:** The proxy recognizes only browser-public routes and cannot distinguish verified machine traffic before enforcing interactive authentication.
- **Recommended fix:** Define an explicit machine-route boundary in the proxy or matcher and validate the bearer before bypassing browser auth. Never make the handlers generally public.
- **Regression test:** Correct cron bearer/no cookie reaches each handler; absent or incorrect bearer returns 401; a normal signed-in user without the cron secret is rejected.

### AW-004 — High — Local and production migration ledgers have diverged, and applied history was edited

- **State:** Confirmed against linked project ANOINTED WORSHIP 2.
- **Evidence:** The linked migration list has local-only versions 20260726000002, 20260726000003, 20260727000000/1/2, 20260728000000, 20260729000000/1/2, 20260730000000, 20260730010000, and 20260802000000/010000/020000, while production records differently timestamped counterparts including 20260726133308, 20260726134512, 20260726195808, 20260726200156, 20260726201305, and 20260730063024/63102/63114. Production records 55 migrations; the working tree contains 61. Three previously applied files are modified locally: 20260630023000, 20260727000002, and 20260729000000.
- **Reproduction:** Run supabase migration list --linked and compare both columns; run git diff on the three historical files.
- **Impact:** A normal deployment can replay equivalent DDL, fail partway, or make future schema provenance and recovery unreliable. The three newest hardening migrations are not present in production under their local versions.
- **Confidence:** High; direct linked-ledger and Git evidence.
- **Root cause:** Applied migration history was renamed/recreated and later edited instead of remaining immutable and being followed by forward-only corrections.
- **Recommended fix:** Back up production; reconstruct the exact mapping between remote and local SQL; restore immutable historical files; use migration repair only after reviewing exact hashes; express remaining changes as new forward migrations; dry-run the upgrade from a production snapshot.
- **Regression test:** Local and linked lists are one-to-one; a clean clone can reset from zero; a branch cloned from production accepts the forward migration set without repair, duplicate DDL, or data loss.

### AW-005 — High — Production attendance policy permits cross-team relationship corruption

- **State:** Confirmed in live production. A local pending migration addresses it but is not applied.
- **Evidence:** Live attendance INSERT/UPDATE policies join the chosen team_members row to the event only through attendance IDs; they do not require tm.team_id = e.team_id. Separate foreign keys also do not enforce that equality.
- **Reproduction:** In an isolated database, use a user who is active in teams A and B and insert attendance using the user's team-A member ID with a team-B approved event ID.
- **Impact:** Cross-tenant attendance links corrupt rosters and may affect downstream attendance/assignment behavior.
- **Confidence:** High; live pg_policies and constraint definitions.
- **Root cause:** Independent foreign keys and an RLS existence check validate identity and event membership separately but omit tenant consistency.
- **Recommended fix:** Apply a forward-only policy/constraint hardening migration after ledger reconciliation; require active membership and exact event/member team equality.
- **Regression test:** Cross-team combinations fail at the database boundary; valid same-team attendance insert/update succeeds.

### AW-006 — High — Deployed song import is an authenticated SSRF and resource-exhaustion primitive

- **State:** Confirmed in origin/main/deployed source; fixed locally but not deployed.
- **Evidence:** origin/main:src/app/api/songs/import/route.ts lines 4-20 parses any URL, performs fetch before provider classification, and buffers the full response. There is no hostname allowlist, DNS/IP check, HTTPS requirement, redirect validation, timeout, or response limit. The browser proxy restricts it to signed-in users, not privileged users.
- **Reproduction:** Do not probe production metadata services. In an isolated deployment, submit a loopback/private-network URL or an oversized streaming response as an ordinary member.
- **Impact:** Server-side access to internal endpoints, request hangs, and memory consumption.
- **Confidence:** High; direct source evidence.
- **Root cause:** User-controlled server-side fetching was treated as parsing convenience rather than a network security boundary.
- **Recommended fix:** Deploy the local safe remote HTML fetcher after its tests pass: exact HTTPS host allowlist, public DNS checks on every redirect, manual redirect cap, timeout, streamed size cap, and generic errors.
- **Regression test:** Loopback, link-local, private IPv4/IPv6, DNS-rebinding, protocol downgrade, disallowed host, redirect escape, timeout, and oversized response all fail closed; allowlisted fixtures succeed.

### AW-007 — High — Deployed service worker caches authenticated pages across user sessions

- **State:** Confirmed by deployed source and production smoke test; fixed locally but not deployed.
- **Evidence:** origin/main:public/sw.js lines 1-10 precaches /dashboard and /teams; lines 44-76 caches almost every successful non-API same-origin GET and falls back to cached dashboard. There is no user partition or logout purge. Production still reports cache-v1 and authenticated dashboard precaching.
- **Reproduction:** On a shared isolated browser profile, sign in as user A, visit private pages, sign out, go offline, and revisit the cached URL as user B or unauthenticated.
- **Impact:** Private team content can remain visible to a later user of the same browser profile.
- **Confidence:** High.
- **Root cause:** A generic network-first cache stores personalized HTML/RSC responses without authentication awareness.
- **Recommended fix:** Deploy the local public-assets-only cache, version it, delete legacy caches on activation, never cache authenticated navigation/RSC responses, and clear private caches on logout.
- **Regression test:** Authenticated HTML is absent from Cache Storage; logout plus offline navigation cannot reveal the prior user's pages; public shell assets still work offline.

### AW-008 — High — Unseed deletes user-authored songs when their titles match seed data

- **State:** Confirmed in both local and origin/main implementations.
- **Evidence:** src/app/api/admin/unseed/route.ts lines 31-40 builds a list of seed titles and soft-deletes every active song in the selected team with any matching title. The seed flow can skip an already-existing song with the same title, so that user-owned row has no safe provenance distinction.
- **Reproduction:** In an isolated team, create a user-authored song whose title matches a seed song; run seed, then unseed. The user song is moved to trash.
- **Impact:** Destructive loss of user content and trust.
- **Confidence:** High; deterministic query.
- **Root cause:** Titles are used as deletion identity instead of recording exactly which rows a seed operation created.
- **Recommended fix:** Record a seed batch/provenance marker or the inserted IDs and unseed only those exact rows. Make the route POST-only and preserve explicit confirmation.
- **Regression test:** A pre-existing same-title song survives seed/unseed; only rows created by the selected seed batch are removed.

### AW-009 — High — Production release gates are absent and the local candidate cannot pass production prebuild as configured

- **State:** Confirmed.
- **Evidence:** .github is untracked and absent from origin/main, so the local CI and monitoring workflows do not run on GitHub. The live smoke command fails because /api/health returns 307, CSP is absent, and the legacy service worker is active. Vercel Production has the VAPID, CRON_SECRET, site URL, and public Supabase variables, but lacks SUPABASE_SERVICE_ROLE_KEY and both UPSTASH_REDIS variables. The local prebuild validator requires all three. render.yaml is stale and would skip the Vercel-specific validation condition.
- **Reproduction:** Inspect origin/main:.github; run the production smoke command; compare scripts/check-production-env.mjs with Vercel environment variable names.
- **Impact:** Security and regression checks are not enforced, synthetic monitoring is inactive, and the current candidate would fail or run in degraded mode if deployed without configuration changes.
- **Confidence:** High.
- **Root cause:** Release controls exist only in an untracked working tree and deployment manifests have drifted.
- **Recommended fix:** After code blockers are fixed, review and commit CI/monitor workflows, configure required production variables through the approved secret store, validate a preview, and either update or deprecate render.yaml.
- **Regression test:** Required pull-request checks are enforced; production prebuild passes without exposing values; monitor runs on schedule; smoke tests pass against preview and production.

### AW-010 — Medium — Join-request fields can manufacture an owner request at the database boundary

- **State:** Confirmed in live production.
- **Evidence:** Live join_requests INSERT policy checks only profile_id = auth.uid(). It does not constrain requested_role, status, reviewed_by, or reviewed_at. src/app/actions.ts lines 2797-2825 trusts request.requested_role and copies it into team_members during approval.
- **Reproduction:** In an isolated project, directly insert a pending join request for the user's profile with requested_role = owner, then approve it as an admin through the normal review action.
- **Impact:** An admin can unknowingly promote a requester to owner; malformed review state can be stored outside the UI workflow.
- **Confidence:** High.
- **Root cause:** UI filtering is relied on for a database trust boundary.
- **Recommended fix:** Enforce allowed request roles, pending status, and null reviewer fields in RLS/constraints; approve through one transactional RPC that revalidates the requested role.
- **Regression test:** Direct requests for owner/admin or pre-reviewed statuses fail; ordinary allowed requests and review transitions succeed atomically.

### AW-011 — Medium — Cross-team child relationships are not consistently enforced

- **State:** Confirmed in production schema.
- **Evidence:** The setlist_songs INSERT policy validates the destination setlist's team but not that song_id or lead_member_id belongs to the same team. Constraints are independent foreign keys. Similar independent relationships exist for dance_notes and event_assignments. src/app/actions.ts lines 1439-1479 bulk-inserts caller-provided song IDs without verifying every song against context.teamId.
- **Reproduction:** In an isolated two-team setup, use a known foreign song UUID in a direct setlist_songs insert into a setlist the caller manages.
- **Impact:** Cross-tenant referential corruption, broken joins, and confusing partial visibility.
- **Confidence:** High for setlist_songs; medium for unexercised related tables.
- **Root cause:** Tenant identity is duplicated across related tables without composite constraints or full policy predicates.
- **Recommended fix:** Add team-consistency constraints/triggers or tenant-aware RPCs and validate every referenced row in server actions.
- **Regression test:** Every cross-team combination fails in direct PostgREST and server-action tests; same-team relationships succeed.

### AW-012 — Medium — Multi-step destructive and bulk operations are non-transactional

- **State:** Confirmed in local source.
- **Evidence:** src/app/actions.ts lines 1337-1355, 3591-3599, and 3655-3680 perform dependent deletes sequentially and ignore several intermediate errors. Lines 1633-1675 reorder with two parallel passes; a pass-two failure leaves rows shifted by 10,000. Lines 1439-1479 accepts an unbounded bulk array and computes order from a race-prone count. Lines 1712-1738 accepts unbounded message IDs and ignores message_reads upsert failure.
- **Reproduction:** In an isolated database, force a constraint/network error midway through each operation or issue concurrent add/reorder calls.
- **Impact:** Partial deletion, corrupted ordering, misleading success, and request amplification.
- **Confidence:** High from control flow; fault injection was not performed.
- **Root cause:** Complex mutations are orchestrated as independent client queries rather than bounded, transactional database operations.
- **Recommended fix:** Move each integrity-sensitive operation into a transaction/RPC, validate bounded schemas, check every result, make ordering conflict-safe, and use idempotency where applicable.
- **Regression test:** Fault injection rolls back all rows; concurrent reorder/add preserves a unique contiguous order; oversized arrays are rejected.

### AW-013 — Medium — API resource controls and production rate limiting are incomplete

- **State:** Confirmed in local candidate; the deployed version is older.
- **Evidence:** events/conflict-check and web-push/subscribe trust Content-Length before req.json, so omitted/chunked requests bypass the declared limit. spotify/search obtains a fresh access token for every query and has no query-length, timeout, or response-size cap. spotify/backfill lines 25-51 performs an unbounded N+1 update loop. src/lib/rate-limit.ts lines 69-88 falls back to per-instance memory; Production lacks both required Upstash variables.
- **Reproduction:** In an isolated deployment, omit Content-Length and send an oversized body; send many search requests across serverless instances; create a large song set and invoke backfill.
- **Impact:** Memory/CPU/third-party quota exhaustion, weak distributed abuse control, and serverless timeouts.
- **Confidence:** High for source/config; no production load test was run.
- **Root cause:** Limits are optional metadata checks or instance-local controls rather than bounded parsing and shared enforcement.
- **Recommended fix:** Stream or byte-cap request bodies independently of Content-Length, add schemas and item/query limits, cache Spotify tokens, add fetch timeouts/size caps, batch backfill, and require distributed rate limiting in production.
- **Regression test:** Chunked oversized bodies fail; token requests are reused; provider timeouts abort; multi-instance rate-limit tests share a counter; backfill is bounded and resumable.

### AW-014 — Medium — Critical authorization and production paths are not exercised by real multi-user E2E

- **State:** Confirmed test-evidence gap.
- **Evidence:** Forced demo Playwright passes all implemented journeys, but demo mode bypasses Supabase auth/RLS and real server mutations. No automated two-user owner/admin test, live RLS browser journey, cron-proxy test, service-worker session-isolation test, or production migration-upgrade rehearsal exists.
- **Reproduction:** Review e2e/app.spec.ts, e2e/website-smoke.spec.ts, and the unit test set; compare with the high-risk paths above.
- **Impact:** Green CI can coexist with authorization, tenancy, and deployment defects.
- **Confidence:** High.
- **Root cause:** Runtime coverage is optimized for deterministic UI/demo rendering rather than the highest-risk production boundaries.
- **Recommended fix:** Add an isolated Supabase integration suite with owner/admin/member users and an isolated production-like deployment test for proxy, cron, PWA, and migrations.
- **Regression test:** The suite must reproduce every High/Critical finding before its fix and pass afterward.

### AW-015 — Medium — Dialog, keyboard, zoom, and target-size accessibility is incomplete

- **State:** Confirmed by static review; runtime WCAG conformance remains missing evidence.
- **Evidence:** Modal overlays in src/components/members-client.tsx lines 472-529, arrangement-editor.tsx lines 190-336, setlist-template-picker.tsx lines 33-67, song-form.tsx lines 475-520, edit-band-notes-button.tsx lines 34-76, event-delete-button.tsx lines 22-72, and save-as-template-button.tsx lines 42-83 lack a complete dialog contract: role/name, focus containment, Escape close, focus restoration, and scroll locking. Setlist template choices are clickable non-semantic divs. Several color/gradient controls have no accessible name and are 24px. The deployed layout explicitly sets maximumScale: 1 and userScalable: false at origin/main:src/app/layout.tsx lines 53-58.
- **Reproduction:** Navigate using keyboard only; open each modal; press Tab/Shift+Tab/Escape; inspect focus after close; run at 200% and 320 CSS pixels; inspect color buttons with an accessibility tree.
- **Impact:** Keyboard, low-vision, and motor-impaired users can lose context or be unable to operate controls; deployed pinch zoom is disabled.
- **Confidence:** High for static defects; contrast and complete WCAG 2.2 AA status are unverified.
- **Root cause:** Custom overlays and compact icon controls are implemented without a shared accessible dialog/target primitive.
- **Recommended fix:** Use a tested dialog component with focus lifecycle, semantic buttons and labels, at least 24x24 minimum and preferably 44x44 targets, visible focus, live status announcements, and unrestricted zoom.
- **Regression test:** Automated axe checks plus keyboard focus-loop/Escape/restore tests at desktop, Pixel 7, 320px, and 200% zoom.

### AW-016 — Medium — Production lacks CSP; local CSP still permits inline scripts

- **State:** Confirmed.
- **Evidence:** Production smoke reports no Content-Security-Policy header. Local next.config.ts lines 13-29 adds CSP and other headers, but production script-src still contains unsafe-inline.
- **Reproduction:** Inspect response headers for the deployed root/HTML routes and compare the local header definition.
- **Impact:** Reduced defense in depth against injected script. No dangerous React HTML sink, eval, Function constructor, or document.write was found in the website source scan.
- **Confidence:** High for header state; no exploit sink was identified.
- **Root cause:** Headers were added only in the unshipped working tree and do not yet use nonces/hashes.
- **Recommended fix:** Deploy baseline headers, then move executable inline code to nonce/hash-authorized scripts and remove unsafe-inline from production script-src.
- **Regression test:** Header smoke test on every document route; CSP violation test; build/runtime remains functional without unsafe-inline script execution.

### AW-017 — Low — Slide backgrounds use broad image input and one-year bearer URLs

- **State:** Confirmed in local source.
- **Evidence:** src/components/slide-background-picker.tsx lines 41-62 accepts image/* without an explicit file-size or exact MIME allowlist, uploads to practice-files, creates a one-year signed URL, and stores that bearer URL in slide settings. src/app/actions.ts lines 2968-2989 JSON-parses arbitrary settings without a schema.
- **Reproduction:** In an isolated team, choose an unexpectedly large or unusual image subtype or submit hand-crafted slide settings.
- **Impact:** Long-lived leaked links, storage consumption, inconsistent rendering, and settings-shape drift. CSP limits script execution; this is not classified as an XSS finding.
- **Confidence:** High.
- **Root cause:** Presentation media reuses a general practice-file bucket and trusts client-side shape.
- **Recommended fix:** Use the dedicated presentation-media boundary, exact type/size validation, short-lived URLs resolved at render time, and a strict server schema.
- **Regression test:** Oversized/disallowed files and malformed settings fail; stored settings contain stable object paths rather than long-lived bearer URLs.

### AW-018 — Low — Secondary deployment and documentation state has drifted

- **State:** Confirmed.
- **Evidence:** render.yaml lacks current server variables and its production validation is conditioned on VERCEL_ENV. README still mentions an old PostCSS advisory although both current npm audits are clean. The worktree is heavily dirty, includes untracked release controls, and edits three historical migrations.
- **Reproduction:** Compare render.yaml, README, scripts/check-production-env.mjs, git status, and npm audit output.
- **Impact:** Operator confusion, accidental deployment through an unsupported target, and poor reviewability.
- **Confidence:** High.
- **Root cause:** Multiple deployment narratives and audit/remediation work have not been consolidated into a reviewed release unit.
- **Recommended fix:** Declare Vercel as canonical or fully support Render; update documentation from verified state; split changes into reviewable commits after security blockers are resolved.
- **Regression test:** Documentation checks and deployment validation run in the canonical pipeline; clean-clone release instructions succeed.

## Positive controls confirmed

- Full Git history, commit-message, and working-tree secret scan passed with 0 findings across 1,025 history blobs, 218 commit messages, and 392 working files; 20 binaries were classified.
- npm audit --omit=dev --audit-level=high passed with 0 vulnerabilities.
- Full npm audit --audit-level=high passed with 0 vulnerabilities.
- All 40 local public tables have RLS enabled.
- Local SECURITY DEFINER functions reviewed use an empty search_path; the authenticated claim_worship_remote_pairing function has intentional, narrow grants and one-time/hash/expiry checks.
- Production presentation-media storage write policies are team/user path-aware; the suspected broad authenticated-write issue is not a live finding.
- Local song import uses HTTPS host allowlisting, DNS public-address validation, redirect checks, an 8-second timeout, and a 2 MiB streamed body cap.
- Local service worker is versioned public-v2 and restricts caching to public assets.
- No dangerouslySetInnerHTML, innerHTML assignment, eval, Function constructor, or document.write sink was found in website-authored code.
- Error redaction is used in the local candidate's security-sensitive routes.

## Automated command record

All local build/test commands were run sequentially to avoid .next races.

| Command | Result | Evidence |
|---|---|---|
| npm run security:secrets | PASS | 0 findings; scanner self-test passed |
| npm audit --omit=dev --audit-level=high | PASS | 0 vulnerabilities |
| npm audit --audit-level=high | PASS | 0 vulnerabilities |
| npm run lint:website | PASS | 0 errors, 0 warnings |
| npm run typecheck | PASS | TypeScript completed |
| npm run test:website | PASS | 37 files, 203 tests |
| npm run test:coverage:website | PASS | statements 84.60%, branches 81.28%, functions 89.04%, lines 87.72% |
| npm run build | PASS | Next.js 16.2.12 webpack; 42 static routes/pages emitted |
| E2E_FORCE_DEMO=1 npm run test:e2e -- --reporter=line | PASS | 34 tests: 31 pass, 3 intentional device skips; Chromium and Pixel 7 |
| npm run lint:database:website | PASS | Website-scoped database lint gate passed |
| supabase/tests/website_security_regression.sql | PASS | Assertions passed and transaction rolled back |
| Docker-pinned actionlint | PASS | Local workflow syntax passed |
| git diff --check | PASS WITH HYGIENE WARNINGS | No whitespace errors; widespread LF-to-CRLF conversion warnings |
| npm run smoke:production -- --base-url https://anointed-worship-app.vercel.app | FAIL | health 307; CSP missing; legacy SW; dashboard precached |

## Live Supabase evidence

Project: ANOINTED WORSHIP 2, active/healthy in ap-northeast-2.

- Security advisors: two warnings. claim_worship_remote_pairing is intentionally executable by authenticated users and was manually reviewed; leaked-password protection is disabled, but the project currently uses OAuth and email OTP rather than password login.
- Performance advisors previously returned 169 notices: 25 missing foreign-key indexes, 29 auth-initplan findings, 12 unused-index findings, and 103 multiple-permissive-policy notices. The local hardening migrations reduce website-scoped lint findings, but the migration ledger must be reconciled before any production application.
- The production attendance policy mismatch and membership/join-request policy findings above were confirmed by direct read-only pg_policies and constraint queries.
- Reference: [Supabase authenticated SECURITY DEFINER advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) and [Supabase password protection guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Runtime route and state coverage

- Every website page emitted by the local production build was visited in forced demo mode on Chromium desktop and Pixel 7.
- The E2E crawl checks successful rendering, navigation, console errors, failed requests, and mobile overflow for the implemented demo journeys.
- The health endpoint is covered locally.
- Invalid configuration is covered by environment-validator unit tests.
- Local database migrations have been replayed against the local Supabase stack, and the website regression SQL ran rollback-only.
- Desktop-only workflows were excluded. Three desktop-prefixed route groups emitted by Next.js were reviewed only to confirm they return 404 outside the desktop runtime.

## Missing or intentionally withheld evidence

- No destructive production route was called.
- No production data was written and no live privilege escalation was executed.
- No authenticated production browser session or two-user production journey was used.
- No production cron job was manually triggered.
- No production backup restore/PITR drill was performed.
- No approved visual-regression baseline exists; visual comparison is inconclusive.
- No complete keyboard, screen-reader, contrast, 200% zoom, 320px reflow, or automated axe suite was run.
- No production-like branch upgrade from the exact live database snapshot was executed because the migration ledger is unsafe and the audit is read-only.
- No local candidate was deployed to Vercel; required server variables are missing and deployment would be a state-changing external action.
- E2E valid/empty/loading/error behavior is demo-driven; real Supabase permission-denied, offline/reconnect, and concurrent-write journeys remain incomplete.

## Module classification

| Classification | Modules | Direction |
|---|---|---|
| Core Asset | App pages/components, domain validators/RBAC, safe remote fetcher, public-only SW, local regression tests, runbook | Preserve, harden, and expand real integration coverage |
| Extract & Merge | Repeated modal implementations, presenter/projector shared controls, environment/deployment documentation, seed/demo fixtures | Consolidate into shared accessible primitives and one canonical operations path |
| Rebuild | Ownership/member lifecycle, cron machine-auth boundary, destructive maintenance, multi-step deletes, setlist bulk ordering, join approval | Implement as transactional, database-enforced workflows |
| Deprecate | Deployed insecure cleanup handler shape, title-based unseed, production magic demo-team mutation path, stale Render path if Vercel-only, legacy service-worker cache | Remove after replacement and migration/rollback plan |

## Prioritized remediation roadmap

1. **Security and data-integrity blockers**
   - Disable or replace the deployed cleanup and import routes before configuring a service-role key.
   - Enforce ownership transfer/last-owner invariants and constrain join requests.
   - Reconcile the migration ledger before applying any new migration.
   - Apply attendance and tenant-consistency hardening only as reviewed forward migrations.
   - Replace the deployed private-page service-worker cache.
2. **Broken production paths and release gates**
   - Repair verified cron routing, add required secrets through approved stores, commit reviewed CI/monitoring, deploy a preview, and make smoke checks mandatory.
   - Replace title-based unseed and add provenance tests.
   - Add real isolated two-user auth/RLS E2E.
3. **Reliability, accessibility, responsiveness, and performance**
   - Transactionalize destructive/bulk mutations; add body, item, timeout, and distributed rate limits.
   - Adopt an accessible dialog primitive, restore zoom, label controls, and run keyboard/axe/reflow tests.
   - Reduce Supabase performance-advisor findings with forward migrations after ledger repair.
4. **Maintainability and repository cleanup**
   - Choose a canonical deployment manifest, refresh runbooks/README, remove legacy scratch/dead artifacts, and split the dirty worktree into reviewable changes.

## Ship gate

Do not deploy the current working tree or add the production service-role key until AW-001 through AW-009 have an approved implementation, regression coverage, safe migration plan, preview verification, and passing production smoke checks. A score of 100 should mean all required evidence is green, not that unresolved or untested risk was hidden.
