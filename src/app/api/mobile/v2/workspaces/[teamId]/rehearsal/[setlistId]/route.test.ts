// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { identity, id, rehearsalCache } from '@/lib/mobile/v2/rehearsal-test-fixture';
const mocks = vi.hoisted(() => ({ selected: vi.fn(), read: vi.fn() }));
vi.mock('@/lib/server/mobile/v2/context', async original => ({ ...await original<typeof import('@/lib/server/mobile/v2/context')>(), requireSelectedWorkspace: mocks.selected }));
vi.mock('@/lib/server/mobile/v2/rehearsal', () => ({ readMobileRehearsalWorkspace: mocks.read }));
import { MobileApiError } from '@/lib/server/mobile/context';
import { GET, OPTIONS } from './route';
const context = { params: Promise.resolve({ teamId: identity.teamId, setlistId: id(20) }) };
const request = (origin = 'capacitor://localhost') => new Request('https://example.test/rehearsal', { headers: { origin } });
beforeEach(() => { vi.clearAllMocks(); mocks.selected.mockResolvedValue({ client: 'verified', identity }); mocks.read.mockResolvedValue(rehearsalCache()); });
it('reads only the authenticated selected scope with no-store and native CORS', async () => {
  const incoming = request(), response = await GET(incoming, context);
  expect(response.status).toBe(200); expect(await response.json()).toEqual(rehearsalCache());
  expect(mocks.read).toHaveBeenCalledExactlyOnceWith({ client: 'verified', identity, setlistId: id(20), signal: incoming.signal });
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(response.headers.get('access-control-allow-origin')).toBe('capacitor://localhost');
  expect((await OPTIONS(request())).status).toBe(204);
});
it('rejects foreign origins, invalid setlists and denied scope before reading', async () => {
  expect((await GET(request('https://attacker.test'), context)).status).toBe(403);
  expect(mocks.selected).not.toHaveBeenCalled();
  expect((await GET(request(), { params: Promise.resolve({ teamId: identity.teamId, setlistId: 'bad' }) })).status).toBe(400);
  mocks.selected.mockRejectedValue(new MobileApiError(403, 'permission', 'Membership revoked'));
  expect((await GET(request(), context)).status).toBe(403); expect(mocks.read).not.toHaveBeenCalled();
});
