# WOOLY-19: clear, specific tutorial instructions

Local implementation and independent source review are complete. Browser acceptance remains unverified. Open the website on port 3100, select Wooly, choose **Tutorials**, then **Show me this page**.

## Changes

Rewrote 107 instructions across all 42 page guides, the 15 joining/team-creation/essentials steps, and the 12 basic prepared help answers. Instructions name actual controls, describe their result, and explain empty or conditional sections. Common prepared answers now open the relevant page guide through **Show me**.

Examples include Profile's saved fields (Full Name, Birthday, Team Anniversary and Ministry Involvement) and read-only Email, the **Save Changes** action, adding songs through the **Staging Box** and **Save to Setlist**, and the actual Attendance choices. Profile guidance explicitly says Phone, Time Zone, Language and notification changes are not saved to the account yet. Team creation uses the form's **Continue** button. Setlist creation describes music planning; scheduling and assignments belong to Timeline. Template management no longer describes a nonexistent selection action or deletion confirmation.

The guide explicitly distinguishes Wooly's **Next** button from page buttons that save or submit. The welcome invitation explains how to pause or skip. A missing-target message explains how to continue reading or reveal a conditional section.

## Scope and preservation

Application changes are limited to `src/lib/domain/wooly-page-guides.ts`, `src/lib/domain/wooly.ts`, `src/components/wooly/wooly-provider.tsx`, and one hint style in `src/components/wooly/wooly.css`. No route, stable step identifier, target, access rule, progress version, server action or storage schema changed. Character assets, animation, the ten-second greeting, chat, report integration and launcher placement remain intact. No remote action or desktop-application change was made.

Baseline snapshots and SHA256 values are in `output/wooly-clear-guides/baseline-hashes.json`. `audit.cjs` verifies all 42 guides retain their non-body structure, all 15 onboarding steps retain IDs/routes/targets/poses, domain logic remains unchanged, and the CSS delta consists only of the hint style. Provider comparison shows only invitation/fallback copy and the new explanatory hint.

## Verification

| Check | Result and evidence |
| --- | --- |
| Focused Wooly tests and coverage | Before the review's Profile copy correction: 171/171 tests in 20 files pass. Statements 90.02%, branches 86.64%, functions 87.18%, lines 96.11%; thresholds unchanged. `output/wooly-clear-guides/tests.log` and `coverage/`. Affected final-candidate checks are recorded below. |
| Scoped ESLint | Pass with zero warnings for the two catalogs and provider. `lint.log`. |
| Current-source TypeScript | Pass using `.tmp/wooly/tsconfig.json`. `types.log`. |
| Animation preview production build | Pass; this is a preview build, not the full website release build. `preview-build.log`. |
| Baseline/contracts/CSS | Pass; all four baseline hashes intact and CSS parses with Lightning CSS. `audit.log`. |
| Final copy corrections | Team-creation review explicitly says "team name"; Profile instructions match the server's saved fields. All 63 affected domain/page-guide/chat/provider tests in 4 files pass; `final-copy-tests.log`. Scoped lint/types, structural audit and preview build also reran successfully. |
| Independent review | Laura approved the corrected final four-file candidate with no remaining findings and matching SHA256 values. The initial P2 Profile save mismatch is resolved. An initial account-limit interruption was followed by re-review after its stated reset time. `output/wooly-clear-guides/independent-review.md`. |
| Browser, mobile, screen reader and installed PWA | Not run under the existing browser-automation restriction. Source/DOM checks do not prove visual or assistive-technology acceptance. |

The prior full-website checks and unrelated root build/type/lint limitations remain documented in `docs/WOOLY-CHAT-SUPPORT.md`. Full suites were not repeated for this copy-only change. Database migration/runtime RLS and deployment gates are not applicable to this change; existing support-queue activation requirements remain separate.

The ticket stays **Review**, completed 0/1 final acceptance, until allowed visual/interaction checks pass. One source finding was corrected in one attempt; there were no repeated repair failures. Effective model/effort and usage telemetry are unavailable. Final candidate hashes are stored in `output/wooly-clear-guides/candidate-hashes.json`.

Source, contract, scoped-check and independent-review gates have evidence above. Browser/end-to-end/device accessibility gates remain unverified. Parallel worktree, migrations, RLS runtime, new dependencies, credentials, remote rollout and gold-lane dual approval are N/A to this sequential standard-lane tutorial-copy change. The final affected integration run after independent approval is recorded in `integration-tests.log`.
