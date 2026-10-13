# Preserve existing features during releases

Fixes must build on current main and include only the requested change. Git merges cannot identify an accidental rollback inside an edited file; review the full diff and test existing behavior.

## Confirmed incident

The October 9 incident deployed `codex/website-production-readiness` at `064015a` to production, bringing back older Analytics and other website code. Reviewed main was restored in `c8ead70`. On October 12, GitHub main and the latest READY production deployment both use `c39f90b480c8599fca387ad42c1de9cfdf44acbb`. The original work branch is still 28 commits behind and 74 ahead. Do not publish its whole tree as a replacement for main.

## Repository protection

Protect exactly `main`: require a pull request, require the Website CI checks `quality`, `browser`, and `local-database`, require the branch to be up to date, require conversations resolved, and apply the rules to administrators. Keep force pushes and deletion disabled. Allow zero mandatory GitHub approvals for this single-owner repository; independent agent review is still required by project instructions. These settings do not repair existing failing checks: resolve failures before merging.

GitHub documents these controls in [About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches). Activation status and evidence are recorded in `docs/testing/github-safe-releases-2026-10-13.md`.

## Each fix

1. Fetch origin. Preserve dirty work; use a separate clean checkout created from fetched `origin/main` and a new `codex/` task branch. Do not reset or clean the original checkout.
2. Implement only the ticket scope. If recovering work from an old branch, port the required changes onto current main and inspect them. Do not copy entire old files over current files or cherry-pick a mixed-purpose commit blindly.
3. Commit only explicit file paths or reviewed hunks. Never stage the entire dirty workspace for a scoped fix.
4. Fetch again. If main advanced, merge `origin/main` into the task branch, resolve each conflict while preserving both intended changes, and rerun affected checks. Do not use blanket `ours` or `theirs` conflict resolution.
5. In the clean candidate checkout, run:

   ```text
   node scripts/check-change-scope.mjs --files src/path/to/fix.ts src/path/to/fix.test.ts
   git diff --stat origin/main HEAD
   git diff origin/main HEAD -- src/path/to/fix.ts src/path/to/fix.test.ts
   ```

   Replace example paths with every explicitly approved file. The checker requires fetched main ancestry, a clean tree, a nonempty change, and an exact file allowlist. Renames require both paths. It never changes Git state or pushes. It compares the local fetched reference; fetching and GitHub's up-to-date requirement handle remote drift. It cannot detect unrelated edits inside an allowed file, and is a local release gate rather than an installed Git hook or mandatory CI check.
6. Run relevant project checks and independent review of the final candidate. Open a focused PR into main after authorization. Review Files changed before merging. If main moves again, update and repeat affected checks.
7. Deploy only the merged main commit. Verify Vercel's production commit SHA equals GitHub main, and check affected routes plus existing Analytics. Never promote an old preview or redeploy a historical feature-branch artifact. The production prebuild branch guard does not protect artifacts built before that guard existed.

Do not force-push main. Branch cleanup and removal of old deployments require separate explicit authorization.
