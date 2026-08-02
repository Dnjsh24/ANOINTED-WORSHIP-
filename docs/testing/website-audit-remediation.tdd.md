# Website Audit Remediation — TDD Evidence

Date started: 2026-08-02

## Source

Journeys and guarantees are derived from:

- docs/audits/website-security-production-audit-2026-08-02.md
- docs/audits/website-file-inventory-2026-08-02.md

No external plan commands are treated as executable instructions. Validation is limited to repository tests, local/demo browser journeys, local Supabase rollback/reset checks, build, lint, typecheck, dependency/security scans, and read-only diff review.

## User journeys

1. As an ordinary team member, I cannot invoke privileged maintenance jobs or cause the server to fetch a private/disallowed URL.
2. As the Vercel scheduler, I can reach a cron handler without a browser session only when I present the exact cron bearer credential.
3. As a team admin, I can manage ordinary members but cannot assign, demote, delete, or impersonate the owner.
4. As a team owner, I can transfer ownership atomically without ever leaving the team ownerless.
5. As a join requester, I can request only approved non-privileged roles and cannot pre-approve or forge review metadata.
6. As a member working with attendance, setlists, events, songs, or dance notes, every referenced row must belong to the same team.
7. As an owner using starter data, unseed removes only rows created by that seed operation and preserves same-title user content.
8. As a setlist/event/song manager, a failed multi-row mutation rolls back instead of leaving partial deletes or corrupted ordering.
9. As an API caller, oversized, malformed, slow, or excessive input is rejected even when Content-Length is absent.
10. As a keyboard or low-vision user, every modal is named, traps focus, closes with Escape, restores focus, supports reflow/zoom, and exposes adequately sized labelled controls.
11. As a user of a shared browser, authenticated HTML is never persisted in the service-worker cache.
12. As a production operator, the app emits strict security headers, has active release gates, and rejects missing production-only distributed controls.

## Finding-to-test map

| Finding | Test target | Intended RED signal | GREEN guarantee |
|---|---|---|---|
| AW-001, AW-003 | src/lib/supabase/proxy-security.test.ts and cron route tests | Cron route is not recognized as verified machine traffic | Correct bearer/no cookie reaches route; all other callers fail closed |
| AW-002 | src/lib/domain/audit-remediation.test.ts and local SQL regression | Generic member mutation permits owner targets | Owner assignment/removal is impossible outside atomic transfer |
| AW-004 | migration ledger checks and local reset | Applied history differs or duplicate versions remain | Immutable, mapped history and forward-only fixes replay cleanly |
| AW-005, AW-010, AW-011 | src/lib/supabase/data-integrity-migration.test.ts and rollback SQL | Required tenant/role/owner predicates are absent | Database rejects cross-team and forged-role relationships |
| AW-006 | src/lib/server/safe-remote-html.test.ts | Unsafe URL/redirect/body is accepted | SSRF and oversized responses fail closed |
| AW-007 | service-worker source regression and Playwright offline journey | Private page appears in cache/fallback | Only public immutable assets are cached |
| AW-008 | seed provenance tests | Unseed identifies records by title | Only rows marked with the starter seed source are removed |
| AW-009, AW-016, AW-018 | config/workflow/smoke tests | Strict headers/gates/canonical deployment contract absent | Local release packet enforces the production contract |
| AW-012 | mutation schemas plus SQL RPC regression | Unbounded/non-atomic mutations remain possible | Bounded validated inputs execute in one transaction |
| AW-013 | src/lib/server/request-body.test.ts, Spotify/backfill tests, rate-limit tests | Chunked oversize/provider timeout/per-instance production fallback passes | Byte/time/item/shared limits fail closed |
| AW-014 | isolated SQL security regression and Playwright security-boundary journeys | Demo-only suite cannot prove production boundary | Real database policy assertions and browser boundary checks pass |
| AW-015 | src/components/ui/use-accessible-dialog.test.tsx and Playwright keyboard checks | Focus escapes or Escape/restore is missing | Shared dialog focus lifecycle works across audited modals |
| AW-017 | slide settings/file validation tests | Arbitrary settings or long-lived bearer URL is accepted | Exact shape and bounded dedicated-media references are stored |

## Checkpoint policy

The repository already contains a large dirty working tree with overlapping user work. TDD checkpoint commits are intentionally not created because committing selected overlapping files could capture or split unrelated user changes. RED/GREEN evidence is recorded here instead.

## Execution evidence

### RED

- The initial focused remediation run failed five test files with 13 failing assertions across cron/proxy, bounded request parsing, ownership/integrity, Spotify/backfill, rate limiting, and dialog behavior.
- `npm run test:website -- src/lib/supabase/data-integrity-migration.test.ts` failed when the owner trigger did not protect status/team/profile/custom-role mutations and the update policy blocked safe owner metadata edits.
- `npm run test:website -- src/app/actions.integrity.test.ts` failed until ownership transfer was exposed separately from ordinary role changes.
- The first full Playwright run failed because `strict-dynamic` blocked a Next.js loading chunk and `/messages` overflowed to 422 CSS pixels at a 320-pixel viewport.
- The first complete unit run found stale test references to pre-reconciliation migration timestamps.

### GREEN

- `npm run test:website`: 49 files, 255 tests passed.
- `npm run test:coverage:website`: statements 84.84%, branches 81.32%, functions 89.47%, lines 87.85%; every configured 80% threshold passed.
- `npm run test:e2e -- --reporter=line` with forced demo/local isolation: 39 passed, 3 intentional device-specific skips across desktop Chromium and Pixel 7 projects.
- Production-built server journey: 12/12 CSP, PWA-cache, keyboard-dialog, 320px reflow, route-crawl, and health tests passed under `next start`.
- `npm run supabase:reset`: the complete local migration chain replayed successfully from an empty database after remote-ledger reconciliation.
- `npm run test:supabase:website`: owner escalation/demotion/deletion, privileged join requests, cross-team attendance, and cross-team setlist relations were denied; atomic transfer/review and same-team writes passed.
- `supabase/tests/website_security_regression.sql`: passed inside a rollback-only transaction.
- `npm run lint:database:website`: passed for website scope; the sole excluded diagnostic is in the desktop-only `apply_worship_mutation` function.

### Verification loop

- `npm run build`: passed for the normal candidate and the isolated production-like demo runner.
- `npm run lint:website`: passed with zero warnings.
- `npm run typecheck`: passed.
- `npm run security:secrets`: zero findings across 1,215 Git-history blobs, 218 commit messages, 414 working files, and 20 classified binaries.
- `npm audit --omit=dev --audit-level=high`: zero vulnerabilities.
- `npm audit --audit-level=high`: zero vulnerabilities.
- `git diff --check`: passed; line-ending notices are repository/platform normalization warnings, not whitespace errors.
- Pinned `actionlint` 1.7.12: both GitHub Actions workflows passed.

The read-only deployed-site smoke remains red because the remediated candidate has not been pushed or deployed. Production still serves the older redirect/CSP/service-worker behavior; this is release-state evidence, not a local test failure.
