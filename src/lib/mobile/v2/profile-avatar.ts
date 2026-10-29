import { z } from 'zod';
import { mobileIdentitySchema, type MobileIdentity } from '../contracts';
export const MOBILE_PROFILE_AVATAR_MAX_BYTES = 32768;
export const MOBILE_PROFILE_AVATAR_UPLOAD_MAX_BYTES = 7 * 1024 * 1024;
export const PROFILE_AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const mobileProfileAvatarBaseSchema = z.object({ avatarUrl: z.string().max(2048).nullable(), memberCreatedAt: z.iso.datetime({ offset: true }) }).strict();
export const mobileProfileAvatarRequestSchema = z.object({ version: z.literal(2), userId: z.uuid(), teamId: z.uuid(), memberId: z.uuid(), requestNonce: z.uuid(), base: mobileProfileAvatarBaseSchema,
  value: z.object({ objectPath: z.string().max(160), sha256: z.string().regex(/^[a-f0-9]{64}$/), mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']), sizeBytes: z.number().int().min(1).max(PROFILE_AVATAR_MAX_BYTES) }).strict(),
}).strict().refine(value => value.value.objectPath === `${value.userId}/${value.requestNonce}.${({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const)[value.value.mimeType]}`, 'Use the original account and nonce for this photo path.');
export type MobileProfileAvatarRequest = z.infer<typeof mobileProfileAvatarRequestSchema>;
export const mobileProfileAvatarReceiptSchema = z.object({ version: z.literal(2), request: mobileProfileAvatarRequestSchema, status: z.enum(['applied', 'conflict']), current: z.object({ avatarUrl: z.string().max(2048).nullable() }).strict(), recordedAt: z.iso.datetime({ offset: true }) }).strict()
  .refine(value => value.status === 'applied' ? value.current.avatarUrl !== null : value.current.avatarUrl !== value.request.base.avatarUrl, 'Confirm the applied photo or changed avatar base.');
export type MobileProfileAvatarReceipt = z.infer<typeof mobileProfileAvatarReceiptSchema>;
export const mobileProfileAvatarStateSchema = z.object({ version: z.literal(2), identity: mobileIdentitySchema, current: mobileProfileAvatarBaseSchema, fetchedAt: z.iso.datetime({ offset: true }) }).strict();
export type MobileProfileAvatarState = z.infer<typeof mobileProfileAvatarStateSchema>;
export const mobileProfileAvatarUploadRequestSchema = z.object({ request: mobileProfileAvatarRequestSchema, base64: z.string().min(4).max(Math.ceil(PROFILE_AVATAR_MAX_BYTES / 3) * 4).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/) }).strict();
export const mobileProfileAvatarUploadResultSchema = z.object({ version: z.literal(2), request: mobileProfileAvatarRequestSchema, uploaded: z.literal(true) }).strict();
export type MobileProfileAvatarUploadResult = z.infer<typeof mobileProfileAvatarUploadResultSchema>;
export function safeProfileAvatarUrl(supabaseUrl: string, userId: string, value: string | null): string | null {
  if (!value) return null;
  try {
    const root = new URL(supabaseUrl); const url = new URL(value);
    if (url.origin !== root.origin || url.username || url.password || url.search || url.hash || !['https:', 'http:'].includes(url.protocol)) return null;
    return new RegExp(`^/storage/v1/object/public/profile-avatars/${z.uuid().parse(userId)}/[a-fA-F0-9-]{36}\\.(jpg|png|webp)$`).test(url.pathname) ? url.href : null;
  } catch { return null; }
}
export function assertProfileAvatarScope(identity: MobileIdentity, request: Pick<MobileProfileAvatarRequest, 'userId' | 'teamId' | 'memberId'>) {
  if (identity.userId !== request.userId || identity.teamId !== request.teamId || identity.memberId !== request.memberId) throw new Error('Reopen the original account and current photo membership.');
}
export function assertMobileProfileAvatarReceipt(identity: MobileIdentity, request: MobileProfileAvatarRequest, value: unknown, supabaseUrl: string): MobileProfileAvatarReceipt {
  request = mobileProfileAvatarRequestSchema.parse(request); assertProfileAvatarScope(identity, request); const result = mobileProfileAvatarReceiptSchema.parse(value);
  if (JSON.stringify(result.request) !== JSON.stringify(request)) throw new Error('Retry the exact original photo request.');
  const expected = `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/profile-avatars/${request.value.objectPath}`;
  if (result.status === 'applied' && (result.current.avatarUrl !== expected || !safeProfileAvatarUrl(supabaseUrl, identity.userId, result.current.avatarUrl))) throw new Error('The photo receipt has an unverified storage origin or path.');
  return result;
}
export function assertMobileProfileAvatarState(identity: MobileIdentity, value: unknown): MobileProfileAvatarState {
  const result = mobileProfileAvatarStateSchema.parse(value); assertProfileAvatarScope(identity, result.identity);
  if (identity.role !== result.identity.role || [...identity.permissions].sort().join(',') !== [...result.identity.permissions].sort().join(',')) throw new Error('Verify the current membership before changing a photo.');
  return result;
}
export function assertMobileProfileAvatarUploadResult(identity: MobileIdentity, request: MobileProfileAvatarRequest, value: unknown): MobileProfileAvatarUploadResult {
  assertProfileAvatarScope(identity, request); const result = mobileProfileAvatarUploadResultSchema.parse(value);
  if (JSON.stringify(result.request) !== JSON.stringify(mobileProfileAvatarRequestSchema.parse(request))) throw new Error('The upload reply belongs to another photo.');
  return result;
}
