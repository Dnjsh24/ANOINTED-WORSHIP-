# Wooly page guides — WOOLY-11

2026-10-11. Local implementation complete; final integration acceptance remains in Review. No production activation, deployment, push, remote database change, or separate desktop implementation is included.

## Behavior

Every rendered website page has an on-demand guide: 42 guides cover the current 45 `page.tsx` routes; three website redirect routes use their destination's guide. Open **Help with Wooly**, then **Show me this page**. Wooly uses a complete pointing picture, highlights the current control and draws a connector when the panel and target do not overlap. Explanations appear as typed text. Users can pause typing or show the full text immediately; Back, Next, Skip, close/pause, resume and replay remain available.

The local preview at `http://127.0.0.1:3194/` has a **Choose a page** selector below the animation gallery. Select a page, then use **Try tutorial panel** and **Show me this page**. Its controls are explicitly labeled samples and cannot change an account or team. The existing preview server, PID17016, was confirmed listening outside the sandbox and preserved. The failed sandbox launcher did not replace it. This confirms process availability, not browser behavior.

The guide inventory is recorded in [routes.md](../output/wooly-page-guides/routes.md). It covers welcome/login, team choice/join/create/pending, Home, setlist list/new/edit/templates/details/song picker/practice/stage/projector/confidence, song list/new/edit/chart/trash, Timeline/new/edit/details, Messages, Profile, announcements, reminders, dance list/edit/details, members/invite/requests/details, Analytics, Settings, sync, Worship Remote pairing and remote sessions.

## Design and accessibility

The ivory/lavender/violet mascot and charcoal panels match the existing website. New pointing art is a complete drawing based on the approved reference. Three hooves remain planted and one attached front limb points; the character still has four limbs. Only the whole picture is mirrored to point right. Existing standing speech, waving, listening/nodding and walking artwork, interpolation and 30fps timing are preserved.

Desktop panels sit beside targets where space permits. Phone tutorial sheets have a smaller height limit, and targets scroll to the top with a 1rem margin rather than behind the sheet. Large/fixed targets can overlap the panel; the connector is then omitted. Missing, hidden or conditional controls show a plain explanation without a spotlight. Spotlight and connector do not intercept clicks. Wooly never fills or submits a real form.

The complete instruction is announced once through a polite, atomic screen-reader status. Per-character visible text and mascot images are decorative. Reduced motion shows the full instruction immediately and preserves the existing static mascot fallback. Typing controls remain mounted when typing finishes, retaining keyboard focus. Buttons have visible focus and 44px targets. Escape closes or pauses; modal help retains the existing focus trap and restoration. Tutorial keyboard events do not trigger presentation shortcuts. Existing bug-report/external dialogs pause Wooly.

Projector, confidence and cloud remote session screens show no Wooly UI unless explicitly opened with `?wooly=1`. Setlist details provide Projector guide and Confidence guide links. Cloud remote has an opt-in Help link when the feature is enabled. Query removal hides the entire panel and spotlight immediately, and pauses the active guide. The desktop remote defaults to no Help link.

## Contracts and account progress

`src/lib/domain/wooly-page-guides.ts` holds the page catalog. Steps declare a route, stable `data-wooly-target`, short prepared explanation, pose and optional permission. Static routes win over parameter routes. Dynamic guides bind to the actual record already open; production navigation never invents record IDs. The route inventory regression fails if a new page lacks a guide or explicit redirect classification.

`WoolyTeamScreen` receives server-resolved identity and the existing effective RBAC permissions, including role overrides and explicit custom grants. Restricted guides and action steps use those permissions. Removing permission pauses a now-inaccessible step. Help is descriptive; existing server/page/action authorization remains authoritative. Public pages register guest context and make no account progress reads or writes. Demo previews also avoid account persistence.

Original joining, creation and essentials tour IDs and invitation behavior remain. Page guides are optional and do not add automatic invitations. Authenticated page checkpoints use the existing validated server actions and own-profile progress table. Step IDs, rather than filtered step indices, are saved, so permission changes do not shift a saved step's meaning. Close and unexpected navigation pause; changing tours preserves a checkpoint. A dynamic guide resumed on another record explains that currently open record. Terminal completion/skipping remains protected by the existing database trigger. Failed saves leave guidance usable with a retry control.

The forward migration `supabase/migrations/20261011010000_wooly_page_guides.sql` extends only the valid tour/step CHECK constraint. It preserves the existing table, grants, own-user RLS, terminal-state trigger and version 1. No database type change is needed because the existing columns are text. The catalog/migration test compares every declared step against the SQL allowlist.

Apply the original progress-table migration and this forward migration before enabling `WOOLY_TUTORIAL_ENABLED=1`. Neither has been applied by this task. The flag remains off. Deployment and remote database changes still need separate authorization. A code rollback may leave the expanded CHECK constraint in place: it is a compatible superset for old tour IDs. Do not restore the old restrictive constraint while new page-guide rows exist; use a reviewed forward migration if the catalog changes. Do not reset the database to roll back a tutorial.

## Verification record

Final exact results and command logs are under `output/wooly-page-guides`. The recorded current file hashes are in `candidate-manifest.json`; those snapshots include preserved earlier changes and are not a task-only diff.

- Focused tests pass: 13 files, 95 tests. Aggregate coverage passes the existing 80% thresholds: statements 91.77%, branches 87.53%, functions 88.94%, lines 97.46%. Tests exercise route coverage, real stable targets, checkpoint validation, permissions, guest isolation, save failure/retry, route handoff, replay/resume, live-output opt-in, keyboard shortcuts, typing/focus/reduced motion, pointer geometry/resize/cleanup, mascot resource lifecycle and authenticated server actions.
- Source-scoped TypeScript uses `.tmp/wooly/tsconfig.json`: all current `src`, website E2E/config source, and existing declarations; backup `output` and the separate mobile project are excluded. This avoids unrelated duplicate desktop declarations in archived candidates.
- Strict lint covers new Wooly modules/catalog/tests and shared changed APIs. The wider touched-surface lint reports zero errors and 11 existing warnings in login, pending and profile code. The relevant diffs confirm those warned statements were not changed by this task.
- The isolated Vite preview production build passes, including the final phone controller/CSS change. Full Next.js compilation passed in 51 seconds outside the sandbox before the final phone/target refinements, then its global TypeScript phase failed on archived candidate and desktop declaration conflicts. The standard root typecheck has the same backup conflicts. Final current-source checks cover the refinements; a complete production build is not claimed. No unrelated desktop or archive code was altered to suppress them.
- The complete website suite passes outside the sandbox: **117 files, 604 tests**, exit 0, including the Supabase lint-classifier tests. Its unchanged 80% aggregate coverage thresholds pass: statements **88.62%**, branches **84.45%**, functions **93.84%**, lines **91.27%**. The initial sandbox run passed 592 tests but could not load the classifier suite because of CLI path resolution; the successful full repeat supersedes that environment failure. Log/report: `website-coverage.log` and `website-coverage/`.
- Full `npm run lint:website` stops on the existing configuration error: rule `react-hooks/immutability` is applied to files without its plugin. No lint rule or threshold was weakened.
- Runtime Supabase security checks could not start: Docker Desktop's Linux engine pipe is unavailable. Static SQL own-account RLS/grant/trigger checks and authenticated action tests pass; actual two-account, pre-membership and unauthenticated database behavior is unverified. No migration was applied.
- The existing browser automation policy restriction remains. No browser tool, CDP, shell browser or alternate UI access workaround was used. DOM/native checks and a listening preview are not desktop/mobile E2E, screen-reader device or physical frame-rate evidence.

Laura's partial independent review found two defects: an open panel could carry onto an ordinary live-output page, and typing completion could remove the focused control. Both were repaired and regression tested. The final review then stopped at the account usage limit. There is no final independent approval for WOOLY-11. Maya completed the read-only route/control and wording audit. The coordinator performed final local source/artifact review; that does not replace independent QA.

Reproduce the final focused checks from the repository root. Set `TEMP` and `TMP` to the existing repository `.tmp` directory only in the disposable test shell, as done for the recorded run.

```powershell
npx vitest run --config vitest.website.config.ts src/components/wooly src/lib/domain/wooly.test.ts src/lib/domain/wooly-page-guides.test.ts src/app/wooly-actions.test.ts src/lib/supabase/wooly-migration.test.ts --exclude 'output/**' --exclude '.tmp/**' --maxWorkers=2 --coverage '--coverage.include=src/components/wooly/*.ts*' --coverage.include=src/lib/domain/wooly.ts --coverage.include=src/lib/domain/wooly-page-guides.ts --coverage.include=src/app/wooly-actions.ts --coverage.reportsDirectory=output/wooly-page-guides/coverage
npx tsc --noEmit --project .tmp/wooly/tsconfig.json
npx eslint src/components/wooly src/lib/domain/wooly.ts src/lib/domain/wooly-page-guides.ts src/lib/domain/wooly-page-guides.test.ts src/lib/domain/wooly.test.ts src/lib/supabase/wooly-migration.test.ts src/components/action-form.tsx src/components/search-box.tsx src/components/app-shell.tsx src/app/worship-remote/layout.tsx --max-warnings=0
node output/wooly-animation/build.mjs
```

The standard checks attempted were `npm run build`, `npm run typecheck`, `npm run lint:website`, `node scripts/test-wooly-security.mjs`, and the full website unit/coverage command below. Initial sandbox failures were distinguished from code failures: outside-sandbox build compilation succeeds, but archived TypeScript conflicts remain; outside-sandbox local database checks reach the CLI but Docker is unavailable. No approval review rejected these local verification commands.

```powershell
npx vitest run --config vitest.website.config.ts --exclude 'output/**' --exclude '.tmp/**' --maxWorkers=2 --coverage --coverage.reportsDirectory=output/wooly-page-guides/website-coverage
```

Artwork QA: native composition on `#18171c` shows the full figure, three planted hooves, one attached pointing limb and no white rectangle or cropped part. The original animation atlas SHA256 remains `a188ec1a1179edb7cb90bcd04ed9bc47a9cc7c65f86728f1caa8595465559cb1`. New pointing WebP SHA256: `c3217db8cc3c744bc07f60619b94bf40150478d984247d323ee57a35011da382`. The generation brief, original PNG and native themed render are retained under `output/wooly-page-guides`.

Final target review moved the Messages writing target from the conditional Send button to the text input. The target now exists with an empty draft. This attribute-only change followed the full suite; the affected catalog/target tests and strict Messages lint were rerun, and the final source typecheck was repeated. It changes no send action, state, permissions or event handler. Scoped diff whitespace check passes. Candidate hashes were refreshed after the target correction.

## Engineering gates

The engineering-gates and completion-mandate skills were applied. The available engineering-gates package contains no global-check script, so the repository's scripts and scoped alternatives were used. This is a Standard-lane feature; gold-lane dual review does not apply. Effective coordinator/specialist effort and usage telemetry are unavailable, not zero. Maya/Laura's prior role settings were retained; no new specialist was launched after the usage limit.

| Gate | Result and evidence |
| --- | --- |
| 01–06 Intake, criteria, boundaries, risk, dependencies, owner | Pass: WOOLY-11 in tickets.md; outcome, route count, permissions, feature flag and migration dependencies above. Coordinator owns implementation and evidence. |
| 07–12 Conventions, blast radius, contracts, ownership, data flow, verification | Pass: navigation guide, installed Next documentation, existing provider/RBAC/actions/RLS and page controls inspected. Catalog/target boundary and checks documented above. Maya audit is read-only. |
| 13 Parallel implementation isolation | N/A: one implementation owner; specialists did read-only audit/review. |
| 14–18 Skills, style, types, naming, duplication | Pass locally: project-required guidance and clean TypeScript/minimal-change guidance applied; typed catalog and shared controller reused. Source types and strict new-code lint are settlement checks. |
| 19 Route/bundle splitting | Pass locally: catalog is prepared text, existing controller reused; no added dependency/service. Dynamic records retain real routes. Preview client build passes. Production bundle compilation passes; global build gate remains incomplete. |
| 20 SSR/hydration | Pass locally: provider is client-only; existing root `headers()` keeps rendering dynamic for `useSearchParams`; server-resolved team context crosses a typed boundary. Mounted portal and reduced-motion server snapshot retained. Production compilation/source typecheck pass. |
| 21–22 Validation and failure handling | Pass: catalog rejects unknown tours/steps/placeholders; save retry, missing targets, unexpected navigation and changed permissions have regressions. |
| 23–25 Migration compatibility, recovery, constraints/volume | Pass source review: append-only CHECK extension, old IDs/version retained, existing keys/indexes unchanged; at most one row/profile/tour/version. Recovery described above. Migration remains unapplied. |
| 26–29 RLS SELECT/INSERT/UPDATE/DELETE | Partial: unchanged own-user policies and denied mutation/grant assertions pass statically. Runtime two-account/anonymous isolation blocked by unavailable Docker. |
| 30 Build | Partial: Vite preview and full Next compilation pass; production TypeScript phase fails on existing backup/desktop conflicts. |
| 31 Typecheck | Partial: current-source check passes; standard root command fails on archived candidate and duplicate desktop declarations. |
| 32 Lint | Partial: strict new-code check passes; touched surfaces have 11 unchanged warnings; full script stops on existing plugin configuration. |
| 33 Unit/integration | Pass locally: 95 focused tests and 604 full website tests; both unchanged aggregate coverage gates pass. Final attribute-only target correction has affected checks repeated. Real database integration remains unverified. |
| 34 E2E | Unverified: existing browser policy restriction; no workaround. Local DOM/native checks are alternatives, not an E2E pass. |
| 35 Security/dependencies | Pass source scope: no new package/service/credentials, no change to write authorization, RLS or grants. Checkpoints validated and guests do not persist. Runtime DB isolation remains covered by gates 26–29, not waived. |
| 36 Accessibility | Partial: keyboard/focus/live-region/reduced-motion/typing and 44px controls checked locally; phone scroll regression added. Real screen-reader and narrow-device visual checks remain unverified. |
| 37 Final diff/evidence and independent review | Local source/artifact review and candidate hashes recorded. Final independent review blocked by account usage limit; ticket remains Review. |

## Remaining acceptance

Finish independent review of the recorded candidate, run allowed desktop/mobile and screen-reader checks, and run runtime security checks against a migrated local Supabase. Resolve the unrelated root build/lint/type conflicts before release. Remote migration, feature activation and deployment remain a separate approved action. Local implementation is reviewable; the ticket is not marked Done while these gates are outstanding.
