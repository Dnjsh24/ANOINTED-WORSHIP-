# Sunday Setlist login banner placement

Final status: Done, completed 1/1. Laura independently viewed both screenshots and approved the final candidate without findings. No blockers or remaining work.

BRAND-05, 2026-10-09. User requested the brand name beside the sign-in wording below Welcome Back, followed by the banner.

The login header now shows Welcome Back, then Sign in to Sunday Setlist, then the approved transparent v4 banner with Ministry Planning. Removed the logo above the heading. Image uses intrinsic 1000 x 300 dimensions, responsive width, descriptive alternative text and a 24-pixel top gap. Google sign-in handler and status messages are unchanged.

Verification: scoped ESLint has zero errors and three pre-existing navigation warnings; whitespace check passes. Production demo build passes including TypeScript. Targeted Chromium desktop 1280 x 800 and Pixel 7 checks both pass: loaded banner, heading/sign-in/banner/button order, and no horizontal overflow. Screenshots: testing/sunday-setlist-login-desktop.png and testing/sunday-setlist-login-mobile.png. Independent source reviewer Laura reports no findings, confirms auth handler equivalence and responsive dimensions. Source SHA256 d2179bb91e19984e405d6016d4b9c9782c2119e1294d1aa7c4119ef078a4df5c.

Gates: acceptance, source review, scoped lint, build/typecheck and affected responsive browser checks covered. No new tests needed for this reversible layout edit; unrelated full unit/coverage/security/database suites not applicable. No storage, schema, dependency, offline, service or environment changes. No push or deployment. Local preview localhost:3102 restarted. Effective worker settings/usage telemetry unavailable.
