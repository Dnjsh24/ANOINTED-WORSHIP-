// Compare actual Messages loaders and components on the same synthetic fixture.
// Auth, Next navigation, realtime and server-action transport are local adapters.
// This measures fixture transfer/rendering, not deployed Next.js or database latency.
// ESBUILD_MODULE_PATH may point to an esbuild installation outside this project.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium, devices } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseline = execFileSync("git", ["rev-parse", process.env.BENCHMARK_BASELINE ?? "0cdbfc5"], { cwd: root, encoding: "utf8", windowsHide: true }).trim();
const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", windowsHide: true }).trim();
const sourceHashes = {};
for (const file of ["src/app/messages/page.tsx", "src/components/messages-client.tsx", "src/app/messages/message-actions.ts", "src/lib/supabase/message-data.ts", "src/lib/domain/files.ts", "src/lib/utils.ts", "src/lib/domain/rbac.ts", "src/lib/domain/validators.ts", "package-lock.json", "scripts/benchmark-messages-browser.mjs"]) {
  sourceHashes[file] = createHash("sha256").update(await readFile(path.join(root, file))).digest("hex");
}
const samples = Number(process.env.BENCHMARK_SAMPLES ?? 7);
assert(Number.isInteger(samples) && samples >= 3, "Use at least three measured samples.");
const buildModule = process.env.ESBUILD_MODULE_PATH;
const { build } = await import(buildModule ? pathToFileURL(path.resolve(buildModule)).href : "esbuild");
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "anointed-message-browser-"));
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const teamId = id(1);
const members = Array.from({ length: 50 }, (_, n) => ({
  id: id(100 + n), profile_id: id(200 + n), team_id: teamId, role: "member",
  profiles: { id: id(200 + n), full_name: `Member ${n + 1}`, email: `member${n + 1}@example.test`, avatar_url: null },
}));
const channels = Array.from({ length: 20 }, (_, n) => ({
  id: id(300 + n), team_id: teamId, name: `Rehearsal ${n + 1}`, channel_type: "team", avatar_url: null,
  updated_at: "2026-10-07T12:00:00Z",
  message_channel_members: members.map((member) => ({ channel_id: id(300 + n), team_member_id: member.id })),
}));
const messages = Array.from({ length: 10_000 }, (_, n) => ({
  id: id(1000 + n), channel_id: channels[n % channels.length].id,
  sender_member_id: members[n % members.length].id,
  body: `Message ${n + 1}: ${"Rehearsal notes and transition cues. ".repeat(8)}`,
  created_at: new Date(Date.UTC(2026, 9, 1) + n * 1000).toISOString(),
  attachment_file_id: null, parent_message_id: null,
}));
const context = { teamId, userId: members[0].profile_id, memberId: members[0].id, role: "member" };
const fixture = { members: members.length, channels: channels.length, messages: messages.length };
let queries = [];

// Use the real Supabase query builder, with deterministic responses at its HTTP boundary.
globalThis.workflowFixtureClient = createClient("https://fixture.supabase.test", "fixture-publishable-key", {
  auth: { persistSession: false },
  global: { fetch: async (input, init) => {
    const url = new URL(String(input));
    const table = url.pathname.split("/").at(-1);
    let rows;
    if (table === "team_members") rows = members;
    else if (table === "message_channel_members") rows = channels.map((channel) => ({ channel_id: channel.id, team_member_id: context.memberId }));
    else if (table === "message_channels") rows = channels;
    else if (table === "get_message_previews") {
      const requested = JSON.parse(String(init.body)).p_channel_ids;
      rows = channels.filter((channel) => requested.includes(channel.id)).map((channel) => ({
        channel_id: channel.id, message: messages.findLast((message) => message.channel_id === channel.id),
      }));
    } else if (table === "messages") {
      const channelFilter = url.searchParams.get("channel_id");
      rows = messages.filter((message) => !channelFilter || (channelFilter.startsWith("eq.")
        ? message.channel_id === channelFilter.slice(3)
        : channelFilter.startsWith("in.(") && channelFilter.slice(4, -1).split(",").includes(message.channel_id)));
      if (url.searchParams.get("order")?.includes("desc")) rows = [...rows].reverse();
      if (url.searchParams.has("limit")) rows = rows.slice(0, Number(url.searchParams.get("limit")));
    } else if (table === "message_reads" || table === "practice_files") rows = [];
    else throw new Error(`Unexpected fixture query: ${url.pathname}`);
    for (const [field, filter] of url.searchParams) {
      if (filter.startsWith("eq.")) rows = rows.filter((row) => String(row[field]) === filter.slice(3));
    }
    const json = JSON.stringify(rows);
    queries.push({ table, rows: rows.length, bytes: Buffer.byteLength(json) });
    return new Response(json, { headers: { "Content-Type": "application/json", "Content-Range": `0-${Math.max(0, rows.length - 1)}/${rows.length}` } });
  } },
});

const browserStubs = {
  "next/link": 'import React from "react"; export default function Link({href,children,...props}) { return React.createElement("a",{...props,href},children); }',
  "next/navigation": `import {useSyncExternalStore} from "react";
    const subscribe = callback => { window.addEventListener("popstate",callback); return () => window.removeEventListener("popstate",callback); };
    const snapshot = () => window.location.search;
    const navigate = href => { window.history.pushState(null,"",href); window.dispatchEvent(new PopStateEvent("popstate")); };
    export const useRouter = () => ({push:navigate,replace:navigate,refresh:()=>{}});
    export const useSearchParams = () => new URLSearchParams(useSyncExternalStore(subscribe,snapshot,()=>""));`,
  "@/lib/supabase/client": "export const createOptionalClient = () => null;",
  "@/app/actions": ["addChannelMemberAction", "createChannelAction", "getOrCreateDirectChannelAction", "leaveChannelAction", "removeChannelMemberAction", "markMessagesReadAction", "sendMessageAction"].map((name) => `export const ${name} = async () => ({ok:true});`).join("\n"),
  "@/app/messages/message-actions": `export const loadChannelMessagesAction = async channel => (await fetch('/history?channel='+channel)).json();
    export const searchChannelMessagesAction = async () => ({ok:false});
    export const sendMessageOnceAction = async () => ({ok:false});`,
};
const loaderStubs = {
  "@/components/app-shell": "export const AppShell = () => null;",
  "@/components/messages-client": "export const MessagesClient = () => null;",
  "@/lib/supabase/server": "export const createClient = async () => globalThis.workflowFixtureClient;",
  "@/lib/supabase/env": "export const hasSupabaseEnv = () => true;",
  "@/lib/supabase/team-guard": `export const getRequiredTeamContext = async () => (${JSON.stringify(context)});`,
};
function adapterPlugin(stubs) {
  return { name: "local-fixture-boundaries", setup(builder) {
    builder.onResolve({ filter: /.*/ }, (args) => {
      if (Object.hasOwn(stubs, args.path)) return { path: args.path, namespace: "fixture" };
      if (args.path.startsWith("@/")) {
        const source = path.join(root, "src", args.path.slice(2));
        const resolved = [source, source + ".ts", source + ".tsx"].find((candidate) => existsSync(candidate));
        assert(resolved, `Missing source module: ${args.path}`);
        return { path: resolved };
      }
    });
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({ contents: stubs[args.path], resolveDir: root, loader: "jsx" }));
  } };
}
const loaders = {};
const bundles = {};
for (const variant of ["before", "after"]) {
  const originalPage = variant === "before"
    ? execFileSync("git", ["show", `${baseline}:src/app/messages/page.tsx`], { cwd: root, encoding: "utf8", windowsHide: true })
    : await readFile(path.join(root, "src/app/messages/page.tsx"), "utf8");
  const originalClient = variant === "before"
    ? execFileSync("git", ["show", `${baseline}:src/components/messages-client.tsx`], { cwd: root, encoding: "utf8", windowsHide: true })
    : await readFile(path.join(root, "src/components/messages-client.tsx"), "utf8");
  const pageFile = path.join(temporaryRoot, `${variant}-page.tsx`);
  const clientFile = path.join(temporaryRoot, `${variant}-client.tsx`);
  await writeFile(pageFile, originalPage + (variant === "after" ? '\nexport { loadChannelMessagesAction } from "@/app/messages/message-actions";\n' : ""));
  await writeFile(clientFile, originalClient);
  const loaderFile = path.join(temporaryRoot, `${variant}-loader.mjs`);
  await build({ entryPoints: [pageFile], outfile: loaderFile, bundle: true, platform: "node", format: "esm", packages: "external",
    nodePaths: [path.join(root, "node_modules")], jsx: "automatic", plugins: [adapterPlugin(loaderStubs)] });
  // External imports must resolve from the temporary directory, without installing dependencies.
  let loaderSource = await readFile(loaderFile, "utf8");
  loaderSource = loaderSource.replace(/from "(react(?:\/jsx-runtime)?|zod)"/g, (_, name) => `from ${JSON.stringify(pathToFileURL(path.join(root, "node_modules", name === "react/jsx-runtime" ? "react/jsx-runtime.js" : name === "react" ? "react/index.js" : "zod/index.js")).href)}`);
  await writeFile(loaderFile, loaderSource);
  const loaderModule = await import(pathToFileURL(loaderFile).href);
  loaders[variant] = loaderModule.default;
  if (variant === "after") loaders.history = loaderModule.loadChannelMessagesAction;
  const browserFile = path.join(temporaryRoot, `${variant}-browser.js`);
  await build({ stdin: { contents: `import React,{useEffect} from "react";import {createRoot} from "react-dom/client";import {MessagesClient} from ${JSON.stringify(clientFile)};
    for(const method of ['pushState','replaceState']){const original=window.history[method].bind(window.history);window.history[method]=(...args)=>{original(...args);window.dispatchEvent(new PopStateEvent('popstate'));};}
    const props = await (await fetch('/fixture/${variant}')).json();
    window.fixtureMessageCount = props.channels.reduce((sum,channel)=>sum+channel.messages.length,0);
    function App(){useEffect(()=>{window.fixtureReady=performance.now();},[]);return <MessagesClient {...props}/>;}
    createRoot(document.getElementById('root')).render(<App/>);`, resolveDir: root, loader: "tsx" },
    outfile: browserFile, bundle: true, platform: "browser", format: "esm", minify: true, jsx: "automatic",
    define: { "process.env": "{}", "process.env.NODE_ENV": '"production"' }, nodePaths: [path.join(root, "node_modules")], plugins: [adapterPlugin(browserStubs)] });
  bundles[variant] = await readFile(browserFile);
}

// Only /messages uses this benchmark fixture; songs and setlists have separate SQL volume checks.
const cssFile = (await readdir(path.join(root, ".next/static/css"))).find((file) => file.endsWith(".css"));
assert(cssFile, "Build the production website first to provide its stylesheet.");
const css = await readFile(path.join(root, ".next/static/css", cssFile));
sourceHashes[`.next/static/css/${cssFile}`] = createHash("sha256").update(css).digest("hex");
const payloadEvidence = {};
let historyEvidence;
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname === "/style.css") { response.setHeader("Content-Type", "text/css"); response.end(css); return; }
    const variant = url.pathname.includes("before") ? "before" : "after";
    if (url.pathname.endsWith(".js")) { response.setHeader("Content-Type", "text/javascript"); response.end(bundles[variant]); return; }
    if (url.pathname.startsWith("/fixture/")) {
      queries = [];
      const started = performance.now();
      const page = await loaders[variant]({ searchParams: Promise.resolve({}) });
      const props = page.props.children.props;
      const json = JSON.stringify(props);
      payloadEvidence[variant] = { loaderMs: +(performance.now() - started).toFixed(2), bytes: Buffer.byteLength(json), queries: [...queries] };
      response.setHeader("Content-Type", "application/json"); response.end(json); return;
    }
    if (url.pathname === "/history") {
      queries = [];
      const result = await loaders.history(url.searchParams.get("channel"));
      assert(result.ok, result.message);
      assert.equal(result.data.messages.length, 50);
      assert.equal(result.data.hasMore, true);
      assert(result.data.nextCursor?.includes("|"), "Selected history needs a timestamp/id cursor.");
      assert.equal(queries.find((query) => query.table === "messages")?.rows, 51);
      const json = JSON.stringify(result);
      historyEvidence = { messages: result.data.messages.length, hasMore: result.data.hasMore, cursor: result.data.nextCursor, bytes: Buffer.byteLength(json), queries: [...queries] };
      response.setHeader("Content-Type", "application/json");
      response.end(json); return;
    }
    response.setHeader("Content-Type", "text/html");
    response.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body style="background:#0d0d10;color:white"><div id="root"></div><script type="module" src="/${variant}.js"></script></body></html>`);
  } catch (error) { response.statusCode = 500; response.end(error.stack); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const measurements = [];
try {
  for (const device of ["desktop", "phone"]) {
    const browserContext = await browser.newContext(device === "phone" ? devices["Pixel 7"] : { viewport: { width: 1280, height: 800 } });
    const page = await browserContext.newPage();
    const errors = [];
    page.on("pageerror", (error) => { errors.push(error.message); console.error("Browser error:", error.message); });
    page.on("console", (message) => { if (message.type() === "error") console.error("Browser console:", message.text()); });
    const cdp = await browserContext.newCDPSession(page);
    if (device === "phone") {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 1_000_000, uploadThroughput: 1_000_000 });
    }
    const trials = { before: [], after: [] };
    for (let trial = 0; trial <= samples; trial++) {
      // Alternate ordering to reduce systematic warm-cache and thermal bias.
      for (const variant of trial % 2 ? ["after", "before"] : ["before", "after"]) {
        await page.goto(`${origin}/${variant}`);
        await page.waitForFunction(() => Number.isFinite(window.fixtureReady));
        await page.locator('button[title="Rehearsal 1"]').waitFor();
        const inboxMs = await page.evaluate(() => window.fixtureReady);
        const messageCount = await page.evaluate(() => window.fixtureMessageCount);
        assert.equal(messageCount, variant === "before" ? 10_000 : 0);
        const clickStart = await page.evaluate(() => performance.now());
        await page.locator('button[title="Rehearsal 1"]').click();
        await page.getByText(messages.findLast((message) => message.channel_id === channels[0].id).body, { exact: true }).waitFor();
        const conversationMs = await page.evaluate((started) => performance.now() - started, clickStart);
        if (trial) trials[variant].push({ inboxMs, conversationMs, totalMs: inboxMs + conversationMs });
      }
      console.log(`${device}: ${trial === 0 ? "warmup" : `sample ${trial}/${samples}`} passed`);
    }
    assert.deepEqual(errors, [], "Browser runtime errors invalidate the benchmark.");
    const result = { device, samples, rawSamples: trials, profile: device === "phone" ? "Pixel 7, 4x CPU, 150 ms network latency, 8 Mbps throughput" : "1280x800, unthrottled", before: {}, after: {}, improvementPercent: {} };
    for (const metric of ["inboxMs", "conversationMs", "totalMs"]) {
      result.before[metric] = +median(trials.before.map((trial) => trial[metric])).toFixed(2);
      result.after[metric] = +median(trials.after.map((trial) => trial[metric])).toFixed(2);
      result.improvementPercent[metric] = +((1 - result.after[metric] / result.before[metric]) * 100).toFixed(1);
    }
    measurements.push(result);
    await browserContext.close();
  }
  const evidence = { baseline, head, sourceHashes, fixture, scope: "Actual Messages page loaders, first-page server action and components, synthetic HTTP fixture; auth/Next shell/realtime/action HTTP transport adapted; no live or complete Next.js route latency claim", payloadEvidence, historyEvidence, measurements };
  const evidenceFile = path.join(temporaryRoot, "results.json");
  await writeFile(evidenceFile, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ ...evidence, evidenceFile }, null, 2));
  for (const result of measurements) {
    assert(result.improvementPercent.inboxMs >= 25, `${result.device} inbox misses 25% median target`);
    assert(result.improvementPercent.totalMs >= 25, `${result.device} total conversation journey misses 25% median target`);
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  delete globalThis.workflowFixtureClient;
}
