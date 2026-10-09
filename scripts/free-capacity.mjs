// Free tooling only. Private actor auth states and provider snapshots belong in .tmp/.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium, devices } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PRODUCTION_HOST = "anointed-worship-app.vercel.app";
const PRODUCTION_PROJECT = "xvrndwkghxkqsvxxtqym";
export const FREE_ALLOWANCES = {
  vercelInvocations: 1_000_000,
  vercelCpuHours: 4,
  vercelTransferBytes: 100 * 1e9,
  vercelOriginBytes: 10 * 1e9,
  vercelMemoryGbHours: 360,
  vercelCdnRequests: 1_000_000,
  redisCommands: 500_000,
  redisStorageBytes: 256 * 1e6,
  redisTransferBytes: 10 * 1e9,
  supabaseUncachedBytes: 5 * 1e9,
  supabaseCachedBytes: 5 * 1e9,
  realtimeMessages: 2_000_000,
  databaseBytes: 500 * 1e6,
  storageBytes: 1e9,
  supabaseMau: 50_000,
  supabaseEdgeInvocations: 500_000,
};

// Traffic meters must actually record this mixed workload. Rounded/delayed zero
// deltas are missing evidence, not a free monthly cost estimate.
export const ACTIVE_METERS = ["vercelInvocations", "vercelCpuHours", "vercelTransferBytes", "vercelOriginBytes", "vercelMemoryGbHours", "vercelCdnRequests", "redisCommands", "redisTransferBytes", "supabaseUncachedBytes", "supabaseCachedBytes", "realtimeMessages"];

export async function readBoundedMedia(response, budget, onChunk = () => {}) {
  const fileLimit = 5_000_000;
  const totalLimit = 100_000_000;
  const reader = response.body?.getReader();
  assert(reader, "Media response has no readable body.");
  let bytes = 0;
  try {
    const declared = Number(response.headers.get("content-length"));
    assert(!Number.isFinite(declared) || declared <= fileLimit, "Media fixture exceeds the per-file budget.");
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      budget.bytes += chunk.value.byteLength;
      onChunk(chunk.value.byteLength);
      assert(bytes <= fileLimit && budget.bytes <= totalLimit, "Media download byte budget reached.");
    }
  } finally { await reader.cancel().catch(() => {}); }
  return bytes;
}

export function isAllowedNetworkURL(value, origins, websocket = false) {
  const url = new URL(value);
  if (url.username || url.password || url.hostname === PRODUCTION_HOST || url.hostname === `${PRODUCTION_PROJECT}.supabase.co`) return false;
  if (websocket) {
    if (!["ws:", "wss:"].includes(url.protocol)) return false;
    url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  } else if (!["http:", "https:"].includes(url.protocol)) return false;
  return origins.has(url.origin);
}

export function admitIdentity(user, membership, actor, admitted) {
  assert(user?.id && membership?.team_id === actor.teamId && membership.status === "active", "Actor identity or active team membership could not be verified.");
  assert(!admitted.has(user.id), "Repeated authenticated account refused.");
  admitted.add(user.id);
}

export function admitPreviewProof(proof, config, actor, admitted) {
  assert(proof?.mode === "isolated-free-preview" && proof.commit === config.baseline.commit && proof.supabaseOrigin === new URL(config.supabaseURL).origin && proof.supabaseOrigin === "https://fbrmotzjsnmdpdkcxyqb.supabase.co" && proof.redisOrigin === new URL(config.redisURL).origin, "Website deployment or database isolation proof failed.");
  admitIdentity({ id: proof.userId }, { team_id: proof.teamId, status: proof.status }, actor, admitted);
}

export function percentile(values, fraction) {
  return values.length ? [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * fraction) - 1)] : null;
}

export function validateSetup(config) {
  assert(["local-demo", "isolated-free-preview"].includes(config.mode), "Choose local-demo or isolated-free-preview.");
  const target = new URL(config.baseURL);
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(target.hostname);
  assert(!target.username && !target.password && target.pathname === "/" && !target.search && !target.hash, "Use a clean origin without credentials.");
  assert(target.hostname !== PRODUCTION_HOST, "Production load tests are prohibited.");
  assert(local ? target.protocol === "http:" || target.protocol === "https:" : target.protocol === "https:", "Remote tests require HTTPS.");
  assert(config.mode !== "local-demo" || local, "Demo tests must stay on localhost.");
  assert(Array.isArray(config.actors) && config.actors.length > 0, "Provide synthetic actors.");
  assert(new Set(config.actors.map(actor => actor.id)).size === config.actors.length, "Actor IDs must be unique.");
  assert(Array.isArray(config.stages) && config.stages.length > 0, "Provide ramp stages.");
  config.stages.forEach((users, index) => {
    assert(Number.isInteger(users) && users > 0 && users <= config.actors.length, "Each stage needs its own actors.");
    assert(!index || users > config.stages[index - 1], "Stages must increase.");
    // Include the extra 10% browser tabs; retain 20% of the 200-socket allowance.
    assert(users + Math.floor(users / 10) + config.actors.slice(0, users).filter(actor => actor.role === "presenter").length <= 160, "Stage would exceed realtime safety headroom.");
  });
  assert(Number.isFinite(config.holdSeconds) && config.holdSeconds >= 10 && config.holdSeconds <= 3600, "Hold each stage for 10–3600 seconds.");
  assert(Number.isFinite(config.thinkSeconds) && config.thinkSeconds >= 5 && config.thinkSeconds <= 60, "Use realistic think time of 5–60 seconds.");
  assert(Number.isInteger(config.maxRequests) && config.maxRequests > 0 && config.maxRequests <= 100_000, "Set a bounded request budget (maximum 100000).");
  for (const actor of config.actors) {
    assert(typeof actor.id === "string" && /^[a-z\d_-]{1,40}$/i.test(actor.id), "Use opaque actor labels.");
    assert(["browse", "chat", "editor", "presenter", "media"].includes(actor.role), "Actor has an unsupported role.");
    for (const value of [...(actor.routes ?? []), actor.initialPath, actor.outputPath].filter(Boolean)) {
      assert(typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && new URL(value, target).origin === target.origin, "Actor paths must stay on the test origin.");
    }
    if (actor.mediaPath) {
      const media = new URL(actor.mediaPath, target);
      assert(!media.username && !media.password && (media.origin === target.origin || (config.supabaseURL && media.origin === new URL(config.supabaseURL).origin)), "Media must stay on the test website or isolated Supabase.");
    }
  }
  if (config.mode === "isolated-free-preview") {
    assert(!local && config.baseline?.freePlansVerified === true && config.baseline?.isolatedDataVerified === true, "Verify free plans and isolated test data first.");
    const redis = new URL(config.redisURL);
    assert(config.baseline.isolatedRedisVerified === true && redis.protocol === "https:" && redis.hostname.endsWith(".upstash.io") && !redis.username && !redis.password && redis.pathname === "/" && !redis.search && !redis.hash, "Verify a dedicated free Redis resource before remote testing.");
    assert(/^[a-f\d]{40}$/.test(config.baseline?.commit ?? "") && /^\d{14}$/.test(config.baseline?.schemaVersion ?? ""), "Record matching deployed commit/schema.");
    const supabase = new URL(config.supabaseURL);
    assert(supabase.origin === "https://fbrmotzjsnmdpdkcxyqb.supabase.co" && supabase.pathname === "/" && !supabase.search && !supabase.hash && !supabase.username && !supabase.password, "Use the approved isolated Supabase project.");
    assert(config.usageFile && config.actors.every(actor => actor.storageState && actor.teamId), "Remote tests need private actor auth states and provider usage snapshots.");
    assert(Number.isFinite(config.rampSeconds) && config.rampSeconds >= 30 && config.rampSeconds <= 300, "Use a bounded 30–300 second ramp hold.");
    assert(new Set(config.actors.map(actor => actor.storageState)).size === config.actors.length, "Use distinct signed-in user states, not duplicate sessions.");
    assert(new Set(config.actors.map(actor => actor.teamId)).size >= 2, "Test at least two separate teams.");
    assert(config.actors.some(actor => actor.role === "chat" && actor.peerId) && config.actors.some(actor => actor.role === "editor") && config.actors.some(actor => actor.role === "presenter") && config.actors.some(actor => actor.role === "media"), "The mixed workload must include chat delivery, checked writes, presenter, and media.");
    assert(config.actors.every(actor => actor.role !== "chat" || config.actors.some(peer => peer.id === actor.peerId && peer.teamId === actor.teamId && peer.initialPath === actor.initialPath && peer.id !== actor.id)), "Chat peers must share a team and conversation.");
    assert(config.actors.every(actor => actor.role !== "presenter" || (actor.outputPath && Array.isArray(actor.slides) && actor.slides.length >= 2 && actor.slides.every(slide => typeof slide.buttonName === "string" && slide.buttonName && typeof slide.outputText === "string" && slide.outputText) && new Set(actor.slides.map(slide => slide.outputText)).size === actor.slides.length)), "Presenter fixtures need an output path and at least two distinct observable slides.");
    for (const users of config.stages) {
      const actors = config.actors.slice(0, users);
      assert(new Set(actors.map(actor => actor.teamId)).size >= 2 && ["browse", "chat", "editor", "presenter", "media"].every(role => actors.some(actor => actor.role === role)), "Every ramp prefix must include two teams and every workload role.");
      assert(actors.filter(actor => actor.role === "chat").every(actor => actors.some(peer => peer.id === actor.peerId && peer.role === "chat")), "Chat peers must remain in the conversation throughout each ramp prefix.");
    }
  }
  return { mode: config.mode, users: config.stages, maxConnections: config.stages.at(-1) + Math.floor(config.stages.at(-1) / 10) + config.actors.slice(0, config.stages.at(-1)).filter(actor => actor.role === "presenter").length, capacityVerified: false };
}

export function validateUsage(snapshot, now = Date.now()) {
  assert(snapshot && Number.isFinite(Date.parse(snapshot.recordedAt)) && Math.abs(now - Date.parse(snapshot.recordedAt)) <= 300_000, "Provider usage evidence must be refreshed within five minutes.");
  for (const [key, allowance] of Object.entries(FREE_ALLOWANCES)) {
    assert(Number.isFinite(snapshot[key]) && snapshot[key] >= 0 && snapshot[key] <= allowance * 0.8, `${key} must have 20% free headroom.`);
  }
  return snapshot;
}

/** @param {{ remote: boolean, before?: Record<string, number|string>|null, after?: Record<string, number|string>|null, busyHours?: number }} options */
export function assessStage(stage, options) {
  const { remote, before = null, after = null, busyHours = 34.8 } = options;
  const reasons = [];
  const ramp = stage.phase === "ramp";
  if (stage.operations < stage.users * (ramp ? 1 : 10) || stage.liveDeliveryMs.length < (ramp ? 1 : 10)) reasons.push("insufficient operation/live samples");
  const actorCounts = Object.values(stage.actorOperations ?? {});
  if (actorCounts.length !== stage.users || actorCounts.some(count => count < (ramp ? 1 : 10))) reasons.push("insufficient successful samples per actor");
  if (!stage.operations || stage.errors / stage.operations >= 0.01) reasons.push("operation failures");
  if (!stage.requests || stage.httpErrors / stage.requests >= 0.01) reasons.push("HTTP failures or legitimate 429s");
  if ((percentile(stage.operationMs, 0.95) ?? Infinity) > 2000) reasons.push("p95 operations exceed 2 seconds");
  if ((percentile(stage.liveDeliveryMs, 0.95) ?? Infinity) > 1000) reasons.push("live delivery not measured or exceeds 1 second");
  for (const [name, ceiling] of [["LCP", 2500], ["INP", 200], ["CLS", 0.1]]) {
    if ((percentile(stage.vitals[name] ?? [], 0.75) ?? Infinity) > ceiling) reasons.push(`${name} not measured or outside target`);
  }
  if (stage.peakConnections > 160 || stage.peakEventsPerSecond > 80) reasons.push("realtime headroom exhausted");
  if (stage.generatorDelayP95Ms > 100) reasons.push("load-generator overload; capacity inconclusive");
  if (stage.stopped) reasons.push("budget/safety stop");
  if ((stage.sustainedSeconds ?? stage.durationSeconds) < 3600) reasons.push("one-hour soak not completed");
  for (const role of ["browse", "chat", "editor", "presenter", "media"]) {
    if (!stage.completedRoles.includes(role)) reasons.push(`${role} workload missing`);
  }
  if (!stage.reconnectVerified) reasons.push("reconnect recovery missing");
  const projectedMonthly = {};
  if (remote) {
    try { validateUsage(before, stage.startedAt ?? Date.now()); validateUsage(after); } catch { reasons.push("provider quota evidence missing or stale"); }
    for (const [key, allowance] of Object.entries(FREE_ALLOWANCES)) {
      const delta = after?.[key] - before?.[key];
      if (!Number.isFinite(delta) || delta < 0) { reasons.push(`${key} usage delta unavailable`); continue; }
      if (ACTIVE_METERS.includes(key) && delta === 0) reasons.push(`${key} test traffic unobserved`);
      projectedMonthly[key] = after[key] + (ACTIVE_METERS.includes(key) ? delta * busyHours * 3600 / Math.max(1, stage.sustainedSeconds ?? stage.durationSeconds) : 0);
      if (projectedMonthly[key] > allowance * 0.8) reasons.push(`${key} monthly quota projection exceeds headroom`);
    }
  } else reasons.push("local demo is not hosted capacity evidence");
  // Runner criteria are provisional; independent provider/DB/per-device review is required.
  return { capacityVerified: false, harnessCriteriaPassed: reasons.length === 0, qualifiesForSoak: reasons.every(reason => reason === "one-hour soak not completed" || reason.endsWith("test traffic unobserved")), reasons, projectedMonthly };
}

async function run(config, outputPath) {
  const remote = config.mode === "isolated-free-preview";
  const usage = async () => remote ? validateUsage(JSON.parse(await readFile(path.resolve(root, config.usageFile), "utf8"))) : null;
  const sourceHash = createHash("sha256").update(await readFile(fileURLToPath(import.meta.url))).digest("hex");
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", windowsHide: true }).trim();
  const sourceDirty = Boolean(execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8", windowsHide: true }).trim());
  if (remote) assert(!sourceDirty && config.baseline.commit === commit, "Hosted tests require a clean source tree matching the recorded deployed commit.");
  const report = { mode: config.mode, commit, sourceDirty, harnessSha256: sourceHash, baseline: config.baseline ?? null, capacityVerified: false, highestVerifiedUsers: null, highestPassingHarnessUsers: null, acceptance: "Independent provider, database, live-feature and per-device review required", stages: [] };
  const browser = await chromium.launch();
  let totalRequests = 0;
  const downloadBudget = { bytes: 0 };
  try {
    const phases = remote
      ? [...config.stages.map(users => ({ users, seconds: config.rampSeconds, phase: "ramp" })), { users: config.stages.at(-1), seconds: config.holdSeconds, phase: "soak" }]
      : config.stages.map(users => ({ users, seconds: config.holdSeconds, phase: "demo" }));
    for (const { users, seconds, phase } of phases) {
      const before = await usage();
      const stage = { users, phase, startedAt: Date.now(), operations: 0, actorOperations: {}, errors: 0, requests: 0, httpErrors: 0, operationMs: [], liveDeliveryMs: [], vitals: { LCP: [], INP: [], CLS: [] }, peakConnections: 0, peakEventsPerSecond: 0, completedRoles: [], reconnectVerified: false, stopped: false, durationSeconds: 0, sustainedSeconds: 0, generatorDelayP95Ms: 0 };
      const contexts = [];
      const sessions = new Map();
      const admitted = new Set();
      const vitals = new Map();
      const recentEvents = [];
      let connections = 0;
      let stopReason = "";
      const stop = reason => { stage.stopped = true; stopReason ||= reason; };
      const delay = monitorEventLoopDelay({ resolution: 20 });
      delay.enable();
      const observedOrigins = new Set([new URL(config.baseURL).origin, ...(config.supabaseURL ? [new URL(config.supabaseURL).origin] : [])]);
      const collectPage = async page => {
        await page.exposeFunction("reportLoadVital", metric => {
          if (["LCP", "INP", "CLS"].includes(metric.name) && Number.isFinite(metric.value)) vitals.set(metric.id, metric);
        });
        await page.addInitScript(() => { window.addEventListener("anointed-web-vitals", event => { void window.reportLoadVital(event.detail); }); });
        page.on("request", request => {
          if (observedOrigins.has(new URL(request.url()).origin)) {
            stage.requests += 1;
            totalRequests += 1;
            if (totalRequests > config.maxRequests) stop("request budget reached");
          }
        });
        page.on("response", response => {
          if (observedOrigins.has(new URL(response.url()).origin) && response.status() >= 400) stage.httpErrors += 1;
        });
        page.on("requestfailed", request => {
          if (observedOrigins.has(new URL(request.url()).origin)) stage.httpErrors += 1;
        });
        page.on("pageerror", () => { stage.errors += 1; });
        page.on("websocket", socket => {
          connections += 1;
          stage.peakConnections = Math.max(stage.peakConnections, connections);
          if (connections > 160) stop("realtime connection headroom reached");
          socket.on("close", () => { connections -= 1; });
          for (const event of ["framesent", "framereceived"]) socket.on(event, () => {
            const now = Date.now();
            recentEvents.push(now);
            while (recentEvents[0] < now - 1000) recentEvents.shift();
            stage.peakEventsPerSecond = Math.max(stage.peakEventsPerSecond, recentEvents.length);
            // Count protocol/heartbeat frames too: conservative versus billable events.
            if (recentEvents.length > 80) stop("realtime message headroom reached");
          });
        });
      };
      const began = performance.now();
      try {
        for (const actor of config.actors.slice(0, users)) {
          if (stage.stopped) break;
          const device = actor.device === "phone" ? devices["Pixel 7"] : actor.device === "tablet" ? { viewport: { width: 820, height: 1180 }, hasTouch: true } : { viewport: { width: 1280, height: 900 } };
          const context = await browser.newContext({ ...device, serviceWorkers: "block", ...(actor.storageState ? { storageState: path.resolve(root, actor.storageState) } : {}) });
          contexts.push(context);
          // Prevent accidental redirects, embeds, or auth states from exercising production.
          await context.route("**/*", route => {
            if (!isAllowedNetworkURL(route.request().url(), observedOrigins)) { stop("unexpected network origin blocked"); return route.abort(); }
            return route.continue();
          });
          await context.routeWebSocket("**/*", socket => {
            if (!isAllowedNetworkURL(socket.url(), observedOrigins, true)) { stop("unexpected websocket origin blocked"); return socket.close({ code: 1008, reason: "Isolated test only" }); }
            socket.connectToServer();
          });
          if (remote) {
            stage.requests += 1; totalRequests += 1;
            assert(totalRequests <= config.maxRequests && !stage.stopped, "Request budget reached.");
            // Verify actual website environment/source/backend/identity before opening pages or sending actions.
            const identity = await context.request.get(new URL("/api/capacity/identity", config.baseURL).href, { maxRedirects: 0 });
            if (!identity.ok()) stage.httpErrors += 1;
            assert(identity.ok(), "Isolated authenticated preview admission failed.");
            admitPreviewProof(await identity.json(), config, actor, admitted);
          }
          const page = await context.newPage();
          page.setDefaultTimeout(5000);
          await collectPage(page);
          const response = await page.goto(new URL(actor.initialPath ?? "/dashboard", config.baseURL).href);
          assert(response?.ok() && !new URL(page.url()).pathname.startsWith("/login"), "Actor could not enter the workspace.");
          let outputPage = null;
          if (actor.role === "presenter") {
            outputPage = await context.newPage();
            await collectPage(outputPage);
            const outputResponse = await outputPage.goto(new URL(actor.outputPath, config.baseURL).href);
            assert(outputResponse?.ok() && !new URL(outputPage.url()).pathname.startsWith("/login"), "Presenter output is not authorized.");
          }
          sessions.set(actor.id, { actor, page, context, outputPage });
          stage.actorOperations[actor.id] = 0;
          // Stagger joins to avoid turning the ramp into a synthetic join storm.
          await new Promise(resolve => setTimeout(resolve, 400));
        }
        for (const session of [...sessions.values()].slice(0, Math.floor(users / 10))) {
          const tab = await session.context.newPage();
          await collectPage(tab);
          await tab.goto(new URL("/dashboard", config.baseURL).href);
        }
        const holdStarted = performance.now();
        const deadline = holdStarted + seconds * 1000;
        const act = async session => {
          const { actor, page } = session;
          let cycle = 0;
          while (performance.now() < deadline && !stage.stopped) {
            const started = performance.now();
            stage.operations += 1;
            try {
              if (actor.role === "chat") {
                const peer = sessions.get(actor.peerId);
                assert(peer, "Chat peer is missing at this ramp stage.");
                const body = `Capacity ${randomUUID()}`;
                await page.locator('input[name="body"]').fill(body);
                const sent = performance.now();
                await page.getByRole("button", { name: "Send message", exact: true }).click();
                await peer.page.getByText(body, { exact: true }).first().waitFor({ state: "visible" });
                stage.liveDeliveryMs.push(performance.now() - sent);
                stage.lastChatDelivery = { peerId: actor.peerId, body };
              } else if (actor.role === "editor") {
                const button = page.getByRole("button", { name: /Move .* down/ }).first();
                const previous = await page.locator("[data-slot-id]").evaluateAll(elements => elements.map(element => element.getAttribute("data-slot-id")));
                const slot = await button.evaluate(element => element.closest("[data-slot-id]")?.getAttribute("data-slot-id"));
                const index = previous.indexOf(slot);
                assert(index >= 0 && index < previous.length - 1, "Editor fixture has no movable song.");
                const expected = [...previous];
                [expected[index], expected[index + 1]] = [expected[index + 1], expected[index]];
                await Promise.all([
                  page.waitForResponse(response => response.request().method() === "POST" && Boolean(response.request().headers()["next-action"]) && new URL(response.url()).origin === new URL(config.baseURL).origin),
                  button.click(),
                ]);
                await page.locator('[aria-busy="true"]').waitFor({ state: "hidden" });
                assert(await page.getByRole("alert").filter({ hasText: /order|save/i }).count() === 0, "Reorder failed.");
                await page.reload();
                await page.locator("[data-slot-id]").first().waitFor({ state: "visible" });
                const persisted = await page.locator("[data-slot-id]").evaluateAll(elements => elements.map(element => element.getAttribute("data-slot-id")));
                assert.deepEqual(persisted, expected, "Reorder did not persist after reload.");
              } else if (actor.role === "media") {
                assert(actor.mediaPath, "Provide a same-origin authorized practice-file download path.");
                stage.requests += 1;
                totalRequests += 1;
                if (totalRequests > config.maxRequests) { stop("request budget reached"); break; }
                const url = new URL(actor.mediaPath, config.baseURL);
                assert(isAllowedNetworkURL(url.href, observedOrigins), "Media origin refused.");
                const cookies = await session.context.cookies(url.href);
                const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(5000), headers: { Cookie: cookies.map(cookie => `${cookie.name}=${cookie.value}`).join("; ") } });
                if (!response.ok) stage.httpErrors += 1;
                assert(response.ok && /^(audio|video|image)\/|^application\/pdf/.test(response.headers.get("content-type") ?? ""), "Media download did not return the expected file.");
                try { await readBoundedMedia(response, downloadBudget); }
                catch { stop("media byte budget or download failure"); throw new Error("Media download refused"); }
              } else if (actor.role === "presenter") {
                const output = session.outputPage;
                assert(output, "Presenter output is missing.");
                let slide = actor.slides[cycle % actor.slides.length];
                if (await output.getByText(slide.outputText, { exact: true }).first().isVisible()) slide = actor.slides[(cycle + 1) % actor.slides.length];
                const button = page.getByRole("button", { name: slide.buttonName, exact: true });
                const sent = performance.now();
                await button.click();
                await output.getByText(slide.outputText, { exact: true }).first().waitFor({ state: "visible" });
                stage.liveDeliveryMs.push(performance.now() - sent);
              } else {
                const routes = actor.routes ?? ["/dashboard", "/songs", "/setlists"];
                const response = await page.goto(new URL(routes[cycle % routes.length], config.baseURL).href);
                assert(response?.ok() && !new URL(page.url()).pathname.startsWith("/login"), "Read failed or authentication was lost.");
                await page.locator("main").waitFor({ state: "visible" });
              }
              if (!stage.completedRoles.includes(actor.role)) stage.completedRoles.push(actor.role);
              stage.actorOperations[actor.id] += 1;
            } catch { stage.errors += 1; }
            stage.operationMs.push(performance.now() - started);
            cycle += 1;
            await new Promise(resolve => setTimeout(resolve, config.thinkSeconds * 1000));
          }
        };
        const refreshUsage = setInterval(() => { void usage().catch(() => stop("provider quota evidence stale or exhausted")); }, 15_000);
        try { await Promise.all([...sessions.values()].map(act)); } finally { clearInterval(refreshUsage); }
        stage.sustainedSeconds = Math.min(seconds, (performance.now() - holdStarted) / 1000);
        if (remote && !stage.stopped) {
          // Persistence reload happens only after every sender has stopped.
          // It cannot interrupt another actor's composer or inflate live RTT.
          assert(stage.lastChatDelivery, "No delivery available for persistence proof.");
          const receiver = sessions.get(stage.lastChatDelivery.peerId);
          assert(receiver, "Persistence receiver missing.");
          await receiver.page.reload();
          await receiver.page.getByText(stage.lastChatDelivery.body, { exact: true }).first().waitFor({ state: "visible" });
          delete stage.lastChatDelivery; // Synthetic message bodies are not persisted in the report.
        }
        const session = [...sessions.values()].find(item => item.actor.role === (remote ? "chat" : "browse"));
        if (session && !stage.stopped) {
          const peer = remote ? sessions.get(session.actor.peerId) : session;
          assert(peer, "Recovery peer is missing.");
          const missed = `Recovery ${randomUUID()}`;
          await peer.context.setOffline(true);
          await new Promise(resolve => setTimeout(resolve, 500));
          if (remote) {
            await session.page.locator('input[name="body"]').fill(missed);
            await session.page.getByRole("button", { name: "Send message", exact: true }).click();
            await session.page.getByText(missed, { exact: true }).first().waitFor({ state: "visible" });
          }
          await peer.context.setOffline(false);
          if (remote) {
            await peer.page.getByText(missed, { exact: true }).first().waitFor({ state: "visible" });
            const live = `Resubscribed ${randomUUID()}`;
            await session.page.locator('input[name="body"]').fill(live);
            const sent = performance.now();
            await session.page.getByRole("button", { name: "Send message", exact: true }).click();
            await peer.page.getByText(live, { exact: true }).first().waitFor({ state: "visible" });
            stage.liveDeliveryMs.push(performance.now() - sent);
          } else {
            const response = await peer.page.reload();
            assert(response?.ok(), "Demo recovery failed.");
          }
          stage.reconnectVerified = true;
        }
      } catch { stop("actor setup or reconnect failed"); }
      finally {
        delete stage.lastChatDelivery;
        // Page exit finalizes Web Vitals. No vitals payload is sent to an external service.
        for (const context of contexts) {
          for (const page of context.pages()) await page.goto("about:blank").catch(() => {});
          await context.close();
        }
        delay.disable();
      }
      for (const metric of vitals.values()) stage.vitals[metric.name].push(metric.value);
      stage.durationSeconds = (performance.now() - began) / 1000;
      stage.generatorDelayP95Ms = delay.percentile(95) / 1e6;
      let after = null;
      try { after = await usage(); } catch { stop("final provider quota evidence missing"); }
      stage.stopReason = stopReason || null;
      stage.downloadedMediaBytes = downloadBudget.bytes;
      stage.assessment = assessStage(stage, { remote, before, after });
      report.stages.push(stage);
      if (stage.assessment.harnessCriteriaPassed) report.highestPassingHarnessUsers = users;
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
      console.log(JSON.stringify({ users, phase, operations: stage.operations, errors: stage.errors, verified: stage.assessment.capacityVerified, reasons: stage.assessment.reasons }));
      if (stage.stopped || (remote && !stage.assessment.qualifiesForSoak)) break;
    }
  } finally { await browser.close(); }
  return report;
}

async function main() {
  const configPath = process.argv[process.argv.indexOf("--config") + 1];
  assert(process.argv.includes("--config") && configPath, "Use --config <private configuration path>, optionally --dry-run.");
  const config = JSON.parse(await readFile(path.resolve(root, configPath), "utf8"));
  const summary = validateSetup(config);
  if (process.argv.includes("--dry-run")) { console.log(JSON.stringify(summary)); return; }
  const outputPath = path.join(root, ".tmp", "capacity", `result-${Date.now()}.json`);
  const report = await run(config, outputPath);
  console.log(`Report: ${path.relative(root, outputPath)}; hosted capacity verified: ${report.capacityVerified}`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch(() => { console.error("Capacity run refused or failed. Check the private setup and free quota evidence; credentials are never printed."); process.exitCode = 1; });
}
