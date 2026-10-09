# Notification recovery publication — 2026-10-09

User explicitly authorized push after reviewing the local fix. Publication target is the established website branch `Dn-Jsh/Fixing-things`, aligned with origin at `197b410` before this commit. The primary chat checkout contains unrelated release work and remains preserved. Existing target `AGENTS.md` changes are excluded.

Only notification recovery, component/browser regressions and ticket/evidence records are committed. The recovery waits for an active worker, validates the public key, reuses subscriptions, prevents duplicate requests, preserves permission-granted and unsaved-subscription retries, and reports native provider errors honestly. The existing target update-toast branding is preserved. An HTTPS guard and regression are included. No API, database, dependency, auth, cache or credential change.

## Final website candidate checks

- Focused Vitest: `npx --no-install vitest run --config vitest.website.config.ts src/components/pwa-register.test.tsx src/app/api/web-push/subscribe/route.test.ts`: exit 0, 17 tests (12 component, 5 API).
- Strict ESLint: `npx --no-install eslint src/components/pwa-register.tsx src/components/pwa-register.test.tsx e2e/notification-registration.spec.ts --max-warnings 0`: exit 0.
- Full TypeScript: `npx --no-install tsc --noEmit --incremental false`: exit 0.
- Production-demo `npm run build`: exit 0; compilation, TypeScript, 45 static pages and tracing pass. Process-local generated public test VAPID key; no private key saved. Log `.tmp/notification-push-build.log`.
- Production-build browser matrix: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3224 E2E_FORCE_DEMO=1 npx --no-install playwright test --config .tmp/push-playwright.config.ts --project chromium --project android --project iphone --reporter=line`: exit 0, 6/6 in 11.3s. Tests mock native registration/save; no hosted writes or notification dispatch. Temporary config includes iPhone explicitly.
- `node scripts/scan-secrets.mjs`: exit 0; zero findings across 591 working files and 2428 history blobs; detector self-test passed.
- `npm audit --omit=dev --json`: exit 0, zero vulnerabilities. Full `npm audit --json`: exit 1, five existing high development-tool findings in ESLint/fast-glob/micromatch/braces chain. Dependencies unchanged.
- Diff whitespace passed. Remote baseline fetched and aligned, no force push needed.

Laura independently approves final publication component SHA256 `875B939991935EE053615AA75D6F980DFEE962FC391CEBD68B39908C7ADF5B6B`. Independent comparison confirms only existing update-toast branding differs from the reviewed root candidate. Test SHA256 `D89AAFFBF08D3830DDDFCD758D46A8B95AC347BF01BFCF5594A4F97D9F77511A`; browser spec matches reviewed candidate. No findings. Laura role gpt-6.1-sol medium; usage telemetry unavailable. No source repair failures.

## Settlement

PUSH-02 acceptance passes on the publication branch, Done, 1/1. Required gates from the existing notification record apply; full build/typecheck/browser gates now pass in this website checkout. The root checkout's unrelated integration errors are not publication-branch blockers. Push is authorized; no direct deploy, credentials, notification dispatch or third-party data changes are authorized/performed. Hosted build status and real native delivery remain unverified.
