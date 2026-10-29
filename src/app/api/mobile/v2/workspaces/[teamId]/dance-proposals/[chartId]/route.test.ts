// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { chartId, identity, snapshot, proposalRequest, receipt, id } from '@/lib/dance-proposal-network-test-fixture';
const mocks = vi.hoisted(() => ({ selected: vi.fn(), read: vi.fn(), submit: vi.fn() }));
vi.mock('@/lib/server/mobile/v2/context', async original => ({ ...await original<typeof import('@/lib/server/mobile/v2/context')>(), requireSelectedWorkspace: mocks.selected }));
vi.mock('@/lib/server/mobile/v2/dance-proposals', () => ({ readMobileDanceProposalSnapshot: mocks.read, submitMobileDanceProposal: mocks.submit }));
import { MobileApiError } from '@/lib/server/mobile/context';
import { GET, POST, OPTIONS } from './route';
const context = { params: Promise.resolve({ teamId: identity.teamId, chartId }) };
function request(method = 'POST', body: unknown = proposalRequest, origin = 'capacitor://localhost') {
  return new Request(`https://website.test/api/mobile/v2/workspaces/${identity.teamId}/dance-proposals/${chartId}`, { method, headers: { origin, 'content-type': 'application/json' }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) });
}
beforeEach(() => { vi.clearAllMocks(); mocks.selected.mockResolvedValue({ client: 'verified bearer client', identity }); mocks.read.mockResolvedValue(snapshot); mocks.submit.mockResolvedValue(receipt); });
it('reads the real snapshot and submits with the selected bearer identity and cancellation', async () => {
  const incoming = request();
  const response = await POST(incoming, context);
  expect(response.status).toBe(200); expect(await response.json()).toEqual(receipt);
  expect(mocks.submit).toHaveBeenCalledWith({ client: 'verified bearer client', identity, chartId, request: proposalRequest, signal: incoming.signal });
  expect(response.headers.get('cache-control')).toContain('no-store'); expect(response.headers.get('access-control-allow-origin')).toBe('capacitor://localhost');
  const read = request('GET'); expect(await (await GET(read, context)).json()).toEqual(snapshot);
  expect(mocks.read).toHaveBeenCalledWith({ client: 'verified bearer client', identity, chartId, signal: read.signal });
  expect((await OPTIONS(request())).status).toBe(204);
});
it.each([401, 403, 409, 429])('does not read or submit after selected-workspace denial %s', async status => {
  mocks.selected.mockRejectedValue(new MobileApiError(status, 'scope', 'Current membership required'));
  expect((await POST(request(), context)).status).toBe(status); expect((await GET(request('GET'), context)).status).toBe(status);
  expect(mocks.submit).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
});
it('rejects foreign origins, oversized UTF-8 and added authority before submission', async () => {
  expect((await POST(request('POST', proposalRequest, 'https://attacker.test'), context)).status).toBe(403);
  expect(mocks.selected).not.toHaveBeenCalled();
  expect((await POST(request('POST', { ...proposalRequest, padding: 'あ'.repeat(12000) }), context)).status).toBe(413);
  expect((await POST(request('POST', { ...proposalRequest, actorId: id(89) }), context)).status).toBe(400);
  expect((await POST(request('POST', { ...proposalRequest, intent: { ...proposalRequest.intent, grantedPermission: true } }), context)).status).toBe(400);
  expect(mocks.submit).not.toHaveBeenCalled();
});
