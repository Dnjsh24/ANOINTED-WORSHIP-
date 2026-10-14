# Phone layouts and movable Wooly: release evidence

The user authorized publishing the reviewed update to a branch and merging it into main, with no secrets. Release branch: codex/phone-layout-wooly-release. Base: current main167f3af2d2d0818fe0fd224b550e2e2a388ad408. The original dirty workspace and local gallery are preserved.

## Behavior and scope

Existing phone layouts now expose the header actions, constrain menus and pickers, wrap form toolbars and event tabs, and contain the member table. Desktop workflows, content and permissions are preserved.

Wooly can be dragged with mouse/touch, moved with arrow keys or Help's directional buttons, and reset with Home or Reset. Tap, Enter and Space still open Help. Position remains in provider memory through page navigation and resets on full reload. Manual positioning overrides default navigation/composer clearance; Reset restores the default. The launcher and greeting stay within measured viewport bounds. Public landing/login pages do not mount Wooly; guest registration is denied, and public-route render guards immediately remove any stale account portal.

Fifteen app-file bytes match the independently reviewed local identity becb3aaab69143ab0832a2c768e6e42d18186e6017140b6d387eb9d20746e386. The release additionally includes seven affected test/config files, shared JSDOM test setup, the dedicated enabled-Wooly CI invocation and this evidence file:25 paths total. The movement E2E has a120-second budget for repeated real tap interactions on CI; no assertion or application timer was weakened.

There are no API, auth-session, schema, RLS, dependency, artwork, install identity, caching or offline changes. No environment or credential file is part of the release. Gallery assets and private browser state remain local. No new environment variable or migration is required; the existing Wooly feature flag remains unchanged.

## Verification baseline

The reviewed local candidate passed build/TypeScript, strict website lint,51 affected unit tests,10 production browser tests and Laura's67 independent Chromium/WebKit checks. The prior responsive phase passed35 units,6 final production interactions and22 independent runtime checks. The actual-component gallery passes49 route patterns,294 page/size selections,732 images and no corrected main-content/control mismatches or overflow. Public-page image differences reflect the explicitly requested Wooly removal. These are baseline results; clean-release integration checks are recorded below.

Physical iPhone/Android touch, OS keyboard, hardware safe areas, assistive technology,200% OS text, saved/private-page content and active paired presentation remain unverified. Browser emulation is not physical-device approval. Existing test demo records are used; no messages, attachments, account changes or private records are submitted.

## Final release checks

Clean-release full website coverage passes156 files/1196 tests, with87.63% statements,84.08% branches,92.68% functions and90.62% lines; all80% thresholds pass. Strict website lint, TypeScript, production build and diff check pass. Affected production browser checks pass37/37 across Chromium, phone Chromium and iPhone WebKit: responsive shell, menus, seven-width reflow, song controls, composer reachability, setlist event switching and Wooly movement/public visibility/availability. App bytes remain identical to the independently approved fifteen-file identity.

The first full run found missing JSDOM pointer-capture methods in an additional Quick Report fixture (1195 pass,1 timeout,14 unhandled fixture exceptions). The compatibility methods were moved from the provider-only fixture to shared test setup, conditional on DOM availability and missing native support. The targeted report/provider/hook rerun passes48/48; final full coverage passes with no unhandled errors. This changes no production code or assertions. Independent review accepts the setup fix.

Secret scanner self-test passes with zero findings across2806 history blobs,405 commit messages and815 working files at the preparation checkpoint. Five oversized historical blobs and one unchanged binary sprite asset over5MB are skipped by the existing scanner; no new release file is oversized, an environment file or a private-key file. The unchanged sprite is public/brand/wooly/whole-frames-v3.webp (5847148 bytes). Final commit and message will be scanned again before push. Production audit has0 findings; full audit retains5 pre-existing high findings in lint tooling (braces,micromatch,fast-glob,eslint-config-next,@next/eslint-plugin-next). No dependency edit is included.

Exact committed scope and independent final-head approval are pending. Protected-main quality/browser/local-database checks must pass on the final head before merge. Main protection was read-only verified: required checks, strict up-to-date branch, administrator enforcement, no force pushes, zero mandatory GitHub approvals. No manual deployment or remote settings/data changes are included in this authorization.

## Engineering gates

01–22 passed: scoped request, explicit boundaries, ownership, current-main isolation, reviewed interfaces/client state, native pointer APIs and error/cancel handling.23–29 N/A: no database/RLS/schema change.30–36 passed for scoped local verification: build/types/lint/full unit coverage,37 browser checks, dependency/secret checks, keyboard and tap alternatives. Physical acceptance limits are disclosed above.37 requires exact committed scope, final independent approval and protected-main CI before merge. Source and tests use existing frameworks, no new dependency. Coordinator owns release integration and root tickets; Laura independently reviews the final candidate. Requested Laura Sol medium; effective launch settings and usage unavailable. Only one heavy build/browser job runs at a time.
