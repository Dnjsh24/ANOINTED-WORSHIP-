// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { customRoleEditIdentity as identity, customRoleEditRequest as request, customRoleEditReceipt as receipt } from '@/lib/mobile/v2/custom-role-edit-test-fixture';
import { customRoleEditId as id } from '@/lib/mobile/v2/custom-role-edit-test-fixture';
const mocks = vi.hoisted(() => ({ selected: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/mobile/v2/read-workspaces', () => ({ readSelectedWorkspace: mocks.selected }));
import { applyMobileCustomRoleEdit } from './custom-role-edit';
function setup(data: unknown = receipt, code?: string) {
  const rpc = vi.fn(() => { const result = { data, error: code ? { code } : null }; return { abortSignal: () => Promise.resolve(result), then: <T>(resolve: (value: typeof result) => T) => Promise.resolve(result).then(resolve) }; });
  return { rpc, client: { rpc } as unknown as SupabaseClient<Database> };
}
beforeEach(() => { mocks.selected.mockReset(); mocks.selected.mockResolvedValue(identity); });
it('submits exact atomic own request and confirms immutable applied or blocked receipt after current authority checks', async () => {
  const { client, rpc } = setup(); expect(await applyMobileCustomRoleEdit({ client, identity, request })).toEqual(receipt);
  expect(rpc).toHaveBeenCalledWith('mobile_apply_custom_role_edit', { p_team_id: identity.teamId, p_member_id: identity.memberId, p_request: request }); expect(mocks.selected).toHaveBeenCalledTimes(2);
  const blocked = { ...receipt, status: 'blocked', current: request.base, reason: 'existing_role' };
  expect(await applyMobileCustomRoleEdit({ ...setup(blocked), identity, request })).toEqual(blocked);
});
it('rejects other-user/team/member requests before RPC regardless of manager permissions', async () => {
  for (const change of [{ userId: id(90) }, { teamId: id(90) }, { memberId: id(90) }]) {
    const { client, rpc } = setup(); await expect(applyMobileCustomRoleEdit({ client, identity, request: { ...request, ...change, base: { ...request.base, teamId: change.teamId ?? request.teamId } } })).rejects.toMatchObject({ status: 403 }); expect(rpc).not.toHaveBeenCalled();
  }
});
it('rejects stale selected authority before or after RPC instead of confirming an uncertain save', async () => {
  const { client, rpc } = setup(); mocks.selected.mockResolvedValueOnce({ ...identity, memberId: id(90) });
  await expect(applyMobileCustomRoleEdit({ client, identity, request })).rejects.toMatchObject({ status: 409 }); expect(rpc).not.toHaveBeenCalled();
  mocks.selected.mockResolvedValueOnce(identity).mockResolvedValueOnce({ ...identity, role: 'admin' });
  await expect(applyMobileCustomRoleEdit({ client, identity, request })).rejects.toMatchObject({ status: 409 });
});
it('keeps mismatched or malformed SQL results unconfirmed', async () => {
  for (const result of [null, { ...receipt, current: request }, { ...receipt, request: { ...request, requestNonce: id(90) } }, { ...receipt, secret: 'private' }]) await expect(applyMobileCustomRoleEdit({ ...setup(result), identity, request })).rejects.toMatchObject({ status: 503 });
});
it('reports authorization, validation, transaction retry and unavailable errors without fabricated acceptance', async () => {
  for (const [code, status] of [['42501', 403], ['22023', 400], ['22008', 400], ['40001', 409], ['40P01', 409], ['XX000', 503]] as const) await expect(applyMobileCustomRoleEdit({ ...setup(null, code), identity, request })).rejects.toMatchObject({ status });
});
it('honors cancellation before any write and after a lost-reply boundary', async () => {
  const controller = new AbortController(); controller.abort(); const { client, rpc } = setup();
  await expect(applyMobileCustomRoleEdit({ client, identity, request, signal: controller.signal })).rejects.toThrow(); expect(rpc).not.toHaveBeenCalled();
  const lostReply = new AbortController();
  const savedRpc = vi.fn(() => ({ abortSignal: () => { lostReply.abort(); return Promise.resolve({ data: receipt, error: null }); } }));
  await expect(applyMobileCustomRoleEdit({ client: { rpc: savedRpc } as unknown as SupabaseClient<Database>, identity, request, signal: lostReply.signal })).rejects.toThrow();
  expect(savedRpc).toHaveBeenCalledOnce();
});
