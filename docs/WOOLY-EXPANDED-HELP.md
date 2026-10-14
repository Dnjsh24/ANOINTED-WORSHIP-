# WOOLY-21: expanded answers and feature tutorials

Local implementation is ready for acceptance. Open the real website at [Sunday Setlist](http://127.0.0.1:3100/dashboard), select Wooly, then use **Chat** or **Tutorials → What would you like to do?**. Available topics and guides depend on the verified account and permissions.

## Delivered behavior

The typed catalog contains 210 distinct saved answers and 840 authored question variations, plus 185 task guides alongside the existing 42 page overviews. Coverage includes onboarding, music planning, song editing, practice/stage/presentation, events and attendance, messages, team management, notices, dance charts, profile/settings, remote/PWA help and support. [Feature coverage](WOOLY-FEATURE-COVERAGE.md) connects each answer to source controls, access and guide identifiers, and documents unavailable behavior.

Matching checks the requested action and feature, supports synonyms and common typos, and offers choices for uncertain matches. Explicit wording takes priority over page and topic context. Only the last confirmed topic ID is sent for follow-ups; the server revalidates it for the current audience. No conversation history is sent. Reload/account/team/permission changes clear contextual chat. Replies contain saved wording, optional expandable **View steps**, **Open page** and **Show me** actions. Instructional questions such as “What does BPM mean?” stay separate from authorized record lookups, including song names containing words such as “How,” “Save” or “Never.” Private support replies do not become reusable answers.

Guides state purpose and prerequisites, name actual controls, explain success and allow optional practice. Next never submits or changes records. Cross-page guides retain their task and explicitly declared routes; record guides use the open record or ask for selection. Registered dialogs host compact instructions within their existing focus boundary. Closing, skipping or finishing an inline guide restores focus within the form. Unrelated dialogs/navigation pause the task. Existing presentation-output guides remain explicitly opened.

## Storage and scope

New tasks have separate stable tour and literal step IDs. Existing joining, creating, essentials and page-guide identifiers, version 1, checkpoints and terminal completion behavior remain intact. The additive local migration `20261011030000_wooly_feature_tasks.sql` extends only the allowed tour/step CHECK constraint. It contains no progress reset, data writes or RLS changes. Apply it through a separately authorized database operation before relying on saved progress for new tasks; guides remain usable with the existing save warning/retry if it is absent.

No AI provider, training, paid service, dependency, remote migration, support grant, deployment or separate desktop change is included. Existing artwork, greeting cloud, launcher placement and support/report behavior are preserved. Baselines and SHA256 candidate identity are in [the evidence folder](../output/wooly-expanded).

## Verification

| Check | Evidence / result |
| --- | --- |
| Final affected tests | 24 files, 448/448 tests pass. Covers all 840 variants, unseen paraphrases, typos, ambiguity, negatives, context conflicts/cleanup, access, record/help separation, stable checkpoints and popup focus/navigation. `output/wooly-expanded/tests.log`. |
| Expanded domain coverage | Statements 97.03%, branches 94.13%, functions 97.93%, lines 100%; existing 80% thresholds unchanged. `output/wooly-expanded/coverage/`. |
| Full website run | 965 passed, one old context fixture failed and was corrected; final affected run includes its passing rerun. One existing Supabase-lint suite could not transform because of filesystem EPERM. This run did not produce a passing aggregate coverage report. `full-website-tests.log`. |
| Strict scoped ESLint | Pass, zero warnings. One popup DOM-highlight immutability warning repaired using DOM attribute methods. `lint.log`. |
| Current-source TypeScript | Pass using `.tmp/wooly/tsconfig.json`, which includes website source and excludes archived output/mobile copies. `types.log`. |
| Production build | Webpack compiles successfully in 24.7 seconds. Full build fails during the existing global typecheck on archived `output/` snapshots and conflicting desktop ambient declarations. Initial sandbox path canonicalization failure was resolved by the authorized local build retry outside that boundary. `build.log`. This is not a passing release build. |
| Full website lint | Existing configuration fails to find the `react-hooks` plugin for its `immutability` rule. Affected source strict lint passes. `website-lint.log`. |
| Local migration and database security | Catalog/migration contract tests pass and preserve previous allowed pairs, own-profile RLS and terminal-write guards. Both existing local commands were attempted; after resolving CLI sandbox access with a local retry, live checks are unavailable because the Docker Linux engine is absent. `database-lint.log` and `database-security.log`. Static tests do not prove runtime database isolation; the new migration has not been applied. |
| Independent review | Laura approved source and affected tests for candidate `BA61A3E592E381443E76C957B7EC62D9235682313747295D7A543E4C9E3F24FA`: 12 files, 373/373 tests pass; all 33 source hashes independently matched before and after tests. No remaining source blocker. [Review evidence](../output/wooly-expanded/review.md). This is not release approval. |
| Final integration after approval | 4 files, 55/55 tests pass on the unchanged source candidate; `final-integration.log`. Initial invocation also selected archived output fixtures; current-source tests passed, and the corrected run excludes archived/temp copies. `integration-with-archived-fixtures.log` preserves that invocation. Final hash audit has zero mismatches. |
| Desktop/mobile, keyboard in real browser, screen reader and installed PWA | Unavailable under the existing browser restriction; DOM tests do not substitute for physical acceptance. No workaround attempted. |

## Completion gates

This standard-lane website change remains **Review**, completed 0/4 final acceptance, until required runtime/database/browser gates are available and global checks are resolved. Engineering-gates and completion-mandate apply. Relevant domain, authorization, accessibility, scope and preservation checks have evidence; remote activation/deployment, new dependencies, desktop packaging and gold-lane approvals are N/A. Effective model/effort and usage telemetry are unavailable. No unresolved issue reached three failed repair attempts.

The temporary knowledge worktree was submitted for recoverable archival after integration; the complete final catalog and evidence are preserved in the main workspace. The existing local development server was preserved.
