// @vitest-environment node
import { createHash } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { profileAvatarIdentity as identity, profileAvatarRequest as fixture, profileAvatarReceipt as fixtureReceipt, profileAvatarOrigin as origin } from '@/lib/mobile/v2/profile-avatar-test-fixture';
const mocks = vi.hoisted(() => ({ selected: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/mobile/v2/read-workspaces', () => ({ readSelectedWorkspace: mocks.selected }));
vi.mock('@/lib/supabase/env', () => ({ getSupabaseEnv: () => ({ url: 'https://avatar-project.supabase.co', publishableKey: 'public' }) }));
import { applyMobileProfileAvatar, uploadMobileProfileAvatar } from './profile-avatar';
const bytes = Buffer.from([137,80,78,71,13,10,26,10]);
const request = { ...fixture, value: { ...fixture.value, sha256: createHash('sha256').update(bytes).digest('hex') } };
const receipt = { ...fixtureReceipt, request };
function setup(error?: string) {
  const upload = vi.fn(async () => ({ data: null, error: { message: 'object already exists' } }));
  const rpc = vi.fn(async (name: string) => ({ data: name === 'mobile_apply_profile_avatar' ? receipt : { version: 2, current: request.base, fetchedAt: receipt.recordedAt }, error: error ? { code: error } : null }));
  return { upload, rpc, client: { rpc, storage: { from: () => ({ upload }) } } as unknown as SupabaseClient<Database> };
}
beforeEach(() => { mocks.selected.mockReset(); mocks.selected.mockResolvedValue(identity); vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes, { headers: { 'content-type': 'image/png' } }))); });
it('reconciles duplicate/lost upload replies by exact object bytes without overwrite or cleanup', async () => {
  const { client, upload } = setup();
  expect(await uploadMobileProfileAvatar({ client, identity, input: { request, base64: bytes.toString('base64') } })).toEqual({ version: 2, request, uploaded: true });
  expect(upload).toHaveBeenCalledWith(request.value.objectPath, bytes, expect.objectContaining({ upsert: false }));
  expect(fetch).toHaveBeenCalledWith(`${origin}/storage/v1/object/public/profile-avatars/${request.value.objectPath}`, expect.objectContaining({ redirect: 'error' }));
  await expect(uploadMobileProfileAvatar({ client, identity, input: { request, base64: Buffer.from('notimage').toString('base64') } })).rejects.toMatchObject({ status: 400 });
  expect(upload).toHaveBeenCalledOnce();
});
it('verifies bytes before CAS and retains unknown outcomes, current actor and exact immutable receipt', async () => {
  const { client, rpc } = setup(); expect(await applyMobileProfileAvatar({ client, identity, request })).toEqual(receipt);
  expect(rpc).toHaveBeenCalledWith('mobile_apply_profile_avatar', expect.objectContaining({ p_request: request, p_avatar_url: receipt.current.avatarUrl }));
  await expect(applyMobileProfileAvatar({ ...setup('42501'), identity, request })).rejects.toMatchObject({ status: 403 });
  mocks.selected.mockResolvedValue({ ...identity, role: 'admin' });
  await expect(applyMobileProfileAvatar({ client, identity, request })).rejects.toMatchObject({ status: 403 });
  mocks.selected.mockResolvedValue(identity); vi.stubGlobal('fetch', vi.fn(async () => new Response(Buffer.from('wrong'), { headers: { 'content-type': 'image/png' } })));
  await expect(applyMobileProfileAvatar({ client, identity, request })).rejects.toMatchObject({ status: 400 });
});
