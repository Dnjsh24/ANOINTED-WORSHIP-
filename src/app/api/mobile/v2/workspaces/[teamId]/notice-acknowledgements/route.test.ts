// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { teamNoticeIdentity as identity, teamNoticeId as id } from '@/lib/mobile/v2/team-notices-test-fixture';
const mocks = vi.hoisted(() => ({ selected: vi.fn(), acknowledge: vi.fn() }));
vi.mock('@/lib/server/mobile/v2/context', async original => ({ ...await original<typeof import('@/lib/server/mobile/v2/context')>(), requireSelectedWorkspace: mocks.selected }));
vi.mock('@/lib/server/mobile/v2/team-notice-ack', () => ({ acknowledgeMobileTeamNotice: mocks.acknowledge }));
import { MobileApiError } from '@/lib/server/mobile/context';
import { POST, OPTIONS } from './route';
const input = { version: 2, kind: 'announcement', targetId: id(4), requestNonce: id(9), acknowledged: true };
const receipt = { ...input, userId: id(1), teamId: id(2), memberId: id(3), acknowledgedAt: '2026-10-21T00:00:00Z' };
const context = { params: Promise.resolve({ teamId: identity.teamId }) };
function request(body: unknown = input, origin = 'capacitor://localhost') { return new Request(`https://website.test/api/mobile/v2/workspaces/${identity.teamId}/notice-acknowledgements`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) }); }
beforeEach(() => { vi.clearAllMocks(); mocks.selected.mockResolvedValue({ client: 'verified bearer', identity }); mocks.acknowledge.mockResolvedValue(receipt); });
it('uses selected bearer identity and returns no-store acknowledgement confirmation', async () => {
  const incoming = request(); const response = await POST(incoming, context);
  expect(response.status).toBe(200); expect(await response.json()).toEqual(receipt); expect(response.headers.get('cache-control')).toContain('no-store');
  expect(mocks.acknowledge).toHaveBeenCalledWith({ client: 'verified bearer', identity, request: input, signal: incoming.signal }); expect((await OPTIONS(request())).status).toBe(204);
});
it.each([401, 403, 409])('does not acknowledge after selected-workspace denial %s', async status => {
  mocks.selected.mockRejectedValue(new MobileApiError(status, 'scope', 'Current membership required'));
  expect((await POST(request(), context)).status).toBe(status); expect(mocks.acknowledge).not.toHaveBeenCalled();
});
it('rejects undo, other-profile claims, oversized input and foreign origins', async () => {
  for (const change of [{ acknowledged: false }, { profileId: id(90) }, { actorId: id(90) }, { kind: 'other' }]) expect((await POST(request({ ...input, ...change }), context)).status).toBe(400);
  expect((await POST(request({ ...input, padding: 'あ'.repeat(1024) }), context)).status).toBe(413);
  expect((await POST(request(input, 'https://attacker.test'), context)).status).toBe(403); expect(mocks.acknowledge).not.toHaveBeenCalled();
});
