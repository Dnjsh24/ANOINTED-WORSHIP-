// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { teamNoticeIdentity as identity, teamNoticesPage as page } from '@/lib/mobile/v2/team-notices-test-fixture';
const mocks = vi.hoisted(() => ({ selected: vi.fn(), read: vi.fn() }));
vi.mock('@/lib/server/mobile/v2/context', async original => ({ ...await original<typeof import('@/lib/server/mobile/v2/context')>(), requireSelectedWorkspace: mocks.selected }));
vi.mock('@/lib/server/mobile/v2/team-notices', () => ({ readMobileTeamNotices: mocks.read }));
import { MobileApiError } from '@/lib/server/mobile/context';
import { GET, OPTIONS } from './route';
const context = { params: Promise.resolve({ teamId: identity.teamId }) };
function request(query = 'kind=announcements', origin = 'capacitor://localhost') { return new Request(`https://website.test/api/mobile/v2/workspaces/${identity.teamId}/team-notices?${query}`, { headers: { origin } }); }
beforeEach(() => { vi.clearAllMocks(); mocks.selected.mockResolvedValue({ client: 'verified bearer', identity }); mocks.read.mockResolvedValue(page); });
it('uses selected bearer membership and no-store native CORS for a read-only page', async () => {
  const incoming = request(); const response = await GET(incoming, context);
  expect(response.status).toBe(200); expect(await response.json()).toEqual(page); expect(response.headers.get('cache-control')).toContain('no-store');
  expect(response.headers.get('access-control-allow-origin')).toBe('capacitor://localhost');
  expect(mocks.read).toHaveBeenCalledWith({ client: 'verified bearer', identity, input: { kind: 'announcements' }, signal: incoming.signal }); expect((await OPTIONS(request())).status).toBe(204);
});
it.each([401, 403, 409])('does not read after selected-workspace denial %s', async status => {
  mocks.selected.mockRejectedValue(new MobileApiError(status, 'scope', 'Current membership required'));
  expect((await GET(request(), context)).status).toBe(status); expect(mocks.read).not.toHaveBeenCalled();
});
it('rejects invalid kinds/cursors, authority fields and foreign origins', async () => {
  for (const query of ['kind=other', 'kind=reminders&after=bad', 'kind=announcements&actorId=foreign', 'kind=reminders&asOf=bad']) expect((await GET(request(query), context)).status).toBe(400);
  expect((await GET(request('kind=announcements', 'https://attacker.test'), context)).status).toBe(403); expect(mocks.read).not.toHaveBeenCalled();
});
