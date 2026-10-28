// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { ownershipTransferIdentity as identity, ownershipTransferRequest as request, ownershipTransferReceipt as receipt, ownershipTransferResponse as response, ownershipTransferState as initialState, ownershipTransferCurrentIdentity as demoted, ownershipTransferId as id } from '@/lib/mobile/v2/ownership-transfer-test-fixture';
const mocks = vi.hoisted(() => ({ selected: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/mobile/v2/read-workspaces', () => ({ readSelectedWorkspace: mocks.selected }));
import { applyMobileOwnershipTransfer, readMobileOwnershipTransferState } from './ownership-transfer';
const state = { version: 2, targetMemberId: request.base.target.id, requestNonce: request.requestNonce, current: receipt.current, fetchedAt: receipt.recordedAt };
function setup(data: unknown = receipt, code?: string, sqlState: unknown = state) {
  const rpc = vi.fn((name: string) => { const result = { data: name === 'mobile_apply_ownership_transfer' ? data : sqlState, error: code ? { code } : null };
    return { abortSignal: () => Promise.resolve(result), then: <T>(resolve: (value: typeof result) => T) => Promise.resolve(result).then(resolve) }; });
  return { rpc, client: { rpc } as unknown as SupabaseClient<Database> };
}
beforeEach(() => { mocks.selected.mockReset(); mocks.selected.mockResolvedValueOnce(identity).mockResolvedValue(demoted); });
it('confirms the fresh downgraded identity after an atomic transfer without owner post-verification', async () => {
  const { client, rpc } = setup(); expect(await applyMobileOwnershipTransfer({ client, identity, request })).toEqual(response);
  expect(rpc).toHaveBeenCalledWith('mobile_apply_ownership_transfer', { p_team_id: identity.teamId, p_member_id: identity.memberId, p_request: request });
  expect(rpc).toHaveBeenCalledWith('mobile_read_ownership_transfer_state', { p_team_id: identity.teamId, p_member_id: identity.memberId, p_target_member_id: request.base.target.id, p_request_nonce: request.requestNonce });
});
it('allows only SQL-verified exact recovery for an already-demoted actor', async () => {
  mocks.selected.mockReset(); mocks.selected.mockResolvedValue(demoted);
  expect(await applyMobileOwnershipTransfer({ ...setup(), identity: demoted, request })).toEqual(response);
  expect(await readMobileOwnershipTransferState({ ...setup(), identity: demoted, input: { targetMemberId: request.base.target.id, requestNonce: request.requestNonce } })).toEqual({ ...state, identity: demoted });
  await expect(applyMobileOwnershipTransfer({ ...setup(null, '42501'), identity: demoted, request: { ...request, requestNonce: id(90) } })).rejects.toMatchObject({ status: 403 });
});
it('rejects mismatched actors and unverifiable receipt, recovery state or fresh identity', async () => {
  const { client, rpc } = setup(); await expect(applyMobileOwnershipTransfer({ client, identity, request: { ...request, userId: id(90), base: { ...request.base, ownerId: id(90), actor: { ...request.base.actor, profileId: id(90) } } } })).rejects.toMatchObject({ status: 403 }); expect(rpc).not.toHaveBeenCalled();
  for (const data of [null, { ...receipt, secret: true }, { ...receipt, request: { ...request, requestNonce: id(90) } }]) await expect(applyMobileOwnershipTransfer({ ...setup(data), identity, request })).rejects.toMatchObject({ status: 503 });
  await expect(applyMobileOwnershipTransfer({ ...setup(receipt, undefined, { ...state, targetMemberId: id(90) }), identity, request })).rejects.toMatchObject({ status: 503 });
  mocks.selected.mockReset(); mocks.selected.mockResolvedValue(identity);
  await expect(applyMobileOwnershipTransfer({ ...setup(), identity, request })).rejects.toMatchObject({ status: 503 });
});
it('surfaces SQL auth/validation/concurrency errors and preserves abort-after-commit uncertainty', async () => {
  for (const [code, status] of [['42501',403],['22023',400],['40P01',409],['XX000',503]] as const) await expect(applyMobileOwnershipTransfer({ ...setup(null,code), identity, request })).rejects.toMatchObject({ status });
  const controller = new AbortController(); controller.abort(); const { client, rpc } = setup();
  await expect(applyMobileOwnershipTransfer({ client, identity, request, signal: controller.signal })).rejects.toThrow(); expect(rpc).not.toHaveBeenCalled();
});
it('reads fresh owner state without requiring members.manage and verifies precise selection', async () => {
  mocks.selected.mockReset(); mocks.selected.mockResolvedValue(identity);
  const { identity: omittedIdentity, ...data } = initialState; void omittedIdentity;
  expect(await readMobileOwnershipTransferState({ ...setup(null, undefined, data), identity, input: { targetMemberId: initialState.targetMemberId } })).toEqual(initialState);
});
