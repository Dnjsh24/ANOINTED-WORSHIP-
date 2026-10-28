// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { mobileProfileFixture as profile } from '@/lib/mobile/v2/profile-test-fixture';
const mocks = vi.hoisted(() => ({ selected: vi.fn(), read: vi.fn() }));
vi.mock('@/lib/server/mobile/v2/context', async original => ({ ...await original<typeof import('@/lib/server/mobile/v2/context')>(), requireSelectedWorkspace: mocks.selected }));
vi.mock('@/lib/server/mobile/v2/profile', () => ({ readMobileProfile: mocks.read }));
import { MobileApiError } from '@/lib/server/mobile/context';
import { GET, OPTIONS } from './route';
const identity = profile.identity; const context = { params: Promise.resolve({ teamId: identity.teamId }) };
function request(query = '', origin = 'capacitor://localhost') { return new Request(`https://website.test/api/mobile/v2/workspaces/${identity.teamId}/profile${query}`, { headers: { origin } }); }
beforeEach(() => { vi.clearAllMocks(); mocks.selected.mockResolvedValue({ client: 'verified bearer', identity }); mocks.read.mockResolvedValue(profile); });
it('returns own profile using selected bearer identity with no-store native CORS', async () => {
  const incoming = request(); const response = await GET(incoming, context);
  expect(response.status).toBe(200); expect(await response.json()).toEqual(profile); expect(response.headers.get('cache-control')).toContain('no-store');
  expect(response.headers.get('access-control-allow-origin')).toBe('capacitor://localhost'); expect(mocks.read).toHaveBeenCalledWith({ client: 'verified bearer', identity, signal: incoming.signal });
  expect((await OPTIONS(request())).status).toBe(204);
});
it.each([401, 403, 409])('does not read own profile after selected-workspace denial %s', async status => {
  mocks.selected.mockRejectedValue(new MobileApiError(status, 'scope', 'Current membership required'));
  expect((await GET(request(), context)).status).toBe(status); expect(mocks.read).not.toHaveBeenCalled();
});
it('rejects supplied profile IDs or grant claims and foreign origins', async () => {
  expect((await GET(request('?userId=other'), context)).status).toBe(400); expect((await GET(request('?canManage=true'), context)).status).toBe(400);
  expect((await GET(request('', 'https://attacker.test'), context)).status).toBe(403); expect(mocks.read).not.toHaveBeenCalled();
});
