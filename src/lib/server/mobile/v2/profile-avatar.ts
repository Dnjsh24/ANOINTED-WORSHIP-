import 'server-only';
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/supabase/database.types';
import { type MobileIdentity } from '@/lib/mobile/contracts';
import { assertProfileAvatarScope, assertMobileProfileAvatarReceipt, assertMobileProfileAvatarState, mobileProfileAvatarRequestSchema,
  mobileProfileAvatarUploadRequestSchema, PROFILE_AVATAR_MAX_BYTES, type MobileProfileAvatarRequest } from '@/lib/mobile/v2/profile-avatar';
import { readSelectedWorkspace } from '@/lib/mobile/v2/read-workspaces';
import { getSupabaseEnv } from '@/lib/supabase/env';
import { MobileApiError } from '../context';
type AvatarDatabase = Omit<Database, 'public'> & { public: Database['public'] & { Functions: Database['public']['Functions'] & {
  mobile_read_profile_avatar_state: { Args: { p_team_id: string; p_member_id: string }; Returns: Json };
  mobile_apply_profile_avatar: { Args: { p_team_id: string; p_member_id: string; p_request: Json; p_avatar_url: string }; Returns: Json };
} } };
type Context = { client: SupabaseClient<Database>; identity: MobileIdentity; signal?: AbortSignal };
function failure(code: string) {
  if (code === '42501') return new MobileApiError(403, 'profile_avatar_access', 'Verify your own current membership before changing this photo.');
  if (['22023', '22P02', '22007', '22008', '23514'].includes(code)) return new MobileApiError(400, 'profile_avatar_validation', 'Review the original photo request and selected image.');
  if (['40001', '40P01', '23505'].includes(code)) return new MobileApiError(409, 'profile_avatar_retry', 'A profile change is in progress. Retry the original photo request.');
  return new MobileApiError(503, 'profile_avatar_unknown', 'Photo change is unconfirmed. Keep the original request and retry; no photo objects were deleted.');
}
async function verify(context: Context) {
  context.signal?.throwIfAborted(); const workspace = await readSelectedWorkspace({ client: context.client, userId: context.identity.userId, teamId: context.identity.teamId });
  try {
    assertProfileAvatarScope(context.identity, { userId: context.identity.userId, ...workspace });
    if (workspace.role !== context.identity.role || [...workspace.permissions].sort().join(',') !== [...context.identity.permissions].sort().join(',')) throw new Error('Current membership changed.');
  }
  catch { throw failure('42501'); }
  context.signal?.throwIfAborted();
}
export async function readMobileProfileAvatarState(context: Context) {
  await verify(context); const query = (context.client as SupabaseClient<AvatarDatabase>).rpc('mobile_read_profile_avatar_state', { p_team_id: context.identity.teamId, p_member_id: context.identity.memberId });
  const result = await (context.signal ? query.abortSignal(context.signal) : query); if (result.error) throw failure(result.error.code); await verify(context);
  try { return assertMobileProfileAvatarState(context.identity, { ...(result.data as object), identity: context.identity }); } catch { throw failure('unverified'); }
}
function bytesMatch(request: MobileProfileAvatarRequest, bytes: Uint8Array) {
  if (bytes.length !== request.value.sizeBytes || bytes.length > PROFILE_AVATAR_MAX_BYTES || createHash('sha256').update(bytes).digest('hex') !== request.value.sha256) throw failure('22023');
  const signature = Buffer.from(bytes);
  const valid = request.value.mimeType === 'image/png' ? signature.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : request.value.mimeType === 'image/jpeg' ? signature.length >= 3 && signature[0] === 255 && signature[1] === 216 && signature[2] === 255
      : signature.length >= 12 && signature.toString('ascii', 0, 4) === 'RIFF' && signature.toString('ascii', 8, 12) === 'WEBP';
  if (!valid) throw failure('22023');
}
function publicUrl(request: MobileProfileAvatarRequest) { return `${getSupabaseEnv().url.replace(/\/$/, '')}/storage/v1/object/public/profile-avatars/${request.value.objectPath}`; }
async function verifyObject(request: MobileProfileAvatarRequest, signal?: AbortSignal) {
  // The URL is constructed from trusted deployment configuration and a strictly
  // validated own-user path. Redirects and arbitrary request URLs are forbidden.
  const timeout = AbortSignal.timeout(20_000);
  const response = await fetch(publicUrl(request), { redirect: 'error', cache: 'no-store', signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (!response.ok || !response.body || Number(response.headers.get('content-length') ?? 0) > PROFILE_AVATAR_MAX_BYTES || response.headers.get('content-type')?.split(';')[0] !== request.value.mimeType) throw failure('unverified');
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const result = await reader.read(); if (result.done) break; size += result.value.length; if (size > PROFILE_AVATAR_MAX_BYTES) throw failure('unverified'); chunks.push(result.value); } }
  finally { await reader.cancel().catch(() => undefined); }
  const bytes = Buffer.concat(chunks); bytesMatch(request, bytes);
}
function timestamp(value: string) { const fraction = value.match(/\.(\d+)/)?.[1] ?? ''; return BigInt(Date.parse(value)) * BigInt(1000) + BigInt(fraction.padEnd(6, '0').slice(3, 6)); }
export async function uploadMobileProfileAvatar(context: Context & { input: unknown }) {
  const input = mobileProfileAvatarUploadRequestSchema.parse(context.input); const request = input.request;
  try { assertProfileAvatarScope(context.identity, request); } catch { throw failure('42501'); }
  const bytes = Buffer.from(input.base64, 'base64'); if (bytes.toString('base64') !== input.base64) throw failure('22023'); bytesMatch(request, bytes);
  const state = await readMobileProfileAvatarState(context);
  if (timestamp(state.current.memberCreatedAt) !== timestamp(request.base.memberCreatedAt)) throw failure('42501');
  const result = await context.client.storage.from('profile-avatars').upload(request.value.objectPath, bytes, { contentType: request.value.mimeType, upsert: false, cacheControl: '3600' });
  context.signal?.throwIfAborted();
  // A lost upload reply or duplicate path never causes overwrite or deletion.
  // Prove the original object bytes even when Storage returned an error.
  try { await verifyObject(request, context.signal); } catch (error) { if (result.error) throw failure('unverified'); throw error; }
  await verify(context); return { version: 2 as const, request, uploaded: true as const };
}
export async function applyMobileProfileAvatar(context: Context & { request: MobileProfileAvatarRequest }) {
  const request = mobileProfileAvatarRequestSchema.parse(context.request);
  try { assertProfileAvatarScope(context.identity, request); } catch { throw failure('42501'); }
  await verify(context); await verifyObject(request, context.signal);
  const query = (context.client as SupabaseClient<AvatarDatabase>).rpc('mobile_apply_profile_avatar', { p_team_id: context.identity.teamId, p_member_id: context.identity.memberId, p_request: request as unknown as Json, p_avatar_url: publicUrl(request) });
  const result = await (context.signal ? query.abortSignal(context.signal) : query); context.signal?.throwIfAborted();
  if (result.error) throw failure(result.error.code); await verify(context);
  try { return assertMobileProfileAvatarReceipt(context.identity, request, result.data, getSupabaseEnv().url); } catch { throw failure('unverified'); }
}
