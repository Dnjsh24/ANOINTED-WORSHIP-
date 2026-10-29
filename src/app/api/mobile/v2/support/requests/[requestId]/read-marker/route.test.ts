// @vitest-environment node
import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ user: vi.fn(), apply: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/mobile/v2/context', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/server/mobile/v2/context')>(), requireMobileUser: mocks.user }));
vi.mock('@/lib/server/mobile/v2/support-read-marker', () => ({ applyMobileSupportReadMarker: mocks.apply }));
import { MobileApiError } from '@/lib/server/mobile/context';
import { POST } from './route';
it('requires account authentication and a bounded exact thread/snapshot request', async () => {
  const id = '99900000-0000-4000-8000-000000000001'; const input = { version: 2, userId: id, requestId: id, readUntil: '2026-10-23T04:00:00Z' };
  mocks.user.mockResolvedValue({ client: {}, userId: id }); mocks.apply.mockResolvedValue({ ...input, observedReadAt: input.readUntil, fetchedAt: input.readUntil });
  const request = (body: string) => new Request('https://example.test', { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  const context = { params: Promise.resolve({ requestId: id }) };
  expect((await POST(request(JSON.stringify(input)), context)).status).toBe(200);
  expect((await POST(request(JSON.stringify({ ...input, asSupport: true })), context)).status).toBe(400);
  expect((await POST(request(' '.repeat(4097)), context)).status).toBe(413);
  expect((await POST(request(JSON.stringify(input)), { params: Promise.resolve({ requestId: 'other' }) })).status).toBe(403);
  mocks.user.mockRejectedValueOnce(new MobileApiError(401, 'session', 'Sign in.')); expect((await POST(request(JSON.stringify(input)), context)).status).toBe(401); expect(mocks.apply).toHaveBeenCalledOnce();
});
