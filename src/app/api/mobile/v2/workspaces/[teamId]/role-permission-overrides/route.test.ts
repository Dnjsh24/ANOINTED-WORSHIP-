// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { rolePermissionOverrideIdentity as identity, rolePermissionOverrideRequest as input, rolePermissionOverrideReceipt as receipt } from '@/lib/mobile/v2/role-permission-override-test-fixture';
const mocks = vi.hoisted(() => ({ selected: vi.fn(), apply: vi.fn() }));
vi.mock('@/lib/server/mobile/v2/context', async original => ({ ...await original<typeof import('@/lib/server/mobile/v2/context')>(), requireSelectedWorkspace: mocks.selected }));
vi.mock('@/lib/server/mobile/v2/role-permission-override', () => ({ applyMobileRolePermissionOverride: mocks.apply }));
import { MobileApiError } from '@/lib/server/mobile/context';
import { POST, OPTIONS } from './route';
const context = { params: Promise.resolve({ teamId: identity.teamId }) };
function request(body: unknown = input, origin = 'capacitor://localhost') { return new Request(`https://website.test/api/mobile/v2/workspaces/${identity.teamId}/role-permission-overrides`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) }); }
beforeEach(() => { vi.clearAllMocks(); mocks.selected.mockResolvedValue({ client: 'verified bearer', identity }); mocks.apply.mockResolvedValue(receipt); });
it('passes selected owner authority and bounded immutable role permission change with no-store native CORS', async () => {
  const incoming = request(); const response = await POST(incoming, context); expect(response.status).toBe(200); expect(await response.json()).toEqual(receipt);
  expect(response.headers.get('cache-control')).toContain('no-store'); expect(response.headers.get('access-control-allow-origin')).toBe('capacitor://localhost');
  expect(mocks.apply).toHaveBeenCalledWith({ client: 'verified bearer', identity, request: input, signal: incoming.signal }); expect((await OPTIONS(request())).status).toBe(204);
});
it.each([401, 403, 409])('does not delete a role after selected membership denial %s', async status => {
  mocks.selected.mockRejectedValue(new MobileApiError(status, 'scope', 'Current owner membership required')); expect((await POST(request(), context)).status).toBe(status); expect(mocks.apply).not.toHaveBeenCalled();
});
it('rejects unknown fields, bulk requests, invalid fields, oversized bodies and foreign origins', async () => {
  for (const body of [{ ...input, memberIds: ['unexpected'] }, { ...input, description: 'invented' }, { ...input, base: { ...input.base, teamId: identity.userId } }, { ...input, targetRole: 'owner' }, { ...input, base: { ...input.base, id: 'invalid' } }]) expect((await POST(request(body), context)).status).toBe(400);
  expect((await POST(request({ ...input, padding: 'あ'.repeat(12000) }), context)).status).toBe(413);
  expect((await POST(request(input, 'https://attacker.test'), context)).status).toBe(403); expect(mocks.apply).not.toHaveBeenCalled();
});
