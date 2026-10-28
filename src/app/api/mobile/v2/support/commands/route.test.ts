// @vitest-environment node
import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ user: vi.fn(), apply: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/mobile/v2/context', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/server/mobile/v2/context')>(), requireMobileUser: mocks.user }));
vi.mock('@/lib/server/mobile/v2/support-request-commands', () => ({ applyMobileSupportRequestCommand: mocks.apply }));
import { MobileApiError } from '@/lib/server/mobile/context';
import { POST } from './route';
it('requires account authentication and strict bounded requester-only command bodies', async () => {
  const userId = '99890000-0000-4000-8000-000000000001'; const intent = { version: 2, kind: 'create', userId, requestId: userId, teamId: null, question: 'Help', details: '', pagePath: '/help' };
  mocks.user.mockResolvedValue({ client: {}, userId }); mocks.apply.mockResolvedValue({ version: 2 });
  const request = (body: string) => new Request('https://example.test', { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  expect((await POST(request(JSON.stringify(intent)))).status).toBe(200);
  expect((await POST(request(JSON.stringify({ ...intent, asSupport: true })))).status).toBe(400);
  expect((await POST(request(' '.repeat(32769)))).status).toBe(413);
  mocks.user.mockRejectedValueOnce(new MobileApiError(401, 'session', 'Sign in.')); expect((await POST(request(JSON.stringify(intent)))).status).toBe(401);
  expect(mocks.apply).toHaveBeenCalledOnce();
});
