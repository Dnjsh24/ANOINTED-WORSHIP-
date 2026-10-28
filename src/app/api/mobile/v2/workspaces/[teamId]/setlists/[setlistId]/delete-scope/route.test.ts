// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { setlistReceiptIdentity as identity } from '@/lib/mobile/v2/setlist-result-test-fixture';
import { id } from '@/lib/mobile/v2/setlist-command-test-fixture';
const mocks = vi.hoisted(() => ({ selected: vi.fn(), read: vi.fn() }));
vi.mock('@/lib/server/mobile/v2/context', async original => ({ ...await original<typeof import('@/lib/server/mobile/v2/context')>(), requireSelectedWorkspace: mocks.selected }));
vi.mock('@/lib/server/mobile/v2/setlist-commands', () => ({ readMobileSetlistDeleteScope: mocks.read }));
import { MobileApiError } from '@/lib/server/mobile/context';
import { GET, OPTIONS } from './route';
const context = { params: Promise.resolve({ teamId: identity.teamId, setlistId: id(20) }) };
function request(origin = 'capacitor://localhost') { return new Request(`https://website.test/api/mobile/v2/workspaces/${identity.teamId}/setlists/${id(20)}/delete-scope`, { headers: { origin } }); }
beforeEach(() => { vi.clearAllMocks(); mocks.selected.mockResolvedValue({ client: 'verified bearer client', identity }); mocks.read.mockResolvedValue({ version: 2, identity, review: {} }); });
it('reads the complete scope through selected bearer identity with no-store and native CORS', async () => {
  const incoming = request(); const response = await GET(incoming, context); expect(response.status).toBe(200);
  expect(mocks.selected).toHaveBeenCalledWith(incoming, identity.teamId); expect(mocks.read).toHaveBeenCalledWith({ client: 'verified bearer client', identity, setlistId: id(20) });
  expect(response.headers.get('cache-control')).toContain('no-store'); expect(response.headers.get('access-control-allow-origin')).toBe('capacitor://localhost');
  expect((await OPTIONS(request())).status).toBe(204);
});
it.each([401, 403, 409, 429])('cannot read private scope after selected-scope denial %s', async status => {
  mocks.selected.mockRejectedValue(new MobileApiError(status, 'scope_changed', 'Reopen matching workspace.'));
  expect((await GET(request(), context)).status).toBe(status); expect(mocks.read).not.toHaveBeenCalled();
});
it('rejects foreign origins before identity or deletion-scope reads', async () => {
  expect((await GET(request('https://attacker.test'), context)).status).toBe(403); expect(mocks.selected).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
});
