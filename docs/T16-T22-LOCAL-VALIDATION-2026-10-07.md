# Website milestone local validation — 2026-10-07

The integrated candidate starts from `0cdbfc5ee131172e30033ca14461c79602b39ece`. The coordinator owns integration and ticket closure. Independent Juan architecture and Laura QA reviews passed the final affected database and caller candidate. Final Node 22 lint, typecheck, unit coverage, optimized build, production browser checks, measured performance fixtures, secret scan and whitespace checks passed. T16-T20 and T22 are Done as local implementations; T21 and T08 remain Testing for actual provider/live release verification. Project count is 20/22, milestone count 6/7. No deployment is claimed.

## Acceptance mapping

| Ticket | Implemented outcome | Meaningful local evidence |
| --- | --- | --- |
| T16 | Event/assignment saves are transactional; attendance uses member identity; stale saves conflict; setlist entries retain occurrence IDs and annotations | Event/setlist domain/action/loader tests, PostgreSQL rollback/tenant/custom-grant tests, native CAS/member/deletion races, full-chain authenticated workspace smoke |
| T17 | Inbox previews and cursor history are bounded; retry/reconnect preserve drafts and realtime state; full-library search/sort precedes pagination; dashboard shows personal assignments/checks | Messages HTTP loader and realtime tests, message/search PostgreSQL fixtures, personal-summary tests, browser history journeys and Messages/Songs/Setlists benchmarks |
| T18 | Shared rehearsal allocations and ten assigned checks persist; own readiness is separate from session practice | Workflow domain/action/component tests, preparation PostgreSQL denial/stale/reassignment tests, native parent deletion and readiness eligibility races |
| T19 | Saved service order includes entry types, timing, responsibility, cues and required roles | Workflow proposal/action/component tests, service-order persistence/approval/tenant tests, approved event loader tests |
| T20 | Assignment confirmation remains separate from availability; missing roles and rehearsal/service overlaps are visible | Event workflow/conflict-route tests, assignment response tests, preparation PostgreSQL authorization/rollback checks |
| T22 | Active members add songs; creators/admins edit; other song edits require owner/admin review; other proposals use content permissions; self-approval and stale overwrites are denied | Song/request/action/UI tests, request PostgreSQL decision/nonce/withdrawal/stale/tenant tests, native authorization waits, unpublished sync privacy and creator tombstone/explicit restore regression |
| T21 | Integrated performance, accessibility and release verification | Local website checks, independent reviews, native migration replay and measured fixture benchmarks; actual provider/live release checks remain pending |

Affected routes include `/dashboard`, `/messages`, `/songs`, `/setlists`, `/events`, setlist details/Practice, event details, `/requests` and `/requests/new`. Website Presenter settings and assigned-key saves use checked RPCs after raw workspace writes were revoked. Existing desktop persistence remains unchanged.

## Final checks

| Check | Command / evidence | Result |
| --- | --- | --- |
| Unit tests and configured coverage, Node 22.23.3 | `npm run test:coverage:website -- --maxWorkers=2` | Passed: 99 files / 476 tests; statements 87.34%, branches 83.25%, functions 92.4%, lines 90.41% |
| Website lint | `npm run lint:website` | Passed: zero warnings |
| TypeScript | `npm run typecheck` | Passed |
| Optimized build | `E2E_FORCE_DEMO=1 NEXT_PUBLIC_E2E_FORCE_DEMO=1 npm run build` | Passed on Node 22.23.3; 45 static pages generated |
| Production browser journeys | `E2E_FORCE_DEMO=1 E2E_PRODUCTION_BUILD=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3111 npx playwright test --reporter=line` | Passed: 65 tests, 3 existing platform-specific skips; all 42 smoke routes on desktop/mobile; 2.7 minutes |
| Native database behavior | `node scripts/test-workflow-concurrency.mjs`, PostgreSQL 18.4 | Independent Laura pass: 49 behavior groups plus summary |
| Scoped database suites | Preparation, shared edits and event/setlist PGlite harnesses | Independent Laura pass; earlier message paging and full-library setlist search harnesses also passed |
| Application migration chain | `node scripts/test-migration-chain-postgres.mjs` | Coordinator and independent Laura pass: 76 chronological migrations and 65 prerequisites plus exact 11-file manual transaction; authenticated smoke and privilege assertions |
| Production dependency audit | `npm audit --omit=dev --audit-level=high --json` | Passed: zero vulnerabilities |
| Full tooling audit | `npm audit --json` | Failed: five pre-existing high development dependency findings; suggested Next lint downgrade is incompatible |
| Secret/whitespace checks | `npm run security:secrets`; `git -c core.safecrlf=false diff --check` | Passed: 541 working files, 1,964 history blobs and 328 commit messages; no findings. Three historical oversized blobs excluded; no oversized working files skipped |

Coverage measures the deterministic surface configured in `vitest.website.config.ts`, not all UI or SQL. Node 24.15.0 also passed 99 files / 476 tests. The first Node 22 run failed three imports because Vite attempted to bundle desktop SQLite. Three existing website suites now mock the unrelated desktop workspace locally; all original website assertions remain. The affected eight tests and independent Laura review/lint passed before the successful full Node 22 rerun. No dependency, desktop source or global runtime configuration was changed for this correction.

The [migration replay report](T21-MIGRATION-CHAIN-2026-10-07.md) documents exact SQL identities, local provider prerequisites and the sole in-memory `pg_net` adaptation. It proves application DDL and smoke behavior against those prerequisites. It does not prove Supabase Auth, Storage, Realtime, HTTP-extension services, provider lint or deployed migration history.

Seven alternating measured browser pairs, after an excluded warmup, exceed the 25% target on every measured fixture route. Messages inbox medians improve 96.6% desktop / 84.4% phone; first-conversation journeys improve 92.5% / 82.2%. Songs improve 90.3% / 61.6%; Setlists improve 90.1% / 71.3%. Actual query/page/render counts and search beyond the first page are asserted. Both suites were refreshed after the final Node 22 build against stylesheet SHA-256 `723946d93dfe8ce4c45136787774e58f931cfa279445e03410b59ec26e58f4b3`; application and benchmark source identities are unchanged. See the [Messages report](T21-MESSAGES-BROWSER-BENCHMARK-2026-10-07.md) and [listing report](T21-LISTINGS-BROWSER-BENCHMARK-2026-10-07.md), with raw samples and source hashes. These are synthetic HTTP fixture/React commit measurements, not deployed Next.js route latency or browser paint.

## Engineering gates

| Gates | Disposition and evidence |
| --- | --- |
| 01–06: outcome, criteria, constraints, risk, dependencies, owner | Passed locally: approved plan, acceptance mapping and project ticket source |
| 07–12: conventions, architecture, contracts, ownership, data flow, verification | Passed locally: root navigation/installed Next guides, isolated ownership packets, checked RPC/type contracts and independent gold reviews |
| 13: isolated parallel implementation | Passed: independent candidates used isolated ignored worktrees; coordinator integrated owned files; final test correction had one writer |
| 14–18: skills, style, types, naming, reuse | Passed for reviewed work: required installed guidance, strict TypeScript/lint, existing actions/components/SQL patterns; no new project dependency |
| 19–20: route splitting, SSR/hydration | Passed locally: independent review, optimized build and production desktop/mobile runtime checks |
| 21–22: boundary validation and error handling | Passed locally: bounded typed proposals, actor-derived identity, retained draft/nonce, conflict/error regressions and authorization wait rechecks |
| 23: deployed schema/code compatibility | Local contracts and ordered rollout reviewed; actual deployed prerequisites/history remain unverified. Legacy linked-event sync without eventRevision safely conflicts |
| 24: recovery | Plan recorded: backup and prerequisite/history inspection, one-time transaction, forward fixes, migration-history reconciliation and compatible application rollout |
| 25: constraints, indexes, volume | Passed locally: chain replay, pagination/search fixtures and full-size browser benchmarks. Checked writes serialize within one team; role/member locking grows with team size |
| 26–29: SELECT/INSERT/UPDATE/DELETE boundaries | Native/scoped local denial and rollback checks passed; actual Supabase provider/service validation remains pending |
| 30–32: build, typecheck, lint | Passed on Node 22.23.3; optimized forced-demo build, website lint with zero warnings and typecheck |
| 33: unit/integration | Passed: 476 tests, meaningful PostgreSQL suites and independent concurrency/migration replay |
| 34: end-to-end | Passed locally: 65 production demo browser tests, 3 existing platform-specific skips; no authenticated live claim |
| 35: security/dependencies | Independent scope review, production audit and final secret scan passed; full development audit remains failed with five high tooling findings |
| 36: accessibility | Passed for affected local checks: keyboard/touch, focus trap/Escape/restore, 320-pixel reflow/zoom and accessible component assertions. No full WCAG certification is claimed |
| 37: final diff/every criterion | Passed for local implementation: final reviewed source identities, acceptance mapping and check results recorded. Actual provider/deployment acceptance remains in T21 |

## Release boundary

The eleven new migrations and `supabase/manual/20261006_team_workflows.sql` are unapplied. Bundle SHA-256 is `e28dbc07fd2d710651457ce819a75126a8621b3b47c5b4e8edcbea8e3d0f7931`. It requires the preceding repository schema and must not be rerun blindly. SQL Editor execution does not register CLI migration versions. Migration application must precede publishing the new RPC-dependent website; review old-client write compatibility and prepare a forward recovery plan. Rebuild without both demo flags and validate injected production configuration before deployment; this forced-demo test artifact is not a production release.

No new production environment variables or paid services are required. No new private offline cache is introduced. Shared mutations require connectivity; failed writes preserve drafts. Live migration inspection for confirmed project `xvrndwkghxkqsvxxtqym` still returns permission denied. Docker's daemon is unavailable, so actual local Supabase provider lint/security cannot run; native application replay and scoped denial tests are explicit alternatives, not a provider pass. Fresh CI installation, actual provider checks, authenticated live journeys and production health/smoke remain release requirements under the operations runbook. No commit, push, remote migration, deployment or credential change occurred.


Publication refresh ? 2026-10-08: eight whitespace-only lines were removed from the unapplied shared-edit migration and its exact manual-bundle copy. No SQL tokens changed. A fresh `node scripts/test-migration-chain-postgres.mjs` passed both all-76 chronological application and 65-prerequisite-plus-11-file manual-bundle replay with authenticated smoke/privilege assertions on PostgreSQL 18.4. The current raw replay evidence contains the refreshed source/bundle hashes and the old/new formatting identities. Application source and prior website validation remain unchanged. Provider/live release checks remain separate.
