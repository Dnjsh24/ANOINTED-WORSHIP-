import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ context: vi.fn(), user: vi.fn(), selected: vi.fn(), createClient: vi.fn(), limit: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
vi.mock('@/lib/supabase/env', () => ({ hasSupabaseEnv: () => true, getSupabaseEnv: () => ({ url: 'https://example.supabase.co', publishableKey: 'public-test-key' }) }));
vi.mock('@/lib/supabase/team-context-client', () => ({ getCurrentTeamContextForClient: mocks.context }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: mocks.limit }));
vi.mock('@/lib/mobile/v2/read-workspaces', () => ({ readSelectedWorkspace: mocks.selected }));
import { requireMobileContext } from './context';
import { MobileApiError } from '@/lib/mobile/errors';
const userId = '11111111-1111-4111-8111-111111111111';
const teamId = '22222222-2222-4222-8222-222222222222';
function request(headers: Record<string, string> = {}) {
  return new Request('https://example.test/api/mobile/v1/commands', { headers: {
    authorization: 'Bearer signed.test.token', 'X-Mobile-User-Id': userId, 'X-Mobile-Team-Id': teamId, ...headers,
  } });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({ userId, teamId, memberId: '33333333-3333-4333-8333-333333333333', teamName: 'Test team', role: 'owner' });
  mocks.createClient.mockReturnValue({ auth: { getUser: mocks.user } });
  mocks.user.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  mocks.selected.mockImplementation(async ({ teamId: selected }: { teamId: string }) => {
    if (selected !== teamId) throw new MobileApiError(403, 'membership', 'Inactive team');
    return { teamId, memberId: '33333333-3333-4333-8333-333333333333', teamName: 'Test team', role: 'owner', permissions: [] };
  });
  mocks.limit.mockResolvedValue({ allowed: true });
});
describe('mobile authenticated workspace boundary', () => {
  it('forwards the token to verified Auth and accepts only a matching workspace', async () => {
    expect((await requireMobileContext(request(), true)).identity).toMatchObject({ userId, teamId });
    expect(mocks.createClient).toHaveBeenCalledWith(expect.any(String), expect.any(String), expect.objectContaining({ global: { headers: { Authorization: 'Bearer signed.test.token' } } }));
    expect(mocks.user).toHaveBeenCalledExactlyOnceWith('signed.test.token');
    expect(mocks.selected).toHaveBeenCalledWith(expect.objectContaining({ userId, teamId }));
    expect(mocks.context).not.toHaveBeenCalled();
  });
  it.each(['X-Mobile-User-Id', 'X-Mobile-Team-Id'])('denies a queued write when %s changed', async header => {
    await expect(requireMobileContext(request({ [header]: '44444444-4444-4444-8444-444444444444' }), true)).rejects.toMatchObject({ status: header === 'X-Mobile-User-Id' ? 409 : 403 });
  });
  it('requires a pinned workspace on writes but allows initial bootstrap', async () => {
    const unpinned = new Request('https://example.test/api/mobile/v1/bootstrap', { headers: { authorization: 'Bearer signed.test.token' } });
    await expect(requireMobileContext(unpinned, true)).rejects.toMatchObject({ status: 409 });
    expect((await requireMobileContext(unpinned)).identity.teamId).toBe(teamId);
  });
  it('never treats a caller header as a verified user or membership', async () => {
    mocks.user.mockResolvedValue({ data: { user: null }, error: null });
    await expect(requireMobileContext(request(), true)).rejects.toMatchObject({ status: 401 });
    mocks.user.mockResolvedValue({ data: { user: { id: userId } }, error: null });
    mocks.selected.mockRejectedValue(new MobileApiError(403, 'membership', 'Inactive team'));
    await expect(requireMobileContext(request(), true)).rejects.toMatchObject({ status: 403 });
  });
  it('accepts any freshly verified selected team independently of the website latest-team default', async () => {
    const otherTeamId = '44444444-4444-4444-8444-444444444444';
    mocks.selected.mockResolvedValue({ teamId: otherTeamId, memberId: '55555555-5555-4555-8555-555555555555', teamName: 'Second team', role: 'member', permissions: [] });
    expect((await requireMobileContext(request({ 'X-Mobile-Team-Id': otherTeamId }), true)).identity.teamId).toBe(otherTeamId);
    expect(mocks.selected).toHaveBeenCalledWith(expect.objectContaining({ userId, teamId: otherTeamId }));
    expect(mocks.context).not.toHaveBeenCalled();
  });
  it('keeps transient Auth failures distinct from expired sessions and does not run membership queries', async () => {
    mocks.user.mockResolvedValue({ data: { user: null }, error: { status: 503 } });
    await expect(requireMobileContext(request(), true)).rejects.toMatchObject({ status: 503 });
    expect(mocks.selected).not.toHaveBeenCalled();
    mocks.user.mockResolvedValue({ data: { user: null }, error: { status: 401 } });
    await expect(requireMobileContext(request(), true)).rejects.toMatchObject({ status: 401 });
  });
  it('rejects missing Bearer credentials before querying the workspace', async () => {
    await expect(requireMobileContext(request({ authorization: '' }), true)).rejects.toMatchObject({ status: 401 });
    expect(mocks.context).not.toHaveBeenCalled();
  });
});
