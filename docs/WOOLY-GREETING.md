# WOOLY-18: ten-second opening cloud

Status: Review, local implementation complete; final acceptance 0/1.

The existing “Need help?” cloud appears for ten seconds when the website or installed PWA opens. Returning from the background or restoring a page from browser history starts a fresh ten-second window. Ordinary route renders and opening/closing Wooly's panel do not restart the timer. The panel continues to hide the cloud while open. Wooly's character launcher remains available after the cloud disappears.

The shared layout provider owns the greeting lifecycle through `use-wooly-greeting.ts`. Timers and page-visibility/history listeners are removed on unmount or when Wooly is disabled. React Strict Mode's effect cleanup is covered. The cloud remains decorative, while the launcher keeps its accessible name and keyboard behavior. Existing artwork, animations, reduced-motion CSS and placement are unchanged.

No account storage, caching, schema, database migration, credentials, remote action, environment configuration or separate desktop application change is involved. A reload starts a new greeting without persistent state.

## Verification

| Check | Result |
|---|---|
| Targeted timer, provider, report and chat tests | 51/51 in four files pass. Boundary timing, rerenders, fresh opening, background return, history restoration, disabled behavior and cleanup covered. |
| Affected-code coverage | Statements 90.45%, branches 83.82%, functions 86.71%, lines 96.48%; unchanged 80% thresholds. |
| Current-source types | `npx tsc --noEmit --project .tmp/wooly/tsconfig.json` passes. |
| Strict changed-code lint | Provider, hook and hook test pass with zero warnings. |
| Preview production bundle | Vite build passes, 138 modules. |
| Source delta | Provider baseline has only the hook import/call and greeting condition changes. Approved cloud/CSS/artwork are untouched. |
| Full root build/lint | Not repeated for this small UI lifecycle change. Existing global failures and the earlier full website run remain recorded in `WOOLY-CHAT-SUPPORT.md`. |
| Browser/PWA and independent review | Pending under the existing browser restriction and reviewer's account usage limit; no workaround or false pass. |

Logs, coverage, provider baseline and final hashes are in `output/wooly-greeting/`. The initial test command also matched archived baseline tests; the accepted repeat explicitly excludes `output/**` and `.tmp/**`. No application repair was needed. Effective model/effort and usage telemetry are unavailable.

The accepted test command uses `vitest.website.config.ts`, workspace-local TEMP/TMP, two workers, the four affected test files, and coverage for the greeting hook and provider. No broader suite or database check was needed for unchanged backend behavior. Next: allowed visual/PWA confirmation and independent final review. Disabling Wooly or removing the hook condition restores the prior UI without affecting saved support or tutorial data.
