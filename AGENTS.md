<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Preserve current main and unrelated work

Read `docs/GITHUB-SAFE-RELEASES.md` before preparing a push, PR, merge, or deployment. Fetch origin and start each scoped release from current `origin/main` in a clean checkout. Preserve the original dirty workspace. Port only the requested change; never publish an old branch's entire tree or replace current files with stale copies. Merge updated main and review conflicts individually; never resolve all conflicts with `ours` or `theirs`.

Declare exact task file ownership and review every changed line. Stage explicit files or reviewed hunks only. Before release, run `node scripts/check-change-scope.mjs --files <each-approved-path>` in the clean candidate checkout, relevant tests, and independent final review. An allowed path does not authorize unrelated edits inside that file. If main advances, update and rerun affected checks. Require protected-main PR checks before merge. Production must use the merged main SHA; verify the live deployment SHA. Do not redeploy stale feature branches or historical preview artifacts.

Ask before push, merge, deployment, or remote settings changes unless the user already explicitly authorized that scoped action. Never force-push main, reset unrelated work, or delete branches as part of a routine fix.
