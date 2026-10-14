# Wooly tutorial companion

Wooly provides optional joining, team-creation and essentials tours, plus prepared searchable help. The five transparent poses live in `public/brand/wooly`. No AI or speech service is used. Tutorial controls never submit the team, invitation, profile or presentation forms.

The later user-requested character animation is implemented locally as WOOLY-02. See [animation preview, verification and provenance](WOOLY-ANIMATION.md). It adds blinking, mouth shapes, a hoof wave, listening mode and a pause control; activation requirements below still apply.

## Activation and recovery

The website feature is **off by default**. Apply `supabase/migrations/20261009010000_wooly_tutorial_progress.sql` before setting `WOOLY_TUTORIAL_ENABLED=1` in the website deployment environment. Remote migration and deployment need separate authorization and have not been performed. Desktop runtime explicitly disables the provider.

The migration adds `public.wooly_tutorial_progress`, namespaced to avoid collisions with other tutorials. Its primary key is `(profile_id, tour_id, version)`. The authenticated actor comes from `auth.getUser()`, never from a submitted profile ID. Own-row SELECT/INSERT/UPDATE policies work before team membership; anonymous and DELETE access are denied. Step/version/status checks exist both in the catalog and database. A row trigger protects completed/skipped progress against stale writes and prevents an invitation from replacing an existing checkpoint.

Disable the environment flag for immediate recovery while preserving checkpoints. The migration is additive and requires no change to business tables. Prefer forward fixes; do not drop account progress during an ordinary rollback. A future catalog version needs matching database version/step constraints and types before activation. Database types were extended locally; regenerate using the existing Supabase types command after the local migration can be applied.

## Integration

- `src/lib/domain/wooly.ts` owns typed tours, prepared answers, search and audience filters. AppShell supplies verified account/team/member-management context. `/teams` and `/pending` supply onboarding identity separately.
- The root-layout client provider survives route navigation. Explicit `data-wooly-target` attributes mark navigation, sections and form controls. Unsupported routes, anonymous screens, live presentation routes and desktop runtime omit Wooly.
- Joining ends at the real request button; existing approval/rejection routing remains responsible for dashboard access. Creation explains the existing wizard stages and falls back to text when a stage is hidden.
- Closing pauses; Resume restores the checkpoint; Restart/Show me use catalog steps. Completed/skipped tours replay without clearing account completion. Focus reloads saved progress. Failed saves retain an exact checkpoint for retry while the tour remains usable.
- Help/welcome panels use the existing accessible-dialog behavior. Guided tours are nonmodal so forms remain operable. Escape closes, focus returns, step changes announce politely, images have empty alt text, and reduced motion disables transitions. Mobile sheets sit above the navigation; the launcher sits above the report button. External dialogs close/pause Wooly.
- The existing service worker caches `/brand/` public assets. Account checkpoints and authenticated documents are not added to public caches.

## Verification record — 2026-10-09

Candidate: current workspace with scoped Wooly changes, preserving pre-existing website, desktop and backup changes. Requested Maya `gpt-6-luna medium`, Josh/Laura `gpt-6.1-sol medium`; effective launch receipts and usage telemetry unavailable. Source-review repairs: 2; phone spacing correction: 1; route-handoff repairs: 3, resolved from an instrumented demo trace. No push, deploy, remote agents or remote database writes.

| Check | Result and evidence |
| --- | --- |
| Wooly unit/action/migration/UI tests | Final 31/31 pass across four files, including 17 UI tests. The UI suite covers delayed route handoffs, late route-intent consumption, identity/unsupported-route invalidation, one-time offers, replay, missing targets, thrown reads/saves, terminal retry, focus/Escape, permission revocation and delayed-invitation races. |
| Website unit/coverage suite | 108 files / 536 tests pass with explicit `--exclude output/** --exclude .tmp/** --maxWorkers=2`. Statements 88.31%, branches 84.10%, functions 93.54%, lines 91.03%; all existing 80% gates pass. Plain script also discovers backup checkout tests and fails there. |
| Wooly catalog coverage | Statements 96.29%, branches 97.91%, functions/lines 100%. |
| TypeScript | Current source passes with `.tmp/wooly/tsconfig.json`, including `vitest.setup.ts`. Global script includes backup checkouts and reports unrelated desktop/backup type conflicts. |
| Lint | Strict scoped check of Wooly and all touched integration files passes. Full website command fails on 15 existing warnings in actions/login/presenter/pending/profile/member-ministries, with no Wooly diagnostics. |
| Independent review | Laura reviewed the final controller, schema and integration boundaries. Delayed offer race, revoked topic access, route-handoff races and button contrast were fixed. White on violet `#7c3aed` contrast is 5.699:1. Final reviewed candidate hashes appear below. |
| Production build | Initial run hit disk ENOSPC; only regenerable workspace webpack cache was cleared. Retry compiled the production bundle successfully in 60 seconds, then failed on the existing global backup/desktop type conflicts. Current-source typecheck passes; no unrelated desktop or backup source was changed. |
| Supabase runtime/lint | Blocked before database execution: local Docker Linux daemon unavailable. Source migration tests and independent boundary review pass; runtime two-account isolation and atomic stale-write behavior remain unverified. |
| Browser desktop/mobile | 12/12 core journeys pass (6 desktop, 6 phone). Checks include all essentials routes, pause/resume/finish/skip, manual navigation, mobile More/Profile targets, joining form interaction, hidden creation stages without advancing/submitting the real wizard, unmatched search, terminal retry UI, 320px spacing, reduced motion, Escape/focus restoration, report-dialog separation, pending help, omitted login/live routes and image responses. A separate demo-only preview preserved the existing server. Subsequent cosmetic sizing/copy checks recorded below. |
| Assets | Five individual 1254×1254 PNGs; alpha channels verified. Decorative images use empty alt text. |
| Final cosmetic follow-up | The independently reviewed desktop height/copy polish passes the final 31-test suite, scoped lint and current-source TypeScript. Its four affected browser checks were interrupted by Next's memory-threshold restart and then a native memory-allocation failure, causing connection reset/refused errors. After bounded-preview recovery attempts, further retries stopped. The earlier 12/12 run covers the final controller logic before these cosmetic-only changes; no final-polish browser pass is claimed. |

Final candidate SHA-256: provider `B57DEEF20AECCA48E4FF24B24FF735A16E9362A7AE5680793D6AB9FE4BD82F59`; CSS `CF8F587EA8906B2F47DF4A5402810558CE7DDA40928F44BD56BE8E0E2023E380`; UI tests `6B28A042A10E4378E6E562AD3E420A4F3AFDA416331A41A0AFD43FE568007229`; browser tests `E4EB08F6DD50EDC0921C163DD66ED55C18059C4D92D2CB3BB3A015812CE06B0D`.

Laura's final independent approval matches all four hashes and passes the corrected 17-test UI suite. Root's final affected check passes all 31 tests, current-source TypeScript and strict lint. Task-created preview source/cache is removed after verification; the original server is retained. Small diagnostic logs remain in `.tmp/wooly`, including `browser-verified.txt` (12 passed), `tests-settled.txt` (31 passed), `build-retry.txt`, `database-lint.txt` and the interrupted polish rerun. Final ticket status is Blocked for release acceptance, rather than Done: local implementation is ready, but runtime database success/isolation, global baseline checks and the final cosmetic browser rerun need the unavailable services/resources.

Browser results exercise demo/failed-save flows. Successful authenticated account persistence, two-account database isolation, cross-device storage and real pending approval/rejection navigation still require the migrated local database. Empty-state explanations and missing-target fallbacks are covered by the catalog and UI tests; an empty authenticated team is not claimed as an executed database-backed browser fixture. The installed PWA shares the website layout and existing public-asset caching; a native app installation was not performed.

Run database checks against a running **local** migrated Supabase instance:

```powershell
npm run lint:database:website
npm run test:supabase:website
node scripts/test-wooly-security.mjs
```

The Wooly isolation script refuses non-local URLs, creates two temporary local accounts, verifies pre-membership own checkpoints, cross-account/anonymous denial, invalid identifiers, denied deletes and terminal-state protection, then cleans up its temporary accounts.

## Engineering gates

Gates 01–12: passed by the accepted plan, ticket, ownership, catalog contract and actor→server action→RLS data flow. Gate 13: workflow deviation—specialists used one shared checkout with disjoint file ownership rather than isolated implementation worktrees; no source changes were reverted. Gate 14: required skill guidance loaded. Gates 15–21: scoped lint/types, stable routes, shared provider hydration, catalog parsing and SQL constraints pass. Gate 22: nonblocking save failures and exact retries tested. Gates 23–25: additive off-by-default migration, flag rollback, composite index and three rows per version/account reviewed. Gates 26–29: source policies reviewed, runtime checks blocked by Docker. Gates 30–34: results above; full build/browser outcomes appended below. Gate 35: no dependencies added, no secrets or remote resources changed, server actor verification and account RLS reviewed. Gate 36: focus/Escape/reduced-motion tests, decorative assets and contrast reviewed; browser observations appended below. Gate 37: final scoped candidate reviewed independently; full release acceptance remains pending unavailable database/global gates.
