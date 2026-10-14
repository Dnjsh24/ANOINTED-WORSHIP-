# Wooly on the actual local website — WOOLY-13

2026-10-11. The user explicitly selected **Real website on this computer**. Wooly is enabled in the running Next.js development server at [the actual dashboard](http://127.0.0.1:3100/dashboard). Use **Help → Show me this page**. This uses the actual application routes, controls and stable tutorial targets, including the larger character, speech bubble and typed explanations from WOOLY-11/12.

The shared root layout and `AppShell` were already connected to Wooly. No application source change was required. The server was started with process-local `WOOLY_TUTORIAL_ENABLED=1`, `ANW_DESKTOP_MODE=0` and `ANW_DESKTOP_BUILD=0`. No persisted environment or credential file was modified. These overrides end when this server stops.

The effective development environment has no configured Supabase URL/publishable-key pair. The application therefore uses its existing sample-data/demo context. Wooly does not read or save account checkpoints in this context. Real authenticated progress still requires the previously documented migrations and account configuration. No live website, remote database, deployment, feature flag in hosting, credentials or separate desktop application was changed.

## Runtime evidence

- Next.js 16.3.8 reports **Ready in 451ms**, and successfully loads `next.config.ts`. The new startup error log is empty.
- Main website listener: `127.0.0.1:3100`, child PID3232, launched by PID20180. The existing isolated preview remains on `127.0.0.1:3194`, PID17016.
- The first sandboxed launch stopped on an SWC native Windows path-access error. The approved outside-sandbox launch succeeded. No application repair was needed and no approval review rejected the launch.
- Logs and process metadata are saved under `output/wooly-main-site/`. The previous [WOOLY-12 candidate](../output/wooly-dialogue/candidate.json) still matches the two application files. Its 95 passing focused tests, current-source typecheck, strict provider lint, CSS parser and isolated preview build remain applicable to that unchanged source; they were not rerun for this process-only activation.

Startup and listening-port checks establish server availability, not rendered page, physical-device, screen-reader or browser acceptance. The existing browser policy restriction and independent reviewer usage limit persist. No alternate browser access was attempted. The account-connected Supabase plugin exposes a different project than the archived website configuration, so it was not used to inspect or modify that unrelated project.

## Settlement

Status **Review**, completed0/1 final local visual acceptance. Local activation is complete; next is user/allowed browser confirmation on the real pages and independent review when available. Existing WOOLY-11/12 acceptance and full-root gate limitations remain documented in their records. No gate is claimed passed through the configuration change: engineering-gates 01–12 establish scope/ownership and existing integration; 13–29 and 35 have no changed implementation/data/dependency boundary; 30–33 reuse unchanged candidate evidence; 34, 36 and 37 retain their visual/independent-review limitations. Effective model/effort/usage telemetry is unavailable. No issue reached three failed repair attempts.

To restart the same local session from the repository root, first ensure the earlier server has stopped and the development environment still uses the intended sample-data context:

```powershell
$env:WOOLY_TUTORIAL_ENABLED = '1'
$env:ANW_DESKTOP_MODE = '0'
$env:ANW_DESKTOP_BUILD = '0'
npm run dev -- --hostname 127.0.0.1 --port 3100
```

For an authenticated environment, apply and verify both tutorial progress migrations before enabling Wooly. Remote changes and deployment need their own explicit authorization under the accepted plan and repository action boundaries.
