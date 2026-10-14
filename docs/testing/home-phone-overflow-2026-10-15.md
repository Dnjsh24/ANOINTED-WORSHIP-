# Home phone overflow correction — 2026-10-15

HOME-01 corrects sideways scrolling on the existing Home page. The user reported it on Realme 8, Galaxy Fold 5 and iPhone 8 Plus. All content, actions, styling, data loading and permissions are retained; only layout geometry changes.

## Candidate and scope

- Clean attached release checkout, branch `codex/home-phone-overflow`, based on fetched main `ee001f3cb870a1f9f2793d3953f917fc66099f0a`.
- Production alias was rechecked: READY deployment `dpl_qs7A4Kv1p2DvDTGrkbWhnh5oYmA9`, same main SHA.
- Exact release allowlist: `src/app/dashboard/page.tsx`, `e2e/dashboard-responsive.spec.ts`, this document. Original dirty workspace and review gallery are preserved.
- Maya owns layout and regression; coordinator owns integration, evidence and release; Laura independently reviews source and Layra independently reviews design/accessibility and runtime. Requested Maya/Layra Luna medium / Laura Sol medium; effective model/effort and usage telemetry unavailable.
- User's existing explicit branch-push/main-merge authorization for the phone-layout update covers this narrow corrective release. No remote settings, credentials, account data or database changes are authorized or needed.

## Cause and correction

The mobile grid had an implicit column that grew to its content's minimum width. A valid 67-character unbroken service name expanded the document to 1939px at a 320px viewport. After constraining the grid, unbroken song and next-event names independently exposed flex minimum-width overflow (668px and 665px documents).

The page now declares a single mobile `minmax(0, 1fr)` grid track, constrains its flex children, and wraps service/song/notice/reminder/celebration names. The next-event and service metadata values use explicit wrap-capable spans; icons, labels and celebration dates retain their space. Desktop's existing two-column tracks and styles are retained. No global overflow clipping is added to conceal content.

There are no query, API, auth, schema, caching, install, dependency, storage, offline or save behavior changes. There are no new components or subscriptions. Existing source strings, hrefs and permission conditions are unchanged. The public landing/login Wooly guard and movement behavior are outside this change.

## Verification

Final application SHA-256: `03194fcfb23093b149766acf044613addcc5d37b4c30926d7caefb14289609c6`.

Final browser regression SHA-256: `276f49660d29ad3b5df6e72638dfc1d9f26490a3eac5ca2e0827713a5d77edf9`.

The focused test mutates text only in the hydrated real local Home DOM. Fixtures use valid long field values without writing server/account data. It preserves complete text, checks each rendered text fragment against its container, checks action bounds and document width, rejects page errors, and blocks remote Supabase requests. Before injecting fixtures it opens/closes the existing Notifications menu to establish client hydration. This prevents test-only pre-hydration DOM mutations from causing React mismatches observed during development.

| Check | Result |
| --- | --- |
| `npm run build` with explicit local demo/Wooly flags | Pass; optimized production build served on local port 3224 |
| `npm run lint:website` | Pass, zero warnings |
| `npm run typecheck` | Pass |
| `git diff --check` | Pass |
| `playwright test e2e/dashboard-responsive.spec.ts e2e/responsive.spec.ts --grep 'Home keeps\|existing header actions\|navigation fits' --reporter=line` against production build | 12/12 pass across Chromium, mobile Chromium, tablet Chromium and iPhone WebKit |
| Long-field viewport matrix | All 48 profile/size combinations pass: 320, 344, 360, 390, 393, 412, 414, 430, 768, 844×390 landscape, 1024, 1440 |
| Existing Home shell interactions | Notification/edit-request panels and settings navigation; bottom/desktop navigation and More drawer remain functional |
| `npm audit --omit=dev` | Zero production vulnerabilities |
| Full `npm audit` | Five existing high development lint-toolchain findings; unchanged dependencies |
| Secret scanner | Self-test passes, findings empty; final commit scan required before push |
| Website unit/coverage suite | Two local runs each1195/1196: first existing release-scope temporary Git repository setup hook exceeded10seconds under default worker load; bounded2-worker rerun passed that test but existing Practice note-save test raced pending state on its second save click. Neither file is changed by HOME-01. Isolated rerun20/20 passed with unchanged assertions/timeouts. Protected `quality` CI must pass full unit/coverage gates before merge. |
| Independent review | Approved for responsive geometry: Laura source review has no blocker; her runtime worker hit account usage limit. Layra independently confirms both frozen hashes, identical ordinary desktop geometry at1440, phone/landscape containment at320/344/360/414/844×390, 23 long-content fragments contained, actual event/setlist/song/messages navigation, Edit requests toggle and Notifications opening; no page errors or Supabase requests. Notification keyboard dismissal was not confirmed in her review; coordinator's existing production panel tests verify opening/closing through the trigger. |
| Desktop visual regression | Baseline/candidate1440×900 captures are byte-identical, SHA-256 `8e1f826c0070249c206b589eef05a98ce9f8edad84fa7ce60a78f6143c53f8b4`; main bounds x80/y65/w1280/h1123.25 match. |

No physical Realme/Fold/iPhone hardware, OS keyboard or private authenticated records were available. Browser emulation covers the relevant narrow widths and WebKit engine; it is not physical-device acceptance. True 200% browser/OS text enlargement remains unverified: automated Chromium keyboard zoom chords did not change viewport or DPR, so this is explicitly not recorded as a pass. The demo has no upcoming celebration record, so its optional name wrapping has source review but no claim of persisted-account runtime coverage.

## Engineering gates

Gates 01–06: outcome, criteria, scope, low-risk standard lane, no blocked implementation dependencies and ownership are recorded above and in the existing root ticket. Gates 07–12: repository navigation/release policy and installed Next CSS guide reviewed; only layout geometry changes, existing data/authorization flow retained, meaningful long-content regression defined. Gates 13–22: isolated checkout, required skills reused, typed readable code with no duplicated components; server-rendered content and hydration preserved; existing validation/error handling unchanged. Gates 23–29: N/A to this layout-only change (no database schema, data-flow or RLS changes); required protected CI still runs the existing local-database checks. Gates 30–32: build/typecheck/website lint pass. Gates 33–37: browser tests/audit/source and independent runtime review pass; local intermittent unit failures and isolated passes disclosed. Exact clean scope/final secret scan and protected full CI gates are required for release.

## Release handoff

Independent review record and screenshots are preserved outside the release packet in the attached gallery worktree: `docs/design/phone-layout-only/evidence/home-overflow-review.md`. No screenshots, account state or gallery source are published with this correction.

Before publication, fetched main advanced to `0900bf1ba1332c4003a7d83a5422cd8ddbd10d17` (separate Practice annotations PR20). That change touches no Home source/shell/global CSS or new Home test. Integrate current main without replacing its files; final release scope remains exactly the three HOME-01 paths. Recheck affected browser/static/build checks after integration; all required full CI checks must pass on the final head.

Publish only the reviewed three-file packet through a protected-main PR. Require `quality`, `browser`, `local-database`, current-main ancestry and exact reviewed head. Verify automatic production deployment uses the merged main SHA and run the read-only production smoke check. Do not manually deploy a feature-branch artifact, bypass protection, force push or delete branches.
