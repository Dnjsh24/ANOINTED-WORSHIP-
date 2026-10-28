// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { selfMemberLeaveScope as scope } from '@/lib/mobile/v2/self-member-leave-test-fixture';
const mocks = vi.hoisted(() => ({ user: vi.fn(), workspace: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('./context', async importOriginal => ({ ...await importOriginal<typeof import('./context')>(), requireMobileUser: mocks.user }));
vi.mock('./workspaces', () => ({ readSelectedWorkspace: mocks.workspace }));
import { requireSelfMemberLeaveScope, selfMemberLeavePreflight } from './self-member-leave-context';
beforeEach(() => { vi.clearAllMocks(); mocks.user.mockResolvedValue({ client: {}, userId: scope.userId }); });
it('uses verified account authentication and pinned scope without any workspace lookup', async () => {
  const headers = { 'x-mobile-user-id': scope.userId, 'x-mobile-team-id': scope.teamId, 'x-mobile-member-id': scope.memberId };
  expect((await requireSelfMemberLeaveScope(new Request('https://example.test', { headers }), scope.teamId)).scope).toEqual(scope);
  expect(mocks.user).toHaveBeenCalledOnce(); expect(mocks.workspace).not.toHaveBeenCalled();
  await expect(requireSelfMemberLeaveScope(new Request('https://example.test'), scope.teamId)).rejects.toMatchObject({ status: 409 });
  mocks.user.mockRejectedValueOnce(new Error('expired session'));
  await expect(requireSelfMemberLeaveScope(new Request('https://example.test', { headers }), scope.teamId)).rejects.toThrow('expired session');
});
it('supports the pinned member header only on the allowed origin boundary', async () => {
  const result = await selfMemberLeavePreflight(new Request('https://example.test', { headers: { origin: 'capacitor://localhost' } }));
  expect(result.status).toBe(204); expect(result.headers.get('Access-Control-Allow-Headers')).toContain('X-Mobile-Member-Id');
  expect((await selfMemberLeavePreflight(new Request('https://example.test', { headers: { origin: 'https://evil.test' } }))).status).toBe(403);
});
