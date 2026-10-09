# Notification registration recovery

User report: clicking Enable shows “Registration failed - push service error”; reported across browsers/devices.

## Scope and diagnosis

Matching website checkout: `C:/Users/danje/orca/workspaces/Anointed worship setlist - Copy/Fixing-things`, branch `Dn-Jsh/Fixing-things`, clean source baseline `ca37ae2ad6efafabe30d3f62745a94c4d0b83d65`. No PROJECT-BRIEF was present. The root chat checkout contains unrelated release work and was preserved.

The browser throws before the authenticated subscription-save API is called. Confirmed application defects: subscription creation used the registration immediately rather than active-worker readiness; only default permission triggered the prompt, so a permission grant followed by failure could lose retry after reload; permission requests were outside the error handler; no in-flight guard or existing-subscription reuse.

Read-only Vercel diagnosis found production VAPID public/private environment-variable names. The public key is a valid 65-byte uncompressed P-256 point. Private values were not read and pair correspondence was not verified. No keys or third-party configuration were changed. The native provider's connectivity/failure cause and real delivery remain unverified.

Reference behavior: [active service-worker readiness](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/ready), [PushManager subscribe options and user gestures](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe).

## Implementation

Maya owns `src/components/pwa-register.tsx` and its adjacent new regression test. The coordinator owns `e2e/notification-registration.spec.ts`, ticket status, integration checks and this record. Laura independently reviews behavior and accessibility.

The client validates and decodes the configured public key, bounds the active-worker wait to ten seconds, reuses existing matching subscriptions and replaces only visible key mismatches. It catches permission failures, blocks duplicate clicks, and preserves retry after granted-permission failure. A guarded sessionStorage boolean records unsaved subscriptions; it contains no key, endpoint or private data, clears only after server success, and restores the retry prompt after reload. Already-enabled matching subscriptions and missing/invalid configuration do not produce repeated prompts. Browser push-service failures receive actionable connectivity/retry text rather than false success.

No API, schema, authorization, dependency, service-worker caching or desktop changes. No migration or credential update is required. No notification dispatch, new commit, push or deployment is authorized by this fix request.

## Verification

Maya's final component suite passes 11 tests, including the ten-second fake-timer readiness timeout and rejected permission request. Strict owned-file ESLint and TypeScript passed. Coordinator initial checks found a browser-harness element narrowing error and initial implementation/test typing errors; these were corrected before integration. Coordinator review also corrected error-stage tracking and repeated prompts for already-enabled/unconfigured users.

Laura established the final candidate independently and approved source/test behavior with no blocking findings. Exact independently repeated commands:

- `npx --no-install vitest run --config vitest.website.config.ts src/components/pwa-register.test.tsx src/app/api/web-push/subscribe/route.test.ts`: exit 0, 16 tests passed (11 component, 5 unchanged API).
- `npx --no-install eslint src/components/pwa-register.tsx src/components/pwa-register.test.tsx src/app/api/web-push/subscribe/route.test.ts e2e/notification-registration.spec.ts --max-warnings 0`: exit 0.
- `npx --no-install tsc --noEmit --incremental false`: exit 0. Ordinary incremental run hit sandbox EPERM on cache writing; the equivalent nonincremental check passed.
- Source whitespace review: passed. Initial independent test run hit sandbox temp-file EPERM; the authorized scoped repeat passed.

Production-demo `npm run build` passed: Next.js 16.3.8 webpack compilation, TypeScript, all 45 static pages and build tracing. Build used `E2E_FORCE_DEMO=1 NEXT_PUBLIC_E2E_FORCE_DEMO=1` and an ephemeral, generated test-only public VAPID key in process-local environment. No private key was used or saved. Only this checkout's resolved generated webpack cache was cleared after checking containment, to avoid the observed disk-space issue from prior Home verification.

Final reviewed Git blobs: source `821c3576da335cf6a2862a62f17685271e52bb43`, component tests `2c17aec686bd3cd625130c8ab9c5f8ed73c7baeb`, browser spec `77ad912a07efbfb8fade204abc0ace31d5d2a5fe`. SHA-256: source `A2919BDF5199E65E879687F567D044AEC010730682A6007C366E88E0BEF20B0E`; tests `38B67FF0F84D16A862AC6118B1C82ECA3FCC238C97F6D563EF2E5FE30F5A9976`; browser spec `4AFF70F08BF00D1E3EA26D4D2E04E50871D19F122CC049AE24E0737104A1CF2F`.

Browser fixtures simulate native push registration and intercept the local subscription-save endpoint. No real notifications or hosted rows were created. Installed engines: Chromium and WebKit; Firefox binary is unavailable. Explicit matrix passed 6/6 cases on desktop Chromium, Android Pixel 7 and iPhone WebKit. Command: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3222 E2E_FORCE_DEMO=1 npx --no-install playwright test --config .tmp/push-playwright.config.ts --project chromium --project android --project iphone`. The temporary config deliberately includes the new spec for WebKit; default project matching would exclude it. These tests verify application recovery behavior, not real push-provider delivery.

First browser attempt passed three save/retry cases and failed three reload cases on an ambiguous alert selector that also matched Next.js's route announcer. The coordinator narrowed only the two browser-test alert selectors; the full affected matrix then passed. Final browser-spec strict lint and diff whitespace passed. One automatic approval review timed out on the local test rerun; its permitted retry succeeded. No permission blocker remains. The local server was stopped.

Laura accepted the final selector correction and unchanged production/unit-test identities, independently reviewed the final candidate, and approved all scoped acceptance criteria using her own focused checks plus coordinator build/browser receipts. No findings remain. Manual screen-reader testing and real native push-service connectivity/delivery were not performed.

## Gates and effort

Standard lane, moderate asynchronous browser-state risk. Intake, acceptance, scoped ownership, repository navigation, existing request boundaries and verification plan are recorded. One implementer; reviewer is read-only. No parallel implementation conflict. Primary Caveman/Ponytail/clean-code-typescript guidance and relevant React/type/accessibility/testing guidance were loaded; coordinator reused Engineering Gates and Completion Mandate. Native settings: Maya launched before updated effort instructions under requested gpt-6-luna/max; subsequent running sessions retain settings. Laura requested gpt-6.1-sol/medium for independent review. Effective settings and usage telemetry are unavailable and are not reported as zero.

Gates 01–12 passed for intake, scope, ownership, repository conventions and traced browser/API boundaries. Gate 13 is N/A: one implementer and a read-only reviewer; coordinator authored an independent browser fixture in a separate file. Gates 14–22 passed for applicable style/types, minimal helpers, SSR-safe browser access, public-key validation and recoverable error paths. Gates 23–29 are N/A: no schema, constraints or RLS changes. Gates 30–34 passed by the recorded build, typecheck, strict lint, focused component/API and explicit browser commands. Gates 35–36 passed by scoped security/accessibility source review; no new dependency or credentials, JSX alert text and disabled named controls, boolean-only guarded session state. Gate 37 passed: final reviewed identities and every scoped acceptance criterion have evidence. Gold lane is N/A for this bounded client fix. Full business-logic coverage rerun is N/A for this browser adapter; meaningful affected tests were run without changing coverage thresholds.

Maya reports two repaired initial verification failures and zero new follow-up failures. Coordinator's browser harness had one failed matrix corrected by a test-only selector change; the next matrix passed. No repeated repair limit was reset. Effective launch settings and usage remain unavailable.

PUSH-01 is Done for the local application fix, completed 1/1. No local acceptance blockers remain. New commit/push/deployment and real provider delivery verification remain separate; no hosted activation is claimed.
