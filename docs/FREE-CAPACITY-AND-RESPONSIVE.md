# Responsive website and free-only capacity

The approved target is the highest **measured** sustainable active-user count on free Vercel, Supabase and Upstash plans, retaining the current design and all live features. No paid monitoring, trials, upgrades or new application dependency is required. A socket allowance is not an active-user guarantee. Budget for two four-hour busy sessions weekly (34.8 peak hours per average month), plus actual off-peak traffic.

## Provider ceilings checked 2026-10-08

- [Supabase Realtime](https://supabase.com/docs/guides/realtime/limits): 200 concurrent sockets, 100 messages/second, 100 channel joins/second, 20 presence messages/second. Additional tabs and presenter outputs count. Keep at least 20% headroom: 160 sockets and 80 events/second for test stops. Presence bursts and joins remain separate acceptance checks in provider logs.
- [Supabase quotas](https://supabase.com/docs/guides/platform/billing-on-supabase): 2 million realtime messages/month, 500 MB database, 1 GB file storage, 500,000 Edge Function invocations and 50,000 monthly active users. MAU is not concurrency. [Transfer](https://supabase.com/docs/guides/platform/manage-your-usage/egress) has independent 5 GB uncached / 5 GB cached allowances.
- [Vercel Hobby](https://vercel.com/docs/plans/hobby): 1 million function invocations, 4 active CPU-hours, 360 GB-hours provisioned memory, 1 million CDN requests, 100 GB transfer and 10 GB origin transfer. Verify the application's eligibility and actual account allowances before hosted testing. Quota exhaustion can interrupt service.
- [Upstash Free](https://upstash.com/pricing/redis): 500,000 commands/month, 256 MB data and 10 GB bandwidth. Existing rate-limit analytics are already disabled. Do not disable production rate limits to save quota.

Read-only MCP inspection confirmed the existing Supabase organization is Free and the target database is about 18.5 MB. Hosted history still contains 57 recorded migrations, ending at `20260811182630`; the usage RPC exists despite its missing history entry. These are baseline facts, not deployment acceptance. Do not rerun the usage migration blindly. No hosted performance or user-capacity pass has been established.

## Local browser verification

Use the project Node 22 runtime, install free browser binaries with `npx playwright install chromium webkit`, and build with `E2E_FORCE_DEMO=1 NEXT_PUBLIC_E2E_FORCE_DEMO=1 NEXT_PUBLIC_MEASURE_WEB_VITALS=1 npm run build`. Run `E2E_FORCE_DEMO=1 E2E_PRODUCTION_BUILD=1 npx playwright test --reporter=line`. On PowerShell, assign those environment variables separately before running the command. Clear demo flags before a real deployment.

The browser matrix includes Android Chrome, tablet Chrome, laptop Chrome and iPhone/WebKit. Responsive checks cover 320/393/768/820/1024/1280/1440 CSS pixels, short landscape, keyboard-sized viewports, focus restoration, drawer focus containment and touch targets. WebKit emulation does not replace final physical iPhone/iPad keyboard and safe-area checks.

`NEXT_PUBLIC_MEASURE_WEB_VITALS=1` enables Next's existing `useReportWebVitals` observer. It dispatches local `anointed-web-vitals` events containing only metric ID/name/value/rating. There is no network telemetry endpoint. Leave the flag unset in normal builds unless measurements are needed. [Targets](https://web.dev/articles/vitals) are p75 LCP ≤2.5s, INP ≤200ms and CLS ≤0.1; controlled lab evidence is distinguished from later real-user measurements.

## Repeatable load harness

Dry run, without browser/network activity:

```text
npm run capacity:free -- --config scripts/free-capacity.demo.json --dry-run
```

Against the running local production-demo build:

```text
npm run capacity:free -- --config scripts/free-capacity.demo.json
```

The smoke sample uses one then two browsing actors. It verifies the runner, not hosted capacity. Reports are written to ignored `.tmp/capacity/`; demo runs always report `capacityVerified: false`. The harness uses the already-installed Playwright browser and no paid tooling.

For hosted testing, place a private configuration in `.tmp/capacity/preview.json`, and pass that path instead. Set:

- `mode: "isolated-free-preview"`, the isolated HTTPS `baseURL`, the isolated `supabaseURL`, dedicated free `redisURL`, and a `baseline` with the full deployed `commit`, 14-digit `schemaVersion`, `freePlansVerified: true`, and `isolatedDataVerified: true`, `isolatedRedisVerified: true`. Confirm matching application/schema, Free plans, real remaining quotas and synthetic data first. Production website/project are explicitly refused. External embeds and redirects are blocked to avoid spending third-party or production quota.
- `stages: [25,50,75,100,125]`, `rampSeconds: 60`, `holdSeconds: 3600`, `thinkSeconds: 30`, `maxRequests: 100000`. The runner holds each ramp for 60 seconds, then soaks the final passing size for one hour. Include 10% extra tabs automatically. Increase only within 160 total sockets; stop at the first failed hosted stage. Request budget is cumulative across the run. Reduce stages or request budget when shared account allowances require it.
- Distinct synthetic `actors`, with opaque `id`, `role`, `teamId`, ignored private `storageState` file, and optional `device: "phone"|"tablet"`. Arrange at least two teams and all roles in every ramp prefix. Before opening pages or sending actions, the runner calls `/api/capacity/identity`. This uncached authenticated endpoint requires `CAPACITY_TEST_ENABLED=1`, Vercel preview mode, a Redis REST URL matching `CAPACITY_TEST_REDIS_REST_URL`, and the approved test database fbrmotzjsnmdpdkcxyqb; ordinary/production deployments return404. Verify the dedicated Redis resource and Free plan against provider evidence before setting the baseline flag; do not reuse production Redis for load. It reports actual deployed commit, Redis/backend origins, and the selected active user/team verified through existing getUser/team-context authorization. A wrong preview, copied identity, foreign selected team or custom production alias cannot pass admission.
- `browse` actors have `routes` such as dashboard/songs/setlists. `chat` actors have an `initialPath` for an authorized conversation and a same-team chat-role `peerId` whose page remains in that conversation. `editor` actors use an authorized, seeded setlist detail `initialPath` containing at least three songs. `presenter` actors use an authenticated paired `/worship-remote/session/<id>` `initialPath` with an online isolated Windows Presenter (website `/presenter` routes redirect to pairing), authorized projector `outputPath`, and `slides: [{buttonName,outputText}, ...]` with at least two distinct exact accessible button names/output texts. Each cycle observes a changed output slide; output tabs count toward socket headroom. `media` actors provide an authorized website or isolated-Supabase binary `mediaPath`. Give each editor its own setlist except the deliberate hot-team contention scenario. Fixtures persist only in the isolated test environment. Configure the existing test Presenter to the same isolated database, confirm cloud output broadcasts, and count its connections in provider headroom; no desktop source changes are included.
- `usageFile`: an ignored JSON snapshot refreshed by the operator/provider collector at least every five minutes. All 16 numeric gauges below are mandatory and cumulative for the billing period. Values come from actual provider dashboard/API evidence. Do not replace unavailable meters with zero. Static storage/MAU/unused Edge gauges retain current usage; all traffic/compute meters require positive measured deltas before capacity can be verified. Each media file is capped at5MB and cumulative media downloads at100MB per run; streaming cancels oversize responses even without Content-Length. The mixed workload must exercise both cached media transfer and uncached API transfer. Delayed or rounded meters remain inconclusive.

```json
{
  "recordedAt": "<actual ISO timestamp>",
  "vercelInvocations": "<actual measured number>",
  "vercelCpuHours": "<actual measured number>",
  "vercelTransferBytes": "<actual measured number>",
  "vercelOriginBytes": "<actual measured number>",
  "vercelMemoryGbHours": "<actual measured number>",
  "vercelCdnRequests": "<actual measured number>",
  "redisCommands": "<actual measured number>",
  "redisStorageBytes": "<actual measured number>",
  "redisTransferBytes": "<actual measured number>",
  "supabaseUncachedBytes": "<actual measured number>",
  "supabaseCachedBytes": "<actual measured number>",
  "realtimeMessages": "<actual measured number>",
  "databaseBytes": "<actual measured number>",
  "storageBytes": "<actual measured number>",
  "supabaseMau": "<actual measured number>",
  "supabaseEdgeInvocations": "<actual measured number>"
}
```

Admission and each 15-second guard check require fresh quota evidence with 20% headroom. Service workers are blocked, and HTTP plus WebSocket origins are restricted before pages open. The runner counts browser requests and websocket frames conservatively, caps requests, detects load-generator event-loop overload and requires observed usage counter changes. Report secrets, auth cookies, message bodies and URLs with tokens are never printed. Use distinct synthetic users and discard private storage states after testing.

Reports keep `capacityVerified: false` and `highestVerifiedUsers: null`; `harnessCriteriaPassed` / `highestPassingHarnessUsers` describe provisional runner criteria only. Independent provider/server/DB latency, joins/presence, two-tenant denials and per-device measurements must be reviewed before any supported-user count is accepted. Passing harness criteria requires a one-hour mixed workload, p95 ordinary operation ≤2s, p95 live chat delivery ≤1s, less than 1% unexpected operation/HTTP failures, Web Vitals measurements within targets, in-place chat reconnect recovery (missed persisted message plus subsequent live delivery without reloading the receiver), quota headroom and a monthly usage projection below 80% of allowances. HTTP 429s count as failures. Missing roles, metrics, stale usage or local demo mode cannot produce a verified user count. Also review actual server p95/p99, database CPU/connections/lock waits and provider disconnect/join errors, plus two-tenant denials and persisted write correctness, before accepting the report.

Run additional scenarios for many teams, a shared venue IP, one hot team, media playback/downloads and reconnect bursts. Record device split, route mix, data size, sample counts, browser/host machine, source hash, schema and billing meter evidence. Monthly projection is conservative and assumes the observed sustained workload for peak hours; add measured off-peak consumption. Do not describe the highest passing stage as a universal guarantee or claim support for 500 users.

## Rollout and pending evidence

Review the additive SQL migration, validate RLS and replay the complete chain locally before applying it to an isolated free test project. Existing live migration reconciliation and production rollout remain existing release gates. Do not use paid Supabase development branches. Hosted capacity testing requires an isolated free project/preview, synthetic authenticated actor states and current Vercel/Upstash quota evidence; Vercel MCP now provides read access to Dn_Jsh/anointed-worship-app. Production /api/health returned 200 with Supabase reachable; however Supabase/Redis variables currently target production only, and the latest preview is the earlier 6068ce6 commit. No isolated preview is configured. The current Supabase connector lists only project key/rulhhrtnhhoxxizobqzg in organization kvregigafmyiszmwdwcu and denies the approved test project. Correct-account reconnection is pending; do not infer schema preparation. Without those prerequisites, ship the local implementation evidence and leave hosted capacity explicitly unverified.


The Messages INSERT subscription remains broad under existing RLS: the schema exposes channel_id, while the page loads only 50 memberships plus its selected channel. Filtering only loaded channels would lose updates from unseen authorized channels. Refreshes are coalesced; no live feature has been removed.
