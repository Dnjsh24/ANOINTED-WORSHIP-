// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { personPermissionOverrideIdentity as identity, personPermissionOverrideRequest as request, personPermissionOverrideReceipt as receipt } from '@/lib/mobile/v2/person-permission-override-test-fixture';
import { personPermissionOverrideId as id } from '@/lib/mobile/v2/person-permission-override-test-fixture';
const mocks = vi.hoisted(() => ({ selected: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/mobile/v2/read-workspaces', () => ({ readSelectedWorkspace: mocks.selected }));
import { applyMobilePersonPermissionOverride, readMobilePersonPermissionOverrideState } from './person-permission-override';
function setup(data: unknown = receipt, code?: string) {
  const rpc = vi.fn(() => { const result = { data, error: code ? { code } : null }; return { abortSignal: () => Promise.resolve(result), then: <T>(resolve: (value: typeof result) => T) => Promise.resolve(result).then(resolve) }; });
  return { rpc, client: { rpc } as unknown as SupabaseClient<Database> };
}
beforeEach(() => { mocks.selected.mockReset(); mocks.selected.mockResolvedValue(identity); });
it('submits exact atomic own request and confirms immutable applied or blocked receipt after current authority checks', async () => {
  const { client, rpc } = setup(); expect(await applyMobilePersonPermissionOverride({ client, identity, request })).toEqual(receipt);
  expect(rpc).toHaveBeenCalledWith('mobile_apply_person_permission_override', { p_team_id: identity.teamId, p_member_id: identity.memberId, p_request: request }); expect(mocks.selected).toHaveBeenCalledTimes(2);
  const blocked = { ...receipt, status: 'conflict', current: { ...request.base, member: { ...request.base.member, status: 'inactive' } } };
  expect(await applyMobilePersonPermissionOverride({ ...setup(blocked), identity, request })).toEqual(blocked);
});
it('rejects other-user/team/member requests before RPC regardless of manager permissions', async () => {
  for (const change of [{ userId: id(90) }, { teamId: id(90) }, { memberId: id(90) }]) {
    const { client, rpc } = setup(); await expect(applyMobilePersonPermissionOverride({ client, identity, request: { ...request, ...change, base: { ...request.base, member: { ...request.base.member, teamId: change.teamId ?? request.teamId } } } })).rejects.toMatchObject({ status: 403 }); expect(rpc).not.toHaveBeenCalled();
  }
});
it('rejects stale selected authority before or after RPC instead of confirming an uncertain save', async () => {
  const { client, rpc } = setup(); mocks.selected.mockResolvedValueOnce({ ...identity, memberId: id(90) });
  await expect(applyMobilePersonPermissionOverride({ client, identity, request })).rejects.toMatchObject({ status: 409 }); expect(rpc).not.toHaveBeenCalled();
  mocks.selected.mockResolvedValueOnce(identity).mockResolvedValueOnce({ ...identity, role: 'admin' });
  await expect(applyMobilePersonPermissionOverride({ client, identity, request })).rejects.toMatchObject({ status: 409 });
});
it('keeps mismatched or malformed SQL results unconfirmed', async () => {
  for (const result of [null, { ...receipt, current: request }, { ...receipt, request: { ...request, requestNonce: id(90) } }, { ...receipt, secret: 'private' }]) await expect(applyMobilePersonPermissionOverride({ ...setup(result), identity, request })).rejects.toMatchObject({ status: 503 });
});
it('reports authorization, validation, transaction retry and unavailable errors without fabricated acceptance', async () => {
  for (const [code, status] of [['42501', 403], ['22023', 400], ['22008', 400], ['40001', 409], ['40P01', 409], ['XX000', 503]] as const) await expect(applyMobilePersonPermissionOverride({ ...setup(null, code), identity, request })).rejects.toMatchObject({ status });
});
it('honors cancellation before any write and after a lost-reply boundary', async () => {
  const controller = new AbortController(); controller.abort(); const { client, rpc } = setup();
  await expect(applyMobilePersonPermissionOverride({ client, identity, request, signal: controller.signal })).rejects.toThrow(); expect(rpc).not.toHaveBeenCalled();
  const lostReply = new AbortController();
  const savedRpc = vi.fn(() => ({ abortSignal: () => { lostReply.abort(); return Promise.resolve({ data: receipt, error: null }); } }));
  await expect(applyMobilePersonPermissionOverride({ client: { rpc: savedRpc } as unknown as SupabaseClient<Database>, identity, request, signal: lostReply.signal })).rejects.toThrow();
  expect(savedRpc).toHaveBeenCalledOnce();
});

it('reads only the selected role slot and rechecks current owner authority after SQL', async () => {
  const input = { targetMemberId: request.base.member.id, permission: request.permission };
  const data = { version: 2, ...input, current: request.base, fetchedAt: receipt.recordedAt };
  const { client, rpc } = setup(data); expect(await readMobilePersonPermissionOverrideState({ client, identity, input })).toEqual({ ...data, identity });
  expect(rpc).toHaveBeenCalledWith('mobile_read_person_permission_override_state', { p_team_id: identity.teamId, p_member_id: identity.memberId, p_target_member_id: input.targetMemberId, p_permission: input.permission });
  await expect(readMobilePersonPermissionOverrideState({ ...setup({ ...data, targetMemberId: 'member' }), identity, input })).rejects.toMatchObject({ status: 503 });
  await expect(readMobilePersonPermissionOverrideState({ ...setup({ ...data, secret: true }), identity, input })).rejects.toMatchObject({ status: 503 });
});
