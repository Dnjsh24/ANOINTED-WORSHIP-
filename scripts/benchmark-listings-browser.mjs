// Actual baseline/current listing loaders and clients on a shared synthetic HTTP fixture.
// Next shell/navigation, auth and action transport are adapted; no live or full Next latency claim.
// BENCHMARK_SOURCE_ROOT selects the authoritative checkout when run from a stale worktree.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(process.env.BENCHMARK_SOURCE_ROOT ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const dependency = (name) => import(pathToFileURL(path.join(root, "node_modules", name)).href);
const { createClient } = await dependency("@supabase/supabase-js/dist/index.mjs");
const { chromium, devices } = await dependency("playwright/index.mjs");
const { build } = await import(process.env.ESBUILD_MODULE_PATH ? pathToFileURL(path.resolve(process.env.ESBUILD_MODULE_PATH)).href : "esbuild");
const baseline = execFileSync("git", ["rev-parse", process.env.BENCHMARK_BASELINE ?? "0cdbfc5"], { cwd: root, encoding: "utf8", windowsHide: true }).trim();
const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", windowsHide: true }).trim();
const samples = Number(process.env.BENCHMARK_SAMPLES ?? 7);
assert(Number.isInteger(samples) && samples >= 3 && samples % 2 === 1, "Use an odd sample count of at least three.");
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "anointed-listings-browser-"));
const sourceHashes = {};
const hashSource = async (file) => { sourceHashes[file] = createHash("sha256").update(await readFile(file)).digest("hex"); };
await hashSource(fileURLToPath(import.meta.url));
await hashSource(path.join(root, "package-lock.json"));
const id = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const teamId = id(1);
const members = Array.from({ length: 50 }, (_, index) => ({ id: id(100 + index), team_id: teamId, profiles: { id: id(200 + index), full_name: `Member ${index + 1}` } }));
const songs = Array.from({ length: 1000 }, (_, index) => ({
  id: id(1000 + index), team_id: teamId, title: `Song ${String(index + 1).padStart(4, "0")}`, artist: `Artist ${index % 10}`,
  original_key: "C", bpm: 80, time_signature: "4/4", tags: ["Worship", "Rehearsal"], youtube_url: null,
  image_url: null, album: "Team repertoire", deleted_at: null, status: "approved", setlist_songs: [{ count: 2 }],
}));
const setlists = Array.from({ length: 500 }, (_, index) => ({
  id: id(3000 + index), team_id: teamId, name: `Setlist ${String(index + 1).padStart(4, "0")}`,
  setlist_date: new Date(Date.UTC(2026, 0, 1) + index * 86400000).toISOString().slice(0, 10),
  location: "Main Sanctuary", call_time: "09:00:00", rehearsal_time: "08:00:00", service_times: ["Sunday Worship"],
  deleted_at: null, event_id: id(5000 + index), events: { type: "service" }, leader_member_id: members[index % 50].id,
  leader: { id: members[index % 50].id, profile_id: id(200 + index % 50), profiles: members[index % 50].profiles },
  setlist_songs: Array.from({ length: 4 }, (_, slot) => ({ id: id(6000 + index * 4 + slot), assigned_key: "C", song_order: slot,
    song: songs[(index * 2 + slot) % songs.length] })),
}));
const context = { teamId, userId: id(200), memberId: members[0].id, role: "member" };
let queries = [];
const literalMatch = (query, values) => values.some((value) => String(value).toLowerCase().includes(query));
const fieldValue = (row, field) => field.split(".").reduce((value, part) => value?.[part], row);
// This adapter implements only the table/RPC contracts exercised below; unsupported filters fail closed.
function fixtureResponse(input, init) {
  const url = new URL(String(input));
  const table = url.pathname.split("/").at(-1);
  const args = init?.body ? JSON.parse(String(init.body)) : {};
  let rows;
  if (table === "songs" || table === "search_songs") rows = songs;
  else if (table === "setlists" || table === "search_setlists") rows = setlists;
  else if (table === "team_members") rows = members;
  else if (table === "song_favorites") rows = [];
  else throw new Error(`Unexpected fixture query: ${url.pathname}`);
  if (table.startsWith("search_")) {
    assert.equal(args.p_team_id, teamId);
    const query = String(args.p_query ?? "").trim().toLowerCase();
    rows = rows.filter((row) => row.team_id === args.p_team_id && row.deleted_at === null);
    if (table === "search_songs") {
      assert.equal(args.p_favorites, false, "Timing fixture contains no favorite-only requests.");
      assert.equal(args.p_sort, "title", "Timing fixture uses title ordering.");
      rows = rows.filter((row) => row.status === "approved" && literalMatch(query, [row.title, row.artist, ...row.tags]));
    } else rows = rows.filter((row) => literalMatch(query, [row.name, row.location, row.setlist_date,
      ...row.service_times, row.leader.profiles.full_name, ...row.setlist_songs.map((slot) => slot.song.title)]));
  }
  for (const [field, filter] of url.searchParams) {
    if (["select", "order", "offset", "limit"].includes(field)) continue;
    rows = rows.filter((row) => {
      const value = fieldValue(row, field);
      if (filter.startsWith("eq.")) return String(value) === filter.slice(3);
      if (filter === "is.null") return value === null;
      if (filter.startsWith("in.(")) return filter.slice(4, -1).split(",").includes(String(value));
      if (filter.startsWith("gte.")) return String(value) >= filter.slice(4);
      if (filter.startsWith("lt.")) return String(value) < filter.slice(3);
      throw new Error(`Unsupported fixture filter: ${field}=${filter}`);
    });
  }
  const order = url.searchParams.get("order")?.split(",") ?? [];
  rows = [...rows].sort((left, right) => {
    for (const item of order) {
      const [field, direction] = item.split(".");
      const comparison = String(fieldValue(left, field)).localeCompare(String(fieldValue(right, field)));
      if (comparison) return direction === "desc" ? -comparison : comparison;
    }
    return 0;
  });
  const total = rows.length;
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const limit = Number(url.searchParams.get("limit") ?? total);
  rows = rows.slice(offset, offset + limit);
  // Project the real selected columns rather than charging either variant for fixture-only fields.
  if (table === "songs" || table === "search_songs") rows = rows.map((row) => Object.fromEntries(
    Object.entries(row).filter(([field]) => !["team_id", "deleted_at", "status"].includes(field)),
  ));
  if (table === "team_members") rows = rows.map(({ id, profiles }) => ({ id, profiles: { full_name: profiles.full_name } }));
  if (table === "setlists" || table === "search_setlists") rows = rows.map((row) => ({ ...row, setlist_songs: row.setlist_songs.map((slot) => ({ ...slot,
    song: Object.fromEntries(["id", "title", "artist", "original_key", "bpm", "time_signature", "tags"].map((field) => [field, slot.song[field]])) })) }));
  const json = JSON.stringify(rows);
  queries.push({ table, rows: rows.length, total, bytes: Buffer.byteLength(json), search: url.search, args });
  return new Response(json, { headers: { "Content-Type": "application/json", "Content-Range": rows.length ? `${offset}-${offset + rows.length - 1}/${total}` : `*/${total}` } });
}
globalThis.listingsFixtureClient = createClient("https://fixture.supabase.test", "fixture-publishable-key", {
  auth: { persistSession: false }, global: { fetch: async (input, init) => fixtureResponse(input, init) },
});
const browserStubs = {
  "next/link": 'import React from "react";export default function Link({href,children,...props}){return React.createElement("a",{...props,href},children);}',
  "next/image": 'import React from "react";export default function Image({unoptimized,...props}){return React.createElement("img",props);}',
  "next/navigation": 'export const useRouter=()=>({push:href=>window.history.pushState(null,"",href),refresh:()=>{}});',
  "@/app/actions": 'export const toggleSongFavoriteAction=async()=>({ok:true,message:"Saved"});',
};
const loaderStubs = {
  ...browserStubs,
  "@/components/app-shell": 'export const AppShell="fixture-shell";',
  "@/components/song-library-grid": 'export const SongLibraryGrid="fixture-client";',
  "@/components/setlists-client": 'export const SetlistsClient="fixture-client";',
  "@/components/list-pagination": 'export const ListPagination="fixture-pagination";',
  "@/lib/supabase/server": 'export const createClient=async()=>globalThis.listingsFixtureClient;',
  "@/lib/supabase/env": 'export const hasSupabaseEnv=()=>true;',
  "@/lib/supabase/team-guard": `export const getRequiredTeamContext=async()=>(${JSON.stringify(context)});`,
  "@/lib/desktop/runtime": 'export const isDesktopRuntime=()=>false;',
  "@/lib/desktop/workspace": 'export const listDesktopSongs=()=>[];export const listDesktopSetlists=()=>[];',
};
function adapterPlugin(stubs) {
  return { name: "listing-fixture-boundaries", setup(builder) {
    builder.onResolve({ filter: /.*/ }, (args) => {
      if (Object.hasOwn(stubs, args.path)) return { path: args.path, namespace: "fixture" };
      if (args.path.startsWith("@/")) {
        const source = path.join(root, "src", args.path.slice(2));
        const resolved = [source, source + ".ts", source + ".tsx"].find((file) => existsSync(file));
        assert(resolved, `Missing candidate module: ${args.path}`);
        return { path: resolved };
      }
    });
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({ contents: stubs[args.path], resolveDir: root, loader: "jsx" }));
  } };
}
function findElement(element, type) {
  if (!element || typeof element !== "object") return;
  if (element.type === type) return element;
  for (const child of [element.props?.children].flat()) {
    const found = findElement(child, type);
    if (found) return found;
  }
}
const loaders = {};
const bundles = {};
for (const route of ["songs", "setlists"]) for (const variant of ["before", "after"]) {
  const pageSource = `src/app/${route}/page.tsx`;
  const clientSource = `src/components/${route === "songs" ? "song-library-grid" : "setlists-client"}.tsx`;
  const source = async (file) => variant === "before"
    ? execFileSync("git", ["show", `${baseline}:${file}`], { cwd: root, encoding: "utf8", windowsHide: true })
    : readFile(path.join(root, file), "utf8");
  const key = `${route}-${variant}`;
  const pageFile = path.join(temporaryRoot, `${key}-page.tsx`);
  const clientFile = path.join(temporaryRoot, `${key}-client.tsx`);
  await writeFile(pageFile, await source(pageSource));
  await writeFile(clientFile, await source(clientSource));
  if (variant === "after") { await hashSource(path.join(root, pageSource)); await hashSource(path.join(root, clientSource)); }
  const loaderFile = path.join(temporaryRoot, `${key}-loader.mjs`);
  const loaded = await build({ entryPoints: [pageFile], outfile: loaderFile, bundle: true, platform: "node", format: "esm",
    jsx: "automatic", nodePaths: [path.join(root, "node_modules")], plugins: [adapterPlugin(loaderStubs)], metafile: true });
  loaders[key] = (await import(pathToFileURL(loaderFile).href)).default;
  const browserFile = path.join(temporaryRoot, `${key}.js`);
  const rendered = await build({ stdin: { contents: `import React,{useEffect} from "react";import {createRoot} from "react-dom/client";
    import {${route === "songs" ? "SongLibraryGrid" : "SetlistsClient"} as Client} from ${JSON.stringify(clientFile)};
    import {ListPagination} from "@/components/list-pagination";
    const fixture=await(await fetch('/fixture/${key}')).json();window.fixtureCount=fixture.props.${route};window.fixtureTotal=fixture.total;
    function App(){useEffect(()=>{window.fixtureReady=performance.now();},[]);return <><Client {...fixture.props}/>{fixture.pagination&&<ListPagination {...fixture.pagination}/>}</>;}
    createRoot(document.getElementById('root')).render(<App/>);`, resolveDir: root, loader: "tsx" },
    outfile: browserFile, bundle: true, platform: "browser", format: "esm", minify: true, jsx: "automatic",
    define: { "process.env": "{}", "process.env.NODE_ENV": '"production"' }, nodePaths: [path.join(root, "node_modules")], plugins: [adapterPlugin(browserStubs)], metafile: true });
  bundles[key] = await readFile(browserFile);
  for (const input of [...Object.keys(loaded.metafile.inputs), ...Object.keys(rendered.metafile.inputs)]) {
    const file = path.resolve(root, input);
    if (file.startsWith(path.join(root, "src") + path.sep) && existsSync(file)) await hashSource(file);
  }
}
const payloadEvidence = {};
async function loadFixture(key, params = {}) {
  queries = [];
  const started = performance.now();
  const element = await loaders[key]({ searchParams: Promise.resolve(params) });
  const props = findElement(element, "fixture-client")?.props;
  assert(props, `Missing actual client props: ${key}`);
  const pagination = findElement(element, "fixture-pagination")?.props;
  const route = key.startsWith("songs") ? "songs" : "setlists";
  const total = pagination?.totalCount ?? props[route].length;
  const result = { props, pagination, total };
  const json = JSON.stringify(result);
  return { result, json, evidence: { loaderMs: +(performance.now() - started).toFixed(2), bytes: Buffer.byteLength(json), count: props[route].length, total, queries: [...queries] } };
}
// Exercise real loader search/count/range contracts before any timing or browser launch.
for (const route of ["songs", "setlists"]) for (const variant of ["before", "after"]) {
  const key = `${route}-${variant}`;
  const fixture = await loadFixture(key);
  assert.equal(fixture.result.total, route === "songs" ? 1000 : 500);
  assert.equal(fixture.evidence.count, variant === "before" ? fixture.result.total : route === "songs" ? 50 : 20);
  payloadEvidence[key] = fixture.evidence;
}
const searchEvidence = {};
for (const route of ["songs", "setlists"]) {
  const fixture = await loadFixture(`${route}-after`, { q: "Song 1000" });
  assert.equal(fixture.result.total, route === "songs" ? 1 : 2);
  assert.equal(fixture.evidence.count, fixture.result.total);
  searchEvidence[route] = fixture.evidence;
}
const cssFile = (await readdir(path.join(root, ".next/static/css"))).find((file) => file.endsWith(".css"));
assert(cssFile, "Build the authoritative production website first.");
const css = await readFile(path.join(root, ".next/static/css", cssFile));
await hashSource(path.join(root, ".next/static/css", cssFile));
if (process.env.BENCHMARK_BUILD_ONLY === "1") {
  console.log(JSON.stringify({ baseline, head, sourceHashes, temporaryRoot, payloadEvidence, searchEvidence, status: "Bundle and loader assertions passed; browser not launched" }, null, 2));
  delete globalThis.listingsFixtureClient;
} else {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      if (url.pathname === "/style.css") { response.setHeader("Content-Type", "text/css"); response.end(css); return; }
      const key = url.pathname.replace(/^\/(?:fixture\/)?/, "").replace(/\.js$/, "");
      assert(Object.hasOwn(loaders, key), `Unexpected benchmark URL: ${url.pathname}`);
      if (url.pathname.endsWith(".js")) { response.setHeader("Content-Type", "text/javascript"); response.end(bundles[key]); return; }
      if (url.pathname.startsWith("/fixture/")) {
        const fixture = await loadFixture(key); payloadEvidence[key] = fixture.evidence;
        response.setHeader("Content-Type", "application/json"); response.end(fixture.json); return;
      }
      response.setHeader("Content-Type", "text/html");
      response.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body style="background:#0d0d10;color:white"><div id="root"></div><script type="module" src="/${key}.js"></script></body></html>`);
    } catch (error) { response.statusCode = 500; response.end(error.stack); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const measurements = [];
  const median = (values) => [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)];
  try {
    for (const device of ["desktop", "phone"]) {
      const browserContext = await browser.newContext(device === "phone" ? devices["Pixel 7"] : { viewport: { width: 1280, height: 800 } });
      const page = await browserContext.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const cdp = await browserContext.newCDPSession(page);
      if (device === "phone") {
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
        await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 1_000_000, uploadThroughput: 1_000_000 });
      }
      for (const route of ["songs", "setlists"]) {
        const rawSamples = { before: [], after: [] };
        for (let trial = 0; trial <= samples; trial++) {
          for (const variant of trial % 2 ? ["after", "before"] : ["before", "after"]) {
            await page.goto(`${origin}/${route}-${variant}`);
            await page.waitForFunction(() => Number.isFinite(window.fixtureReady));
            const result = await page.evaluate(() => ({ loadMs: window.fixtureReady, count: window.fixtureCount.length, total: window.fixtureTotal }));
            assert.equal(result.total, route === "songs" ? 1000 : 500);
            assert.equal(result.count, variant === "before" ? result.total : route === "songs" ? 50 : 20);
            const rendered = route === "songs" ? page.getByRole("link", { name: /^Song \d{4}$/ }) : page.locator('h3');
            assert.equal(await rendered.count(), result.count, "Actual client must render every loaded listing item.");
            if (trial) rawSamples[variant].push(result.loadMs);
          }
          console.log(`${device}/${route}: ${trial ? `sample ${trial}/${samples}` : "warmup"} passed`);
        }
        const beforeMs = median(rawSamples.before);
        const afterMs = median(rawSamples.after);
        measurements.push({ route, device, samples, rawSamples, beforeMs, afterMs, improvementPercent: (1 - afterMs / beforeMs) * 100,
          profile: device === "phone" ? "Pixel 7, 4x CPU, 150 ms network latency, 8 Mbps throughput" : "1280x800, unthrottled" });
      }
      assert.deepEqual(errors, [], "Browser runtime errors invalidate benchmark evidence.");
      await browserContext.close();
    }
    const evidence = { baseline, head, sourceHashes, fixture: { members: 50, songs: 1000, setlists: 500, songsPerSetlist: 4 },
      scope: "Actual listing loaders and clients, synthetic Supabase HTTP fixture; Next shell/navigation/auth/action transport adapted; no live database or complete Next route latency claim", payloadEvidence, searchEvidence, measurements };
    const evidenceFile = path.join(temporaryRoot, "results.json");
    await writeFile(evidenceFile, JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify({ ...evidence, evidenceFile }, null, 2));
    for (const result of measurements) assert(result.improvementPercent >= 25, `${result.device}/${result.route} misses 25% median loading target`);
  } finally {
    await browser.close(); await new Promise((resolve) => server.close(resolve)); delete globalThis.listingsFixtureClient;
  }
}
