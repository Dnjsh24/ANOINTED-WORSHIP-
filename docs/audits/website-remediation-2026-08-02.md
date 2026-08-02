# Website Remediation and Verification Report

Date: 2026-08-02

Scope: Next.js website, website APIs/actions, PWA, Supabase backend, CI, deployment configuration, and repository security. Electron desktop implementation is excluded.

## Outcome

All confirmed findings have a local code/configuration remediation and regression evidence. The local website release candidate passes every runnable quality gate. It is **not yet a production-ready 100/100 release** because seven reconciled forward migrations are unapplied, the code/CI is not pushed or deployed, and production still needs the service-role and Upstash variables before the guarded build can be released.

- Local verification gates: **100% complete**
- Current production smoke: **FAIL** (older deployment still active)
- Verdict: **DO NOT SHIP until the external release steps below are explicitly approved and pass**

## What was fixed and how it works

| Finding | Candidate status | Remediation |
|---|---|---|
| AW-001 | Fixed | Cleanup and scheduled-message jobs require constant-time cron bearer authentication, are admitted by the proxy only as exact verified machine routes, and perform bounded work. |
| AW-002 | Fixed | Owner rows are protected by database triggers and server guards. Ownership is transferred only through one locked transaction; the UI removes owner from generic role controls and presents a confirmed transfer workflow. |
| AW-003 | Fixed | Browser-session bypass is limited to the two exact machine routes with a valid secret; invalid, nested, and user-session-only requests do not bypass authentication. |
| AW-004 | Fixed locally | Remote version timestamps now map one-to-one. Applied pairing-history semantics were restored, the full chain resets cleanly, and new remediation remains forward-only. Seven migrations are pending production approval. |
| AW-005 | Fixed | Attendance and notification policies/triggers enforce active membership and same-team relationships. |
| AW-006 | Fixed | Remote HTML fetching enforces HTTPS allowlists, public DNS/IP resolution, redirect revalidation, timeouts, and streamed response caps. |
| AW-007 | Fixed | Service worker `public-v2` caches only the public shell and immutable public assets; authenticated documents and RSC payloads are never cached. |
| AW-008 | Fixed | Starter songs carry an explicit seed provenance marker; unseed deletes only marked rows, never user songs matched by title. |
| AW-009 | Fixed locally / release pending | CI, monitoring, production preflight, health and smoke checks exist; Vercel is the sole supported target. Missing production variables and undeployed workflows remain external release blockers. |
| AW-010 | Fixed | Join requests cannot ask for owner/admin or forge review state; approval/rejection is a locked transactional RPC that revalidates the role. |
| AW-011 | Fixed | Database triggers and bounded RPCs reject cross-team setlist/song/member, event-assignment/attendance, and dance-note references. |
| AW-012 | Fixed | Destructive and bulk operations use bounded transactional RPCs, including delete cascades, exact reorder coverage, bulk song adds, join review, leave-team, and read receipts. |
| AW-013 | Fixed | Request bodies are byte-capped while streaming; Spotify uses bounded queries, cached tokens, timeouts and response caps; backfill is batched; production rate limiting fails closed without the shared store. |
| AW-014 | Fixed | A real three-user local Supabase suite now exercises owner/admin/member RLS and tenant boundaries; production-like Playwright covers proxy/CSP/PWA/page behavior. |
| AW-015 | Fixed | Audited dialogs share focus trap, Escape, focus restore and scroll lock behavior; controls are semantic/labelled, zoom is unrestricted, and critical pages reflow at 320px. |
| AW-016 | Fixed | Per-request nonce CSP removes inline/eval scripts in production while permitting same-origin Next chunks; frame/object/base/form restrictions and standard security headers are verified against `next start`. |
| AW-017 | Fixed | Slide media accepts only PNG/JPEG/WebP up to 5 MiB, stores stable team/user object paths in a private bucket, validates settings strictly, and resolves short-lived signed URLs at render time. |
| AW-018 | Fixed locally | Vercel is canonical, the stale Render manifest and advisory text are removed, and the website runbook documents release, monitoring, incident, and rollback procedures. |

## Verification record

| Gate | Result |
|---|---|
| Normal production build | PASS |
| Production-like `next start` browser checks | 12/12 PASS |
| TypeScript | PASS |
| Website ESLint (`--max-warnings 0`) | PASS |
| Website unit tests | 255/255 PASS |
| Coverage | 84.84% statements / 81.32% branches / 89.47% functions / 87.85% lines |
| Full desktop/mobile Playwright matrix | 39 PASS / 3 intentional device skips / 0 failures |
| Local Supabase empty reset | PASS |
| Local multi-user Supabase security suite | 10/10 PASS |
| Rollback-only SQL security regression | PASS |
| Website database lint | PASS |
| Git/worktree secret scan | 0 findings |
| Production dependency audit | 0 vulnerabilities |
| Full dependency audit | 0 vulnerabilities |
| GitHub Actions syntax | PASS |
| Current deployed production smoke | FAIL — old deployment still active |

Detailed RED/GREEN evidence is in [website-audit-remediation.tdd.md](../testing/website-audit-remediation.tdd.md).

## External release steps still required

1. Approve applying all seven currently pending forward migrations to **ANOINTED WORSHIP 2**: `20260730063200`, `20260730063300`, `20260730063400`, `20260802000000`, `20260802010000`, `20260802020000`, and `20260802030000`.
2. Configure Vercel Production with `SUPABASE_SERVICE_ROLE_KEY`, `UPSTASH_REDIS_REST_URL`, and `UPSTASH_REDIS_REST_TOKEN`. Existing site/public Supabase, cron, and VAPID variables remain required.
3. Review and push the code/CI as a controlled release unit, deploy a preview, and repeat authenticated smoke checks.
4. Deploy production and require `/api/health`, CSP, `public-v2` service worker, login protection, critical authenticated journeys, and the scheduled monitor to pass.

No production data, migration, deployment, GitHub branch, or Vercel variable was changed during this remediation run.
