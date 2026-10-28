// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { teamSettingsIdentity as identity, teamSettingsResponse as expected } from '@/lib/mobile/v2/team-settings-test-fixture';
const mocks = vi.hoisted(() => ({ selected: vi.fn(), read: vi.fn() }));
vi.mock('@/lib/server/mobile/v2/context', async original => ({ ...await original<typeof import('@/lib/server/mobile/v2/context')>(), requireSelectedWorkspace: mocks.selected }));
vi.mock('@/lib/server/mobile/v2/team-settings', () => ({ readMobileTeamSettings: mocks.read }));
import { MobileApiError } from '@/lib/server/mobile/context';
import { GET, OPTIONS } from './route';
const context = { params: Promise.resolve({ teamId: identity.teamId }) };
function request(query = '', origin = 'capacitor://localhost') { return new Request(`https://website.test/api/mobile/v2/workspaces/${identity.teamId}/team-settings${query}`, { headers: { origin } }); }
beforeEach(() => { vi.clearAllMocks(); mocks.selected.mockResolvedValue({ client: 'verified bearer', identity }); mocks.read.mockResolvedValue(expected); });
it('uses authenticated selected membership, cancellation, no-store and native CORS for the complete read', async () => {
  const incoming = request(); const response = await GET(incoming, context); expect(response.status).toBe(200); expect(await response.json()).toEqual(expected);
  expect(mocks.read).toHaveBeenCalledWith({ client: 'verified bearer', identity, signal: incoming.signal });
  expect(response.headers.get('cache-control')).toContain('no-store'); expect(response.headers.get('access-control-allow-origin')).toBe('capacitor://localhost');
  expect((await OPTIONS(request())).status).toBe(204);
});
it.each([401, 403, 409])('does not query settings after selected authority denial%s', async status => {
  mocks.selected.mockRejectedValue(new MobileApiError(status, 'scope', 'Current settings authority required'));
  expect((await GET(request(), context)).status).toBe(status); expect(mocks.read).not.toHaveBeenCalled();
});
it('rejects query-based team switching, secret requests and foreign origins', async () => {
  for (const query of ['?teamId=other', '?code=true', '?after=100']) expect((await GET(request(query), context)).status).toBe(400);
  expect((await GET(request('', 'https://attacker.test'), context)).status).toBe(403); expect(mocks.read).not.toHaveBeenCalled();
});
it('propagates honest catalog unavailability without returning a partial ready response', async () => {
  mocks.read.mockRejectedValue(new MobileApiError(503, 'settings_catalog_limit', 'The complete catalog cannot be downloaded.'));
  expect((await GET(request(), context)).status).toBe(503);
});
