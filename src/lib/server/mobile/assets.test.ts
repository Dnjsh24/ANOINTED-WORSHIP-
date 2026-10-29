// @vitest-environment node
import { createClient } from "@supabase/supabase-js";
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { readMobileAssets, signMobileAsset } from "./assets";
vi.mock("./context", () => ({ MobileApiError: class extends Error { constructor(readonly status: number, readonly code: string, message: string) { super(message); } } }));
vi.mock("@/lib/supabase/env", () => ({ getSupabaseEnv: () => ({ url: "https://project.supabase.co", publishableKey: "publishable-test" }) }));
const id = (last: number) => `10000000-0000-4000-8000-${String(last).padStart(12, "0")}`;
const identity = { userId: id(1), teamId: id(2), memberId: id(3), teamName: "Team", role: "member", permissions: [] };
const asset = { assetId: "file_test", purpose: "attachment", version: "a".repeat(64), entityType: "song", entityId: id(4), fileName: "Chart.pdf", mimeType: "application/pdf", sizeBytes: 40, kind: "document", source: { kind: "storage", bucket: "practice-files", objectPath: `${identity.teamId}/chart.pdf` } };
const input = { version: 1 as const, manifestId: id(5), assetId: asset.assetId };
function database(responses: { data: unknown; status?: number }[], binary?: { body?: string; status?: number; afterHash?: { data: unknown; status?: number } }) {
  const calls: { url: URL; body: unknown; authorization: string | null }[] = [];
  const client = createClient<Database>("https://project.supabase.co", "publishable-test", {
    auth: { persistSession: false }, global: { headers: { Authorization: "Bearer test-user-session" }, fetch: async (url, options) => {
      calls.push({ url: new URL(String(url)), body: JSON.parse(String(options?.body ?? "null")), authorization: new Headers(options?.headers).get("authorization") });
      if (calls.at(-1)!.url.pathname.startsWith('/storage/v1/object/practice-files/')) return new Response(binary?.body ?? 'x'.repeat(40), { status: binary?.status ?? 200 });
      const afterDownload = calls.at(-2)?.url.pathname.startsWith('/storage/v1/object/practice-files/');
      const response = afterDownload ? binary?.afterHash ?? { data: asset } : responses.shift();
      if (!response) throw new Error("Unexpected network call");
      return new Response(JSON.stringify(response.data), { status: response.status ?? 200, headers: { "Content-Type": "application/json" } });
    } },
  });
  return { client, calls };
}
beforeEach(() => vi.restoreAllMocks());
describe("mobile asset authorized server flow", () => {
  it("requests exact pinned manifest/team and maps descriptors without minting URLs", async () => {
    const db = database([{ data: { manifestId: input.manifestId, assets: [asset], nextId: null, incomplete: false } }]);
    expect(await readMobileAssets({ ...db, identity, input })).toMatchObject({ assets: [asset], incomplete: false });
    expect(db.calls).toHaveLength(1);
    expect(db.calls[0].body).toEqual({ p_team_id: identity.teamId, p_manifest_id: input.manifestId, p_after: null });
    expect(db.calls[0].url.pathname).toBe("/rest/v1/rpc/mobile_download_asset_page");
  });
  it.each(["https://other.supabase.co", "https://project.supabase.co.evil.test", "http://project.supabase.co", "https://user@project.supabase.co"])("marks untrusted image origin %s incomplete", async origin => {
    const raw = { ...asset, imageUrl: `${origin}/storage/v1/object/public/practice-files/${asset.source.objectPath}` };
    const db = database([{ data: { manifestId: input.manifestId, assets: [raw], nextId: null, incomplete: false } }]);
    const result = await readMobileAssets({ ...db, identity, input });
    expect(result.incomplete).toBe(true);
    expect(result.assets[0].source).toMatchObject({ kind: "unavailable", reason: "external-source" });
    expect(result.assets[0]).not.toHaveProperty("imageUrl");
  });
  it("accepts only the configured origin and exact recognized object URL", async () => {
    const raw = { ...asset, imageUrl: `https://project.supabase.co/storage/v1/object/public/practice-files/${asset.source.objectPath}` };
    const db = database([{ data: { manifestId: input.manifestId, assets: [raw], nextId: null, incomplete: false } }]);
    expect((await readMobileAssets({ ...db, identity, input })).assets[0]).toEqual(asset);
  });
  it("signs through the original user client then revalidates source with a 60-second URL", async () => {
    const db = database([{ data: asset }, { data: { signedURL: `/object/sign/practice-files/${asset.source.objectPath}?token=short-lived-test` } }, { data: asset }]);
    const result = await signMobileAsset({ ...db, identity, input });
    expect(result.assetVersion).toBe(asset.version);
    expect(result.sha256).toBe(createHash('sha256').update('x'.repeat(40)).digest('hex'));
    expect(Date.parse(result.expiresAt) - Date.now()).toBeGreaterThan(58000);
    expect(db.calls.map(call => call.url.pathname)).toEqual(["/rest/v1/rpc/mobile_download_asset_source", `/storage/v1/object/practice-files/${asset.source.objectPath}`, "/rest/v1/rpc/mobile_download_asset_source", `/storage/v1/object/sign/practice-files/${asset.source.objectPath}`, "/rest/v1/rpc/mobile_download_asset_source"]);
    expect(db.calls[3].body).toEqual({ expiresIn: 60 });
    expect(db.calls[1].url.searchParams.get('cacheNonce')).toBe(asset.version);
    expect(db.calls.every(call => call.authorization === "Bearer test-user-session")).toBe(true);
  });
  it.each(["foreign", "external", "unavailable"])("does not sign %s source", async kind => {
    const raw = kind === "foreign" ? { ...asset, source: { ...asset.source, objectPath: `${id(99)}/chart.pdf` } }
      : kind === "external" ? { ...asset, imageUrl: `https://evil.test/storage/v1/object/public/practice-files/${asset.source.objectPath}` }
      : { ...asset, source: { kind: "unavailable", reason: "missing-object" } };
    const db = database([{ data: raw }]);
    await expect(signMobileAsset({ ...db, identity, input })).rejects.toMatchObject({ status: 403 });
    expect(db.calls).toHaveLength(1);
  });
  it("fails closed when signing fails", async () => {
    const db = database([{ data: asset }, { data: { error: "RLS denied", message: "secret storage details" }, status: 403 }]);
    await expect(signMobileAsset({ ...db, identity, input })).rejects.toMatchObject({ status: 503, message: "Download assets are unavailable. Retry later." });
  });
  it('does not sign failed or differently sized file bytes', async () => {
    for (const binary of [{ status: 403 }, { body: 'wrong size' }]) {
      const db = database([{ data: asset }], binary);
      await expect(signMobileAsset({ ...db, identity, input })).rejects.toMatchObject({ status: binary.status ? 503 : 409 });
      expect(db.calls.some(call => call.url.pathname.includes('/object/sign/'))).toBe(false);
    }
  });
  it('rejects an object change during hashing before issuing a URL', async () => {
    const db = database([{ data: asset }], { afterHash: { data: { code: '40001', message: 'Changed' }, status: 409 } });
    await expect(signMobileAsset({ ...db, identity, input })).rejects.toMatchObject({ status: 409 });
    expect(db.calls.some(call => call.url.pathname.includes('/object/sign/'))).toBe(false);
  });
  it("fails closed on membership revocation between RPC and Storage signing", async () => {
    const db = database([{ data: asset }, { data: { signedURL: `/object/sign/practice-files/${asset.source.objectPath}?token=test` } }, { data: { code: "42501", message: "secret" }, status: 403 }]);
    await expect(signMobileAsset({ ...db, identity, input })).rejects.toMatchObject({ status: 403 });
  });
  it("rejects source changes during signing", async () => {
    const db = database([{ data: asset }, { data: { signedURL: `/object/sign/practice-files/${asset.source.objectPath}?token=test` } }, { data: { ...asset, version: "b".repeat(64) } }]);
    await expect(signMobileAsset({ ...db, identity, input })).rejects.toMatchObject({ status: 503 });
  });
  it("returns retryable 409 for a stale source without treating the account as revoked", async () => {
    for (const stage of ["before-signing", "after-signing"]) {
      const failure = { data: { code: "40001", message: "Asset version changed" }, status: 409 };
      const db = database(stage === "before-signing" ? [failure] : [
        { data: asset }, { data: { signedURL: `/object/sign/practice-files/${asset.source.objectPath}?token=test` } }, failure,
      ]);
      await expect(signMobileAsset({ ...db, identity, input })).rejects.toMatchObject({ status: 409, code: "retry" });
    }
    const db = database([{ data: { code: "40001", message: "Asset version changed" }, status: 409 }]);
    await expect(readMobileAssets({ ...db, identity, input })).rejects.toMatchObject({ status: 409, code: "retry" });
  });
  it("rejects a signer response for another object", async () => {
    const db = database([{ data: asset }, { data: { signedURL: "/object/sign/practice-files/other-object.pdf?token=test" } }, { data: asset }]);
    await expect(signMobileAsset({ ...db, identity, input })).rejects.toMatchObject({ status: 503 });
  });
  it.each(["?download=1", "#fragment"])("rejects image URL suffix %s before signing", async suffix => {
    const db = database([{ data: { ...asset, imageUrl: `https://project.supabase.co/storage/v1/object/public/practice-files/${asset.source.objectPath}${suffix}` } }]);
    await expect(signMobileAsset({ ...db, identity, input })).rejects.toMatchObject({ status: 403 });
    expect(db.calls).toHaveLength(1);
  });
  it("rejects malformed database cursors and foreign-team descriptors", async () => {
    for (const data of [
      { manifestId: input.manifestId, assets: [], nextId: "../unsafe", incomplete: false },
      { manifestId: input.manifestId, assets: [{ ...asset, source: { ...asset.source, objectPath: `${id(99)}/foreign.pdf` } }], nextId: null, incomplete: false },
    ]) {
      const db = database([{ data }]);
      await expect(readMobileAssets({ ...db, identity, input })).rejects.toMatchObject({ status: 503 });
    }
  });
  it("rejects malformed RPC output and mismatched manifests", async () => {
    for (const data of [null, { manifestId: id(99), assets: [], nextId: null, incomplete: false }]) {
      const db = database([{ data }]);
      await expect(readMobileAssets({ ...db, identity, input })).rejects.toMatchObject({ status: 503 });
    }
  });
});
