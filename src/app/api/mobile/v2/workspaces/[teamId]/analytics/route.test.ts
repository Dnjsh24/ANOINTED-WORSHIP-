// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { analyticsIdentity as identity, analyticsFixture as fixture } from '@/lib/mobile/v2/analytics-test-fixture';
const mocks = vi.hoisted(() => ({ selected: vi.fn(), read: vi.fn() }));
vi.mock('@/lib/server/mobile/v2/context', async original => ({ ...await original<typeof import('@/lib/server/mobile/v2/context')>(), requireSelectedWorkspace: mocks.selected }));
vi.mock('@/lib/server/mobile/v2/analytics', () => ({ readMobileAnalytics: mocks.read }));
import { MobileApiError } from '@/lib/server/mobile/context';
import { GET, OPTIONS } from './route';
const context = { params: Promise.resolve({ teamId: identity.teamId }) };
function request(query = '', origin = 'capacitor://localhost') { return new Request(`https://website.test/api/mobile/v2/workspaces/${identity.teamId}/analytics${query}`, { headers: { origin } }); }
beforeEach(() => { vi.clearAllMocks(); mocks.selected.mockResolvedValue({ client: 'verified bearer', identity }); mocks.read.mockResolvedValue(fixture); });
it('uses selected bearer authority and passes bounded date inputs with no-store native CORS', async () => {
  const incoming = request('?start=2026-10-01&end=2026-10-07'); const response = await GET(incoming, context);
  expect(response.status).toBe(200); expect(await response.json()).toEqual(fixture);
  expect(response.headers.get('cache-control')).toContain('no-store'); expect(response.headers.get('access-control-allow-origin')).toBe('capacitor://localhost');
  expect(mocks.read).toHaveBeenCalledWith({ client: 'verified bearer', identity, input: { start: '2026-10-01', end: '2026-10-07' }, signal: incoming.signal });
  expect((await OPTIONS(request())).status).toBe(204);
});
it.each([401, 403, 409])('does not aggregate after selected workspace denial %s', async status => {
  mocks.selected.mockRejectedValue(new MobileApiError(status, 'scope', 'Current owner/admin membership required'));
  expect((await GET(request(), context)).status).toBe(status); expect(mocks.read).not.toHaveBeenCalled();
});
it('rejects malformed dates, duplicate parameters, supplied authority and foreign origins', async () => {
  for (const query of ['?start=bad', '?start=2026-02-30', '?start=2026-01-01&start=2026-01-02', '?role=owner', '?userId=other', '?range=all']) expect((await GET(request(query), context)).status).toBe(400);
  expect((await GET(request('', 'https://attacker.test'), context)).status).toBe(403); expect(mocks.read).not.toHaveBeenCalled();
});
