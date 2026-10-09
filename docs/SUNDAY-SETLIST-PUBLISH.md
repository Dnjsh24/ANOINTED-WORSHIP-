# Sunday Setlist main integration

Independent final approval: Laura approved source/assets/tests packet SHA256 3ce06b68139458387487c3e407b5ff46da36cb45d068726688334738c663446b after reviewing final main-based screenshots. All 11 affected browser checks accepted; no remaining findings.

User explicitly authorized pushing to main. Prepared an isolated checkout based on origin/main 8dbd4db because the original workspace branch was 73 commits ahead and 22 behind main and contained unrelated desktop work. Only reviewed website branding changes and evidence were applied; no unrelated branch commits or working files included.

Conflicts resolved with main's useRouter login navigation, member usage tracking, navigation pending state, unread message badges, permission overrides and dashboard behavior retained. Projector change is one brand image line, with intrinsic dimensions corrected to the SVG's 1100 x 256 viewBox. Landing uses approved transparent v4 banner; login uses selected logo-only minimal layout. Production website/PWA identity is Sunday Setlist. Stored team identity, desktop protocol/product names, credentials, database/storage and deployed URL preserved.

Exact main-based candidate verification:

- npm ci --no-audit --no-fund: pass, lockfile unchanged.
- npm run lint:website: strict zero-warning pass.
- npm run build with process-scoped E2E_FORCE_DEMO and NEXT_PUBLIC_E2E_FORCE_DEMO flags: pass including TypeScript, 45 routes. Demo build evidence, no live-account claim.
- npm audit --omit=dev --json: zero vulnerabilities in exact installed main lock. Original dirty workspace installation reported one source-map-js advisory; its dependencies are not included in this commit.
- node scripts/scan-secrets.mjs: detector self-test passes, zero findings.
- Playwright affected branding, metadata/icons, landing and join-flow checks: 8/8 pass across Chromium and Pixel 7 in 23.2 seconds, remote Supabase blocked.
- Additional desktop 1280 x 800, Pixel 7 and 320 x 640 login checks: 3/3 pass loaded 96px logo above heading, no descriptor/overflow, keyboard focus and actual missing-config sign-in click retained router error handling. Screenshots testing/sunday-setlist-main-login-desktop.png, -mobile.png and -narrow.png.
- Staged diff whitespace and unresolved-conflict checks pass. Independent Laura source review confirms main features preserved, no unrelated desktop implementation included; projector dimension finding resolved.

Standard low-risk branding lane. Full unrelated unit/coverage/database suites N/A; no changed domain algorithms/schema/auth boundaries/dependencies. No new migrations or environment settings required. No force push. Original workspace and its local preview preserved.

Historical brand records describe earlier original-branch candidates; this record is authoritative for the main integration candidate. Effective worker settings/usage telemetry unavailable.
