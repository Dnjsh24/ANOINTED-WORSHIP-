// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { ownershipTransferIdentity as identity, ownershipTransferRequest as input, ownershipTransferState as state } from '@/lib/mobile/v2/ownership-transfer-test-fixture';
const mocks = vi.hoisted(() => ({ selected: vi.fn(), read: vi.fn() }));
vi.mock('@/lib/server/mobile/v2/context', async original => ({ ...await original<typeof import('@/lib/server/mobile/v2/context')>(), requireSelectedWorkspace: mocks.selected }));
vi.mock('@/lib/server/mobile/v2/ownership-transfer', () => ({ readMobileOwnershipTransferState: mocks.read }));
import { GET } from './route';
const context = { params: Promise.resolve({ teamId: identity.teamId }) };
function request(query = `targetMemberId=${state.targetMemberId}`) { return new Request(`https://website.test/api/mobile/v2/ownership-transfers/state?${query}`, { headers: { origin: 'capacitor://localhost' } }); }
beforeEach(() => { vi.clearAllMocks(); mocks.selected.mockResolvedValue({ client: 'bearer', identity }); mocks.read.mockResolvedValue(state); });
it('permits the exact fresh-owner query and target-plus-nonce sealed recovery query', async () => {
  expect((await GET(request(),context)).status).toBe(200); expect(mocks.read).toHaveBeenLastCalledWith(expect.objectContaining({ input: { targetMemberId: state.targetMemberId } }));
  expect((await GET(request(`targetMemberId=${state.targetMemberId}&requestNonce=${input.requestNonce}`),context)).status).toBe(200);
  expect(mocks.read).toHaveBeenLastCalledWith(expect.objectContaining({ input: { targetMemberId: state.targetMemberId, requestNonce: input.requestNonce } }));
});
it('rejects missing, unknown, malformed or duplicate selection/recovery keys', async () => {
  for (const query of ['', 'targetMemberId=bad', `requestNonce=${input.requestNonce}`, `targetMemberId=${state.targetMemberId}&requestNonce=bad`, `targetMemberId=${state.targetMemberId}&targetMemberId=${state.targetMemberId}`, `targetMemberId=${state.targetMemberId}&extra=1`]) expect((await GET(request(query),context)).status).toBe(400);
  expect(mocks.read).not.toHaveBeenCalled();
});
