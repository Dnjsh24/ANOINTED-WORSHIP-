import { z } from "zod";
import { mobileIdentitySchema } from "./contracts";

export const mobileAssetIdSchema = z.string().min(1).max(160).regex(/^[A-Za-z0-9_-]+$/);
const httpsUrl = z.url().max(4096).refine(value => new URL(value).protocol === "https:", "HTTPS is required.");
const objectPath = z.string().min(1).max(2048).refine(value => !value.startsWith("/") && !value.split("/").some(part => !part || part === "." || part === "..") && !/[\\\u0000-\u001f\u007f%]/.test(value), "Invalid storage path.");
export const mobileAssetSchema = z.object({
  assetId: mobileAssetIdSchema, purpose: z.enum(["cover", "attachment"]),
  version: z.string().regex(/^[a-f0-9]{64}$/),
  entityType: z.enum(["song", "event"]), entityId: z.uuid(),
  fileName: z.string().min(1).max(500), mimeType: z.string().min(1).max(160),
  sizeBytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
  kind: z.enum(["image", "document", "audio", "video"]),
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("storage"), bucket: z.enum(["practice-files", "presentation-media"]), objectPath }).strict(),
    z.object({ kind: z.literal("unavailable"), reason: z.enum(["external-source", "missing-object", "unsupported-type"]), url: z.string().max(2048).optional() }).strict(),
  ]),
}).strict();
export type MobileAsset = z.infer<typeof mobileAssetSchema>;
export const mobileAssetPageRequestSchema = z.object({ version: z.literal(1), manifestId: z.uuid(), after: mobileAssetIdSchema.optional() }).strict();
export type MobileAssetPageRequest = z.infer<typeof mobileAssetPageRequestSchema>;
export const mobileAssetUrlRequestSchema = z.object({ version: z.literal(1), manifestId: z.uuid(), assetId: mobileAssetIdSchema }).strict();
export type MobileAssetUrlRequest = z.infer<typeof mobileAssetUrlRequestSchema>;
export const mobileAssetPageSchema = z.object({
  version: z.literal(1), identity: mobileIdentitySchema, manifestId: z.uuid(),
  assets: z.array(mobileAssetSchema).max(100), nextId: mobileAssetIdSchema.nullable(), incomplete: z.boolean(),
}).strict();
export type MobileAssetPage = z.infer<typeof mobileAssetPageSchema>;
export const mobileAssetUrlResponseSchema = z.object({
  version: z.literal(1), identity: mobileIdentitySchema, manifestId: z.uuid(), assetId: mobileAssetIdSchema,
  assetVersion: z.string().regex(/^[a-f0-9]{64}$/), sha256: z.string().regex(/^[a-f0-9]{64}$/), url: httpsUrl, expiresAt: z.iso.datetime(),
}).strict();
export type MobileAssetUrlResponse = z.infer<typeof mobileAssetUrlResponseSchema>;
