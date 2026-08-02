# Secure Worship Remote TDD and Verification Evidence

Date: 2026-08-02

Scope: replace the hosted Presenter with a signed-in Worship Remote while preserving the full Presenter, desktop local remote, and LAN fallback inside Electron.

## Red phase

The behavior was specified before implementation and committed in the local RED checkpoint `37db59f` (`test: define secure Worship Remote pairing behavior`).

- Pairing helper/component/migration run: 3 test files failed, with 8 failed and 3 passed tests. Missing behavior included the Worship Remote client, secure migration contracts, same-origin QR parsing, PIN normalization, and private Realtime configuration.
- Pairing server-action run: 3 tests failed before the RPC-backed actions existed.
- Login/proxy run: 2 tests failed before the safe post-login return and public landing-route exception existed.
- Security-header run: failed while the response policy still set `camera=()`.
- QR-dialog accessibility run: failed until the dialog received initial focus, Escape handling, a Tab focus loop, and opener-focus restoration.

## Green phase

The completed implementation passed these gates sequentially:

| Gate | Result |
| --- | --- |
| TypeScript | PASS — `npm run typecheck` |
| Website lint | PASS, zero warnings — `npm run lint:website` |
| Full lint | PASS, zero errors and zero warnings — `npm run lint` |
| Full unit/integration suite | PASS — 63 files, 308 passed, 1 skipped |
| Website coverage | PASS — 85.10% statements, 81.70% branches, 89.87% functions, 88.10% lines |
| Production Next.js build | PASS — 43 pages generated |
| Playwright at port 3100 | PASS — 43 passed, 3 intentionally skipped, Chromium and Pixel 7 |
| Local Supabase lifecycle | PASS — role matrix, cross-team denial, lockout, one-time claim, resume, and revoke |
| SQL privilege regression | PASS through local PostgreSQL — private grants, pinned search paths, and Realtime policies |
| Supabase database lint | PASS, with the documented unrelated `apply_worship_mutation` website-scope exclusion |
| Root dependency audit | PASS — 0 vulnerabilities |
| Desktop dependency audit | PASS — 0 vulnerabilities after the free transitive lockfile update |
| Secret scan | PASS — 1,300 history blobs, 221 commit messages, and 466 working files; no findings |
| Desktop standalone build | PASS — environment files hidden and secrets blanked during compilation |
| Windows NSIS package | PASS — `Anointed Worship Setup 0.2.17.exe` generated locally |

The Supabase CLI's `test db` command reports “No plan found” for the repository's assertion-style SQL regression file because the file is not pgTAP-formatted. The same file was therefore executed with `psql -v ON_ERROR_STOP=1` against the isolated local Supabase container and completed with `website_security_regression: PASS`.

## Security properties verified

- QR credentials live in the URL fragment and are removed from browser history after capture.
- Only same-origin Worship Remote URLs are accepted by the scanner.
- PINs and QR tokens are stored as SHA-256 hashes; plaintext is returned only at creation.
- Pairing claims expire after 10 minutes; claimed sessions expire after 8 hours or explicit revocation.
- Claims require an authenticated active member of the same team.
- Incorrect PIN attempts are limited to five per authenticated user per ten-minute window in a private Supabase table.
- Session Realtime topics are private and authorized only for the Presenter creator and paired member while active.
- New private QR claims do not disclose the retained legacy channel secret.
- All security-definer functions pin an empty search path and deny anonymous execution.
- The legacy secret-topic policy remains temporarily for already-installed desktop builds, as required by the compatibility plan.

## Remaining deployment evidence

Local implementation is complete. Production still requires the additive migration, website release, and updated Windows desktop release in that order. A final real-device test with a Windows PC and phone over both Wi-Fi and mobile data remains a manual release gate because this environment cannot prove camera hardware, mobile-network handoff, or an installed production executable.
