import { describe, expect, it } from "vitest";
import { mobileAssetSchema, mobileAssetPageRequestSchema, mobileAssetUrlRequestSchema, mobileAssetUrlResponseSchema } from "./asset-contracts";
const id = "10000000-0000-4000-8000-000000000001";
const asset = { assetId: "file_test", purpose: "attachment", version: "a".repeat(64), entityType: "song", entityId: id, fileName: "Chart.pdf", mimeType: "application/pdf", sizeBytes: 40, kind: "document", source: { kind: "storage", bucket: "practice-files", objectPath: `${id}/chart.pdf` } };
describe("mobile asset contracts", () => {
  it("accepts durable metadata and explicit incomplete external images", () => {
    expect(mobileAssetSchema.safeParse(asset).success).toBe(true);
    expect(mobileAssetSchema.safeParse({ ...asset, kind: "image", source: { kind: "unavailable", reason: "external-source", url: "https://example.test/image.jpg" } }).success).toBe(true);
  });
  it.each(["../chart.pdf", "/root/chart.pdf", `${id}/../chart.pdf`, `${id}//chart.pdf`, `${id}/%2e%2e/chart.pdf`, `${id}/chart\\evil.pdf`])("rejects unsafe storage path %s", objectPath => {
    expect(mobileAssetSchema.safeParse({ ...asset, source: { ...asset.source, objectPath } }).success).toBe(false);
  });
  it("rejects unbounded IDs, invalid digests, sizes, and caller source paths", () => {
    expect(mobileAssetSchema.safeParse({ ...asset, version: "old" }).success).toBe(false);
    expect(mobileAssetSchema.safeParse({ ...asset, sizeBytes: Number.MAX_SAFE_INTEGER + 1 }).success).toBe(false);
    expect(mobileAssetUrlRequestSchema.safeParse({ version: 1, manifestId: id, assetId: "../test" }).success).toBe(false);
    expect(mobileAssetUrlRequestSchema.safeParse({ version: 1, manifestId: id, assetId: "file_test", objectPath: "evil" }).success).toBe(false);
    expect(mobileAssetPageRequestSchema.safeParse({ version: 1, manifestId: id, after: "x".repeat(161) }).success).toBe(false);
  });
  it("rejects plaintext signed URLs", () => {
    const identity = { userId: id, teamId: id, memberId: id, teamName: "Team", role: "member", permissions: [] };
    expect(mobileAssetUrlResponseSchema.safeParse({ version: 1, identity, manifestId: id, assetId: "file_test", assetVersion: asset.version, url: "http://example.test/file", expiresAt: new Date().toISOString() }).success).toBe(false);
  });
});
