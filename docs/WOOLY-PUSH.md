# Wooly branch publication — 2026-10-12

Ticket: WOOLY-23. Publication branch: `codex/wooly-help-20261012`.
Base: `origin/main` at `c39f90b480c8599fca387ad42c1de9cfdf44acbb`.
Reviewed product tree: `029b1e640002f7efe32bbc67d8aba0f9e96c620c`.

The user authorized a push while explicitly preserving the live purple tab icon and Analytics design. The original dirty checkout predates the deployed Analytics implementation, so the Wooly implementation was integrated in a fresh worktree based on main. Unrelated local changes, the desktop application, Analytics source and icon assets were excluded. No dependency change was needed.

## Included behavior

- Prepared help, permission-filtered matching, task guides, persistent tutorial checkpoints and the support queue implementation.
- Whole-character Wooly assets, left-facing listening launcher, ten-second greeting cloud, typed speech, Quick Report integration and the corrected Maybe later dismissal.
- Current-main permission checks use `canForTeam`, including explicit permission overrides. Analytics help is restricted to owner/admin and uses the live metric/control names.
- Tutorial anchors attach to current controls. Authenticated projector output registers its verified audience; explicit presentation-help opt-in is retained.
- Four additive migrations are prepared locally. Existing progress identifiers and completion status are preserved.

## Preserved sources and activation

Thirty tracked Analytics, favicon and PWA files have matching Git blob hashes against main. This includes the Analytics page, dashboard, insight charts, CSS, v2 purple icon assets, web manifest and service worker. Root-layout metadata still references the v2 icons; Web Vitals and current navigation behavior remain intact.

`WOOLY_TUTORIAL_ENABLED=0` is the example default. Production environment settings are unchanged. Publication on this feature branch does not activate Wooly on the live website. Remote migrations, support-account grants, production activation, merge to main and deployment remain separate authorized steps.

## Verification

- TypeScript: passed on the integration candidate.
- Website lint: passed with zero warnings.
- Wooly regressions: 468/468 passed; authenticated projector regression independently passed separately.
- Independent review: 301 changed-risk tests passed; final source review is recorded in `WOOLY-PUSH-REVIEW.md`.
- Staged diff whitespace: passed after cleanup.
- Secrets scan: zero findings; production dependency audit: zero vulnerabilities.
- Broader coverage/build results are appended below after completion.

## Remaining acceptance limits

Browser, mobile/PWA, physical keyboard and manual screen-reader acceptance are unavailable under the existing browser restriction. Live PostgreSQL RLS tests require a local Supabase/Docker runtime; SQL/catalog source tests do not substitute for them. No hosted database test, remote migration, support grant or deployment was performed.

Current-main shared edit requests at `/requests` and `/requests/new` are explicitly classified as not yet covered by this catalog. Their newer workflow was preserved rather than assigned invented tutorial instructions. Historical `WOOLY-*.md` records describe earlier local development; this publication record takes precedence for branch readiness and activation.

Status: review branch only; production readiness remains pending the unavailable acceptance gates.

## Final local checks

Final product tree: `029b1e640002f7efe32bbc67d8aba0f9e96c620c` (documentation changes follow this baseline).
Full website coverage: 145 files and 1,082 tests passed; statements 87.63%, branches 84.08%, functions 92.68%, lines 90.62%, all configured thresholds met.
Production website build with Wooly enabled locally: passed, including compilation, TypeScript and route generation. This used no production credentials or environment changes. Final affected-file ESLint passed with zero warnings. Thirty protected files were rechecked against main.
Local database runtime check failed because Docker Desktop Linux engine is unavailable. No database was changed. Source approval is complete; publishing this dormant feature branch is ready. Production acceptance is still pending the limitations above.
