// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { memberRoleAssignmentIdentity as identity, memberRoleAssignmentRequest as request, memberRoleAssignmentReceipt as receipt } from '@/lib/mobile/v2/member-role-assignment-test-fixture';
import { memberRoleAssignmentId as id } from '@/lib/mobile/v2/member-role-assignment-test-fixture';
const mocks = vi.hoisted(() => ({ selected: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/mobile/v2/read-workspaces', () => ({ readSelectedWorkspace: mocks.selected }));
import { applyMobileMemberRoleAssignment, readMobileMemberRoleState } from './member-role-assignment';
function setup(data: unknown = receipt, code?: string) {
  const rpc = vi.fn(() => { const result = { data, error: code ? { code } : null }; return { abortSignal: () => Promise.resolve(result), then: <T>(resolve: (value: typeof result) => T) => Promise.resolve(result).then(resolve) }; });
  return { rpc, client: { rpc } as unknown as SupabaseClient<Database> };
}
beforeEach(() => { mocks.selected.mockReset(); mocks.selected.mockResolvedValue(identity); });
it('submits exact atomic own request and confirms immutable applied or blocked receipt after current authority checks', async () => {
  const { client, rpc } = setup(); expect(await applyMobileMemberRoleAssignment({ client, identity, request })).toEqual(receipt);
  expect(rpc).toHaveBeenCalledWith('mobile_apply_member_role_assignment', { p_team_id: identity.teamId, p_member_id: identity.memberId, p_request: request }); expect(mocks.selected).toHaveBeenCalledTimes(2);
  const blockedRequest = { ...request, value: { role: 'member' as const, customRole: { id: id(9), teamId: identity.teamId, name: '', permissions: [], createdAt: null } } };
  const blocked = { ...receipt, request: blockedRequest, status: 'blocked', current: request.base, reason: 'custom_role_missing' };
  expect(await applyMobileMemberRoleAssignment({ ...setup(blocked), identity, request: blockedRequest })).toEqual(blocked);
});
it('rejects other-user/team/member requests before RPC regardless of manager permissions', async () => {
  for (const change of [{ userId: id(90) }, { teamId: id(90) }, { memberId: id(90) }]) {
    const { client, rpc } = setup(); await expect(applyMobileMemberRoleAssignment({ client, identity, request: { ...request, ...change, base: { ...request.base, teamId: change.teamId ?? request.teamId } } })).rejects.toMatchObject({ status: 403 }); expect(rpc).not.toHaveBeenCalled();
  }
});
it('rejects stale selected authority before or after RPC instead of confirming an uncertain save', async () => {
  const { client, rpc } = setup(); mocks.selected.mockResolvedValueOnce({ ...identity, memberId: id(90) });
  await expect(applyMobileMemberRoleAssignment({ client, identity, request })).rejects.toMatchObject({ status: 409 }); expect(rpc).not.toHaveBeenCalled();
  mocks.selected.mockResolvedValueOnce(identity).mockResolvedValueOnce({ ...identity, role: 'admin' });
  await expect(applyMobileMemberRoleAssignment({ client, identity, request })).rejects.toMatchObject({ status: 409 });
});
it('keeps mismatched or malformed SQL results unconfirmed', async () => {
  for (const result of [null, { ...receipt, current: request }, { ...receipt, request: { ...request, requestNonce: id(90) } }, { ...receipt, secret: 'private' }]) await expect(applyMobileMemberRoleAssignment({ ...setup(result), identity, request })).rejects.toMatchObject({ status: 503 });
});
it('reports authorization, validation, transaction retry and unavailable errors without fabricated acceptance', async () => {
  for (const [code, status] of [['42501', 403], ['22023', 400], ['22008', 400], ['40001', 409], ['40P01', 409], ['XX000', 503]] as const) await expect(applyMobileMemberRoleAssignment({ ...setup(null, code), identity, request })).rejects.toMatchObject({ status });
});
it('honors cancellation before any write and after a lost-reply boundary', async () => {
  const controller = new AbortController(); controller.abort(); const { client, rpc } = setup();
  await expect(applyMobileMemberRoleAssignment({ client, identity, request, signal: controller.signal })).rejects.toThrow(); expect(rpc).not.toHaveBeenCalled();
  const lostReply = new AbortController();
  const savedRpc = vi.fn(() => ({ abortSignal: () => { lostReply.abort(); return Promise.resolve({ data: receipt, error: null }); } }));
  await expect(applyMobileMemberRoleAssignment({ client: { rpc: savedRpc } as unknown as SupabaseClient<Database>, identity, request, signal: lostReply.signal })).rejects.toThrow();
  expect(savedRpc).toHaveBeenCalledOnce();
});

it('reads bounded actual target state including owner/self and verifies authority before and after RPC', async () => {
  const data = { version: 2, targetMemberId: identity.memberId, current: { ...request.base, id: identity.memberId, profileId: identity.userId, role: 'owner' }, fetchedAt: receipt.recordedAt };
  const { client, rpc } = setup(data); expect(await readMobileMemberRoleState({ client, identity, targetMemberId: identity.memberId })).toEqual({ ...data, identity });
  expect(rpc).toHaveBeenCalledWith('mobile_read_member_role_state', { p_team_id: identity.teamId, p_member_id: identity.memberId, p_target_member_id: identity.memberId }); expect(mocks.selected).toHaveBeenCalledTimes(2);
  await expect(readMobileMemberRoleState({ ...setup({ ...data, targetMemberId: id(90) }), identity, targetMemberId: identity.memberId })).rejects.toMatchObject({ status: 503 });
  await expect(readMobileMemberRoleState({ ...setup({ ...data, secret: true }), identity, targetMemberId: identity.memberId })).rejects.toMatchObject({ status: 503 });
});
it('rejects delegated managers, self and owner mutations before RPC while allowing admin assignment', async () => {
  for (const change of [{ role: 'member' }, { permissions: [] }]) {
    const { client, rpc } = setup(); await expect(applyMobileMemberRoleAssignment({ client, identity: { ...identity, ...change }, request })).rejects.toMatchObject({ status: 403 }); expect(rpc).not.toHaveBeenCalled();
  }
  for (const base of [{ ...request.base, id: identity.memberId }, { ...request.base, profileId: identity.userId }, { ...request.base, role: 'owner' as const }]) {
    const { client, rpc } = setup(); await expect(applyMobileMemberRoleAssignment({ client, identity, request: { ...request, base } })).rejects.toMatchObject({ status: 403 }); expect(rpc).not.toHaveBeenCalled();
  }
  mocks.selected.mockResolvedValue({ ...identity, role: 'admin' });
  expect(await applyMobileMemberRoleAssignment({ ...setup(), identity: { ...identity, role: 'admin' }, request })).toEqual(receipt);
});
