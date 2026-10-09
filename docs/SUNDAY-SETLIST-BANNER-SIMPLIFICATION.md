# Banner simplification

Ticket BRAND-04: remove the rhythm bars shown by the user, adjust the banner's side space, and slightly enlarge Ministry Planning.

The v4 transparent SVG removes all six rhythm-bar rectangles. The canvas is cropped from 1500 x 300 to 1000 x 300, eliminating unused space on the right. Ministry Planning increases from 58 to 64 font units (10.34%). The SS mark, main title and colors are unchanged. A matching transparent PNG is supplied. The homepage changes only the image URL, intrinsic width and maximum CSS width (max-w-lg instead of max-w-xl), keeping the larger footprint restrained and preserving the accessible h1/alt name. Earlier assets are retained; the fresh v4 URL avoids stale cache artwork.

No authentication, stored data, dependencies, desktop code or remote services change. Standard lane, low UI risk. Coordinator owns assets/records; Maya homepage only; Laura independent review. Prior skills/gate guidance reused. Requested worker defaults Maya gpt-6-luna medium and Laura gpt-6.1-sol medium; effective model/effort/usage telemetry unavailable.

## Checks

- Page ESLint and scoped whitespace checks: pass.
- npx tsc --noEmit --incremental false: exit 0.
- Local production-demo npm run build with process-scoped E2E_FORCE_DEMO=1 and NEXT_PUBLIC_E2E_FORCE_DEMO=1: exit 0. Next.js 16.3.8 compilation, TypeScript, page generation and tracing pass. Production preflight intentionally skipped outside Vercel production.
- PNG export: 1000 x 300, hasAlpha true.
- Existing affected branding browser tests (`PLAYWRIGHT_BASE_URL=http://127.0.0.1:3102 E2E_FORCE_DEMO=1 NEXT_PUBLIC_E2E_FORCE_DEMO=1 npx playwright test e2e/branding.spec.ts --grep 'Sunday Setlist branding' --reporter=line`): 2/2 passed in 15.7 seconds on desktop Chromium and Pixel 7. Image loading/alt text, page titles, viewport overflow and 1024-pixel header bounds pass.
- Laura independently approved the source, assets and final desktop/mobile screenshots. Painted bounds (12,32) to (933,263) fit within the 1000 x 300 canvas. All four PNG corners have alpha 0; 233943/300000 pixels are fully transparent. Exactly three source property replacements reconstruct the prior reviewed candidate. Final three-file review packet SHA-256: eedcc0cdcb71c46f26a9dc714204d175715364cdab43ed7a6c3b625f7ff186ea. No findings.
- Final screenshots: [desktop](testing/sunday-setlist-banner-v4-desktop.png), [mobile](testing/sunday-setlist-banner-v4-mobile.png).

BRAND-04 is Done, completed 1/1. All applicable gates pass; no local blockers. Updated demo preview is running on localhost:3102. No push/deployment performed; prior release statuses remain intact.

Gate applicability: intake/ownership/code/UI/SSR gates 01–20 apply, with gate 13 N/A for one source implementer and separately owned assets. Data/migration/RLS gates 21–29 N/A. Verification/security/accessibility/final-review gates 30–37 apply through source checks, build, no new security/dependency boundaries, existing browser paths and independent review. No domain logic changed; no new unit tests or coverage changes needed. No push/deployment authorized.
