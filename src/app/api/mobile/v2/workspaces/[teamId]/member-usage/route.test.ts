// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { memberUsageIdentity as identity, memberUsageFixture as fixture, memberUsageInput as input } from '@/lib/mobile/v2/member-usage-test-fixture';
const mocks = vi.hoisted(() => ({ selected: vi.fn(), read: vi.fn() }));
vi.mock('@/lib/server/mobile/v2/context', async original => ({ ...await original<typeof import('@/lib/server/mobile/v2/context')>(), requireSelectedWorkspace: mocks.selected }));
vi.mock('@/lib/server/mobile/v2/member-usage', () => ({ readMobileMemberUsage: mocks.read }));
import { MobileApiError } from '@/lib/server/mobile/context';
import { GET, OPTIONS } from './route';
const context = { params: Promise.resolve({ teamId: identity.teamId }) };
function request(query = '?start=2026-10-01&end=2026-10-07', origin = 'capacitor://localhost') { return new Request(`https://website.test/api/mobile/v2/workspaces/${identity.teamId}/member-usage${query}`, { headers: { origin } }); }
beforeEach(() => { vi.clearAllMocks(); mocks.selected.mockResolvedValue({ client: 'verified bearer', identity }); mocks.read.mockResolvedValue(fixture); });
it('passes selected bearer identity and exact UTC range with no-store native CORS', async () => {
  const incoming = request(); const response = await GET(incoming, context); expect(response.status).toBe(200); expect(await response.json()).toEqual(fixture);
  expect(response.headers.get('cache-control')).toContain('no-store'); expect(response.headers.get('access-control-allow-origin')).toBe('capacitor://localhost');
  expect(mocks.read).toHaveBeenCalledWith({ client: 'verified bearer', identity, input, signal: incoming.signal }); expect((await OPTIONS(request())).status).toBe(204);
});
it.each([401, 403, 409])('does not read usage after selected membership denial %s', async status => {
  mocks.selected.mockRejectedValue(new MobileApiError(status, 'scope', 'Current manager membership required'));
  expect((await GET(request(), context)).status).toBe(status); expect(mocks.read).not.toHaveBeenCalled();
});
it('rejects missing/impossible/reversed/oversized UTC dates, duplicate params, supplied authority and foreign origins', async () => {
  for (const query of ['', '?start=2026-02-30&end=2026-03-01', '?start=2026-10-08&end=2026-10-01', '?start=2025-01-01&end=2026-01-02', '?start=2026-10-01&end=2026-10-07&role=owner', '?start=2026-10-01&start=2026-10-02&end=2026-10-07']) expect((await GET(request(query), context)).status).toBe(400);
  expect((await GET(request(undefined, 'https://attacker.test'), context)).status).toBe(403); expect(mocks.read).not.toHaveBeenCalled();
});
