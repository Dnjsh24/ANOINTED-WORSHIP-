// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { ownershipTransferIdentity as identity, ownershipTransferCurrentIdentity as demoted, ownershipTransferRequest as input, ownershipTransferResponse as result } from '@/lib/mobile/v2/ownership-transfer-test-fixture';
const mocks = vi.hoisted(() => ({ selected: vi.fn(), apply: vi.fn() }));
vi.mock('@/lib/server/mobile/v2/context', async original => ({ ...await original<typeof import('@/lib/server/mobile/v2/context')>(), requireSelectedWorkspace: mocks.selected }));
vi.mock('@/lib/server/mobile/v2/ownership-transfer', () => ({ applyMobileOwnershipTransfer: mocks.apply }));
import { POST } from './route';
const context = { params: Promise.resolve({ teamId: identity.teamId }) };
function request(body: unknown = input, origin = 'capacitor://localhost') { return new Request('https://website.test/api/mobile/v2/ownership-transfers', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) }); }
beforeEach(() => { vi.clearAllMocks(); mocks.selected.mockResolvedValue({ client: 'bearer', identity }); mocks.apply.mockResolvedValue(result); });
it('returns the fresh identity wrapper while passing the original immutable request directly', async () => {
  const incoming = request(); const response = await POST(incoming, context); expect(response.status).toBe(200); expect(await response.json()).toEqual(result);
  expect(mocks.apply).toHaveBeenCalledWith({ client: 'bearer', identity, request: input, signal: incoming.signal }); expect(response.headers.get('cache-control')).toContain('no-store');
  mocks.selected.mockResolvedValue({ client: 'bearer', identity: demoted }); expect((await POST(request(), context)).status).toBe(200);
});
it('rejects malformed, foreign-origin and oversized transfer requests', async () => {
  for (const body of [{ ...input, extra: true }, { ...input, base: { ...input.base, target: { ...input.base.target, role: 'owner' } } }, { ...input, base: { ...input.base, target: { ...input.base.target, status: 'inactive' } } }]) expect((await POST(request(body), context)).status).toBe(400);
  expect((await POST(request({ ...input, padding: 'あ'.repeat(12000) }), context)).status).toBe(413); expect((await POST(request(input,'https://attacker.test'),context)).status).toBe(403); expect(mocks.apply).not.toHaveBeenCalled();
});
