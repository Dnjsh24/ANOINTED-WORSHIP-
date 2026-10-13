# GIT-03 — Publish safe release workflow (2026-10-13)

The owner authorized pushing this update on a branch and merging into main. Candidate starts from fetched main `a0fc101f7bf9373abc44da32dbac3af1bd6ed1e7` on `codex/github-safe-releases`. Only six paths belong to this change:

- `AGENTS.md`: append preservation/release instructions; retain main's existing Next.js block.
- `.github/pull_request_template.md`: record exact scope, final SHA, review and checks.
- `scripts/check-change-scope.mjs`: read-only ancestry, clean-tree and exact path gate.
- `scripts/check-change-scope.test.mjs`: stale-main, unrelated Analytics rollback, dirty/untracked work, rename and invalid-input regressions.
- `docs/GITHUB-SAFE-RELEASES.md`: practical main-based, scoped release workflow and its limits.
- This evidence record.

Existing application code, current Analytics, setlist fixes, CI repairs, package manifests/locks, migrations and remote settings remain unchanged. The original dirty checkout is preserved. Production has an existing automatic main integration; this task will not manually promote or redeploy artifacts.

## Existing protection and incident evidence

GitHub main protection rule `84639292` was saved with owner approval and inspected after authentication. It requires a PR, GitHub Actions quality/browser/local-database checks, up-to-date branches, resolved conversations, and administrator enforcement. Force pushes and deletion are disabled; no mandatory human GitHub approvals are configured for the sole owner. Independent agent review remains required.

The October 9 regression deployed old feature branch `064015a` instead of reviewed main. The prior restoration report on main is `docs/PRODUCTION-REGRESSION-2026-10-09.md`. The new workflow prevents publishing a stale candidate or silently including paths outside a declared fix. Same-file semantic rollbacks still require line review and tests. The checker compares fetched local origin/main; it is not an installed hook or a required CI check. Old Vercel artifact promotion still requires exact main SHA verification.

## Validation and review

Coordinator scoped Vitest: 13/13 pass on clean locked dependencies (Vitest 4.1.11). Independent Laura repeat: 13/13 pass, exit 0; six-path scope and append-only AGENTS diff approved with no findings. Scoped strict ESLint, Node syntax, whitespace and secret scan pass (zero findings). Production dependency audit: zero vulnerabilities. Full audit: five high development-only findings in the unchanged eslint-config-next/fast-glob/micromatch/braces chain; no dependency upgrade is bundled. Required GitHub CI must pass on the final published candidate before protected merge. No bypass or lowered threshold is permitted.

## Gates and ownership

Coordinator owns this six-file publication. Standard lane; release-process regression risk. Requirements, scope, source contracts, preservation, input validation, safe failure handling, tests and independent review are relevant. Route/SSR/UI/accessibility/SQL/RLS/schema gates are N/A because no product code, data or dependency changes. Full website integration is enforced by existing required GitHub CI. No global engineering-gates check runner is installed; project commands are authoritative. Effective model/effort/usage telemetry unavailable; reviewer requested Laura gpt-6.1-sol medium. Stop after three repairs of the same issue.
