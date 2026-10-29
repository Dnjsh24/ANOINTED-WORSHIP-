// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { profileAvatarIdentity as identity } from '@/lib/mobile/v2/profile-avatar-test-fixture';
const mocks = vi.hoisted(() => ({ context: vi.fn(), read: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/mobile/v2/context', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/server/mobile/v2/context')>(), requireSelectedWorkspace: mocks.context }));
vi.mock('@/lib/server/mobile/v2/wooly-records', () => ({ readMobileWoolyRecords: mocks.read }));
import { MobileApiError } from '@/lib/server/mobile/context';
import { POST } from './route';
it('requires selected workspace and strict bounded record question without arbitrary intent/query fields', async () => {
  const input = { version: 2, userId: identity.userId, teamId: identity.teamId, memberId: identity.memberId, question: 'Find song Grace', today: '2026-10-23' };
  mocks.context.mockResolvedValue({ client: {}, identity }); mocks.read.mockResolvedValue({ version: 2 });
  const request = (body: string) => new Request('https://example.test', { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  const context = { params: Promise.resolve({ teamId: identity.teamId }) };
  expect((await POST(request(JSON.stringify(input)), context)).status).toBe(200);
  expect((await POST(request(JSON.stringify({ ...input, query: { table: 'profiles' } })), context)).status).toBe(400);
  expect((await POST(request(' '.repeat(16385)), context)).status).toBe(413);
  mocks.context.mockRejectedValueOnce(new MobileApiError(403, 'membership', 'Current team required.'));
  expect((await POST(request(JSON.stringify(input)), context)).status).toBe(403); expect(mocks.read).toHaveBeenCalledOnce();
});
