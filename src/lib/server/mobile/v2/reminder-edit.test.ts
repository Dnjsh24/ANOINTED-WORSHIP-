// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { reminderEditIdentity as identity, reminderEditRequest as request, reminderEditReceipt as receipt, reminderManagementPage as page } from '@/lib/mobile/v2/reminder-edit-test-fixture';
import { reminderEditId as id } from '@/lib/mobile/v2/reminder-edit-test-fixture';
const mocks = vi.hoisted(() => ({ selected: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/mobile/v2/read-workspaces', () => ({ readSelectedWorkspace: mocks.selected }));
import { applyMobileReminderEdit, readMobileReminderManagement } from './reminder-edit';
function setup(data: unknown = receipt, code?: string) {
  const rpc = vi.fn(() => { const result = { data, error: code ? { code } : null }; return { abortSignal: () => Promise.resolve(result), then: <T>(resolve: (value: typeof result) => T) => Promise.resolve(result).then(resolve) }; });
  return { rpc, client: { rpc } as unknown as SupabaseClient<Database> };
}
beforeEach(() => { mocks.selected.mockReset(); mocks.selected.mockResolvedValue(identity); });
it('submits exact atomic own request and confirms immutable applied or conflict receipt after current authority checks', async () => {
  const { client, rpc } = setup(); expect(await applyMobileReminderEdit({ client, identity, request })).toEqual(receipt);
  expect(rpc).toHaveBeenCalledWith('mobile_apply_reminder_edit', { p_team_id: identity.teamId, p_member_id: identity.memberId, p_request: request }); expect(mocks.selected).toHaveBeenCalledTimes(2);
  const conflict = { ...receipt, status: 'conflict', current: { ...request.base, title: 'Website update', fingerprint: 'c'.repeat(64) }, affectedCount: 0 };
  expect(await applyMobileReminderEdit({ ...setup(conflict), identity, request })).toEqual(conflict);
});
it('reads future/outside-own management through scopedRPC and verifies a complete validated page pre/post', async () => {
  const raw = { items: page.items, asOf: page.asOf, fetchedAt: page.fetchedAt, nextCursor: page.nextCursor }; const { client, rpc } = setup(raw);
  expect(await readMobileReminderManagement({ client, identity, input: {} })).toEqual(page);
  expect(rpc).toHaveBeenCalledWith('mobile_read_reminder_management', { p_team_id: identity.teamId, p_member_id: identity.memberId, p_input: {} });
  for (const data of [null, { ...raw, items: [page.items[0], page.items[0]] }, { ...raw, canManage: true }]) await expect(readMobileReminderManagement({ ...setup(data), identity, input: {} })).rejects.toMatchObject({ status: 503 });
});
it('rejects other-user/team/member requests before RPC regardless of manager permissions', async () => {
  for (const change of [{ userId: id(90) }, { teamId: id(90) }, { memberId: id(90) }]) {
    const { client, rpc } = setup(); await expect(applyMobileReminderEdit({ client, identity, request: { ...request, ...change } })).rejects.toMatchObject({ status: 403 }); expect(rpc).not.toHaveBeenCalled();
  }
});
it('rejects stale selected authority before or after RPC instead of confirming an uncertain save', async () => {
  const { client, rpc } = setup(); mocks.selected.mockResolvedValueOnce({ ...identity, memberId: id(90) });
  await expect(applyMobileReminderEdit({ client, identity, request })).rejects.toMatchObject({ status: 409 }); expect(rpc).not.toHaveBeenCalled();
  mocks.selected.mockResolvedValueOnce(identity).mockResolvedValueOnce({ ...identity, role: 'owner' });
  await expect(applyMobileReminderEdit({ client, identity, request })).rejects.toMatchObject({ status: 409 });
});
it('keeps mismatched or malformed SQL results unconfirmed', async () => {
  for (const result of [null, { ...receipt, current: request.base }, { ...receipt, request: { ...request, requestNonce: id(90) } }, { ...receipt, secret: 'private' }]) await expect(applyMobileReminderEdit({ ...setup(result), identity, request })).rejects.toMatchObject({ status: 503 });
});
it('reports authorization, validation, transaction retry and unavailable errors without fabricated acceptance', async () => {
  for (const [code, status] of [['42501', 403], ['22023', 400], ['22008', 400], ['40001', 409], ['40P01', 409], ['XX000', 503]] as const) await expect(applyMobileReminderEdit({ ...setup(null, code), identity, request })).rejects.toMatchObject({ status });
});
it('honors cancellation before any write and after a lost-reply boundary', async () => {
  const controller = new AbortController(); controller.abort(); const { client, rpc } = setup();
  await expect(applyMobileReminderEdit({ client, identity, request, signal: controller.signal })).rejects.toThrow(); expect(rpc).not.toHaveBeenCalled();
  const lostReply = new AbortController();
  const savedRpc = vi.fn(() => ({ abortSignal: () => { lostReply.abort(); return Promise.resolve({ data: receipt, error: null }); } }));
  await expect(applyMobileReminderEdit({ client: { rpc: savedRpc } as unknown as SupabaseClient<Database>, identity, request, signal: lostReply.signal })).rejects.toThrow();
  expect(savedRpc).toHaveBeenCalledOnce();
});


