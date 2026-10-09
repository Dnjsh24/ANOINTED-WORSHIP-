# Sunday Setlist website rebrand

Ticket: BRAND-01. User selected logo option 4, the violet interlocking SS monogram, and authorized replacing all website names and logos. Standard lane, low risk. No deployment or push is authorized.

## Scope and baseline

The current checkout starts from 4cff705d895d6062e0e5fcc63861898c398429ee with substantial unrelated desktop and release work. Those changes are preserved. No PROJECT-BRIEF.md was present. Existing tickets.md remains the ticket source.

Website brand surfaces include landing navigation/hero/footer, sign-in, team selection/creation/join/pending, desktop and mobile app navigation, dashboard fallback greeting, remote pairing, projector idle screen, install/update prompts, errors, metadata, manifest, and notification defaults.

Stored team names and user data are not renamed. Desktop bridge names, protocol handlers, storage keys, rate-limit namespaces, actual deployment URL, support configuration, and desktop product identity remain unchanged. No schema, RLS, environment, credential or remote-service changes are needed.

## Assets

The selected generated SS design supplies the banner, social card and original dark logo. The generated transparent drafts had artifacts, so production logos use a clean geometric SVG reconstruction of the selected two-color SS mark and off-white wordmark. This is a faithful vector interpretation, not a pixel-identical trace. The SVG renders to a clean transparent PNG with Sharp. Browser/app icons are exported from the same SVG with a dark background and safe padding.

Brand paths: public/brand/sunday-setlist-logo.svg, sunday-setlist-icon.svg, sunday-setlist-logo-transparent.png, sunday-setlist-banner.png, sunday-setlist-og.png, sunday-setlist-logo-dark.png and sunday-setlist-app-icon.png. New icon URLs use the sunday-setlist prefix to avoid old cache entries. Previous public asset paths receive compatible SS replacements. Next.js src/app/favicon.ico also receives the new mark.

Banner: 1800 x 600. Open Graph/social: 1200 x 630. Browser PNG icons: 16 and 32 pixels. Apple icon: 180 pixels. PWA icons: 192 and 512 pixels; maskable icon has safe padding.

## Acceptance and checks

1. All user-visible website brand text uses Sunday Setlist.
2. All product logo placements use the selected SS design, with legible responsive sizing and accessible names.
3. Banner, sharing metadata, favicons, installable-app icons and notification defaults use the new identity.
4. Existing data, team identity, authentication and internal integrations are preserved.
5. Scoped lint, TypeScript, production-demo build, desktop/mobile branding browser checks and independent Laura review pass.

Required skills loaded: Caveman, engineering-gates including the 37-gate reference, and completion-mandate. Maya loads clean-code-typescript, Ponytail and accessibility-wcag. Laura independently loads code-review and accessibility-wcag. Effective worker role defaults are Maya gpt-6-luna medium and Laura gpt-6.1-sol medium; coordinator model/effort and monetary usage telemetry unavailable. No gold lane was selected.

## Gate applicability

Gates 01–12 apply through the scoped criteria, current tree review, ownership assignments and boundary preservation above. Gate 13 is N/A: only one source implementer; coordinator asset/test work has explicit non-overlapping ownership. Gates 14–20 apply through loaded guidance, project-style components, existing Next image conventions and SSR-safe logo rendering. Gates 21–22 have no new user-input or error-handling boundaries. Gates 23–29 are N/A: no database or authorization changes. Gates 30–37 require build, typecheck, lint, browser checks, scoped regression evidence, dependency/security review, accessibility and final independent diff review. Unit coverage thresholds are unchanged; this branding work does not change covered domain logic.

## Validation and final settlement

BRAND-01 is complete. Earlier release tickets retain their prior statuses. No push or deployment was performed.

- `npx tsc --noEmit --incremental false`: exit 0, no diagnostics.
- `E2E_FORCE_DEMO=1 NEXT_PUBLIC_E2E_FORCE_DEMO=1 npm run build` (variables set only in the build process): exit 0. Next.js 16.3.8 webpack compilation, TypeScript, static generation and tracing passed. Production environment preflight was intentionally skipped outside a Vercel production build; this is local demo build evidence, not production account validation.
- Maya's scoped ESLint across changed source: zero errors, eight unchanged baseline warnings in actions.ts, login/page.tsx and pending-client.tsx. Laura compared the warning lines with HEAD and independently verified they predate this change. The strict `--max-warnings 0` command exits 1 on that baseline; it is not described as passing. Acceptance retains existing warnings and requires no new warnings. New brand components, coordinator browser tests and final repaired page/remote files pass their scoped ESLint commands.
- `node --check public/sw.js`, JSON manifest parsing, referenced asset existence and scoped `git diff --check`: passed.
- Browser command: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3102 E2E_FORCE_DEMO=1 NEXT_PUBLIC_E2E_FORCE_DEMO=1 npx playwright test e2e/branding.spec.ts e2e/app.spec.ts --grep 'Sunday Setlist branding|metadata, manifest|landing page routes|team join flow' --reporter=line`. Eight unique cases passed across Chromium and Pixel 7 after affected reruns. Four onboarding cases passed in the initial run. The branding pair passed in the final capture run (15.8 seconds); the metadata/icon pair passed after preview restart (2.7 seconds). The test covers eight public/team routes, visible logo loading/alt text, page titles, no stale website product names, mobile overflow, tablet header bounds at 1024 pixels, metadata, manifest, maskable icons and HTTP asset availability.
- Initial browser failure was a test checking a hidden lazy-loaded desktop image on mobile. The test now correctly checks visible logos. An independent review found the initially copied public/favicon.ico duplicated Next.js src/app/favicon.ico. The redundant public copy was removed; the Next favicon route and versioned public favicon remain. The already-running preview needed restart to refresh its public-file inventory; final favicon requests return success.
- Laura independently verified PNG dimensions, maskable safe padding, all manifest targets, the service-worker public-asset cache boundary and preservation of authenticated-page fetch exclusions. Source/asset review and desktop/mobile/tablet screenshot inspection found no remaining change-related issues.
- Final 44-file review packet SHA-256: `1ca7e0331b68700b184ab5a1e88cc7eb0d61aee7b92d1e7d4dba7f946d09177f`. Final branding test SHA-256: `c7160592839a22cf1c14770c89dccce7938820079760a7ce91bcc226f7f7b2ea`. Independent reviewer: Laura, configured gpt-6.1-sol medium; effective runtime settings remain unverified.

Screenshots: [desktop home](testing/sunday-setlist-chromium-home.png), [mobile home](testing/sunday-setlist-mobile-home.png), [desktop dashboard](testing/sunday-setlist-chromium-dashboard.png), [mobile dashboard](testing/sunday-setlist-mobile-dashboard.png), [tablet dashboard](testing/sunday-setlist-tablet-dashboard.png). Animations are disabled during screenshot capture.

Gate disposition: gates 01–20 pass for the relevant branding surface; parallel implementation gate 13 is N/A for a single implementer with non-overlapping coordinator asset/test ownership. Gates 21–29 are N/A for new data boundaries, migrations and RLS. Gates 30–34 pass via build, typecheck, scoped lint and meaningful browser integration checks; no new domain logic needs unit tests or coverage changes. Gate 35 passes scoped security review with no dependency/authentication/data changes; existing cache exclusions remain intact. Gates 36–37 pass accessible image/link names, responsive browser checks and final independent diff/visual review. No production service, account, data or device-specific release claims are made.
