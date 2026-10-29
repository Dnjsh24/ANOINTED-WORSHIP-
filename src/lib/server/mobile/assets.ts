import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mobileAssetIdSchema, mobileAssetSchema, mobileAssetPageSchema, mobileAssetUrlResponseSchema, type MobileAsset, type MobileAssetPageRequest, type MobileAssetUrlRequest } from "@/lib/mobile/asset-contracts";
import type { MobileIdentity } from "@/lib/mobile/contracts";
import type { Database, Json } from "@/lib/supabase/database.types";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { MobileApiError } from "./context";
import { mobileDatabaseError } from "./http";

type AssetDatabase = Omit<Database, "public"> & { public: Database["public"] & { Functions: Database["public"]["Functions"] & {
  mobile_download_asset_page: { Args: { p_team_id: string; p_manifest_id: string; p_after: string | null }; Returns: Json };
  mobile_download_asset_source: { Args: { p_team_id: string; p_manifest_id: string; p_asset_id: string }; Returns: Json };
} } };
// This type-only schema extension matches the additive migration; the user client and credentials remain unchanged.
type AssetContext = { client: SupabaseClient<Database>; identity: MobileIdentity };
const rawAssetSchema = mobileAssetSchema.extend({ imageUrl: z.string().max(2048).optional() });
const rawPageSchema = z.object({ manifestId: z.uuid(), assets: z.array(rawAssetSchema).max(100), nextId: mobileAssetIdSchema.nullable(), incomplete: z.boolean() }).strict();
const unavailable = () => new MobileApiError(503, "unavailable", "Download assets are unavailable. Retry later.");
function databaseFailure(code: string | undefined): never {
  const failure = mobileDatabaseError(code);
  throw new MobileApiError(code === "42501" ? 403 : code === "22023" || code === "40001" || code === "40P01" ? 409 : 503, failure.code, failure.message);
}
function publicAsset(raw: z.infer<typeof rawAssetSchema>): MobileAsset {
  const { imageUrl, ...asset } = raw;
  if (imageUrl !== undefined && asset.source.kind === "storage") {
    let recognized = false;
    try {
      const source = new URL(imageUrl);
      const configured = new URL(getSupabaseEnv().url);
      recognized = source.protocol === "https:" && source.origin === configured.origin && !source.username && !source.password && !source.search && !source.hash
        && source.pathname === `/storage/v1/object/public/${asset.source.bucket}/${asset.source.objectPath}`;
    } catch { /* Invalid image URLs remain explicit incomplete metadata. */ }
    if (!recognized) return { ...asset, source: { kind: "unavailable", reason: "external-source", url: imageUrl } };
  }
  return asset;
}
export async function readMobileAssets({ client, identity, input }: AssetContext & { input: MobileAssetPageRequest }) {
  const result = await (client as SupabaseClient<AssetDatabase>).rpc("mobile_download_asset_page", { p_team_id: identity.teamId, p_manifest_id: input.manifestId, p_after: input.after ?? null });
  if (result.error) databaseFailure(result.error.code);
  const parsed = rawPageSchema.safeParse(result.data);
  if (!parsed.success || parsed.data.manifestId !== input.manifestId) throw unavailable();
  const assets = parsed.data.assets.map(publicAsset);
  if (assets.some(asset => asset.source.kind === "storage" && !asset.source.objectPath.startsWith(`${identity.teamId}/`))) throw unavailable();
  return mobileAssetPageSchema.parse({ ...parsed.data, assets, version: 1, identity,
    incomplete: parsed.data.incomplete || assets.some(asset => asset.source.kind === "unavailable") });
}
export async function signMobileAsset({ client, identity, input }: AssetContext & { input: MobileAssetUrlRequest }) {
  const args = { p_team_id: identity.teamId, p_manifest_id: input.manifestId, p_asset_id: input.assetId };
  const result = await (client as SupabaseClient<AssetDatabase>).rpc("mobile_download_asset_source", args);
  if (result.error) databaseFailure(result.error.code);
  const parsed = rawAssetSchema.safeParse(result.data);
  if (!parsed.success || parsed.data.assetId !== input.assetId) throw unavailable();
  const asset = publicAsset(parsed.data);
  if (asset.source.kind !== "storage" || !asset.source.objectPath.startsWith(`${identity.teamId}/`)) {
    throw new MobileApiError(403, "permission", "This asset cannot be downloaded.");
  }
  // Current website practice/presentation uploads are capped at 15 MiB. Hashing
  // reads each file once on the server; no persistent hash cache is introduced.
  const maximumBytes = 15 * 1024 * 1024;
  if (asset.sizeBytes !== null && asset.sizeBytes > maximumBytes) throw unavailable();
  const download = await client.storage.from(asset.source.bucket).download(asset.source.objectPath, { cacheNonce: asset.version }, {
    // RequestInit.headers would replace Storage's authenticated headers.
    cache: "no-store", signal: AbortSignal.timeout(30_000),
  });
  if (download.error || !download.data) throw unavailable();
  if (download.data.size > maximumBytes || (asset.sizeBytes !== null && download.data.size !== asset.sizeBytes)) {
    throw new MobileApiError(409, "retry", "The file size changed. Restart this download.");
  }
  const bytes = await download.data.arrayBuffer();
  if (bytes.byteLength !== download.data.size || bytes.byteLength > maximumBytes) throw unavailable();
  const sha256 = createHash("sha256").update(Buffer.from(bytes)).digest("hex");
  const hashed = await (client as SupabaseClient<AssetDatabase>).rpc("mobile_download_asset_source", args);
  if (hashed.error) databaseFailure(hashed.error.code);
  const hashedSource = rawAssetSchema.safeParse(hashed.data);
  if (!hashedSource.success || JSON.stringify(hashedSource.data) !== JSON.stringify(parsed.data)) {
    throw new MobileApiError(409, "retry", "The file changed. Restart this download.");
  }
  // The same authenticated client signs through Storage RLS. No service credentials.
  const expiresIn = 60;
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  const signed = await client.storage.from(asset.source.bucket).createSignedUrl(asset.source.objectPath, expiresIn);
  if (signed.error || !signed.data?.signedUrl) throw unavailable();
  // Signing is a separate service call. Recheck revocation/replacement before returning.
  const checked = await (client as SupabaseClient<AssetDatabase>).rpc("mobile_download_asset_source", args);
  if (checked.error) databaseFailure(checked.error.code);
  const current = rawAssetSchema.safeParse(checked.data);
  if (!current.success || JSON.stringify(current.data) !== JSON.stringify(parsed.data)) throw unavailable();
  const response = mobileAssetUrlResponseSchema.safeParse({ version: 1, identity, manifestId: input.manifestId,
    assetId: asset.assetId, assetVersion: asset.version, sha256, url: signed.data.signedUrl, expiresAt });
  if (!response.success) throw unavailable();
  const signedUrl = new URL(response.data.url);
  if (signedUrl.origin !== new URL(getSupabaseEnv().url).origin || signedUrl.username || signedUrl.password || signedUrl.hash
    || decodeURIComponent(signedUrl.pathname) !== `/storage/v1/object/sign/${asset.source.bucket}/${asset.source.objectPath}`) throw unavailable();
  return response.data;
}
