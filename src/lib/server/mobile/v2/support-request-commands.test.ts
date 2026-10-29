// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import type { MobileSupportRequestCommand } from '@/lib/mobile/v2/support-request-commands';
const mocks = vi.hoisted(() => ({ selected: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/mobile/v2/read-workspaces', () => ({ readSelectedWorkspace: mocks.selected }));
import { applyMobileSupportRequestCommand } from './support-request-commands';
const id = (n: number) => `99890000-0000-4000-8000-${String(n).padStart(12, '0')}`; const userId = id(1); const timestamp = '2026-10-23T04:00:00Z';
const create: MobileSupportRequestCommand = { version: 2, kind: 'create', userId, requestId: id(2), teamId: id(3), question: 'Help', details: 'Details', pagePath: '/help' };
const parent = { id: create.requestId, profile_id: userId, team_id: id(3), question: 'Help', details: 'Details', page_path: '/help', status: 'closed', created_at: timestamp, updated_at: timestamp, requester_read_at: timestamp, support_updated_at: null };
function setup(parents: unknown[], messages: unknown[] = [], rpcError = false) {
  const response = (data: unknown, error: unknown = null) => Object.assign(Promise.resolve({ data, error }), { abortSignal: () => Promise.resolve({ data, error }) });
  const chains: { eq: ReturnType<typeof vi.fn> }[] = [];
  const from = vi.fn((table: string) => { const eq = vi.fn(); const chain = { select: vi.fn(), eq, abortSignal: vi.fn(), maybeSingle: vi.fn(() => response((table === 'wooly_support_requests' ? parents : messages).shift() ?? null)) }; chain.select.mockReturnValue(chain); eq.mockReturnValue(chain); chain.abortSignal.mockReturnValue(chain); chains.push(chain); return chain; });
  const rpc = vi.fn(() => response(null, rpcError ? { code: 'P0001', message: 'private database detail' } : null));
  return { client: { from, rpc } as unknown as SupabaseClient<Database>, rpc, from, chains };
}
beforeEach(() => { mocks.selected.mockReset(); mocks.selected.mockResolvedValue({ teamId: id(3) }); });
it('recovers exact own creation after team departure before any new membership gate and rejects immutable mismatch', async () => {
  const db = setup([parent]); expect(await applyMobileSupportRequestCommand({ ...db, userId, intent: create, selectedTeamId: null })).toMatchObject({ status: 'confirmed', record: { id: create.requestId, createdAt: timestamp } });
  expect(db.rpc).not.toHaveBeenCalled(); expect(mocks.selected).not.toHaveBeenCalled();
  await expect(applyMobileSupportRequestCommand({ ...setup([{ ...parent, team_id: null }]), userId, intent: create, selectedTeamId: null })).rejects.toMatchObject({ status: 409 });
  await expect(applyMobileSupportRequestCommand({ ...setup([{ ...parent, profile_id: id(99) }]), userId, intent: create, selectedTeamId: null })).rejects.toMatchObject({ status: 403 });
});
it('verifies new selected team and confirms a committed row despite an unknown RPC reply', async () => {
  const db = setup([null, parent], [], true); expect(await applyMobileSupportRequestCommand({ ...db, userId, intent: create, selectedTeamId: id(3) })).toMatchObject({ status: 'confirmed' });
  expect(mocks.selected).toHaveBeenCalledOnce(); expect(db.rpc).toHaveBeenCalledWith('create_wooly_support_request', expect.objectContaining({ p_team_id: id(3) }));
  const denied = setup([null]); await expect(applyMobileSupportRequestCommand({ ...denied, userId, intent: create, selectedTeamId: null })).rejects.toMatchObject({ status: 403 }); expect(denied.rpc).not.toHaveBeenCalled();
  await expect(applyMobileSupportRequestCommand({ ...setup([null, null], [], true), userId, intent: { ...create, teamId: null }, selectedTeamId: null })).rejects.toMatchObject({ status: 503, message: expect.not.stringContaining('private database') });
});
it('forces requester replies and exact account-parent-message reconciliation even for support staff', async () => {
  const intent: MobileSupportRequestCommand = { version: 2, kind: 'reply', userId, requestId: id(2), messageId: id(4), body: 'My reply' };
  const message = { id: id(4), request_id: id(2), author_id: userId, author_kind: 'requester', body: 'My reply', created_at: timestamp, parent: { profile_id: userId } };
  const db = setup([parent, parent], [null, message]); expect(await applyMobileSupportRequestCommand({ ...db, userId, intent, selectedTeamId: null })).toMatchObject({ status: 'confirmed' });
  expect(db.rpc).toHaveBeenCalledWith('reply_wooly_support', { p_request_id: id(2), p_id: id(4), p_body: 'My reply', p_as_support: false });
  const retry = setup([parent], [message]); await applyMobileSupportRequestCommand({ ...retry, userId, intent, selectedTeamId: null }); expect(retry.rpc).not.toHaveBeenCalled();
  await expect(applyMobileSupportRequestCommand({ ...setup([parent], [{ ...message, author_kind: 'support' }]), userId, intent, selectedTeamId: null })).rejects.toMatchObject({ status: 409 });
  await expect(applyMobileSupportRequestCommand({ ...setup([null]), userId, intent, selectedTeamId: null })).rejects.toMatchObject({ status: 403 });
});
