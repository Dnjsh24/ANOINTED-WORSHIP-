# Transparent Sunday Setlist homepage banner

Ticket: BRAND-03. User authorized applying the latest rhythm banner, retaining Ministry Planning inside it, removing the repeated heading underneath, and making the banner background transparent.

## Change

The homepage uses public/brand/sunday-setlist-banner-transparent-v3.svg. It contains the established violet SS geometry, off-white Sunday Setlist wordmark, lavender Ministry Planning subtitle and six music rhythm bars. It has no background rectangle or opaque backdrop. A 1500 x 300 transparent PNG export is also available beside the SVG.

Imagegen was used to request a transparent edit of the selected generated banner. That result had rough edges, so the production asset is a clean vector interpretation based on the existing brand shapes and matching layout. The draft is not installed. This preserves the selected design direction with sharp typography and true transparency rather than promising a pixel-identical extraction.

The separate visible Sunday Setlist / Ministry Planning heading beneath the previous banner is removed. The banner sits inside the semantic h1 with alt text Sunday Setlist Ministry Planning, so assistive technology retains the main heading. Natural 5:1 dimensions, h-auto/w-full/max-w-xl sizing and existing spacing are used. Description, CTA, navigation and dashboard preview remain intact. The new asset URL prevents the prior cached banner from hiding the change. Old assets are retained.

No data, schema, stored team name, authentication, desktop, dependency or remote service changes occur. Existing unrelated edits and earlier tickets remain intact. No push/deployment is authorized.

## Evidence

- Coordinator Sharp export: width 1500, height 300, hasAlpha true, corner alpha 0.
- Maya page ESLint and scoped diff whitespace checks passed.
- Coordinator npx tsc --noEmit --incremental false: exit 0.
- Production-demo build (`E2E_FORCE_DEMO=1 NEXT_PUBLIC_E2E_FORCE_DEMO=1 npm run build`): exit 0, Next.js 16.3.8 compilation, TypeScript, generation and tracing passed. Production preflight intentionally skipped outside Vercel production.
- Existing targeted Playwright checks: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3102 E2E_FORCE_DEMO=1 NEXT_PUBLIC_E2E_FORCE_DEMO=1 npx playwright test e2e/branding.spec.ts e2e/app.spec.ts --grep 'Sunday Setlist branding|landing page routes' --reporter=line`: 4/4 passed in 24.0 seconds on Chromium and Pixel 7. Accessible main heading, onboarding, visible image loading, overflow and 1024-pixel tablet header bounds pass.
- Laura independently approved source/assets and final desktop/mobile screenshots. PNG has 359443 fully transparent pixels out of 450000, with alpha zero at all four corners. SVG contains no background shape, filters or external image references. Content outside the hero block is unchanged from BRAND-02. Final candidate packet SHA-256: 97ad7e9b890dfb6168470e1b69cce2fb2af66a35d92013ce650b4ab3a609780d.
- Final screenshots: [desktop](testing/sunday-setlist-transparent-banner-desktop.png), [mobile](testing/sunday-setlist-transparent-banner-mobile.png). Both show a seamless page background with no black banner rectangle or repeated visible heading.

BRAND-03 is Done, completed 1/1. Applicable gates pass with the evidence above, no local blockers. Local demo preview restarted on localhost:3102; no push/deployment performed. Prior release statuses remain unchanged.

Skills reused: imagegen, Caveman, clean-code-typescript, Ponytail, accessibility-wcag, code-review, engineering-gates and completion-mandate. Requested role settings Maya gpt-6-luna medium, Laura gpt-6.1-sol medium; effective runtime and usage telemetry unavailable. Risk: low UI change, standard lane. Coordinator owns assets/evidence; Maya owns homepage only; Laura independent read-only review.

Applicable gates: 01–20 cover scope/criteria/ownership, reusable brand shapes, code style, SSR-safe rendering and accessible semantic heading. Gate 13 N/A for one source implementer with separately owned assets/evidence. Gates 21–29 N/A because no data input/error/schema/RLS boundaries change. Gates 30–37 require the build, typecheck, scoped lint, affected existing browser tests, security-boundary review, accessible visual layout and final independent review. No new domain logic warrants new unit tests or coverage threshold changes.
