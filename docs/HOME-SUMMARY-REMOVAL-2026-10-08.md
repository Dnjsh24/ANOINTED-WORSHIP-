# Home personal summary removal

User request: remove the screenshot's combined “Your next service” and “Open service reminders” panel from the hosted website Home page.

## Source and scope

The current chat checkout at `4cff705` does not contain this panel. Exact text and plain dark styling match `C:/Users/danje/orca/workspaces/Anointed worship setlist - Copy/Fixing-things`, branch `Dn-Jsh/Fixing-things`, baseline `25058c2fa67c636d7d000b2be35c40d4a27c01df`. That checkout was clean before this change. Both the coordinator and independent reviewer Laura confirmed the source match. No project brief was present.

Changed files in that checkout:

- `src/app/dashboard/page.tsx`: remove DashboardPersonalSummary import/render, panel-only locals, personal preparation RPC/mapping and per-event RSVP query. Retain next-event team/member restrictions, the main service hero, statistics and separate reminders card.
- `src/app/dashboard/page.performance.test.tsx`: update owner/member expectations to assert no personal preparation RPC or per-event RSVP query; request count drops from 12 to 10.
- `e2e/screenshot-fixes.spec.ts`: replace the old panel-presence assertion with Home visibility and absence of both panel headings.

No authorization, schema, storage, caching policy, offline behavior, dependencies or environment configuration changed. No migration is needed. No push, commit, deployment, credentials or hosted resources were changed. This is a local website change; live activation remains outside the requested local edit.

## Verification

- `npx --no-install eslint src/app/dashboard/page.tsx src/app/dashboard/page.performance.test.tsx e2e/screenshot-fixes.spec.ts --max-warnings 0`: passed, exit 0.
- `npx --no-install tsc --noEmit --incremental false`: passed, exit 0.
- `npx --no-install vitest run --config vitest.website.config.ts src/app/dashboard/page.performance.test.tsx`: passed, one file and two tests (owner/member).
- `git -c core.fsmonitor=false diff --check`: passed.
- `E2E_FORCE_DEMO=1 NEXT_PUBLIC_E2E_FORCE_DEMO=1 npm run build` (process-local PowerShell environment): passed on retry, exit 0; Next.js 16.3.8 webpack compilation, TypeScript, all 45 static pages and tracing completed. First attempt failed with `ENOSPC` while writing webpack cache. Only this checkout's resolved `.next/cache/webpack` directory was removed after verifying containment.
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3221 E2E_FORCE_DEMO=1 npx --no-install playwright test e2e/screenshot-fixes.spec.ts --grep 'home omits' --project chromium --project mobile --reporter list`: passed two tests against the new local production-demo build. Both desktop Chromium and Pixel 7 confirm Home renders, summary region and reminder heading are absent, and current-page navigation remains correct. Remote Supabase/font requests were blocked by the existing test setup.
- Full unit coverage: N/A; no new branch or business logic, existing request-boundary regressions are the affected unit checks.

Laura independently reviewed the actual three-file diff and accepted it without findings. She verified preserved next-event authorization filters, unchanged statistics/reminders, no dangling accessible references, and whitespace. She did not independently rerun coordinator tests.

Reviewed SHA-256 identities:

| File | SHA-256 |
| --- | --- |
| src/app/dashboard/page.tsx | 6509A98EBF6FC488EC2110DBFBA848AB8E24487A3EEC1A10F41AB6851E29B3FA |
| src/app/dashboard/page.performance.test.tsx | AD2B3B3C68138F1B786892351888171A20F9F229A3F425805945593AF01F9964 |
| e2e/screenshot-fixes.spec.ts | 6708B6A59E9D5B334BBB2C59C09F4D8CB3F63A236EF900FB8C7BC2B7ED31235C |

## Relevant engineering gates

Gates 01–12: passed. Intake/acceptance and local-only action boundaries are recorded above; coordinator owns three source/test files and ticket/evidence updates, Laura owns read-only review. This low-risk deletion is not gold lane. No ticket dependencies. Repository navigation and installed Next.js page guidance were read before editing. Data flow, query boundaries, component caller and existing tests were inspected.

Gate 13: N/A; one implementer, no parallel implementation. Gates 14–22: passed for applicable scope. Caveman, Ponytail, engineering-gates and completion-mandate loaded; style/types retained, removed variables remain descriptive in surviving code, no new duplication/module/SSR/hydration or trust boundary. Existing errors/validation retained. Gates 23–29: N/A; no data/schema/RLS mutation.

Gates 30–34: passed by build, lint, typecheck, affected unit and desktop/mobile browser commands above. Gates 35–36: passed by scoped dependency/security/accessibility diff review; no dependency changes and no new controls. Gate 37: passed; every acceptance criterion is met by the final candidate and recorded evidence. The engineering-gates skill has no global-checks script in its installed directory; available project commands were used directly. No unperformed check is claimed passed.

HOME-01 is Done for the local implementation, 1/1. No local acceptance blockers remain. Hosted activation requires separately authorized publication/deployment; it is not claimed here.


## Push authorization and pre-push verification

On 2026-10-08 the user explicitly requested pushing HOME-01. Authorized scope is the three reviewed source/test files, this validation record and its existing ticket record, on origin/Dn-Jsh/Fixing-things. Direct production deployment remains separate. Remote baseline was verified as 25058c2fa67c636d7d000b2be35c40d4a27c01df. Reviewed source SHA-256 values remain unchanged. Scoped diff whitespace passed. npm run security:secrets passed with zero findings (586 working files, 2,278 history blobs, 347 commit messages; three pre-existing oversized historical blobs skipped). npm audit --omit=dev reports zero vulnerabilities; full npm audit exits 1 with five pre-existing high development-tooling findings in the eslint-config-next/braces dependency chain. No dependency or credential configuration was changed. Normal commit/push and remote identity verification follow these checks; the push result is reported separately.
