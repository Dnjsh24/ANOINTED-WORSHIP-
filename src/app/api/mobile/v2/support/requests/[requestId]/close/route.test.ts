// @vitest-environment node
import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ user: vi.fn(), apply: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/mobile/v2/context', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/server/mobile/v2/context')>(), requireMobileUser: mocks.user }));
vi.mock('@/lib/server/mobile/v2/support-request-close', () => ({ applyMobileSupportRequestClose: mocks.apply }));
import { POST } from './route';
it('accepts only bounded exact account-owned close requests', async () => {
  const id = '99910000-0000-4000-8000-000000000001'; const time = '2026-10-23T04:00:00Z';
  const input = { version: 2, userId: id, requestId: id, requestNonce: id, base: { createdAt: time, status: 'open', updatedAt: time, supportUpdatedAt: null } };
  mocks.user.mockResolvedValue({ client: {}, userId: id }); mocks.apply.mockResolvedValue({ version: 2 });
  const request = (body: string) => new Request('https://example.test', { method: 'POST', headers: { 'content-type': 'application/json' }, body }); const context = { params: Promise.resolve({ requestId: id }) };
  expect((await POST(request(JSON.stringify(input)), context)).status).toBe(200);
  expect((await POST(request(JSON.stringify({ ...input, asSupport: true })), context)).status).toBe(400);
  expect((await POST(request(' '.repeat(8193)), context)).status).toBe(413);
  expect((await POST(request(JSON.stringify(input)), { params: Promise.resolve({ requestId: 'other' }) })).status).toBe(403); expect(mocks.apply).toHaveBeenCalledOnce();
});
