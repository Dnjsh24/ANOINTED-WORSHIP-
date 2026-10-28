// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { personPermissionOverrideIdentity as identity, personPermissionOverrideState as state } from '@/lib/mobile/v2/person-permission-override-test-fixture';
const mocks = vi.hoisted(() => ({ selected: vi.fn(), read: vi.fn() }));
vi.mock('@/lib/server/mobile/v2/context', async original => ({ ...await original<typeof import('@/lib/server/mobile/v2/context')>(), requireSelectedWorkspace: mocks.selected }));
vi.mock('@/lib/server/mobile/v2/person-permission-override', () => ({ readMobilePersonPermissionOverrideState: mocks.read }));
import { MobileApiError } from '@/lib/server/mobile/context';
import { GET, OPTIONS } from './route';
const context = { params: Promise.resolve({ teamId: identity.teamId }) };
function request(query = `targetMemberId=${state.targetMemberId}&permission=${state.permission}`, origin = 'capacitor://localhost') { return new Request(`https://website.test/api/mobile/v2/workspaces/${identity.teamId}/person-permission-overrides/state?${query}`, { headers: { origin } }); }
beforeEach(() => { vi.clearAllMocks(); mocks.selected.mockResolvedValue({ client: 'verified bearer', identity }); mocks.read.mockResolvedValue(state); });
it('reads the exact selected target with no-store native CORS and no mutation', async () => {
  const incoming = request(); const response = await GET(incoming, context);
  expect(response.status).toBe(200); expect(await response.json()).toEqual(state);
  expect(response.headers.get('cache-control')).toContain('no-store'); expect(response.headers.get('access-control-allow-origin')).toBe('capacitor://localhost');
  expect(mocks.read).toHaveBeenCalledWith({ client: 'verified bearer', identity, input: { targetMemberId: state.targetMemberId, permission: state.permission }, signal: incoming.signal });
  expect((await OPTIONS(request())).status).toBe(204);
});
it('rejects missing, malformed, unknown and duplicate query parameters and foreign origins', async () => {
  for (const query of ['', 'targetMemberId=owner&permission=team.manage', `targetMemberId=${state.targetMemberId}&permission=${state.permission}&extra=1`, `targetMemberId=${state.targetMemberId}&permission=${state.permission}&targetMemberId=${state.targetMemberId}&permission=${state.permission}`]) expect((await GET(request(query), context)).status).toBe(400);
  expect((await GET(request(undefined, 'https://attacker.test'), context)).status).toBe(403); expect(mocks.read).not.toHaveBeenCalled();
});
it.each([401, 403, 409])('does not read member state after selected-scope denial %s', async status => {
  mocks.selected.mockRejectedValue(new MobileApiError(status, 'scope', 'Current member-management authority required'));
  expect((await GET(request(), context)).status).toBe(status); expect(mocks.read).not.toHaveBeenCalled();
});
