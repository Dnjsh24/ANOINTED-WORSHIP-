# Native mobile backend release candidate

Status: **Testing; local draft only.** Branch codex/mobile-services-release starts from freshly fetched main 36cd2dc13e401094537b4a18f50ad448817a0763. Do not publish the dirty Android or OneDrive tree.

## Behavior and scope

The APK expects mobile API handlers absent from main. This initial rollout adds 93 registered handlers, authenticated readers/commands/contracts/tests and 42 forward migrations. Exact registered paths reach their own Bearer-authenticated handlers instead of cookie login redirects. Unknown paths, invalid IDs and trailing path segments retain normal protection. The aggregate rate limit still runs first.

Six existing website helpers remain identical to main. Mobile adapters preserve native contracts without replacing website Analytics, validators, member usage, team context or support readers. No client UI, native Android, desktop or unrelated website feature is ported.

The final CORS repair allows X-Mobile-Member-Id alongside existing app scope headers. The SDK already sends this header. Allowed origins, Bearer authentication and workspace verification remain in place. The departure helper uses this shared boundary without appending a duplicate header. The new regression failed before the repair and passed afterward. This is a server-only difference from the frozen APK72 source archive.

Compatible security patches use Next 16.4.3, Zod 4.6.7, Vitest 4.1.12, Vite 8.3.5 and undici 7.30.1. No new dependency is added. npm audit reports zero vulnerabilities. Primary advisories: [Next image handling](https://github.com/advisories/GHSA-2464-fhr4-w9xw), [Next cache handling](https://github.com/advisories/GHSA-673q-mjm6-r5xr), [Zod collection limits](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).

## Local evidence and limits

[Machine-readable checks](mobile-services-local-checks-2026-10-28.json) contain commands, gates and remaining work. [Exact ownership](mobile-services-release-files.json) supplies the scope allowlist. Full reports and source hashes remain in .tmp/.

| Check | Result and scope |
| --- | --- |
| Patched full suite | 2,382 passed, zero failures/skips, 388 files; before final CORS repair. |
| Final affected CORS/auth/proxy/registry suite | 25 passed, zero failures/skips, five files. |
| Types and lint | Full patched tsc and strict website lint passed. Final build passed TypeScript; four final CORS files passed ESLint with zero warnings. |
| Production compile | Passed after final changes using an invalid fixture Supabase URL and dummy key. Compilation only; no hosted acceptance. |
| Compiled routing/CORS | 93 preflights, four unavailable-service JSON handlers and one foreign-origin denial passed in existing demo mode. |
| Production fail-closed guard | Missing Redis produces 429 with Retry-After. Real protected HTTP authentication remains blocked; runtime NODE_ENV did not bypass production compilation. |
| Dependency audit | Zero vulnerabilities. |
| Secret scan | Exit 1: three historical binary Node compile-cache documentation examples with XXXX PEM payloads, two synthetic JWT-shaped test tokens and one test access-token string. No real credential identified. Eight oversized history blobs and one oversized working file skipped. No suppression or history rewrite. |
| Scope/ancestry | After local commit, run checkChangeScope with the exact allowlist. Only .tmp/mobile-services-scope-final.json matching HEAD proves this gate. It does not replace review. |

The 39 PostgreSQL output contracts replay earlier actual exports. The unchanged 42 migrations were exercised within the earlier fresh 127-migration rehearsal chain. Neither establishes hosted schema state. Formal architecture/code/security/QA review remains deferred by the user; no approval is claimed. No review worker was launched this turn.

## Remaining release work

The actual Supabase project is xvrndwkghxkqsvxxtqym. The connected account does not list it. Obtain correct access, inspect applied migrations, and prepare a concrete hosted compatibility/recovery plan. The 42 local files do not mean all 42 remain unapplied remotely. Never query or modify the unrelated visible project as a substitute.

Production Redis/authenticated HTTP checks, deferred review, protected-main CI, deployment SHA verification and native live sync acceptance remain open. The app checklist stays at 69 checked / 93 tasks, with 24 remaining and Android acceptance 0/8. No new phone build is needed for this server-only step.

Push/PR, hosted SQL/settings changes, merges and deployment require explicit authorization. Deploy only merged main after docs/GITHUB-SAFE-RELEASES.md safeguards. No production credentials were copied and no external write was performed.
