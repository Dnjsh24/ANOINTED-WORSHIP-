// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { memberRosterIdentity as identity, memberRosterPage as page } from '@/lib/mobile/v2/member-roster-test-fixture';
const mocks = vi.hoisted(() => ({ selected: vi.fn(), read: vi.fn() }));
vi.mock('@/lib/server/mobile/v2/context', async original => ({ ...await original<typeof import('@/lib/server/mobile/v2/context')>(), requireSelectedWorkspace: mocks.selected }));
vi.mock('@/lib/server/mobile/v2/member-roster', () => ({ readMobileMemberRoster: mocks.read }));
import { MobileApiError } from '@/lib/server/mobile/context';
import { GET, OPTIONS } from './route';
const context = { params: Promise.resolve({ teamId: identity.teamId }) };
function request(query = '', origin = 'capacitor://localhost') { return new Request(`https://website.test/api/mobile/v2/workspaces/${identity.teamId}/member-roster${query}`, { headers: { origin } }); }
beforeEach(() => { vi.clearAllMocks(); mocks.selected.mockResolvedValue({ client: 'verified bearer', identity }); mocks.read.mockResolvedValue(page); });
it('uses selected bearer identity and no-store native CORS for scoped roster pages', async () => {
  const incoming = request(); const response = await GET(incoming, context); expect(response.status).toBe(200); expect(await response.json()).toEqual(page);
  expect(response.headers.get('cache-control')).toContain('no-store'); expect(response.headers.get('access-control-allow-origin')).toBe('capacitor://localhost');
  expect(mocks.read).toHaveBeenCalledWith({ client: 'verified bearer', identity, input: {}, signal: incoming.signal }); expect((await OPTIONS(request())).status).toBe(204);
});
it.each([401, 403, 409])('does not read roster after selected membership denial %s', async status => {
  mocks.selected.mockRejectedValue(new MobileApiError(status, 'scope', 'Current manager membership required')); expect((await GET(request(), context)).status).toBe(status); expect(mocks.read).not.toHaveBeenCalled();
});
it('rejects invalid or unbound cursors, supplied authority, invalid cutoff and foreign origins', async () => {
  for (const query of ['?after=bad', `?after=${identity.memberId}`, '?asOf=not-date', '?canManage=true', '?userId=other']) expect((await GET(request(query), context)).status).toBe(400);
  expect((await GET(request('', 'https://attacker.test'), context)).status).toBe(403); expect(mocks.read).not.toHaveBeenCalled();
});
