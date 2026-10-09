# Sunday Setlist homepage banner refinement

Ticket: BRAND-02. User requested removal of the homepage banner's purple side glows and a more professional presentation. Low risk, standard lane; no publication is authorized.

The imagegen edit used the existing banner as its reference and retained the selected violet SS symbol and off-white wordmark. The new dark-field image is exported at 1800 x 600 as public/brand/sunday-setlist-banner-v2.png, with its generated master preserved beside it. The original banner is retained. The homepage uses the fresh v2 URL, preventing the previous service-worker image cache key from hiding the update. Bottom spacing changes from mb-5 to mb-6 sm:mb-8. Alt text, intrinsic dimensions and responsive image sizing are preserved.

Exactly two homepage source lines changed relative to the previously reviewed rebrand. No other page, social image, stored data, team identity, authentication, schema or desktop integration was changed.

## Verification

- Page ESLint: exit 0; Laura independently repeated `npx eslint src/app/page.tsx --max-warnings 0` and scoped whitespace checks successfully.
- `npx tsc --noEmit --incremental false`: exit 0.
- Independent source/asset review: Laura approved; side glows absent, brand remains legible, dimensions match and responsive/accessible image behavior retained. Candidate aggregate SHA-256: c87e123d0d84d3ec3ce4249f035767974e7d3bb64e767b99b58d033c3f3b139d. Banner SHA-256: 10abecfb98d22c5b3ff85eb3be590a522d01be66d89a243297f66b74724061f9. Homepage SHA-256: 0bee3080103ae10c3008a4d5921ce1178f20e362b27e885ace5f3ae7c8a7d2a9.
- `E2E_FORCE_DEMO=1 NEXT_PUBLIC_E2E_FORCE_DEMO=1 npm run build`: exit 0. Next.js 16.3.8 compilation, TypeScript, generation and tracing passed. Local demo build; production environment preflight intentionally skipped outside Vercel production.
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3102 E2E_FORCE_DEMO=1 NEXT_PUBLIC_E2E_FORCE_DEMO=1 npx playwright test e2e/branding.spec.ts --grep 'Sunday Setlist branding' --reporter=line`: 2/2 passed in 27.8 seconds, desktop Chromium and Pixel 7. Existing tests check visible brand image loading, accessible alt text, eight page routes, viewport overflow and 1024-pixel dashboard header bounds. No new test or coverage threshold change was needed.
- Final screenshots: [desktop](testing/sunday-setlist-banner-v2-desktop.png), [mobile](testing/sunday-setlist-banner-v2-mobile.png). Coordinator inspected the homepage result; independent QA approved the unchanged source/asset candidate before the build/browser checks.

BRAND-02 is Done, completed 1/1, no local blockers. Applicable gates pass with the evidence above; no changes were pushed or deployed. The local preview was restarted on port 3102 with demo data and the refreshed banner.

Skills reused: imagegen, Caveman, engineering-gates and completion-mandate; independent QA reused code-review and accessibility-wcag. Laura requested role settings gpt-6.1-sol medium, effective runtime unverified. Coordinator model/effort and monetary usage telemetry unavailable.

Gate applicability: intake/ownership/scope and UI implementation gates 01–20 apply; gate 13 N/A for single source editor. Data/error/migration/RLS gates 21–29 N/A because no such boundaries change. Build/typecheck/lint/browser/security/accessibility/final review gates 30–37 apply with the evidence above; no new domain logic or dependency change requires unit/coverage/security-audit expansion. Existing test framework and thresholds are preserved.
