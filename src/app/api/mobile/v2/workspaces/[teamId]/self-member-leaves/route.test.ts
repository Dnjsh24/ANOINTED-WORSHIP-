// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { selfMemberLeaveRequest as input, selfMemberLeaveReceipt as receipt, selfMemberLeaveScope as scope, selfMemberLeaveState as state } from '@/lib/mobile/v2/self-member-leave-test-fixture';
const mocks = vi.hoisted(() => ({ user: vi.fn(), apply: vi.fn(), read: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/mobile/v2/context', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/server/mobile/v2/context')>(), requireMobileUser: mocks.user }));
vi.mock('@/lib/server/mobile/v2/self-member-leave', () => ({ applyMobileSelfMemberLeave: mocks.apply, readMobileSelfMemberLeaveState: mocks.read }));
import { POST } from './route';
import { GET } from './state/route';
const params = { params: Promise.resolve({ teamId: scope.teamId }) };
const headers = { 'content-type': 'application/json', 'x-mobile-user-id': scope.userId, 'x-mobile-team-id': scope.teamId, 'x-mobile-member-id': scope.memberId };
beforeEach(() => { vi.clearAllMocks(); mocks.user.mockResolvedValue({ client: {}, userId: scope.userId }); mocks.apply.mockResolvedValue(receipt); mocks.read.mockResolvedValue(state); });
it('parses exact bounded departure and sealed nonce queries with pinned account/member scope', async () => {
  const result = await POST(new Request('https://example.test', { method: 'POST', headers, body: JSON.stringify(input) }), params);
  expect(result.status).toBe(200); expect(await result.json()).toEqual(receipt); expect(mocks.apply).toHaveBeenCalledWith(expect.objectContaining({ scope, request: input }));
  expect((await GET(new Request(`https://example.test?requestNonce=${input.requestNonce}`, { headers }), params)).status).toBe(200);
  expect(mocks.read).toHaveBeenCalledWith(expect.objectContaining({ input: { requestNonce: input.requestNonce }, scope }));
  for (const query of ['?unexpected=1', `?requestNonce=${input.requestNonce}&requestNonce=${input.requestNonce}`]) expect((await GET(new Request(`https://example.test${query}`, { headers }), params)).status).toBe(400);
  expect((await POST(new Request('https://example.test', { method: 'POST', headers, body: ' '.repeat(32769) }), params)).status).toBe(413);
  expect((await POST(new Request('https://example.test', { method: 'POST', headers: { ...headers, 'x-mobile-team-id': scope.userId }, body: JSON.stringify(input) }), params)).status).toBe(409);
  expect(mocks.apply).toHaveBeenCalledOnce();
});
