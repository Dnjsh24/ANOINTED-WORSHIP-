import { describe, expect, it } from "vitest";
import { ACTIVE_METERS, admitIdentity, admitPreviewProof, assessStage, FREE_ALLOWANCES, isAllowedNetworkURL, percentile, readBoundedMedia, validateSetup, validateUsage } from "./free-capacity.mjs";

const demo = { mode: "local-demo", baseURL: "http://127.0.0.1:3000", stages: [1], holdSeconds: 10, thinkSeconds: 5, maxRequests: 100, actors: [{ id: "one", role: "browse" }] };
const usage = () => ({ recordedAt: new Date().toISOString(), ...Object.fromEntries(Object.keys(FREE_ALLOWANCES).map(key => [key, 0])) });
const afterUsage = () => ({ ...usage(), ...Object.fromEntries(ACTIVE_METERS.map(key => [key, key.endsWith("Hours") ? 0.001 : 100])) });
const stage = () => ({ users: 25, operations: 1000, actorOperations: Object.fromEntries(Array.from({ length: 25 }, (_, index) => [`actor-${index}`, 40])), errors: 0, requests: 1000, httpErrors: 0, operationMs: [100], liveDeliveryMs: Array(10).fill(100), vitals: { LCP: [1000], INP: [100], CLS: [0.01] }, peakConnections: 30, peakEventsPerSecond: 20, completedRoles: ["browse", "chat", "editor", "presenter", "media"], reconnectVerified: true, stopped: false, durationSeconds: 3600, generatorDelayP95Ms: 20 });

describe("free-only capacity safeguards", () => {
  it("never certifies demo traffic and rejects production, remote demo, or unsafe actor URLs", () => {
    expect(validateSetup(demo).capacityVerified).toBe(false);
    expect(() => validateSetup({ ...demo, baseURL: "https://anointed-worship-app.vercel.app" })).toThrow();
    expect(() => validateSetup({ ...demo, baseURL: "https://preview.vercel.app" })).toThrow();
    expect(() => validateSetup({ ...demo, actors: [{ id: "one", role: "browse", routes: ["//other.test"] }] })).toThrow();
    expect(assessStage(stage(), { remote: false }).capacityVerified).toBe(false);
  });
  it("refuses unverified free hosting and stages that exhaust realtime headroom", () => {
    expect(() => validateSetup({ ...demo, mode: "isolated-free-preview", baseURL: "https://preview.vercel.app" })).toThrow();
    expect(() => validateSetup({ ...demo, stages: [150], actors: Array.from({ length: 150 }, (_, id) => ({ id: `actor-${id}`, role: "browse" })) })).toThrow(/headroom/);
    expect(() => validateSetup({ ...demo, maxRequests: Infinity })).toThrow();
  });
  it("rejects stale, missing, negative, or exhausted provider usage", () => {
    expect(validateUsage(usage())).toBeTruthy();
    expect(() => validateUsage({ ...usage(), recordedAt: "2020-01-01" })).toThrow();
    expect(() => validateUsage({ ...usage(), redisCommands: 400001 })).toThrow();
    expect(() => validateUsage({ ...usage(), redisCommands: -1 })).toThrow();
    expect(() => validateUsage({ recordedAt: new Date().toISOString() })).toThrow();
  });
  it("requires full workload, live delivery, Web Vitals, recovery and a soak", () => {
    const assessment = assessStage(stage(), { remote: true, before: usage(), after: afterUsage() });
    expect(assessment.harnessCriteriaPassed).toBe(true);
    expect(assessment.capacityVerified).toBe(false); // Independent provider/DB/device acceptance still required.
    expect(assessStage(stage(), { remote: true, before: usage(), after: usage() }).capacityVerified).toBe(false);
    expect(assessStage({ ...stage(), liveDeliveryMs: [], completedRoles: ["browse"], durationSeconds: 30 }, { remote: true, before: usage(), after: usage() }).capacityVerified).toBe(false);
    expect(assessStage({ ...stage(), httpErrors: 10 }, { remote: true, before: usage(), after: usage() }).capacityVerified).toBe(false);
    expect(assessStage({ ...stage(), generatorDelayP95Ms: 200 }, { remote: true, before: usage(), after: usage() }).capacityVerified).toBe(false);
  });
  it("rejects projected monthly exhaustion and missing measurements", () => {
    expect(assessStage(stage(), { remote: true, before: usage(), after: { ...usage(), redisCommands: 20000 } }).capacityVerified).toBe(false);
    expect(assessStage({ ...stage(), vitals: { LCP: [], INP: [], CLS: [] } }, { remote: true, before: usage(), after: usage() }).capacityVerified).toBe(false);
    expect(percentile([], 0.95)).toBeNull();
    expect(percentile([30, 10, 20], 0.95)).toBe(30);
  });
  it("refuses unobserved CPU and egress rather than projecting zero cost", () => {
    for (const key of ACTIVE_METERS) {
      const result = assessStage(stage(), { remote: true, before: usage(), after: { ...afterUsage(), [key]: 0 } });
      expect(result.capacityVerified).toBe(false);
      expect(result.reasons).toContain(`${key} test traffic unobserved`);
    }
  });
  it("guards HTTP and websocket origins, including production aliases and external sockets", () => {
    const origins = new Set(["https://preview.vercel.app", "https://isolated.supabase.co"]);
    expect(isAllowedNetworkURL("wss://isolated.supabase.co/realtime/v1/websocket?apikey=public", origins, true)).toBe(true);
    for (const host of ["xvrndwkghxkqsvxxtqym.supabase.co", "external.test", "anointed-worship-app.vercel.app"]) {
      expect(isAllowedNetworkURL(`wss://${host}/socket`, origins, true)).toBe(false);
      expect(isAllowedNetworkURL(`https://${host}/api`, origins)).toBe(false);
    }
  });
  it("rejects copied sessions and inactive or foreign selected team memberships", () => {
    const admitted = new Set();
    const actor = { teamId: "synthetic-team" };
    const membership = { team_id: actor.teamId, status: "active" };
    admitIdentity({ id: "server-verified-account" }, membership, actor, admitted);
    expect(() => admitIdentity({ id: "server-verified-account" }, membership, actor, admitted)).toThrow(/Repeated/);
    expect(() => admitIdentity({ id: "second" }, { ...membership, status: "inactive" }, actor, admitted)).toThrow();
    expect(() => admitIdentity({ id: "second" }, { ...membership, team_id: "foreign" }, actor, admitted)).toThrow();
  });
  it("requires server-confirmed matching preview source and approved backend before admitting actors", () => {
    const config = { baseline: { commit: "a".repeat(40) }, supabaseURL: "https://fbrmotzjsnmdpdkcxyqb.supabase.co", redisURL: "https://isolated-redis.upstash.io" };
    const proof = { mode: "isolated-free-preview", commit: config.baseline.commit, supabaseOrigin: config.supabaseURL, redisOrigin: config.redisURL, userId: "account", teamId: "team", status: "active" };
    for (const change of [{ mode: "production" }, { commit: "b".repeat(40) }, { supabaseOrigin: "https://xvrndwkghxkqsvxxtqym.supabase.co" }, { redisOrigin: "https://different-redis.upstash.io" }]) {
      expect(() => admitPreviewProof({ ...proof, ...change }, config, { teamId: "team" }, new Set())).toThrow();
    }
    expect(() => admitPreviewProof(proof, config, { teamId: "team" }, new Set())).not.toThrow();
    expect(assessStage({ ...stage(), operations: 1, liveDeliveryMs: [1] }, { remote: true, before: usage(), after: afterUsage() }).harnessCriteriaPassed).toBe(false);
  });
  it("allows a representative short ramp to reach soak while retaining the full soak sample floor", () => {
    const short = { ...stage(), phase: "ramp", durationSeconds: 60, sustainedSeconds: 60, operations: 50, liveDeliveryMs: [100] };
    expect(assessStage(short, { remote: true, before: usage(), after: usage() }).qualifiesForSoak).toBe(true);
    expect(assessStage({ ...short, phase: "soak" }, { remote: true, before: usage(), after: usage() }).qualifiesForSoak).toBe(false);
    expect(assessStage({ ...stage(), actorOperations: { ...stage().actorOperations, "actor-0": 0 } }, { remote: true, before: usage(), after: afterUsage() }).harnessCriteriaPassed).toBe(false);
  });
  it("cancels oversized and cumulative media downloads, including responses without a length", async () => {
    let canceled = false;
    const stream = () => new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(1_000_000)); }, cancel() { canceled = true; } });
    await expect(readBoundedMedia(new Response(stream()), { bytes: 0 })).rejects.toThrow(/byte budget/);
    expect(canceled).toBe(true);
    canceled = false;
    await expect(readBoundedMedia(new Response(stream()), { bytes: 99_500_000 })).rejects.toThrow(/byte budget/);
    expect(canceled).toBe(true);
    await expect(readBoundedMedia(new Response(stream(), { headers: { "content-length": "6000000" } }), { bytes: 0 })).rejects.toThrow(/per-file/);
    expect(await readBoundedMedia(new Response(new Uint8Array(10)), { bytes: 0 })).toBe(10);
  });
});
