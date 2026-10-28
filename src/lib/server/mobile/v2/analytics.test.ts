// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { analyticsFixture as fixture, analyticsIdentity as identity, analyticsInput as input, analyticsTestId as id } from '@/lib/mobile/v2/analytics-test-fixture';
const mocks = vi.hoisted(() => ({ selected: vi.fn(), load: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/mobile/v2/read-workspaces', () => ({ readSelectedWorkspace: mocks.selected }));
vi.mock('@/lib/server/mobile/analytics-source', () => ({ loadAnalytics: mocks.load }));
import { readMobileAnalytics } from './analytics';
const client = {} as SupabaseClient<Database>;
const now = new Date(fixture.fetchedAt);
beforeEach(() => { vi.clearAllMocks(); mocks.selected.mockResolvedValue(identity); mocks.load.mockResolvedValue(fixture.analytics); });
it('uses the authenticated selected client and actual website range/aggregation with authority checks before and after', async () => {
  const signal = new AbortController().signal;
  expect(await readMobileAnalytics({ client, identity, input, now, signal })).toEqual(fixture);
  expect(mocks.load).toHaveBeenCalledWith(identity.teamId, fixture.analytics.range, now, { client, signal });
  expect(mocks.selected).toHaveBeenCalledTimes(2);
});
it('mirrors owner/admin website role gate rather than granting analytics to a delegated members manager', async () => {
  const member = { ...identity, role: 'member' }; mocks.selected.mockResolvedValue(member);
  await expect(readMobileAnalytics({ client, identity: member, input, now })).rejects.toMatchObject({ status: 403 }); expect(mocks.load).not.toHaveBeenCalled();
  const owner = { ...identity, role: 'owner' }; mocks.selected.mockResolvedValue(owner);
  expect((await readMobileAnalytics({ client, identity: owner, input, now })).identity.role).toBe('owner');
});
it('rejects revoked or changed authority after loading instead of leaking a stale team response', async () => {
  for (const change of [{ userId: id(90), teamId: id(91) }, { memberId: id(90) }, { role: 'owner' }, { permissions: [] }]) {
    mocks.selected.mockResolvedValueOnce(identity).mockResolvedValueOnce({ ...identity, ...change });
    await expect(readMobileAnalytics({ client, identity, input, now })).rejects.toMatchObject({ status: 409 });
  }
  mocks.selected.mockResolvedValueOnce(identity).mockResolvedValueOnce({ ...identity, role: 'member' });
  await expect(readMobileAnalytics({ client, identity, input, now })).rejects.toMatchObject({ status: 403 });
});
it('retains honest source unavailability but rejects demo, wrong range or invalid nested data', async () => {
  mocks.load.mockResolvedValueOnce({ ...fixture.analytics, songs: { status: 'unavailable', message: 'Try again.' } });
  expect((await readMobileAnalytics({ client, identity, input, now })).analytics.songs.status).toBe('unavailable');
  for (const change of [{ mode: 'demo' }, { range: { ...fixture.analytics.range, end: '2026-10-08' } }, { activity: { status: 'ready', data: [{ id: 'bad' }] } }]) {
    mocks.load.mockResolvedValueOnce({ ...fixture.analytics, ...change });
    await expect(readMobileAnalytics({ client, identity, input, now })).rejects.toMatchObject({ status: 503 });
  }
});
it('honors cancellation and never reads data when current membership cannot be verified', async () => {
  const controller = new AbortController(); controller.abort();
  await expect(readMobileAnalytics({ client, identity, input, now, signal: controller.signal })).rejects.toThrow(); expect(mocks.load).not.toHaveBeenCalled();
  mocks.selected.mockRejectedValueOnce(new Error('Membership unavailable'));
  await expect(readMobileAnalytics({ client, identity, input, now })).rejects.toThrow('Membership unavailable'); expect(mocks.load).not.toHaveBeenCalled();
});
